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
.awb{--line:var(--dsw-alias-border-l1,color-mix(in srgb,currentColor 12%,transparent));--hair:color-mix(in srgb,currentColor 9%,transparent);
  --soft:var(--dsw-alias-bg-layer-1,color-mix(in srgb,currentColor 4%,transparent));--fill:color-mix(in srgb,currentColor 6%,transparent);
  --muted:var(--dsw-alias-label-secondary,color-mix(in srgb,currentColor 58%,transparent));--faint:color-mix(in srgb,currentColor 38%,transparent);
  --surface:var(--dsw-alias-bg-layer-1,Canvas);
  --panel:color-mix(in srgb,currentColor 4%,transparent);
  /* Liquid Glass 材质：底色从宿主层颜色派生，亮色/暗色主题自动正确 */
  --glass:color-mix(in srgb,var(--surface) 58%,transparent);
  --glass-strong:color-mix(in srgb,var(--surface) 76%,transparent);
  --glass-edge:inset 0 1px 0 color-mix(in srgb,#fff 36%,transparent),inset 0 0 0 .5px color-mix(in srgb,currentColor 13%,transparent);
  --glass-sheen:linear-gradient(180deg,color-mix(in srgb,#fff 9%,transparent),transparent 52%);
  --glass-shadow:0 12px 34px -10px rgba(0,0,0,.30),0 2px 8px rgba(0,0,0,.09);
  --glass-shadow-lg:0 26px 70px -14px rgba(0,0,0,.42),0 4px 14px rgba(0,0,0,.12);
  --blur:saturate(185%) blur(24px);
  --acc:#0a84ff;--acc2:#5e5ce6;--ok:#30b158;--warn:#ff9f0a;--bad:#ff453a;--growth:#30b158;--life:#ff9f0a;
  height:100%;overflow:auto;padding:0 20px;font-size:14px;line-height:1.5;color:inherit;box-sizing:border-box;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",system-ui,sans-serif;-webkit-font-smoothing:antialiased;
  display:flex;flex-direction:column;container-type:inline-size;
  scrollbar-width:thin;scrollbar-color:color-mix(in srgb,currentColor 22%,transparent) transparent}
.awb::-webkit-scrollbar{width:10px;height:10px}
.awb::-webkit-scrollbar-thumb{border-radius:10px;border:3px solid transparent;background-clip:content-box;background-color:color-mix(in srgb,currentColor 22%,transparent)}
.awb::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,currentColor 34%,transparent)}
.awb>*{flex-shrink:0}
.awb *{box-sizing:border-box}.awb h1,.awb h2,.awb h3,.awb h4,.awb p{margin:0}
.awb h3{font-size:15px;font-weight:600;letter-spacing:-.01em}
.awb h4{font-size:12px;font-weight:600;color:var(--muted);margin:22px 4px 8px;letter-spacing:.02em}
.awb .muted{color:var(--muted);font-size:12.5px}
.awb button,.awb input,.awb select,.awb textarea{font:inherit;color:inherit}
.awb button:focus-visible,.awb input:focus-visible,.awb select:focus-visible,.awb textarea:focus-visible,[role=button]:focus-visible{outline:2.5px solid color-mix(in srgb,var(--acc) 65%,transparent);outline-offset:2px}
/* —— macOS 控件 —— */
.awb .btn{appearance:none;border:0;background:var(--fill);border-radius:999px;padding:5px 13px;cursor:pointer;font-size:12.5px;font-weight:500;white-space:nowrap;
  transition:background .18s cubic-bezier(.32,.72,0,1),transform .12s cubic-bezier(.32,.72,0,1),box-shadow .18s}
.awb .btn:hover:not(:disabled){background:color-mix(in srgb,currentColor 11%,transparent)}
.awb .btn:active:not(:disabled){transform:scale(.96)}
.awb .btn:disabled{opacity:.4;cursor:default}
.awb .btn.pri{background:var(--acc);color:#fff;font-weight:600;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 28%,transparent),0 1px 3px rgba(10,60,140,.28)}
.awb .btn.pri:hover:not(:disabled){background:color-mix(in srgb,var(--acc) 88%,#000)}
.awb .btn.ghost{background:transparent}.awb .btn.ghost:hover:not(:disabled){background:var(--fill)}
.awb .btn.danger{color:var(--bad)}
.awb .link{appearance:none;border:0;background:none;padding:2px 0;color:var(--acc);cursor:pointer;font-size:13px;font-weight:500;transition:opacity .15s}
.awb .link:hover{opacity:.72}
.awb .link.danger{color:var(--bad)}.awb .link.plain{color:var(--muted)}
.awb .link:disabled{opacity:.4;cursor:default}
.awb .in{border:.5px solid var(--hair);background:var(--fill);border-radius:10px;padding:7px 11px;min-width:0;outline:none;transition:box-shadow .18s,background .18s}
.awb .in:focus{box-shadow:0 0 0 3.5px color-mix(in srgb,var(--acc) 30%,transparent);background:color-mix(in srgb,currentColor 8%,transparent)}
.awb textarea.in{width:100%;resize:vertical}
.awb .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.awb .grow{flex:1;min-width:0}
.awb .card{border-radius:16px;padding:14px;background:var(--panel);border:.5px solid var(--hair)}
/* —— 顶部玻璃工具栏 —— */
.awb .topbar{position:sticky;top:0;z-index:7;display:flex;gap:10px;align-items:center;margin:0 -20px 4px;padding:9px 20px;
  background:var(--glass);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  box-shadow:inset 0 -1px 0 color-mix(in srgb,currentColor 10%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 22%,transparent)}
.awb .tabs{display:inline-flex;gap:2px;padding:2.5px;border-radius:11px;overflow-x:auto;max-width:100%;scrollbar-width:none;
  background:color-mix(in srgb,currentColor 7%,transparent);box-shadow:inset 0 .5px 1px color-mix(in srgb,currentColor 11%,transparent)}
.awb .tabs::-webkit-scrollbar{display:none}
.awb .tab{border:0;background:none;padding:5px 13px;border-radius:8.5px;cursor:pointer;color:var(--muted);font-weight:500;font-size:13px;white-space:nowrap;
  transition:background .22s cubic-bezier(.32,.72,0,1),color .22s,box-shadow .22s,transform .12s}
.awb .tab:hover:not(.on){color:inherit;background:color-mix(in srgb,currentColor 6%,transparent)}
.awb .tab:active{transform:scale(.97)}
.awb .tab.on{color:inherit;background:color-mix(in srgb,var(--surface) 94%,transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 55%,transparent),0 1px 3px rgba(0,0,0,.16),0 0 0 .5px color-mix(in srgb,currentColor 9%,transparent)}
.awb .badge{display:inline-flex;align-items:center;gap:3px;border-radius:7px;padding:1px 7px;font-size:11.5px;font-weight:500;background:var(--fill)}
.awb .badge.work{color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,transparent)}
.awb .badge.growth{color:var(--growth);background:color-mix(in srgb,var(--growth) 12%,transparent)}
.awb .badge.life{color:var(--life);background:color-mix(in srgb,var(--life) 12%,transparent)}
.awb .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 11px;font-size:12px;font-weight:500;background:var(--fill)}
.awb .pill.live{color:var(--acc);background:color-mix(in srgb,var(--acc) 12%,transparent)}
/* —— 大标题 —— */
.awb .large{margin:12px 4px 14px}
.awb .large h1{font-size:30px;font-weight:700;letter-spacing:-.025em;line-height:1.15}
.awb .large p{color:var(--muted);font-size:13.5px;margin-top:3px}
/* —— 现在只做这一步（着色玻璃） —— */
.awb .hero{position:relative;border-radius:22px;padding:20px 22px;overflow:hidden;
  background:var(--glass-sheen),linear-gradient(160deg,color-mix(in srgb,var(--acc) 15%,transparent),color-mix(in srgb,var(--acc2) 7%,transparent)),var(--glass);
  -webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  box-shadow:var(--glass-edge),0 10px 30px -12px color-mix(in srgb,var(--acc) 40%,transparent)}
.awb .hero .eyebrow{font-size:11.5px;font-weight:600;letter-spacing:.06em;color:var(--acc)}
.awb .hero .title{font-size:24px;font-weight:700;letter-spacing:-.02em;line-height:1.25;margin:6px 0 4px}
.awb .hero .sub{color:var(--muted);font-size:13px}
.awb .hero .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;align-items:center}
.awb .hero .btn{padding:8px 16px;font-size:13.5px}
.awb .clock{font-variant-numeric:tabular-nums;font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1}
.awb .clock.over{color:var(--warn)}
/* —— 今日布局：主列 + 窄时间线 —— */
.awb .today{flex:1 0 auto;display:flex;flex-direction:column}
.awb .split{display:grid;grid-template-columns:minmax(0,1fr);gap:0 28px}
@container (min-width:860px){.awb .split{grid-template-columns:minmax(0,1fr) 260px}.awb .split>aside{position:sticky;top:64px;align-self:start}}
/* 分组列表：清澈的淡泽面，不加重模糊 */
.awb .group{border-radius:16px;background:var(--panel);border:.5px solid var(--hair);overflow:hidden;
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.awb .rowi{display:flex;gap:12px;align-items:center;padding:11px 14px;position:relative;cursor:default;transition:background .16s}
.awb .group>*+*{border-top:.5px solid var(--hair)}
.awb .rowi.click{cursor:pointer}.awb .rowi.click:hover{background:color-mix(in srgb,currentColor 5%,transparent)}
.awb .rowi .t{font-size:14.5px;font-weight:500;line-height:1.35;overflow:hidden;text-overflow:ellipsis}
.awb .rowi .m{color:var(--muted);font-size:12px;margin-top:2px}
.awb .rowi.cur{background:color-mix(in srgb,var(--acc) 6%,transparent)}
.awb .rowi.cur .t{font-weight:600}
.awb .chev{color:var(--faint);font-size:14px;transition:transform .24s cubic-bezier(.32,.72,0,1);flex:none}.awb .chev.open{transform:rotate(90deg)}
.awb .lead{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:600;flex:none;background:var(--fill);color:var(--muted)}
.awb .rowi.cur .lead{background:var(--acc);color:#fff;box-shadow:0 1px 4px color-mix(in srgb,var(--acc) 45%,transparent)}
.awb .ck{appearance:none;width:22px;height:22px;border-radius:50%;border:1.5px solid var(--faint);background:none;flex:none;cursor:pointer;display:grid;place-items:center;padding:0;color:#fff;font-size:12px;
  transition:background .18s,border-color .18s,transform .12s}
.awb .ck:hover{border-color:var(--acc)}.awb .ck:active{transform:scale(.9)}
.awb .ck.on{background:var(--ok);border-color:var(--ok);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 30%,transparent)}
.awb .prog{height:3px;border-radius:3px;background:var(--fill);overflow:hidden;margin-top:7px}
.awb .prog>i{display:block;height:100%;background:var(--acc);border-radius:3px;transition:width .45s cubic-bezier(.32,.72,0,1)}
.awb .detail{padding:2px 14px 12px 50px;background:color-mix(in srgb,currentColor 1.5%,transparent)}
.awb .detail .sl{list-style:none;margin:0;padding:0}
.awb .detail .sl li{display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:.5px solid var(--hair);font-size:13.5px}
.awb .detail .sl li .ck{width:18px;height:18px;font-size:10px}
.awb .detail .sl li.done span.grow{color:var(--muted);text-decoration:line-through}
.awb .detail .sl li.next span.grow{font-weight:600}
.awb .detail .notes{margin-top:10px;display:grid;gap:4px}
.awb .detail .foot{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:12px}
.awb .disclose{appearance:none;border:0;background:none;padding:0;color:var(--muted);font:inherit;font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.02em;transition:color .15s}
.awb .disclose:hover{color:inherit}
.awb .empty{padding:18px 14px;color:var(--muted);font-size:13px}
/* —— 时间线 —— */
.awb .tl{list-style:none;margin:0;padding:6px 0}
.awb .tl li{display:grid;grid-template-columns:42px 14px minmax(0,1fr);gap:0 8px;align-items:start;padding:7px 14px 7px 12px;position:relative}
.awb .tl .tm{font-variant-numeric:tabular-nums;font-size:12px;color:var(--muted);padding-top:1px;text-align:right}
.awb .tl .rail{position:relative;height:100%;min-height:20px}
.awb .tl .rail:before{content:"";position:absolute;left:6px;top:-8px;bottom:-8px;width:1.5px;background:var(--hair)}
.awb .tl li:first-child .rail:before{top:7px}.awb .tl li:last-child .rail:before{bottom:auto;height:15px}
.awb .tl .rail i{position:absolute;left:2px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--surface);border:2px solid var(--faint)}
.awb .tl li.focus .rail i{border-color:var(--acc)}.awb .tl li.growth .rail i{border-color:var(--growth)}
.awb .tl li.warmup .rail i,.awb .tl li.batch .rail i{border-color:var(--life)}
.awb .tl li.now .rail i{background:var(--acc);border-color:var(--acc);box-shadow:0 0 0 4px color-mix(in srgb,var(--acc) 22%,transparent)}
.awb .tl .tt{font-size:13px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.awb .tl .tm2{font-size:11.5px;color:var(--muted)}
.awb .tl li.now .tt{font-weight:600}.awb .tl li.now .tm{color:var(--acc);font-weight:600}
.awb .tl li.sep{padding-top:3px;padding-bottom:3px}.awb .tl li.sep .tt{font-size:11.5px;color:var(--muted)}
.awb .tl li.sep .rail i{width:6px;height:6px;left:4px;top:5px;border:0;background:var(--faint)}
/* —— 悬浮底栏（最厚的玻璃） —— */
.awb .dock{position:sticky;bottom:0;z-index:5;margin:auto -20px 0;padding:12px 20px 16px;
  background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--surface) 52%,transparent) 42%)}
