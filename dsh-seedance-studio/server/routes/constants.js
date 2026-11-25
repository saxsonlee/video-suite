/**
 * dsh-seedance-studio — routes / 路由常量
 *
 * 本文件由 server/routes.js 拆分而来；对外契约由 routes/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiErrorStatus } from '../api/index.js'
import { LIMITS, MODES } from '../models/index.js'

/** 路由前缀。 */
export const API_PREFIX = '/api/seedance'

/** 媒体类型（与 PLAN §4 一致）。 */
export const MEDIA_KINDS = ['video', 'lastframe', 'poster']

/** 会话 ID 最大长度。 */
export const MAX_SESSION_ID_CHARS = 200

/** 请求体上限（与 settings MAX_BODY_BYTES 默认一致）。 */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024
