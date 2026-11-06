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

test('Liquid Glass：浮层有背景模糊，内容区不模糊，并有降级退路', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  const rule = (sel) => {
    const i = css.indexOf(sel + '{')
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1)
  }
  // 浮在上面的层：顶部栏、底部输入栏、提示气泡、任务弹窗，必须有 backdrop-filter
  for (const sel of ['.awb .topbar', '.awb .dock .inner', '.awb .mcard2', '.awb .toast>span']) {
    assert.match(rule(sel), /backdrop-filter:saturate|backdrop-filter:var\(--blur\)/, `${sel} 缺少背景模糊`)
  }
  // 内容区（分组长列表）不能模糊，否则文字会糊
  assert.doesNotMatch(rule('.awb .group'), /backdrop-filter/, '分组列表不该模糊')
  // 不支持背景模糊时要有不透明的退路
  assert.match(css, /@supports not \(\(backdrop-filter/, '缺少 backdrop-filter 降级')
  // 半透明玻璃要真的半透明，否则看不到背后的内容
  assert.match(rule('.awb .dock .inner'), /--glass-strong/, '底部栏应使用玻璃材质变量')
  assert.match(css, /--glass-strong:color-mix\(in srgb,var\(--surface\) 7\d%,transparent\)/, '玻璃底色应由宿主主题色派生，才能跟随亮/暗主题')
})

test('macOS 交互：按下缩放、选中项浮起、尊重减少动效偏好', () => {
  const css = src.slice(src.indexOf('const css = `'), src.indexOf('@media (prefers-reduced-motion'))
  assert.match(css, /\.awb \.btn:active:not\(:disabled\)\{transform:scale\(\.96\)\}/, '按钮按下应有轻微缩放')
  assert.match(css, /\.awb \.tab\.on\{[^}]*box-shadow/, '选中的标签页应浮起')
  assert.match(src, /@media \(prefers-reduced-motion:reduce\)/, '应尊重系统减少动效偏好')
  assert.match(css, /\.awb \.day\.over,\.awb \.unsch\.over\{[^}]*var\(--acc\)/, '拖动目标应有蓝色高亮')
})
