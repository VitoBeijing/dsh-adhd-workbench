// HTTP API（前缀 /adhd-workbench/api）。写操作需同源 + JSON。
import { AGENT_TYPES, defaultSources, sanitizeSources, readSources } from './agents.js'
import { buildPlan, buildCalendar, computeStats, insights, adjustCapacity, actualMinutes, dateKey, weekStart, addDays, DAY_MS } from './planner.js'
import { newId } from './store.js'
import { writeReport } from './report.js'

const PREFIX = '/adhd-workbench/api'
const TRACKS = ['work', 'growth', 'life']
const IDEA_CATS = ['personal', 'work', 'life']

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function readBody(req, max = 256 * 1024) {
  const chunks = []; let total = 0
  for await (const c of req) { total += c.length; if (total > max) throw bad('请求体过大'); chunks.push(c) }
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw bad('JSON 无效') }
}
const bad = (message, status = 400) => Object.assign(new Error(message), { status })
function guard(req, body) {
  const ct = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
  if (ct !== 'application/json') throw bad('请求必须为 application/json', 415)
  if (!sameOrigin(req)) throw bad('跨站请求已拒绝', 403)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('请求体必须是 JSON 对象')
}

const isLoopback = (hostname) => ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(String(hostname).toLowerCase())
const hostnameOf = (host) => { try { return new URL(`http://${host}`).hostname } catch { return null } }

/**
 * 同源校验（与 dsh-market 的规则一致）：
 * - DSH Desktop 自带的代理会去掉 Origin / Host 再转发，所以没有 Origin 时放行——浏览器发 POST 一定带 Origin，没有说明请求不是网页发的；
 * - 有 Host 时必须是本机回环地址，防 DNS rebinding；
 * - 浏览器标明 cross-site 的直接拒绝；
 * - 有 Origin 时必须与 Host 一致；Chrome 新版对回环地址的 Origin 会省略端口，主机名一致也算同源。
 */
