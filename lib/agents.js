// 多 Agent 来源：在设置里配置的来源列表，按顺序纵向展示。全部只读。
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join, basename, isAbsolute } from 'node:path'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { readDshWorkspaces, readCodexWorkspaces } from './workspaces.js'

const require = createRequire(import.meta.url)
const HOME = homedir()
const pct = (used, win) => (win > 0 && used >= 0 ? Math.min(100, Math.round((used / win) * 1000) / 10) : null)

export const AGENT_TYPES = {
  dsh: { label: 'DeepSeek Harness', defaultPath: join(HOME, '.dsh') },
  codex: { label: 'Codex', defaultPath: join(HOME, '.codex') },
  claude: { label: 'Claude Code', defaultPath: join(HOME, '.claude') },
  opencode: { label: 'OpenCode', defaultPath: join(HOME, '.local', 'share', 'opencode') },
  workbuddy: { label: 'WorkBuddy', defaultPath: join(HOME, '.workbuddy') },
}

export const expandHome = (p) => (typeof p === 'string' && p.startsWith('~') ? join(HOME, p.slice(1)) : p)

/** 首次使用：按本机实际存在的目录生成默认来源。 */
export function defaultSources() {
  return Object.entries(AGENT_TYPES).map(([type, t]) => ({
    id: type, type, label: t.label, path: t.defaultPath, enabled: existsSync(t.defaultPath), maxWorkspaces: 6,
  }))
}

/** 校验用户提交的来源列表。 */
export function sanitizeSources(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('sources 必须是数组'), { status: 400 })
  const seen = new Set()
  return list.slice(0, 20).map((s, i) => {
    const type = AGENT_TYPES[s?.type] ? s.type : null
    if (!type) throw Object.assign(new Error(`第 ${i + 1} 个来源的类型无效`), { status: 400 })
    const path = expandHome(String(s.path ?? '').trim()) || AGENT_TYPES[type].defaultPath
    if (!isAbsolute(path)) throw Object.assign(new Error(`「${s.label || type}」的目录必须是绝对路径或以 ~ 开头`), { status: 400 })
    let id = String(s.id || `${type}-${i}`).replace(/[^\w-]/g, '').slice(0, 40) || `${type}-${i}`
    while (seen.has(id)) id = `${id}-${i}`
    seen.add(id)
    const win = Number(s.contextWindow)
    return {
      id, type, path, enabled: s.enabled !== false,
      label: String(s.label || AGENT_TYPES[type].label).slice(0, 40),
      maxWorkspaces: Math.min(20, Math.max(1, Math.round(Number(s.maxWorkspaces) || 6))),
      ...(win >= 1000 ? { contextWindow: Math.round(win) } : {}),
    }
  })
}

// ———————— 通用工具 ————————
function openDb(file) {
  const { DatabaseSync } = require('node:sqlite')
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    try { db.prepare('select 1').get(); return db } catch { db.close() }
  } catch { /* 退回 immutable */ }
  return new DatabaseSync(new URL(`file://${file}?mode=ro&immutable=1`), { readOnly: true })
}

function readSlice(file, start, len) {
  const buf = Buffer.alloc(len), fd = openSync(file, 'r')
  try { const n = readSync(fd, buf, 0, len, start); return buf.subarray(0, n).toString('utf8') } finally { closeSync(fd) }
}

const parseLines = (text) => text.split('\n').map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

function groupTop(items, keyOf, perWorkspace, maxWorkspaces) {
  const groups = new Map()
  for (const it of items) {
    const k = keyOf(it)
    if (!groups.has(k)) groups.set(k, { key: k, total: 0, items: [] })
    const g = groups.get(k); g.total++; if (g.items.length < perWorkspace) g.items.push(it)
  }
  return [...groups.values()].slice(0, maxWorkspaces)
}

