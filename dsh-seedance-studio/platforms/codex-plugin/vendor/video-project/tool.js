/**
 * dsh-video-project — 模型可调用的 video_project 工具定义。
 *
 * 纯工厂：不 import DSH 运行时（defineTool 由 plugin.js 注入，便于 node --test 直接测试）。
 *
 * 职责：
 * - 只管理「视频项目」落盘资料：人员卡、分镜脚本、分镜变更记录、每个镜头的多版本视频、全片；
 * - 不直接调用视频模型：视频生成由会话中可用的任意生成工具完成（本插件只做策划与分析）；
 * - build-prompt 把「人物卡 + 分镜」组装成最终提示词与参数，由智能体交给生成工具。
 * @module dsh-video-project/tool
 */

export const TOOL_NAME = 'video_project'

/** 可用 action。 */
export const TOOL_ACTIONS = [
  'create',
  'list',
  'get',
  'delete',
  'save-characters',
  'character-sheet',
  'area-sheet',
  'save-areas',
  'save-acts',
  'save-shots',
  'confirm-plan',
  'shot-change',
  'build-prompt',
  'sketch',
  'save-version',
  'adopt-version',
  'review',
  'analyze',
  'guide',
  'full-video',
  'location'
]

export const TOOL_DESCRIPTION = [
  '视频项目（编导工作台）：把「需求补全 → 人物卡 → 分镜 → 提示词 → 验收/分析 → 版本/全片」落到磁盘。本插件不调用视频模型。做视频任务（尤其有人物/角色一致性、多镜头、分镜、需要人物卡或区域/幕设定）时：先用本工具 create 项目并保存人物卡/区域/幕/分镜，再 build-prompt 把提示词与 params 交给生成工具；不要跳过项目直接生成。',
  '接口（直接调用即生成，不要自己写脚本画分镜）：guide 需求补全表格 / create 建项目（固定 baseline）/ save-characters 人物卡（基础身份 + 形象变体 looks + 三视图 views：views 是文字描述；要图片参考就把本机图片路径写进 look.referenceImages）/ character-sheet 生成人物三视图图片（正/侧/背并排一张，图像模型由设置选、按次计费；设置里勾选「人物三视图自动出图」后保存人物卡也会默认生成）/ area-sheet 生成区域/场地设定图（场景概念图，体现布局/标志物/光线/道具；勾选「区域/场地自动出图」后保存区域也会默认生成）/ save-areas 区域设定（世界地图）/ save-acts 幕设定（本幕出场 cast/区域/报幕）/ save-shots 分镜（7 栏结构化：镜号/景别/画面/台词/运镜/时长 + 环境；含 actId/areaId/cast）/ confirm-plan 记录用户确认 / build-prompt 出提示词+参数 / sketch 分镜草图/分镜参考图（黑白线稿，按分镜 id 每镜头一张；用户说「生成分镜参考图/草图/线稿」即视为已同意，但仍需先 confirm-plan）/ review 逐栏验收（7 栏，含环境）/ analyze 抽帧分析 / save-version 归档（视频可能是「分镜片段」或「全片」：用 payload.kind=shot/full 明确标注，不标的会按分镜时长自动判断并提示）/ adopt-version 指定镜头采用版本（全片按采用版本校验） / full-video 全片（要求镜头视频已归档；未验收的镜头会把全片标为「待验收」） / shot-change 记录修改 / get|list|delete|location 管理。',
  '流程：guide → create → save-characters（人物基础+形象变体+三视图文字）→ save-areas（区域）→ save-acts（幕：本幕出场 cast/区域/报幕）→ save-shots（分镜归属 actId/areaId/cast）→ 把设定集/幕/分镜给用户看，用户确认后 confirm-plan → build-prompt（生成前把 prompt/params/分镜摘要给用户确认）→ 交给生成工具 → review/analyze（不通过先把修改方案给用户确认，不要直接重抽）→ save-version / full-video。',
  '项目结构（按此组织，避免人物/区域在多幕里重复不一致）：设定集（人物：基础身份 identity 全片不变 + 形象变体 looks 可换装/受伤/伪装，每套含三视图 views；区域 areas：布局/标志物/光线/贯穿道具；全局风格 baseline）→ 幕 acts（标题/目的/情绪 + 本幕出场 cast[{name,lookId}] + 区域 areaId + 报幕 titleCard）→ 分镜 shots（actId/areaId/cast，镜头级可覆盖幕级）。同一人物换形象用不同 look（脸/体型/身份不变）；每幕只注入本幕 cast；同一区域所有镜头空间关系/标志物/光源一致。三视图/区域描述缺失会在 warnings 里提示，先补齐再确认。',
  '硬性规则（代码强制）：① save-shots/save-characters 保存后「用户已确认」自动重置，必须重新 confirm-plan；② 未确认时 build-prompt/sketch 直接返回 PLAN_NOT_CONFIRMED；③ 分镜草图用 sketch 接口：输入只用已保存的分镜脚本（不接受临时加内容），按分镜 id 每个镜头单独一张图（不拼图）；不传 shot 则按全部分镜各画一张；图像模型由用户在设置面板选、用户同意费用后画；不要用 PIL/matplotlib/canvas 自己写脚本画图（会被闸门拦截）；④ 一个镜头只做一个主要动作+一个镜头运动，相邻镜头景别交替，人物卡每次注入；**即使机位固定，也要按「动作变化 / 人物入画或位置变化」拆镜头**（每镜 3~8 秒，12 秒要拆 2~3 个镜头），不要把多段动作塞进一个长镜头。',
  'save-shots 返回 warnings 自查（缺项/景别重复/跳轴/环境不一致等），先修正再给用户确认。环境一致性（重要）：每个镜头写 environment=「时间 + 天气 + 光线 + 色彩基调」（如「黄昏，雨后街道，暖橙侧光」），项目级 sceneMap.environment 写全片环境设定；生成提示词会逐镜注入并强制「不得从黄昏变夜晚、不得改变霓虹灯/路灯等光源」。sceneMap 从上方写站位/机位/视线，防 180 度跳轴。草图作参考图（可选，用户在设置面板开启）：开启后 build-prompt 会返回 referenceImage（该镜头草图绝对路径），生成时作为生成工具的参考图参数（如 workspaceImages + mode=reference）传给生成工具；未开启不返回、不自动使用。字段与示例见 payload 参数说明。'
].join('\n')

