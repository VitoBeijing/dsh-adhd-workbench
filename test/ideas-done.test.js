// 灵感的完成状态由任务推导：转任务后任务完成，灵感自动归入已完成；撤销完成自动恢复。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Store } from '../lib/store.js'
import { Ai } from '../lib/ai.js'
import { createHandler } from '../lib/api.js'

let server, base, dir
before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'awb-ideas-done-'))
  const handler = createHandler({ store: new Store(dir), ai: new Ai({ getLlm: () => null, resolveRoute: () => null }), dataDir: dir })
  server = createServer(handler)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}/adhd-workbench/api`
})
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }) })

const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error)
  return j
}

test('灵感完成状态跟随任务：完成 → 归入已完成；撤销 → 恢复；删任务 → 不算完成', async () => {
  // 建一条灵感并转成任务（带 fromIdea 建立关联）
  const { idea } = await call('POST', '/ideas', { text: '做一个周报自动生成工具', skipAi: true, category: 'work', subcategory: '自动化' })
  const { task } = await call('POST', '/tasks', { title: '做一个周报自动生成工具', track: 'work', fromIdea: idea.id })

  // 1) 任务未完成：灵感 done=false，taskStatus=doing
  let { ideas } = await call('GET', '/ideas')
  let it = ideas.find((i) => i.id === idea.id)
  assert.equal(it.done, false)
  assert.equal(it.taskStatus, 'doing')
  assert.equal(it.completedAt, null)

  // 2) 任务完成：灵感 done=true，completedAt = 任务的完成时间
  const beforeDone = Date.now()
  await call('PATCH', `/tasks/${task.id}`, { status: 'done' })
  ;({ ideas } = await call('GET', '/ideas'))
  it = ideas.find((i) => i.id === idea.id)
  assert.equal(it.done, true)
  assert.equal(it.taskStatus, 'done')
  assert.ok(it.completedAt >= beforeDone, 'completedAt 取任务完成时间')

  // 3) 撤销任务完成：灵感自动恢复为未完成
  await call('PATCH', `/tasks/${task.id}`, { status: 'todo' })
  ;({ ideas } = await call('GET', '/ideas'))
  it = ideas.find((i) => i.id === idea.id)
  assert.equal(it.done, false)
  assert.equal(it.taskStatus, 'doing')

  // 4) 删除任务：灵感不算完成，标记 taskStatus=deleted（保留「已转任务」历史）
  await call('DELETE', `/tasks/${task.id}`)
  ;({ ideas } = await call('GET', '/ideas'))
  it = ideas.find((i) => i.id === idea.id)
  assert.equal(it.done, false)
  assert.equal(it.taskStatus, 'deleted')

  // 5) 没有转任务的灵感：taskStatus 为 null，不算完成
  const other = ideas.find((i) => i.id !== idea.id) ?? null
  if (other) { assert.equal(other.taskStatus, null); assert.equal(other.done, false) }
})