// ———————— Claude Code：~/.claude/projects/<编码后的路径>/<session>.jsonl ————————
const claudeCache = new Map()
function parseClaudeSession(file, mtimeMs, size) {
  const hit = claudeCache.get(file)
  if (hit && hit.mtimeMs === mtimeMs) return hit.info
  const head = parseLines(readSlice(file, 0, Math.min(size, 128 * 1024)))
  const tailStart = Math.max(0, size - 512 * 1024)
  const tail = parseLines(readSlice(file, tailStart, size - tailStart))
  const all = [...head, ...tail]
  const cwd = all.find((d) => d.cwd)?.cwd ?? null
  const titleLine = [...tail].reverse().find((d) => d.type === 'ai-title' && d.aiTitle) ?? head.find((d) => d.type === 'ai-title' && d.aiTitle)
  const firstUser = head.find((d) => d.type === 'user' && typeof d.message?.content === 'string' && !d.message.content.startsWith('<'))
  const lastAsst = [...tail].reverse().find((d) => d.type === 'assistant' && d.message?.usage)
  const u = lastAsst?.message?.usage
  const used = u ? (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) : null
  const info = {
    cwd, title: titleLine?.aiTitle ?? firstUser?.message?.content?.slice(0, 60) ?? null,
    model: lastAsst?.message?.model ?? null, used, branch: [...tail].reverse().find((d) => d.gitBranch)?.gitBranch ?? null,
  }
  claudeCache.set(file, { mtimeMs, info })
  return info
}