/** 工具参数 schema（DSH 统一 schema DSL）。 */
export function buildParameters() {
  return {
    action: {
      type: 'string',
      required: true,
      enum: TOOL_ACTIONS.slice(),
      description: '操作：create 建项目（含 baseline 固定参数）/ list 列表 / get 详情 / delete 删除 / save-characters 保存人物卡（基础身份 identity + 形象变体 looks + 三视图 views）/ save-areas 保存区域设定（世界地图）/ save-acts 保存幕设定（本幕 cast/区域/报幕）/ save-shots 保存分镜（含 actId/areaId/cast）/ confirm-plan 记录「用户已确认分镜/人物卡」（未确认时 build-prompt/sketch 会被拒绝） / shot-change 记录分镜修改 / build-prompt 生成提示词+参数+检查 / sketch 画单镜头草图（确认机位/景别） / save-version 归档（视频可能是「分镜片段」或「全片」：用 payload.kind=shot/full 明确标注，不标的会按分镜时长自动判断并提示）/ adopt-version 指定镜头采用版本（全片按采用版本校验）镜头视频版本 / review 逐栏验收（7 栏） / analyze 抽帧+画面与需求对比分析 / guide 需求补全表格 / full-video 保存全片 / location 查看或修改项目保存位置'
    },
    project: { type: 'string', description: '项目名（VideoName，也会作为落盘目录名）；除 list 外都需要' },
    shot: { type: 'string', description: '镜头 id（如 Shot1 或 1）；save-version / build-prompt / review / analyze 需要；sketch 可省略（省略则按全部分镜每个镜头各画一张）' },
    payload: { type: 'string', description: 'JSON 字符串，承载各 action 的数据：create={"style","notes","baseline":{"ratio","styleCard"}}（画面比例/风格卡属创作参数；模型/分辨率/种子由生成工具端决定，不在此设置）；save-characters={"characters":[{name,identity:{age,face,hairBase,body,signature},looks:[{id,name,hair,costume,description,views:{front,side,back},referenceImages:[本地路径]}],notes}]}（兼容旧字段 age/face/hair/costume/body/signature/appearance，会自动转成默认形象）；save-areas={"areas":[{id,name,description,layout,landmarks:[],lighting,props:[],mapPath,notes}]}；save-acts={"acts":[{id,name,purpose,mood,areaId,cast:[{name,lookId}],titleCard:{text,style},notes}]}；save-shots={"style","areas"(可选，同 save-areas),"acts"(可选，同 save-acts),"sceneMap":{"description":"从上方看的地点/物件/人物站位/相机位","environment":"全片环境：时间/天气/光线/色彩基调","objects":[],"characters":[],"cameras":[],"notes":""},"shots":[{id,actId,areaId,cast:[{name,lookId}],kind:"shot|title|transition",beat,purpose,screenDirection,eyeline,risk,name,scene,shotType,camera,movement,lighting,environment,transition,duration,action,dialogue,subtitle,sound,characters,notes}],"baseline":{...}}；shot-change={"shot","op","summary","detail"}；build-prompt={"extra"}（返回 prompt/params；用户开启「草图作参考图」且该镜头有草图时，另返回 referenceImage=草图绝对路径）；sketch 不需要 payload（输入只用已保存的分镜脚本；模型由用户在设置面板选择，不要用 model 参数绕过；传 shot 画单张，不传 shot 按全部分镜逐张）；save-version={"taskId","prompt","model","params","detail"}；review={"version","checks":[{"key":"shotType","pass":true,"note":"..."}],"issues","notes"}（不传 checks/pass 时先生成验收表）；full-video={"taskId","prompt","model","detail"}；location={"storageRoot":"D:\\我的视频项目"（不传则只查询当前位置）}；guide={"request":"用户原话","preferences":{}}；analyze={"videoPath":"...","frameCount":8,"observed":[{"key":"...","pass":true,"note":"..."}],"version":"V0.1"}' },
    sourcePath: { type: 'string', description: '视频的本地绝对路径（save-version / full-video 用；一般传生成工具返回的本地视频路径）' },
    taskId: { type: 'string', description: '可选：生成工具返回的任务 id（写入版本 meta，便于追溯）' },
    detail: { type: 'string', description: '可选：本次变更的说明（写入 ChangeInfo）' }
  }
}

