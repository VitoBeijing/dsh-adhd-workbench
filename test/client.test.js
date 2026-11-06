// 前端外观约定：名字显示、玻璃材质只用在浮层上（不模糊内容区）、并且有降级退路。
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

test('Apple 规范：单一强调蓝、字阶、圆角、动效', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  // 单一强调色：Action Blue（浅色）/ Sky Link Blue（深色），跟随宿主 color-scheme
  // 填充用 Action Blue（两种主题一致，白字才够对比度）；文字链接在深色才换 Sky Link Blue
  assert.match(css, /--acc:#0066cc;/, '按钮等填充色必须是 Action Blue #0066cc')
  assert.match(css, /--acc-link:light-dark\(#0066cc,#2997ff\)/, '文字链接在深色用 Sky Link Blue')
  assert.match(css, /--acc-focus:light-dark\(#0071e3,#4da3ff\)/, '键盘焦点蓝')
  // 不能出现第三个蓝色，也不能用深色的亮蓝去填按钮（白字对比度不够）
  const blues = new Set([...css.matchAll(/#(0066cc|2997ff|0071e3|4da3ff|0a84ff|5e5ce6)/gi)].map((m) => m[1].toLowerCase()))
  assert.deepEqual([...blues].sort(), ['0066cc', '0071e3', '2997ff', '4da3ff'], '蓝色只能来自 Apple 这四个 token')
  assert.doesNotMatch(css, /\.btn\.pri\{[^}]*var\(--acc-link\)/, '主按钮不能用深色亮蓝填充')
  // 字重阶梯 300/400/600/700，500 不出现
  assert.doesNotMatch(css, /font-weight:\s*500/, 'Apple 字重阶梯里没有 500')
  // 正文 17px、致密 1.47、负字距
  assert.match(css, /\.awb\{[^}]*font-size:17px/, '正文用 17px，不是 16px')
  assert.match(css, /\.awb\{[^}]*line-height:1\.47/, '正文行高 1.47')
  assert.match(css, /\.awb\{[^}]*letter-spacing:-\.374px/, '正文负字距')
  // 标题用 600 而非 700
  assert.doesNotMatch(css, /h1\{[^}]*font-weight:700/, '标题用 600，不用 700')
  // 圆角只用五档 token
  const radii = [...css.matchAll(/border-radius:([^;}]+)/g)].map((m) => m[1].trim())
  const allowed = /^(var\(--r-(xs|sm|md|lg|pill)\)( var\(--r-xs\)){0,2}( 0){0,2}|inherit)$/
  for (const r of radii) assert.match(r, allowed, `圆角 ${r} 不在 Apple 尺度里`)
  // 按下统一 scale(.95)
  assert.match(css, /\.awb \.btn:active:not\(:disabled\)\{transform:scale\(\.95\)\}/, '按下应为 scale(.95)')
  // 按钮/卡片不加阴影（只有弹窗可以有一处柔和投影）
  const shadowRules = [...css.matchAll(/\.awb \.(btn|chip|tab|group|kpi|ws|ct)[^{]*\{[^}]*box-shadow/g)]
  assert.deepEqual(shadowRules.map((m) => m[1]), [], '按钮和卡片不允许加阴影')
  // 不用装饰性渐变（玻璃高光渐变也去掉）
  assert.ok(!css.includes('--glass-sheen'), '不允许装饰性渐变高光')
})

test('Liquid Glass：浮层有背景模糊，内容区不模糊，并有降级退路', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  const rule = (sel) => {
    const i = css.indexOf(sel + '{')
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
  }
  // 浮在上面的层：顶部栏、底部输入栏、提示气泡、任务弹窗，必须有 backdrop-filter
  for (const sel of ['.awb .topbar', '.awb .dock .inner', '.awb .mcard2', '.awb .toast>span']) {
    assert.match(rule(sel), /backdrop-filter:(saturate|var\(--blur\))/, `${sel} 缺少背景模糊`)
  }
  // 内容区（分组长列表）不能模糊，否则文字会糊
  assert.doesNotMatch(rule('.awb .group'), /backdrop-filter/, '分组列表不该模糊')
  // 不支持背景模糊时要有不透明的退路
  assert.match(css, /@supports not \(\(backdrop-filter/, '缺少 backdrop-filter 降级')
  // 玻璃材质按规范：Parchment 80% 半透明，能透出背后内容
  assert.match(rule('.awb .dock .inner'), /--frosted/, '底部栏应使用玻璃材质变量')
  assert.match(css, /--frosted:color-mix\(in srgb,var\(--parchment\) 80%,transparent\)/, '浮层应为 Parchment 80% 半透明')
})

test('macOS 交互：按下缩放、选中项浮起、尊重减少动效偏好', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  assert.match(css, /\.awb \.btn:active:not\(:disabled\)\{transform:scale\(\.95\)\}/, '按钮按下应为 scale(.95)')
  assert.match(css, /\.awb \.tab\.on\{[^}]*background:var\(--canvas\)/, '选中的标签页应换成实心底面')
  assert.match(src, /@media \(prefers-reduced-motion:reduce\)/, '应尊重系统减少动效偏好')
  assert.match(css, /\.awb \.day\.over,\.awb \.unsch\.over\{[^}]*var\(--acc\)/, '拖动目标应有蓝色高亮')
})
