// 前端外观契约（Hallmark · Hum 主题重设计后）：
// 名字显示；Hum token 体系（Chillax 全篇、pear-yellow 主信号、纸板按压控件、撕边纸张）；
// 浮层用纸张质感（不模糊）；无 emoji 图标（Floor 30a）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const src = readFileSync(new URL('../client/index.js', import.meta.url), 'utf8')

// 在沙箱里加载前端，拿到 apply 注册到 slots 里的东西
function mount() {
  const registered = []
  const slots = {
    inject: (name, fn) => fn(),
    register: (meta, component) => { registered.push({ meta, component }); return () => {} },
  }
  const ctx = { inject: (deps, cb) => cb({ slots }), get: () => ({ list: () => [] }) }
  const stubReact = () => ({
    createElement: () => null, useState: () => [], useEffect: () => {}, useRef: () => ({}),
    useCallback: (f) => f, Fragment: 'f',
  })
  const sandbox = {}
  sandbox.window = {
    __ModuleLoader__: {
      load: ({ factory }) => { sandbox.__mod = factory(() => stubReact()) },
    },
  }
  sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  sandbox.fetch = async () => ({ ok: true, json: async () => ({}) })
  sandbox.EventTarget = EventTarget
  sandbox.CustomEvent = CustomEvent
  sandbox.document = { title: '' }
  sandbox.console = console
  sandbox.setTimeout = setTimeout
  sandbox.clearTimeout = clearTimeout
  sandbox.setInterval = setInterval
  sandbox.clearInterval = clearInterval
  vm.runInNewContext(src, vm.createContext(sandbox))
  sandbox.__mod.apply(ctx)
  return registered
}

test('左侧栏入口显示「个人工作台」', () => {
  const rows = mount()
  const row = rows.find((r) => r.meta.name === 'sidebar.panellist')
  assert.ok(row, '注册了左侧栏入口')
  assert.equal(row.meta.label(), '个人工作台')
  assert.equal(row.meta.id, 'adhd-workbench', '插件标识不变，已装插件和数据不受影响')
})

test('界面上不再出现「ADHD 工作台」字样', () => {
  assert.ok(!src.includes('ADHD 工作台'), 'client/index.js 里还有旧名字')
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('`\n', src.indexOf('.awb *{animation')))
  assert.ok(!/工作台/.test(css))
})

