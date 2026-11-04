// 全接口回归：用前端真实的 api() 函数（从 client/index.js 取出）按前端的调用方式逐个请求每个接口，
// 防止「前端发出的请求和后端要求的不一致」这类问题（例如 DELETE 不带 JSON 请求头被 415 拒绝）。
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { Store } from '../lib/store.js'
import { Ai } from '../lib/ai.js'
import { createHandler } from '../lib/api.js'

let server, origin, dir, api, routes
const PREFIX = '/adhd-workbench/api'

// 从前端源码里取出 api() 函数，在沙箱里运行，fetch 指向测试服务器
function loadClientApi(base) {
  const src = readFileSync(new URL('../client/index.js', import.meta.url), 'utf8')
  const start = src.indexOf('    async function api(')
  const end = src.indexOf('\n    }\n', start) + 6
  assert.ok(start > 0 && end > start, '在 client/index.js 里找不到 api()')
  const ctx = vm.createContext({ fetch: (u, o) => fetch(base + u, o), Error, JSON })
  vm.runInContext(`const API = '${PREFIX}';\n${src.slice(start, end)}\nthis.api = api`, ctx)
  return ctx.api
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'awb-routes-'))
  // 不接模型：所有 AI 接口走规则兜底，测试结果稳定
  const ai = new Ai({ getLlm: () => null, resolveRoute: () => null })
  const handler = createHandler({ store: new Store(dir), ai, dataDir: dir, liveStatus: () => undefined })
  server = createServer(handler)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${server.address().port}`
  api = loadClientApi(origin)
  routes = [...readFileSync(new URL('../lib/api.js', import.meta.url), 'utf8').matchAll(/^ {4}'(GET|POST|PATCH|PUT|DELETE) ([^']+)'/gm)].map((m) => `${m[1]} ${m[2]}`)
})
after(() => { server.close(); rmSync(dir, { recursive: true, force: true }) })

test('所有接口都能用前端的方式调通', async () => {
  const hit = new Set()
  const go = async (method, path, body, route) => { const r = await api(method, path, body); hit.add(route); return r }

  await go('GET', '/status', undefined, 'GET /status')
  await go('PATCH', '/profile', { workStart: '09:00', workEnd: '19:00', dailyWorkMinutes: 240 }, 'PATCH /profile')
  const { task } = await go('POST', '/tasks', { title: '接口测试任务', track: 'work', importance: 3, urgency: 3, estimateMin: 60 }, 'POST /tasks')
  const id = task.id
  await go('GET', '/tasks', undefined, 'GET /tasks')
  await go('GET', '/plan', undefined, 'GET /plan')
  await go('GET', '/calendar', undefined, 'GET /calendar')
  await go('PATCH', `/tasks/${id}`, { planDate: null, importance: 2 }, 'PATCH /tasks/:id')
  const split = await go('POST', `/tasks/${id}/split`, {}, 'POST /tasks/:id/split')
  assert.ok(split.task.steps.length > 0)
  const added = await go('POST', `/tasks/${id}/steps`, { title: '手动加的一步', estimateMin: 15 }, 'POST /tasks/:id/steps')
  const sid = added.task.steps.at(-1).id
  await go('PATCH', `/tasks/${id}/steps/${sid}`, { done: true, keepOpen: true }, 'PATCH /tasks/:id/steps/:sid')
  // 以下 DELETE 都和前端一样不带参数
  await go('DELETE', `/tasks/${id}/steps/${sid}`, undefined, 'DELETE /tasks/:id/steps/:sid')
  await go('POST', `/tasks/${id}/focus`, { action: 'start' }, 'POST /tasks/:id/focus')
  await go('POST', `/tasks/${id}/focus`, { action: 'interrupt' }, 'POST /tasks/:id/focus')
  await go('POST', `/tasks/${id}/focus`, { action: 'stop' }, 'POST /tasks/:id/focus')
  const noted = await go('POST', `/tasks/${id}/notes`, { kind: 'result', text: '覆盖率 40% → 75%' }, 'POST /tasks/:id/notes')
  await go('DELETE', `/tasks/${id}/notes/${noted.task.notes[0].id}`, undefined, 'DELETE /tasks/:id/notes/:nid')

  const { idea } = await go('POST', '/ideas', { text: '做一个 SEO 周报工具' }, 'POST /ideas')
  await go('GET', '/ideas', undefined, 'GET /ideas')
  const sp = await go('POST', '/ideas/split', { text: '1. 学 Rust\n2. 周末去科技馆' }, 'POST /ideas/split')
  assert.equal(sp.items.length, 2)
  await go('POST', '/ideas/batch', { items: sp.items, rawText: '1. 学 Rust\n2. 周末去科技馆' }, 'POST /ideas/batch')
  await go('PATCH', `/ideas/${idea.id}`, { starred: true }, 'PATCH /ideas/:id')
  await go('DELETE', `/ideas/${idea.id}`, undefined, 'DELETE /ideas/:id')

  await go('POST', '/coach', { message: '我想把内链做好' }, 'POST /coach')
  await go('GET', '/coach/log', undefined, 'GET /coach/log')
  await go('POST', '/intake/parse', { text: '明天下班前把方案发给老板' }, 'POST /intake/parse')
  await go('POST', '/intake/answer', { field: 'importance', text: '很重要' }, 'POST /intake/answer')

  // 来源设成空列表，避免读本机真实的 Agent 数据
  await go('PUT', '/sources', { sources: [] }, 'PUT /sources')
  await go('GET', '/sources', undefined, 'GET /sources')
  await go('GET', '/workspaces', undefined, 'GET /workspaces')
  await go('GET', '/stats', undefined, 'GET /stats')
  await go('POST', '/report', { sinceDays: 7, title: '测试周报' }, 'POST /report')
  await go('POST', '/sources/reset', undefined, 'POST /sources/reset')
  await go('PUT', '/sources', { sources: [] }, 'PUT /sources')

  await go('DELETE', `/tasks/${id}`, undefined, 'DELETE /tasks/:id')
  assert.equal((await api('GET', '/tasks')).tasks.some((t) => t.id === id), false, '任务已删除')

  const missed = routes.filter((r) => !hit.has(r))
  assert.deepEqual(missed, [], `这些接口没有测到：${missed.join('、')}`)
})

test('写接口的防护：跨站请求和非 JSON 请求被拒绝，DELETE 不带请求体也可以', async () => {
  const { task } = await api('POST', '/tasks', { title: '防护测试' })
  const raw = (method, path, headers, body) => fetch(origin + PREFIX + path, { method, headers, body })
  // 表单提交（跨站网页能发出的简单请求）
  assert.equal((await raw('POST', '/tasks', { 'content-type': 'text/plain' }, '{"title":"x"}')).status, 415)
  assert.equal((await raw('POST', '/tasks', { 'content-type': 'application/x-www-form-urlencoded' }, 'title=x')).status, 415)
  // 带了请求体但不是 JSON 请求头的 DELETE 也拒绝
  assert.equal((await raw('DELETE', `/tasks/${task.id}`, { 'content-type': 'text/plain' }, '{}')).status, 415)
  // 来自别的网站
  assert.equal((await raw('POST', '/tasks', { 'content-type': 'application/json', origin: 'https://evil.example' }, '{"title":"x"}')).status, 403)
  assert.equal((await raw('DELETE', `/tasks/${task.id}`, { origin: 'https://evil.example' })).status, 403)
  // DSH Desktop 代理去掉了 Origin 的 DELETE、没有请求体：放行
  assert.equal((await raw('DELETE', `/tasks/${task.id}`, {})).status, 200)
  assert.equal((await raw('DELETE', `/tasks/${task.id}`, {})).status, 404, '已删除后再删返回 404')
})
