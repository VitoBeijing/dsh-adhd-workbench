// AI 能力：通过 DSH 宿主 llm 服务调用当前配置的模型。模型不可用时全部有规则兜底。
import { INTAKE_SYSTEM, ANSWER_SYSTEM, ruleIntake, mergeIntake, ruleAnswer, validAnswer, todayLine } from './intake.js'

const COACH_SYSTEM = `你是一位熟悉 ADHD 的执行力教练，说话简短、温和、具体。
你的工作是校准用户的表达：把抽象的说法变成可执行的具体动作。
判断标准（缺一项就追问一项，一次最多问 2 个问题）：
1. 对象：具体是哪个项目/文件/人？
2. 动作：第一步的动词是什么（写、改、发、问、查）？
3. 交付物：做完之后看得见的产出是什么？
4. 完成标准：怎样算完成？
5. 时间：什么时候开始，预计多少分钟？
如果用户表达里出现「感觉/好像/有点乱/不知道/搞定一下/优化一下/弄一弄」这类模糊词，并且缺 3 项以上，判定 clarity=low，并建议他拿出纸笔，花 3 分钟画出「现状 → 卡点 → 想要的结果」。
只输出 JSON，不要其他文字：
{"clarity":"high|medium|low","rewrite":"把用户的话改写成一句具体的任务（动词开头）","missing":["缺的维度"],"questions":["追问1","追问2"],"paper":true|false,"paperPrompt":"如果 paper=true，给一个 3 分钟纸笔练习的具体指令","encourage":"一句鼓励（≤20字）","task":{"title":"","track":"work|growth|life","estimateMin":30,"importance":1-3,"urgency":1-3}}`

const SPLIT_SYSTEM = `你是 ADHD 友好的任务拆解助手。把任务拆成 3–7 个小步骤：
- 每步动词开头，5–25 分钟能完成，做完能看到具体产出；
- 第一步必须是 ≤10 分钟、几乎零阻力的启动动作（例如「打开文档写下标题」）；
- 最后一步是「检查/交付」类动作。
只输出 JSON：{"steps":[{"title":"","estimateMin":10}],"reportPoint":"这个任务完成后对外汇报时最值得说的一句话"}`

const CLASSIFY_SYSTEM = `你负责整理灵感。大类只能是 personal（个人）/ work（工作）/ life（生活）之一；小类是 2–6 个汉字的内容主题（例如「产品点子」「写作素材」「健康」「SEO」「学习方法」）。
只输出 JSON：{"category":"personal|work|life","subcategory":"","tags":["",""],"nextAction":"如果要把它变成行动，第一步是什么（动词开头，可为空）"}`

const REPORT_SYSTEM = `你是一位擅长对外汇报的项目负责人。根据给出的任务、执行步骤和要点，写一份简洁有力的工作汇报。
结构：背景与目标 → 本期完成 → 执行方案/关键做法 → 结果与数据 → 风险与问题 → 下一步计划。
每页 3–5 条要点，每条不超过 30 字，用事实和数字说话，不要空话。
严格依据输入：status=done 的任务和标记 [x] 的步骤才算「已完成」；[ ] 步骤和未完成任务只能写进「进行中/下一步」。不要编造输入里没有的数字或成果。输出里不要出现英文字段名（如 status、actualMin、done、todo），用中文说法（已完成/进行中/专注时长）；专注时长为 0 时不提。
只输出 JSON：{"title":"","subtitle":"","slides":[{"title":"","bullets":[""],"note":"演讲备注（可空）"}]}`

/** 从模型输出里取第一个 JSON 对象。 */
export function extractJson(text) {
  if (!text) return null
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const src = fenced ? fenced[1] : text
  const start = src.indexOf('{')
  if (start < 0) return null
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < src.length; i++) {
    const c = src[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) { try { return JSON.parse(src.slice(start, i + 1)) } catch { return null } }
  }
  return null
}

export class Ai {
  /** @param {{ getLlm: () => any, resolveRoute: () => ({provider:string, model:string}|null), logger?: any }} deps */
  constructor(deps) { this.deps = deps }

  route() {
    try { return this.deps.resolveRoute() } catch { return null }
  }

  status() {
    const r = this.route()
    return r ? { available: true, ...r } : { available: false }
  }

