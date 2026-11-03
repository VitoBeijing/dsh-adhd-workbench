// 每日计划与行为学习（纯函数，便于单测）。
// 心理学依据（写进 UI 文案里）：
//  - 执行意图（Implementation intention）：每个时间块都绑定「何时 + 做哪一步」。
//  - 渐进加量（Graded exposure / progressive overload）：完成率达标才每周 +10% 任务量。
//  - 先易后难的启动（Behavioral momentum）：第一个专注块先给一个 ≤10 分钟的小步热身。
//  - 即时奖励：完成即反馈，连续天数（streak）。
//  - 计划谬误校正（Planning fallacy）：用个人速度系数修正预估。

export const DAY_MS = 86400000

export function dateKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const isWorkday = (d = new Date()) => d.getDay() >= 1 && d.getDay() <= 5

const median = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x))

/** 任务实际专注分钟数（所有计时段累加）。 */
export function actualMinutes(task) {
  return (task.sessions ?? []).reduce((sum, s) => sum + (s.end && s.start ? (s.end - s.start) / 60000 : 0), 0)
}

export function remainingMinutes(task) {
  const open = (task.steps ?? []).filter((s) => !s.done)
  if (task.steps?.length) return open.reduce((sum, s) => sum + (s.estimateMin || 15), 0)
  return Math.max(5, (task.estimateMin || 30) - actualMinutes(task))
}

/** 从历史数据学习个人执行习惯。 */
export function computeStats(data, now = Date.now()) {
  const done = data.tasks.filter((t) => t.status === 'done' && t.estimateMin > 0 && actualMinutes(t) >= 1)
  const ratios = done.slice(-30).map((t) => actualMinutes(t) / t.estimateMin)
  const speedFactor = ratios.length >= 3 ? clamp(median(ratios), 0.5, 3) : 1
  const sessions = data.tasks.flatMap((t) => (t.sessions ?? []).filter((s) => s.end).map((s) => ({ ...s, track: t.track })))
  const hourly = Array.from({ length: 24 }, () => 0)
  for (const s of sessions) hourly[new Date(s.start).getHours()] += (s.end - s.start) / 60000
  const ranked = hourly.map((m, h) => [h, m]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1])
  const peakHours = ranked.slice(0, 3).map(([h]) => h).sort((a, b) => a - b)
  const lens = sessions.map((s) => (s.end - s.start) / 60000).filter((m) => m >= 2)
  const focusMinutes = lens.length >= 3 ? clamp(Math.round(median(lens)), 15, 50) : 25
  const interrupts = sessions.reduce((n, s) => n + (s.interruptions || 0), 0)
  // 近 7 天完成率：当天进入「必做」且当天完成的比例
  let planned = 0, completed = 0
  for (const t of data.tasks) for (const day of t.mustDays ?? []) {
    if (now - new Date(`${day}T00:00:00`).getTime() > 8 * DAY_MS) continue
    // 今天还没结束：只计入今天已完成的，未完成的不算失败
    if (day === dateKey(new Date(now)) && !(t.completedAt && dateKey(new Date(t.completedAt)) === day)) continue
    planned++
    if (t.completedAt && dateKey(new Date(t.completedAt)) === day) completed++
  }
  const completionRate = planned ? completed / planned : null
  // 连续有完成记录的天数
  const doneDays = new Set(data.tasks.flatMap((t) => [
    ...(t.completedAt ? [dateKey(new Date(t.completedAt))] : []),
    ...(t.steps ?? []).filter((s) => s.doneAt).map((s) => dateKey(new Date(s.doneAt))),
  ]))
  let streak = 0
  for (let d = new Date(now); doneDays.has(dateKey(d)); d = new Date(d.getTime() - DAY_MS)) streak++
  const todayKey = dateKey(new Date(now))
  const todayFocus = sessions.filter((s) => dateKey(new Date(s.start)) === todayKey).reduce((m, s) => m + (s.end - s.start) / 60000, 0)
  return {
    samples: ratios.length, speedFactor: Math.round(speedFactor * 100) / 100, peakHours, hourly: hourly.map(Math.round),
    focusMinutes, interruptsPerSession: sessions.length ? Math.round((interrupts / sessions.length) * 10) / 10 : 0,
    completionRate, streak, todayFocusMinutes: Math.round(todayFocus), sessionsCount: sessions.length,
  }
}

