// 汇报导出：deck({title, subtitle, slides:[{title, bullets, note}]}) → Markdown / 单文件 HTML 幻灯片。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export function normalizeDeck(deck) {
  const slides = (Array.isArray(deck?.slides) ? deck.slides : []).map((s) => ({
    title: String(s?.title ?? '').slice(0, 120),
    bullets: (Array.isArray(s?.bullets) ? s.bullets : []).map((b) => String(b).slice(0, 300)).filter(Boolean).slice(0, 8),
    note: s?.note ? String(s.note).slice(0, 1000) : '',
  })).filter((s) => s.title || s.bullets.length)
  return { title: String(deck?.title || '工作汇报').slice(0, 120), subtitle: String(deck?.subtitle ?? '').slice(0, 200), slides }
}

export function toMarkdown(deck, { tasks = [] } = {}) {
  const d = normalizeDeck(deck)
  const lines = [`# ${d.title}`, '']
  if (d.subtitle) lines.push(`> ${d.subtitle}`, '')
  for (const s of d.slides) {
    lines.push(`## ${s.title}`, '')
    for (const b of s.bullets) lines.push(`- ${b}`)
    if (s.note) lines.push('', `<!-- 备注：${s.note.replace(/-->/g, '—>')} -->`)
    lines.push('')
  }
  if (tasks.length) {
    lines.push('## 附：任务明细', '', '| 任务 | 类型 | 状态 | 步骤进度 | 专注用时 |', '| --- | --- | --- | --- | --- |')
    for (const t of tasks) {
      const steps = t.steps ?? []
      lines.push(`| ${String(t.title).replace(/\|/g, '\\|')} | ${t.track} | ${t.status === 'done' ? '✅ 完成' : '⏳ 进行中'} | ${steps.filter((s) => s.done).length}/${steps.length} | ${Math.round(t.actualMin ?? 0)} 分钟 |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function toHtmlDeck(deck) {
  const d = normalizeDeck(deck)
  const cover = `<section class="slide cover"><h1>${esc(d.title)}</h1>${d.subtitle ? `<p class="sub">${esc(d.subtitle)}</p>` : ''}<p class="hint">← → 或空格翻页 · F 全屏 · N 备注</p></section>`
  const body = d.slides.map((s, i) => `<section class="slide"><div class="num">${String(i + 1).padStart(2, '0')}</div><h2>${esc(s.title)}</h2><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>${s.note ? `<aside class="note">${esc(s.note)}</aside>` : ''}</section>`).join('\n')
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(d.title)}</title>
<style>
*{box-sizing:border-box;margin:0}html,body{height:100%;background:#0f1222;color:#eef0ff;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;overflow:hidden}
.slide{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:8vh 10vw;opacity:0;transform:translateX(4vw);transition:opacity .35s,transform .35s;pointer-events:none}
.slide.on{opacity:1;transform:none;pointer-events:auto}
.cover{background:radial-gradient(circle at 20% 20%,#3b3f8f 0,transparent 55%),radial-gradient(circle at 85% 80%,#7a2f6b 0,transparent 50%)}
h1{font-size:clamp(32px,6vw,72px);letter-spacing:-1px}h2{font-size:clamp(26px,4vw,48px);margin-bottom:5vh;color:#a9b4ff}
.sub{margin-top:3vh;font-size:clamp(16px,2vw,24px);opacity:.8}.hint{position:absolute;bottom:5vh;opacity:.4;font-size:14px}
.num{font-size:14px;letter-spacing:4px;opacity:.45;margin-bottom:2vh}
ul{list-style:none;display:grid;gap:2.4vh}li{font-size:clamp(18px,2.4vw,30px);line-height:1.45;padding-left:1.4em;position:relative}
li:before{content:"";position:absolute;left:0;top:.55em;width:.5em;height:.5em;border-radius:50%;background:linear-gradient(135deg,#7f8cff,#ff7ac6)}
.note{display:none;position:absolute;bottom:4vh;left:10vw;right:10vw;padding:14px 18px;border-radius:12px;background:#ffffff14;font-size:15px;line-height:1.6}
body.notes .note{display:block}
.bar{position:fixed;left:0;bottom:0;height:4px;background:linear-gradient(90deg,#7f8cff,#ff7ac6);transition:width .35s}
.pager{position:fixed;right:24px;bottom:16px;font-size:13px;opacity:.5}
@media print{html,body{overflow:visible;height:auto}.slide{position:relative;opacity:1;transform:none;height:100vh;page-break-after:always}.bar,.pager,.hint{display:none}}
</style></head><body>
${cover}
${body}
<div class="bar"></div><div class="pager"></div>
<script>
const s=[...document.querySelectorAll('.slide')];let i=Math.min(s.length-1,Math.max(0,parseInt(location.hash.slice(1))||0));
const show=()=>{s.forEach((x,k)=>x.classList.toggle('on',k===i));document.querySelector('.bar').style.width=((i+1)/s.length*100)+'%';document.querySelector('.pager').textContent=(i+1)+' / '+s.length;history.replaceState(null,'','#'+i)};
addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(e.key)){i=Math.min(s.length-1,i+1);show();e.preventDefault()}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(e.key)){i=Math.max(0,i-1);show();e.preventDefault()}else if(e.key==='Home'){i=0;show()}else if(e.key==='End'){i=s.length-1;show()}else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}else if(e.key==='n'||e.key==='N'){document.body.classList.toggle('notes')}});
addEventListener('click',e=>{i=e.clientX>innerWidth/3?Math.min(s.length-1,i+1):Math.max(0,i-1);show()});
show();
</script></body></html>`
}

export function writeReport(dir, deck, opts) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const base = join(dir, 'reports')
  mkdirSync(base, { recursive: true })
  const md = toMarkdown(deck, opts), html = toHtmlDeck(deck)
  const mdPath = join(base, `report-${stamp}.md`), htmlPath = join(base, `report-${stamp}.html`)
  writeFileSync(mdPath, md)
  writeFileSync(htmlPath, html)
  return { mdPath, htmlPath, markdown: md, html, deck: normalizeDeck(deck) }
}