  async complete(system, user, { timeoutMs = 90000, maxTokens = 2000 } = {}) {
    const llm = this.deps.getLlm()
    const route = this.route()
    if (!llm?.stream || !route) throw Object.assign(new Error('DSH 模型不可用'), { code: 'NO_MODEL' })
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort('timeout'), timeoutMs)
    let text = ''
    const run = (async () => {
      const stream = llm.stream({
        provider: route.provider, model: route.model, system, maxTokens, signal: ac.signal,
        messages: [{ role: 'user', id: crypto.randomUUID(), content: [{ type: 'text', text: user }], source: { kind: 'user' } }],
      })
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta') text += chunk.text
        else if (chunk?.type === 'error') throw chunk.error ?? new Error('模型返回错误')
      }
      return text
    })()
    // 有的模型通道不响应 abort，这里硬性超时，保证接口一定按时返回（之后走规则兜底）
    let hard
    const deadline = new Promise((_r, reject) => { hard = setTimeout(() => reject(Object.assign(new Error(`模型超过 ${Math.round(timeoutMs / 1000)} 秒未返回`), { code: 'TIMEOUT' })), timeoutMs + 500) })
    run.catch(() => {}) // 超时后迟到的错误不再抛出
    try { return await Promise.race([run, deadline]) } finally { clearTimeout(timer); clearTimeout(hard) }
  }

  async json(system, user, fallback, opts) {
    try {
      const out = extractJson(await this.complete(system, user, opts))
      if (out) return { ...out, source: 'ai' }
      this.deps.logger?.warn?.('[adhd-workbench] 模型输出无法解析为 JSON，使用规则兜底')
    } catch (e) {
      this.deps.logger?.warn?.(`[adhd-workbench] 模型调用失败：${e?.message ?? e}`)
    }
    return { ...fallback(), source: 'rule' }
  }

  coach(message, context = '') {
    return this.json(COACH_SYSTEM, `${context ? `【今日上下文】${context}\n` : ''}【用户说】${message}`, () => ruleCoach(message))
  }

  split(task, stats) {
    const user = `任务：${task.title}\n${task.detail ? `说明：${task.detail}\n` : ''}类型：${task.track}\n预计总时长：${task.estimateMin ?? 30} 分钟\n用户平均专注时长：${stats?.focusMinutes ?? 25} 分钟（每步不要超过它）`
    return this.json(SPLIT_SYSTEM, user, () => ruleSplit(task))
  }

  classify(text) {
    return this.json(CLASSIFY_SYSTEM, text, () => ruleClassify(text), { maxTokens: 400 })
  }

  report(payload) {
    return this.json(REPORT_SYSTEM, JSON.stringify(payload, null, 1), () => ruleReport(payload), { maxTokens: 3000, timeoutMs: 150000 })
  }

  /** 对话式录入：一句话 → 任务草稿（没说清的字段为 null）。 */
  async intake(text, now = new Date()) {
    const rule = ruleIntake(text, now)
    if (!this.status().available) return rule
    const out = await this.json(INTAKE_SYSTEM, `${todayLine(now)}\n用户说：${text}`, () => null, { maxTokens: 400, timeoutMs: 15000 })
    return out.source === 'ai' ? mergeIntake(out, rule) : rule
  }

  /** 解析单个追问的回答；规则能识别就不调模型。 */
  async answer(field, text, now = new Date()) {
    const byRule = validAnswer(field, ruleAnswer(field, text, now))
    if (byRule !== null || !this.status().available) return { value: byRule, source: 'rule' }
    const out = await this.json(ANSWER_SYSTEM, `${todayLine(now)}\nfield=${field}\n回答：${text}`, () => ({ value: null }), { maxTokens: 100, timeoutMs: 12000 })
    return { value: validAnswer(field, out.value), source: out.source }
  }
}

// ———————————————— 规则兜底 ————————————————
const VAGUE = /(感觉|好像|有点|不知道|不清楚|搞定|搞一下|弄一下|弄弄|优化一下|处理一下|看看|研究一下|整理一下|乱|烦|焦虑|一堆|很多事)/g
const VERB = /^(写|改|发|问|查|读|做|画|列|整理|修复|提交|部署|测试|联系|约|回复|准备|完成|设计|实现|上线)/
const HAS_NUMBER = /\d/
const HAS_TIME = /(今天|明天|周[一二三四五六日天]|上午|下午|晚上|\d+\s*(分钟|小时|点|号|日))/

