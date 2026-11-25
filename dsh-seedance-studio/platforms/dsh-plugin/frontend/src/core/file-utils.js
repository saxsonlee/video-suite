    // ==========================================================================
    // 媒体 / 文件处理
    // ==========================================================================
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(asStr(reader.result));
          reader.onerror = () => reject(reader.error || new Error(translate('file.readFailed')));
          reader.readAsDataURL(file);
        } catch (error) {
          reject(error);
        }
      });
    }

    function downscaleImage(dataUrl, maxDimension, quality) {
      return new Promise((resolve, reject) => {
        if (typeof document === 'undefined' || typeof Image === 'undefined') {
          reject(new Error(translate('file.compressUnavailable')));
          return;
        }
        const image = new Image();
        image.onload = () => {
          try {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            const scale = Math.min(1, maxDimension / Math.max(width, height));
            if (scale >= 1) { resolve(dataUrl); return; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality || 0.9));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error(translate('file.parseFailed')));
        image.src = dataUrl;
      });
    }

    async function imageFileToAsset(file) {
      if (!file) throw new Error(translate('file.noFile'));
      if (file.size > MAX_IMAGE_BYTES) throw new Error(translate('file.imageTooLarge', { name: file.name }));
      const dataUrl = await readFileAsDataUrl(file);
      let finalUrl = dataUrl;
      // 超过 ~1.6MB 或超大分辨率时压缩，避免请求体过大（host 也会对 dataUrl 做降级）
      if (dataUrl.length > 1.6 * 1024 * 1024) {
        try { finalUrl = await downscaleImage(dataUrl, 1600, 0.9); } catch (error) { finalUrl = dataUrl; }
      }
      return {
        id: 'img_' + safeNow() + '_' + Math.random().toString(36).slice(2, 7),
        dataUrl: finalUrl,
        name: asStr(file.name) || 'image',
        size: file.size,
      };
    }

    async function audioFileToAsset(file) {
      if (!file) throw new Error(translate('file.noFile'));
      if (file.size > MAX_AUDIO_BYTES) throw new Error(translate('file.audioTooLarge', { name: file.name }));
      const dataUrl = await readFileAsDataUrl(file);
      return { id: 'audio_' + safeNow(), dataUrl, name: asStr(file.name) || 'audio', size: file.size };
    }

    function seekVideo(video, time) {
      return new Promise((resolve) => {
        if (!video) { resolve(false); return; }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { video.removeEventListener('seeked', finish); } catch (error) { /* ignore */ }
          resolve(true);
        };
        try { video.addEventListener('seeked', finish, { once: true }); } catch (error) { /* ignore */ }
        setTimeout(finish, 2500);
        try { video.currentTime = Math.max(0, time); } catch (error) { finish(); }
      });
    }

    async function captureVideoFrame(video, time) {
      if (!video) throw new Error(translate('file.playerNotReady'));
      if (time !== undefined) await seekVideo(video, time);
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (!width || !height) throw new Error(translate('file.videoNotLoaded'));
        const scale = Math.min(1, 1280 / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (error) {
        const message = error && error.message ? error.message : translate('file.captureFailed');
        if (/tainted|Security/i.test(message)) throw new Error(translate('file.tainted'));
        throw new Error(message);
      }
    }
