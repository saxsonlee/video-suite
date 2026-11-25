/**
 * dsh-seedance-studio — tasks / 再创作计划
 *
 * 本文件由 server/tasks.js 拆分而来；对外契约由 tasks/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createVideoClient, isTerminalStatus, ApiError, ApiTimeoutError, downloadFile, describeApiError } from '../api/index.js'
import { normalizeGenerateRequest, buildArkPayload, getModel, MODES, ValidationError } from '../models/index.js'
import { createRecordId, isValidRecordId } from '../store/index.js'
import { REMOTE_URL_TTL_MS } from './demo.js'
import { TaskError } from './errors.js'

/**
 * 再创作决策（纯函数）：决定素材来源与模式。
 *
 * 优先级（PLAN §7）：
 * 1) 原视频远端 URL 仍有效（<24h）→ 作为参考视频（mode=reference）；模型不支持视频参考时退回尾帧；
 * 2) 本地落盘尾帧 → 从尾帧续写（优先 image2video 首帧；否则 reference_image）；
 * 3) 素材都不可用 → 继承 prompt/params 纯文生视频，并给出 warning。
 *
 * @param {object} record - 原记录。
 * @param {object} [overrides] - 用户覆盖（prompt/model/mode/params）。
 * @param {object} [options] - now、config、defaultModel。
 * @returns {object} 计划：{ sourceId, model, mode, prompt, params, mediaKind, mediaUrl, mediaRole, remoteVideoUrl, warnings }
 */
export function buildRecreatePlan(record, overrides = {}, options = {}) {
  if (!record || typeof record !== 'object') throw new TaskError('再创作来源记录不存在', 'NotFound', 404)
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now()
  const config = options.config || {}
  const overloads = overrides || {}
  const warnings = []
  const model = typeof overloads.model === 'string' && overloads.model.trim()
    ? overloads.model.trim()
    : (record.model || config.defaultModel || '')
  const entry = getModel(model)
  const prompt = overloads.prompt !== undefined && overloads.prompt !== null ? String(overloads.prompt) : (record.prompt || '')
  const params = { ...(record.params && typeof record.params === 'object' ? record.params : {}) }
  if (overloads.params && typeof overloads.params === 'object') Object.assign(params, overloads.params)
  const baseTime = Number(record.updatedAt || record.createdAt || 0)
  const age = now - baseTime
  const remoteVideoUrl = typeof record.remoteVideoUrl === 'string' && /^https?:\/\//i.test(record.remoteVideoUrl) ? record.remoteVideoUrl : null
  const remoteFresh = Boolean(remoteVideoUrl) && age >= 0 && age < REMOTE_URL_TTL_MS
  const hasLastFrame = Boolean(record.files && typeof record.files.lastFrame === 'string' && record.files.lastFrame)
  const supportsVideoReference = !entry || (entry.references === true && entry.maxVideos > 0)
  const supportsFirstFrame = !entry || entry.firstFrame === true

  const modeOverride = typeof overloads.mode === 'string' && MODES.indexOf(overloads.mode) !== -1 ? overloads.mode : null
  const plan = {
    sourceId: record.id,
    originId: record.id,
    model,
    mode: 'text2video',
    prompt,
    params,
    mediaKind: 'none',
    mediaUrl: null,
    mediaRole: null,
    remoteVideoUrl: null,
    warnings
  }

  if (modeOverride) {
    plan.mode = modeOverride
    if (modeOverride === 'edit' || modeOverride === 'extend') {
      if (!remoteFresh) throw new TaskError('原视频远端链接已过期（>24h），无法用于视频编辑/延长', 'SourceVideoExpired', 409)
      plan.mediaKind = 'remote-video'
      plan.mediaUrl = remoteVideoUrl
      plan.remoteVideoUrl = remoteVideoUrl
    } else if (modeOverride === 'firstlast') {
      if (!hasLastFrame) throw new TaskError('本地没有落盘尾帧图，无法使用首尾帧模式再创作', 'MissingLastFrame', 409)
      plan.mediaKind = 'last-frame'
      plan.mediaRole = 'last_frame'
    } else if (modeOverride === 'image2video') {
      if (!hasLastFrame) throw new TaskError('本地没有落盘尾帧图，无法使用图生视频模式再创作', 'MissingLastFrame', 409)
      plan.mediaKind = 'last-frame'
      plan.mediaRole = 'first_frame'
    } else if (modeOverride === 'reference') {
      if (remoteFresh && supportsVideoReference) {
        plan.mediaKind = 'remote-video'
        plan.mediaUrl = remoteVideoUrl
        plan.remoteVideoUrl = remoteVideoUrl
      } else if (hasLastFrame) {
        plan.mediaKind = 'last-frame'
        plan.mediaRole = 'reference_image'
      } else {
        warnings.push('原视频链接已过期且没有本地尾帧，将退回纯文生视频')
      }
    }
    return plan
  }

  // 未显式指定 mode：按优先级自动决策
  if (remoteFresh && supportsVideoReference) {
    plan.mode = 'reference'
    plan.mediaKind = 'remote-video'
    plan.mediaUrl = remoteVideoUrl
    plan.remoteVideoUrl = remoteVideoUrl
    return plan
  }
  if (remoteFresh && !supportsVideoReference) {
    warnings.push('当前模型不支持参考视频，改用本地尾帧图')
  } else if (remoteVideoUrl && !remoteFresh) {
    warnings.push('原视频远端链接已过期（>24h），改用本地尾帧图续写')
  }
  if (hasLastFrame && supportsFirstFrame) {
    plan.mode = 'image2video'
    plan.mediaKind = 'last-frame'
    plan.mediaRole = 'first_frame'
    return plan
  }
  if (hasLastFrame && !supportsFirstFrame && entry && entry.references === true) {
    plan.mode = 'reference'
    plan.mediaKind = 'last-frame'
    plan.mediaRole = 'reference_image'
    return plan
  }
  if (hasLastFrame && !supportsFirstFrame) {
    warnings.push('当前模型不支持首帧图，退回纯文生视频')
  }
  if (!hasLastFrame && !remoteFresh) {
    warnings.push('没有可复用的视频/尾帧素材，将基于原提示词重新生成')
  }
  plan.mode = 'text2video'
  plan.mediaKind = 'none'
  return plan
}