export function ruleCoach(message) {
  const text = String(message ?? '').trim()
  const vague = (text.match(VAGUE) ?? []).length
  const missing = []
  if (!VERB.test(text)) missing.push('动作')
  if (!HAS_TIME.test(text)) missing.push('时间')
  if (!HAS_NUMBER.test(text) && text.length < 25) missing.push('交付物')
  if (!/(完成|交付|上线|发出|提交|通过|做完)/.test(text)) missing.push('完成标准')
  const clarity = vague >= 2 || missing.length >= 3 ? 'low' : missing.length >= 2 || vague ? 'medium' : 'high'
  const qs = {
    动作: '你打算做的第一个动作是什么？用一个动词开头说说看（写/改/发/问/查）。',
    时间: '你准备什么时候开始？给它几分钟？',
    交付物: '做完以后，能看到的产出是什么（一个文件、一条消息、一个 PR）？',
    完成标准: '怎样算「做完了」？说一个能验证的标准。',
  }
  const paper = clarity === 'low'
  return {
    clarity, rewrite: text, missing, questions: missing.slice(0, 2).map((m) => qs[m]), paper,
    paperPrompt: paper ? '拿一张纸，花 3 分钟画三个框：左边写「现在是什么样」，中间写「卡在哪」，右边写「我想要什么结果」。画完拍照或把右边那一格打给我。' : '',
    encourage: paper ? '先慢下来，想清楚就快了' : '方向很清楚，再具体一点就能开干',
    task: { title: text.slice(0, 60), track: 'work', estimateMin: 30, importance: 2, urgency: 2 },
  }
}

export function ruleSplit(task) {
  const total = Math.max(20, task.estimateMin ?? 30)
  const t = task.title
  const steps = [
    { title: `打开相关文档/项目，写下「${t}」要交付什么（1 句话）`, estimateMin: 5 },
    { title: '列出要做的 3 个要点或子问题', estimateMin: 10 },
    { title: '做第一个要点', estimateMin: Math.max(10, Math.round((total - 25) / 2)) },
    { title: '做剩下的要点', estimateMin: Math.max(10, Math.round((total - 25) / 2)) },
    { title: '自查一遍并交付/提交，记下一句汇报要点', estimateMin: 10 },
  ]
  return { steps, reportPoint: `完成「${t}」` }
}

const IDEA_RULES = [
  ['work', /(项目|需求|客户|SEO|代码|接口|上线|汇报|老板|同事|产品|业务|PR|bug|会议|指标|运营)/i, '工作想法'],
  ['life', /(做饭|旅行|家|运动|健身|睡眠|买|租房|朋友|孩子|父母|周末|电影|健康|吃)/, '生活'],
  ['personal', /(学习|读书|写作|成长|技能|课程|博客|副业|英语|思考|习惯)/, '个人成长'],
]
export function ruleClassify(text) {
  for (const [category, re, subcategory] of IDEA_RULES) if (re.test(text)) return { category, subcategory, tags: [], nextAction: '' }
  return { category: 'personal', subcategory: '随想', tags: [], nextAction: '' }
}

export function ruleReport({ title, tasks = [], period }) {
  const done = tasks.filter((t) => t.status === 'done'), doing = tasks.filter((t) => t.status !== 'done')
  const pts = (ts) => ts.slice(0, 5).map((t) => `${t.title}${t.reportPoint ? `：${t.reportPoint}` : ''}`)
  return {
    title: title || '工作汇报', subtitle: period ?? '',
    slides: [
      { title: '本期概览', bullets: [`完成 ${done.length} 项，进行中 ${doing.length} 项`, `累计专注 ${Math.round(tasks.reduce((m, t) => m + (t.actualMin || 0), 0))} 分钟`] },
      { title: '本期完成', bullets: pts(done).length ? pts(done) : ['（暂无）'] },
      { title: '执行方案与关键做法', bullets: tasks.flatMap((t) => (t.notes ?? []).filter((n) => n.kind === 'approach').map((n) => n.text)).slice(0, 5).concat(['按优先级每日锁定 3 项必做', '任务拆为 ≤25 分钟小步推进']).slice(0, 5) },
      { title: '问题与风险', bullets: tasks.flatMap((t) => (t.notes ?? []).filter((n) => n.kind === 'issue').map((n) => n.text)).slice(0, 5).concat(['（无明显阻塞）']).slice(0, 5) },
      { title: '下一步', bullets: pts(doing).length ? pts(doing) : ['规划下一期目标'] },
    ],
  }
}
