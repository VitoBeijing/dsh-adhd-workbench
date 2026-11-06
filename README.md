# dsh-adhd-workbench

DeepSeek Harness（DSH）插件：一个 ADHD 友好的个人任务工作台。它会在 DSH 左侧栏加一个独立的「个人工作台」入口，点开后占据主区域，帮你每天选出三件必做的事，把大任务拆成小步，并记录你的执行习惯。

## 功能

| 页面 | 做什么 |
| --- | --- |
| 🎯 今日 | 大标题 +「现在只做这一步」主卡片；三件必做、顺手做的小任务用分组列表，点开才显示步骤和操作；右侧窄栏是合并后的时间线（同一任务的连续专注块合成一行）。所有输入都在底部悬浮栏：说一句话加任务（缺的重要性 / 紧急度 / 截止日期逐项追问，确认后入库）、给任务加一步、记汇报要点。 |
| 📅 日历 | 周视图（默认）和月视图。任务按「计划日期」放在那一天，没有计划日期就放在截止那天；截止日另外标红。拖动任务改计划日期，拖到「未安排」取消；点某天的 ＋ 在底部输入栏说一句话，任务就安排在那天；点任务打开详情卡片完成、改标题、改日期和重要/紧急、删除。过去的日子显示完成了什么、专注了多久。计划在今天和拖欠的任务优先进今日必做，安排在以后的今天不排。 |
| 💡 灵感库 | 一次写好几件事也行：AI 按主题拆成多条，每条整理成一句话并单独分到个人 / 工作 / 生活和按内容命名的小类。先出预览，可以改文字、改分类、删掉或合并，确认后才入库；原话折叠保存，随时可查。旧的大段灵感可以点「✂️ AI 重新拆分」。每条都能一键转任务。 |
| 🗂 工作区 | 按 Agent 从上到下纵向展示工作区，支持 DeepSeek Harness、Codex、Claude Code、OpenCode、WorkBuddy。每个工作区只列最近 2 个会话，用圆环显示上下文用了多少（中间是百分比）。 |
| ⚙️ 设置 | 配置要展示的 Agent：启用/停用、改名称、改数据目录、调顺序、设置工作区数和上下文窗口；同一种 Agent 可以加多个。首次使用会自动检测本机已安装的 Agent。 |
| 🧭 教练 | 判断你说的话够不够具体（对象、动作、交付物、完成标准、时间），缺什么就追问。说得太模糊时，会让你拿纸笔花 3 分钟画「现状 → 卡点 → 想要的结果」。 |
| 📈 成长 | 统计速度系数（实际用时 ÷ 预估）、专注时段、专注块长度、打断次数和连续天数。之后的预估自动乘上速度系数。必做完成率 ≥80% 时每周任务量 +10%，低于 50% 时 −10%。 |
| 📤 汇报 | 每个任务可以记汇报要点（做了什么 / 方案 / 结果 / 问题）。一键导出 Markdown 和单文件 HTML 幻灯片，方向键翻页，F 全屏，N 显示备注。 |

AI 功能使用 DSH 当前配置的模型（宿主进程内的 `llm` 服务），不需要另外配置密钥。模型不可用时，拆分、分类、教练和汇报都会退回规则模板，页面右上角显示「⚙️ 规则模式」。

## 设计规范

界面遵循 [Apple DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md)（来自 [awesome-design-md](https://github.com/voltagent/awesome-design-md)），要点：

- **只有一套强调色**：Action Blue `#0066cc` 用于所有可点的填充（按钮、选中态）；深色主题下文字链接才换成 Sky Link Blue `#2997ff`（白字填按钮在深色下对比度不够，所以按钮始终用 `#0066cc`）。键盘焦点用 `#0071e3`。
- **SF Pro 字阶**：标题 ≥19px 用 SF Pro Display、字重 600、负字距；正文 17px / 行高 1.47 / `-0.374px`；说明 14px；细字 12px。字重只用 300 / 400 / 600 / 700，**没有 500**。
- **圆角只有五档**：5 / 8 / 11 / 18 / 9999，按「小控件用 8、实用卡片用 18、动作和胶囊用 pill」分工，不混用中间值。
- **克制的层次**：卡片靠底色变化和 1px 发丝线分层，按钮、标签、卡片都不加阴影；只有弹窗浮在页面上方时用一处柔和投影。
- **不用装饰性渐变**：氛围来自材质而不是渐变。
- **交互**：所有按钮按下统一 `transform: scale(.95)`；浮层（顶部栏、底部输入栏、弹窗、提示气泡）用 Parchment 80% + `backdrop-filter` 毛玻璃；尊重系统的「减少动效」设置。
- **主题**：颜色用 `light-dark()`，跟随宿主 `color-scheme` 自动切换深浅；不支持背景模糊的浏览器退化为不透明底色。

改样式后可跑 `npm test`，其中 `test/client.test.js` 会检查上面这些规则（强调色、字阶、圆角、按下缩放、无阴影、无装饰渐变），避免后续改动悄悄跑偏。

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
- 各 Agent 的数据（DSH `~/.dsh/storages/`、Codex `~/.codex/`、Claude Code `~/.claude/projects/`、OpenCode `~/.local/share/opencode/opencode.db`、WorkBuddy `~/.workbuddy/workbuddy.db`）**只读**，插件不会改动。

## HTTP API

宿主通过 DSH 的 `webServer` 注册 `/adhd-workbench/api/*`。写操作要求 `content-type: application/json`，并且 `Origin` 必须和 `Host` 一致。主要接口：

- `GET /plan`：今日计划（必做、小任务、时间块、当前一步、统计）
- `GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`：日历数据（最多 62 天），每天的计划任务、截止项、完成项、专注分钟数，以及未安排的任务；任务的 `planDate` 用 `POST /tasks`、`PATCH /tasks/:id` 读写
- `POST /tasks`，`PATCH /tasks/:id`，`POST /tasks/:id/split`，`POST /tasks/:id/focus`，`POST /tasks/:id/notes`
- `POST /intake/parse`，`POST /intake/answer`：对话式录入
- `GET|PUT /sources`，`POST /sources/reset`：Agent 来源设置
- `POST /ideas/split`（拆分预览，不保存），`POST /ideas/batch`（批量入库，`replaceId` 替换旧条目）
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
  agents.js      Agent 来源配置，Claude Code / OpenCode / WorkBuddy 读取
  workspaces.js  只读 DSH / Codex 工作区
  intake.js      对话式录入：中文日期、重要、紧急、时长识别
  ai.js          模型调用（拆分 / 分类 / 教练 / 汇报）及规则兜底
  report.js      Markdown 与 HTML 幻灯片导出
  store.js       本地 JSON 存储
client/index.js  前端（纯 JS，使用宿主提供的 React）
```

## 许可

MIT
