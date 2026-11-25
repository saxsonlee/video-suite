/**
 * dsh-seedance-studio — settings / 存储路径解析
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'
import { STORAGE_DIR_NAME } from './defaults.js'

/** 解析 DSH 主目录（与 @deepseek-ai/dsh-home-paths 规则一致：$DSH_HOME > ~/.dsh）。 */
export function resolveDshHome(env = process.env) {
  const raw = env && env.DSH_HOME
  if (typeof raw === 'string' && raw.trim()) return path.resolve(expandHome(raw.trim()))
  return path.join(os.homedir(), '.dsh')
}

export function expandHome(value) {
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2))
  return value
}

/** 插件持久化根目录：$DSH_HOME/storages/seedance-studio。 */
export function defaultStorageRoot(env = process.env) {
  return path.join(resolveDshHome(env), 'storages', STORAGE_DIR_NAME)
}