export function readClaude({ path, perWorkspace = 2, maxWorkspaces = 6, contextWindow, now = Date.now() }) {
  const dir = join(path, 'projects')
  if (!existsSync(dir)) return { ok: false, error: `未找到 ${dir}`, workspaces: [] }
  const files = []
  for (const proj of readdirSync(dir)) {
    const pdir = join(dir, proj)
    let names = []
    try { names = readdirSync(pdir).filter((n) => n.endsWith('.jsonl')) } catch { continue }
    for (const n of names) { try { const st = statSync(join(pdir, n)); if (st.size > 0) files.push({ file: join(pdir, n), proj, mtimeMs: st.mtimeMs, size: st.size }) } catch { /* 跳过 */ } }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const groups = groupTop(files, (f) => f.proj, perWorkspace, maxWorkspaces)
  const workspaces = groups.map((g) => {
    const sessions = g.items.map((f) => {
      let info = {}
      try { info = parseClaudeSession(f.file, f.mtimeMs, f.size) } catch { info = {} }
      // 用量超过 20 万说明是 1M 上下文的模型
      const win = contextWindow ?? (info.used > 200000 || /\[1m\]/i.test(info.model ?? '') ? 1000000 : 200000)
      return {
        id: basename(f.file, '.jsonl'), title: info.title || '(未命名)', lastActiveAt: f.mtimeMs,
        status: now - f.mtimeMs < 2 * 60000 ? 'running' : 'idle', model: info.model, branch: info.branch,
        contextUsed: info.used, contextWindow: info.used == null ? null : win, contextPct: pct(info.used, win), cwd: info.cwd,
      }
    })
    const cwd = sessions.find((s) => s.cwd)?.cwd
    return { id: g.key, title: cwd ? basename(cwd) : g.key, path: cwd ?? g.key, total: g.total, updatedAt: g.items[0].mtimeMs, sessions }
  })
  return { ok: true, workspaces }
}

// ———————— OpenCode：opencode.db ————————
export function readOpenCode({ path, perWorkspace = 2, maxWorkspaces = 6, contextWindow = 200000, now = Date.now() }) {
  const file = join(path, 'opencode.db')
  if (!existsSync(file)) return { ok: false, error: `未找到 ${file}`, workspaces: [] }
  const db = openDb(file)
  try {
    const rows = db.prepare(`select id, directory, title, model, time_updated from session
      where parent_id is null and time_archived is null order by time_updated desc limit 300`).all()
    const lastMsg = db.prepare('select data from message where session_id = ? order by time_created desc limit 8')
    const groups = groupTop(rows, (r) => r.directory, perWorkspace, maxWorkspaces)
    return {
      ok: true,
      workspaces: groups.map((g) => ({
        id: g.key, title: basename(g.key || '') || g.key, path: g.key, total: g.total, updatedAt: g.items[0].time_updated,
        sessions: g.items.map((r) => {
          let used = null, model = null
          for (const m of lastMsg.all(r.id)) {
            try {
              const d = JSON.parse(m.data)
              if (d.role === 'assistant' && d.tokens) { used = (d.tokens.input ?? 0) + (d.tokens.cache?.read ?? 0) + (d.tokens.cache?.write ?? 0); model = d.modelID ?? null; break }
            } catch { /* 跳过 */ }
          }
          return {
            id: r.id, title: r.title || '(未命名)', lastActiveAt: r.time_updated, status: now - r.time_updated < 2 * 60000 ? 'running' : 'idle',
            model: model ?? (typeof r.model === 'string' ? r.model : null),
            contextUsed: used, contextWindow: used == null ? null : contextWindow, contextPct: pct(used, contextWindow),
          }
        }),
      })),
    }
  } finally { db.close() }
}

// ———————— WorkBuddy：workbuddy.db ————————
export function readWorkBuddy({ path, perWorkspace = 2, maxWorkspaces = 6, contextWindow, now = Date.now() }) {
  const file = join(path, 'workbuddy.db')
  if (!existsSync(file)) return { ok: false, error: `未找到 ${file}`, workspaces: [] }
  const db = openDb(file)
  try {
    const rows = db.prepare(`select s.id, s.cwd, coalesce(s.custom_title, s.title) title, s.status, s.model,
        coalesce(s.last_activity_at, s.updated_at) at, s.context_window, u.used, u.size
      from sessions s left join session_usage u on u.session_id = s.id
      where s.deleted_at is null and coalesce(s.is_background_automation, 0) = 0
      order by at desc limit 300`).all()
    const groups = groupTop(rows, (r) => r.cwd, perWorkspace, maxWorkspaces)
    return {
      ok: true,
      workspaces: groups.map((g) => ({
        id: g.key, title: basename(g.key || '') || g.key, path: g.key, total: g.total, updatedAt: g.items[0].at,
        sessions: g.items.map((r) => {
          const win = contextWindow ?? r.size ?? r.context_window ?? null
          return {
            id: r.id, title: r.title || '(未命名)', lastActiveAt: r.at,
            status: r.status === 'running' || now - r.at < 2 * 60000 ? 'running' : r.status === 'error' ? 'error' : 'idle',
            model: r.model, contextUsed: r.used ?? null, contextWindow: r.used == null ? null : win, contextPct: pct(r.used, win),
          }
        }),
      })),
    }
  } finally { db.close() }
}

/** 按来源配置读取全部工作区；每个来源独立出错，互不影响。 */
export function readSources(sources, { perWorkspace = 2, liveStatus } = {}) {
  return sources.filter((s) => s.enabled).map((s) => {
    const base = { id: s.id, type: s.type, label: s.label, path: s.path }
    const opts = { path: s.path, perWorkspace, maxWorkspaces: s.maxWorkspaces ?? 6, contextWindow: s.contextWindow }
    try {
      let r
      if (s.type === 'dsh') {
        r = readDshWorkspaces({ dshHome: s.path, perWorkspace, liveStatus: s.path === AGENT_TYPES.dsh.defaultPath ? liveStatus : undefined })
        if (r.ok) r.workspaces = r.workspaces.slice(0, opts.maxWorkspaces)
      } else if (s.type === 'codex') r = readCodexWorkspaces({ codexHome: s.path, perWorkspace, maxWorkspaces: opts.maxWorkspaces })
      else if (s.type === 'claude') r = readClaude(opts)
      else if (s.type === 'opencode') r = readOpenCode(opts)
      else if (s.type === 'workbuddy') r = readWorkBuddy(opts)
      return { ...base, ...r }
    } catch (e) {
      return { ...base, ok: false, error: e?.message ?? String(e), workspaces: [] }
    }
  })
}