/** 预估修正：原始预估 × 个人速度系数，向上取整到 5 分钟。 */
export const adjustEstimate = (min, stats) => Math.max(5, Math.ceil(((min || 30) * stats.speedFactor) / 5) * 5)

/** 每周一次的渐进加量/减量。返回新的 profile（不改原对象）。 */
export function adjustCapacity(profile, stats, now = Date.now()) {
  // 首次使用只记录起点，满一周才第一次调整
  if (!profile.lastCapacityReview) return { profile: { ...profile, lastCapacityReview: new Date(now).toISOString() }, change: null }
  const last = new Date(profile.lastCapacityReview).getTime()
  if (now - last < 7 * DAY_MS || stats.completionRate === null) return { profile, change: null }
  const r = stats.completionRate
  const factor = r >= 0.8 ? 1.1 : r < 0.5 ? 0.9 : 1
  const next = {
    ...profile,
    dailyWorkMinutes: clamp(Math.round(profile.dailyWorkMinutes * factor), 60, 420),
    dailyGrowthMinutes: clamp(Math.round(profile.dailyGrowthMinutes * factor), 15, 120),
    lastCapacityReview: new Date(now).toISOString(),
  }
  const change = factor > 1 ? `上周必做完成率 ${Math.round(r * 100)}%，任务量上调 10%` : factor < 1 ? `上周必做完成率 ${Math.round(r * 100)}%，任务量先下调 10%，先把节奏找回来` : `上周完成率 ${Math.round(r * 100)}%，保持当前任务量`
  return { profile: next, change }
}

export function scoreTask(t, now = Date.now()) {
  let s = (t.importance ?? 2) * 2 + (t.urgency ?? 2)
  if (t.due) {
    const days = (new Date(`${t.due}T23:59:59`).getTime() - now) / DAY_MS
    s += days < 0 ? 6 : days < 1 ? 5 : days < 3 ? 3 : days < 7 ? 1 : 0
  }
  s += Math.min(2, (now - (t.createdAt ?? now)) / (7 * DAY_MS)) // 放久了的任务慢慢浮上来，避免永远被挤掉
  const today = dateKey(new Date(now))
  if (t.pinnedDate === today) s += 100
  // 计划日期：今天的优先；已过期没做完的（拖欠）更靠前；安排在以后的今天不排
  if (t.planDate) s += t.planDate === today ? 100 : t.planDate < today ? 110 : -200
  if (t.snoozeDate === today) s -= 100 // 「换一个」：今天先不排它
  return s
}

const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m }