export function sameOrigin(req) {
  const host = req.headers.host
  if (host !== undefined && !isLoopback(hostnameOf(host))) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const o = new URL(origin)
    if (o.host === host) return true
    return o.port === '' && host !== undefined && o.hostname === hostnameOf(host)
  } catch { return false } // Origin: null 或空字符串
}
const str = (v, name, max = 2000, required = true) => {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${name} 不能为空`); return undefined }
  if (typeof v !== 'string') throw bad(`${name} 必须是字符串`)
  return v.trim().slice(0, max)
}
const int = (v, lo, hi, def) => (v === undefined || v === null || v === '' ? def : Math.min(hi, Math.max(lo, Math.round(Number(v)) || def)))
const pick = (v, list, def) => (list.includes(v) ? v : def)

function sanitizeTaskPatch(b, partial) {
  const t = {}
  if (!partial || 'title' in b) t.title = str(b.title, '任务标题', 200)
  if ('detail' in b) t.detail = str(b.detail, '说明', 4000, false) ?? ''
  if (!partial || 'track' in b) t.track = pick(b.track, TRACKS, 'work')
  if (!partial || 'importance' in b) t.importance = int(b.importance, 1, 3, 2)
  if (!partial || 'urgency' in b) t.urgency = int(b.urgency, 1, 3, 2)
  if (!partial || 'estimateMin' in b) t.estimateMin = int(b.estimateMin, 5, 600, 30)
  if ('due' in b) t.due = /^\d{4}-\d{2}-\d{2}$/.test(b.due ?? '') ? b.due : null
  if ('project' in b) t.project = str(b.project, '项目', 120, false) ?? ''
  if ('status' in b) t.status = pick(b.status, ['todo', 'doing', 'done', 'dropped'], 'todo')
  if ('planDate' in b) { t.planDate = /^\d{4}-\d{2}-\d{2}$/.test(b.planDate ?? '') ? b.planDate : null; if (t.planDate === dateKey()) t.snoozeDate = null }
  // 兼容旧接口：提为必做 = 计划今天；换一个 = 改到明天
  if ('pinnedDate' in b) { t.pinnedDate = b.pinnedDate ? dateKey() : null; if (b.pinnedDate) { t.snoozeDate = null; t.planDate = dateKey() } }
  if ('snoozeDate' in b) { t.snoozeDate = b.snoozeDate ? dateKey() : null; if (b.snoozeDate) { t.pinnedDate = null; t.planDate = dateKey(new Date(Date.now() + DAY_MS)) } }
  return t
}

// 规范一条灵感（来自模型输出或用户在预览里改过的内容）
function normIdea(i) {
  const text = str(typeof i?.text === 'string' ? i.text : '', '灵感内容', 1000)
  return {
    text,
    raw: typeof i.raw === 'string' ? i.raw.trim().slice(0, 4000) : text,
    category: pick(i.category, IDEA_CATS, 'personal'),
    subcategory: (typeof i.subcategory === 'string' && i.subcategory.trim() ? i.subcategory.trim() : '随想').slice(0, 30),
    tags: (Array.isArray(i.tags) ? i.tags : []).map(String).filter(Boolean).slice(0, 6),
    nextAction: String(i.nextAction ?? '').slice(0, 200),
  }
}

const taskView = (t) => ({ ...t, actualMin: Math.round(actualMinutes(t)) })
// 没配置过就按本机已安装的 Agent 自动生成
const sourcesOf = (data) => (Array.isArray(data.profile?.agentSources) ? data.profile.agentSources : defaultSources())

export function createHandler(deps) {
  const { store, ai, liveStatus, dataDir } = deps
  const findTask = (data, id) => { const t = data.tasks.find((x) => x.id === id); if (!t) throw bad('任务不存在', 404); return t }
  const findStep = (t, id) => { const s = (t.steps ?? []).find((x) => x.id === id); if (!s) throw bad('步骤不存在', 404); return s }
  const closeOpenSession = (t, now) => { const s = (t.sessions ?? []).find((x) => !x.end); if (s) s.end = now; return s }

  const routes = {
    'GET /status': () => ({ ai: ai.status(), dataDir, today: dateKey() }),

    'GET /plan': () => store.mutate((data) => {
      // 每周渐进调整容量（满 7 天才会生效）
      const { profile, change } = adjustCapacity(data.profile, computeStats(data))
      data.profile = profile
      if (change) data.coachLog.push({ at: Date.now(), kind: 'capacity', text: change })
      const plan = buildPlan(data)
      // 记录今天进入必做的任务，供完成率统计
      for (const m of plan.must) { const t = data.tasks.find((x) => x.id === m.id); t.mustDays = [...new Set([...(t.mustDays ?? []), plan.date])].slice(-60) }
      const active = data.tasks.find((t) => (t.sessions ?? []).some((s) => !s.end))
      return { ...plan, must: plan.must.map(taskView), small: plan.small.map(taskView), backlog: plan.backlog.map(taskView), doneToday: plan.doneToday.map(taskView), insights: insights(plan.stats, data.profile), profile: data.profile, capacityChange: change, active: active ? { taskId: active.id, start: active.sessions.find((s) => !s.end).start, stepId: active.sessions.find((s) => !s.end).stepId ?? null } : null }
    }),

    'GET /tasks': () => ({ tasks: store.load().tasks.map(taskView) }),

    // 日历：?from=YYYY-MM-DD&to=YYYY-MM-DD（最多 62 天）
    'GET /calendar': (_b, _p, url) => {
      const isKey = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x ?? '')
      const from = isKey(url.searchParams.get('from')) ? url.searchParams.get('from') : weekStart(dateKey())
      const to = isKey(url.searchParams.get('to')) ? url.searchParams.get('to') : addDays(from, 6)
      if (to < from) throw bad('to 不能早于 from')
      const cal = buildCalendar(store.load(), from, to)
      return { ...cal, days: cal.days.map((d) => ({ ...d, tasks: d.tasks.map((x) => ({ ...x, task: taskView(x.task) })), dues: d.dues.map(taskView), done: d.done.map(taskView) })), unscheduled: cal.unscheduled.map(taskView) }
    },

    'POST /tasks': (b) => store.mutate((data) => {
      const t = { id: newId(), ...sanitizeTaskPatch(b, false), status: 'todo', steps: [], sessions: [], notes: [], createdAt: Date.now() }
      if (b.fromIdea) { const idea = data.ideas.find((i) => i.id === b.fromIdea); if (idea) { idea.taskId = t.id; t.fromIdea = idea.id } }
      data.tasks.push(t)
      return { task: taskView(t) }
    }),

    'PATCH /tasks/:id': (b, p) => store.mutate((data) => {
      const t = findTask(data, p.id)
      Object.assign(t, sanitizeTaskPatch(b, true))
      if (t.status === 'done' && !t.completedAt) { closeOpenSession(t, Date.now()); t.completedAt = Date.now() }
      if (t.status !== 'done') t.completedAt = null
      return { task: taskView(t) }
    }),

    'DELETE /tasks/:id': (_b, p) => store.mutate((data) => { findTask(data, p.id); data.tasks = data.tasks.filter((t) => t.id !== p.id); return { ok: true } }),

    'POST /tasks/:id/split': async (b, p) => {
      const data = store.load(), t = findTask(data, p.id)
      const out = await ai.split(t, computeStats(data))
      const steps = (Array.isArray(out.steps) ? out.steps : []).slice(0, 8).map((s) => ({ id: newId(), title: String(s.title ?? s).slice(0, 200), estimateMin: int(s.estimateMin, 3, 60, 15), done: false }))
      if (!steps.length) throw bad('拆分失败，请重试')
      return store.mutate((d) => {
        const task = findTask(d, p.id)
        const keep = b.replace ? [] : (task.steps ?? []).filter((s) => s.done)
        task.steps = [...keep, ...steps]
        task.estimateMin = Math.max(task.estimateMin ?? 0, task.steps.reduce((m, s) => m + s.estimateMin, 0))
        if (out.reportPoint && !task.reportPoint) task.reportPoint = String(out.reportPoint).slice(0, 300)
        return { task: taskView(task), source: out.source }
      })
    },

    'POST /tasks/:id/steps': (b, p) => store.mutate((data) => {
      const t = findTask(data, p.id)
      const s = { id: newId(), title: str(b.title, '步骤', 200), estimateMin: int(b.estimateMin, 3, 120, 15), done: false }
      t.steps = [...(t.steps ?? []), s]
      return { task: taskView(t) }
    }),

    'PATCH /tasks/:id/steps/:sid': (b, p) => store.mutate((data) => {
      const t = findTask(data, p.id), s = findStep(t, p.sid)
      if ('title' in b) s.title = str(b.title, '步骤', 200)
      if ('estimateMin' in b) s.estimateMin = int(b.estimateMin, 3, 120, 15)
      if ('done' in b) {
        s.done = Boolean(b.done); s.doneAt = s.done ? Date.now() : null
        if (s.done && (t.steps ?? []).every((x) => x.done) && !b.keepOpen) { closeOpenSession(t, Date.now()); t.status = 'done'; t.completedAt = Date.now() }
        else if (t.status === 'todo' && s.done) t.status = 'doing'
      }
      return { task: taskView(t), taskDone: t.status === 'done' }
    }),

    'DELETE /tasks/:id/steps/:sid': (_b, p) => store.mutate((data) => { const t = findTask(data, p.id); t.steps = (t.steps ?? []).filter((s) => s.id !== p.sid); return { task: taskView(t) } }),

    // 专注计时：开始 / 打断 +1 / 结束
    'POST /tasks/:id/focus': (b, p) => store.mutate((data) => {
      const now = Date.now()
      const action = pick(b.action, ['start', 'stop', 'interrupt'], 'start')
      if (action === 'start') {
        for (const other of data.tasks) closeOpenSession(other, now) // 同时只允许一个计时（单任务专注）
        const t = findTask(data, p.id)
        t.sessions = [...(t.sessions ?? []), { start: now, end: null, interruptions: 0, stepId: b.stepId ?? null }]
        if (t.status === 'todo') t.status = 'doing'
        return { task: taskView(t) }
      }
      const t = findTask(data, p.id), s = (t.sessions ?? []).find((x) => !x.end)
      if (!s) throw bad('当前没有进行中的计时')
      if (action === 'interrupt') s.interruptions = (s.interruptions ?? 0) + 1
      else { s.end = now; if (now - s.start < 30000) t.sessions = t.sessions.filter((x) => x !== s) } // <30 秒视为误触
      return { task: taskView(t), minutes: Math.round((now - s.start) / 60000) }
    }),

    // 汇报要点：kind = done(做了什么) / approach(方案) / result(结果) / issue(问题)
    'POST /tasks/:id/notes': (b, p) => store.mutate((data) => {
      const t = findTask(data, p.id)
      t.notes = [...(t.notes ?? []), { id: newId(), kind: pick(b.kind, ['done', 'approach', 'result', 'issue'], 'done'), text: str(b.text, '要点', 1000), at: Date.now() }]
      if (b.reportPoint) t.reportPoint = str(b.reportPoint, '汇报一句话', 300, false)
      return { task: taskView(t) }
    }),

    'DELETE /tasks/:id/notes/:nid': (_b, p) => store.mutate((data) => { const t = findTask(data, p.id); t.notes = (t.notes ?? []).filter((n) => n.id !== p.nid); return { task: taskView(t) } }),

    // —— 灵感库 ——
    'GET /ideas': () => ({ ideas: store.load().ideas }),
    'POST /ideas': async (b) => {
      const text = str(b.text, '灵感内容', 4000)
      const manual = IDEA_CATS.includes(b.category) ? b.category : null
      const cls = b.skipAi ? { category: manual ?? 'personal', subcategory: str(b.subcategory, '小类', 30, false) ?? '随想', tags: [], source: 'manual' } : await ai.classify(text)
      return store.mutate((data) => {
        const idea = {
          id: newId(), text, createdAt: Date.now(),
          category: manual ?? pick(cls.category, IDEA_CATS, 'personal'),
          subcategory: str(b.subcategory, '小类', 30, false) ?? String(cls.subcategory || '随想').slice(0, 30),
          tags: (Array.isArray(cls.tags) ? cls.tags : []).map(String).slice(0, 6),
          nextAction: String(cls.nextAction ?? '').slice(0, 200), starred: false, source: cls.source,
        }
        data.ideas.unshift(idea)
        return { idea }
      })
    },
    // 一段话 → 多条灵感预览（不保存）
    'POST /ideas/split': async (b) => {
      const text = str(b.text, '灵感内容', 8000)
      const r = await ai.splitIdeas(text)
      return { source: r.source, items: r.items.map((i) => normIdea(i)) }
    },
    // 预览确认后批量保存；带 replaceId 时用这几条替换原来那一条
    'POST /ideas/batch': (b) => {
      if (!Array.isArray(b.items) || !b.items.length) throw bad('items 不能为空')
      if (b.items.length > 20) throw bad('一次最多 20 条')
      const rawText = str(b.rawText, '原话', 8000, false) ?? ''
      return store.mutate((data) => {
        let old = null
        if (b.replaceId) { old = data.ideas.find((i) => i.id === b.replaceId); if (!old) throw bad('要替换的灵感不存在', 404) }
        const base = old?.createdAt ?? Date.now()
        const created = b.items.map((it, k) => {
          const { raw, ...rest } = normIdea(it)
          // rawText：这条对应的原文片段；fullText：整段原话（拆成多条时才有意义）
          return {
            id: newId(), ...rest, rawText: raw || rawText, ...(rawText && b.items.length > 1 ? { fullText: rawText } : {}),
            createdAt: base - k, starred: Boolean(old?.starred), source: pick(it.source, ['ai', 'rule', 'manual'], 'ai'),
          }
        })
        if (old) {
          const at = data.ideas.indexOf(old)
          data.ideas.splice(at, 1, ...created)
        } else data.ideas.unshift(...created)
        return { ideas: created, replaced: old?.id ?? null }
      })
    },
    'PATCH /ideas/:id': (b, p) => store.mutate((data) => {
      const idea = data.ideas.find((i) => i.id === p.id); if (!idea) throw bad('灵感不存在', 404)
      if ('text' in b) idea.text = str(b.text, '灵感内容', 4000)
      if ('category' in b) idea.category = pick(b.category, IDEA_CATS, idea.category)
      if ('subcategory' in b) idea.subcategory = str(b.subcategory, '小类', 30, false) ?? idea.subcategory
      if ('starred' in b) idea.starred = Boolean(b.starred)
      return { idea }
    }),
    'DELETE /ideas/:id': (_b, p) => store.mutate((data) => { data.ideas = data.ideas.filter((i) => i.id !== p.id); return { ok: true } }),

    // —— 教练 ——
    'POST /coach': async (b) => {
      const message = str(b.message, '内容', 4000)
      const data = store.load(), plan = buildPlan(data)
      const ctx = `必做：${plan.must.map((t) => t.title).join('；') || '无'}。当前一步：${plan.next?.stepTitle ?? '无'}。`
      const out = await ai.coach(message, ctx)
      const reply = {
        clarity: pick(out.clarity, ['high', 'medium', 'low'], 'medium'),
        rewrite: String(out.rewrite ?? '').slice(0, 300), missing: (out.missing ?? []).map(String).slice(0, 5),
        questions: (out.questions ?? []).map(String).slice(0, 3), paper: Boolean(out.paper),
        paperPrompt: String(out.paperPrompt ?? '').slice(0, 500), encourage: String(out.encourage ?? '').slice(0, 60),
        task: out.task && typeof out.task === 'object' ? { title: String(out.task.title || out.rewrite || message).slice(0, 200), track: pick(out.task.track, TRACKS, 'work'), estimateMin: int(out.task.estimateMin, 5, 600, 30), importance: int(out.task.importance, 1, 3, 2), urgency: int(out.task.urgency, 1, 3, 2) } : null,
        source: out.source,
      }
      store.mutate((d) => { d.coachLog.push({ at: Date.now(), kind: 'coach', message, clarity: reply.clarity, paper: reply.paper }); d.coachLog = d.coachLog.slice(-500) })
      return reply
    },
    'GET /coach/log': () => {
      const log = store.load().coachLog
      const recent = log.filter((l) => l.kind === 'coach').slice(-30)
      const score = { high: 2, medium: 1, low: 0 }
      return { log: log.slice(-50).reverse(), clarityTrend: recent.map((l) => score[l.clarity] ?? 1), paperCount: recent.filter((l) => l.paper).length }
    },

    // —— 对话式录入 ——
    'POST /intake/parse': async (b) => ({ draft: await ai.intake(str(b.text, '内容', 1000)) }),
    'POST /intake/answer': async (b) => {
      const field = pick(b.field, ['importance', 'urgency', 'due', 'estimateMin'], null)
      if (!field) throw bad('field 无效')
      return ai.answer(field, str(b.text, '回答', 300))
    },

    // —— Agent 来源设置 ——
    'GET /sources': () => ({ sources: sourcesOf(store.load()), types: Object.entries(AGENT_TYPES).map(([type, t]) => ({ type, ...t })) }),
    'PUT /sources': (b) => store.mutate((data) => { data.profile.agentSources = sanitizeSources(b.sources); return { sources: data.profile.agentSources } }),
    'POST /sources/reset': () => store.mutate((data) => { data.profile.agentSources = defaultSources(); return { sources: data.profile.agentSources } }),

    // —— 工作区看板：按来源顺序纵向排列，每个工作区最多 2 个会话 ——
    'GET /workspaces': () => ({ sources: readSources(sourcesOf(store.load()), { perWorkspace: 2, liveStatus }), at: Date.now() }),

    // —— 统计与成长 ——
    'GET /stats': () => { const data = store.load(), stats = computeStats(data); return { stats, insights: insights(stats, data.profile), profile: data.profile } },
    'PATCH /profile': (b) => store.mutate((data) => {
      const p = data.profile
      if ('dailyWorkMinutes' in b) p.dailyWorkMinutes = int(b.dailyWorkMinutes, 30, 600, p.dailyWorkMinutes)
      if ('dailyGrowthMinutes' in b) p.dailyGrowthMinutes = int(b.dailyGrowthMinutes, 10, 180, p.dailyGrowthMinutes)
      for (const k of ['workStart', 'workEnd']) if (k in b && /^\d{2}:\d{2}$/.test(b[k])) p[k] = b[k]
      return { profile: p }
    }),

    // —— 汇报 ——
    'POST /report': async (b) => {
      const data = store.load()
      const ids = Array.isArray(b.taskIds) && b.taskIds.length ? new Set(b.taskIds) : null
      const sinceDays = int(b.sinceDays, 1, 90, 7), since = Date.now() - sinceDays * 86400000
      const sinceKey = dateKey(new Date(since))
      const inRange = (t) => t.status !== 'dropped' && ((t.completedAt ?? 0) >= since || t.status === 'doing' || (t.sessions ?? []).some((s) => s.start >= since) || (t.mustDays ?? []).some((d) => d >= sinceKey))
      const tasks = data.tasks.filter((t) => (ids ? ids.has(t.id) : inRange(t))).map(taskView)
      if (!tasks.length) throw bad('所选时间范围内没有可汇报的任务')
      const payload = {
        title: str(b.title, '标题', 120, false) ?? `工作汇报（近 ${sinceDays} 天）`, period: `${dateKey(new Date(since))} ~ ${dateKey()}`,
        audience: str(b.audience, '对象', 60, false) ?? '团队与上级',
        tasks: tasks.map((t) => ({ title: t.title, track: t.track, status: t.status, project: t.project, detail: t.detail, reportPoint: t.reportPoint, actualMin: t.actualMin, steps: (t.steps ?? []).map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title}`), notes: t.notes ?? [] })),
      }
      const deck = await ai.report(payload)
      const out = writeReport(dataDir, deck, { tasks })
      return { ...out, source: deck.source }
    },
  }

  const compiled = Object.entries(routes).map(([key, fn]) => {
    const [method, path] = key.split(' ')
    const names = []
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_m, n) => { names.push(n); return '([^/]+)' })}$`)
    return { method, re, names, fn }
  })

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith(PREFIX)) return send(res, 404, { error: 'not found' })
    const sub = url.pathname.slice(PREFIX.length) || '/'
    try {
      for (const r of compiled) {
        if (r.method !== req.method) continue
        const m = sub.match(r.re); if (!m) continue
        const params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
        let body = {}
        if (req.method !== 'GET') { body = await readBody(req); guard(req, body) }
        return send(res, 200, await r.fn(body, params, url))
      }
      send(res, 404, { error: 'not found' })
    } catch (e) {
      deps.logger?.warn?.(`[adhd-workbench] ${req.method} ${sub}: ${e?.message}`)
      send(res, e?.status ?? 500, { error: e?.message ?? String(e) })
    }
  }
}

export const API_PREFIX = '/adhd-workbench'