/** 输出 schema（统一 DTO）。 */
export function buildOutput() {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        action: { type: 'string', required: true },
        message: { type: 'string' },
        hint: { type: 'string' },
        project: { type: 'json' },
        projects: { type: 'json' },
        prompt: { type: 'string' },
        params: { type: 'json' },
        checks: { type: 'json' },
        storageRoot: { type: 'string' },
        projectsRoot: { type: 'string' },
        warnings: { type: 'json' },
        stats: { type: 'json' },
        checks: { type: 'json' },
        passed: { type: 'boolean' },
        strategy: { type: 'json' },
        capability: { type: 'json' },
        mode: { type: 'string' },
        fields: { type: 'json' },
        draft: { type: 'json' },
        missing: { type: 'json' },
        toConfirm: { type: 'json' },
        image: { type: 'string' },
        character: { type: 'string' },
        sheets: { type: 'json' },
        sketchPath: { type: 'string' },
        referenceImage: { type: 'string' },
        frames: { type: 'json' },
        framesDir: { type: 'string' },
        checklist: { type: 'json' },
        report: { type: 'json' },
        diffs: { type: 'json' },
        improvements: { type: 'json' },
        revisedShot: { type: 'json' },
        shot: { type: 'string' },
        version: { type: 'string' },
        planConfirmed: { type: 'boolean' },
        planConfirmedAt: { type: 'number' },
        issues: { type: 'json' },
        images: { type: 'json' },
        path: { type: 'string' },
        taskId: { type: 'string' },
        error: {
          type: 'object',
          additionalProperties: false,
          properties: { code: { type: 'string' }, message: { type: 'string' } }
        }
      }
    }
  }
}

