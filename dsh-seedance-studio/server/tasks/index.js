/**
 * dsh-seedance-studio — 任务管理器：创建 / 轮询 / 终态落盘 / 进度 / 取消 / 恢复 / demo 模拟器 / 再创作决策。
 *
 * 职责边界：
 * - 创建：校验请求（models.js）→ 落盘输入素材（store.js）→ 调用远端或 demo 模拟器 → 返回记录；
 * - 轮询：3~5 秒一次（QPS 友好，带抖动），终态下载视频/尾帧到 media/，失败保留错误；
 * - 恢复：进程重启后扫描 sessions/，对未终态记录恢复轮询；
 * - demo：无 Key 时用包内 media/demo.mp4 模拟 8 秒成功任务（2s running/30%，6s 70%，8s succeeded）；
 * - 再创作：buildRecreatePlan 纯函数决定「远端视频 URL > 本地尾帧 > 纯提示词」。
 *
 * 本模块只依赖 node 内置模块与同目录模块，可被 node --test 直接加载。
 * @module dsh-seedance-studio/server/tasks
 */

export { DEMO_TIMELINE, DEMO_DURATION_SECONDS, DEMO_FAIL_KEYWORDS, REMOTE_URL_TTL_MS, demoTaskId, demoStateAt, defaultDemoMedia } from './demo.js'
export { TaskError } from './errors.js'
export { buildRecreatePlan } from './recreate.js'
export { createTaskManager } from './manager.js'
