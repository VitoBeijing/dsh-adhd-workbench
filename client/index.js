/* dsh-adhd-workbench 前端：纯 JS，React 由 DSH 模块加载器提供（不打包第二份 React）。 */
window.__ModuleLoader__.load({
  id: 'dsh-adhd-workbench',
  factory(require) {
    const React = require('react')
    const { createElement: h, useState, useEffect, useRef, useCallback, Fragment } = React
    const API = '/adhd-workbench/api'

    // ———————————————— 工具 ————————————————
    async function api(method, path, body) {
      const res = await fetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`)
      return data
    }
    const TRACK = { work: ['工作', '💼'], growth: ['成长', '🌱'], life: ['生活', '🏠'] }
    const IDEA_CAT = { personal: ['个人', '🧠'], work: ['工作', '💼'], life: ['生活', '🌿'] }
    const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
    const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前` }
    const cx = (...xs) => xs.filter(Boolean).join(' ')
    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }))
      const a = document.createElement('a'); a.href = url; a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }

    const css = `
.awb{--line:var(--dsw-alias-border-l1,color-mix(in srgb,currentColor 13%,transparent));--soft:var(--dsw-alias-bg-layer-1,color-mix(in srgb,currentColor 4%,transparent));--muted:var(--dsw-alias-label-secondary,color-mix(in srgb,currentColor 60%,transparent));--acc:#6c7cff;--acc2:#ff6fb5;--ok:#2fb67c;--warn:#e8a33d;--bad:#e5534b;
  height:100%;overflow:auto;padding:14px 16px 40px;font-size:13.5px;line-height:1.55;color:inherit;box-sizing:border-box}
.awb *{box-sizing:border-box}.awb h3,.awb h4,.awb p{margin:0}
.awb h3{font-size:15px;font-weight:650}.awb h4{font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 8px}
.awb .muted{color:var(--muted);font-size:12px}
.awb button,.awb input,.awb select,.awb textarea{font:inherit;color:inherit}
.awb .btn{appearance:none;border:1px solid var(--line);background:transparent;border-radius:9px;padding:4px 10px;cursor:pointer;font-size:12px;white-space:nowrap}
.awb .btn:hover:not(:disabled){background:color-mix(in srgb,currentColor 8%,transparent)}
.awb .btn:disabled{opacity:.45;cursor:not-allowed}
.awb .btn.pri{background:linear-gradient(135deg,var(--acc),var(--acc2));border-color:transparent;color:#fff;font-weight:600}
.awb .btn.ghost{border-color:transparent}.awb .btn.danger{color:var(--bad)}
.awb .in{border:1px solid var(--line);background:transparent;border-radius:9px;padding:6px 10px;min-width:0}
.awb textarea.in{width:100%;resize:vertical}
.awb .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.awb .grow{flex:1}
.awb .card{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--soft)}
.awb .tabs{display:flex;gap:4px;margin:10px 0 14px;border-bottom:1px solid var(--line);overflow-x:auto}
.awb .tab{border:0;background:none;padding:7px 10px;cursor:pointer;border-bottom:2px solid transparent;color:var(--muted);font-weight:550}
.awb .tab.on{color:inherit;border-bottom-color:var(--acc)}
.awb .badge{display:inline-flex;align-items:center;gap:3px;border-radius:6px;padding:0 6px;font-size:11px;background:color-mix(in srgb,currentColor 8%,transparent)}
.awb .badge.work{background:#6c7cff22}.awb .badge.growth{background:#2fb67c22}.awb .badge.life{background:#e8a33d22}
.awb .focus{border-radius:16px;padding:14px;background:linear-gradient(135deg,#6c7cff1f,#ff6fb51a);border:1px solid #6c7cff55}
.awb .focus .big{font-size:18px;font-weight:700;margin:4px 0}
.awb .clock{font-variant-numeric:tabular-nums;font-size:26px;font-weight:700;letter-spacing:1px}
.awb .clock.over{color:var(--warn)}
.awb .must{display:grid;gap:10px}
.awb .mcard{border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:var(--soft)}
.awb .mcard.cur{border-color:var(--acc);box-shadow:0 0 0 2px #6c7cff33}
.awb .mcard.dim{opacity:.55}
.awb .num{width:22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;font-size:12px;font-weight:700;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;flex:none}
.awb .bar{height:6px;border-radius:9px;background:color-mix(in srgb,currentColor 10%,transparent);overflow:hidden;margin:8px 0 4px}
.awb .bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--acc),var(--acc2));transition:width .3s}
.awb .steps{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:4px}
.awb .steps li{display:flex;gap:8px;align-items:flex-start;padding:3px 4px;border-radius:8px}
.awb .steps li.next{background:#6c7cff18;font-weight:600}
.awb .steps li.done span{text-decoration:line-through;color:var(--muted)}
.awb .small{display:grid;gap:4px}
.awb .small .it{display:flex;gap:8px;align-items:center;padding:5px 8px;border-radius:9px;border:1px dashed var(--line)}
.awb .blocks{display:grid;gap:3px}
.awb .blk{display:grid;grid-template-columns:96px 1fr;gap:8px;padding:4px 8px;border-radius:8px;font-size:12.5px}
.awb .blk.focus{background:#6c7cff14}.awb .blk.growth{background:#2fb67c14}.awb .blk.break{color:var(--muted)}.awb .blk.warmup{background:#e8a33d14}.awb .blk.batch{background:#ff6fb514}
.awb .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.awb .ws{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:10px}
.awb .sess{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.awb .sess:first-of-type{border-top:0}
.awb .dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--muted)}.awb .dot.running{background:var(--ok);box-shadow:0 0 0 3px #2fb67c33}
.awb .ideas{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.awb .chips{display:flex;gap:6px;flex-wrap:wrap}
.awb .chip{border:1px solid var(--line);border-radius:999px;padding:2px 10px;cursor:pointer;background:none;font-size:12px}
.awb .chip.on{background:color-mix(in srgb,var(--acc) 22%,transparent);border-color:var(--acc)}
.awb .msg{padding:10px 12px;border-radius:12px;margin:8px 0;max-width:92%}
.awb .msg.me{margin-left:auto;background:#6c7cff1c}
.awb .msg.coach{border:1px solid var(--line);background:var(--soft)}
.awb .paper{margin-top:8px;padding:10px 12px;border-radius:10px;background:#e8a33d1f;border:1px dashed #e8a33d}
.awb .clar{font-weight:700}.awb .clar.low{color:var(--bad)}.awb .clar.medium{color:var(--warn)}.awb .clar.high{color:var(--ok)}
.awb .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.awb .kpi{border:1px solid var(--line);border-radius:12px;padding:10px}.awb .kpi b{display:block;font-size:20px}
.awb .hours{display:flex;align-items:flex-end;gap:2px;height:70px;margin-top:6px}
.awb .hours i{flex:1;background:linear-gradient(0deg,var(--acc),var(--acc2));border-radius:3px 3px 0 0;min-height:1px}
.awb .ins{padding:8px 10px;border-radius:10px;margin-bottom:6px;border-left:3px solid var(--acc);background:var(--soft)}
.awb .ins.warn{border-left-color:var(--warn)}.awb .ins.good{border-left-color:var(--ok)}
.awb .toast{position:sticky;top:0;z-index:5;padding:8px 12px;border-radius:10px;margin-bottom:8px;background:#2fb67c22;border:1px solid #2fb67c66;animation:awbpop .4s}
.awb .toast.err{background:#e5534b1f;border-color:#e5534b66}
@keyframes awbpop{0%{transform:scale(.9);opacity:0}100%{transform:none;opacity:1}}
.awb pre.md{white-space:pre-wrap;font-size:12px;max-height:340px;overflow:auto;padding:10px;border-radius:10px;border:1px solid var(--line)}
.awb .ring text{font-weight:700}
.awb .intake .chat{max-height:300px;overflow:auto}
.awb .intake .msg{margin:4px 0;padding:7px 11px}
.awb .confirm{margin:6px 0;padding:10px 12px;border-radius:12px;border:1px solid var(--acc);background:#6c7cff12}
.awb .src{margin-bottom:18px}
.awb .src>.hd{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:2px solid var(--line);margin-bottom:10px;cursor:pointer}
.awb .wsgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.awb .wsgrid .ws{margin:0}
.awb .srcrow{display:grid;grid-template-columns:24px 120px 130px 1fr 70px 96px auto;gap:6px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
@media (max-width:760px){.awb .srcrow{grid-template-columns:24px 1fr 1fr}}
@media (prefers-reduced-motion:reduce){.awb *{animation:none!important;transition:none!important}}
`

    // ———————————————— 通用组件 ————————————————
    function Ring({ pct, size = 54 }) {
      const r = (size - 8) / 2, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.min(100, pct)
      const color = v >= 80 ? '#e5534b' : v >= 60 ? '#e8a33d' : '#2fb67c'
      return h('svg', { className: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': pct == null ? '上下文未知' : `上下文已用 ${v}%` },
        h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'currentColor', strokeOpacity: 0.12, strokeWidth: 6 }),
        h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, strokeWidth: 6, strokeLinecap: 'round', strokeDasharray: `${(c * v) / 100} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})`, style: { transition: 'stroke-dasharray .4s' } }),
        h('text', { x: '50%', y: '50%', dominantBaseline: 'central', textAnchor: 'middle', fontSize: size * 0.24, fill: 'currentColor' }, pct == null ? '—' : `${Math.round(v)}%`))
    }
    const Badge = ({ track }) => h('span', { className: cx('badge', track) }, TRACK[track]?.[1], ' ', TRACK[track]?.[0] ?? track)
    function Stars({ value, onChange, label }) {
      return h('span', { className: 'row', style: { gap: 2 }, title: label }, [1, 2, 3].map((n) => h('button', { key: n, type: 'button', className: 'btn ghost', style: { padding: '0 3px' }, 'aria-label': `${label} ${n}`, onClick: () => onChange(n) }, n <= value ? '●' : '○')))
    }

    // ———————————————— 任务动作（各视图共用） ————————————————
    function useActions({ reload, notify }) {
      const [busy, setBusy] = useState(null)
      const run = async (key, fn, ok) => {
        setBusy(key)
        try { const r = await fn(); if (ok) notify(typeof ok === 'function' ? ok(r) : ok); await reload(); return r } catch (e) { notify(e.message, true) } finally { setBusy(null) }
      }
      return {
        busy,
        add: (body) => run('add', () => api('POST', '/tasks', body), '已加入任务池'),
        patch: (id, body, ok) => run(`p${id}`, () => api('PATCH', `/tasks/${id}`, body), ok),
        remove: (id) => run(`d${id}`, () => api('DELETE', `/tasks/${id}`), '已删除'),
        split: (id, replace) => run(`s${id}`, () => api('POST', `/tasks/${id}/split`, { replace }), (r) => (r.source === 'ai' ? '✂️ AI 已拆成小步' : '✂️ 已按模板拆分（模型不可用）')),
        addStep: (id, title) => run(`as${id}`, () => api('POST', `/tasks/${id}/steps`, { title, estimateMin: 15 })),
        step: (id, sid, done) => run(`st${sid}`, () => api('PATCH', `/tasks/${id}/steps/${sid}`, { done }), (r) => (r.taskDone ? '🎉 整个任务完成！记得写一句汇报要点' : done ? `✅ 又推进一步！${['干得漂亮', '继续保持', '节奏很好', '离目标更近了'][Math.floor(Math.random() * 4)]}` : null)),
        delStep: (id, sid) => run(`ds${sid}`, () => api('DELETE', `/tasks/${id}/steps/${sid}`)),
        focus: (id, action, stepId) => run(`f${id}`, () => api('POST', `/tasks/${id}/focus`, { action, stepId }), (r) => (action === 'start' ? '⏱ 开始专注，其他念头先丢进灵感库' : action === 'stop' ? `本次专注 ${r.minutes} 分钟` : '已记录一次打断，没关系，回到当前这一步')),
        note: (id, kind, text) => run(`n${id}`, () => api('POST', `/tasks/${id}/notes`, { kind, text }), '📝 已记录汇报要点'),
        delNote: (id, nid) => run(`dn${nid}`, () => api('DELETE', `/tasks/${id}/notes/${nid}`)),
      }
    }

    // 顶部专注条：一次只显示「当前这一步」
    function FocusBar(props) {
      const { plan } = props
      const act = useActions(props)
      const [now, setNow] = useState(Date.now())
      const alerted = useRef(false)
      const active = plan.active
      const target = plan.stats.focusMinutes * 60000
      useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [active])
      const elapsed = active ? now - active.start : 0
      useEffect(() => {
        if (!active) { alerted.current = false; document.title = document.title.replace(/^⏱.*? · /, ''); return }
        document.title = `⏱${fmtClock(elapsed)} · ${document.title.replace(/^⏱.*? · /, '')}`
        if (elapsed >= target && !alerted.current) { alerted.current = true; props.notify(`⏰ 已专注 ${plan.stats.focusMinutes} 分钟，起来活动 5 分钟吧`) }
      }, [elapsed, active])
      const all = [...plan.must, ...plan.small, ...plan.backlog]
      const activeTask = active && all.find((t) => t.id === active.taskId)
      const next = plan.next
      if (!next && !activeTask) return h('div', { className: 'focus' }, h('div', { className: 'big' }, plan.doneToday.length ? `🎉 今天的必做都清空了（完成 ${plan.doneToday.length} 项）` : '还没有任务'), h('p', { className: 'muted' }, plan.doneToday.length ? '可以收工，或者从小任务里挑一个。' : '在下面「今日」里加一个任务，越小越好。'))
      const taskId = activeTask?.id ?? next.taskId
      const task = all.find((t) => t.id === taskId)
      const step = (task?.steps ?? []).find((s) => !s.done)
      return h('div', { className: 'focus', 'aria-live': 'polite' },
        h('div', { className: 'row' },
          h('div', { className: 'grow' },
            h('span', { className: 'muted' }, activeTask ? '正在专注' : '现在只做这一步'),
            h('div', { className: 'big' }, step ? step.title : next?.stepTitle ?? task?.title),
            h('span', { className: 'muted' }, `属于：${task?.title ?? ''}${step ? ` · 预计 ${step.estimateMin} 分钟` : ''}`)),
          active && h('div', { className: cx('clock', elapsed >= target && 'over') }, fmtClock(elapsed))),
        h('div', { className: 'row', style: { marginTop: 8 } },
          !active && h('button', { className: 'btn pri', onClick: () => act.focus(taskId, 'start', step?.id) }, '▶ 开始专注'),
          active && step && h('button', { className: 'btn pri', onClick: () => act.step(taskId, step.id, true) }, '✓ 这一步完成'),
          active && h('button', { className: 'btn', onClick: () => act.focus(taskId, 'interrupt') }, '😵 被打断了'),
          active && h('button', { className: 'btn', onClick: () => act.focus(taskId, 'stop') }, '⏸ 暂停'),
          !step && task && h('button', { className: 'btn', disabled: act.busy === `s${taskId}`, onClick: () => act.split(taskId) }, act.busy === `s${taskId}` ? '拆分中…' : '✂️ 帮我拆成小步'),
          h('span', { className: 'muted' }, active ? `目标 ${plan.stats.focusMinutes} 分钟（按你的习惯设定）` : '卡住了？去「今日」点「换一个」')))
    }

    // ———————— 对话式录入：说一句话，没说清的重要 / 紧急 / 截止日期逐项追问 ————————
    const IMP = { 3: '很重要', 2: '重要', 1: '一般' }
    const URG = { 3: '很急（今明两天）', 2: '这周内', 1: '不急' }
    const dueLabel = (d) => (d === 'none' ? '不设截止' : d ? `📅 ${d}` : '')
    const ASK = {
      importance: { q: '这件事有多重要？', chips: [[3, '很重要'], [2, '重要'], [1, '一般']] },
      urgency: { q: '有多急？', chips: [[3, '很急（今明两天）'], [2, '这周内'], [1, '不急']] },
      due: { q: '有截止日期吗？可以直接说「下周三」「11月20日」。', chips: [[null, '今天'], [null, '明天'], [null, '本周五'], [null, '下周一'], ['none', '没有截止']] },
    }
    const ORDER = ['importance', 'urgency', 'due']

    function IntakeChat({ onAdded, notify }) {
      const hello = { bot: '想做什么？随口说一句就行，比如「明天下班前把内链方案发给老板，挺急的」。' }
      const [msgs, setMsgs] = useState([hello])
      const [draft, setDraft] = useState(null)
      const [ask, setAsk] = useState(null) // 正在追问的字段
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const endRef = useRef(null)
      useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [msgs, ask])
      const say = (m) => setMsgs((x) => [...x, m])
      const nextField = (d) => ORDER.find((f) => d[f] == null) ?? null
      const advance = (d) => { setDraft(d); const f = nextField(d); setAsk(f); if (f) say({ bot: ASK[f].q, field: f }) }
      const reset = () => { setMsgs([hello]); setDraft(null); setAsk(null); setText('') }

      const submit = async (e) => {
        e?.preventDefault(); const t = text.trim(); if (!t || busy) return
        setText(''); say({ me: t }); setBusy(true)
        try {
          if (!draft) {
            const { draft: d } = await api('POST', '/intake/parse', { text: t })
            const known = [d.importance && IMP[d.importance], d.urgency && URG[d.urgency], d.due && dueLabel(d.due)].filter(Boolean)
            say({ bot: `好，记下「${d.title}」（${TRACK[d.track][1]} ${TRACK[d.track][0]}${d.estimateMin ? `，约 ${d.estimateMin} 分钟` : ''}）。${known.length ? `听出来：${known.join('、')}。` : ''}` })
            advance(d)
          } else if (ask) {
            const r = await api('POST', '/intake/answer', { field: ask, text: t })
            if (r.value == null) say({ bot: '没太听懂，换个说法，或者点下面的选项？', field: ask })
            else advance({ ...draft, [ask]: r.value })
          } else {
            // 确认阶段继续说话：当作改标题
            setDraft({ ...draft, title: t.slice(0, 80) }); say({ bot: `标题改成「${t.slice(0, 80)}」。` })
          }
        } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const pickChip = async (field, value, label) => {
        if (busy) return
        say({ me: label })
        if (field !== 'due' || value === 'none') return advance({ ...draft, [field]: value })
        setBusy(true)
        try { const r = await api('POST', '/intake/answer', { field, text: label }); advance({ ...draft, [field]: r.value ?? 'none' }) } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const confirm = async () => {
        setBusy(true)
        try {
          await api('POST', '/tasks', { title: draft.title, track: draft.track, importance: draft.importance, urgency: draft.urgency, estimateMin: draft.estimateMin ?? 30, due: draft.due === 'none' ? null : draft.due })
          notify(`✅ 已加入：${draft.title}`); reset(); onAdded()
        } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const last = msgs[msgs.length - 1]
      const ready = draft && !ask
      return h('div', { className: 'card intake' },
        h('div', { className: 'chat' }, msgs.map((m, i) => h('div', { key: i, className: cx('msg', m.me ? 'me' : 'coach') }, m.me ?? m.bot)),
          ask && last?.field === ask && h('div', { className: 'chips', style: { margin: '2px 0 6px' } }, ASK[ask].chips.map(([v, l]) => h('button', { key: l, className: 'chip', disabled: busy, onClick: () => pickChip(ask, v ?? l, l) }, l))),
          ready && h('div', { className: 'confirm' },
            h('b', null, draft.title),
            h('div', { className: 'row', style: { marginTop: 6 } },
              h('span', { className: 'chips' }, Object.entries(TRACK).map(([k, [l, ic]]) => h('button', { key: k, className: cx('chip', draft.track === k && 'on'), onClick: () => setDraft({ ...draft, track: k }) }, `${ic} ${l}`))),
              h('label', { className: 'muted' }, '预计 ', h('input', { className: 'in', type: 'number', min: 5, step: 5, style: { width: 64, padding: '2px 6px' }, value: draft.estimateMin ?? 30, onChange: (e) => setDraft({ ...draft, estimateMin: Number(e.target.value) }) }), ' 分钟')),
            h('div', { className: 'row', style: { marginTop: 6 } },
              ORDER.map((f) => h('button', { key: f, className: 'badge', style: { border: 0, cursor: 'pointer' }, title: '点击重新回答', onClick: () => { setAsk(f); say({ bot: ASK[f].q, field: f }) } },
                f === 'importance' ? `重要：${IMP[draft.importance]}` : f === 'urgency' ? `紧急：${URG[draft.urgency]}` : dueLabel(draft.due), ' ✎'))),
            h('div', { className: 'row', style: { marginTop: 8 } },
              h('button', { className: 'btn pri', disabled: busy, onClick: confirm }, '✓ 加入任务'),
              h('button', { className: 'btn ghost', onClick: reset }, '重来'),
              h('span', { className: 'muted' }, '想改标题就直接再说一句'))),
          busy && h('p', { className: 'muted' }, '想一下…'),
          h('div', { ref: endRef })),
        h('form', { className: 'row', style: { marginTop: 6 }, onSubmit: submit },
          h('input', { className: 'in grow', value: text, 'aria-label': '用一句话说任务', placeholder: !draft ? '我要…' : ask ? '直接回答，或点上面的选项' : '改标题，或点「加入任务」', onChange: (e) => setText(e.target.value) }),
          h('button', { className: 'btn pri', disabled: busy || !text.trim() }, '发送'),
          draft && h('button', { type: 'button', className: 'btn ghost', onClick: reset }, '清空')))
    }

    function TaskCard({ t, index, act, isCurrent, dim, onSwap }) {
      const [open, setOpen] = useState(isCurrent)
      const [stepText, setStepText] = useState('')
      const [noteText, setNoteText] = useState('')
      const [noteKind, setNoteKind] = useState('done')
      const steps = t.steps ?? []
      const doneN = steps.filter((s) => s.done).length
      const nextStep = steps.find((s) => !s.done)
      const pct = steps.length ? Math.round((doneN / steps.length) * 100) : t.status === 'done' ? 100 : 0
      return h('div', { className: cx('mcard', isCurrent && 'cur', dim && 'dim') },
        h('div', { className: 'row' },
          index != null && h('span', { className: 'num' }, index + 1),
          h('b', { className: 'grow', style: { cursor: 'pointer' }, onClick: () => setOpen(!open) }, t.title),
          h(Badge, { track: t.track }),
          h('span', { className: 'muted', title: '已按你的速度系数修正' }, `≈${t.adjustedEstimate ?? t.estimateMin} 分钟`),
          t.due && h('span', { className: 'badge' }, `📅 ${t.due}`)),
        h('div', { className: 'bar' }, h('i', { style: { width: `${pct}%` } })),
        h('div', { className: 'row' },
          h('span', { className: 'muted grow' }, steps.length ? `${doneN}/${steps.length} 步 · 已专注 ${t.actualMin} 分钟` : '还没拆分（大任务先拆，阻力会小很多）'),
          !steps.length && h('button', { className: 'btn', disabled: act.busy === `s${t.id}`, onClick: () => act.split(t.id) }, act.busy === `s${t.id}` ? '拆分中…' : '✂️ 拆分'),
          h('button', { className: 'btn', onClick: () => act.focus(t.id, 'start', nextStep?.id) }, '▶ 专注'),
          onSwap && h('button', { className: 'btn', title: '换一个必做任务（不评判，换个方向也是推进）', onClick: onSwap }, '🔀 换一个'),
          h('button', { className: 'btn ghost', onClick: () => setOpen(!open), 'aria-expanded': open }, open ? '收起' : '展开')),
        open && h(Fragment, null,
          h('ul', { className: 'steps' }, steps.map((s) => h('li', { key: s.id, className: cx(s.done && 'done', s === nextStep && 'next') },
            h('input', { type: 'checkbox', checked: s.done, onChange: (e) => act.step(t.id, s.id, e.target.checked), 'aria-label': s.title }),
            h('span', { className: 'grow' }, s.title), h('span', { className: 'muted' }, `${s.estimateMin}′`),
            h('button', { className: 'btn ghost', 'aria-label': '删除步骤', onClick: () => act.delStep(t.id, s.id) }, '×')))),
          h('form', { className: 'row', style: { marginTop: 6 }, onSubmit: (e) => { e.preventDefault(); if (stepText.trim()) { act.addStep(t.id, stepText.trim()); setStepText('') } } },
            h('input', { className: 'in grow', placeholder: '手动加一步…', value: stepText, onChange: (e) => setStepText(e.target.value) }),
            steps.length > 0 && h('button', { type: 'button', className: 'btn', onClick: () => act.split(t.id, false) }, '✂️ 重新拆剩余部分')),
          h('h4', null, '汇报要点（做完顺手记一句，周报不用愁）'),
          (t.notes ?? []).map((n) => h('div', { key: n.id, className: 'row' }, h('span', { className: 'badge' }, { done: '做了', approach: '方案', result: '结果', issue: '问题' }[n.kind]), h('span', { className: 'grow' }, n.text), h('button', { className: 'btn ghost', onClick: () => act.delNote(t.id, n.id) }, '×'))),
          h('form', { className: 'row', style: { marginTop: 6 }, onSubmit: (e) => { e.preventDefault(); if (noteText.trim()) { act.note(t.id, noteKind, noteText.trim()); setNoteText('') } } },
            h('select', { className: 'in', value: noteKind, onChange: (e) => setNoteKind(e.target.value) }, [['done', '做了什么'], ['approach', '执行方案'], ['result', '结果/数据'], ['issue', '问题/风险']].map(([v, l]) => h('option', { key: v, value: v }, l))),
            h('input', { className: 'in grow', placeholder: '例如：内链覆盖率从 40% 提到 75%', value: noteText, onChange: (e) => setNoteText(e.target.value) }),
            h('button', { className: 'btn' }, '记录')),
          h('div', { className: 'row', style: { marginTop: 8 } },
            h('span', { className: 'muted' }, '重要'), h(Stars, { value: t.importance, label: '重要', onChange: (v) => act.patch(t.id, { importance: v }) }),
            h('span', { className: 'muted' }, '紧急'), h(Stars, { value: t.urgency, label: '紧急', onChange: (v) => act.patch(t.id, { urgency: v }) }),
            h('span', { className: 'grow' }),
            t.status !== 'done' && h('button', { className: 'btn', onClick: () => act.patch(t.id, { status: 'done' }, '🎉 完成！') }, '✓ 标记完成'),
            h('button', { className: 'btn ghost', onClick: () => act.patch(t.id, { status: 'dropped' }, '已放下这个任务（放下也是一种决定）') }, '放下'),
            h('button', { className: 'btn ghost danger', onClick: () => { if (confirm(`删除「${t.title}」？`)) act.remove(t.id) } }, '删除'))))
    }

    function Today(props) {
      const { plan } = props
      const act = useActions(props)
      const [showBacklog, setShowBacklog] = useState(false)
      if (!plan) return h('p', { className: 'muted' }, '加载中…')
      const swap = (t) => { const alt = plan.backlog[0] ?? plan.small[0]; if (!alt) return props.notify('任务池里没有可替换的任务', true); act.patch(t.id, { snoozeDate: true }).then(() => act.patch(alt.id, { pinnedDate: true }, `已换成「${alt.title}」，原任务明天再排`)) }
      return h(Fragment, null,
        h(IntakeChat, { onAdded: props.reload, notify: props.notify }),
        plan.capacityChange && h('div', { className: 'ins good', style: { marginTop: 8 } }, '📊 ', plan.capacityChange),
        h('h4', null, `三大必做（按优先级 + 截止日期自动选出${plan.workday ? '，含 1 个成长任务' : '，休息日不排工作'}）`),
        plan.must.length ? h('div', { className: 'must' }, plan.must.map((t, i) => h(TaskCard, { key: t.id, t, index: i, act, isCurrent: plan.next?.taskId === t.id, dim: plan.next && plan.next.taskId !== t.id && !plan.active, onSwap: () => swap(t) })))
          : h('p', { className: 'muted' }, '任务池是空的。先加一个最小的任务吧，比如「打开项目文档」。'),
        plan.small.length > 0 && h(Fragment, null, h('h4', null, '小任务（≤20 分钟，专注间隙或没状态时做）'),
          h('div', { className: 'small' }, plan.small.map((t) => h('div', { key: t.id, className: 'it' },
            h('input', { type: 'checkbox', onChange: () => act.patch(t.id, { status: 'done' }, '✅ 小任务 +1'), 'aria-label': t.title }),
            h('span', { className: 'grow' }, t.title), h(Badge, { track: t.track }), h('span', { className: 'muted' }, `${t.adjustedEstimate}′`),
            h('button', { className: 'btn ghost', onClick: () => act.patch(t.id, { pinnedDate: true }, '已提为今日必做') }, '↑ 提为必做'))))),
        h('h4', null, '今日时间块（执行意图：到点就做这一件）'),
        plan.blocks.length ? h('div', { className: 'blocks' }, plan.blocks.map((b, i) => h('div', { key: i, className: cx('blk', b.kind) }, h('span', { className: 'muted' }, `${b.start}–${b.end}`), h('span', null, b.title))))
          : h('p', { className: 'muted' }, '今天的工作时间已过，或没有任务可排。'),
        plan.doneToday.length > 0 && h(Fragment, null, h('h4', null, `今天已完成 ${plan.doneToday.length} 项 🎉`), h('div', { className: 'small' }, plan.doneToday.map((t) => h('div', { key: t.id, className: 'it' }, '✅ ', h('span', { className: 'grow' }, t.title), h('span', { className: 'muted' }, `${t.actualMin} 分钟`), h('button', { className: 'btn ghost', onClick: () => act.patch(t.id, { status: 'todo' }) }, '撤销'))))),
        h('h4', null, h('button', { className: 'btn ghost', onClick: () => setShowBacklog(!showBacklog) }, `${showBacklog ? '▾' : '▸'} 任务池（${plan.backlog.length}）`)),
        showBacklog && h('div', { className: 'must' }, plan.backlog.map((t) => h(TaskCard, { key: t.id, t, act }))))
    }

    // ———————————————— 灵感库 ————————————————
    function Ideas({ notify, reload }) {
      const [ideas, setIdeas] = useState(null)
      const [text, setText] = useState('')
      const [cat, setCat] = useState('all')
      const [sub, setSub] = useState('all')
      const [q, setQ] = useState('')
      const [busy, setBusy] = useState(false)
      const load = () => api('GET', '/ideas').then((r) => setIdeas(r.ideas)).catch((e) => notify(e.message, true))
      useEffect(() => { load() }, [])
      const [preview, setPreview] = useState(null) // { items, source, rawText, replaceId }
      const [openRaw, setOpenRaw] = useState({})
      const topRef = useRef(null)
      // 先让 AI 拆分成多条，出预览；用户确认后才入库
      const split = async (raw, replaceId) => {
        setBusy(true)
        try { const r = await api('POST', '/ideas/split', { text: raw }); setPreview({ items: r.items, source: r.source, rawText: raw, replaceId }) } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const add = (e) => { e.preventDefault(); if (text.trim() && !busy) split(text.trim()) }
      const saveAll = async () => {
        const items = preview.items.filter((i) => i.text.trim())
        if (!items.length) return notify('至少保留一条', true)
        setBusy(true)
        try {
          await api('POST', '/ideas/batch', { items: items.map((i) => ({ ...i, source: preview.source })), rawText: preview.rawText, replaceId: preview.replaceId })
          notify(preview.replaceId ? `已拆成 ${items.length} 条，替换了原来那条` : `💡 收进 ${items.length} 条灵感`)
          if (!preview.replaceId) setText('')
          setPreview(null); load()
        } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const editItem = (k, patchObj) => setPreview({ ...preview, items: preview.items.map((x, j) => (j === k ? { ...x, ...patchObj } : x)) })
      const dropItem = (k) => setPreview({ ...preview, items: preview.items.filter((_x, j) => j !== k) })
      // 合并：正文拼接，分类沿用前一条
      const mergeDown = (k) => {
        const a = preview.items[k], b = preview.items[k + 1]; if (!b) return
        const merged = { ...a, text: `${a.text}；${b.text}`, raw: [a.raw, b.raw].filter(Boolean).join('\n'), tags: [...new Set([...(a.tags ?? []), ...(b.tags ?? [])])].slice(0, 6), nextAction: a.nextAction || b.nextAction }
        setPreview({ ...preview, items: [...preview.items.slice(0, k), merged, ...preview.items.slice(k + 2)] })
      }
      const patch = (id, body) => api('PATCH', `/ideas/${id}`, body).then(load).catch((e) => notify(e.message, true))
      const del = (id) => api('DELETE', `/ideas/${id}`).then(load).catch((e) => notify(e.message, true))
      const toTask = async (i) => {
        try { await api('POST', '/tasks', { title: (i.nextAction || i.text).slice(0, 200), detail: i.text, track: i.category === 'work' ? 'work' : i.category === 'life' ? 'life' : 'growth', fromIdea: i.id }); notify('已转成任务'); load(); reload() } catch (e) { notify(e.message, true) }
      }
      if (!ideas) return h('p', { className: 'muted' }, '加载中…')
      const inCat = ideas.filter((i) => cat === 'all' || i.category === cat)
      const subs = [...new Set(inCat.map((i) => i.subcategory))]
      const shown = inCat.filter((i) => (sub === 'all' || i.subcategory === sub) && (!q || `${i.text} ${i.subcategory} ${(i.tags ?? []).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
        .sort((a, b) => (b.starred - a.starred) || (b.createdAt - a.createdAt))
      return h(Fragment, null,
        h('div', { ref: topRef }),
        preview ? h('div', { className: 'card', style: { borderColor: 'var(--acc)' } },
          h('div', { className: 'row' },
            h('h3', { className: 'grow' }, `${preview.replaceId ? '重新拆分' : '拆出'} ${preview.items.length} 条，确认一下`),
            h('span', { className: 'muted' }, preview.source === 'ai' ? '🤖 AI 拆分' : '⚙️ 规则模式（模型没响应，按换行和编号拆）')),
          h('p', { className: 'muted', style: { margin: '4px 0 8px' } }, '可以改文字、改分类、删掉，或把相邻两条合并。'),
          preview.items.map((it, k) => h('div', { key: k, className: 'card', style: { marginBottom: 8, background: 'transparent' } },
            h('div', { className: 'row' },
              h('b', { className: 'muted' }, `${k + 1}.`),
              h('select', { className: 'in', style: { padding: '1px 4px', fontSize: 12 }, value: it.category, 'aria-label': '大类', onChange: (e) => editItem(k, { category: e.target.value }) }, Object.entries(IDEA_CAT).map(([c, [l, ic]]) => h('option', { key: c, value: c }, `${ic} ${l}`))),
              h('input', { className: 'in', style: { width: 110, padding: '1px 6px', fontSize: 12 }, value: it.subcategory, 'aria-label': '小类', onChange: (e) => editItem(k, { subcategory: e.target.value }) }),
              h('span', { className: 'grow' }),
              k < preview.items.length - 1 && h('button', { className: 'btn ghost', title: '和下一条合并', onClick: () => mergeDown(k) }, '⤓ 合并下一条'),
              h('button', { className: 'btn ghost danger', 'aria-label': '删除这条', onClick: () => dropItem(k) }, '×')),
            h('textarea', { className: 'in', rows: 1, style: { marginTop: 6 }, value: it.text, 'aria-label': '灵感内容', onChange: (e) => editItem(k, { text: e.target.value }) }),
            it.nextAction && h('p', { className: 'muted' }, `下一步：${it.nextAction}`),
            it.raw && it.raw !== it.text && h('p', { className: 'muted', style: { whiteSpace: 'pre-wrap' } }, `原话：${it.raw}`))),
          h('div', { className: 'row', style: { marginTop: 4 } },
            h('button', { className: 'btn pri', disabled: busy || !preview.items.length, onClick: saveAll }, busy ? '保存中…' : preview.replaceId ? `✓ 替换成这 ${preview.items.length} 条` : `✓ 全部入库（${preview.items.length}）`),
            h('button', { className: 'btn ghost', disabled: busy, onClick: () => setPreview(null) }, '取消')))
        : h('form', { className: 'card', onSubmit: add },
          h('textarea', { className: 'in', rows: 3, placeholder: '脑子里冒出什么就丢进来，一次写好几件也行，AI 会拆成多条并分别分类。专注时冒出的念头也放这里，回头再说。', value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(e) } }),
          h('div', { className: 'row', style: { marginTop: 6 } }, h('span', { className: 'muted grow' }, '⌘/Ctrl + Enter 提交 · 先预览，确认后才入库'), h('button', { className: 'btn pri', disabled: busy || !text.trim() }, busy ? 'AI 拆分中…' : '💡 拆分并预览'))),
        h('div', { className: 'chips', style: { marginTop: 12 } },
          [['all', '全部'], ...Object.entries(IDEA_CAT).map(([k, [l, i]]) => [k, `${i} ${l}`])].map(([k, l]) => h('button', { key: k, className: cx('chip', cat === k && 'on'), onClick: () => { setCat(k); setSub('all') } }, `${l} ${k === 'all' ? ideas.length : ideas.filter((i) => i.category === k).length}`))),
        subs.length > 0 && h('div', { className: 'chips', style: { marginTop: 6 } },
          [['all', '全部小类'], ...subs.map((s) => [s, s])].map(([k, l]) => h('button', { key: k, className: cx('chip', sub === k && 'on'), onClick: () => setSub(k) }, k === 'all' ? l : `${l} ${inCat.filter((i) => i.subcategory === k).length}`)),
          h('input', { className: 'in', style: { marginLeft: 'auto' }, placeholder: '搜索…', value: q, onChange: (e) => setQ(e.target.value) })),
        h('div', { className: 'ideas', style: { marginTop: 10 } }, shown.length ? shown.map((i) => h('div', { key: i.id, className: 'card' },
          h('div', { className: 'row' },
            h('select', { className: 'in', style: { padding: '1px 4px', fontSize: 12 }, value: i.category, onChange: (e) => patch(i.id, { category: e.target.value }), 'aria-label': '大类' }, Object.entries(IDEA_CAT).map(([k, [l, ic]]) => h('option', { key: k, value: k }, `${ic} ${l}`))),
            h('button', { className: 'badge', style: { border: 0, cursor: 'pointer' }, title: '点击修改小类', onClick: () => { const v = prompt('小类', i.subcategory); if (v) patch(i.id, { subcategory: v }) } }, `# ${i.subcategory}`),
            h('span', { className: 'grow' }),
            h('button', { className: 'btn ghost', 'aria-label': '星标', onClick: () => patch(i.id, { starred: !i.starred }) }, i.starred ? '★' : '☆')),
          h('p', { style: { margin: '8px 0', whiteSpace: 'pre-wrap' } }, i.text),
          i.nextAction && h('p', { className: 'muted' }, `下一步：${i.nextAction}`),
          (i.rawText || i.fullText) && (i.rawText !== i.text || i.fullText) && h('div', { style: { marginTop: 4 } },
            h('button', { className: 'btn ghost', style: { padding: '0 4px' }, onClick: () => setOpenRaw({ ...openRaw, [i.id]: !openRaw[i.id] }) }, openRaw[i.id] ? '▾ 收起原话' : '▸ 原话'),
            openRaw[i.id] && h('p', { className: 'muted', style: { whiteSpace: 'pre-wrap', margin: '4px 0 0 8px' } }, i.rawText || i.fullText,
              i.fullText && i.fullText !== i.rawText && h(Fragment, null, '\n\n— 整段原话 —\n', i.fullText))),
          h('div', { className: 'row', style: { marginTop: 6 } },
            h('span', { className: 'muted grow' }, ago(i.createdAt)),
            h('button', { className: 'btn ghost', disabled: busy || !!preview, title: '这条里写了好几件事？让 AI 拆开', onClick: () => { split(i.rawText || i.text, i.id); topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) } }, '✂️ AI 重新拆分'),
            i.taskId ? h('span', { className: 'badge' }, '已转任务') : h('button', { className: 'btn', onClick: () => toTask(i) }, '→ 转任务'),
            h('button', { className: 'btn ghost danger', onClick: () => { if (confirm('删除这条灵感？')) del(i.id) } }, '删除'))))
          : h('p', { className: 'muted' }, ideas.length ? '没有匹配的灵感' : '灵感库还是空的。')))
    }

    // ———————————————— 工作区看板 ————————————————
    function Workspaces({ notify, goSettings }) {
      const [data, setData] = useState(null)
      const load = () => api('GET', '/workspaces').then(setData).catch((e) => notify(e.message, true))
      useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [])
      const [closed, setClosed] = useState({})
      if (!data) return h('p', { className: 'muted' }, '读取工作区…')
      const section = (src) => h('section', { key: src.id, className: 'src' },
        h('div', { className: 'hd', onClick: () => setClosed({ ...closed, [src.id]: !closed[src.id] }) },
          h('span', null, closed[src.id] ? '▸' : '▾'), h('h3', null, src.label),
          h('span', { className: 'muted grow', title: src.path }, src.ok ? `${src.workspaces.length} 个工作区` : '读取失败'),
          h('span', { className: 'muted' }, src.path)),
        closed[src.id] ? null : !src.ok ? h('p', { className: 'muted' }, src.error) : !src.workspaces.length ? h('p', { className: 'muted' }, '暂无会话') : h('div', { className: 'wsgrid' }, src.workspaces.map((w) => h('div', { key: w.id, className: 'ws' },
          h('div', { className: 'row' }, h('b', { className: 'grow', title: w.path }, `📁 ${w.title}`), h('span', { className: 'muted' }, `共 ${w.total} 个会话，显示最近 2 个`)),
          w.sessions.length ? w.sessions.map((s) => h('div', { key: s.id, className: 'sess' },
            h(Ring, { pct: s.contextPct }),
            h('div', { className: 'grow', style: { minWidth: 0 } },
              h('div', { className: 'row', style: { gap: 6 } }, h('span', { className: cx('dot', s.status) }), h('b', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' } }, s.title)),
              h('div', { className: 'muted' }, `${{ running: '运行中', error: '出错' }[s.status] ?? '空闲'} · ${ago(s.lastActiveAt)}${s.model ? ` · ${s.model}` : ''}${s.branch ? ` · ⎇ ${s.branch}` : ''}`),
              s.todos?.total > 0 && h('div', { className: 'muted' }, `任务 ${s.todos.done}/${s.todos.total}${s.todos.current ? ` · 进行中：${s.todos.current}` : ''}`),
              h('div', { className: 'muted' }, s.contextWindow ? `上下文 ${Math.round((s.contextUsed ?? 0) / 1000)}k / ${Math.round(s.contextWindow / 1000)}k tokens${s.contextPct >= 80 ? ' · ⚠️ 快满了，考虑压缩或新开会话' : ''}` : '暂无上下文数据')))) : h('p', { className: 'muted' }, '暂无会话')))))
      return h(Fragment, null,
        h('div', { className: 'row', style: { marginBottom: 10 } }, h('span', { className: 'muted grow' }, `每 30 秒刷新 · 上次 ${new Date(data.at).toLocaleTimeString()} · 每个工作区显示最近 2 个会话`),
          h('button', { className: 'btn', onClick: () => goSettings?.() }, '⚙️ 配置 Agent'), h('button', { className: 'btn', onClick: load }, '↻ 刷新')),
        data.sources.length ? data.sources.map(section) : h('p', { className: 'muted' }, '还没有启用任何 Agent，去「设置」里添加。'))
    }

    // ———————————————— 设置：Agent 来源 ————————————————
    function Settings({ notify }) {
      const [list, setList] = useState(null)
      const [types, setTypes] = useState([])
      const [dirty, setDirty] = useState(false)
      const load = () => api('GET', '/sources').then((r) => { setList(r.sources); setTypes(r.types); setDirty(false) }).catch((e) => notify(e.message, true))
      useEffect(() => { load() }, [])
      if (!list) return h('p', { className: 'muted' }, '加载中…')
      const typeOf = (t) => types.find((x) => x.type === t)
      const upd = (i, patch) => { setList(list.map((s, k) => (k === i ? { ...s, ...patch } : s))); setDirty(true) }
      const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n); setDirty(true) }
      const del = (i) => { setList(list.filter((_s, k) => k !== i)); setDirty(true) }
      const add = () => { const t = types[0]; setList([...list, { id: `${t.type}-${Date.now().toString(36)}`, type: t.type, label: t.label, path: t.defaultPath, enabled: true, maxWorkspaces: 6 }]); setDirty(true) }
      const save = () => api('PUT', '/sources', { sources: list }).then((r) => { setList(r.sources); setDirty(false); notify('已保存，工作区看板会按这个顺序显示') }).catch((e) => notify(e.message, true))
      const reset = () => { if (confirm('恢复成自动检测的默认配置？')) api('POST', '/sources/reset', {}).then(() => { load(); notify('已恢复默认') }).catch((e) => notify(e.message, true)) }
      return h(Fragment, null,
        h('h4', { style: { marginTop: 0 } }, 'Agent 来源（工作区看板按这里的顺序从上到下显示）'),
        h('div', { className: 'card' },
          h('div', { className: 'srcrow muted', style: { borderTop: 0 } }, h('span', null, '启用'), h('span', null, '名称'), h('span', null, '类型'), h('span', null, '数据目录'), h('span', null, '工作区数'), h('span', { title: '留空则自动判断' }, '上下文窗口'), h('span')),
          list.map((s, i) => h('div', { key: s.id, className: 'srcrow' },
            h('input', { type: 'checkbox', checked: s.enabled, 'aria-label': '启用', onChange: (e) => upd(i, { enabled: e.target.checked }) }),
            h('input', { className: 'in', value: s.label, 'aria-label': '名称', onChange: (e) => upd(i, { label: e.target.value }) }),
            h('select', { className: 'in', value: s.type, 'aria-label': '类型', onChange: (e) => { const t = typeOf(e.target.value); upd(i, { type: t.type, label: s.label === typeOf(s.type)?.label ? t.label : s.label, path: t.defaultPath }) } }, types.map((t) => h('option', { key: t.type, value: t.type }, t.label))),
            h('input', { className: 'in', value: s.path, 'aria-label': '数据目录', placeholder: typeOf(s.type)?.defaultPath, onChange: (e) => upd(i, { path: e.target.value }) }),
            h('input', { className: 'in', type: 'number', min: 1, max: 20, value: s.maxWorkspaces ?? 6, 'aria-label': '最多显示几个工作区', onChange: (e) => upd(i, { maxWorkspaces: Number(e.target.value) }) }),
            h('input', { className: 'in', type: 'number', min: 1000, step: 1000, placeholder: '自动', value: s.contextWindow ?? '', 'aria-label': '上下文窗口 tokens', onChange: (e) => upd(i, { contextWindow: e.target.value ? Number(e.target.value) : undefined }) }),
            h('span', { className: 'row', style: { gap: 2, flexWrap: 'nowrap' } },
              h('button', { className: 'btn ghost', 'aria-label': '上移', onClick: () => move(i, -1) }, '↑'),
              h('button', { className: 'btn ghost', 'aria-label': '下移', onClick: () => move(i, 1) }, '↓'),
              h('button', { className: 'btn ghost danger', 'aria-label': '删除', onClick: () => del(i) }, '×')))),
          h('div', { className: 'row', style: { marginTop: 10 } },
            h('button', { className: 'btn', onClick: add }, '＋ 添加 Agent'),
            h('span', { className: 'grow' }),
            h('button', { className: 'btn ghost', onClick: reset }, '恢复默认'),
            h('button', { className: 'btn pri', disabled: !dirty, onClick: save }, dirty ? '保存' : '已保存'))),
        h('p', { className: 'muted', style: { marginTop: 8 } }, '支持 DeepSeek Harness、Codex、Claude Code、OpenCode、WorkBuddy。同一种 Agent 可以加多个（比如两个 Codex 数据目录）。插件只读这些目录，不会改动里面的数据。'))
    }

    // ———————————————— 教练 ————————————————
    function Coach({ notify, reload }) {
      const [msgs, setMsgs] = useState([])
      const [text, setText] = useState('')
      const [busy, setBusy] = useState(false)
      const send = async (e) => {
        e?.preventDefault(); const m = text.trim(); if (!m) return
        setMsgs((x) => [...x, { me: m }]); setText(''); setBusy(true)
        try { const r = await api('POST', '/coach', { message: m }); setMsgs((x) => [...x, { coach: r }]) } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const addTask = async (t) => { try { await api('POST', '/tasks', t); notify(`已加入任务：${t.title}`); reload() } catch (e) { notify(e.message, true) } }
      const label = { high: '清晰', medium: '还差一点', low: '还比较模糊' }
      return h(Fragment, null,
        h('p', { className: 'muted' }, '说说你现在想做的事或遇到的问题。教练会帮你把它说具体：对象、第一步动作、交付物、完成标准、时间。'),
        h('div', { style: { minHeight: 120 } }, msgs.length === 0 && h('div', { className: 'msg coach' }, '👋 试试说一句：「SEO 那块感觉有点乱，想优化一下」'),
          msgs.map((m, i) => m.me ? h('div', { key: i, className: 'msg me' }, m.me) : h('div', { key: i, className: 'msg coach' },
            h('div', null, '表达清晰度：', h('span', { className: cx('clar', m.coach.clarity) }, label[m.coach.clarity]), m.coach.missing.length > 0 && h('span', { className: 'muted' }, ` · 缺：${m.coach.missing.join('、')}`)),
            m.coach.rewrite && h('p', { style: { marginTop: 6 } }, '🎯 具体说法：', h('b', null, m.coach.rewrite)),
            m.coach.questions.length > 0 && h('ul', { style: { margin: '6px 0 0', paddingLeft: 18 } }, m.coach.questions.map((q, k) => h('li', { key: k }, q))),
            m.coach.paper && h('div', { className: 'paper' }, '✍️ ', h('b', null, '先停一下，拿出纸笔。'), ' ', m.coach.paperPrompt || '花 3 分钟在纸上写下：现在是什么样 → 卡在哪 → 想要的结果。想清楚了再回来告诉我。'),
            h('div', { className: 'row', style: { marginTop: 8 } }, m.coach.encourage && h('span', { className: 'muted grow' }, `💬 ${m.coach.encourage}`),
              m.coach.task && m.coach.clarity !== 'low' && h('button', { className: 'btn', onClick: () => addTask(m.coach.task) }, `＋ 加为任务（${m.coach.task.estimateMin} 分钟）`),
              m.coach.source === 'rule' && h('span', { className: 'badge' }, '规则模式'))))),
        busy && h('p', { className: 'muted' }, '教练在想…'),
        h('form', { className: 'row', style: { marginTop: 8 }, onSubmit: send },
          h('textarea', { className: 'in grow', rows: 2, value: text, placeholder: '我想… / 我卡在… / 老板让我…', onChange: (e) => setText(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) send(e) } }),
          h('button', { className: 'btn pri', disabled: busy }, '发送')))
    }

    // ———————————————— 成长 ————————————————
    function Growth({ notify, reload }) {
      const [d, setD] = useState(null)
      const [log, setLog] = useState(null)
      const load = () => { api('GET', '/stats').then(setD).catch((e) => notify(e.message, true)); api('GET', '/coach/log').then(setLog).catch(() => {}) }
      useEffect(() => { load() }, [])
      if (!d) return h('p', { className: 'muted' }, '加载中…')
      const s = d.stats, max = Math.max(1, ...s.hourly)
      const saveProfile = (k, v) => api('PATCH', '/profile', { [k]: v }).then(() => { load(); reload(); notify('已保存') }).catch((e) => notify(e.message, true))
      const kpi = (label, value, hint) => h('div', { className: 'kpi', title: hint }, h('span', { className: 'muted' }, label), h('b', null, value))
      return h(Fragment, null,
        h('div', { className: 'kpis' },
          kpi('速度系数', s.samples >= 3 ? `×${s.speedFactor}` : `样本 ${s.samples}/3`, '实际用时 ÷ 预估用时 的中位数'),
          kpi('专注块长度', `${s.focusMinutes} 分钟`, '你每次专注的中位时长'),
          kpi('平均打断', `${s.interruptsPerSession} 次/块`),
          kpi('近7天必做完成率', s.completionRate == null ? '—' : `${Math.round(s.completionRate * 100)}%`),
          kpi('连续推进', `${s.streak} 天`),
          kpi('今日专注', `${s.todayFocusMinutes} 分钟`)),
        h('h4', null, '你的专注时段分布（累计分钟）'),
        h('div', { className: 'hours', 'aria-label': '24 小时专注分布' }, s.hourly.map((m, i) => h('i', { key: i, title: `${i}:00  ${m} 分钟`, style: { height: `${(m / max) * 100}%`, opacity: s.peakHours.includes(i) ? 1 : 0.45 } }))),
        h('div', { className: 'row muted', style: { justifyContent: 'space-between' } }, h('span', null, '0点'), h('span', null, '12点'), h('span', null, '23点')),
        h('h4', null, '教练建议'),
        d.insights.length ? d.insights.map((x, i) => h('div', { key: i, className: cx('ins', x.kind) }, x.text)) : h('p', { className: 'muted' }, '数据还不够，先完成几个任务。'),
        log && log.clarityTrend.length > 0 && h(Fragment, null, h('h4', null, `表达清晰度趋势（最近 ${log.clarityTrend.length} 次，纸笔提示 ${log.paperCount} 次）`),
          h('div', { className: 'hours', style: { height: 40 } }, log.clarityTrend.map((v, i) => h('i', { key: i, style: { height: `${((v + 1) / 3) * 100}%` } })))),
        h('h4', null, '每日容量（系统每周按完成率自动 ±10%，也可以手动改）'),
        h('div', { className: 'card row' },
          h('label', null, '工作 ', h('input', { className: 'in', type: 'number', style: { width: 72 }, defaultValue: d.profile.dailyWorkMinutes, onBlur: (e) => saveProfile('dailyWorkMinutes', Number(e.target.value)) }), ' 分钟'),
          h('label', null, '成长 ', h('input', { className: 'in', type: 'number', style: { width: 64 }, defaultValue: d.profile.dailyGrowthMinutes, onBlur: (e) => saveProfile('dailyGrowthMinutes', Number(e.target.value)) }), ' 分钟'),
          h('label', null, '上班 ', h('input', { className: 'in', type: 'time', defaultValue: d.profile.workStart, onBlur: (e) => saveProfile('workStart', e.target.value) })),
          h('label', null, '下班 ', h('input', { className: 'in', type: 'time', defaultValue: d.profile.workEnd, onBlur: (e) => saveProfile('workEnd', e.target.value) }))),
        h('p', { className: 'muted', style: { marginTop: 10 } }, '方法说明：预估 × 速度系数，用来对抗计划谬误；完成率 ≥80% 时每周 +10%，低于 50% 时 −10%（渐进加量）；第一个专注块先做 10 分钟热身任务，借行为惯性起步；完成一步就有即时反馈；时间块绑定具体任务，这叫执行意图。'))
    }

    // ———————————————— 汇报 ————————————————
    function Report({ notify }) {
      const [tasks, setTasks] = useState(null)
      const [sel, setSel] = useState(new Set())
      const [days, setDays] = useState(7)
      const [title, setTitle] = useState('')
      const [audience, setAudience] = useState('')
      const [out, setOut] = useState(null)
      const [busy, setBusy] = useState(false)
      useEffect(() => { api('GET', '/tasks').then((r) => setTasks(r.tasks.filter((t) => t.status !== 'dropped'))).catch((e) => notify(e.message, true)) }, [])
      const gen = async () => {
        setBusy(true)
        try { const r = await api('POST', '/report', { taskIds: [...sel], sinceDays: days, title: title || undefined, audience: audience || undefined }); setOut(r); notify(r.source === 'ai' ? '📤 汇报已生成' : '📤 已按模板生成（模型不可用）') } catch (e) { notify(e.message, true) } finally { setBusy(false) }
      }
      const openHtml = () => { const url = URL.createObjectURL(new Blob([out.html], { type: 'text/html' })); window.open(url, '_blank') }
      if (!tasks) return h('p', { className: 'muted' }, '加载中…')
      const toggle = (id) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
      return h(Fragment, null,
        h('div', { className: 'card' },
          h('div', { className: 'row' },
            h('input', { className: 'in grow', placeholder: '汇报标题（可空）', value: title, onChange: (e) => setTitle(e.target.value) }),
            h('input', { className: 'in', placeholder: '汇报对象，例如：老板', value: audience, onChange: (e) => setAudience(e.target.value) }),
            h('select', { className: 'in', value: days, onChange: (e) => setDays(Number(e.target.value)) }, [[1, '今天'], [7, '近 7 天'], [14, '近 2 周'], [30, '近 30 天']].map(([v, l]) => h('option', { key: v, value: v }, l))),
            h('button', { className: 'btn pri', disabled: busy, onClick: gen }, busy ? '生成中…' : '📤 生成任务汇报')),
          h('p', { className: 'muted', style: { marginTop: 6 } }, sel.size ? `已选 ${sel.size} 个任务` : '不勾选时，自动汇报所选时间范围内完成或进行中的任务。汇报要点越多，生成的内容越扎实。')),
        h('div', { className: 'small', style: { marginTop: 10 } }, tasks.map((t) => h('label', { key: t.id, className: 'it' },
          h('input', { type: 'checkbox', checked: sel.has(t.id), onChange: () => toggle(t.id) }),
          h('span', { className: 'grow' }, t.title), h(Badge, { track: t.track }),
          h('span', { className: 'muted' }, `${t.status === 'done' ? '✅' : '⏳'} 要点 ${(t.notes ?? []).length} 条`)))),
        out && h('div', { className: 'card', style: { marginTop: 12 } },
          h('div', { className: 'row' }, h('b', { className: 'grow' }, out.deck.title),
            h('button', { className: 'btn pri', onClick: openHtml }, '▶ 播放 HTML 幻灯片'),
            h('button', { className: 'btn', onClick: () => download('report.md', out.markdown, 'text/markdown') }, '⬇ Markdown'),
            h('button', { className: 'btn', onClick: () => download('report.html', out.html, 'text/html') }, '⬇ HTML'),
            h('button', { className: 'btn', onClick: () => navigator.clipboard.writeText(out.markdown).then(() => notify('已复制 Markdown')) }, '复制')),
          h('p', { className: 'muted', style: { margin: '6px 0' } }, `已保存：${out.mdPath}`),
          h('pre', { className: 'md' }, out.markdown)))
    }

    function App() {
      const [tab, setTab] = useState('today')
      const [toast, setToast] = useState(null)
      const [plan, setPlan] = useState(null)
      const [status, setStatus] = useState(null)
      const notify = useCallback((text, err) => { setToast({ text, err }); setTimeout(() => setToast(null), err ? 5000 : 2600) }, [])
      const reload = useCallback(() => api('GET', '/plan').then(setPlan).catch((e) => notify(e.message, true)), [notify])
      useEffect(() => { reload(); api('GET', '/status').then(setStatus).catch(() => {}) }, [reload])
      useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t) }, [reload])
      const shared = { plan, reload, notify, status, goSettings: () => setTab('settings') }
      const tabs = [['today', '🎯 今日'], ['ideas', '💡 灵感库'], ['ws', '🗂 工作区'], ['coach', '🧭 教练'], ['growth', '📈 成长'], ['report', '📤 汇报'], ['settings', '⚙️ 设置']]
      return h('div', { className: 'awb' }, h('style', null, css),
        toast && h('div', { className: cx('toast', toast.err && 'err'), role: 'status' }, toast.text),
        h('div', { className: 'row' }, h('h3', { className: 'grow' }, 'ADHD 工作台'),
          plan && h('span', { className: 'muted' }, `${plan.date} · ${plan.workday ? '工作日' : '休息日'} · 今日专注 ${plan.stats.todayFocusMinutes} 分钟${plan.stats.streak ? ` · 🔥${plan.stats.streak} 天` : ''}`),
          status && h('span', { className: 'badge', title: status.ai.available ? `${status.ai.provider}/${status.ai.model}` : '模型不可用，使用规则兜底' }, status.ai.available ? '🤖 AI 就绪' : '⚙️ 规则模式')),
        plan && h(FocusBar, shared),
        h('nav', { className: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': tab === id, className: cx('tab', tab === id && 'on'), onClick: () => setTab(id) }, label))),
        tab === 'today' && h(Today, shared),
        tab === 'ideas' && h(Ideas, shared),
        tab === 'ws' && h(Workspaces, shared),
        tab === 'coach' && h(Coach, shared),
        tab === 'growth' && h(Growth, shared),
        tab === 'report' && h(Report, shared),
        tab === 'settings' && h(Settings, shared))
    }

    // 左侧栏图标（宿主传入 size）
    function SidebarIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', 'aria-hidden': true, focusable: false },
        h('circle', { cx: 8, cy: 8, r: 6.5 }), h('circle', { cx: 8, cy: 8, r: 3.8 }), h('circle', { cx: 8, cy: 8, r: 1.1, fill: 'currentColor' }))
    }
    const PanelPage = () => h('div', { style: { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } }, h('div', { style: { flex: 1, minHeight: 0, maxWidth: 1180, width: '100%', margin: '0 auto' } }, h(App)))
    const PANEL_ID = 'adhd-workbench'

    // 左侧栏单独入口：点开后在主区域显示工作台（与插件市场、IM 插件的做法一致）
    function apply(ctx) {
      if (typeof ctx.inject !== 'function') return
      ctx.inject(['layout'], (pageCtx) => pageCtx.slots.inject('main', () => {
        const offMain = pageCtx.slots.register({ name: 'main', key: PANEL_ID }, PanelPage)
        const offRow = pageCtx.slots.inject('sidebar.panellist', () => pageCtx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: () => 'ADHD 工作台',
        }, SidebarIcon))
        return () => { offRow?.(); offMain?.() }
      }))
    }
    return { inject: ['slots'], apply }
  },
})
