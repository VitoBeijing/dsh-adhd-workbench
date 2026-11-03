import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDue, parseImportance, parseUrgency, parseEstimate, ruleIntake, mergeIntake } from '../lib/intake.js'
import { Ai } from '../lib/ai.js'
import { sanitizeSources, readClaude, readSources } from '../lib/agents.js'

// 2026-11-02 是周一
const NOW = new Date(2026, 10, 2, 10, 0)

test('parseDue: 中文相对日期和具体日期', () => {
  assert.equal(parseDue('今天下班前', NOW), '2026-11-02')
  assert.equal(parseDue('明天', NOW), '2026-11-03')
  assert.equal(parseDue('后天', NOW), '2026-11-04')
  assert.equal(parseDue('周三', NOW), '2026-11-04')
  assert.equal(parseDue('本周五', NOW), '2026-11-06')
  assert.equal(parseDue('下周一', NOW), '2026-11-09')
  assert.equal(parseDue('下周三', NOW), '2026-11-11')
  assert.equal(parseDue('11月20日', NOW), '2026-11-20')
  assert.equal(parseDue('1月5号', NOW), '2027-01-05', '已过的月份算明年')
  assert.equal(parseDue('3天内', NOW), '2026-11-05')
  assert.equal(parseDue('月底', NOW), '2026-11-30')
  assert.equal(parseDue('没有截止', NOW), 'none')
  assert.equal(parseDue('随便吧哈哈', NOW), null)
})

test('重要 / 紧急关键词', () => {
  assert.equal(parseImportance('这个很重要'), 3)
  assert.equal(parseImportance('一般'), 1)
  assert.equal(parseImportance('重要'), 2)
  assert.equal(parseImportance('写周报'), null)
  assert.equal(parseUrgency('不急'), 1)
  assert.equal(parseUrgency('挺急的'), 3)
  assert.equal(parseUrgency('这周内'), 2)
})

test('ruleIntake 提取字段并清理标题；mergeIntake 不让模型丢掉规则识别出的值', () => {
  const r = ruleIntake('明天下班前把内链方案发给老板，挺急的', NOW)
  assert.equal(r.due, '2026-11-03')
  assert.equal(r.urgency, 3)
  assert.equal(r.importance, 3, '提到老板视为很重要')
  assert.ok(!/明天|急/.test(r.title), r.title)
  const m = mergeIntake({ title: '发内链方案', track: 'work', importance: null, urgency: null, due: 'bad' }, r)
  assert.equal(m.urgency, 3); assert.equal(m.due, '2026-11-03'); assert.equal(m.title, '发内链方案')
})

test('时长识别与标题清理', () => {
  assert.equal(parseEstimate('大概一个半小时'), 90)
  assert.equal(parseEstimate('1.5小时'), 90)
  assert.equal(parseEstimate('2个半小时'), 150)
  assert.equal(parseEstimate('半小时'), 30)
  assert.equal(parseEstimate('45分钟'), 45)
  const r = ruleIntake('改一下详情页那个 bug，大概一个半小时', NOW)
  assert.equal(r.estimateMin, 90); assert.equal(r.title, '改一下详情页那个 bug')
})

test('模型不响应 abort 时硬性超时，回退到规则', async () => {
  const hang = { stream: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }) }) }
  const ai = new Ai({ getLlm: () => hang, resolveRoute: () => ({ provider: 'p', model: 'm' }) })
  const t = Date.now()
  const out = await ai.json('s', 'u', () => ({ ok: 1 }), { timeoutMs: 200 })
  assert.equal(out.source, 'rule'); assert.ok(Date.now() - t < 2000)
})

test('sanitizeSources 校验类型和路径', () => {
  const s = sanitizeSources([{ type: 'codex', path: '~/.codex2', label: 'Codex 2' }, { type: 'codex', id: 'codex-0' }])
  assert.equal(s.length, 2); assert.ok(s[0].path.endsWith('.codex2') && s[0].path.startsWith('/'))
  assert.notEqual(s[0].id, s[1].id, 'id 去重')
  assert.throws(() => sanitizeSources([{ type: 'qq' }]), /类型无效/)
  assert.throws(() => sanitizeSources([{ type: 'dsh', path: 'relative/dir' }]), /绝对路径/)
})

test('readClaude 按项目分组、取最近 2 个会话和上下文用量', () => {
  const home = mkdtempSync(join(tmpdir(), 'awb-claude-'))
  try {
    const proj = join(home, 'projects', '-tmp-demo'); mkdirSync(proj, { recursive: true })
    const line = (o) => JSON.stringify(o)
    for (const [i, used] of [[1, 50000], [2, 100000], [3, 150000]]) {
      writeFileSync(join(proj, `s${used}.jsonl`), [
        line({ type: 'user', cwd: '/tmp/demo', message: { role: 'user', content: `第 ${i} 个问题` } }),
        line({ type: 'ai-title', aiTitle: `会话 ${i}` }),
        line({ type: 'assistant', message: { model: 'claude-x', usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: used } } }),
      ].join('\n'))
    }
    const r = readClaude({ path: home, perWorkspace: 2 })
    assert.equal(r.ok, true); assert.equal(r.workspaces.length, 1)
    const w = r.workspaces[0]
    assert.equal(w.title, 'demo'); assert.equal(w.total, 3); assert.equal(w.sessions.length, 2)
    assert.ok(w.sessions.every((s) => s.contextWindow === 200000 && s.contextPct > 0 && s.title.startsWith('会话')))
    // 来源出错不影响其他来源
    const all = readSources([{ id: 'a', type: 'claude', label: 'A', path: home, enabled: true }, { id: 'b', type: 'workbuddy', label: 'B', path: join(home, 'nope'), enabled: true }, { id: 'c', type: 'claude', label: 'C', path: home, enabled: false }])
    assert.deepEqual(all.map((s) => [s.id, s.ok]), [['a', true], ['b', false]])
  } finally { rmSync(home, { recursive: true, force: true }) }
})