test('Hum 规范：Chillax 全篇、pear-yellow 主信号、纸板按压控件', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  // 主信号色是梨黄（hue ~95 的 oklch）
  assert.match(css, /--color-accent:oklch\(87% \.175 96\)/, '主信号色必须是 Hum pear-yellow')
  assert.match(css, /--color-accent-deep:/, '主按钮要有压下的深一档')
  assert.match(css, /--color-accent-ink:/, '黄底上的文字色 token 必须存在（Gate 41）')
  // 三 accents 不混：blue 链接、coral 警示、mint 成长
  assert.match(css, /--color-blue:oklch\(50% \.17 250\)/, '链接用 blue accent')
  assert.match(css, /--color-coral:/, '珊瑚色做 loud moment')
  assert.match(css, /--color-mint:/, '薄荷绿做成长')
  // Chillax 全篇（display = body）
  assert.match(css, /--font-display:"Chillax"/, '标题正文都用 Chillax')
  assert.match(css, /--font-body:var\(--font-display\)/, 'body 复用 display 字族')
  assert.match(css, /@import url\("https:\/\/api\.fontshare\.com\/v2\/css\?f\[\]=chillax/, '要引入 Chillax')
  // 标题只用 600（display-weight），正文 500/600
  assert.doesNotMatch(css, /h1\{[^}]*font-weight:(?!600)/, '标题用 600')
  // 圆角四档：8 / 14 / 16 / 24 / pill
  assert.match(css, /--r-xs:8px;--r-sm:14px;--r-lg:16px;--r-xl:24px;--r-pill:999px/, '圆角是 Hum 的 8/14/16/24/pill')
  // 纸板按压控件：按下下沉 3px，hover 上抬 2px
  assert.match(css, /\.awb \.btn:active:not\(:disabled\)\{[^}]*translate:0 3px/, '按钮按下应为下沉 3px')
  assert.match(css, /\.awb \.btn:hover:not\(:disabled\)\{[^}]*translate:0 -2px/, '按钮 hover 应上抬')
  // spring 只给主按钮（waive 12）
  assert.match(css, /Hallmark · waive 12/, 'spring 动效要有 waiver 记录')
  // 色块纯色纸面（不用纹理，避免黑影颗粒）
  assert.doesNotMatch(css, /--grain:|--fibre:/, '不再用纹理 data URI')
  // 不再用旧 Apple 蓝
  assert.ok(!/--acc:#0066cc/.test(css), '不能再保留 Action Blue')
})

test('Hallmark Floor：无 emoji 图标、无 token 外颜色、无 width 过渡', () => {
  // Floor 30a：TRACK/IDEA_CAT 的图标位和按钮上的 emoji 都要去掉
  assert.ok(!/'💼'|'🌱'|'🏠'|'🧠'|'🌿'/.test(src), 'TRACK/IDEA_CAT 不能再带 emoji 图标')
  // （排除 CSS stamp 的 dropped 记录行——它如实记录了被移除的图标）
  const uiSrc = src.split('\n').filter((l) => !l.includes('Hallmark · dropped')).join('\n')
  for (const e of ['▶  开始专注', '✂️', '📤 生成', '⬇ ', '👋 ', '🎯 ', '✍️ ', '📁 ', '⚙️ 配置']) {
    assert.ok(!uiSrc.includes(e), `还残留 emoji：${e}`)
  }
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  // Floor 48：颜色/字体字面量只允许出现在 :root token 块和 @import
  const tokenEnd = css.indexOf('}', css.indexOf(':root{'))
  const body = css.slice(tokenEnd)
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/, 'token 块外不能有 hex 颜色字面量')
  assert.doesNotMatch(body, /font-family:(?!var\()/, 'token 块外 font-family 必须走 var()')
  // Floor 10a：进度条不直接过渡 width，用 transform
  assert.match(css, /\.awb \.prog>i\{[^}]*transition:transform/, '进度条用 transform 过渡')
  assert.doesNotMatch(css, /transition:[^;}]*\bwidth\b/, '不允许 width 过渡')
  // Floor 39a：disabled 不能只靠 opacity（还要 not-allowed 光标）
  assert.match(css, /\.awb \.btn:disabled\{opacity:\.45;cursor:not-allowed/, 'disabled 要 opacity + not-allowed')
  // Floor 26a：focus-visible 必须存在且瞬时
  assert.match(css, /:focus-visible\{outline:2px solid var\(--color-focus\)/, 'focus 环必须存在')
})

test('Hum 纸张：浮层用纯色纸面而非玻璃模糊', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  const rule = (sel) => {
    const i = css.indexOf(sel + '{')
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
  }
  // Hum 不用玻璃模糊：浮层用纸张纹理 + 阴影
  assert.doesNotMatch(rule('.awb .modal'), /backdrop-filter/, 'modal 不用玻璃模糊')
  // 顶部栏、底部输入栏、提示气泡、卡片：纯色纸面
  for (const sel of ['.awb .topbar', '.awb .dock .inner', '.awb .toast>span', '.awb .card']) {
    assert.doesNotMatch(rule(sel), /--grain|--fibre|backdrop-filter/, `${sel} 应是纯色纸面`)
  }
  // modal 有纸张阴影
  assert.match(rule('.awb .mcard2'), /filter:var\(--shadow-paper\)/, '弹窗应有纸张投影')
})

test('Hum 交互：按压下沉、选中页签为 accent-soft、尊重减少动效偏好', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  assert.match(css, /\.awb \.btn:active:not\(:disabled\)\{[^}]*translate:0 3px/, '按钮按下应为下沉 3px')
  assert.match(css, /\.awb \.tab\.on\{[^}]*background:var\(--color-accent-soft\)/, '选中的标签页用 accent-soft')
  assert.match(src, /@media \(prefers-reduced-motion:reduce\)/, '应尊重系统减少动效偏好')
  // 拖放目标用 Hum accent
  assert.match(css, /\.awb \.day\.over,\.awb \.unsch\.over\{[^}]*var\(--color-accent\)/, '拖动目标应有高亮')
  // 日历块用 accent-soft（不再是塑料分格）
  assert.match(css, /\.awb .ct\{[^}]*--color-accent-soft/, '日历块用 accent-soft')
})

test('工作区项目卡片：纯色纸面 + 圆角', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  const m = css.match(/\.awb \.ws\{([^}]*)\}/)
  assert.ok(m, '找不到 .ws 规则')
  assert.doesNotMatch(m[1], /(^|;)\s*border\s*:/, '项目卡片不应再有外边框')
  assert.doesNotMatch(m[1], /--grain|--fibre/, '工作区卡片应纯色无纹理')
  assert.match(m[1], /border-radius:var\(--r-lg\)/, '圆角保留')
})

test('上下文圆环：不用裸 ring 类名，且显式关掉 box-shadow', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  // 宿主的 dsh-context 打包了 Tailwind，全局有 .ring{box-shadow:...}；用裸 ring 会被套一圈阴影
  assert.match(src, /className: 'awb-ring'/, '圆环类名要带前缀，避开宿主 Tailwind 的 .ring')
  assert.doesNotMatch(src, /className: 'ring'/, '不能再用裸 ring 类名')
  assert.match(css, /\.awb \.awb-ring\{box-shadow:none/, '圆环要显式关掉阴影兜底')
  assert.match(css, /\.awb \.awb-ring text\{font-weight:500\}/, '百分比文字样式要跟着改名')
})
