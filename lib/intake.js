// 对话式录入任务：从一句话里识别标题、类型、时长、重要、紧急、截止日期。
// 没说清的字段返回 null，由前端逐项追问。
import { dateKey } from './planner.js'

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 日: 7, 天: 7, 末: 6 }
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** 规则解析中文日期，返回 YYYY-MM-DD、'none'（不设截止）或 null（没识别出）。 */
export function parseDue(text, now = new Date()) {
  const s = String(text ?? '').replace(/\s+/g, '')
  if (!s) return null
  if (/(没有|无|不设|不用|别设|随时|不限|没)(截止|期限|deadline|ddl)|^(没有|无|不设|随时|不急|都行)$/i.test(s)) return 'none'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (/大后天/.test(s)) return dateKey(addDays(today, 3))
  if (/后天/.test(s)) return dateKey(addDays(today, 2))
  if (/明天|明早|明晚|明儿/.test(s)) return dateKey(addDays(today, 1))
  if (/今天|今晚|今早|今日|马上|立刻|现在|下班前/.test(s)) return dateKey(today)
  let m = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (m) return dateKey(new Date(+m[1], +m[2] - 1, +m[3]))
  m = s.match(/(\d{1,2})[月/.-](\d{1,2})[日号]?/)
  if (m) {
    let d = new Date(today.getFullYear(), +m[1] - 1, +m[2])
    if (d < today) d = new Date(today.getFullYear() + 1, +m[1] - 1, +m[2])
    return dateKey(d)
  }
  m = s.match(/(\d{1,2})[日号]/)
  if (m) {
    let d = new Date(today.getFullYear(), today.getMonth(), +m[1])
    if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, +m[1])
    return dateKey(d)
  }
  m = s.match(/(\d+|[一二两三四五六七八九十])(个)?(天|日)(后|内|之内|以内)/)
  if (m) return dateKey(addDays(today, Number(m[1]) || CN_NUM[m[1]] || 10))
  const wd = (today.getDay() + 6) % 7 // 周一=0
  m = s.match(/(下下|下个?|这个?|本)?(周|星期|礼拜)([一二三四五六日天末])/)
  if (m) {
    const target = CN_NUM[m[3]] - 1 // 0..6
    const week = m[1]?.startsWith('下下') ? 2 : m[1]?.startsWith('下') ? 1 : 0
    let diff = target - wd + week * 7
    if (!m[1] && diff < 0) diff += 7
    return dateKey(addDays(today, diff))
  }
  if (/下周|下星期|下礼拜/.test(s)) return dateKey(addDays(today, 7 - wd)) // 下周一
  // 本周内：工作日按本周五算，周末按本周日算
  if (/(本周|这周|这星期)(内|之内)?|周内/.test(s)) return dateKey(addDays(today, wd <= 4 ? 4 - wd : 6 - wd))
  if (/月底|月末|本月/.test(s)) return dateKey(new Date(today.getFullYear(), today.getMonth() + 1, 0))
  if (/下个?月/.test(s)) return dateKey(new Date(today.getFullYear(), today.getMonth() + 2, 0))
  return null
}

/** 规则判断重要程度：3 很重要 / 2 重要 / 1 一般，null=没提到。 */
export function parseImportance(text) {
  const s = String(text ?? '')
  if (/^(3|三)$|很重要|非常重要|特别重要|关键|核心|老板|领导|KPI|OKR|绩效|必须/i.test(s)) return 3
  if (/^(1|一)$|不重要|一般|无所谓|随便|可做可不做|顺手/.test(s)) return 1
  if (/^(2|二)$|重要|有点重要|还行|中等/.test(s)) return 2
  return null
}

/** 规则判断紧急程度：3 很急 / 2 本周 / 1 不急，null=没提到。 */
export function parseUrgency(text) {
  const s = String(text ?? '')
  if (/^(1|一)$|不急|不着急|慢慢|有空|不赶/.test(s)) return 1
  if (/^(3|三)$|很急|特别急|紧急|加急|火烧|马上|立刻|今天就|赶紧|急/.test(s)) return 3
  if (/^(2|二)$|本周|这周|这几天|有点急|一般急/.test(s)) return 2
  return null
}

const CN_DIGIT = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
export function parseEstimate(text) {
  const s = String(text ?? '')
  let m = s.match(/(\d+(?:\.\d+)?)\s*(个)?(半)?\s*(小时|h\b|钟头)/i)
  if (m) return Math.round((Number(m[1]) + (m[3] ? 0.5 : 0)) * 60)
  m = s.match(/([一两二三四五六七八九十])(个)?(半)?(小时|钟头)/)
  if (m) return Math.round((CN_DIGIT[m[1]] + (m[3] ? 0.5 : 0)) * 60)
  if (/半(个)?(小时|钟头)/.test(s)) return 30
  m = s.match(/(\d+)\s*(分钟|min|m\b)/i)
  if (m) return Number(m[1])
  return null
}

