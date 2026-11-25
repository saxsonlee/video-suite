/**
 * dsh-seedance-studio — 宿主服务装配（工具与 HTTP 路由共用的数据层）。
 *
 * 本模块不 import DSH 运行时，只依赖 node 内置模块与同目录模块；
 * DSH 相关的 ctx 能力（workingDirectory / attachments）通过 ctx.get 动态读取，
 * 缺失时优雅降级。因此可被 node --test 直接加载做集成测试。
 * @module dsh-seedance-studio/server/service
 */
import fs from 'node:fs'
import path from 'node:path'
import { listModels, publicDefaults, capabilities, LIMITS } from './models/index.js'
import { listRelayModels } from './api/index.js'
import { refreshVideoCapabilities, detectImageModels } from './capabilities.js'
import { readLocales } from './locales.js'

/**
 * 组装宿主服务（工具与 HTTP 路由共用的数据层）。
 * @param {object} options - ctx、config、store、settings、tasks。
 */
export function createHostService(options) {
  const { ctx, store, settings, tasks } = options

  function notFound(message) {
    const error = new Error(message)
    error.name = 'NotFoundError'
    error.code = 'NotFound'
    error.status = 404
    return error
  }

  function mapSettingError(error) {
    if (error && error.name === 'SettingError') {
      const wrapped = new Error(error.message)
      wrapped.name = 'ValidationError'
      wrapped.code = 'INVALID_SETTINGS'
      wrapped.status = 400
      return wrapped
    }
    return error
  }

  /** 解析当前会话的模型路由，判断是否声明 image 输入（失败按不支持处理）。 */
  async function modelAcceptsImages(exec) {
    try {
      const llm = ctx.get ? ctx.get('llm') : undefined
      if (!llm || typeof llm.resolveModelInfo !== 'function' || !exec || !exec.agent) return false
      const agent = exec.agent
      const session = agent.session
      const routed = session && typeof session.requestHeader === 'function' && session.requestHeader() ? session.requestHeader().config : undefined
      const options = agent.options || {}
      const provider = (routed && routed.provider) || options.provider
      const model = (routed && routed.model) || options.model
      if (!provider || !model) return false
      const info = await llm.resolveModelInfo(provider, model, exec.signal)
      const modalities = info && info.inputModalities
      return Array.isArray(modalities) && modalities.indexOf('image') !== -1
    } catch (error) {
      return false
    }
  }

  return {
    /** 运行期配置（含明文 Key，仅宿主内部使用）。 */
    getConfig() {
      return settings.getConfig()
    },

    /** 设置视图（Key 打码，可下发浏览器）。 */
    settingsView() {
      return settings.view()
    },

    /** 更新设置（写 settings.json 并立即生效）。 */
    updateSettings(patch) {
      try {
        return settings.update(patch)
      } catch (error) {
        throw mapSettingError(error)
      }
    },

    /** 模型目录 + 默认值 + 能力。 */
    models() {
      const config = settings.getConfig()
      return {
        models: listModels(),
        defaults: {
          ...publicDefaults({ defaultModel: config.defaultModel }),
          // 设置页勾选的「已选模型清单」（中转站模型多选）；非空时前端主面板「模型」下拉只显示这些
          enabledModels: Array.isArray(config.relayModels) ? config.relayModels.map((item) => ({ id: item.id, label: item.label })) : []
        },
        capabilities: capabilities(),
        limits: { ...LIMITS }
      }
    },

    /** 探测「编辑视频」能力并写入共享能力文件（供协作插件读取；失败不抛）。 */
    refreshVideoCapabilities() {
      return refreshVideoCapabilities({ env: process.env })
    },

    /**
     * 探测并写入共享能力文件：视频编辑（内置模型目录）+ 图像生成（中转站模型列表）。
     * 图像探测失败不影响视频编辑能力写入；返回最新的能力快照。
     * @returns {Promise<{ok:boolean,path:string,snapshot:object,error?:string}>}
     */
    async refreshCapabilities() {
      // 只写「视频编辑」能力（videoEdit）；不探测/不自动启用图像生成能力：
      // 图像模型候选由用户在 dsh-video-project 的设置面板里点「刷新候选模型」时主动读取，
      // 是否启用草图分镜、使用哪个模型都由用户指定，本插件不替用户做决定。
      return refreshVideoCapabilities({ env: process.env })
    },

    /** 拉取中转站模型列表（同时作为设置页「测试连接」）。
     * 输入可覆盖已保存配置（设置弹窗里未保存的 baseUrl/key/protocol 也能直接测试）。
     */
    async relayModels(input = {}) {
      const config = settings.getConfig()
      const relay = config.relay || null
      const body = input && typeof input === 'object' ? input : {}
      const pick = (value, fallback) => {
        const text = value === undefined || value === null ? '' : String(value).trim()
        return text || fallback || ''
      }
      const baseUrl = pick(body.baseUrl, (relay && relay.baseUrl) || config.relayBaseUrl || '')
      const apiKey = pick(body.apiKey, (relay && relay.apiKey) || config.relayApiKey || config.arkApiKey || '')
      const protocol = pick(body.protocol, (relay && relay.protocol) || 'ark').toLowerCase() === 'ark' ? 'ark' : 'openai'
      return listRelayModels({
        baseUrl,
        apiKey,
        protocol,
        timeoutMs: config.requestTimeoutMs,
        authHeader: (relay && relay.authHeader) || 'Authorization',
        authPrefix: relay && relay.authPrefix !== undefined ? relay.authPrefix : 'Bearer '
      })
    },

    /** 语言包（动态 i18n）。 */
    readLocales() {
      return readLocales()
    },

    /** 会话历史。 */
    async history(sessionId, listOptions = {}) {
      if (!sessionId) return tasks.listAllRecords(listOptions)
      return tasks.listRecords(sessionId, listOptions)
    },

    /** 单条任务记录。 */
    async status(sessionId, recordId) {
      let record = tasks.getRecord(sessionId, recordId)
      if (!record) throw notFound('任务不存在：' + recordId)
      // 任务成功但本地视频缺失（下载失败/中断）：status 时补下载一次（任务内部有 60 秒节流）
      if (record.status === 'succeeded' && !(record.files && record.files.video) && tasks.ensureTerminalDownload) {
        record = (await tasks.ensureTerminalDownload(sessionId, record)) || record
      }
      return record
    },

    /** 创建任务。 */
    async generate(sessionId, input, createOptions = {}) {
      return tasks.createRecord(sessionId, input, createOptions)
    },

    /** 再创作。 */
    async recreate(sessionId, sourceId, overrides = {}, options = {}) {
      return tasks.recreate(sessionId, sourceId, overrides, options)
    },

    /** 取消任务。 */
    async cancel(sessionId, recordId) {
      return tasks.cancelRecord(sessionId, recordId)
    },

    /** 等待任务到终态或超时（工具 wait action 用；不传 timeoutMs 时默认 30 秒）。 */
    async wait(sessionId, recordId, waitOptions = {}) {
      return tasks.waitForRecord(sessionId, recordId, waitOptions)
    },

    /** 删除记录与本地媒体。 */
    async remove(sessionId, recordId) {
      return tasks.deleteRecord(sessionId, recordId)
    },

    /** 记录对应的本地媒体绝对路径（不存在则为 undefined）。 */
    recordPaths(record) {
      const result = {}
      if (!record) return result
      const video = store.recordFilePath(record, 'video')
      if (video) result.videoPath = video
      const lastFrame = store.recordFilePath(record, 'lastFrame')
      if (lastFrame) result.lastFramePath = lastFrame
      const poster = store.recordFilePath(record, 'poster')
      if (poster) result.posterPath = poster
      return result
    },

    /** 通过记录 ID + kind 解析媒体文件（媒体路由不依赖 sessionId）。 */
    async resolveMediaFile(recordId, kind) {
      const candidatesByKind = {
        video: [recordId + '.mp4', recordId + '.mov'],
        lastframe: [recordId + '-lastframe.jpg'],
        poster: [recordId + '-poster.jpg', recordId + '-lastframe.jpg']
      }
      const candidates = candidatesByKind[kind] || []
      for (const fileName of candidates) {
        try {
          const filePath = store.mediaPath(fileName)
          const stat = await fs.promises.stat(filePath)
          if (stat.isFile() && stat.size > 0) return { path: filePath, fileName }
        } catch (error) {
          // 继续尝试下一个候选
        }
      }
      return null
    },

    /** 读取工作区图片（workspaceImages 参数）→ dataURL 数组。 */
    async workspaceImages(paths, exec) {
      const list = Array.isArray(paths) ? paths.filter((item) => typeof item === 'string' && item.trim()) : []
      if (!list.length) return []
      let cwd = process.cwd()
      try {
        const workingDirectory = ctx.get ? ctx.get('workingDirectory') : undefined
        if (workingDirectory && typeof workingDirectory.ensure === 'function' && exec && exec.agent) {
          const resolved = await workingDirectory.ensure(exec.agent, exec.signal)
          if (typeof resolved === 'string' && resolved) cwd = resolved
        }
      } catch (error) {
        // 读取工作目录失败时退回进程 cwd
      }
      const dataUrls = []
      for (const rawPath of list) {
        const target = path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath)
        const ext = path.extname(target).toLowerCase()
        const mimeByExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
        const mime = mimeByExt[ext]
        if (!mime) throw new Error('workspaceImages 只支持 png/jpg/jpeg/webp/gif 图片：' + rawPath)
        let stat
        try {
          stat = await fs.promises.stat(target)
        } catch (error) {
          throw new Error('工作区图片不存在：' + rawPath)
        }
        if (!stat.isFile()) throw new Error('工作区图片路径不是文件：' + rawPath)
        if (stat.size > 10 * 1024 * 1024) throw new Error('工作区图片超过 10MB 上限：' + rawPath)
        const buffer = await fs.promises.readFile(target)
        dataUrls.push('data:' + mime + ';base64,' + buffer.toString('base64'))
      }
      return dataUrls
    },

    /**
     * 把记录落盘尾帧交给 attachments 服务，返回 image content block 需要的引用。
     * 与官方 read_image 的可视化 gate 对齐：仅当当前模型路由声明 image 输入时才附加，
     * 否则静默返回 null（预览只是增强，不能影响工具结果或让纯文本模型报错）。
     */
    async attachmentForLastFrame(record, exec) {
      if (!record || !record.files || !record.files.lastFrame) return null
      try {
        if (!(await modelAcceptsImages(exec))) return null
        const attachments = ctx.get ? ctx.get('attachments') : undefined
        if (!attachments || typeof attachments.saveImage !== 'function') return null
        const filePath = store.recordFilePath(record, 'lastFrame')
        if (!filePath) return null
        const data = await fs.promises.readFile(filePath)
        const ref = await attachments.saveImage({ data, mediaType: 'image/jpeg', name: path.basename(filePath) })
        return ref || null
      } catch (error) {
        return null
      }
    },

    /** 从 exec 中取当前会话 ID（无 agent 时返回 undefined，工具层回落 default）。 */
    sessionId(exec) {
      try {
        const value = exec && exec.agent && exec.agent.session ? exec.agent.session.id : undefined
        return typeof value === 'string' && value ? value : undefined
      } catch (error) {
        return undefined
      }
    }
  }
}
