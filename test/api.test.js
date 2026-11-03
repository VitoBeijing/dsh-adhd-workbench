import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../lib/store.js'
import { Ai, extractJson, ruleCoach, ruleSplitIdeas } from '../lib/ai.js'
import { createHandler, sameOrigin } from '../lib/api.js'
import { computeStats, buildPlan, adjustCapacity } from '../lib/planner.js'

let server, base, dir
const fakeLlm = {
  async *stream({ system }) {
    if (system.includes('互不相关')) yield { type: 'text-delta', text: '{"items":[{"text":"做 SEO 周报自动生成工具","raw":"做一个 SEO 周报自动生成工具","category":"work","subcategory":"SEO","tags":["自动化"],"nextAction":"列出周报字段"},{"text":"周末带孩子去科技馆","raw":"周末带孩子去科技馆","category":"life","subcategory":"亲子"},{"text":"学 Rust 的所有权","raw":"学一下 Rust 的所有权","category":"personal","subcategory":"编程学习"}]}' }
    else if (system.includes('录入助手')) yield { type: 'text-delta', text: '{"title":"把内链方案发给老板","track":"work","estimateMin":null,"importance":null,"urgency":3,"due":null}' }
    else if (system.includes('根据字段名')) yield { type: 'text-delta', text: '{"value":2}' }
    else if (system.includes('拆解')) yield { type: 'text-delta', text: '好的```json\n{"steps":[{"title":"打开文档写标题","estimateMin":5},{"title":"写初稿","estimateMin":20}],"reportPoint":"完成初稿"}\n```' }
    else if (system.includes('教练')) yield { type: 'text-delta', text: '{"clarity":"low","rewrite":"整理 SEO 内链方案","missing":["交付物"],"questions":["要交付什么？"],"paper":true,"paperPrompt":"画三个框","encourage":"慢慢来","task":{"title":"整理 SEO 内链方案","track":"work","estimateMin":45,"importance":3,"urgency":2}}' }
    else if (system.includes('灵感')) yield { type: 'text-delta', text: '{"category":"work","subcategory":"产品点子","tags":["SEO"],"nextAction":"写一页说明"}' }
    else yield { type: 'text-delta', text: '{"title":"周报","subtitle":"x","slides":[{"title":"完成","bullets":["<b>A</b>"]}]}' }
  },
}