/** 结果渲染成文本给模型看。 */
export function renderToolResult(_args, value) {
  const blocks = []
  const lines = []
  if (!value || value.ok !== true) {
    const error = value && value.error ? value.error : { code: 'ToolError', message: '工具执行失败' }
    lines.push('video_project 失败：' + (error.message || '未知错误') + (error.code ? '（' + error.code + '）' : ''))
    blocks.push({ type: 'text', text: lines.join('\n') })
    return blocks
  }
  if (value.message) lines.push(value.message)
  if (value.hint) lines.push(value.hint)
  const project = value.project
  if (project && typeof project === 'object') {
    const versionCount = Array.isArray(project.video && project.video.shots)
      ? project.video.shots.reduce((sum, item) => sum + (Array.isArray(item.versions) ? item.versions.length : 0), 0)
      : 0
    lines.push('项目：' + project.videoName + '（人物卡 ' + (Array.isArray(project.characters) ? project.characters.length : 0) + ' / 分镜 ' + (Array.isArray(project.shots) ? project.shots.length : 0) + ' / 镜头版本 ' + versionCount + '）')
    if (project.dir) lines.push('目录：' + project.dir)
  }
  if (Array.isArray(value.sheets) && value.sheets.length) {
    lines.push('人物三视图已生成 ' + value.sheets.length + ' 张（按次计费）：')
    for (const item of value.sheets.slice(0, 12)) lines.push('- ' + (item.character || '') + (item.look ? ' · ' + item.look : '') + '：' + item.path)
  }
  if (Array.isArray(value.projects)) {
    lines.push('共 ' + value.projects.length + ' 个项目：')
    for (const item of value.projects.slice(0, 20)) {
      lines.push('- ' + item.name + '（分镜 ' + item.shots + ' / 人物卡 ' + item.characters + ' / 版本 ' + item.versions + '）')
    }
  }
  if (value.strategy && typeof value.strategy === 'object' && value.strategy.type) {
    const typeLabels = { 'local-edit': '局部改（用当前视频修改）', regenerate: '整条重做（丢弃当前视频）', 'keep-frames': '保留前段（从认可点之后重新生成）', approved: '不需要调整', unknown: '待定' }
    const label = typeLabels[value.strategy.type] || value.strategy.type
    const keep = value.strategy.keepUntil ? '，保留前 ' + value.strategy.keepUntil + ' 秒' : ''
    lines.push('调整策略：' + label + keep + (value.strategy.reason ? '（' + value.strategy.reason + '）' : ''))
  }
  if (Array.isArray(value.checks) && value.checks.length) {
    lines.push('⚠ 输入检查（不通过项，先补齐再生成）：')
    for (const item of value.checks.slice(0, 12)) lines.push('- ' + item)
  }
  if (value.params && typeof value.params === 'object' && Object.keys(value.params).length) {
    lines.push('固定参数（交给生成工具对应参数）：' + JSON.stringify(value.params))
  }
  if (value.prompt) {
    lines.push('提示词（交给生成工具的 prompt）：')
    lines.push(value.prompt)
  }
  if (Array.isArray(value.checks) && value.checks.length) {
    lines.push('验收项：')
    for (const item of value.checks.slice(0, 15)) {
      const mark = item.pass === true ? '✔' : (item.pass === false ? '✘' : '·')
      const expected = item.expected ? '（对照：' + item.expected + '）' : ''
      lines.push('- [' + mark + '] ' + (item.label || item.key) + expected + (item.note ? '：' + item.note : ''))
    }
  }
  if (Array.isArray(value.warnings) && value.warnings.length) {
    lines.push('分镜自查（先处理这些再生成）：')
    for (const warning of value.warnings.slice(0, 15)) lines.push('- ' + (warning.message || warning))
  }
  if (Array.isArray(value.fields) && value.fields.length) {
    lines.push('需求表格（suggested=建议默认值，missing=需补全）：')
    for (const item of value.fields) {
      const raw = item.value
      const valueText = Array.isArray(raw)
        ? (raw.map((entry) => (entry && entry.name) || String(entry)).filter(Boolean).join('、') || '（待补全）')
        : (raw === '' || raw === undefined || raw === null ? '（待补全）' : String(raw))
      const sourceText = item.source === 'user' ? '用户已给' : (item.source === 'suggested' ? '建议' : '缺失')
      lines.push('- ' + item.label + '：' + valueText + '（' + sourceText + '）' + (item.hint ? ' — ' + item.hint : ''))
    }
  }
  if (value.image) lines.push('草图文件：' + value.image + '（只用于确认机位/景别，不参与视频生成）')
  if (Array.isArray(value.frames) && value.frames.length) {
    lines.push('抽帧（' + value.frames.length + ' 张）：')
    for (const frame of value.frames) lines.push('- ' + frame)
  }
  if (Array.isArray(value.checklist) && value.checklist.length) {
    lines.push('检查清单（逐帧看图后回填 observed）：')
    for (const item of value.checklist) lines.push('- ' + item.key + '：' + item.label + '（期望：' + item.expected + '）')
  }
  if (value.report && typeof value.report === 'object') {
    lines.push('画面分析：' + (value.report.pass ? '符合需求' : '发现 ' + value.report.diffs.length + ' 项出入（严重 ' + value.report.serious + ' 项）'))
    for (const diff of (value.report.diffs || []).slice(0, 12)) {
      lines.push('- [' + diff.severity + '] ' + diff.label + '：期望「' + diff.expected + '」，实际「' + (diff.observed || diff.note || '未描述') + '」')
    }
    if (Array.isArray(value.report.improvements) && value.report.improvements.length) {
      lines.push('改进建议：')
      for (const item of value.report.improvements.slice(0, 10)) lines.push('- ' + item)
    }
  }
  if (value.storageRoot) {
    lines.push('保存位置：' + value.storageRoot)
    if (value.projectsRoot) lines.push('项目目录：' + value.projectsRoot)
  }
  if (value.version) {
    lines.push('已归档：' + (value.shot || '') + ' ' + value.version + (value.path ? ' → ' + value.path : ''))
  }
  if (lines.length === 0) lines.push('video_project 操作完成：' + (value.action || ''))
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}

function rangeError(message) {
  const error = new Error(message)
  error.name = 'ValidationError'
  return error
}

function parsePayload(raw) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return {}
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw rangeError('payload 必须是合法 JSON 字符串：' + (error && error.message ? error.message : String(error)))
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw rangeError('payload 必须是 JSON 对象（如 {"style":"电影感"}）')
  return value
}

function pickString(value, fallback = '') {
  return value === undefined || value === null ? fallback : String(value)
}

