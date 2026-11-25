/**
 * dsh-seedance-studio — 会话历史与媒体文件持久化。
 *
 * 目录结构（$DSH_HOME/storages/seedance-studio/）：
 *   settings.json            用户设置（由 settings.js 管理）
 *   boot.log                 插件启动/路由注册探针日志（供安装验证）
 *   sessions/<id>.json       每会话历史索引（数组，新 → 旧）
 *   media/<recordId>.mp4     下载的视频
 *   media/<recordId>-lastframe.jpg  尾帧
 *   media/<recordId>-poster.jpg     海报（可选）
 *   media/<recordId>-in<i>.<ext>    输入图片（dataURL 落盘，避免索引过大）
 *
 * 写入一律「临时文件 + rename」原子替换；会话文件损坏时容忍（返回空列表并记录日志）。
 * 本模块只依赖 node 内置模块，可被 node --test 直接加载。
 * @module dsh-seedance-studio/server/store
 */

export { RECORD_STATUSES, StoreError, createRecordId, isValidRecordId, normalizeRecord } from './record.js'
export { safeFileSegment, sessionFileName, hashBuffer, parseDataUrl } from './files.js'
export { createStore } from './manager.js'
