import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../lib/store.js'
import { Ai } from '../lib/ai.js'
import { createHandler } from '../lib/api.js'
import { buildCalendar, buildPlan, weekStart, addDays, dateKey } from '../lib/planner.js'

// 2026-11-04 周三 10:00（本地时间）
const NOW = new Date('2026-11-04T10:00:00').getTime()
const task = (o) => ({ id: o.title, status: 'todo', track: 'work', importance: 2, urgency: 2, estimateMin: 60, steps: [], sessions: [], notes: [], createdAt: NOW - 86400000, ...o })

test('weekStart / addDays：周一为一周第一天，跨月正确', () => {
  assert.equal(weekStart('2026-11-04'), '2026-11-02')
  assert.equal(weekStart('2026-11-02'), '2026-11-02')
  assert.equal(weekStart('2026-11-08'), '2026-11-02', '周日属于前一周')
  assert.equal(addDays('2026-10-30', 3), '2026-11-02')
})

test('buildCalendar：计划日、截止日、完成项、专注时长、未安排', () => {
  const data = {
    tasks: [
      task({ title: '计划周四', planDate: '2026-11-05', due: '2026-11-07' }),
      task({ title: '只有截止', due: '2026-11-06' }),
      task({ title: '拖欠', planDate: '2026-11-03' }),
      task({ title: '没安排' }),
      task({ title: '已放下', planDate: '2026-11-05', status: 'dropped' }),
      task({ title: '周一完成', status: 'done', planDate: '2026-11-01', completedAt: new Date('2026-11-02T15:00:00').getTime(),
        sessions: [{ start: new Date('2026-11-02T14:00:00').getTime(), end: new Date('2026-11-02T14:40:00').getTime() }] }),
    ],
  }
  const cal = buildCalendar(data, '2026-11-02', '2026-11-08', NOW)
  const day = (k) => cal.days.find((d) => d.date === k)
  assert.equal(cal.days.length, 7)
  assert.deepEqual(day('2026-11-05').tasks.map((x) => x.task.title), ['计划周四'], '已放下的不显示')
  assert.equal(day('2026-11-06').tasks[0].task.title, '只有截止'); assert.equal(day('2026-11-06').tasks[0].byDue, true)
  assert.deepEqual(day('2026-11-07').dues.map((t) => t.title), ['计划周四'], '截止当天另外标出')
  assert.equal(day('2026-11-03').tasks[0].overdue, true)
  assert.deepEqual(day('2026-11-02').done.map((t) => t.title), ['周一完成'], '完成项按完成那天显示')
  assert.equal(day('2026-11-02').focusMin, 40)
  assert.deepEqual(cal.unscheduled.map((t) => t.title), ['没安排'])
})

test('buildPlan：计划今天和拖欠的进必做，安排在以后的不进', () => {
  const data = {
    profile: { workStart: '09:00', workEnd: '19:00', dailyWorkMinutes: 300, dailyGrowthMinutes: 45 },
    tasks: [
      task({ title: '很重要但没安排', importance: 3, urgency: 3, due: '2026-11-04' }),
      task({ title: '很重要但排在下周', importance: 3, urgency: 3, planDate: '2026-11-10' }),
      task({ title: '计划今天', importance: 1, urgency: 1, planDate: '2026-11-04' }),
      task({ title: '拖欠', importance: 1, urgency: 1, planDate: '2026-11-02' }),
      task({ title: '计划今天的小事', importance: 1, urgency: 1, estimateMin: 10, planDate: '2026-11-04' }),
    ],
  }
  const plan = buildPlan(data, NOW)
  const must = plan.must.map((t) => t.title)
  assert.equal(must[0], '拖欠', '拖欠排最前')
  assert.ok(must.includes('计划今天'))
  assert.ok(must.includes('计划今天的小事'), '计划在今天的小任务也进必做')
  assert.ok(!must.includes('很重要但排在下周'))
  assert.ok(!plan.small.some((t) => t.title === '很重要但排在下周'))
  assert.ok(plan.backlog.some((t) => t.title === '很重要但排在下周'), '以后的任务留在任务池')
})

test('API：planDate 读写、换一个改到明天、提为必做改到今天、GET /calendar', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'awb-cal-'))
  const handler = createHandler({ store: new Store(dir), ai: new Ai({ getLlm: () => null, resolveRoute: () => null }), dataDir: dir })
  const { createServer } = await import('node:http')
  const server = createServer(handler); await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}/adhd-workbench/api`
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json(); if (!r.ok) throw new Error(j.error); return j
  }
  try {
    const today = dateKey(), tomorrow = addDays(today, 1)
    const { task: a } = await call('POST', '/tasks', { title: '安排在明天', planDate: tomorrow })
    assert.equal(a.planDate, tomorrow)
    const { task: b } = await call('PATCH', `/tasks/${a.id}`, { planDate: today })
    assert.equal(b.planDate, today)
    assert.equal((await call('PATCH', `/tasks/${a.id}`, { snoozeDate: true })).task.planDate, tomorrow, '换一个 → 明天')
    assert.equal((await call('PATCH', `/tasks/${a.id}`, { pinnedDate: true })).task.planDate, today, '提为必做 → 今天')
    assert.equal((await call('PATCH', `/tasks/${a.id}`, { planDate: null })).task.planDate, null)
    await call('PATCH', `/tasks/${a.id}`, { planDate: tomorrow, due: addDays(today, 3) })
    const cal = await call('GET', `/calendar?from=${today}&to=${addDays(today, 6)}`)
    assert.equal(cal.days.length, 7)
    assert.equal(cal.days[1].tasks[0].task.title, '安排在明天')
    assert.equal(cal.days[3].dues[0].title, '安排在明天')
    const def = await call('GET', '/calendar')
    assert.equal(def.from, weekStart(today)); assert.equal(def.days.length, 7)
    await assert.rejects(call('GET', `/calendar?from=${today}&to=${addDays(today, -1)}`), /不能早于/)
  } finally { server.close(); rmSync(dir, { recursive: true, force: true }) }
})
