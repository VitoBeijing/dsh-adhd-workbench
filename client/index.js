/* dsh-adhd-workbench 前端：纯 JS，React 由 DSH 模块加载器提供（不打包第二份 React）。 */
window.__ModuleLoader__.load({
  id: 'dsh-adhd-workbench',
  factory(require) {
    const React = require('react')
    const { createElement: h, useState, useEffect, useRef, useCallback, Fragment } = React
    const API = '/adhd-workbench/api'

    // ———————————————— 工具 ————————————————
    async function api(method, path, body) {
      // 写请求一律带 JSON 请求头和请求体（DELETE 没参数也发 {}），服务端据此拒绝跨站表单请求
      const write = method !== 'GET'
      const res = await fetch(API + path, { method, headers: write ? { 'content-type': 'application/json' } : {}, body: write ? JSON.stringify(body ?? {}) : undefined })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`)
      return data
    }
    const TRACK = { work: ['工作', '💼'], growth: ['成长', '🌱'], life: ['生活', '🏠'] }
    const IDEA_CAT = { personal: ['个人', '🧠'], work: ['工作', '💼'], life: ['生活', '🌿'] }
    const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
    const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '刚刚' : m < 60 ? `${m} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前` }
    const cx = (...xs) => xs.filter(Boolean).join(' ')
    const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const kdate = (k) => new Date(`${k}T12:00:00`)
    const addK = (k, n) => { const d = kdate(k); d.setDate(d.getDate() + n); return dkey(d) }
    const weekOf = (k) => { const d = kdate(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d) }
    const mdLabel = (k) => { const d = kdate(k); return `${d.getMonth() + 1}月${d.getDate()}日` }

    // ———— 界面状态保持 ————
    // 状态放在模块级（切到会话再切回来，组件卸载后仍在），需要时同步写入 localStorage（刷新、重启后恢复）。
    // 组件卸载后 AI 结果才回来，setter 也照样写进存储，切回来就能看到。
    const LS_PREFIX = 'adhd-workbench:ui:'
    const MAX_BYTES = 200 * 1024
    const mem = new Map()
    const subs = new Map()
    const loadLs = (key) => { try { const v = localStorage.getItem(LS_PREFIX + key); return v == null ? undefined : JSON.parse(v) } catch { return undefined } }
    const saveLs = (key, v) => {
      try {
        if (v === undefined || v === null || v === '') return localStorage.removeItem(LS_PREFIX + key)
        const json = JSON.stringify(v)
        if (json.length > MAX_BYTES) return // 太大就不存，避免撑爆浏览器存储
        localStorage.setItem(LS_PREFIX + key, json)
      } catch { /* 存储满或被禁用时忽略 */ }
    }
    function setStored(key, next, persist) {
      const prev = mem.get(key)
      const v = typeof next === 'function' ? next(prev) : next
      if (Object.is(v, prev)) return
      mem.set(key, v)
      if (persist) saveLs(key, v)
      for (const fn of subs.get(key) ?? []) fn(v)
    }
    /** 和 useState 一样用，但值按 key 保存在组件外。persist=false 时只在本次打开期间保留（用于「分析中」这类临时状态）。 */
    function useKept(key, init, persist = true) {
      if (!mem.has(key)) { const saved = persist ? loadLs(key) : undefined; mem.set(key, saved !== undefined ? saved : typeof init === 'function' ? init() : init) }
      const [v, setV] = useState(() => mem.get(key))
      useEffect(() => {
        let set = subs.get(key); if (!set) subs.set(key, (set = new Set()))
        set.add(setV); if (!Object.is(mem.get(key), v)) setV(mem.get(key))
        return () => set.delete(setV)
      }, [key])
      const setter = useCallback((next) => setStored(key, next, persist), [key, persist])
      return [v, setter]
    }
    function download(name, text, type) {
      const url = URL.createObjectURL(new Blob([text], { type }))
      const a = document.createElement('a'); a.href = url; a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }

    const css = `
/* Apple DESIGN.md：单一 Action Blue、SF Pro 字阶、极简阴影、pill 动作、scale(.95) 按下 */
.awb{
  --acc:#0066cc;                                /* Action Blue：所有可点的填充色 */
  --acc-link:light-dark(#0066cc,#2997ff);       /* 文字链接：深色用 Sky Link Blue */
  --acc-focus:light-dark(#0071e3,#4da3ff);      /* Focus Blue */
  --ink:light-dark(#1d1d1f,#f5f5f7);
  --ink-muted:light-dark(#6e6e73,#a1a1a6);      /* 次要文字：保证 4.5:1 */
  --hairline:light-dark(#e0e0e0,#3a3a3c);
  --divider:light-dark(#f0f0f0,#2c2c2e);
  --canvas:light-dark(#fff,#1c1c1e);
  --parchment:light-dark(#f5f5f7,#202022);
  --pearl:light-dark(#fafafc,#2a2a2c);
  --ok:light-dark(#248a3d,#30d158);
  --warn:light-dark(#c93400,#ff9f0a);
  --bad:light-dark(#d70015,#ff453a);
  --growth:light-dark(#248a3d,#30d158);
  --life:light-dark(#c93400,#ff9f0a);
  /* 圆角只有 5 / 8 / 11 / 18 / pill 五档 */
  --r-xs:5px;--r-sm:8px;--r-md:11px;--r-lg:18px;--r-pill:9999px;
  --font-display:"SF Pro Display",system-ui,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
  --font-text:"SF Pro Text",system-ui,-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
  /* 浮层：Parchment 80% + 背景模糊（规范里 sub-nav / floating bar 的做法） */
  --frosted:color-mix(in srgb,var(--parchment) 80%,transparent);
  --blur:saturate(180%) blur(20px);
  --ease:cubic-bezier(.32,.72,0,1);
  height:100%;overflow:auto;padding:0 24px;box-sizing:border-box;color:var(--ink);
  font-family:var(--font-text);font-size:17px;line-height:1.47;letter-spacing:-.374px;
  -webkit-font-smoothing:antialiased;display:flex;flex-direction:column;container-type:inline-size;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--ink) 20%,transparent) transparent}
.awb::-webkit-scrollbar{width:11px;height:11px}
.awb::-webkit-scrollbar-thumb{border-radius:var(--r-pill);border:3px solid transparent;background-clip:content-box;background-color:color-mix(in srgb,var(--ink) 20%,transparent)}
.awb::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--ink) 32%,transparent)}
.awb>*{flex-shrink:0}
.awb *{box-sizing:border-box}.awb h1,.awb h2,.awb h3,.awb h4,.awb p{margin:0}
.awb h3{font-family:var(--font-display);font-size:21px;font-weight:600;line-height:1.19;letter-spacing:.231px}
.awb h4{font-family:var(--font-text);font-size:14px;font-weight:600;line-height:1.29;letter-spacing:-.224px;color:var(--ink-muted);margin:32px 4px 12px}
.awb .muted{color:var(--ink-muted);font-size:14px;letter-spacing:-.224px}
.awb button,.awb input,.awb select,.awb textarea{font:inherit;color:inherit}
.awb button:focus-visible,.awb input:focus-visible,.awb select:focus-visible,.awb textarea:focus-visible,[role=button]:focus-visible{outline:2px solid var(--acc-focus);outline-offset:2px}
/* —— 按钮：pill 为主，按下 scale(.95)，无阴影 —— */
.awb .btn{appearance:none;border:1px solid transparent;background:var(--parchment);border-radius:var(--r-pill);padding:8px 15px;cursor:pointer;
  font-size:14px;font-weight:400;letter-spacing:-.224px;white-space:nowrap;
  transition:background .2s var(--ease),transform .15s var(--ease),border-color .2s}
.awb .btn:hover:not(:disabled){background:color-mix(in srgb,var(--ink) 8%,var(--parchment))}
.awb .btn:active:not(:disabled){transform:scale(.95)}
.awb .btn:disabled{opacity:.42;cursor:default}
.awb .btn.pri{background:var(--acc);color:#fff;border-color:transparent}
.awb .btn.pri:hover:not(:disabled){background:color-mix(in srgb,var(--acc) 88%,#000)}
.awb .btn.ghost{background:transparent;border-color:var(--hairline)}
.awb .btn.ghost:hover:not(:disabled){background:color-mix(in srgb,var(--ink) 5%,transparent)}
.awb .btn.danger{color:var(--bad)}
.awb .link{appearance:none;border:0;background:none;padding:2px 0;color:var(--acc-link);cursor:pointer;font-size:14px;font-weight:400;letter-spacing:-.224px;transition:opacity .2s}
.awb .link:hover{opacity:.68}
.awb .link.danger{color:var(--bad)}.awb .link.plain{color:var(--ink-muted)}
.awb .link:disabled{opacity:.4;cursor:default}
.awb .in{border:1px solid var(--hairline);background:var(--canvas);border-radius:var(--r-sm);padding:8px 12px;min-width:0;outline:none;
  font-size:14px;letter-spacing:-.224px;transition:border-color .2s,box-shadow .2s}
.awb .in:focus{border-color:var(--acc-focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc-focus) 22%,transparent)}
.awb textarea.in{width:100%;resize:vertical}
.awb .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.awb .grow{flex:1;min-width:0}
.awb .card{border-radius:var(--r-lg);padding:24px;background:var(--canvas);border:1px solid var(--hairline)}
/* —— 顶部玻璃栏（规范：Parchment 80% + 模糊，唯一允许的"浮"效果） —— */
.awb .topbar{position:sticky;top:0;z-index:7;display:flex;gap:12px;align-items:center;margin:0 -24px 4px;padding:12px 24px;
  background:var(--frosted);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border-bottom:1px solid var(--divider)}
.awb .tabs{display:inline-flex;gap:2px;padding:2px;border-radius:var(--r-md);overflow-x:auto;max-width:100%;scrollbar-width:none;
  background:color-mix(in srgb,var(--ink) 6%,transparent)}
.awb .tabs::-webkit-scrollbar{display:none}
.awb .tab{border:0;background:none;padding:5px 12px;border-radius:var(--r-sm);cursor:pointer;color:var(--ink-muted);font-weight:400;font-size:14px;letter-spacing:-.224px;white-space:nowrap;
  transition:background .22s var(--ease),color .22s,transform .15s var(--ease)}
.awb .tab:hover:not(.on){color:var(--ink)}
.awb .tab:active{transform:scale(.95)}
.awb .tab.on{color:var(--ink);background:var(--canvas);border:1px solid var(--divider)}
.awb .badge{display:inline-flex;align-items:center;gap:3px;border-radius:var(--r-xs);padding:1px 6px;font-size:12px;font-weight:400;letter-spacing:-.12px;background:color-mix(in srgb,var(--ink) 7%,transparent)}
.awb .badge.work{color:var(--acc-link);background:color-mix(in srgb,var(--acc) 10%,transparent)}
.awb .badge.growth{color:var(--growth);background:color-mix(in srgb,var(--growth) 12%,transparent)}
.awb .badge.life{color:var(--life);background:color-mix(in srgb,var(--life) 12%,transparent)}
.awb .pill{display:inline-flex;align-items:center;gap:6px;border-radius:var(--r-pill);padding:3px 11px;font-size:12px;font-weight:400;letter-spacing:-.12px;background:color-mix(in srgb,var(--ink) 7%,transparent)}
.awb .pill.live{color:var(--acc-link);background:color-mix(in srgb,var(--acc) 10%,transparent)}
/* —— 大标题：SF Pro Display 34/600，负字距 —— */
.awb .large{margin:24px 0 24px}
.awb .large h1{font-family:var(--font-display);font-size:34px;font-weight:600;line-height:1.1;letter-spacing:-.374px}
.awb .large p{color:var(--ink-muted);font-size:17px;letter-spacing:-.374px;margin-top:4px}
/* —— 现在只做这一步：靠底色区分层级，不用渐变 —— */
.awb .hero{position:relative;border-radius:var(--r-lg);padding:24px 24px 20px;overflow:hidden;
  background:var(--parchment);border:1px solid var(--divider)}
.awb .hero .eyebrow{font-size:12px;font-weight:600;letter-spacing:-.12px;color:var(--acc-link)}
.awb .hero .title{font-family:var(--font-display);font-size:24px;font-weight:600;line-height:1.19;letter-spacing:-.3px;margin:8px 0 4px}
.awb .hero .sub{color:var(--ink-muted);font-size:14px;letter-spacing:-.224px}
.awb .hero .acts{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px;align-items:center}
.awb .hero .btn{padding:11px 22px;font-size:17px;letter-spacing:-.374px}
.awb .clock{font-family:var(--font-display);font-variant-numeric:tabular-nums;font-size:40px;font-weight:300;letter-spacing:-.4px;line-height:1.1}
.awb .clock.over{color:var(--warn)}
/* —— 今日布局：主列 + 窄时间线 —— */
.awb .today{flex:1 0 auto;display:flex;flex-direction:column}
.awb .split{display:grid;grid-template-columns:minmax(0,1fr);gap:0 32px}
@container (min-width:860px){.awb .split{grid-template-columns:minmax(0,1fr) 260px}.awb .split>aside{position:sticky;top:64px;align-self:start}}
/* 分组列表：实用卡片，18px 圆角 + 1px 发丝线 */
.awb .group{border-radius:var(--r-lg);background:var(--canvas);border:1px solid var(--hairline);overflow:hidden}
.awb .rowi{display:flex;gap:12px;align-items:center;padding:12px 17px;position:relative;cursor:default;transition:background .2s var(--ease)}
.awb .group>*+*{border-top:1px solid var(--divider)}
.awb .rowi.click{cursor:pointer}.awb .rowi.click:hover{background:color-mix(in srgb,var(--ink) 4%,transparent)}
.awb .rowi .t{font-size:17px;font-weight:600;line-height:1.24;letter-spacing:-.374px;overflow:hidden;text-overflow:ellipsis}
.awb .rowi .m{color:var(--ink-muted);font-size:14px;letter-spacing:-.224px;margin-top:2px}
.awb .rowi.cur{background:color-mix(in srgb,var(--acc) 6%,transparent)}
.awb .chev{color:var(--ink-muted);font-size:14px;transition:transform .24s var(--ease);flex:none}.awb .chev.open{transform:rotate(90deg)}
.awb .lead{width:24px;height:24px;border-radius:var(--r-pill);display:grid;place-items:center;font-size:12px;font-weight:600;flex:none;
  background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink-muted)}
.awb .rowi.cur .lead{background:var(--acc);color:#fff}
.awb .ck{appearance:none;width:24px;height:24px;border-radius:var(--r-pill);border:1px solid var(--ink-muted);background:none;flex:none;cursor:pointer;
  display:grid;place-items:center;padding:0;color:#fff;font-size:12px;transition:background .2s var(--ease),border-color .2s,transform .15s var(--ease)}
.awb .ck:hover{border-color:var(--acc)}.awb .ck:active{transform:scale(.95)}
.awb .ck.on{background:var(--ok);border-color:var(--ok)}
.awb .prog{height:3px;border-radius:var(--r-pill);background:color-mix(in srgb,var(--ink) 10%,transparent);overflow:hidden;margin-top:8px}
.awb .prog>i{display:block;height:100%;background:var(--acc);border-radius:var(--r-pill);transition:width .45s var(--ease)}
.awb .detail{padding:2px 17px 12px 53px;background:color-mix(in srgb,var(--ink) 2%,transparent)}
.awb .detail .sl{list-style:none;margin:0;padding:0}
.awb .detail .sl li{display:flex;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--divider);font-size:14px;letter-spacing:-.224px}
.awb .detail .sl li .ck{width:18px;height:18px;font-size:10px}
.awb .detail .sl li.done span.grow{color:var(--ink-muted);text-decoration:line-through}
.awb .detail .sl li.next span.grow{font-weight:600}
.awb .detail .notes{margin-top:12px;display:grid;gap:4px}
.awb .detail .foot{display:flex;gap:17px;flex-wrap:wrap;align-items:center;margin-top:12px}
.awb .disclose{appearance:none;border:0;background:none;padding:0;color:var(--ink-muted);font:inherit;font-size:14px;font-weight:600;letter-spacing:-.224px;cursor:pointer;transition:color .2s}
.awb .disclose:hover{color:var(--ink)}
.awb .empty{padding:24px 17px;color:var(--ink-muted);font-size:14px;letter-spacing:-.224px}
/* —— 时间线 —— */
.awb .tl{list-style:none;margin:0;padding:4px 0}
.awb .tl li{display:grid;grid-template-columns:44px 14px minmax(0,1fr);gap:0 8px;align-items:start;padding:8px 17px 8px 12px;position:relative}
.awb .tl .tm{font-variant-numeric:tabular-nums;font-size:12px;letter-spacing:-.12px;color:var(--ink-muted);padding-top:2px;text-align:right}
.awb .tl .rail{position:relative;height:100%;min-height:20px}
.awb .tl .rail:before{content:"";position:absolute;left:6px;top:-8px;bottom:-8px;width:1px;background:var(--hairline)}
.awb .tl li:first-child .rail:before{top:8px}.awb .tl li:last-child .rail:before{bottom:auto;height:16px}
.awb .tl .rail i{position:absolute;left:2px;top:5px;width:9px;height:9px;border-radius:var(--r-pill);background:var(--canvas);border:1px solid var(--ink-muted)}
.awb .tl li.focus .rail i{border-color:var(--acc)}.awb .tl li.growth .rail i{border-color:var(--growth)}
.awb .tl li.warmup .rail i,.awb .tl li.batch .rail i{border-color:var(--life)}
.awb .tl li.now .rail i{background:var(--acc);border-color:var(--acc)}
.awb .tl .tt{font-size:14px;line-height:1.29;letter-spacing:-.224px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.awb .tl .tm2{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted)}
.awb .tl li.now .tt{font-weight:600}.awb .tl li.now .tm{color:var(--acc-link);font-weight:600}
.awb .tl li.sep{padding-top:4px;padding-bottom:4px}.awb .tl li.sep .tt{font-size:12px;color:var(--ink-muted)}
.awb .tl li.sep .rail i{width:5px;height:5px;left:4px;top:6px;border:0;background:var(--ink-muted)}
/* —— 悬浮输入栏：唯一常驻的玻璃浮层 —— */
.awb .dock{position:sticky;bottom:0;z-index:5;margin:auto -24px 0;padding:12px 24px 16px;
  background:linear-gradient(to bottom,transparent,var(--parchment) 40%)}
.awb .dock .inner{max-width:760px;margin:0 auto;border-radius:var(--r-lg);padding:12px;
  background:var(--frosted);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  border:1px solid var(--divider)}
.awb .dock .sheet{max-height:min(46vh,380px);overflow:auto;padding:4px 6px 8px;margin-bottom:8px;border-bottom:1px solid var(--divider)}
.awb .dock .sheet .msg{margin:8px 0;padding:8px 12px;border-radius:var(--r-lg);max-width:86%;font-size:14px;letter-spacing:-.224px;width:fit-content}
.awb .dock .sheet .msg.me{margin-left:auto;background:var(--acc);color:#fff;border-bottom-right-radius:var(--r-xs)}
.awb .dock .sheet .msg.coach{background:var(--canvas);border:1px solid var(--divider);border-bottom-left-radius:var(--r-xs)}
.awb .dock .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 4px 8px}
.awb .seg{display:inline-flex;gap:2px;padding:2px;border-radius:var(--r-md);background:color-mix(in srgb,var(--ink) 6%,transparent)}
.awb .seg button{border:0;background:none;padding:3px 11px;border-radius:var(--r-sm);font-size:14px;font-weight:400;letter-spacing:-.224px;color:var(--ink-muted);cursor:pointer;white-space:nowrap;
  transition:background .2s var(--ease),color .2s,transform .15s var(--ease)}
.awb .seg button:hover:not(.on){color:var(--ink)}
.awb .seg button:active{transform:scale(.95)}
.awb .seg button.on{background:var(--canvas);color:var(--ink);border:1px solid var(--divider)}
.awb .dock select.in{padding:4px 8px;font-size:14px;border-radius:var(--r-sm);max-width:240px}
.awb .composer{display:flex;gap:8px;align-items:flex-end}
.awb .composer textarea{flex:1;border:1px solid var(--hairline);background:var(--canvas);border-radius:var(--r-lg);padding:9px 14px;resize:none;outline:none;
  max-height:140px;font-size:17px;letter-spacing:-.374px;line-height:1.47;min-height:44px;transition:border-color .2s,box-shadow .2s}
.awb .composer textarea:focus{border-color:var(--acc-focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc-focus) 22%,transparent)}
.awb .send{width:44px;height:44px;border-radius:var(--r-pill);border:0;background:var(--acc);color:#fff;font-size:18px;font-weight:400;cursor:pointer;flex:none;display:grid;place-items:center;
  transition:opacity .2s,transform .15s var(--ease),background .2s}
.awb .send:hover:not(:disabled){background:color-mix(in srgb,var(--acc) 88%,#000)}
.awb .send:disabled{opacity:.32;cursor:default}.awb .send:active:not(:disabled){transform:scale(.95)}
.awb .confirm{margin:8px 0 4px;padding:12px 17px;border-radius:var(--r-lg);background:var(--canvas);border:1px solid var(--hairline)}
/* —— 其他标签页沿用 —— */
.awb .focus{border-radius:var(--r-lg);padding:17px;background:var(--parchment);border:1px solid var(--divider)}
.awb .must{display:grid;gap:12px}
.awb .bar{height:3px;border-radius:var(--r-pill);background:color-mix(in srgb,var(--ink) 10%,transparent);overflow:hidden;margin:8px 0 4px}
.awb .bar>i{display:block;height:100%;background:var(--acc);transition:width .35s var(--ease)}
.awb .small{display:grid;gap:4px}
.awb .small .it{display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:var(--r-sm);background:var(--canvas);border:1px solid var(--divider);font-size:14px;letter-spacing:-.224px}
.awb .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:17px}
.awb .ws{border:1px solid var(--hairline);background:var(--canvas);border-radius:var(--r-lg);padding:17px;margin-bottom:17px}
.awb .sess{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--divider);font-size:14px;letter-spacing:-.224px}
.awb .sess:first-of-type{border-top:0}
.awb .dot{width:8px;height:8px;border-radius:var(--r-pill);display:inline-block;background:var(--ink-muted)}.awb .dot.running{background:var(--ok)}
.awb .ideas{display:grid;gap:17px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.awb .chips{display:flex;gap:8px;flex-wrap:wrap}
.awb .chip{border:1px solid var(--hairline);border-radius:var(--r-pill);padding:5px 12px;cursor:pointer;background:var(--canvas);font-size:14px;font-weight:400;letter-spacing:-.224px;
  transition:background .2s var(--ease),transform .15s var(--ease),border-color .2s,color .2s}
.awb .chip:hover:not(:disabled){border-color:var(--ink-muted)}
.awb .chip:active:not(:disabled){transform:scale(.95)}
.awb .chip.on{background:var(--acc);color:#fff;border-color:transparent}
.awb .msg{padding:12px 17px;border-radius:var(--r-lg);margin:12px 0;max-width:92%;font-size:17px;letter-spacing:-.374px}
.awb .msg.me{margin-left:auto;background:color-mix(in srgb,var(--acc) 10%,transparent)}
.awb .msg.coach{background:var(--canvas);border:1px solid var(--hairline)}
.awb .paper{margin-top:8px;padding:12px 17px;border-radius:var(--r-sm);background:color-mix(in srgb,var(--warn) 10%,transparent)}
.awb .clar{font-weight:600}.awb .clar.low{color:var(--bad)}.awb .clar.medium{color:var(--warn)}.awb .clar.high{color:var(--ok)}
.awb .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}
.awb .kpi{border-radius:var(--r-lg);padding:17px;background:var(--canvas);border:1px solid var(--hairline)}
.awb .kpi b{display:block;font-family:var(--font-display);font-size:28px;font-weight:600;letter-spacing:-.3px;line-height:1.14}
.awb .hours{display:flex;align-items:flex-end;gap:2px;height:70px;margin-top:8px}
.awb .hours i{flex:1;background:var(--acc);border-radius:var(--r-xs) var(--r-xs) 0 0;min-height:1px}
.awb .ins{padding:12px 17px;border-radius:var(--r-md);margin-bottom:8px;background:var(--parchment);border:1px solid var(--divider);font-size:14px;letter-spacing:-.224px}
.awb .ins.warn{border-left:3px solid var(--warn)}.awb .ins.good{border-left:3px solid var(--ok)}
.awb .toast{position:sticky;top:0;z-index:9;align-self:center;height:0;overflow:visible;display:flex;justify-content:center}
.awb .toast>span{display:inline-block;margin-top:8px;padding:9px 17px;border-radius:var(--r-pill);font-size:14px;font-weight:400;letter-spacing:-.224px;
  background:var(--frosted);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);border:1px solid var(--divider);animation:awbpop .34s var(--ease)}
.awb .toast.err>span{color:var(--bad)}
@keyframes awbpop{0%{transform:translateY(-6px) scale(.98);opacity:0}100%{transform:none;opacity:1}}
.awb pre.md{white-space:pre-wrap;font-size:14px;max-height:340px;overflow:auto;padding:17px;border-radius:var(--r-sm);background:var(--parchment)}
.awb .ring text{font-weight:600}
.awb .intake .chat{max-height:300px;overflow:auto}
.awb .src{margin-bottom:24px}
.awb .src>.hd{display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--hairline);margin-bottom:12px;cursor:pointer}
.awb .wsgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:17px}
.awb .wsgrid .ws{margin:0}
.awb .srcrow{display:grid;grid-template-columns:24px 120px 130px 1fr 70px 96px auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--divider);font-size:14px;letter-spacing:-.224px}
.awb .tabpage{padding-bottom:32px}
/* —— 日历 —— */
.awb .caltool{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 17px}
.awb .calwrap{display:grid;grid-template-columns:minmax(0,1fr);gap:17px}
@container (min-width:900px){.awb .calwrap{grid-template-columns:minmax(0,1fr) 220px}.awb .calwrap>aside{position:sticky;top:64px;align-self:start}}
.awb .week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.awb .day{border-radius:var(--r-lg);background:var(--canvas);border:1px solid var(--divider);padding:8px 6px;min-height:220px;display:flex;flex-direction:column;gap:6px;
  transition:background .2s var(--ease),border-color .2s}
.awb .day header{display:flex;align-items:baseline;gap:5px;padding:0 4px}
.awb .day .wd{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted);font-weight:600}
.awb .day .dn{font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:-.2px;font-variant-numeric:tabular-nums}
.awb .day.today .dn{color:#fff;background:var(--acc);border-radius:var(--r-pill);min-width:30px;text-align:center;font-size:14px;padding:2px 7px}
.awb .day.past{opacity:.8}
/* 拖放目标：蓝色描边（无阴影） */
.awb .day.over,.awb .unsch.over{border-color:var(--acc);background:color-mix(in srgb,var(--acc) 6%,var(--canvas))}
.awb .day .items{display:flex;flex-direction:column;gap:4px;flex:1}
.awb .day .none,.awb .unsch .none{color:var(--ink-muted);font-size:12px;letter-spacing:-.12px;padding:4px;opacity:.7}
.awb .day footer{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted);padding:6px 4px 0;border-top:1px solid var(--divider)}
.awb .day .add{border:0;background:none;color:var(--acc-link);font-size:17px;line-height:1;cursor:pointer;border-radius:var(--r-sm);padding:2px 6px;opacity:.6;transition:opacity .2s,transform .15s var(--ease)}
.awb .day:hover .add,.awb .day .add:focus{opacity:1}.awb .day .add:hover{background:color-mix(in srgb,var(--ink) 5%,transparent)}.awb .day .add:active{transform:scale(.95)}
.awb .duebar{display:flex;flex-direction:column;gap:2px;padding:0 4px}.awb .duebar .link{font-size:12px;letter-spacing:-.12px;text-align:left;padding:0}
.awb .ct{border-radius:var(--r-sm);padding:6px 8px;background:var(--parchment);border:1px solid var(--divider);border-left:3px solid var(--acc);
  cursor:grab;user-select:none;transition:background .2s var(--ease),transform .15s var(--ease)}
.awb .ct:hover{background:color-mix(in srgb,var(--ink) 4%,var(--pearl))}
.awb .ct:active{cursor:grabbing;transform:scale(.95)}
.awb .ct.growth{border-left-color:var(--growth)}.awb .ct.life{border-left-color:var(--life)}
.awb .ct.done{cursor:pointer;opacity:.6;border-left-color:var(--ink-muted)}.awb .ct.done .ctt{text-decoration:line-through}
.awb .ct.late{background:color-mix(in srgb,var(--bad) 7%,var(--parchment))}.awb .ct.late .ctm{color:var(--bad)}
.awb .ctt{font-size:14px;font-weight:400;line-height:1.29;letter-spacing:-.224px;word-break:break-word}
.awb .ctm{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted);margin-top:2px}
.awb .unsch{border-radius:var(--r-lg);background:var(--canvas);border:1px dashed var(--hairline);padding:12px;display:flex;flex-direction:column;gap:6px;
  transition:background .2s var(--ease),border-color .2s}
.awb .mhead{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:4px}.awb .mhead span{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted);font-weight:600;text-align:center}
.awb .month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.awb .mc{appearance:none;font:inherit;color:inherit;text-align:left;border-radius:var(--r-lg);background:var(--canvas);border:1px solid var(--divider);padding:6px 7px;min-height:96px;
  display:flex;flex-direction:column;gap:3px;cursor:pointer;min-width:0;transition:background .2s var(--ease),border-color .2s,transform .15s var(--ease)}
.awb .mc:hover{background:var(--parchment);border-color:var(--hairline)}
.awb .mc:active{transform:scale(.95)}
.awb .mc.out{opacity:.42}.awb .mc.past .mchip{opacity:.75}
.awb .mc .dn{font-size:14px;font-weight:600;letter-spacing:-.224px;font-variant-numeric:tabular-nums}
.awb .mc.today .dn{color:#fff;background:var(--acc);border-radius:var(--r-pill);padding:0 7px}
.awb .mchip{font-size:12px;line-height:1.3;letter-spacing:-.12px;padding:1px 6px;border-radius:var(--r-xs);background:color-mix(in srgb,var(--acc) 10%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.awb .mchip.growth{background:color-mix(in srgb,var(--growth) 12%,transparent)}.awb .mchip.life{background:color-mix(in srgb,var(--life) 12%,transparent)}
.awb .mchip.done{background:color-mix(in srgb,var(--ink) 7%,transparent);color:var(--ink-muted);text-decoration:line-through}.awb .mchip.late{color:var(--bad)}
.awb .mc .more{font-size:12px;letter-spacing:-.12px;color:var(--ink-muted)}.awb .mdone{font-size:12px;letter-spacing:-.12px;color:var(--ok);font-weight:600}
.awb .dueDot{width:7px;height:7px;border-radius:var(--r-pill);background:var(--bad)}
/* 弹窗：玻璃 + 唯一一处柔和投影（内容浮在页面之上） */
.awb .modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:24px;background:color-mix(in srgb,#000 26%,transparent);
  -webkit-backdrop-filter:blur(10px) saturate(140%);backdrop-filter:blur(10px) saturate(140%);animation:awbfade .22s var(--ease)}
.awb .mcard2{width:min(520px,100%);max-height:90vh;overflow:auto;border-radius:var(--r-lg);padding:24px;
  background:var(--frosted);-webkit-backdrop-filter:saturate(180%) blur(28px);backdrop-filter:saturate(180%) blur(28px);
  border:1px solid var(--divider);box-shadow:0 20px 60px rgba(0,0,0,.28);animation:awbpop .3s var(--ease)}
.awb .mcard2 .ttl{flex:1;border:0;background:none;font-family:var(--font-display);font-size:21px;font-weight:600;letter-spacing:.231px;resize:none;outline:none;padding:2px 4px;border-radius:var(--r-sm);line-height:1.19;transition:background .2s}
.awb .mcard2 .ttl:focus{background:var(--parchment)}
.awb .mcard2 .form{display:grid;grid-template-columns:72px 1fr;gap:12px 12px;align-items:center;margin-top:17px;font-size:14px;letter-spacing:-.224px}
.awb .mcard2 input[type=date]{padding:4px 8px}
@keyframes awbfade{from{opacity:0}to{opacity:1}}
/* 不支持背景模糊时：退化为不透明 Parchment，保证可读 */
@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){
  .awb .topbar,.awb .dock .inner,.awb .mcard2,.awb .toast>span{background:var(--parchment)}
  .awb .modal{background:color-mix(in srgb,#000 45%,transparent)}
}
@container (max-width:700px){.awb .week{grid-template-columns:minmax(0,1fr)}.awb .day{min-height:0}.awb .mc{min-height:64px}.awb .mchip{display:none}}
@container (max-width:760px){.awb .srcrow{grid-template-columns:24px 1fr 1fr}}
@media (prefers-reduced-motion:reduce){.awb *{animation:none!important;transition:none!important}}
`

    // ———————————————— 通用组件 ————————————————
    function Ring({ pct, size = 54 }) {
      const r = (size - 8) / 2, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.min(100, pct)
      const color = v >= 80 ? '#e5534b' : v >= 60 ? '#e8a33d' : '#2fb67c'
      // 只画进度弧线，不再画外面那圈半透明底圈
      return h('svg', { className: 'ring', width: size, height: size, viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': pct == null ? '上下文未知' : `上下文已用 ${v}%` },
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
      if (!next && !activeTask) return h('section', { className: 'hero' },
        h('div', { className: 'eyebrow' }, plan.doneToday.length ? '今天' : '开始'),
        h('div', { className: 'title' }, plan.doneToday.length ? `必做都清空了，完成 ${plan.doneToday.length} 项` : '还没有任务'),
        h('div', { className: 'sub' }, plan.doneToday.length ? '可以收工，或者挑一个小任务。' : '在下面说一句你想做的事，越小越好。'),
        !plan.doneToday.length && h('div', { className: 'acts' }, h('button', { className: 'btn pri', onClick: () => focusDock('task') }, '＋ 加一个任务')))
      const taskId = activeTask?.id ?? next.taskId
      const task = all.find((t) => t.id === taskId)
      const step = (task?.steps ?? []).find((s) => !s.done)
      const over = active && elapsed >= target
      return h('section', { className: 'hero', 'aria-live': 'polite' },
        h('div', { className: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
          h('div', { className: 'grow' },
            h('div', { className: 'eyebrow' }, active ? '正在专注' : '现在只做这一步'),
            h('div', { className: 'title' }, step ? step.title : next?.stepTitle ?? task?.title),
            h('div', { className: 'sub' }, [step && task?.title, step && `预计 ${step.estimateMin} 分钟`, !step && task && '还没拆成小步'].filter(Boolean).join(' · '))),
          active && h('div', { style: { textAlign: 'right' } },
            h('div', { className: cx('clock', over && 'over') }, fmtClock(elapsed)),
            h('div', { className: 'muted', style: { marginTop: 4 } }, over ? '到时间了，起来活动一下' : `目标 ${plan.stats.focusMinutes} 分钟`))),
        h('div', { className: 'acts' },
          !active && h('button', { className: 'btn pri', onClick: () => act.focus(taskId, 'start', step?.id) }, '▶  开始专注'),
          active && step && h('button', { className: 'btn pri', onClick: () => act.step(taskId, step.id, true) }, '✓  这一步完成'),
          !step && task && h('button', { className: cx('btn', !active ? '' : 'pri'), disabled: act.busy === `s${taskId}`, onClick: () => act.split(taskId) }, act.busy === `s${taskId}` ? '拆分中…' : '✂️  帮我拆成小步'),
          active && h('button', { className: 'btn', onClick: () => act.focus(taskId, 'interrupt') }, '被打断了'),
          active && h('button', { className: 'btn', onClick: () => act.focus(taskId, 'stop') }, '暂停')))
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

    // 录入逻辑（状态在组件外保存，切走再回来仍在）
    function useIntake({ onAdded, notify, planDate }) {
      const hello = { bot: '想做什么？随口说一句，比如「明天下班前把内链方案发给老板，挺急的」。' }
      const [msgs, setMsgs] = useKept('intake.msgs', [hello])
      const [draft, setDraft] = useKept('intake.draft', null)
      const [ask, setAsk] = useKept('intake.ask', null) // 正在追问的字段
      const [text, setText] = useKept('intake.text', '')
      const [busy, setBusy] = useKept('intake.busy', false, false)
      const say = (m) => setMsgs((x) => [...x, m])
      const nextField = (d) => ORDER.find((f) => d[f] == null) ?? null
      const advance = (d) => { setDraft(d); const f = nextField(d); setAsk(f); if (f) say({ bot: ASK[f].q, field: f }) }
      const reset = () => { setMsgs([hello]); setDraft(null); setAsk(null); setText('') }
      const submit = async () => {
        const t = text.trim(); if (!t || busy) return
        setText(''); say({ me: t }); setBusy(true)
        try {
          if (!draft) {
            const { draft: d } = await api('POST', '/intake/parse', { text: t })
            const known = [d.importance && IMP[d.importance], d.urgency && URG[d.urgency], d.due && dueLabel(d.due)].filter(Boolean)
            say({ bot: `好，记下「${d.title}」（${TRACK[d.track][1]} ${TRACK[d.track][0]}${d.estimateMin ? `，约 ${d.estimateMin} 分钟` : ''}）。${known.length ? `听出来：${known.join('、')}。` : ''}` })
            advance(d)
          } else if (ask) {
            const r = await api('POST', '/intake/answer', { field: ask, text: t })
            if (r.value == null) say({ bot: '没太听懂，换个说法，或者点上面的选项？', field: ask })
            else advance({ ...draft, [ask]: r.value })
          } else {
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
          await api('POST', '/tasks', { title: draft.title, track: draft.track, importance: draft.importance, urgency: draft.urgency, estimateMin: draft.estimateMin ?? 30, due: draft.due === 'none' ? null : draft.due, ...(planDate ? { planDate } : {}) })
          notify(`已加入：${draft.title}${planDate ? `（安排在 ${mdLabel(planDate)}）` : ''}`); reset(); onAdded()
        } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const reask = (f) => { setAsk(f); say({ bot: ASK[f].q, field: f }) }
      return { msgs, draft, setDraft, ask, text, setText, busy, submit, pickChip, confirm, reset, reask, active: !!draft || msgs.length > 1 }
    }

    function IntakeThread({ it }) {
      const endRef = useRef(null)
      useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [it.msgs.length, it.ask, it.draft && !it.ask])
      const last = it.msgs[it.msgs.length - 1]
      const ready = it.draft && !it.ask
      const d = it.draft
      return h(Fragment, null,
        it.msgs.map((m, i) => h('div', { key: i, className: cx('msg', m.me ? 'me' : 'coach') }, m.me ?? m.bot)),
        it.ask && last?.field === it.ask && h('div', { className: 'chips', style: { margin: '2px 0 4px' } }, ASK[it.ask].chips.map(([v, l]) => h('button', { key: l, className: 'chip', disabled: it.busy, onClick: () => it.pickChip(it.ask, v ?? l, l) }, l))),
        ready && h('div', { className: 'confirm' },
          h('div', { style: { fontSize: 17, fontWeight: 600 } }, d.title),
          h('div', { className: 'row', style: { marginTop: 8 } },
            h('span', { className: 'seg' }, Object.entries(TRACK).map(([k, [l, ic]]) => h('button', { key: k, className: cx(d.track === k && 'on'), onClick: () => it.setDraft({ ...d, track: k }) }, `${ic} ${l}`))),
            h('label', { className: 'muted' }, '预计 ', h('input', { className: 'in', type: 'number', min: 5, step: 5, style: { width: 62, padding: '2px 6px' }, value: d.estimateMin ?? 30, onChange: (e) => it.setDraft({ ...d, estimateMin: Number(e.target.value) }) }), ' 分钟')),
          h('div', { className: 'row', style: { marginTop: 8, gap: 6 } },
            ORDER.map((f) => h('button', { key: f, className: 'chip', title: '点击重新回答', onClick: () => it.reask(f) },
              f === 'importance' ? `重要：${IMP[d.importance]}` : f === 'urgency' ? `紧急：${URG[d.urgency]}` : dueLabel(d.due)))),
          h('div', { className: 'row', style: { marginTop: 12 } },
            h('button', { className: 'btn pri', disabled: it.busy, onClick: it.confirm }, '加入任务'),
            h('button', { className: 'link plain', onClick: it.reset }, '重来'),
            h('span', { className: 'muted' }, '想改标题，直接再说一句'))),
        it.busy && h('div', { className: 'msg coach muted' }, '…'),
        h('div', { ref: endRef }))
    }

    // 底部悬浮输入栏：今日模块所有输入都在这里（新任务 / 加一步 / 记汇报要点）
    const dockBus = new EventTarget()
    const focusDock = (mode, taskId) => dockBus.dispatchEvent(new CustomEvent('focus', { detail: { mode, taskId } }))
    const NOTE_KIND = [['done', '做了什么'], ['approach', '方案'], ['result', '结果'], ['issue', '问题']]

    function Dock({ plan, act, reload, notify, planDate, setPlanDate }) {
      const it = useIntake({ onAdded: reload, notify, planDate })
      const [mode, setMode] = useKept('dock.mode', 'task')
      const [target, setTarget] = useKept('dock.target', null)
      const [kind, setKind] = useKept('dock.kind', 'done')
      const [stepText, setStepText] = useKept('dock.step', '')
      const [noteText, setNoteText] = useKept('dock.note', '')
      const [folded, setFolded] = useKept('dock.folded', false)
      const taRef = useRef(null)
      const tasks = [...plan.must, ...plan.small, ...plan.backlog]
      const targetId = tasks.some((t) => t.id === target) ? target : plan.next?.taskId ?? tasks[0]?.id
      const value = mode === 'task' ? it.text : mode === 'step' ? stepText : noteText
      const setValue = mode === 'task' ? it.setText : mode === 'step' ? setStepText : setNoteText
      useEffect(() => {
        const on = (e) => { setMode(e.detail.mode); if (e.detail.taskId) setTarget(e.detail.taskId); setFolded(false); setTimeout(() => taRef.current?.focus(), 30) }
        dockBus.addEventListener('focus', on); return () => dockBus.removeEventListener('focus', on)
      }, [])
      const send = async () => {
        if (mode === 'task') return it.submit()
        const v = value.trim(); if (!v || !targetId) return
        const ok = mode === 'step' ? await act.addStep(targetId, v) : await act.note(targetId, kind, v)
        if (ok !== undefined) setValue('')
      }
      const busy = mode === 'task' ? it.busy : act.busy === `as${targetId}` || act.busy === `n${targetId}`
      const showSheet = mode === 'task' && it.active && !folded
      const ph = { task: !it.draft ? '我要…（说一句话加任务）' : it.ask ? '直接回答，或点上面的选项' : '改标题，或点「加入任务」', step: '给这个任务加一步…', note: '例如：内链覆盖率从 40% 提到 75%' }[mode]
      return h('div', { className: 'dock' }, h('div', { className: 'inner' },
        showSheet && h('div', { className: 'sheet' },
          h('div', { className: 'row', style: { padding: '2px 2px 0' } },
            h('span', { className: 'muted grow', style: { fontWeight: 600 } }, '新任务'),
            h('button', { className: 'link plain', onClick: () => setFolded(true) }, '收起'),
            h('button', { className: 'link plain', onClick: it.reset }, '清空')),
          h(IntakeThread, { it })),
        h('div', { className: 'ctl' },
          h('span', { className: 'seg', role: 'tablist', 'aria-label': '输入类型' },
            [['task', '新任务'], ['step', '加一步'], ['note', '记要点']].map(([k, l]) => h('button', { key: k, role: 'tab', 'aria-selected': mode === k, className: cx(mode === k && 'on'), onClick: () => { setMode(k); setFolded(false); taRef.current?.focus() } }, l))),
          mode !== 'task' && (tasks.length
            ? h('select', { className: 'in', value: targetId ?? '', 'aria-label': '选择任务', onChange: (e) => setTarget(e.target.value) }, tasks.map((t) => h('option', { key: t.id, value: t.id }, t.title)))
            : h('span', { className: 'muted' }, '先加一个任务')),
          mode === 'note' && h('span', { className: 'seg' }, NOTE_KIND.map(([k, l]) => h('button', { key: k, className: cx(kind === k && 'on'), onClick: () => setKind(k) }, l))),
          mode === 'task' && setPlanDate && (planDate
            ? h('span', { className: 'pill live' }, `安排在 ${mdLabel(planDate)}`, h('button', { className: 'link plain', style: { padding: 0, fontSize: 12 }, 'aria-label': '不指定日期', onClick: () => setPlanDate(null) }, '×'))
            : h('span', { className: 'muted' }, '不指定日期，点某天的 ＋ 可安排')),
          mode === 'task' && it.active && folded && h('button', { className: 'link', onClick: () => setFolded(false) }, it.draft ? `继续录入「${it.draft.title}」` : '展开对话')),
        h('form', { className: 'composer', onSubmit: (e) => { e.preventDefault(); send() } },
          h('textarea', { ref: taRef, rows: Math.min(4, (value.match(/\n/g)?.length ?? 0) + 1), value, placeholder: ph, 'aria-label': ph,
            onChange: (e) => setValue(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() } } }),
          h('button', { className: 'send', disabled: busy || !value.trim() || (mode !== 'task' && !targetId), 'aria-label': '发送' }, busy ? '…' : '↑'))))
    }

    const shortDue = (d) => {
      if (!d) return ''
      const today = new Date(); today.setHours(12, 0, 0, 0)
      const diff = Math.round((new Date(`${d}T12:00:00`) - today) / 86400000)
      return diff === 0 ? '今天截止' : diff === 1 ? '明天截止' : diff < 0 ? `已逾期 ${-diff} 天` : diff < 7 ? `${diff} 天后截止` : `${Number(d.slice(5, 7))}/${Number(d.slice(8))} 截止`
    }

    // 任务行：默认只显示标题和一行说明，点开才看步骤和更多操作
    function TaskRow({ t, index, act, isCurrent, open, onToggle, onSwap }) {
      const steps = t.steps ?? []
      const doneN = steps.filter((s) => s.done).length
      const nextStep = steps.find((s) => !s.done)
      const pct = steps.length ? Math.round((doneN / steps.length) * 100) : 0
      const due = shortDue(t.due)
      const meta = [`${TRACK[t.track]?.[1] ?? ''} ${TRACK[t.track]?.[0] ?? ''}`.trim(), `约 ${t.adjustedEstimate ?? t.estimateMin} 分钟`, steps.length ? `${doneN}/${steps.length} 步` : '未拆分']
      return h(Fragment, null,
        h('div', { className: cx('rowi click', isCurrent && 'cur'), role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: onToggle, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } },
          index != null ? h('span', { className: 'lead' }, index + 1) : h('span', { className: 'lead' }, '·'),
          h('div', { className: 'grow' },
            h('div', { className: 't' }, t.title),
            h('div', { className: 'm' }, meta.join(' · '), due && h('span', { style: { color: due.startsWith('已逾期') || due.startsWith('今天') ? 'var(--bad)' : due.startsWith('明天') ? 'var(--warn)' : undefined } }, ` · ${due}`)),
            steps.length > 0 && h('div', { className: 'prog' }, h('i', { style: { width: `${pct}%` } }))),
          !steps.length && h('button', { className: 'btn', disabled: act.busy === `s${t.id}`, onClick: (e) => { e.stopPropagation(); act.split(t.id) } }, act.busy === `s${t.id}` ? '拆分中…' : '拆分'),
          h('span', { className: cx('chev', open && 'open'), 'aria-hidden': true }, '›')),
        open && h('div', { className: 'detail' },
          steps.length > 0 && h('ul', { className: 'sl' }, steps.map((s) => h('li', { key: s.id, className: cx(s.done && 'done', s === nextStep && 'next') },
            h('button', { className: cx('ck', s.done && 'on'), 'aria-label': `${s.done ? '取消完成' : '完成'}：${s.title}`, onClick: () => act.step(t.id, s.id, !s.done) }, s.done ? '✓' : ''),
            h('span', { className: 'grow' }, s.title), h('span', { className: 'muted' }, `${s.estimateMin}′`),
            h('button', { className: 'link plain', 'aria-label': '删除步骤', onClick: () => act.delStep(t.id, s.id) }, '×')))),
          (t.notes ?? []).length > 0 && h('div', { className: 'notes' },
            h('div', { className: 'muted', style: { fontWeight: 600 } }, '汇报要点'),
            t.notes.map((n) => h('div', { key: n.id, className: 'row', style: { gap: 6 } }, h('span', { className: 'badge' }, { done: '做了', approach: '方案', result: '结果', issue: '问题' }[n.kind]), h('span', { className: 'grow' }, n.text), h('button', { className: 'link plain', 'aria-label': '删除要点', onClick: () => act.delNote(t.id, n.id) }, '×')))),
          h('div', { className: 'row', style: { marginTop: 10, gap: 14 } },
            h('span', { className: 'row', style: { gap: 2 } }, h('span', { className: 'muted' }, '重要'), h(Stars, { value: t.importance, label: '重要', onChange: (v) => act.patch(t.id, { importance: v }) })),
            h('span', { className: 'row', style: { gap: 2 } }, h('span', { className: 'muted' }, '紧急'), h(Stars, { value: t.urgency, label: '紧急', onChange: (v) => act.patch(t.id, { urgency: v }) }))),
          h('div', { className: 'foot' },
            h('button', { className: 'link', onClick: () => act.focus(t.id, 'start', nextStep?.id) }, '开始专注'),
            h('button', { className: 'link', onClick: () => focusDock('step', t.id) }, '加一步'),
            h('button', { className: 'link', onClick: () => focusDock('note', t.id) }, '记要点'),
            steps.length > 0 && h('button', { className: 'link', disabled: act.busy === `s${t.id}`, onClick: () => act.split(t.id, false) }, '重新拆剩余'),
            onSwap && h('button', { className: 'link', title: '换一个必做任务（换个方向也是推进）', onClick: onSwap }, '换一个'),
            h('span', { className: 'grow' }),
            t.status !== 'done' && h('button', { className: 'link', onClick: () => act.patch(t.id, { status: 'done' }, '完成！') }, '标记完成'),
            h('button', { className: 'link plain', onClick: () => act.patch(t.id, { status: 'dropped' }, '已放下这个任务（放下也是一种决定）') }, '放下'),
            h('button', { className: 'link danger', onClick: () => { if (confirm(`删除「${t.title}」？`)) act.remove(t.id) } }, '删除'))))
    }

    // 时间线：连续的同一任务专注块合并成一行，5 分钟小休息不单独占行
    function groupBlocks(blocks) {
      const toM = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b }
      const out = []
      for (const b of blocks) {
        const s = toM(b.start), e = toM(b.end)
        if (b.kind === 'break') {
          if (e - s <= 10) { const last = out[out.length - 1]; if (last && !last.sep) last.endM = e; continue }
          out.push({ sep: true, title: b.title, startM: s, endM: e, kind: 'break' }); continue
        }
        const last = out[out.length - 1]
        if (last && !last.sep && last.taskId && last.taskId === b.taskId && last.kind === b.kind) { last.endM = e; last.n += 1; last.work += e - s; continue }
        out.push({ kind: b.kind, title: b.title, taskId: b.taskId, startM: s, endM: e, n: 1, work: e - s })
      }
      return out
    }
    const hmOf = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

    function Timeline({ plan, now }) {
      if (!plan.blocks.length) return h('div', { className: 'empty' }, '今天的工作时间已过，或没有任务可排。')
      const d = new Date(now), nowM = d.getHours() * 60 + d.getMinutes()
      const groups = groupBlocks(plan.blocks)
      return h('ol', { className: 'tl' }, groups.map((g, i) => {
        const isNow = nowM >= g.startM && nowM < g.endM
        return h('li', { key: i, className: cx(g.sep ? 'sep' : g.kind, isNow && 'now') },
          h('span', { className: 'tm' }, hmOf(g.startM)),
          h('span', { className: 'rail' }, h('i')),
          h('div', { style: { minWidth: 0 } },
            h('div', { className: 'tt', title: g.title }, g.sep ? `${g.title} · 到 ${hmOf(g.endM)}` : g.title),
            !g.sep && h('div', { className: 'tm2' }, `${isNow ? '现在 · ' : ''}${g.n > 1 ? `${g.n} 段专注 · ` : ''}到 ${hmOf(g.endM)}`)))
      }))
    }

    const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    function Today(props) {
      const { plan } = props
      const act = useActions(props)
      const [showBacklog, setShowBacklog] = useKept('today.backlog', false)
      const [showDone, setShowDone] = useKept('today.done', false)
      const [openId, setOpenId] = useKept('today.open', null)
      const [now, setNow] = useState(Date.now())
      useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t) }, [])
      if (!plan) return h('p', { className: 'muted' }, '加载中…')
      const toggle = (id) => setOpenId(openId === id ? null : id)
      const swap = (t) => { const alt = plan.backlog[0] ?? plan.small[0]; if (!alt) return props.notify('任务池里没有可替换的任务', true); act.patch(t.id, { snoozeDate: true }).then(() => act.patch(alt.id, { pinnedDate: true }, `已换成「${alt.title}」，原任务明天再排`)) }
      const dt = new Date(`${plan.date}T12:00:00`)
      const sub = [`${dt.getMonth() + 1}月${dt.getDate()}日 ${WEEK[dt.getDay()]}`, plan.workday ? '工作日' : '休息日', plan.stats.todayFocusMinutes ? `已专注 ${plan.stats.todayFocusMinutes} 分钟` : null, plan.stats.streak ? `连续 ${plan.stats.streak} 天` : null].filter(Boolean).join(' · ')
      return h('div', { className: 'today' },
        h('header', { className: 'large' }, h('h1', null, '今天'), h('p', null, sub)),
        h(FocusBar, props),
        plan.capacityChange && h('p', { className: 'muted', style: { margin: '10px 4px 0' } }, `📊 ${plan.capacityChange}`),
        h('div', { className: 'split' },
          h('main', null,
            h('h4', null, `三件必做${plan.workday ? '' : ' · 休息日不排工作'}`),
            h('div', { className: 'group' }, plan.must.length
              ? plan.must.map((t, i) => h(TaskRow, { key: t.id, t, index: i, act, isCurrent: plan.next?.taskId === t.id, open: openId === t.id, onToggle: () => toggle(t.id), onSwap: () => swap(t) }))
              : h('div', { className: 'empty' }, '还没有任务。在下面说一句你想做的事。')),
            plan.small.length > 0 && h(Fragment, null,
              h('h4', null, '顺手做 · 20 分钟以内'),
              h('div', { className: 'group' }, plan.small.map((t) => h('div', { key: t.id, className: 'rowi' },
                h('button', { className: 'ck', 'aria-label': `完成：${t.title}`, onClick: () => act.patch(t.id, { status: 'done' }, '小任务 +1') }),
                h('div', { className: 'grow' }, h('div', { className: 't' }, t.title), h('div', { className: 'm' }, `${TRACK[t.track]?.[1] ?? ''} ${TRACK[t.track]?.[0] ?? ''} · ${t.adjustedEstimate} 分钟`)),
                h('button', { className: 'link', onClick: () => act.patch(t.id, { pinnedDate: true }, '已提为今日必做') }, '提为必做'))))),
            plan.doneToday.length > 0 && h(Fragment, null,
              h('h4', null, h('button', { className: 'disclose', 'aria-expanded': showDone, onClick: () => setShowDone(!showDone) }, `${showDone ? '▾' : '▸'} 今天已完成 ${plan.doneToday.length} 项`)),
              showDone && h('div', { className: 'group' }, plan.doneToday.map((t) => h('div', { key: t.id, className: 'rowi' },
                h('span', { className: 'ck on', 'aria-hidden': true }, '✓'),
                h('div', { className: 'grow' }, h('div', { className: 't', style: { color: 'var(--muted)' } }, t.title), h('div', { className: 'm' }, `${t.actualMin} 分钟`)),
                h('button', { className: 'link plain', onClick: () => act.patch(t.id, { status: 'todo' }) }, '撤销'))))),
            h('h4', null, h('button', { className: 'disclose', 'aria-expanded': showBacklog, onClick: () => setShowBacklog(!showBacklog) }, `${showBacklog ? '▾' : '▸'} 任务池 ${plan.backlog.length}`)),
            showBacklog && (plan.backlog.length
              ? h('div', { className: 'group' }, plan.backlog.map((t) => h(TaskRow, { key: t.id, t, act, open: openId === t.id, onToggle: () => toggle(t.id) })))
              : h('div', { className: 'muted', style: { padding: '0 4px' } }, '任务池是空的'))),
          h('aside', null,
            h('h4', null, '时间安排'),
            h('div', { className: 'group' }, h(Timeline, { plan, now })),
            h('p', { className: 'muted', style: { margin: '8px 4px 0', fontSize: 11.5 } }, '到点就只做这一件。'))),
        h('div', { style: { height: 20 } }),
        h(Dock, { ...props, act }))
    }

    // ———————————————— 灵感库 ————————————————
    function Ideas({ notify, reload }) {
      const [ideas, setIdeas] = useState(null)
      const [text, setText] = useKept('ideas.text', '')
      const [cat, setCat] = useKept('ideas.cat', 'all')
      const [sub, setSub] = useKept('ideas.sub', 'all')
      const [q, setQ] = useKept('ideas.q', '')
      const [busy, setBusy] = useKept('ideas.busy', false, false)
      const load = () => api('GET', '/ideas').then((r) => setIdeas(r.ideas)).catch((e) => notify(e.message, true))
      useEffect(() => { load() }, [])
      const [preview, setPreview] = useKept('ideas.preview', null) // { items, source, rawText, replaceId }
      const [openRaw, setOpenRaw] = useKept('ideas.openRaw', {})
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
      const editItem = (k, patchObj) => setPreview((pv) => ({ ...pv, items: pv.items.map((x, j) => (j === k ? { ...x, ...patchObj } : x)) }))
      const dropItem = (k) => setPreview((pv) => ({ ...pv, items: pv.items.filter((_x, j) => j !== k) }))
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
      const [closed, setClosed] = useKept('ws.closed', {})
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
      const [list, setList] = useKept('settings.list', null)
      const [types, setTypes] = useState([])
      const [dirty, setDirty] = useKept('settings.dirty', false)
      // 有没保存的修改时保留修改，只刷新类型列表
      const load = (force) => api('GET', '/sources').then((r) => { setTypes(r.types); if (force || !mem.get('settings.dirty')) { setList(r.sources); setDirty(false) } }).catch((e) => notify(e.message, true))
      useEffect(() => { load() }, [])
      if (!list || !types.length) return h('p', { className: 'muted' }, '加载中…')
      const typeOf = (t) => types.find((x) => x.type === t)
      const upd = (i, patch) => { setList(list.map((s, k) => (k === i ? { ...s, ...patch } : s))); setDirty(true) }
      const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = [...list]; [n[i], n[j]] = [n[j], n[i]]; setList(n); setDirty(true) }
      const del = (i) => { setList(list.filter((_s, k) => k !== i)); setDirty(true) }
      const add = () => { const t = types[0]; setList([...list, { id: `${t.type}-${Date.now().toString(36)}`, type: t.type, label: t.label, path: t.defaultPath, enabled: true, maxWorkspaces: 6 }]); setDirty(true) }
      const save = () => api('PUT', '/sources', { sources: list }).then((r) => { setList(r.sources); setDirty(false); notify('已保存，工作区看板会按这个顺序显示') }).catch((e) => notify(e.message, true))
      const reset = () => { if (confirm('恢复成自动检测的默认配置？')) api('POST', '/sources/reset', {}).then(() => { load(true); notify('已恢复默认') }).catch((e) => notify(e.message, true)) }
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
            dirty && h('button', { className: 'btn ghost', onClick: () => load(true) }, '放弃修改'),
            h('button', { className: 'btn pri', disabled: !dirty, onClick: save }, dirty ? '保存' : '已保存'))),
        h('p', { className: 'muted', style: { marginTop: 8 } }, '支持 DeepSeek Harness、Codex、Claude Code、OpenCode、WorkBuddy。同一种 Agent 可以加多个（比如两个 Codex 数据目录）。插件只读这些目录，不会改动里面的数据。'))
    }

    // ———————————————— 教练 ————————————————
    function Coach({ notify, reload }) {
      const [msgs, setMsgs] = useKept('coach.msgs', [])
      const [text, setText] = useKept('coach.text', '')
      const [busy, setBusy] = useKept('coach.busy', false, false)
      const send = async (e) => {
        e?.preventDefault(); const m = text.trim(); if (!m) return
        setMsgs((x) => [...x, { me: m }]); setText(''); setBusy(true)
        try { const r = await api('POST', '/coach', { message: m }); setMsgs((x) => [...x, { coach: r }]) } catch (err) { notify(err.message, true) } finally { setBusy(false) }
      }
      const addTask = async (t) => { try { await api('POST', '/tasks', t); notify(`已加入任务：${t.title}`); reload() } catch (e) { notify(e.message, true) } }
      const label = { high: '清晰', medium: '还差一点', low: '还比较模糊' }
      return h(Fragment, null,
        h('div', { className: 'row' }, h('p', { className: 'muted grow' }, '说说你现在想做的事或遇到的问题。教练会帮你把它说具体：对象、第一步动作、交付物、完成标准、时间。'),
          msgs.length > 0 && h('button', { className: 'btn ghost', onClick: () => { if (confirm('清空这段教练对话？')) setMsgs([]) } }, '清空对话')),
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
      const [selList, setSelList] = useKept('report.sel', [])
      const sel = new Set(selList), setSel = (n) => setSelList([...n])
      const [days, setDays] = useKept('report.days', 7)
      const [title, setTitle] = useKept('report.title', '')
      const [audience, setAudience] = useKept('report.audience', '')
      const [out, setOut] = useKept('report.out', null)
      const [busy, setBusy] = useKept('report.busy', false, false)
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


    // ———————————————— 日历：周视图 / 月视图 ————————————————
    const WK = ['一', '二', '三', '四', '五', '六', '日']
    function CalTask({ x, onOpen, today }) {
      const t = x.task ?? x
      const done = t.status === 'done'
      const steps = t.steps ?? []
      return h('div', { className: cx('ct', t.track, done && 'done', x.overdue && !done && 'late'), draggable: !done, role: 'button', tabIndex: 0,
        onDragStart: (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' },
        onClick: () => onOpen(t.id), onKeyDown: (e) => { if (e.key === 'Enter') onOpen(t.id) } },
        h('div', { className: 'ctt' }, done && '✓ ', t.title),
        h('div', { className: 'ctm' }, [
          done ? (t.actualMin ? `专注 ${t.actualMin} 分钟` : '已完成') : `${t.adjustedEstimate ?? t.estimateMin} 分钟`,
          !done && steps.length ? `${steps.filter((s) => s.done).length}/${steps.length} 步` : null,
          x.byDue ? '截止日' : !done && t.due ? `截止 ${Number(t.due.slice(5, 7))}/${Number(t.due.slice(8))}` : null,
          x.overdue && !done ? (x.byDue ? '已逾期' : '拖欠') : null,
        ].filter(Boolean).join(' · ')))
    }

    function TaskSheet({ t, act, onClose }) {
      const [title, setTitle] = useState(t.title)
      useEffect(() => setTitle(t.title), [t.id, t.title])
      useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
      const done = t.status === 'done'
      const p = (body, ok) => act.patch(t.id, body, ok)
      return h('div', { className: 'modal', onClick: onClose },
        h('div', { className: 'mcard2', role: 'dialog', 'aria-modal': true, 'aria-label': t.title, onClick: (e) => e.stopPropagation() },
          h('div', { className: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } },
            h('button', { className: cx('ck', done && 'on'), style: { marginTop: 6 }, 'aria-label': done ? '撤销完成' : '标记完成', onClick: () => p({ status: done ? 'todo' : 'done' }, done ? '已撤销完成' : '完成！') }, done ? '✓' : ''),
            h('textarea', { className: 'ttl', rows: 1, value: title, 'aria-label': '标题', onChange: (e) => setTitle(e.target.value.replace(/\n/g, '')),
              onBlur: () => { const v = title.trim(); if (v && v !== t.title) p({ title: v }, '标题已更新'); else setTitle(t.title) } }),
            h('button', { className: 'link plain', 'aria-label': '关闭', onClick: onClose, style: { fontSize: 18 } }, '×')),
          h('div', { className: 'form' },
            h('span', { className: 'muted' }, '类别'),
            h('span', { className: 'seg' }, Object.entries(TRACK).map(([k, [l, ic]]) => h('button', { key: k, className: cx(t.track === k && 'on'), onClick: () => p({ track: k }) }, `${ic} ${l}`))),
            h('span', { className: 'muted' }, '计划日期'),
            h('span', { className: 'row' }, h('input', { className: 'in', type: 'date', value: t.planDate ?? '', onChange: (e) => p({ planDate: e.target.value || null }) }),
              h('button', { className: 'link', onClick: () => p({ planDate: dkey() }) }, '今天'), h('button', { className: 'link', onClick: () => p({ planDate: addK(dkey(), 1) }) }, '明天'),
              t.planDate && h('button', { className: 'link plain', onClick: () => p({ planDate: null }) }, '清除')),
            h('span', { className: 'muted' }, '截止日期'),
            h('span', { className: 'row' }, h('input', { className: 'in', type: 'date', value: t.due ?? '', onChange: (e) => p({ due: e.target.value || null }) }),
              t.due && h('button', { className: 'link plain', onClick: () => p({ due: null }) }, '清除')),
            h('span', { className: 'muted' }, '重要'), h(Stars, { value: t.importance, label: '重要', onChange: (v) => p({ importance: v }) }),
            h('span', { className: 'muted' }, '紧急'), h(Stars, { value: t.urgency, label: '紧急', onChange: (v) => p({ urgency: v }) }),
            h('span', { className: 'muted' }, '进度'), h('span', null, `${(t.steps ?? []).filter((s) => s.done).length}/${(t.steps ?? []).length} 步 · 约 ${t.adjustedEstimate ?? t.estimateMin} 分钟${t.actualMin ? ` · 已专注 ${t.actualMin} 分钟` : ''}`)),
          h('div', { className: 'row', style: { marginTop: 18 } },
            !done && h('button', { className: 'btn pri', onClick: () => p({ status: 'done' }, '完成！').then(onClose) }, '标记完成'),
            done && h('button', { className: 'btn', onClick: () => p({ status: 'todo' }, '已撤销完成') }, '撤销完成'),
            h('span', { className: 'grow' }),
            h('button', { className: 'link danger', onClick: () => { if (confirm(`删除「${t.title}」？`)) act.remove(t.id).then(onClose) } }, '删除'))))
    }

    function CalendarView(props) {
      const [mode, setMode] = useKept('cal.mode', 'week')
      const [anchor, setAnchor] = useKept('cal.anchor', dkey())
      const [planDate, setPlanDate] = useKept('cal.planDate', null)
      const [openId, setOpenId] = useKept('cal.open', null)
      const [data, setData] = useState(null)
      const [over, setOver] = useState(null)
      const today = dkey()
      const from = mode === 'week' ? weekOf(anchor) : weekOf(anchor.slice(0, 8) + '01')
      const to = addK(from, mode === 'week' ? 6 : 41)
      const load = useCallback(() => api('GET', `/calendar?from=${from}&to=${to}`).then(setData).catch((e) => props.notify(e.message, true)), [from, to])
      useEffect(() => { load() }, [load])
      const reloadAll = useCallback(async () => { await Promise.all([load(), props.reload()]) }, [load, props.reload])
      const act = useActions({ reload: reloadAll, notify: props.notify })
      const move = (id, date) => {
        const t = findT(id); if (!t || (t.planDate ?? null) === date) return
        act.patch(id, { planDate: date }, date ? `已安排到 ${mdLabel(date)}` : '已移到未安排')
      }
      const allT = data ? [...data.days.flatMap((d) => [...d.tasks.map((x) => x.task), ...d.done, ...d.dues]), ...data.unscheduled] : []
      const findT = (id) => allT.find((t) => t.id === id)
      const openT = openId && findT(openId)
      const dropZone = (key, date) => ({
        onDragOver: (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key) },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null) },
        onDrop: (e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, date) },
      })
      const addOn = (date) => { setPlanDate(date); focusDock('task') }
      const step = (n) => setAnchor(mode === 'week' ? addK(anchor, 7 * n) : (() => { const d = kdate(anchor.slice(0, 8) + '01'); d.setMonth(d.getMonth() + n); return dkey(d) })())
      const a = kdate(anchor)
      const title = mode === 'week'
        ? (() => { const f = kdate(from), t2 = kdate(to); return f.getMonth() === t2.getMonth() ? `${f.getFullYear()}年${f.getMonth() + 1}月 ${f.getDate()}–${t2.getDate()}日` : `${f.getMonth() + 1}月${f.getDate()}日 – ${t2.getMonth() + 1}月${t2.getDate()}日` })()
        : `${a.getFullYear()}年${a.getMonth() + 1}月`

      const week = () => h('div', { className: 'calwrap' },
        h('div', { className: 'week' }, data.days.map((d, i) => {
          const past = d.date < today, isToday = d.date === today
          const items = [...d.tasks, ...d.done.map((t) => ({ task: t }))]
          return h('section', { key: d.date, className: cx('day', isToday && 'today', past && 'past', over === d.date && 'over'), ...dropZone(d.date, d.date), 'aria-label': mdLabel(d.date) },
            h('header', null,
              h('span', { className: 'wd' }, `周${WK[i]}`),
              h('span', { className: 'dn' }, kdate(d.date).getDate()),
              h('span', { className: 'grow' }),
              !past && h('button', { className: 'add', title: `在 ${mdLabel(d.date)} 加任务`, 'aria-label': `在 ${mdLabel(d.date)} 加任务`, onClick: () => addOn(d.date) }, '＋')),
            h('div', { className: 'items' },
              items.map((x) => h(CalTask, { key: (x.task ?? x).id, x, onOpen: setOpenId, today })),
              !items.length && h('div', { className: 'none' }, past ? '' : '空')),
            d.dues.length > 0 && h('div', { className: 'duebar' }, d.dues.map((t) => h('button', { key: t.id, className: 'link danger', onClick: () => setOpenId(t.id) }, `截止：${t.title}`))),
            (past || isToday) && (d.done.length || d.focusMin) ? h('footer', null, `完成 ${d.done.length} 项 · 专注 ${d.focusMin} 分钟`) : null)
        })),
        h('aside', { className: cx('unsch', over === 'none' && 'over'), ...dropZone('none', null) },
          h('h4', { style: { marginTop: 0 } }, `未安排 ${data.unscheduled.length}`),
          data.unscheduled.length ? data.unscheduled.map((t) => h(CalTask, { key: t.id, x: { task: t }, onOpen: setOpenId, today }))
            : h('div', { className: 'none' }, '没有未安排的任务'),
          h('p', { className: 'muted', style: { fontSize: 11.5, marginTop: 8 } }, '拖到某一天就安排在那天；拖回这里取消安排。')))

      const month = () => {
        const m = anchor.slice(0, 7)
        return h('div', null,
          h('div', { className: 'mhead' }, WK.map((w) => h('span', { key: w }, w))),
          h('div', { className: 'month' }, data.days.map((d) => {
            const items = [...d.tasks, ...d.done.map((t) => ({ task: t }))]
            return h('button', { key: d.date, className: cx('mc', d.date.slice(0, 7) !== m && 'out', d.date === today && 'today', d.date < today && 'past'),
              onClick: () => { setAnchor(d.date); setMode('week') }, 'aria-label': `${mdLabel(d.date)}，${items.length} 项，切到这一周` },
              h('div', { className: 'row', style: { gap: 4 } }, h('span', { className: 'dn' }, kdate(d.date).getDate()), h('span', { className: 'grow' }),
                d.dues.length > 0 && h('span', { className: 'dueDot', title: `${d.dues.length} 项截止` }),
                d.done.length > 0 && h('span', { className: 'mdone' }, `✓${d.done.length}`)),
              items.slice(0, 3).map((x) => { const t = x.task ?? x; return h('span', { key: t.id, className: cx('mchip', t.track, t.status === 'done' && 'done', x.overdue && t.status !== 'done' && 'late') }, t.title) }),
              items.length > 3 && h('span', { className: 'more' }, `+${items.length - 3}`))
          })))
      }

      return h('div', { className: 'today' },
        h('header', { className: 'large' }, h('h1', null, '日历'), h('p', null, '拖动任务改安排的日子；点任务看详情。')),
        h('div', { className: 'caltool' },
          h('span', { className: 'seg' }, [['week', '周'], ['month', '月']].map(([k, l]) => h('button', { key: k, className: cx(mode === k && 'on'), onClick: () => setMode(k) }, l))),
          h('button', { className: 'btn', 'aria-label': '上一页', onClick: () => step(-1) }, '‹'),
          h('button', { className: 'btn', onClick: () => setAnchor(today) }, '今天'),
          h('button', { className: 'btn', 'aria-label': '下一页', onClick: () => step(1) }, '›'),
          h('h3', { style: { marginLeft: 6 } }, title)),
        !data ? h('p', { className: 'muted' }, '加载中…') : mode === 'week' ? week() : month(),
        openT && h(TaskSheet, { t: openT, act, onClose: () => setOpenId(null) }),
        h('div', { style: { height: 20 } }),
        props.plan && h(Dock, { ...props, act, reload: reloadAll, planDate, setPlanDate }))
    }

    function App() {
      const [tab, setTab] = useKept('app.tab', 'today')
      const [toast, setToast] = useState(null)
      const [plan, setPlan] = useState(null)
      const [status, setStatus] = useState(null)
      const notify = useCallback((text, err) => { setToast({ text, err }); setTimeout(() => setToast(null), err ? 5000 : 2600) }, [])
      const reload = useCallback(() => api('GET', '/plan').then(setPlan).catch((e) => notify(e.message, true)), [notify])
      useEffect(() => { reload(); api('GET', '/status').then(setStatus).catch(() => {}) }, [reload])
      useEffect(() => { const t = setInterval(reload, 60000); return () => clearInterval(t) }, [reload])
      const shared = { plan, reload, notify, status, goSettings: () => setTab('settings') }
      const tabs = [['today', '今日'], ['cal', '日历'], ['ideas', '灵感库'], ['ws', '工作区'], ['coach', '教练'], ['growth', '成长'], ['report', '汇报'], ['settings', '设置']]
      const tabsView = { today: Today, ideas: Ideas, ws: Workspaces, coach: Coach, growth: Growth, report: Report, settings: Settings }
      const View = tabsView[tab] ?? Today
      return h('div', { className: 'awb' }, h('style', null, css),
        toast && h('div', { className: cx('toast', toast.err && 'err'), role: 'status' }, h('span', null, toast.text)),
        h('div', { className: 'topbar' },
          h('nav', { className: 'tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { key: id, role: 'tab', 'aria-selected': tab === id, className: cx('tab', tab === id && 'on'), onClick: () => setTab(id) }, label))),
          h('span', { className: 'grow' }),
          plan?.active && tab !== 'today' && tab !== 'cal' && h('button', { className: 'pill live', style: { border: 0, cursor: 'pointer' }, onClick: () => setTab('today') }, '● 专注中'),
          status && h('span', { className: 'pill', title: status.ai.available ? `${status.ai.provider}/${status.ai.model}` : '模型不可用，使用规则兜底' }, status.ai.available ? 'AI 就绪' : '规则模式')),
        tab === 'today' ? h(Today, shared) : tab === 'cal' ? h(CalendarView, shared) : h('div', { className: 'tabpage', style: { marginTop: 12 } }, h(View, shared)))
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
          name: 'sidebar.panellist', id: PANEL_ID, order: 5, label: () => '个人工作台',
        }, SidebarIcon))
        return () => { offRow?.(); offMain?.() }
      }))
    }
    return { inject: ['slots'], apply }
  },
})