/** 生成今日计划：三大必做 + 小任务 + 时间块。 */
export function buildPlan(data, now = Date.now()) {
  const d = new Date(now), today = dateKey(d), workday = isWorkday(d)
  const stats = computeStats(data, now)
  const open = data.tasks.filter((t) => t.status !== 'done' && t.status !== 'dropped')
  const planned = (t) => t.pinnedDate === today || (t.planDate && t.planDate <= today)
  const later = (t) => t.planDate && t.planDate > today // 安排在以后的，今天不进必做和小任务
  const eligible = (workday ? open : open.filter((t) => t.track !== 'work' || planned(t))).filter((t) => !later(t))
  const ranked = [...eligible].sort((a, b) => scoreTask(b, now) - scoreTask(a, now))
  const est = (t) => adjustEstimate(remainingMinutes(t), stats)
  const isSmall = (t) => remainingMinutes(t) <= 20
  // 三大必做优先从「非小任务」里选；工作日保证至少 1 个成长任务
  let must = ranked.filter((t) => !isSmall(t) || planned(t)).slice(0, 3)
  if (workday && !must.some((t) => t.track === 'growth')) {
    const growth = ranked.find((t) => t.track === 'growth' && !must.includes(t))
    if (growth) must = [...must.slice(0, 2), growth]
  }
  if (must.length < 3) must = [...must, ...ranked.filter((t) => !must.includes(t)).slice(0, 3 - must.length)]
  const rest = ranked.filter((t) => !must.includes(t))
  const small = rest.filter(isSmall).slice(0, 6)
  const backlog = [...rest.filter((t) => !small.includes(t)), ...open.filter((t) => !eligible.includes(t))]

  // —— 时间块 ——
  const p = data.profile
  const focus = stats.focusMinutes
  const nowMin = d.getHours() * 60 + d.getMinutes()
  const blocks = []
  let cursor = Math.max(toMin(p.workStart), Math.ceil(nowMin / 5) * 5)
  const end = toMin(p.workEnd)
  const push = (kind, title, mins, taskId) => {
    if (cursor < 12 * 60 + 30 && cursor + mins > 12 * 60) { blocks.push({ kind: 'break', title: '午饭 + 离开屏幕', start: hm(12 * 60), end: hm(13 * 60 + 30) }); cursor = 13 * 60 + 30 }
    blocks.push({ kind, title, start: hm(cursor), end: hm(cursor + mins), taskId })
    cursor += mins
  }
  if (workday && cursor < end) {
    let budget = p.dailyWorkMinutes
    const workMust = must.filter((t) => t.track !== 'growth')
    // 热身：先做一个最小的步骤（行为惯性）
    const warm = small[0] ?? null
    if (warm && cursor < end) { push('warmup', `热身：${warm.title}`, 10, warm.id); budget -= 10 }
    for (const t of workMust) {
      let left = est(t)
      while (left > 0 && budget > 0 && cursor + 5 < end) {
        const len = Math.min(focus, left, budget)
        push('focus', t.title, len, t.id); left -= len; budget -= len
        if (cursor + 5 < end) push('break', '休息：站起来、喝水', 5)
      }
    }
    if (small.length > 1 && cursor + 20 < end) push('batch', `小任务快打（${small.length} 个）`, 20)
  }
  const growthMins = Math.min(p.dailyGrowthMinutes, 90)
  const growthTask = must.find((t) => t.track === 'growth') ?? ranked.find((t) => t.track === 'growth')
  const gStart = Math.max(cursor, workday ? toMin('20:00') : Math.max(nowMin, toMin('10:00')))
  if (growthTask && gStart + growthMins < 24 * 60) blocks.push({ kind: 'growth', title: `成长：${growthTask.title}`, start: hm(gStart), end: hm(gStart + growthMins), taskId: growthTask.id })

  // 当前唯一焦点：第一个未完成必做里的第一个未完成步骤
  let next = null
  for (const t of must) {
    const step = (t.steps ?? []).find((s) => !s.done)
    if (step || !(t.steps ?? []).length) { next = { taskId: t.id, taskTitle: t.title, stepId: step?.id ?? null, stepTitle: step?.title ?? '先把它拆成 3–5 个小步', estimateMin: step?.estimateMin ?? 10 }; break }
  }
  return {
    date: today, workday, stats,
    must: must.map((t) => ({ ...t, adjustedEstimate: est(t), score: Math.round(scoreTask(t, now) * 10) / 10 })),
    small: small.map((t) => ({ ...t, adjustedEstimate: est(t) })),
    backlog: backlog.map((t) => ({ ...t, adjustedEstimate: est(t) })),
    blocks, next,
    doneToday: data.tasks.filter((t) => t.completedAt && dateKey(new Date(t.completedAt)) === today),
  }
}

