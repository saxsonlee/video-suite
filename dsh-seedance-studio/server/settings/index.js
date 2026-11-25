/**
 * dsh-seedance-studio — 配置解析与用户设置（settings.json）。
 *
 * 优先级（高 → 低）：storages/seedance-studio/settings.json > 环境变量 > 插件 config > 默认值。
 * 无任何可用 Key 且未显式指定 provider=ark/relay 时自动进入 demo（演示）模式。
 * 本模块只依赖 node 内置模块，可被 node --test 直接加载。
 * @module dsh-seedance-studio/server/settings
 */

export { STORAGE_DIR_NAME, SETTINGS_FILE_NAME, PROVIDERS, RELAY_PROTOCOLS, RELAY_STYLES, DEFAULTS, SETTING_KEYS } from './defaults.js'
export { resolveDshHome, defaultStorageRoot } from './paths.js'
export { maskSecret, isMaskedSecret, parseRelayModelMap, parseRelayModels } from './values.js'
export { normalizeSettingRecord, readSettingsFile, mergeSettings, writeJsonAtomic } from './record.js'
export { resolveConfig } from './config.js'
export { settingsView } from './view.js'
export { applySettingsPatch, SettingError, createSettingsManager } from './manager.js'