.awb .dock .inner{max-width:760px;margin:0 auto;border-radius:22px;padding:9px;
  background:var(--glass-sheen),var(--glass-strong);
  -webkit-backdrop-filter:saturate(190%) blur(30px);backdrop-filter:saturate(190%) blur(30px);
  box-shadow:var(--glass-edge),var(--glass-shadow)}
.awb .dock .sheet{max-height:min(46vh,380px);overflow:auto;padding:4px 6px 8px;margin-bottom:6px;border-bottom:.5px solid var(--hair)}
.awb .dock .sheet .msg{margin:6px 0;padding:8px 13px;border-radius:18px;max-width:86%;font-size:13.5px;width:fit-content}
.awb .dock .sheet .msg.me{margin-left:auto;background:var(--acc);color:#fff;border-bottom-right-radius:6px;box-shadow:0 1px 4px color-mix(in srgb,var(--acc) 40%,transparent)}
.awb .dock .sheet .msg.coach{background:var(--fill);border:0;border-bottom-left-radius:6px}
.awb .dock .ctl{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:0 4px 6px}
.awb .seg{display:inline-flex;gap:2px;padding:2.5px;border-radius:10px;background:color-mix(in srgb,currentColor 7%,transparent);
  box-shadow:inset 0 .5px 1px color-mix(in srgb,currentColor 11%,transparent)}
.awb .seg button{border:0;background:none;padding:3px 11px;border-radius:7.5px;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;white-space:nowrap;
  transition:background .2s cubic-bezier(.32,.72,0,1),color .2s,box-shadow .2s,transform .12s}
.awb .seg button:hover:not(.on){color:inherit}
.awb .seg button:active{transform:scale(.96)}
.awb .seg button.on{background:color-mix(in srgb,var(--surface) 94%,transparent);color:inherit;
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 50%,transparent),0 1px 2.5px rgba(0,0,0,.16)}
.awb .dock select.in{padding:3px 8px;font-size:12px;border-radius:8px;max-width:240px}
.awb .composer{display:flex;gap:8px;align-items:flex-end}
.awb .composer textarea{flex:1;border:.5px solid transparent;background:var(--fill);border-radius:16px;padding:9px 14px;resize:none;outline:none;max-height:140px;font-size:14px;line-height:1.45;min-height:38px;
  transition:box-shadow .18s,background .18s}