const parseTrack = (s) => (/学习|读|看书|课程|练习|成长|复盘|英语|写作|健身|锻炼/.test(s) ? 'growth' : /家|买|生活|医院|缴费|快递|做饭|孩子|爸妈|朋友|旅游/.test(s) ? 'life' : 'work')

/** 去掉标题里的时间、紧急程度等修饰词。 */
function cleanTitle(s) {
  const t = String(s)
    .replace(/(大后天|后天|明天|今天|今晚|明早|明晚|下班前|这周|本周|下周[一二三四五六日天]?|周[一二三四五六日天末]|月底|\d{1,2}月\d{1,2}[日号]?|\d{1,2}[日号])(之前|前|内|以前)?/g, '')
    .replace(/(挺|很|非常|特别|有点|比较)?(急|紧急|重要|不急|着急)(的|了)?/g, '')
    .replace(/^(我)?(要|得|需要|想|准备|打算|记得|帮我记一下|提醒我)+/, '')
    .replace(/[，,]?\s*(大概|大约|预计|估计)?\s*(\d+(\.\d+)?|[一两二三四五六七八九十半])\s*(个)?半?\s*(小时|分钟|钟头)(左右)?/g, '')
    .replace(/[，,。.!！~\s]+$/g, '').replace(/^[，,。\s]+/, '').trim()
  return t || String(s).trim()
}

/** 规则版解析，模型不可用时兜底。 */
export function ruleIntake(text, now = new Date()) {
  const s = String(text ?? '').trim()
  return {
    title: cleanTitle(s).slice(0, 80), track: parseTrack(s), estimateMin: parseEstimate(s),
    importance: parseImportance(s), urgency: parseUrgency(s), due: parseDue(s, now), source: 'rule',
  }
}

export const INTAKE_SYSTEM = `你是任务录入助手。用户用一句口语描述要做的事，你从中提取任务字段，只输出 JSON：
{"title":"动词开头的具体任务标题，≤30字","track":"work|growth|life","estimateMin":数字或null,"importance":1|2|3|null,"urgency":1|2|3|null,"due":"YYYY-MM-DD"|"none"|null}
规则：
- importance：3 很重要，2 重要，1 一般。urgency：3 很急（今天/明天），2 本周内，1 不急。
- 只有用户**明确说到**才填 importance / urgency / due，否则一律填 null，不要猜。
- due 按给出的「今天」换算成具体日期；用户说没有截止时间就填 "none"。
- track：工作事务 work，学习/自我提升 growth，生活杂事 life。
- estimateMin：用户说了时长才填，否则 null。`

/** 校验模型输出，并用规则结果兜住模型漏掉的字段。 */
export function mergeIntake(ai, rule) {
  const lv = (v) => ([1, 2, 3].includes(Number(v)) ? Number(v) : null)
  const due = typeof ai?.due === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(ai.due) || ai.due === 'none') ? ai.due : null
  const est = Number(ai?.estimateMin)
  return {
    title: (typeof ai?.title === 'string' && ai.title.trim() ? ai.title.trim() : rule.title).slice(0, 80),
    track: ['work', 'growth', 'life'].includes(ai?.track) ? ai.track : rule.track,
    estimateMin: est >= 5 && est <= 600 ? Math.round(est) : rule.estimateMin,
    importance: lv(ai?.importance) ?? rule.importance,
    urgency: lv(ai?.urgency) ?? rule.urgency,
    due: due ?? rule.due,
    source: 'ai',
  }
}

export const ANSWER_SYSTEM = `用户在回答任务录入的追问。根据字段名把回答转成值，只输出 JSON {"value": ...}：
- field=importance：3 很重要 / 2 重要 / 1 一般，无法判断填 null
- field=urgency：3 很急 / 2 本周内 / 1 不急，无法判断填 null
- field=due：按给出的「今天」换算成 "YYYY-MM-DD"；不设截止填 "none"；无法判断填 null
- field=estimateMin：分钟数，无法判断填 null`

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const todayLine = (now = new Date()) => `今天是 ${dateKey(now)}（${WEEK[now.getDay()]}）。`

/** 规则解析单个追问的回答。 */
export function ruleAnswer(field, text, now = new Date()) {
  if (field === 'importance') return parseImportance(text)
  if (field === 'urgency') return parseUrgency(text)
  if (field === 'due') return parseDue(text, now)
  if (field === 'estimateMin') return parseEstimate(text) ?? (Number(text) > 0 ? Math.round(Number(text)) : null)
  return null
}

export const validAnswer = (field, v) => {
  if (field === 'importance' || field === 'urgency') return [1, 2, 3].includes(Number(v)) ? Number(v) : null
  if (field === 'due') return v === 'none' || /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? v : null
  if (field === 'estimateMin') return Number(v) >= 5 && Number(v) <= 600 ? Math.round(Number(v)) : null
  return null
}
