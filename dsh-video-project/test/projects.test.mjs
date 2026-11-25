/**
 * server/projects.js 单测：项目落盘 CRUD、人物卡、分镜、变更记录、版本归档、提示词组装、路径安全。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createProjects, MAX_PROJECT_PROMPT_CHARS, resolveProjectStorageRoot, readProjectLocation, updateProjectLocation, validateShotList, SHOT_TYPES, MOVEMENTS } from '../server/projects.js'


// 测试进程隔离用户真实设置（避免「人物三视图自动出图」触发真实网络生成）
process.env.VIDEO_PROJECT_CONFIG_FILE = path.join(os.tmpdir(), 'vp-test-no-user-config-' + process.pid + '.json')
async function makeStore() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'video-project-'))
  const root = path.join(base, 'projects')
  const projects = createProjects({ root })
  return { base, root, projects }
}

async function writeSourceVideo(base, name = 'src.mp4', content = 'fake-video-bytes') {
  const file = path.join(base, name)
  await fs.writeFile(file, content)
  return file
}

test('createProject：建目录 + 空项目可读', async () => {
  const { projects } = await makeStore()
  const project = await projects.createProject('测试片', { style: '电影感写实' })
  assert.equal(project.videoName, '测试片')
  assert.equal(project.style, '电影感写实')
  assert.deepEqual(project.characters, [])
  assert.deepEqual(project.shots, [])
  const stat = await fs.stat(path.join(project.dir, 'Charactor'))
  assert.ok(stat.isDirectory())
  const again = await projects.createProject('测试片')
  assert.equal(again.videoName, '测试片')
})

test('saveCharacters：保存人物卡 + 全量替换移除旧角色', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目A')
  await projects.saveCharacters('项目A', [
    { name: '小橘', appearance: '橘猫，圆脸，右耳缺一角' },
    { name: '阿蓝', appearance: '蓝衣少女，短发，戴眼镜' }
  ])
  const detail = await projects.getProject('项目A')
  assert.equal(detail.characters.length, 2)
  const orange = detail.characters.find((item) => item.name === '小橘')
  assert.equal(orange.appearance, '橘猫，圆脸，右耳缺一角')
  await projects.saveCharacters('项目A', [{ name: '小橘', appearance: '橘猫，圆脸' }])
  const next = await projects.getProject('项目A')
  assert.equal(next.characters.length, 1)
  assert.equal(next.characters[0].name, '小橘')
  const changes = next.changes.filter((item) => item.scope === 'characters')
  assert.equal(changes.length, 2)
})

test('人物卡 6 栏：结构化字段落盘 + appearance 自动组合 + 提示词逐栏注入', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目K')
  await projects.saveCharacters('项目K', [{
    name: '阿橘',
    age: '3 岁',
    face: '圆脸、琥珀色眼睛',
    hair: '橘色短毛',
    costume: '红项圈',
    body: '偏胖',
    signature: '右耳缺一角'
  }])
  const detail = await projects.getProject('项目K')
  const char = detail.characters.find((item) => item.name === '阿橘')
  assert.equal(char.age, '3 岁')
  assert.equal(char.hair, '橘色短毛')
  assert.equal(char.signature, '右耳缺一角')
  assert.ok(char.appearance.includes('年龄：3 岁'))
  assert.ok(char.appearance.includes('标志性特征：右耳缺一角'))
  await projects.saveShots('项目K', { shots: [{ id: 'Shot1', scene: '窗台', shotType: '近景', movement: '固定', duration: 3, action: '阿橘伸懒腰', characters: ['阿橘'] }] })
  await projects.confirmPlan('项目K')
  const built = await projects.buildShotPrompt('项目K', 'Shot1', '')
  assert.ok(built.prompt.includes('年龄：3 岁'))
  assert.ok(built.prompt.includes('发型/发色：橘色短毛'))
})

test('saveShots + shot-change：分镜落盘与变更记录', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目B', { style: '赛博朋克' })
  const saved = await projects.saveShots('项目B', {
    style: '赛博朋克夜景',
    shots: [
      { id: 'Shot1', name: '开场', scene: '雨夜街头', shotType: '远景', movement: '缓慢推进', duration: 5, action: '霓虹灯下雨滴落下', characters: ['小橘'] },
      { id: '2', name: '特写', scene: '窗台', shotType: '特写', duration: 3, action: '猫眼反光' }
    ]
  })
  assert.equal(saved.shots.length, 2)
  assert.equal(saved.shots[0].id, 'Shot1')
  assert.equal(saved.shots[1].id, 'Shot2')
  const detail = await projects.getProject('项目B')
  assert.equal(detail.style, '赛博朋克夜景')
  assert.equal(detail.shots.length, 2)
  await projects.recordShotChange('项目B', { shot: 'Shot2', summary: '把特写改成中景', detail: '用户要求' })
  const after = await projects.getProject('项目B')
  const change = after.changes.find((item) => item.summary === '把特写改成中景')
  assert.ok(change)
  assert.equal(change.scope, 'shots')
})

test('validateShotList：6 栏自查（景别重复/一镜多动作/台词长/空镜/总时长）', () => {
  assert.ok(SHOT_TYPES.includes('特写'))
  assert.ok(MOVEMENTS.includes('固定'))
  const result = validateShotList([
    { id: 'Shot1', shotType: '中景', movement: '固定', duration: 8, action: '推开门走进屋', dialogue: '我回来了', scene: '室内' },
    { id: 'Shot2', shotType: '中景', movement: '固定', duration: 9, action: '然后坐下接着开始说话然后站起来再走出去然后回头然后笑', dialogue: '很长很长的台词，一大段糊在一起，没有按镜头拆开，说到哪句配哪个画面完全对不上，现场还得临时想怎么办' },
    { id: 'Shot3', shotType: '特写', movement: '固定', duration: 50, action: '点头' }
  ])
  const codes = result.warnings.map((warning) => warning.code)
  assert.ok(codes.includes('SHOT_TYPE_REPEAT'))
  assert.ok(codes.includes('ACTION_TOO_MANY'))
  assert.ok(codes.includes('TOTAL_TOO_LONG'))
  assert.ok(codes.includes('NO_ESTABLISHING'))
  assert.equal(result.stats.shotCount, 3)
  assert.equal(result.stats.totalDuration, 67)
})

test('saveShots：返回 warnings/stats + subtitle 落盘', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目G', { style: '电影感' })
  const saved = await projects.saveShots('项目G', {
    shots: [
      { id: 'Shot1', name: '开场', scene: '雨夜街头', shotType: '全景', camera: '低机位', movement: '固定', duration: 4, action: '雨滴打在伞面', dialogue: '', subtitle: '下雨了', sound: '雨声', characters: ['少女'] }
    ]
  })
  assert.equal(saved.shots[0].subtitle, '下雨了')
  assert.ok(Array.isArray(saved.warnings))
  assert.equal(saved.stats.totalDuration, 4)
  const detail = await projects.getProject('项目G')
  assert.equal(detail.shots[0].subtitle, '下雨了')
  await projects.confirmPlan('项目G')
  const built = await projects.buildShotPrompt('项目G', 'Shot1', '')
  assert.ok(built.prompt.includes('字幕：下雨了'))
})

test('saveShotVersion：V0.1 → V0.2 递增 + meta + ChangeInfo', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目C')
  const source = await writeSourceVideo(base, 'take1.mp4', 'video-one')
  const first = await projects.saveShotVersion('项目C', 'Shot1', {
    sourcePath: source,
    taskId: 'sd_task_1',
    prompt: '一只猫',
    model: 'm1',
    mode: 'text2video',
    params: { duration: 5 }
  })
  assert.equal(first.version, 'V0.1')
  assert.equal(first.shot, 'Shot1')
  const bytes = await fs.readFile(path.join(first.dir, 'video.mp4'), 'utf8')
  assert.equal(bytes, 'video-one')
  const meta = JSON.parse(await fs.readFile(path.join(first.dir, 'meta.json'), 'utf8'))
  assert.equal(meta.taskId, 'sd_task_1')
  assert.equal(meta.version, 'V0.1')
  const second = await projects.saveShotVersion('项目C', 'Shot1', { sourcePath: source, taskId: 'sd_task_2' })
  assert.equal(second.version, 'V0.2')
  const detail = await projects.getProject('项目C')
  const shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.versions.length, 2)
  assert.equal(shot.versions[1].version, 'V0.2')
  assert.equal(shot.changeLog.length, 2)
})

test('saveFullVideo：要求镜头已归档 + 未验收标记待验收 + 区别版本', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目D')
  await projects.saveShots('项目D', {
    shots: [{ id: 'Shot1', name: '开场', shotType: '全景', movement: '固定', duration: 3, action: '角色站在舞台中央', environment: '白天，沙漠', purpose: '交代环境' }]
  })
  const source = await writeSourceVideo(base, 'shot1.mp4', 'shot-video')
  // 1) 未归档镜头版本 → 拒绝
  await assert.rejects(() => projects.saveFullVideo('项目D', { sourcePath: source }), (error) => error.code === 'FULL_VIDEO_NOT_ARCHIVED')
  // 2) 归档 V0.1（未验收）→ 全片待验收
  const v1 = await projects.saveShotVersion('项目D', 'Shot1', { sourcePath: source })
  assert.equal(v1.version, 'V0.1')
  const pending = await projects.saveFullVideo('项目D', { sourcePath: source })
  assert.equal(pending.verified, false)
  assert.deepEqual(pending.pendingReview, ['Shot1'])
  assert.ok(pending.videoPath.endsWith(path.join('Video', 'FullVideo', 'video.mp4')))
  // 3) 针对 V0.1 验收通过 → 全片已验收，记录来源版本 V0.1
  await projects.saveShotReview('项目D', 'Shot1', { version: 'V0.1', pass: true })
  const verified = await projects.saveFullVideo('项目D', { sourcePath: source, taskId: 'sd_full_1' })
  assert.equal(verified.verified, true)
  assert.deepEqual(verified.pendingReview, [])
  assert.equal(verified.meta.approvedVersions.Shot1, 'V0.1')
  assert.equal(verified.meta.taskId, 'sd_full_1')
  const detail = await projects.getProject('项目D')
  assert.ok(detail.video.fullVideo)
  assert.equal(detail.video.fullVideo.meta.verified, true)
  // 4) 再归档 V0.2（未验收）→ 仍按已通过的 V0.1 判定已验收（区别版本）
  const v2 = await projects.saveShotVersion('项目D', 'Shot1', { sourcePath: source })
  assert.equal(v2.version, 'V0.2')
  const stillVerified = await projects.saveFullVideo('项目D', { sourcePath: source })
  assert.equal(stillVerified.verified, true)
  assert.equal(stillVerified.meta.approvedVersions.Shot1, 'V0.1')
})

test('buildShotPrompt：人物卡 + 分镜画面 + 附加要求', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目E', { style: '电影感写实' })
  await projects.saveCharacters('项目E', [{ name: '小橘', appearance: '橘猫，圆脸，右耳缺一角' }])
  await projects.saveShots('项目E', {
    shots: [{ id: 'Shot1', name: '开场', shotType: '全景→中景', movement: '缓慢推进', lighting: '午后暖光', transition: '叠化', duration: 5, action: '橘猫在窗台上伸懒腰', sound: '鸟鸣' }]
  })
  await projects.confirmPlan('项目E')
  const built = await projects.buildShotPrompt('项目E', 'Shot1', '镜头更暖一些')
  assert.equal(built.shot, 'Shot1')
  assert.ok(built.prompt.includes('【人物卡'))
  assert.ok(built.prompt.includes('小橘：橘猫，圆脸，右耳缺一角'))
  assert.ok(built.prompt.includes('橘猫在窗台上伸懒腰'))
  assert.ok(built.prompt.includes('光线/色调：午后暖光'))
  assert.ok(built.prompt.includes('转场：叠化'))
  assert.ok(built.prompt.includes('【附加要求】镜头更暖一些'))
  assert.ok(built.prompt.length <= MAX_PROJECT_PROMPT_CHARS)
  await assert.rejects(() => projects.buildShotPrompt('项目E', 'Shot9', ''), (error) => error.code === 'SHOT_NOT_FOUND')
})

test('baseline：固定参数落盘 + build-prompt 输出 params/checks', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目F', { style: '日系', baseline: { model: 'doubao-seedance-2.5', resolution: '720p', ratio: '9:16', seed: 12345, styleCard: '赛璐璐' } })
  const detail = await projects.getProject('项目F')
  assert.equal(detail.baseline.model, 'doubao-seedance-2.5')
  assert.equal(detail.baseline.seed, 12345)
  await projects.saveCharacters('项目F', [{ name: '少女', appearance: '黑色齐肩短发' }])
  await projects.saveShots('项目F', { shots: [{ id: 'Shot1', scene: '街道', action: '雨中奔跑', shotType: '全景', camera: '低机位', movement: '跟拍', duration: 5, environment: '黄昏，雨中街道，暖橙侧光，湿路面反光', purpose: '交代雨中奔跑', characters: ['少女'] }] })
  await projects.confirmPlan('项目F')
  const withoutShot = await projects.buildShotPrompt('项目F', '', '')
  // 作品端只输出创作参数（画面比例）；模型/分辨率/种子由生成工具端决定
  assert.equal(withoutShot.params.ratio, '9:16')
  assert.equal(withoutShot.params.model, undefined)
  assert.equal(withoutShot.params.resolution, undefined)
  assert.ok(withoutShot.prompt.includes('创作参数'))
  assert.ok(withoutShot.checks.some((item) => item.includes('未指定镜头')))
  const built = await projects.buildShotPrompt('项目F', 'Shot1', '')
  assert.equal(built.params.duration, 5)
  // 三视图/形象变体提示允许出现在 checks（引导补全），但不应有阻断性缺项
  assert.ok(!built.checks.some((item) => /未指定镜头|缺少景别|缺少镜头运动|缺少画面内容|缺少时长|缺少人物卡/.test(item)))
})

test('sceneMap + 分镜延伸字段：落盘与回读', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目M', { sceneMap: { description: '雨夜街道，路灯在画面右侧', objects: ['路灯', '积水'], characters: ['少女在画面右'], cameras: ['相机在街道左侧朝向画面右'], notes: '保持左→右方向' } })
  const created = await projects.getProject('项目M')
  assert.equal(created.sceneMap.description, '雨夜街道，路灯在画面右侧')
  assert.deepEqual(created.sceneMap.objects, ['路灯', '积水'])
  await projects.saveShots('项目M', { shots: [{ id: 'Shot1', scene: '街道', shotType: '全景', movement: '固定', duration: 4, action: '少女奔跑', purpose: '交代环境', beat: 1, screenDirection: '左→右', eyeline: '看向镜头', risk: 'high' }] })
  const detail = await projects.getProject('项目M')
  const shot = detail.shots[0]
  assert.equal(shot.purpose, '交代环境')
  assert.equal(shot.beat, 1)
  assert.equal(shot.screenDirection, '左→右')
  assert.equal(shot.eyeline, '看向镜头')
  assert.equal(shot.risk, 'high')
  await projects.saveShots('项目M', { sceneMap: { description: '新地图' } })
  assert.equal((await projects.getProject('项目M')).sceneMap.description, '新地图')
})

test('分镜自查：环境描写缺失/相邻时间冲突/全片无环境 会给出警告', () => {
  const missing = validateShotList([
    { id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, action: '走路' }
  ])
  const missingCodes = missing.warnings.map((item) => item.code)
  assert.ok(missingCodes.includes('MISSING_ENVIRONMENT'))
  assert.ok(missingCodes.includes('NO_ENVIRONMENT'))

  const jump = validateShotList([
    { id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, action: '走路', environment: '黄昏，街道，暖橙侧光' },
    { id: 'Shot2', shotType: '中景', movement: '固定', duration: 4, action: '停下', environment: '夜晚，街头，霓虹灯' }
  ])
  const jumpWarning = jump.warnings.find((item) => item.code === 'ENVIRONMENT_JUMP')
  assert.ok(jumpWarning)
  assert.match(jumpWarning.message, /黄昏/)
  assert.match(jumpWarning.message, /夜晚/)

  const consistent = validateShotList([
    { id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, action: '走路', environment: '黄昏，街道，暖橙侧光' },
    { id: 'Shot2', shotType: '中景', movement: '固定', duration: 4, action: '停下', environment: '黄昏，街道，暖橙侧光' }
  ])
  assert.ok(!consistent.warnings.some((item) => item.code === 'ENVIRONMENT_JUMP'))
})

test('环境描写：保存回读 + build-prompt 注入全片环境/本镜环境/一致性硬约束', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目Env', { style: '赛博夜景', sceneMap: { description: '雨夜街道', environment: '傍晚，雨后街道，霓虹灯冷蓝+暖粉，湿路面反光' } })
  await projects.saveCharacters('项目Env', [{ name: '少女', appearance: '黑色齐肩短发' }])
  await projects.saveShots('项目Env', { shots: [{ id: 'Shot1', scene: '街道', shotType: '全景', movement: '固定', duration: 4, environment: '傍晚，雨后街道，霓虹灯冷蓝+暖粉', action: '少女奔跑', purpose: '交代环境', characters: ['少女'] }] })
  const detail = await projects.getProject('项目Env')
  assert.equal(detail.shots[0].environment, '傍晚，雨后街道，霓虹灯冷蓝+暖粉')
  assert.equal(detail.sceneMap.environment, '傍晚，雨后街道，霓虹灯冷蓝+暖粉，湿路面反光')
  await projects.confirmPlan('项目Env')
  const built = await projects.buildShotPrompt('项目Env', 'Shot1', '')
  assert.match(built.prompt, /全片环境（所有镜头必须一致）/)
  assert.match(built.prompt, /霓虹灯冷蓝\+暖粉/)
  assert.match(built.prompt, /环境一致性（硬性）/)
  assert.match(built.prompt, /不得从黄昏变成夜晚/)
})

test('build-prompt：开启「草图作参考图」且有草图时返回 referenceImage，关闭时不返回', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'video-project-ref-'))
  const root = path.join(base, 'projects')
  const env = { USERPROFILE: base }
  const projects = createProjects({ root, env })
  await projects.createProject('项目Ref', { sceneMap: { environment: '黄昏，街道' } })
  await projects.saveCharacters('项目Ref', [{ name: '少女', appearance: '黑色短发' }])
  await projects.saveShots('项目Ref', { shots: [{ id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, environment: '黄昏，街道', action: '奔跑', characters: ['少女'] }] })
  // 模拟已经画过草图（sketchPath 落盘）
  const shotsFile = path.join(root, '项目Ref', 'Shots', 'mainShots.json')
  const data = JSON.parse(await fs.readFile(shotsFile, 'utf8'))
  data.shots[0].sketchPath = 'C:\\sketches\\Shot1.png'
  await fs.writeFile(shotsFile, JSON.stringify(data, null, 2))
  await projects.confirmPlan('项目Ref')
  // 默认关闭：只返回 sketchPath，不返回 referenceImage
  const off = await projects.buildShotPrompt('项目Ref', 'Shot1', '')
  assert.equal(off.sketchPath, 'C:\\sketches\\Shot1.png')
  assert.equal(off.referenceImage, '')
  // 打开开关后：referenceImage 带草图绝对路径
  const configDir = path.join(base, '.dsh', 'video-project')
  await fs.mkdir(configDir, { recursive: true })
  await fs.writeFile(path.join(configDir, 'config.json'), JSON.stringify({ sketchAsReference: true }))
  const on = await projects.buildShotPrompt('项目Ref', 'Shot1', '')
  assert.equal(on.referenceImage, 'C:\\sketches\\Shot1.png')
})

test('分镜自查：镜头任务重复/缺失、画面方向跳轴、高风险提示', () => {
  const result = validateShotList([
    { id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, action: '走路', purpose: '交代环境', screenDirection: '左→右' },
    { id: 'Shot2', shotType: '中景', movement: '固定', duration: 4, action: '走路', purpose: '交代环境', screenDirection: '右→左', risk: 'high' },
    { id: 'Shot3', shotType: '近景', movement: '固定', duration: 4, action: '抬头', screenDirection: '左→右' }
  ])
  const codes = result.warnings.map((warning) => warning.code)
  assert.ok(codes.includes('PURPOSE_REPEAT'))
  assert.ok(codes.includes('MISSING_PURPOSE'))
  assert.ok(codes.includes('DIRECTION_JUMP'))
  assert.ok(codes.includes('HIGH_RISK'))
})

test('review：验收记录落盘 + getProject 通过状态', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目G')
  const failed = await projects.saveShotReview('项目G', 'Shot1', { version: 'V0.1', pass: false, issues: ['人物外观不一致'] })
  assert.equal(failed.passed, false)
  await projects.saveShotReview('项目G', 'Shot1', { version: 'V0.2', pass: true, notes: '通过' })
  const detail = await projects.getProject('项目G')
  const shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.reviews.length, 2)
  assert.equal(shot.approved, true)
  assert.equal(shot.reviews[0].issues[0], '人物外观不一致')
})

test('review 自动策略 + 版本记录策略', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目S')
  await projects.saveShots('项目S', { shots: [{ id: 'Shot1', shotType: '全景', movement: '固定', duration: 4, action: '走路', purpose: '交代环境' }] })
  const failed = await projects.saveShotReview('项目S', 'Shot1', { version: 'V0.1', checks: [{ key: 'action', pass: false, note: '动作不是走路' }, { key: 'dialogue', pass: true }] })
  assert.equal(failed.strategy.type, 'regenerate')
  assert.equal(failed.review.strategy.type, 'regenerate')
  const src = await writeSourceVideo(base)
  const saved = await projects.saveShotVersion('项目S', 'Shot1', { sourcePath: src, strategy: { type: 'keep-frames', keepUntil: 2, reason: '保留前段' } })
  assert.equal(saved.meta.strategy.type, 'keep-frames')
  assert.equal(saved.meta.strategy.keepUntil, 2)
})

test('review：7 栏逐项打勾（含环境，全部通过 / 有不通过）', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目H')
  await projects.saveShots('项目H', { shots: [{ id: 'Shot1', scene: '街道', shotType: '全景', movement: '固定', duration: 4, action: '奔跑' }] })
  const template = await projects.reviewTemplate('项目H', 'Shot1')
  assert.ok(template.checks.length >= 7)
  assert.equal(template.checks[0].key, 'shotType')
  const allPass = await projects.saveShotReview('项目H', 'Shot1', { version: 'V0.1', checks: template.checks.map((item) => ({ key: item.key, pass: true })) })
  assert.equal(allPass.passed, true)
  const failed = await projects.saveShotReview('项目H', 'Shot1', { version: 'V0.2', checks: [{ key: 'action', pass: false, note: '没有奔跑' }, { key: 'characters', pass: true }] })
  assert.equal(failed.passed, false)
  assert.ok(failed.review.issues.some((item) => item.includes('画面内容')))
  const detail = await projects.getProject('项目H')
  const shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.reviews.length, 2)
  assert.equal(shot.reviews[1].checks.length, 2)
})

test('listProjects：摘要按更新时间排序', async () => {
  const { projects } = await makeStore()
  await projects.createProject('老项目')
  await projects.saveShots('老项目', { shots: [{ id: 'Shot1', action: 'a' }] })
  await new Promise((resolve) => setTimeout(resolve, 5))
  await projects.createProject('新项目')
  await projects.saveCharacters('新项目', [{ name: '角色', appearance: 'x' }])
  const list = await projects.listProjects()
  assert.equal(list.length, 2)
  assert.equal(list[0].name, '新项目')
  assert.equal(list[0].characters, 1)
  assert.equal(list.find((item) => item.name === '老项目').shots, 1)
})

test('路径安全与不存在的项目', async () => {
  const { projects } = await makeStore()
  await assert.rejects(() => projects.createProject('../evil'), (error) => error.code === 'INVALID_PROJECT_NAME')
  await assert.rejects(() => projects.createProject('a/b'), (error) => error.code === 'INVALID_PROJECT_NAME')
  await assert.rejects(() => projects.getProject('不存在'), (error) => error.code === 'NotFound')
  await assert.rejects(() => projects.deleteProject('不存在'), (error) => error.code === 'NotFound')
  await assert.rejects(() => projects.saveShotVersion('不存在', 'Shot1', { sourcePath: 'x' }), (error) => error.code === 'NotFound')
  const created = await projects.createProject('正常项目')
  assert.equal(created.videoName, '正常项目')
})


test('resolveProjectStorageRoot：插件 config > 共享设置文件 > 默认', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'video-project-root-'))
  const env = { DSH_HOME: base }
  const fallback = path.join(base, 'storages', 'video-project')
  let resolved = resolveProjectStorageRoot({ env, pluginConfig: {} })
  assert.equal(resolved.storageRoot, fallback)
  assert.equal(resolved.source, 'default')
  const shared = path.join(base, '我的视频项目')
  await fs.mkdir(fallback, { recursive: true })
  await fs.writeFile(path.join(fallback, 'settings.json'), JSON.stringify({ storageRoot: shared }), 'utf8')
  resolved = resolveProjectStorageRoot({ env, pluginConfig: {} })
  assert.equal(resolved.storageRoot, path.resolve(shared))
  assert.equal(resolved.projectsRoot, path.join(path.resolve(shared), 'projects'))
  assert.equal(resolved.source, 'settings')
  const fromConfig = path.join(base, '配置指定目录')
  resolved = resolveProjectStorageRoot({ env, pluginConfig: { storageRoot: fromConfig } })
  assert.equal(resolved.storageRoot, path.resolve(fromConfig))
  assert.equal(resolved.source, 'pluginConfig')
})


test('保存位置：读取默认 / 更新写 settings.json / 非法路径报错', async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'video-project-location-'))
  const env = { DSH_HOME: base }
  const fallback = path.join(base, 'storages', 'video-project')
  const initial = readProjectLocation({ env, pluginConfig: {} })
  assert.equal(initial.storageRoot, fallback)
  assert.equal(initial.source, 'default')
  assert.equal(initial.defaultStorageRoot, fallback)
  const target = path.join(base, '我的视频项目')
  const updated = updateProjectLocation({ env, storageRoot: target })
  assert.equal(updated.storageRoot, path.resolve(target))
  assert.equal(updated.source, 'settings')
  const again = readProjectLocation({ env, pluginConfig: {} })
  assert.equal(again.storageRoot, path.resolve(target))
  assert.equal(again.projectsRoot, path.join(path.resolve(target), 'projects'))
  assert.throws(() => updateProjectLocation({ env, storageRoot: '' }), (error) => error.code === 'INVALID_STORAGE_ROOT')
  assert.throws(() => updateProjectLocation({ env, storageRoot: 'relative/path' }), (error) => error.code === 'INVALID_STORAGE_ROOT')
  if (process.platform === 'win32') {
    assert.throws(() => updateProjectLocation({ env, storageRoot: 'D:\\' }), (error) => error.code === 'INVALID_STORAGE_ROOT')
  }
})

test('sketchShot：生成草图、保存到 Storyboards、写回分镜 sketchPath', async () => {
  const realImagegen = await import('../server/imagegen.js')
  const calls = []
  const mockImagegen = {
    ...realImagegen,
    generateSketchImage: async (options) => {
      calls.push(options)
      return { buffer: Buffer.from('fake-img'), mediaType: 'image/png' }
    }
  }
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'video-project-sketch-'))
  const projects = createProjects({ root: path.join(base, 'projects'), imagegen: mockImagegen })
  await projects.createProject('草图片', { baseline: { ratio: '16:9' } })
  await projects.saveCharacters('草图片', [{ name: '少年', appearance: '黑短发黑衣' }])
  await projects.saveShots('草图片', {
    shots: [{ id: 'Shot3', shotType: '特写（脚部）', camera: '低机位贴地', action: '靴子蹬裂地面', characters: ['少年'] }]
  })
  await projects.confirmPlan('草图片')
  const saved = { ...process.env }
  process.env.VIDEO_IMAGE_CAPABLE = 'true'
  process.env.VIDEO_IMAGE_BASE_URL = 'https://relay.example'
  process.env.VIDEO_IMAGE_API_KEY = 'k'
  process.env.VIDEO_IMAGE_MODEL = 'gpt-image-2.5'
  try {
    const result = await projects.sketchShot('草图片', 'Shot3')
    assert.equal(result.ok, true)
    assert.equal(result.shot, 'Shot3')
    assert.match(result.path, /Storyboards/)
    assert.ok(await fs.stat(result.path))
    const detail = await projects.getProject('草图片')
    const shot = detail.shots.find((item) => item.id === 'Shot3')
    assert.equal(shot.sketchPath, result.path)
    assert.equal(calls[0].model, 'gpt-image-2.5')
    assert.equal(calls[0].size, '1536x1024')
    assert.doesNotMatch(calls[0].prompt, /镜头再低一点/) // 附加文本不生效
    assert.match(calls[0].prompt, /特写（脚部）/)
    assert.ok(detail.changes.some((item) => item.scope === 'storyboard' && item.op === 'sketch'))
  } finally {
    for (const key of ['VIDEO_IMAGE_CAPABLE', 'VIDEO_IMAGE_BASE_URL', 'VIDEO_IMAGE_API_KEY', 'VIDEO_IMAGE_MODEL']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})

test('sketchShot：没有图像能力时抛 IMAGE_GEN_UNAVAILABLE', async () => {
  const { projects } = await makeStore()
  await projects.createProject('无图片')
  await projects.saveShots('无图片', { shots: [{ id: 'Shot1', shotType: '远景', action: '空镜' }] })
  await projects.confirmPlan('无图片')
  const saved = { ...process.env }
  delete process.env.VIDEO_IMAGE_BASE_URL
  delete process.env.VIDEO_IMAGE_API_KEY
  delete process.env.VIDEO_IMAGE_MODEL
  // 显式关闭图像能力（否则会读真实 home 下用户已保存的 config.json，能力可用）
  process.env.VIDEO_IMAGE_CAPABLE = '0'
  try {
    await assert.rejects(
      () => projects.sketchShot('无图片', 'Shot1'),
      (error) => error.code === 'IMAGE_GEN_UNAVAILABLE'
    )
  } finally {
    for (const key of ['VIDEO_IMAGE_CAPABLE', 'VIDEO_IMAGE_BASE_URL', 'VIDEO_IMAGE_API_KEY', 'VIDEO_IMAGE_MODEL']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})

test('结构：人物基础身份 + 形象变体 + 三视图（兼容旧字段）', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目结构A')
  const saved = await projects.saveCharacters('项目结构A', [
    { name: '阿海', identity: { age: '35', face: '国字脸、左眉疤', hairBase: '短寸黑发', body: '精瘦', signature: '腰挂铜哨' },
      looks: [
        { id: 'dock', name: '码头工人装', hair: '乱短发', costume: '灰蓝渔夫外套', views: { front: '正面描述', side: '侧面描述', back: '背面描述' } },
        { id: 'hurt', name: '受伤后', costume: '外套破损、左臂绷带', views: { front: '绷带描述' } }
      ] },
    { name: '老船长', appearance: '旧人物卡：花白胡子' }
  ])
  assert.equal(saved.characters.length, 2)
  assert.ok(saved.warnings.some((warning) => warning.code === 'CHAR_VIEWS_INCOMPLETE'))
  const detail = await projects.getProject('项目结构A')
  const ahai = detail.characters.find((item) => item.name === '阿海')
  assert.equal(ahai.identity.face, '国字脸、左眉疤')
  assert.equal(ahai.looks.length, 2)
  assert.equal(ahai.looks[0].views.front, '正面描述')
  const old = detail.characters.find((item) => item.name === '老船长')
  assert.equal(old.looks.length, 1)
  assert.ok(old.appearance.includes('花白胡子'))
})

test('结构：区域 + 幕 + 分镜归属；build-prompt 只注入本幕 cast 与区域', async () => {
  const { projects } = await makeStore()
  await projects.createProject('项目结构B', { style: '电影感' })
  await projects.saveCharacters('项目结构B', [
    { name: '阿海', identity: { face: '左眉疤' }, looks: [{ id: 'dock', name: '工人装', costume: '灰蓝外套', views: { front: '正', side: '侧', back: '背' } }] },
    { name: '老船长', identity: { face: '花白胡子' }, looks: [{ id: 'captain', name: '船长装', costume: '黑呢大衣', views: { front: '正', side: '侧', back: '背' } }] }
  ])
  const areas = await projects.saveAreas('项目结构B', [
    { id: 'dock', name: '码头', description: '黄昏海港', layout: '入口在南、栈道向北', landmarks: ['系船柱', '锈铁锚'], lighting: '黄昏暖橙侧光', props: ['渔网'] }
  ])
  assert.equal(areas.areas[0].id, 'dock')
  const acts = await projects.saveActs('项目结构B', [
    { id: 'act1', name: '第一幕·码头', purpose: '阿海回港', areaId: 'dock', cast: [{ name: '阿海', lookId: 'dock' }], titleCard: { text: '第一幕 归港' } },
    { id: 'act2', name: '第二幕·船长室', purpose: '与船长对峙', areaId: 'dock', cast: [{ name: '阿海', lookId: 'dock' }, { name: '老船长', lookId: 'captain' }] }
  ])
  assert.equal(acts.acts.length, 2)
  await projects.saveShots('项目结构B', {
    shots: [
      { id: 'Shot1', actId: 'act1', areaId: 'dock', cast: [{ name: '阿海', lookId: 'dock' }], shotType: '全景', movement: '固定', duration: 4, action: '阿海走上码头', purpose: '交代环境', environment: '黄昏，码头，暖橙侧光' },
      { id: 'Shot2', actId: 'act2', shotType: '中景', movement: '固定', duration: 4, action: '船长转身', purpose: '对峙', environment: '黄昏，码头，暖橙侧光' }
    ]
  })
  await projects.confirmPlan('项目结构B')
  const built = await projects.buildShotPrompt('项目结构B', 'Shot1', '')
  assert.ok(built.prompt.includes('【本幕 · 第一幕·码头】'))
  assert.ok(built.prompt.includes('报幕（幕标题卡）：第一幕 归港'))
  assert.ok(built.prompt.includes('【区域设定（同一区域所有镜头必须一致）】码头'))
  assert.ok(built.prompt.includes('标志物：系船柱、锈铁锚'))
  assert.ok(built.prompt.includes('阿海'))
  assert.ok(built.prompt.includes('本幕形象：服装：灰蓝外套'))
  assert.ok(!built.prompt.includes('老船长'))
  const shot2 = await projects.buildShotPrompt('项目结构B', 'Shot2', '')
  assert.ok(shot2.prompt.includes('老船长'))
  assert.ok(shot2.prompt.includes('区域设定'))
})


test('分镜拆分规则：固定机位 12 秒 + 多段动作要提示拆分', async () => {
  const { validateShotList } = await import('../server/projects.js')
  const shots = [{
    id: 'Shot1', shotType: '全景', movement: '固定', duration: 12,
    action: '0-2 秒：角色抱着玩偶站好；2-6 秒：举起玩偶吹泡泡；6-12 秒：玩偶张嘴放激光，最后角色举玩偶定格',
    environment: '白天，沙漠游戏地图，暖黄色调', purpose: '演示技能'
  }]
  const result = validateShotList(shots, [], {})
  const codes = result.warnings.map((item) => item.code)
  assert.ok(codes.includes('SHOT_TOO_LONG'), '应提示镜头偏长：' + codes.join(','))
  assert.ok(codes.includes('SHOT_STATIC_LONG'), '固定机位长镜头应提示拆分：' + codes.join(','))
  assert.ok(codes.includes('ACTION_MULTI_PHASE'), '多段动作应提示拆分：' + codes.join(','))
})

test('分镜拆分规则：短镜头单动作不误报', async () => {
  const { validateShotList } = await import('../server/projects.js')
  const shots = [{
    id: 'Shot1', shotType: '全景', movement: '固定', duration: 3,
    action: '角色抱着玩偶站在舞台中央，镜头固定',
    environment: '白天，沙漠游戏地图，暖黄色调', purpose: '交代环境'
  }]
  const result = validateShotList(shots, [], {})
  const codes = result.warnings.map((item) => item.code)
  assert.equal(codes.includes('SHOT_TOO_LONG'), false)
  assert.equal(codes.includes('SHOT_STATIC_LONG'), false)
  assert.equal(codes.includes('ACTION_MULTI_PHASE'), false)
})


test('镜头版本修改标记：addShotVersionNote 落盘 + getProject 返回 notes', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目N')
  const source = await writeSourceVideo(base, 'n.mp4', 'version-video')
  const saved = await projects.saveShotVersion('项目N', 'Shot1', { sourcePath: source })
  assert.equal(saved.version, 'V0.1')
  const note = await projects.addShotVersionNote('项目N', 'Shot1', 'V0.1', '分镜改第三版：镜头时长改为 4 秒')
  assert.equal(note.ok, true)
  assert.equal(note.version, 'V0.1')
  // 不存在的版本要报错
  await assert.rejects(() => projects.addShotVersionNote('项目N', 'Shot1', 'V0.9', 'x'), (error) => error.code === 'VERSION_NOT_FOUND')
  // 空标记要报错
  await assert.rejects(() => projects.addShotVersionNote('项目N', 'Shot1', 'V0.1', '  '), (error) => error.code === 'INVALID_NOTE')
  const detail = await projects.getProject('项目N')
  const shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.notes.length, 1)
  assert.equal(shot.notes[0].version, 'V0.1')
  assert.ok(shot.notes[0].note.includes('4 秒'))
  // 第二版标记独立（区别版本）
  await projects.saveShotVersion('项目N', 'Shot1', { sourcePath: source })
  await projects.addShotVersionNote('项目N', 'Shot1', 'V0.2', '第二版：换模型重抽')
  const detail2 = await projects.getProject('项目N')
  const shot2 = detail2.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot2.notes.filter((item) => item.version === 'V0.1').length, 1)
  assert.equal(shot2.notes.filter((item) => item.version === 'V0.2').length, 1)
})


test('采用版本：setAdoptedVersion 落盘 + getProject 返回', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目A1')
  const source = await writeSourceVideo(base, 'a1.mp4', 'v1')
  const saved = await projects.saveShotVersion('项目A1', 'Shot1', { sourcePath: source, kind: 'shot' })
  assert.equal(saved.kind, 'shot')
  assert.equal(saved.suspectedFull, false)
  const adopt = await projects.setAdoptedVersion('项目A1', 'Shot1', saved.version)
  assert.equal(adopt.adoptedVersion, saved.version)
  await assert.rejects(() => projects.setAdoptedVersion('项目A1', 'Shot1', 'V0.9'), (error) => error.code === 'VERSION_NOT_FOUND')
  const detail = await projects.getProject('项目A1')
  const shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.adoptedVersion, saved.version)
})

test('全片按采用版本校验：采用未验收版本 → 待验收；验收后 → 已验收', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目A2')
  await projects.saveShots('项目A2', { shots: [{ id: 'Shot1', shotType: '全景', movement: '固定', duration: 2, action: '角色站立', environment: '白天', purpose: '交代' }] })
  const source = await writeSourceVideo(base, 'a2.mp4', 'v1')
  const v1 = await projects.saveShotVersion('项目A2', 'Shot1', { sourcePath: source, kind: 'shot' })
  await projects.saveShotReview('项目A2', 'Shot1', { version: v1.version, pass: true })
  await projects.saveShotVersion('项目A2', 'Shot1', { sourcePath: source, kind: 'shot' })
  // 未指定采用：回退最新已验收版本（V0.1）→ 已验收
  const fallback = await projects.saveFullVideo('项目A2', { sourcePath: source })
  assert.equal(fallback.verified, true)
  assert.equal(fallback.meta.adoptedVersions.Shot1, v1.version)
  // 指定采用未验收的 V0.2 → 待验收
  await projects.setAdoptedVersion('项目A2', 'Shot1', 'V0.2')
  const pending = await projects.saveFullVideo('项目A2', { sourcePath: source })
  assert.equal(pending.verified, false)
  assert.ok(pending.pendingReview.join('；').includes('V0.2'))
  // 验收 V0.2 后 → 已验收且采用版本是 V0.2
  await projects.saveShotReview('项目A2', 'Shot1', { version: 'V0.2', pass: true })
  const verified = await projects.saveFullVideo('项目A2', { sourcePath: source })
  assert.equal(verified.verified, true)
  assert.equal(verified.meta.adoptedVersions.Shot1, 'V0.2')
})


test('面板验收：saveShotReview 通过后 clearShotReview 撤销（改回未验收）', async () => {
  const { base, projects } = await makeStore()
  await projects.createProject('项目R1')
  const source = await writeSourceVideo(base, 'r1.mp4', 'v')
  const saved = await projects.saveShotVersion('项目R1', 'Shot1', { sourcePath: source, kind: 'shot' })
  await projects.saveShotReview('项目R1', 'Shot1', { version: saved.version, pass: true, notes: '面板验收通过' })
  let detail = await projects.getProject('项目R1')
  let shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.reviews.some((r) => r.version === saved.version && r.pass === true), true)
  const cleared = await projects.clearShotReview('项目R1', 'Shot1', saved.version)
  assert.equal(cleared.removed, 1)
  detail = await projects.getProject('项目R1')
  shot = detail.video.shots.find((item) => item.id === 'Shot1')
  assert.equal(shot.reviews.some((r) => r.version === saved.version), false)
})