.awb .composer textarea:focus{box-shadow:0 0 0 3.5px color-mix(in srgb,var(--acc) 28%,transparent);background:color-mix(in srgb,currentColor 8%,transparent)}
.awb .send{width:36px;height:36px;border-radius:50%;border:0;background:var(--acc);color:#fff;font-size:17px;font-weight:700;cursor:pointer;flex:none;display:grid;place-items:center;
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 32%,transparent),0 2px 6px color-mix(in srgb,var(--acc) 40%,transparent);transition:opacity .18s,transform .12s,background .18s}
.awb .send:hover:not(:disabled){background:color-mix(in srgb,var(--acc) 88%,#000)}
.awb .send:disabled{opacity:.3;cursor:default}.awb .send:active:not(:disabled){transform:scale(.9)}
.awb .confirm{margin:8px 0 4px;padding:12px 14px;border-radius:16px;background:var(--glass-strong);border:.5px solid color-mix(in srgb,var(--acc) 38%,transparent);
  box-shadow:0 6px 20px -8px color-mix(in srgb,var(--acc) 45%,transparent)}
/* —— 其他标签页沿用 —— */
.awb .focus{border-radius:16px;padding:14px;background:color-mix(in srgb,var(--acc) 8%,transparent)}
.awb .must{display:grid;gap:10px}
.awb .bar{height:4px;border-radius:9px;background:var(--fill);overflow:hidden;margin:8px 0 4px}
.awb .bar>i{display:block;height:100%;background:var(--acc);transition:width .35s cubic-bezier(.32,.72,0,1)}
.awb .small{display:grid;gap:4px}
.awb .small .it{display:flex;gap:8px;align-items:center;padding:7px 10px;border-radius:11px;background:var(--panel);border:.5px solid var(--hair)}
.awb .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.awb .ws{border:.5px solid var(--hair);background:var(--panel);border-radius:16px;padding:10px 12px;margin-bottom:10px;
  box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.awb .sess{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:.5px solid var(--hair)}
.awb .sess:first-of-type{border-top:0}
.awb .dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:var(--faint)}.awb .dot.running{background:var(--ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--ok) 25%,transparent)}
.awb .ideas{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.awb .chips{display:flex;gap:6px;flex-wrap:wrap}
.awb .chip{border:0;border-radius:999px;padding:4px 12px;cursor:pointer;background:var(--fill);font-size:12.5px;font-weight:500;
  transition:background .18s,transform .12s,box-shadow .18s}
.awb .chip:hover:not(:disabled){background:color-mix(in srgb,currentColor 11%,transparent)}
.awb .chip:active:not(:disabled){transform:scale(.96)}
.awb .chip.on{background:var(--acc);color:#fff;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 26%,transparent),0 1px 4px color-mix(in srgb,var(--acc) 40%,transparent)}
.awb .msg{padding:10px 13px;border-radius:16px;margin:8px 0;max-width:92%}
.awb .msg.me{margin-left:auto;background:color-mix(in srgb,var(--acc) 14%,transparent)}
.awb .msg.coach{background:var(--panel);border:.5px solid var(--hair)}
.awb .paper{margin-top:8px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--warn) 12%,transparent)}
.awb .clar{font-weight:600}.awb .clar.low{color:var(--bad)}.awb .clar.medium{color:var(--warn)}.awb .clar.high{color:var(--ok)}
.awb .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}
.awb .kpi{border-radius:16px;padding:12px;background:var(--panel);border:.5px solid var(--hair);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 10%,transparent)}
.awb .kpi b{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em}
.awb .hours{display:flex;align-items:flex-end;gap:2px;height:70px;margin-top:6px}
.awb .hours i{flex:1;background:var(--acc);border-radius:3px 3px 0 0;min-height:1px}
.awb .ins{padding:10px 12px;border-radius:12px;margin-bottom:6px;background:var(--panel);border:.5px solid var(--hair);border-left:3px solid var(--acc)}
.awb .ins.warn{border-left-color:var(--warn)}.awb .ins.good{border-left-color:var(--ok)}
/* 提示气泡：玻璃 */
.awb .toast{position:sticky;top:0;z-index:9;align-self:center;height:0;overflow:visible;display:flex;justify-content:center}
.awb .toast>span{display:inline-block;margin-top:8px;padding:9px 17px;border-radius:999px;font-size:13px;font-weight:500;
  background:var(--glass-sheen),var(--glass-strong);-webkit-backdrop-filter:var(--blur);backdrop-filter:var(--blur);
  box-shadow:var(--glass-edge),var(--glass-shadow);animation:awbpop .38s cubic-bezier(.2,.9,.3,1.15)}