async function call(method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: base }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json()
  if (!res.ok) throw Object.assign(new Error(json.error), { status: res.status })
  return json
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'adhd-wb-'))
  const ai = new Ai({ getLlm: () => fakeLlm, resolveRoute: () => ({ provider: 'p', model: 'm' }) })
  const handler = createHandler({ store: new Store(dir), ai, dataDir: dir, liveStatus: () => undefined })
  server = createServer(handler)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/adhd-workbench/api`
})
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }) })

test('task lifecycle: create → split → focus → steps → done → report', async () => {
  const titles = ['写季度汇报', '修复内链 bug', '读一章书', '回复邮件', '准备评审']
  const ids = []
  for (const [i, title] of titles.entries()) ids.push((await call('POST', '/tasks', { title, track: i === 2 ? 'growth' : 'work', importance: 3 - (i % 3), estimateMin: i === 3 ? 10 : 40 })).task.id)
  const plan = await call('GET', '/plan')
  assert.equal(plan.must.length, 3)
  if (plan.workday) assert.ok(plan.must.some((t) => t.track === 'growth'), '工作日必做里至少一个成长任务')
  assert.ok(plan.small.some((t) => t.title === '回复邮件'))
  const split = await call('POST', `/tasks/${ids[0]}/split`, {})
  assert.equal(split.source, 'ai'); assert.equal(split.task.steps.length, 2); assert.equal(split.task.reportPoint, '完成初稿')
  await call('POST', `/tasks/${ids[0]}/focus`, { action: 'start' })
  await call('POST', `/tasks/${ids[0]}/focus`, { action: 'interrupt' })
  const p2 = await call('GET', '/plan')
  assert.equal(p2.active.taskId, ids[0])
  for (const s of split.task.steps) await call('PATCH', `/tasks/${ids[0]}/steps/${s.id}`, { done: true })
  const t = (await call('GET', '/tasks')).tasks.find((x) => x.id === ids[0])
  assert.equal(t.status, 'done')
  await call('POST', `/tasks/${ids[0]}/notes`, { kind: 'approach', text: '用模板复用' })
  const rep = await call('POST', '/report', { sinceDays: 7 })
  assert.ok(existsSync(rep.mdPath) && existsSync(rep.htmlPath))
  assert.match(readFileSync(rep.htmlPath, 'utf8'), /&lt;b&gt;A&lt;\/b&gt;/, 'HTML 必须转义')
  assert.match(rep.markdown, /# 周报/)
})

test('ideas get AI category and can become tasks', async () => {
  const { idea } = await call('POST', '/ideas', { text: '给 SEO 后台加一个内链健康度面板' })
  assert.equal(idea.category, 'work'); assert.equal(idea.subcategory, '产品点子')
  const { task } = await call('POST', '/tasks', { title: idea.text, fromIdea: idea.id })
  assert.equal((await call('GET', '/ideas')).ideas[0].taskId, task.id)
})

test('coach returns paper prompt; rule fallback detects vague text', async () => {
  const r = await call('POST', '/coach', { message: '感觉 SEO 这块有点乱，想优化一下' })
  assert.equal(r.paper, true); assert.equal(r.task.importance, 3)
  const rule = ruleCoach('感觉有点乱，不知道怎么搞')
  assert.equal(rule.clarity, 'low'); assert.equal(rule.paper, true)
  assert.equal(ruleCoach('今天下午3点前写完并提交内链修复 PR').clarity, 'high')
})

test('intake: AI 草稿保留没说的字段为 null；回答先走规则再走模型', async () => {
  const { draft } = await call('POST', '/intake/parse', { text: '明天把内链方案发给老板，挺急的' })
  assert.equal(draft.source, 'ai'); assert.equal(draft.urgency, 3)
  assert.equal(draft.importance, 3, '模型没填时用规则识别「老板」')
  assert.match(draft.due, /^\d{4}-\d{2}-\d{2}$/, '模型没填 due 时用规则识别「明天」')
  assert.deepEqual(await call('POST', '/intake/answer', { field: 'due', text: '没有截止' }), { value: 'none', source: 'rule' })
  assert.deepEqual(await call('POST', '/intake/answer', { field: 'importance', text: '嗯…还算得上吧' }), { value: 2, source: 'ai' })
  await assert.rejects(call('POST', '/intake/answer', { field: 'title', text: 'x' }), /field/)
})

test('sources: 默认自动检测，可保存、校验、恢复', async () => {
  const { sources, types } = await call('GET', '/sources')
  assert.deepEqual(types.map((t) => t.type), ['dsh', 'codex', 'claude', 'opencode', 'workbuddy'])
  assert.equal(sources.length, 5)
  const saved = await call('PUT', '/sources', { sources: [{ type: 'claude', label: '我的 Claude', path: dir, enabled: true }] })
  assert.equal(saved.sources[0].label, '我的 Claude')
  const ws = await call('GET', '/workspaces')
  assert.equal(ws.sources.length, 1); assert.equal(ws.sources[0].ok, false, '目录里没有 projects 时报错而不是崩溃')
  await assert.rejects(call('PUT', '/sources', { sources: [{ type: 'x' }] }), /类型无效/)
  assert.equal((await call('POST', '/sources/reset', {})).sources.length, 5)
})

test('ideas: 一段话拆成多条预览 → 批量入库 → 重新拆分替换旧条目', async () => {
  const raw = '1. 做一个 SEO 周报自动生成工具 2. 周末带孩子去科技馆 3. 学一下 Rust 的所有权'
  const before = (await call('GET', '/ideas')).ideas.length
  const pv = await call('POST', '/ideas/split', { text: raw })
  assert.equal(pv.source, 'ai')
  assert.deepEqual(pv.items.map((i) => i.category), ['work', 'life', 'personal'])
  assert.equal((await call('GET', '/ideas')).ideas.length, before, '预览不保存')
  const saved = await call('POST', '/ideas/batch', { items: pv.items, rawText: raw })
  assert.equal(saved.ideas.length, 3)
  assert.equal(saved.ideas[2].rawText, '学一下 Rust 的所有权'); assert.equal(saved.ideas[0].fullText, raw)
  // 旧的大段灵感 → 重新拆分替换
  const { idea: old } = await call('POST', '/ideas', { text: raw })
  await call('PATCH', `/ideas/${old.id}`, { starred: true })
  const rep = await call('POST', '/ideas/batch', { items: pv.items.slice(0, 2), rawText: raw, replaceId: old.id })
  assert.equal(rep.replaced, old.id)
  const all = (await call('GET', '/ideas')).ideas
  assert.ok(!all.some((i) => i.id === old.id), '原来那条被替换掉')
  assert.ok(rep.ideas.every((i) => i.starred && i.createdAt <= old.createdAt), '保留星标和创建时间')
  assert.equal(all.length, before + 3 + 2)
  await assert.rejects(call('POST', '/ideas/batch', { items: [] }), /不能为空/)
  await assert.rejects(call('POST', '/ideas/batch', { items: [{ text: 'x' }], replaceId: 'nope' }), /不存在/)
})

test('ruleSplitIdeas: 编号、换行、连接词都能拆开', () => {
  const a = ruleSplitIdeas('1. 做一个 SEO 周报自动生成工具 2. 周末带孩子去科技馆 3. 学一下 Rust 的所有权').items
  assert.deepEqual(a.map((i) => i.text), ['做一个 SEO 周报自动生成工具', '周末带孩子去科技馆', '学一下 Rust 的所有权'])
  assert.deepEqual(a.map((i) => i.category), ['work', 'life', 'personal'])
  const b = ruleSplitIdeas('想给详情页加个对比功能，还有周末想去爬山，另外最近想读《原则》').items
  assert.equal(b.length, 3, JSON.stringify(b.map((i) => i.text)))
  assert.equal(ruleSplitIdeas('①买菜\n②交电费；③写周报').items.length, 3)
  assert.equal(ruleSplitIdeas('只有一件事').items.length, 1)
})

test('rejects cross-origin writes', async () => {
  const res = await fetch(base + '/tasks', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.com' }, body: '{"title":"x"}' })
  assert.equal(res.status, 403)
})

test('sameOrigin：兼容 Desktop 代理去掉 Origin/Host，仍拒绝跨站与 rebinding', () => {
  const r = (headers) => sameOrigin({ headers })
  assert.equal(r({}), true, 'Desktop 代理去掉了 Origin 和 Host')
  assert.equal(r({ host: '127.0.0.1:61715' }), true, '只去掉 Origin')
  assert.equal(r({ host: '127.0.0.1:61715', origin: 'http://127.0.0.1:61715' }), true)
  assert.equal(r({ host: '127.0.0.1:61715', origin: 'http://127.0.0.1' }), true, 'Chrome 省略回环端口')
  assert.equal(r({ host: '127.0.0.1:61715', origin: 'http://evil.com' }), false)
  assert.equal(r({ host: 'evil.com', origin: 'http://evil.com' }), false, 'DNS rebinding')
  assert.equal(r({ host: '127.0.0.1:61715', origin: 'null' }), false)
  assert.equal(r({ host: '127.0.0.1:61715', 'sec-fetch-site': 'cross-site' }), false)
})

test('falls back to rules when model is unavailable', async () => {
  const ai = new Ai({ getLlm: () => null, resolveRoute: () => null })
  const out = await ai.split({ title: 'x', estimateMin: 30 })
  assert.equal(out.source, 'rule'); assert.ok(out.steps.length >= 3)
})

test('extractJson handles prose, fences and nested braces', () => {
  assert.deepEqual(extractJson('前言 {"a":{"b":"}"}} 后记'), { a: { b: '}' } })
})

test('learning: speed factor, focus length, capacity', () => {
  const now = new Date('2026-11-02T15:00:00').getTime()
  const mk = (est, act, h) => ({ id: String(Math.random()), title: 't', track: 'work', status: 'done', estimateMin: est, completedAt: now, mustDays: ['2026-11-02'], sessions: [{ start: new Date(`2026-11-02T${h}:00:00`).getTime(), end: new Date(`2026-11-02T${h}:00:00`).getTime() + act * 60000 }] })
  const data = { tasks: [mk(20, 40, '10'), mk(30, 60, '10'), mk(10, 20, '14')], ideas: [], coachLog: [], profile: { dailyWorkMinutes: 200, dailyGrowthMinutes: 40, lastCapacityReview: null, workStart: '09:30', workEnd: '18:30' } }
  const s = computeStats(data, now)
  assert.equal(s.speedFactor, 2); assert.equal(s.focusMinutes, 40); assert.deepEqual(s.peakHours, [10, 14]); assert.equal(s.completionRate, 1)
  const first = adjustCapacity(data.profile, s, now)
  assert.equal(first.profile.dailyWorkMinutes, 200, '首次只记录起点')
  const { profile } = adjustCapacity(first.profile, s, now + 7 * 86400000)
  assert.equal(profile.dailyWorkMinutes, 220)
  data.tasks.push({ id: 'x', title: '新任务', track: 'work', status: 'todo', estimateMin: 30, createdAt: now })
  assert.equal(buildPlan(data, now).must[0].adjustedEstimate, 60, '预估按速度系数 2 修正')
})
