# dsh-adhd-workbench

DeepSeek Harness（DSH）插件：一个 ADHD 友好的个人任务工作台。它会在每个会话里加一个「🎯 工作台」标签页，帮你每天选出三件必做的事，把大任务拆成小步，并记录你的执行习惯。

## 功能

| 页面 | 做什么 |
| --- | --- |
| 🎯 今日 | 顶部只显示「现在只做这一步」，带专注计时和「被打断了」按钮。按重要、紧急、截止日期选出三大必做，工作日至少含 1 个成长任务；20 分钟内能做完的放进小任务；自动排出今日时间块。不想做某个必做时点「🔀 换一个」。 |
| 💡 灵感库 | 随手记下想法，AI 归到「个人 / 工作 / 生活」大类，并按内容起小类名。支持搜索、星标、一键转任务。 |
| 🗂 工作区 | 只读展示 DSH 和 Codex 的工作区。每个工作区只列最近 2 个会话，用圆环显示上下文用了多少（中间是百分比）。 |
| 🧭 教练 | 判断你说的话够不够具体（对象、动作、交付物、完成标准、时间），缺什么就追问。说得太模糊时，会让你拿纸笔花 3 分钟画「现状 → 卡点 → 想要的结果」。 |
| 📈 成长 | 统计速度系数（实际用时 ÷ 预估）、专注时段、专注块长度、打断次数和连续天数。之后的预估自动乘上速度系数。必做完成率 ≥80% 时每周任务量 +10%，低于 50% 时 −10%。 |
| 📤 汇报 | 每个任务可以记汇报要点（做了什么 / 方案 / 结果 / 问题）。一键导出 Markdown 和单文件 HTML 幻灯片，方向键翻页，F 全屏，N 显示备注。 |

AI 功能使用 DSH 当前配置的模型（宿主进程内的 `llm` 服务），不需要另外配置密钥。模型不可用时，拆分、分类、教练和汇报都会退回规则模板，页面右上角显示「⚙️ 规则模式」。

## 安装

需要 DeepSeek Harness Desktop，以及 Node.js ≥ 22.15（读取 Codex 的 `.jsonl.zst` 文件要用到 `zlib.zstdDecompressSync`）。

```bash
git clone https://github.com/VitoBeijing/dsh-adhd-workbench.git
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add "$(pwd)/dsh-adhd-workbench"
```

装完后，重启 DSH，或在插件市场里把它关掉再打开，然后刷新页面。

## 数据

- 你的任务、灵感、计时和教练记录都存在本机 `~/.dsh/adhd-workbench/data.json`，写入是原子操作（先写临时文件再改名）。
- 汇报文件保存在 `~/.dsh/adhd-workbench/reports/`。
- DSH 数据（`~/.dsh/storages/`）和 Codex 数据（`~/.codex/state_5.sqlite` 及 rollout 文件）**只读**，插件不会改动。

## HTTP API

宿主通过 DSH 的 `webServer` 注册 `/adhd-workbench/api/*`。写操作要求 `content-type: application/json`，并且 `Origin` 必须和 `Host` 一致。主要接口：

- `GET /plan`：今日计划（必做、小任务、时间块、当前一步、统计）
- `POST /tasks`，`PATCH /tasks/:id`，`POST /tasks/:id/split`，`POST /tasks/:id/focus`，`POST /tasks/:id/notes`
- `POST /ideas`，`POST /coach`，`GET /workspaces`，`GET /stats`，`POST /report`

## 开发

```bash
npm test   # node --test，覆盖计划、学习统计、API 全流程、规则兜底、同源校验
```

目录结构：

```
lib/
  index.js       插件入口（Cordis apply）：解析模型、注册 HTTP 路由
  api.js         路由与输入校验
  planner.js     优先级、三大必做、时间块、学习统计、容量调整
  workspaces.js  只读 DSH / Codex 工作区
  ai.js          模型调用（拆分 / 分类 / 教练 / 汇报）及规则兜底
  report.js      Markdown 与 HTML 幻灯片导出
  store.js       本地 JSON 存储
client/index.js  前端（纯 JS，使用宿主提供的 React）
```

## 许可

MIT
