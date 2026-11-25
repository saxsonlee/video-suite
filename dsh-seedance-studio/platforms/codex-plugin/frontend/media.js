/**
 * Codex 视频工作室 - 媒体流管理模块
 * 负责将 video-studio-media:<36hex> 不透明引用通过 video_studio_media 工具分片拉取并装配为 Blob/ObjectURL。
 * 具备严格的分片完整性验证、取消与销毁屏障、LRU 缓存上限及当前播放引用锁定保护。
 */

const REFERENCE_REGEX = /^video-studio-media:[0-9a-fA-F]{36}$/;

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class MediaManager {
  constructor(app, options = {}) {
    this.app = app;
    this.cache = new Map(); // reference -> { blob, objectUrl, mimeType, total, lastAccessed }
    this.inflight = new Map(); // reference -> { promise, abortController }
    this.maxSize = 256 * 1024 * 1024; // 256 MiB 预览上限
    this.chunkSize = 524288; // 512 KiB 分片契约
    this.maxCacheEntries = options.maxCacheEntries || 10; // 最多缓存 10 个视频/图片对象
    this.maxTotalBytes = options.maxTotalBytes || 512 * 1024 * 1024; // 512 MiB 总缓存字节上限
    this.totalCachedBytes = 0;
    this.activeReference = null;
    this.disposed = false;
  }

  isMediaReference(val) {
    return typeof val === 'string' && REFERENCE_REGEX.test(val);
  }

  setActiveReference(reference) {
    this.activeReference = this.isMediaReference(reference) ? reference : null;
    if (this.activeReference && this.cache.has(this.activeReference)) {
      this.cache.get(this.activeReference).lastAccessed = Date.now();
    }
  }

  reset() {
    this.disposed = false;
  }

  evictOldestIfNeeded(incomingBytes = 0) {
    while (
      (this.cache.size >= this.maxCacheEntries || (this.totalCachedBytes + incomingBytes > this.maxTotalBytes && this.cache.size > 0))
    ) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [key, item] of this.cache.entries()) {
        if (key === this.activeReference) continue;
        if (item.lastAccessed < oldestTime) {
          oldestTime = item.lastAccessed;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      const victim = this.cache.get(oldestKey);
      try {
        URL.revokeObjectURL(victim.objectUrl);
      } catch (e) {}
      this.totalCachedBytes = Math.max(0, this.totalCachedBytes - (victim.total || 0));
      this.cache.delete(oldestKey);
    }
  }

  async fetchMedia(reference) {
    if (this.disposed) {
      throw new Error('媒体管理器已销毁');
    }
    if (!this.isMediaReference(reference)) {
      throw new Error(`无效的媒体引用格式: ${reference}`);
    }
    if (this.cache.has(reference)) {
      const hit = this.cache.get(reference);
      hit.lastAccessed = Date.now();
      return hit;
    }
    if (this.inflight.has(reference)) {
      return this.inflight.get(reference).promise;
    }

    const abortController = new AbortController();
    const downloadPromise = (async () => {
      let offset = 0;
      const chunks = [];
      let accumulatedBytes = 0;
      let expectedTotal = null;
      let expectedMime = null;

      while (true) {
        if (this.disposed || abortController.signal.aborted) {
          throw new Error('媒体加载已终止');
        }

        let res;
        try {
          res = await this.app.callServerTool(
            {
              name: 'video_studio_media',
              arguments: {
                reference,
                offset,
                length: this.chunkSize
              }
            },
            { timeout: 60000, signal: abortController.signal }
          );
        } catch (callErr) {
          const err = new Error(`拉取媒体分片失败 (offset ${offset}): ${callErr.message}`);
          err.isNetworkOrParse = true;
          throw err;
        }

        if (this.disposed || abortController.signal.aborted) {
          throw new Error('媒体加载已终止');
        }

        const data = res?._meta?.video_studio_media;
        if (!data || data.ok !== true) {
          const msg = (data && data.error && data.error.message) || '私有媒体工具响应无效';
          const err = new Error(msg);
          err.code = data?.error?.code || 'MEDIA_READ_FAILED';
          throw err;
        }

        if (data.reference !== reference) {
          throw new Error(`媒体引用不匹配: 期望 ${reference}, 返回 ${data.reference}`);
        }

        if (data.offset !== offset) {
          throw new Error(`分片起始偏移量不一致: 期望 ${offset}, 实际 ${data.offset}`);
        }

        if (!Number.isSafeInteger(data.nextOffset) || data.nextOffset <= offset) {
          throw new Error(`分片进度异常: nextOffset (${data.nextOffset}) 必须是有效安全整数且严格递增`);
        }

        if (!Number.isSafeInteger(data.total) || data.total < 0) {
          throw new Error(`媒体声明总量无效: ${data.total}`);
        }

        if (data.nextOffset - offset > this.chunkSize) {
          throw new Error(`分片步长 (${data.nextOffset - offset}) 超出 chunkSize 限制 (${this.chunkSize})`);
        }

        if (data.nextOffset > data.total) {
          throw new Error(`分片 nextOffset (${data.nextOffset}) 超出媒体总量 (${data.total})`);
        }

        if (expectedTotal === null) {
          expectedTotal = data.total;
        } else if (data.total !== expectedTotal) {
          throw new Error(`媒体总量在传输中发生变更: 初始 ${expectedTotal}, 现为 ${data.total}`);
        }

        if (expectedTotal > this.maxSize) {
          throw new Error(`媒体体积 (${(expectedTotal / (1024 * 1024)).toFixed(1)} MiB) 超出 256 MiB 预览上限`);
        }

        const currentMime = data.mimeType || 'application/octet-stream';
        if (expectedMime === null) {
          expectedMime = currentMime;
        } else if (currentMime !== expectedMime) {
          throw new Error(`媒体 MIME 类型突变: 初始 ${expectedMime}, 现为 ${currentMime}`);
        }

        if (!data.data || typeof data.data !== 'string') {
          throw new Error('分片数据体为空或非 base64 字符串');
        }

        const chunkBytes = base64ToUint8Array(data.data);
        const expectedChunkLen = data.nextOffset - offset;
        if (chunkBytes.length !== expectedChunkLen) {
          throw new Error(`分片字节数 (${chunkBytes.length}) 与增量 (${expectedChunkLen}) 不匹配`);
        }

        chunks.push(chunkBytes);
        accumulatedBytes += chunkBytes.length;

        if (accumulatedBytes !== data.nextOffset) {
          throw new Error(`累计接收字节数 (${accumulatedBytes}) 与分片声明 nextOffset (${data.nextOffset}) 不一致`);
        }

        if (data.eof === true || accumulatedBytes >= expectedTotal) {
          if (data.eof !== true) {
            throw new Error(`累计字节已达到总量，但分片未标记真实 EOF`);
          }
          if (accumulatedBytes !== expectedTotal) {
            throw new Error(`分片已到达 EOF 但接收总量 (${accumulatedBytes}) 与声明总量 (${expectedTotal}) 不一致`);
          }
          break;
        }

        offset = data.nextOffset;
      }

      if (this.disposed || abortController.signal.aborted) {
        throw new Error('媒体加载已终止');
      }

      const blob = new Blob(chunks, { type: expectedMime });
      const objectUrl = URL.createObjectURL(blob);
      const record = {
        blob,
        objectUrl,
        mimeType: expectedMime,
        total: blob.size,
        lastAccessed: Date.now()
      };

      this.evictOldestIfNeeded(record.total);
      this.cache.set(reference, record);
      this.totalCachedBytes += record.total;
      return record;
    })();

    this.inflight.set(reference, { promise: downloadPromise, abortController });
    try {
      return await downloadPromise;
    } finally {
      this.inflight.delete(reference);
    }
  }

  async resolve(reference) {
    if (!this.isMediaReference(reference)) {
      return reference;
    }
    const record = await this.fetchMedia(reference);
    return record.objectUrl;
  }

  async resolveToDataUrl(reference) {
    if (!this.isMediaReference(reference)) {
      if (typeof reference === 'string' && reference.startsWith('data:')) {
        return reference;
      }
      return reference;
    }
    const record = await this.fetchMedia(reference);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('转换媒体为 Data URL 失败'));
      reader.readAsDataURL(record.blob);
    });
  }

  revoke(reference) {
    if (this.cache.has(reference)) {
      const record = this.cache.get(reference);
      try {
        URL.revokeObjectURL(record.objectUrl);
      } catch (e) {}
      this.totalCachedBytes = Math.max(0, this.totalCachedBytes - (record.total || 0));
      this.cache.delete(reference);
    }
  }

  revokeAll() {
    this.disposed = true;
    for (const [, item] of this.inflight.entries()) {
      try {
        item.abortController.abort();
      } catch (e) {}
    }
    this.inflight.clear();

    for (const [, record] of this.cache.entries()) {
      try {
        URL.revokeObjectURL(record.objectUrl);
      } catch (e) {}
    }
    this.cache.clear();
    this.totalCachedBytes = 0;
    this.activeReference = null;
  }
}