/** 根据统计给出 2–4 条可执行的改进建议（规则引擎，不依赖模型）。 */
export function insights(stats, profile) {
  const out = []
  if (stats.samples < 3) out.push({ kind: 'info', text: `再完成 ${3 - stats.samples} 个带计时的任务，我就能算出你的速度系数。` })
  else if (stats.speedFactor > 1.3) out.push({ kind: 'warn', text: `你的实际用时平均是预估的 ${stats.speedFactor} 倍（计划谬误很常见）。之后的预估已自动乘上这个系数。` })
  else if (stats.speedFactor < 0.8) out.push({ kind: 'good', text: `你比预估快（系数 ${stats.speedFactor}），可以给自己多排一点挑战。` })
  if (stats.peakHours.length) out.push({ kind: 'info', text: `你最专注的时段：${stats.peakHours.map((h) => `${h}:00`).join('、')}。最难的必做任务会优先排进这些时段。` })
  if (stats.interruptsPerSession >= 2) out.push({ kind: 'warn', text: `每个专注块平均被打断 ${stats.interruptsPerSession} 次。试试：手机放另一个房间，或把冒出来的念头先丢进灵感库，别马上去做。` })
  if (stats.focusMinutes < 20) out.push({ kind: 'info', text: `你的专注块中位数是 ${stats.focusMinutes} 分钟。时间块已按这个长度切，不硬撑 25 分钟。` })
  if (stats.completionRate !== null) out.push({ kind: stats.completionRate >= 0.8 ? 'good' : 'info', text: `近 7 天必做完成率 ${Math.round(stats.completionRate * 100)}%，每日工作容量 ${profile.dailyWorkMinutes} 分钟。` })
  if (stats.streak >= 2) out.push({ kind: 'good', text: `已连续 ${stats.streak} 天有推进 🔥` })
  return out
}

/** 周一为一周第一天。 */
export function weekStart(key) {
  const d = new Date(`${key}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dateKey(d)
}
export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d)
}

/**
 * 日历数据：from..to（含）每天的计划任务、只有截止日的任务、截止标记、完成项和专注分钟数，以及未安排的任务。
 * - 有 planDate 的放在计划那天；没有 planDate 但有 due 的放在截止那天（标 byDue）。
 * - 已完成的任务按完成那天显示；已放下的不显示。
 */
export function buildCalendar(data, from, to, now = Date.now()) {
  const today = dateKey(new Date(now))
  const days = {}
  for (let k = from, i = 0; k <= to && i < 62; k = addDays(k, 1), i++) days[k] = { date: k, tasks: [], dues: [], done: [], focusMin: 0 }
  const live = data.tasks.filter((t) => t.status !== 'dropped')
  const unscheduled = []
  for (const t of live) {
    const doneDay = t.status === 'done' && t.completedAt ? dateKey(new Date(t.completedAt)) : null
    if (doneDay) { if (days[doneDay]) days[doneDay].done.push(t); continue }
    if (t.planDate) { if (days[t.planDate]) days[t.planDate].tasks.push({ task: t, overdue: t.planDate < today }) }
    else if (t.due) { if (days[t.due]) days[t.due].tasks.push({ task: t, byDue: true, overdue: t.due < today }) }
    else unscheduled.push(t)
    if (t.due && days[t.due] && t.planDate && t.planDate !== t.due) days[t.due].dues.push(t)
  }
  for (const t of data.tasks) for (const s of t.sessions ?? []) {
    if (!s.start || !s.end) continue
    const k = dateKey(new Date(s.start)); if (days[k]) days[k].focusMin += (s.end - s.start) / 60000
  }
  const order = (a, b) => (b.task.importance ?? 2) * 2 + (b.task.urgency ?? 2) - ((a.task.importance ?? 2) * 2 + (a.task.urgency ?? 2))
  for (const d of Object.values(days)) {
    d.tasks.sort(order)
    d.done.sort((a, b) => a.completedAt - b.completedAt)
    d.focusMin = Math.round(d.focusMin)
  }
  return { from, to, today, days: Object.values(days), unscheduled: unscheduled.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)) }
}
