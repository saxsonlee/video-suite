/**
 * store.js 单测：原子读写、记录归一化、路径安全、输入图片落盘、删除清理。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  RECORD_STATUSES, StoreError, createRecordId, isValidRecordId, safeFileSegment,
  sessionFileName, hashBuffer, parseDataUrl, normalizeRecord, createStore
} from '../server/store/index.js'

function newStore(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-store-'))
  const store = createStore({ root, ...options })
  store.init()
  return { root, store }
}

test('ID / 文件名安全', () => {
  const id = createRecordId(1700000000000, () => 0.5)
  assert.match(id, /^sd_[a-z0-9]+_[a-z0-9]+$/)
  assert.ok(isValidRecordId(id))
  assert.equal(isValidRecordId('../../etc/passwd'), false)
  const segment = safeFileSegment('../../x')
  assert.equal(segment.includes('..'), false, 'safeFileSegment 结果不能含 ..')
  assert.equal(/[\\/:*?"<>|]/.test(segment), false, 'safeFileSegment 结果不能含路径分隔符')
  assert.equal(safeFileSegment('a/b\\c:d*e'), 'a_b_c_d_e')
  assert.match(sessionFileName('session-abc_1.2'), /^session-abc_1\.2\.json$/)
  assert.notEqual(sessionFileName('a/b'), sessionFileName('a\\b'))
  assert.match(sessionFileName('a/b'), /\.json$/)
})

test('data URL 解析', () => {
  const parsed = parseDataUrl('data:image/png;base64,' + Buffer.from('hi').toString('base64'))
  assert.equal(parsed.mime, 'image/png')
  assert.equal(parsed.ext, 'png')
  assert.equal(parsed.buffer.toString(), 'hi')
  const textData = parseDataUrl('data:text/plain;base64,aGk=')
  assert.equal(textData.mime, 'text/plain')
  assert.equal(textData.ext, 'bin')
  assert.equal(textData.buffer.toString(), 'hi')
  assert.equal(parseDataUrl('not-a-data-url'), null)
})

test('记录归一化容错（旧字段/坏类型 → 默认值）', () => {
  const record = normalizeRecord({ id: 'bad-id', status: 'weird', prompt: 123, files: { video: '../x.mp4' } }, 'sess-1')
  assert.ok(isValidRecordId(record.id))
  assert.equal(record.sessionId, 'sess-1')
  assert.equal(record.status, 'queued')
  assert.equal(record.prompt, '')
  assert.equal(String(record.files.video || '').includes('..'), false, '非法媒体文件名不得保留路径穿越')
  assert.equal(String(record.files.video || '').includes('/'), false)
  const record2 = normalizeRecord({ id: 'sd_abc_123', status: 'succeeded', progress: 150, files: { video: 'sd_abc_123.mp4' } }, 's')
  assert.equal(record2.status, 'succeeded')
  assert.equal(record2.progress, 100)
  assert.equal(record2.files.video, 'sd_abc_123.mp4')
})

test('会话记录 CRUD + 原子落盘 + 新→旧排序', async () => {
  const { root, store } = newStore()
  const sessionId = 'session-test-1'
  assert.deepEqual(store.listRecords(sessionId), [])
  assert.equal(store.getRecord(sessionId, 'sd_x'), null)

  const id1 = createRecordId(1000, Math.random)
  const id2 = createRecordId(2000, Math.random)
  store.upsertRecord(sessionId, { id: id1, createdAt: 1000, status: 'queued', prompt: '第一条' })
  store.upsertRecord(sessionId, { id: id2, createdAt: 2000, status: 'running', prompt: '第二条' })
  let records = store.listRecords(sessionId)
  assert.equal(records.length, 2)
  assert.equal(records[0].id, id2, '新记录在前')
  assert.equal(records[0].sessionId, sessionId)

  store.patchRecord(sessionId, id2, { status: 'succeeded', progress: 100, files: { video: id2 + '.mp4' } })
  assert.equal(store.getRecord(sessionId, id2).status, 'succeeded')

  // 落盘文件存在且为数组；tmp 文件不残留
  const filePath = store.sessionPath(sessionId)
  assert.ok(fs.existsSync(filePath))
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  assert.ok(Array.isArray(parsed))
  assert.equal(parsed[0].id, id2)
  const leftovers = fs.readdirSync(store.sessionsDir).filter((name) => name.includes('.tmp-'))
  assert.deepEqual(leftovers, [])

  // 删除记录 + 媒体
  fs.writeFileSync(store.mediaPath(id2 + '.mp4'), 'bytes')
  assert.ok(store.recordFilePath(store.getRecord(sessionId, id2), 'video'))
  const removed = store.deleteRecord(sessionId, id2)
  assert.equal(removed.deleted, true)
  assert.deepEqual(removed.removedFiles, [id2 + '.mp4'])
  assert.equal(fs.existsSync(store.mediaPath(id2 + '.mp4')), false)
  assert.equal(store.listRecords(sessionId).length, 1)
  assert.equal(store.deleteRecord(sessionId, id2).deleted, false)
})

test('会话文件损坏时容忍（返回空列表）', () => {
  const { store } = newStore()
  const sessionId = 'sess-corrupt'
  fs.writeFileSync(store.sessionPath(sessionId), '{oops', 'utf8')
  assert.deepEqual(store.listRecords(sessionId), [])
})

test('媒体路径安全：拒绝路径穿越', () => {
  const { store } = newStore()
  assert.throws(() => store.mediaPath('../../x.mp4'), (error) => error instanceof StoreError)
  assert.throws(() => store.mediaPath('a/b.mp4'), StoreError)
  assert.throws(() => store.mediaPath('..'), StoreError)
  assert.throws(() => store.mediaName('bad-id', 'video'), StoreError)
  assert.equal(store.mediaName('sd_abc_123', 'video'), 'sd_abc_123.mp4')
  assert.equal(store.mediaName('sd_abc_123', 'lastFrame'), 'sd_abc_123-lastframe.jpg')
  assert.equal(store.mediaName('sd_abc_123', 'input', 2, 'png'), 'sd_abc_123-in2.png')
})

test('输入图片落盘：大 dataURL 不留在索引、生成哈希与文件', async () => {
  const { store } = newStore()
  const recordId = 'sd_test_1'
  const big = Buffer.alloc(400 * 1024, 7)
  const bigDataUrl = 'data:image/png;base64,' + big.toString('base64')
  const smallDataUrl = 'data:image/jpeg;base64,' + Buffer.from('small').toString('base64')
  const inputs = { images: [{ role: 'first_frame', dataUrl: bigDataUrl }, { role: 'reference_image', dataUrl: smallDataUrl }], video: null, audio: null }
  await store.persistInputMedia(recordId, inputs)
  assert.equal(inputs.images[0].file, recordId + '-in0.png')
  assert.ok(inputs.images[0].sha256)
  assert.equal(inputs.images[0].dataUrl, undefined, '大 dataURL 不留在索引')
  assert.ok(fs.existsSync(store.mediaPath(inputs.images[0].file)))
  assert.equal(inputs.images[1].dataUrl, smallDataUrl, '小 dataURL 可内联保留')
  const restored = await store.readInputImageDataUrl({ inputs }, 0)
  assert.ok(restored.startsWith('data:image/png;base64,'))
  assert.equal(Buffer.from(restored.split(',')[1], 'base64').length, big.length)
})

test('listSessions 扫描与 appendBootLog', () => {
  const { root, store } = newStore()
  store.upsertRecord('sess-a', { id: createRecordId(1), createdAt: 1 })
  store.upsertRecord('sess-b', { id: createRecordId(2), createdAt: 2 })
  const sessions = store.listSessions().map((item) => item.sessionId).sort()
  assert.deepEqual(sessions, ['sess-a', 'sess-b'])
  store.appendBootLog('hello')
  const log = fs.readFileSync(path.join(root, 'boot.log'), 'utf8')
  assert.match(log, /hello/)
})

test('copyMedia / writeMedia / recordFilePath', async () => {
  const { store } = newStore()
  const src = path.join(store.root, 'demo.mp4')
  fs.writeFileSync(src, 'demo-bytes')
  const copied = await store.copyMedia('sd_abc_123.mp4', src)
  assert.equal(copied.bytes, 10)
  assert.ok(store.mediaExists('sd_abc_123.mp4'))
  const record = { id: 'sd_abc_123', files: { video: 'sd_abc_123.mp4' } }
  assert.ok(store.recordFilePath(record, 'video'))
  assert.equal(store.recordFilePath(record, 'lastFrame'), null)
})