.awb .toast.err>span{color:var(--bad)}
@keyframes awbpop{0%{transform:translateY(-8px) scale(.95);opacity:0}100%{transform:none;opacity:1}}
.awb pre.md{white-space:pre-wrap;font-size:12px;max-height:340px;overflow:auto;padding:12px;border-radius:12px;background:var(--fill)}
.awb .ring text{font-weight:600}
.awb .intake .chat{max-height:300px;overflow:auto}
.awb .src{margin-bottom:18px}
.awb .src>.hd{display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:.5px solid var(--line);margin-bottom:10px;cursor:pointer}
.awb .wsgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.awb .wsgrid .ws{margin:0}
.awb .srcrow{display:grid;grid-template-columns:24px 120px 130px 1fr 70px 96px auto;gap:6px;align-items:center;padding:6px 0;border-top:.5px solid var(--hair)}
.awb .tabpage{padding-bottom:28px}
/* —— 日历 —— */
.awb .caltool{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 2px 12px}
.awb .calwrap{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
@container (min-width:900px){.awb .calwrap{grid-template-columns:minmax(0,1fr) 220px}.awb .calwrap>aside{position:sticky;top:64px;align-self:start}}
.awb .week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.awb .day{border-radius:16px;background:var(--panel);border:.5px solid var(--hair);padding:8px 6px;min-height:220px;display:flex;flex-direction:column;gap:6px;
  transition:background .2s cubic-bezier(.32,.72,0,1),box-shadow .2s}
.awb .day header{display:flex;align-items:baseline;gap:5px;padding:0 4px}
.awb .day .wd{font-size:11.5px;color:var(--muted);font-weight:600}
.awb .day .dn{font-size:20px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.awb .day.today .dn{color:#fff;background:var(--acc);border-radius:999px;min-width:30px;text-align:center;font-size:16px;padding:1px 6px;
  box-shadow:0 1px 5px color-mix(in srgb,var(--acc) 45%,transparent)}
.awb .day.past{opacity:.78}
/* 拖放目标：玻璃感蓝圈 */
.awb .day.over,.awb .unsch.over{background:color-mix(in srgb,var(--acc) 7%,transparent);
  box-shadow:0 0 0 2px var(--acc),0 0 0 7px color-mix(in srgb,var(--acc) 16%,transparent),inset 0 1px 0 color-mix(in srgb,#fff 18%,transparent)}
.awb .day .items{display:flex;flex-direction:column;gap:5px;flex:1}
.awb .day .none,.awb .unsch .none{color:var(--faint);font-size:12px;padding:4px}
.awb .day footer{font-size:11px;color:var(--muted);padding:4px 4px 0;border-top:.5px solid var(--hair)}
.awb .day .add{border:0;background:none;color:var(--acc);font-size:17px;line-height:1;cursor:pointer;border-radius:8px;padding:2px 6px;opacity:.55;transition:opacity .15s,background .15s,transform .12s}
.awb .day:hover .add,.awb .day .add:focus{opacity:1}.awb .day .add:hover{background:var(--fill)}.awb .day .add:active{transform:scale(.9)}
.awb .duebar{display:flex;flex-direction:column;gap:2px;padding:0 4px}.awb .duebar .link{font-size:11.5px;text-align:left;padding:0}
.awb .ct{border-radius:10px;padding:6px 8px;background:color-mix(in srgb,var(--surface) 88%,transparent);border:.5px solid var(--hair);border-left:3px solid var(--acc);
  cursor:grab;user-select:none;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 16%,transparent),0 1px 2px rgba(0,0,0,.05);
  transition:box-shadow .18s,transform .12s}
.awb .ct:hover{box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 20%,transparent),0 3px 10px rgba(0,0,0,.13)}
.awb .ct:active{cursor:grabbing;transform:scale(.985)}
.awb .ct.growth{border-left-color:var(--growth)}.awb .ct.life{border-left-color:var(--life)}
.awb .ct.done{cursor:pointer;opacity:.6;border-left-color:var(--faint)}.awb .ct.done .ctt{text-decoration:line-through}
.awb .ct.late{background:color-mix(in srgb,var(--bad) 7%,var(--surface))}.awb .ct.late .ctm{color:var(--bad)}
.awb .ctt{font-size:12.5px;font-weight:500;line-height:1.35;word-break:break-word}
.awb .ctm{font-size:11px;color:var(--muted);margin-top:2px}
.awb .unsch{border-radius:16px;background:var(--panel);border:1px dashed color-mix(in srgb,currentColor 18%,transparent);padding:10px;display:flex;flex-direction:column;gap:6px;
  transition:background .2s cubic-bezier(.32,.72,0,1),box-shadow .2s}
.awb .mhead{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:4px}.awb .mhead span{font-size:11.5px;color:var(--muted);font-weight:600;text-align:center}
.awb .month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.awb .mc{appearance:none;font:inherit;color:inherit;text-align:left;border-radius:14px;background:var(--panel);border:.5px solid var(--hair);padding:6px 7px;min-height:96px;
  display:flex;flex-direction:column;gap:3px;cursor:pointer;min-width:0;transition:background .16s,transform .12s,box-shadow .16s}
.awb .mc:hover{background:color-mix(in srgb,currentColor 7%,transparent);box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 12%,transparent)}
.awb .mc:active{transform:scale(.99)}
.awb .mc.out{opacity:.4}.awb .mc.past .mchip{opacity:.75}
.awb .mc .dn{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.awb .mc.today .dn{color:#fff;background:var(--acc);border-radius:999px;padding:0 7px;box-shadow:0 1px 5px color-mix(in srgb,var(--acc) 45%,transparent)}
.awb .mchip{font-size:11px;line-height:1.3;padding:1px 6px;border-radius:6px;background:color-mix(in srgb,var(--acc) 12%,transparent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.awb .mchip.growth{background:color-mix(in srgb,var(--growth) 14%,transparent)}.awb .mchip.life{background:color-mix(in srgb,var(--life) 16%,transparent)}
.awb .mchip.done{background:var(--fill);color:var(--muted);text-decoration:line-through}.awb .mchip.late{color:var(--bad)}
.awb .mc .more{font-size:11px;color:var(--muted)}.awb .mdone{font-size:11px;color:var(--ok);font-weight:600}
.awb .dueDot{width:7px;height:7px;border-radius:50%;background:var(--bad)}
/* 弹出卡片：最厚玻璃 + 背景模糊遮罩 */
.awb .modal{position:fixed;inset:0;z-index:20;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.26);
  -webkit-backdrop-filter:blur(8px) saturate(130%);backdrop-filter:blur(8px) saturate(130%);animation:awbfade .22s}
.awb .mcard2{width:min(520px,100%);max-height:90vh;overflow:auto;border-radius:24px;padding:18px 20px;
  background:var(--glass-sheen),var(--glass-strong);-webkit-backdrop-filter:saturate(190%) blur(32px);backdrop-filter:saturate(190%) blur(32px);
  box-shadow:var(--glass-edge),var(--glass-shadow-lg);animation:awbpop .32s cubic-bezier(.2,.9,.3,1.15)}
.awb .mcard2 .ttl{flex:1;border:0;background:none;font-size:19px;font-weight:600;letter-spacing:-.01em;resize:none;outline:none;padding:2px 4px;border-radius:8px;line-height:1.35;transition:background .16s}
.awb .mcard2 .ttl:focus{background:var(--fill)}
.awb .mcard2 .form{display:grid;grid-template-columns:72px 1fr;gap:12px 10px;align-items:center;margin-top:16px}
.awb .mcard2 input[type=date]{padding:4px 8px}
@keyframes awbfade{from{opacity:0}to{opacity:1}}
/* 不支持背景模糊时的退路：改用不透明底色，保证文字清楚 */
@supports not ((backdrop-filter:blur(2px)) or (-webkit-backdrop-filter:blur(2px))){
  .awb .topbar,.awb .dock .inner,.awb .mcard2,.awb .toast>span,.awb .hero,.awb .confirm{background:var(--surface)}
  .awb .modal{background:rgba(0,0,0,.42)}
}
@container (max-width:700px){.awb .week{grid-template-columns:minmax(0,1fr)}.awb .day{min-height:0}.awb .mc{min-height:64px}.awb .mchip{display:none}}
@container (max-width:760px){.awb .srcrow{grid-template-columns:24px 1fr 1fr}}
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
          h('div', { style: { fontSize: 15, fontWeight: 600 } }, d.title),
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