export function createVideoProjectTool(options = {}) {
  const { defineTool, service } = options
  if (typeof defineTool !== 'function') throw new Error('createVideoProjectTool 需要 defineTool')
  if (!service || !service.projects) throw new Error('createVideoProjectTool 需要 service.projects')

  const projects = service.projects

  function ok(action, extra) {
    return { ok: true, action, ...extra }
  }

  function failure(action, error) {
    const code = (error && (error.code || error.name)) || 'ToolError'
    const message = error && error.message ? error.message : String(error)
    return { ok: false, action, message, error: { code: String(code), message } }
  }

  return defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: buildParameters(),
    output: { schema: buildOutput().schema, render: renderToolResult },
    isConcurrencySafe: (args) => Boolean(args && (args.action === 'list' || args.action === 'get')),
    async execute(args) {
      const action = args && args.action
      try {
        if (TOOL_ACTIONS.indexOf(action) === -1) {
          throw rangeError('action 必须是 ' + TOOL_ACTIONS.join(' / '))
        }
        const project = pickString(args.project).trim()
        if (action !== 'list' && action !== 'location' && action !== 'guide' && !project) throw rangeError('需要 project（项目名 / VideoName）')
        const payload = parsePayload(args.payload)
        const detail = pickString(args.detail) || pickString(payload.detail)

        if (action === 'guide') {
          const request = pickString(payload.request || payload.prompt || payload.text)
          if (!request.trim()) throw rangeError('guide 需要 payload.request（用户原话）')
          const result = projects.buildGuide({ request, preferences: payload.preferences })
          return ok(action, {
            message: '需求表格已生成，请展示给用户确认/修改：' + result.fields.filter((item) => item.source === 'suggested').length + ' 项为建议默认值，' + result.missing.length + ' 项需补全。',
            fields: result.fields,
            draft: result.draft,
            missing: result.missing,
            toConfirm: result.toConfirm,
            hint: result.next
          })
        }
        if (action === 'analyze') {
          const shot = pickString(args.shot || payload.shot)
          if (!shot) throw rangeError('analyze 需要 shot（镜头 id，如 Shot1）')
          const result = await projects.analyzeShot(project, shot, payload)
          if (result.mode === 'frames') {
            return ok(action, {
              message: '已抽帧 ' + result.frames.length + ' 张（时长 ' + result.duration + ' 秒），请逐帧查看后回填 observed 再调用 analyze。',
              mode: result.mode,
              shot: result.shot,
              frames: result.frames,
              framesDir: result.framesDir,
              checklist: result.checklist,
              capability: result.capability || null,
              hint: result.hint
            })
          }
          const strategy = result.strategy || null
          return ok(action, {
            message: '画面分析完成：' + (result.report.pass ? '符合需求' : '发现 ' + result.report.diffs.length + ' 项出入（严重 ' + result.report.serious + ' 项）') + '。',
            mode: result.mode,
            shot: result.shot,
            report: result.report,
            diffs: result.report.diffs,
            improvements: result.report.improvements,
            revisedShot: result.report.revisedShot,
            strategy,
            capability: result.capability || null,
            hint: result.report.pass ? '可 action=save-version 归档（视频可能是「分镜片段」或「全片」：用 payload.kind=shot/full 明确标注，不标的会按分镜时长自动判断并提示）/ adopt-version 指定镜头采用版本（全片按采用版本校验）该版本。' : (strategy && strategy.reason ? '调整策略：' + strategy.reason + '。先把方案给用户确认，确认后再执行；不要直接重抽。' : '先把 diffs/improvements/revisedShot 给用户确认（说明改什么、为什么），用户同意后再改分镜并重新生成；不要直接重抽。')
          })
        }
        if (action === 'location') {
          const target = pickString(payload.storageRoot || payload.location || args.storageRoot).trim()
          if (!target) {
            const current = projects.readLocation()
            const sourceLabel = current.source === 'settings' ? '界面/设置文件指定' : (current.source === 'pluginConfig' ? '插件配置指定' : '默认位置')
            return ok(action, {
              message: '视频项目当前保存位置（' + sourceLabel + '）：' + current.storageRoot + '；项目资料在 ' + current.projectsRoot,
              storageRoot: current.storageRoot,
              projectsRoot: current.projectsRoot,
              hint: '要换位置：action=location payload={"storageRoot":"D:\\\\我的视频项目"}（完整绝对路径）；修改后重启桌面应用生效。'
            })
          }
          const updated = projects.updateLocation(target)
          return ok(action, {
            message: '保存位置已更新为：' + updated.storageRoot + '（项目资料将写入 ' + updated.projectsRoot + '）',
            storageRoot: updated.storageRoot,
            projectsRoot: updated.projectsRoot,
            hint: '重启桌面应用后生效；旧项目仍在旧位置，如需迁移请把旧 projects 文件夹整体移动到新位置。'
          })
        }
        if (action === 'list') {
          const list = await projects.listProjects()
          return ok(action, { message: '共 ' + list.length + ' 个项目。', projects: list })
        }
        if (action === 'create') {
          const result = await projects.createProject(project, payload)
          return ok(action, { message: '项目已就绪：' + project, project: result })
        }
        if (action === 'get') {
          const result = await projects.getProject(project)
          return ok(action, { message: '项目详情：' + project, project: result })
        }
        if (action === 'delete') {
          const result = await projects.deleteProject(project)
          return ok(action, { message: '项目已删除：' + project, project: result })
        }
        if (action === 'save-characters') {
          const characters = Array.isArray(payload.characters) ? payload.characters : null
          if (!characters) throw rangeError('save-characters 需要 payload.characters 数组（[{name,identity,looks}]；兼容旧字段）')
          const result = await projects.saveCharacters(project, characters, { detail })
          const warnings = Array.isArray(result.warnings) ? result.warnings : []
          return ok(action, {
            message: '已保存人物卡 ' + result.characters.length + ' 个' + (warnings.length ? '，自查发现 ' + warnings.length + ' 处问题（先按 warnings 补齐三视图/形象变体）' : '') + '。注意：保存人物卡会把「用户已确认」状态重置为未确认——先把人物卡展示给用户确认，用户同意后调用 action=confirm-plan。',
            warnings,
            planConfirmed: false,
            project: await projects.getProject(project)
          })
        }
        if (action === 'character-sheet') {
          const charName = pickString(payload.charName || payload.character || args.character).trim()
          if (!charName) throw rangeError('character-sheet 需要 payload.charName（人物名）')
          const result = await projects.generateCharacterSheet(project, { charName, lookId: pickString(payload.lookId) })
          return ok(action, {
            message: '已生成人物三视图 ' + result.sheets.length + ' 张（按次计费）：' + result.sheets.map((item) => item.path).join('；'),
            character: result.character,
            sheets: result.sheets,
            project: await projects.getProject(project)
          })
        }
        if (action === 'area-sheet') {
          const areaId = pickString(payload.areaId || args.area || args.areaId).trim()
          if (!areaId) throw rangeError('area-sheet 需要 payload.areaId（区域 id）')
          const result = await projects.generateAreaSheet(project, { areaId })
          return ok(action, {
            message: '已生成区域设定图（按次计费）：' + result.path,
            area: result.area,
            path: result.path,
            project: await projects.getProject(project)
          })
        }
        if (action === 'save-areas') {
          const areas = Array.isArray(payload.areas) ? payload.areas : null
          if (!areas) throw rangeError('save-areas 需要 payload.areas 数组（[{id,name,description,layout,landmarks,lighting,props}]）')
          const result = await projects.saveAreas(project, areas, { detail })
          const warnings = Array.isArray(result.warnings) ? result.warnings : []
          return ok(action, {
            message: '已保存区域设定 ' + result.areas.length + ' 个' + (warnings.length ? '，自查发现 ' + warnings.length + ' 处问题（补齐布局/标志物/光线，区域越大越要写全）' : '') + '。区域确定后，分镜用 areaId 引用，build-prompt 会逐镜注入区域设定。',
            warnings,
            project: await projects.getProject(project)
          })
        }
        if (action === 'save-acts') {
          const acts = Array.isArray(payload.acts) ? payload.acts : null
          if (!acts) throw rangeError('save-acts 需要 payload.acts 数组（[{id,name,purpose,mood,areaId,cast,titleCard}]）')
          const result = await projects.saveActs(project, acts, { detail })
          const warnings = Array.isArray(result.warnings) ? result.warnings : []
          return ok(action, {
            message: '已保存幕设定 ' + result.acts.length + ' 幕' + (warnings.length ? '，自查发现 ' + warnings.length + ' 处问题（先按 warnings 修正 cast/区域引用）' : '') + '。每个分镜用 actId 归属到幕；build-prompt 只注入本幕出场人物与区域。',
            warnings,
            project: await projects.getProject(project)
          })
        }
        if (action === 'save-shots') {
          if (!Array.isArray(payload.shots)) throw rangeError('save-shots 需要 payload.shots 数组')
          const result = await projects.saveShots(project, payload)
          const warningCount = Array.isArray(result.warnings) ? result.warnings.length : 0
          return ok(action, {
            message: '已保存分镜 ' + result.shots.length + ' 个镜头（总时长 ' + (result.stats ? result.stats.totalDuration : 0) + ' 秒）' + (warningCount ? '，自查发现 ' + warningCount + ' 处问题，先按 warnings 修改，并把修改后的分镜给用户确认。' : '，自查通过。') + '注意：保存新分镜会把「用户已确认」状态重置为未确认——先把分镜展示给用户确认，用户同意后调用 action=confirm-plan。',
            warnings: result.warnings || [],
            stats: result.stats,
            planConfirmed: false,
            project: await projects.getProject(project)
          })
        }
        if (action === 'confirm-plan') {
          const detail = pickString(args.detail) || pickString(payload.detail) || pickString(payload.note)
          const result = await projects.confirmPlan(project, { detail })
          return ok(action, {
            message: '已记录「用户已确认分镜/人物卡」（' + result.shots + ' 个镜头）。之后可以 build-prompt 出提示词、sketch 画草图；如果又保存了新的分镜/人物卡，确认状态会自动重置，需要重新确认。',
            planConfirmed: true,
            planConfirmedAt: result.planConfirmedAt,
            project: await projects.getProject(project)
          })
        }
        if (action === 'shot-change') {
          const result = await projects.recordShotChange(project, { shot: args.shot || payload.shot, op: payload.op, summary: payload.summary, detail })
          return ok(action, { message: '已记录分镜修改。', project: await projects.getProject(project) })
        }
        if (action === 'build-prompt') {
          const extra = pickString(payload.extra) || pickString(payload.prompt) || pickString(args.detail)
          const result = await projects.buildShotPrompt(project, args.shot, extra)
          const referenceNote = result.referenceImage
            ? ' 已开启「草图作参考图」：本镜头草图 → ' + result.referenceImage + '。生成时把该绝对路径传给生成工具的参考图参数（如 workspaceImages），mode 用 reference 参考图模式；草图是黑白线稿，只参考构图/机位，风格由提示词控制。'
            : ''
          return ok(action, {
            message: '已生成完整提示词' + (result.shot ? '（镜头 ' + result.shot + '）' : '（全部分镜）') + '。把 prompt/params/分镜摘要给用户看（修改后重新生成要说明改了什么），用户明确同意后再交给生成工具的 prompt 参数；参数用返回的 params；若 checks 有警告先补齐资料。' + referenceNote,
            prompt: result.prompt,
            params: result.params,
            checks: result.checks,
            shot: result.shot,
            sketchPath: result.sketchPath || '',
            referenceImage: result.referenceImage || '',
            project: await projects.getProject(project)
          })
        }
        if (action === 'sketch') {
          // 输入只用已保存的分镜脚本（shot 指定单个镜头；不传 shot 则按分镜 id 每个镜头各画一张）
          const shot = pickString(args.shot || payload.shot)
          const result = await projects.sketchShot(project, shot, {})
          const images = Array.isArray(result.images) && result.images.length ? result.images : [{ shot: result.shot, path: result.path }]
          const message = images.length > 1
            ? '已按分镜 id 生成 ' + images.length + ' 张草图（每镜头一张，' + result.model + ' · ' + result.size + '）：' + images.map((item) => item.shot + ' → ' + item.path).join('；')
            : '已生成 ' + result.shot + ' 的草图（' + result.model + ' · ' + result.size + '）：' + result.path
          return ok(action, {
            message,
            shot: result.shot,
            image: images[0].path,
            sketchPath: images[0].path,
            images,
            capability: result.capability,
            hint: '把草图逐张展示给用户（markdown 图片引用本地路径）。输入只用已保存的分镜脚本（镜头 ' + images.map((item) => item.shot).join('、') + '），不接受临时加的内容；用这些图确认「相机位置/景别」是否和用户想的一致；用户说哪里不对就改分镜（save-shots）再重新确认、重画对应镜头。草图只用于确认，不参与视频生成。若返回 IMAGE_GEN_UNAVAILABLE，说明用户还没在视频项目设置面板启用草图分镜/选择模型，引导用户去设置，不要自行画图。'
          })
        }
        if (action === 'adopt-version') {
          const shot = pickString(args.shot || payload.shot).trim()
          const version = pickString(payload.version || args.version).trim()
          if (!shot || !version) throw rangeError('adopt-version 需要 shot 与 version（如 Shot1 / V0.2）')
          const result = await projects.setAdoptedVersion(project, shot, version)
          return ok(action, {
            message: '已把镜头 ' + shot + ' 的采用版本设为 ' + version + '（全片保存/校验会以它为准）',
            shot: result.shot,
            adoptedVersion: result.adoptedVersion,
            project: await projects.getProject(project)
          })
        }
        if (action === 'review') {
          const shot = pickString(args.shot) || pickString(payload.shot)
          if (!shot) throw rangeError('review 需要 shot（镜头 id，如 Shot1）')
          const checksInput = Array.isArray(payload.checks) ? payload.checks : []
          const rawPass = payload.pass !== undefined ? payload.pass : payload.passed
          const hasExplicitPass = typeof rawPass === 'boolean' || rawPass === 'true' || rawPass === 'false'
          if (!checksInput.length && !hasExplicitPass) {
            const template = await projects.reviewTemplate(project, shot)
            return ok(action, {
              message: '验收表已生成（' + template.checks.length + ' 栏），请逐栏打勾（pass）后带 checks 再调用 review；全部通过才算通过，提交后会给出调整策略。',
              shot: template.shot,
              checks: template.checks,
              capability: template.capability,
              hint: template.hint
            })
          }
          const result = await projects.saveShotReview(project, shot, {
            version: pickString(payload.version),
            checks: checksInput,
            pass: hasExplicitPass ? rawPass === true || rawPass === 'true' : undefined,
            issues: payload.issues,
            notes: pickString(payload.notes) || detail,
            reviewer: pickString(payload.reviewer)
          })
          const shotReviews = (await projects.getProject(project)).video.shots.find((item) => item.id === result.shot)
          const reviews = shotReviews ? shotReviews.reviews : []
          const failed = reviews.filter((item) => item.pass !== true).length
          const resultChecks = result.review && Array.isArray(result.review.checks) ? result.review.checks : []
          const strategy = result.strategy || null
          return ok(action, {
            message: '已记录 ' + result.shot + ' 验收：' + (result.passed ? '通过' : '不通过') + (result.passed ? '，可以归档版本（save-version）。' : '，按不通过的栏修改方案（先给用户确认）后再重新生成。'),
            shot: result.shot,
            passed: result.passed,
            checks: resultChecks,
            strategy,
            capability: typeof projects.videoCapability === 'function' ? projects.videoCapability() : null,
            issues: result.review && Array.isArray(result.review.issues) ? result.review.issues : [],
            hint: result.passed ? '下一步：action=save-version 归档（视频可能是「分镜片段」或「全片」：用 payload.kind=shot/full 明确标注，不标的会按分镜时长自动判断并提示）/ adopt-version 指定镜头采用版本（全片按采用版本校验）该版本；然后处理下一个镜头。' : (strategy && strategy.reason ? '调整策略：' + strategy.reason + '。先跟用户确认方案再执行；累计不通过 ' + failed + ' 次。' : '累计不通过 ' + failed + ' 次。建议：简化动作、固定 seed 不变再试，或改分镜；重新生成前先把修改方案给用户确认。'),
            project: await projects.getProject(project)
          })
        }
        if (action === 'save-version') {
          const sourcePath = pickString(args.sourcePath) || pickString(payload.sourcePath)
          if (!sourcePath) throw rangeError('save-version 需要 sourcePath（本地视频路径，通常传生成工具返回的视频文件路径）')
          const result = await projects.saveShotVersion(project, args.shot || payload.shot, {
            sourcePath,
            taskId: pickString(args.taskId) || pickString(payload.taskId),
            recordId: pickString(payload.recordId),
            prompt: pickString(payload.prompt),
            model: pickString(payload.model),
            mode: pickString(payload.mode),
            params: payload.params,
            provider: pickString(payload.provider),
            strategy: payload.strategy,
            detail
          })
          return ok(action, {
            message: '已归档为 ' + result.shot + ' ' + result.version + (result.meta && result.meta.strategy ? '（策略：' + result.meta.strategy.type + '）' : ''),
            shot: result.shot,
            version: result.version,
            path: result.videoPath,
            strategy: result.meta ? result.meta.strategy : null,
            hint: '可继续生成同一镜头的新版本（会自动递增 V0.x），或处理下一个镜头。',
            project: await projects.getProject(project)
          })
        }
        if (action === 'full-video') {
          const sourcePath = pickString(args.sourcePath) || pickString(payload.sourcePath)
          if (!sourcePath) throw rangeError('full-video 需要 sourcePath（全片视频的本地路径）')
          const result = await projects.saveFullVideo(project, {
            sourcePath,
            taskId: pickString(args.taskId) || pickString(payload.taskId),
            recordId: pickString(payload.recordId),
            prompt: pickString(payload.prompt),
            model: pickString(payload.model),
            provider: pickString(payload.provider),
            detail
          })
          const pending = Array.isArray(result.pendingReview) ? result.pendingReview : []
          return ok(action, {
            message: result.verified
              ? '已保存全片（所有镜头均已通过验收）：' + result.videoPath
              : '已保存全片（标记为「待验收」）：这些镜头还没通过验收：' + pending.join('、') + '。先 review 验收并 save-version 归档（视频可能是「分镜片段」或「全片」：用 payload.kind=shot/full 明确标注，不标的会按分镜时长自动判断并提示）/ adopt-version 指定镜头采用版本（全片按采用版本校验）最新版本，再重新 full-video 保存全片。',
            hint: result.verified ? undefined : '全片当前是「待验收」状态：建议逐个镜头 review（对照分镜/人物卡/环境），通过后 save-version，再重新保存全片为「已验收」。',
            path: result.videoPath,
            verified: Boolean(result.verified),
            pendingReview: pending,
            project: await projects.getProject(project)
          })
        }
        throw rangeError('未实现的 action：' + String(action))
      } catch (error) {
        return failure(action, error)
      }
    }
  })
}
