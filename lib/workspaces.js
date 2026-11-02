// 工作区看板：只读 DSH 与 Codex 的本地数据。绝不写入。
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return null } }
const pct = (used, win) => (win > 0 && used >= 0 ? Math.min(100, Math.round((used / win) * 1000) / 10) : null)

// ———————————————————— DSH ————————————————————
export function readDshWorkspaces({ dshHome = join(homedir(), '.dsh'), perWorkspace = 2, liveStatus } = {}) {
  const ws = readJson(join(dshHome, 'storages', 'workspace.json'))
  if (!ws?.tables?.workspaces) return { ok: false, error: '未找到 DSH workspace.json', workspaces: [] }
  const archived = new Set(ws.global?.archivedSessionIds ?? [])
  const out = []
  for (const id of ws.global?.workspaceIds ?? Object.keys(ws.tables.workspaces)) {
    const w = ws.tables.workspaces[id]
    if (!w) continue
    const sessions = []
    for (const sid of w.sessionIds ?? []) {
      if (archived.has(sid)) continue
      const rec = readJson(join(dshHome, 'storages', 'session_projcache', 'sessions', `${sid}.json`))?.record
      const rows = rec?.rows ?? {}
      const v = (k) => rows[k]?.val
      if (v('sessionListMetadata')?.blank) continue
      const cp = v('contextPressure') ?? {}
      const used = Math.max(cp.pressureTokens ?? 0, cp.surfaceTokens ?? 0)
      const todos = Array.isArray(v('todos')) ? v('todos') : []
      const tb = v('turnBoundary') ?? {}
      const outline = v('turnOutline')?.turns ?? []
      const live = liveStatus?.(sid)
      const running = live ? live === 'running' : tb.openTurnStartSeq != null
      sessions.push({
        id: sid,
        title: v('title') || outline[0]?.prompt || '(未命名会话)',
        lastActiveAt: v('sessionListMetadata')?.lastPromptAt ?? rec?.identity?.createdAt ?? 0,
        status: running ? 'running' : 'idle',
        model: v('modelSelection')?.lastUsed?.model ?? null,
        contextUsed: used, contextWindow: cp.contextWindow ?? null, contextPct: pct(used, cp.contextWindow),
        todos: { total: todos.length, done: todos.filter((t) => t.status === 'completed').length, current: todos.find((t) => t.status === 'in_progress')?.content ?? null },
        lastPrompt: outline.at(-1)?.prompt ?? null,
        turns: v('sessionStats')?.turns ?? outline.length,
      })
    }
    sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    out.push({ id, title: w.title || basename(w.path), path: w.path, total: sessions.length, updatedAt: Date.parse(w.updatedAt) || sessions[0]?.lastActiveAt || 0, sessions: sessions.slice(0, perWorkspace) })
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return { ok: true, workspaces: out }
}

// ———————————————————— Codex ————————————————————
function openCodexDb(file) {
  const { DatabaseSync } = require('node:sqlite')
  // 正常只读（能看到 WAL 里最新数据）；失败（如无法创建 -shm）退回 immutable 快照读
  try {
    const db = new DatabaseSync(file, { readOnly: true })
    try { db.prepare('select 1 from threads limit 1').get(); return db } catch { db.close() }
  } catch { /* fallthrough */ }
  return new DatabaseSync(new URL(`file://${file}?mode=ro&immutable=1`), { readOnly: true })
}

const tokenCache = new Map() // path -> { mtimeMs, info }

/** 读取 rollout 最后一条 token_count；文件大时只解压/扫描必要部分。 */
export function lastTokenCount(rolloutPath) {
  const candidates = [rolloutPath, `${rolloutPath}.zst`, rolloutPath.replace(/\.zst$/, '')]
  const file = candidates.find((p) => existsSync(p))
  if (!file) return null
  const { mtimeMs, size } = statSync(file)
  const hit = tokenCache.get(file)
  if (hit && hit.mtimeMs === mtimeMs) return hit.info
  let text
  if (file.endsWith('.zst')) text = zstdDecompressSync(readFileSync(file)).toString('utf8')
  else {
    // 明文 jsonl：只读末尾 2MB 足够找到最后一条 token_count
    const len = Math.min(size, 2 * 1024 * 1024), buf = Buffer.alloc(len), fd = openSync(file, 'r')
    try { readSync(fd, buf, 0, len, size - len) } finally { closeSync(fd) }
    text = buf.toString('utf8')
  }
  let info = null
  const idx = text.lastIndexOf('"type":"token_count"')
  if (idx >= 0) {
    const start = text.lastIndexOf('\n', idx) + 1, end = text.indexOf('\n', idx)
    try { info = JSON.parse(text.slice(start, end < 0 ? undefined : end)).payload?.info ?? null } catch { info = null }
  }
  tokenCache.set(file, { mtimeMs, info })
  return info
}

export function readCodexWorkspaces({ codexHome = join(homedir(), '.codex'), perWorkspace = 2, maxWorkspaces = 6, now = Date.now() } = {}) {
  const file = join(codexHome, 'state_5.sqlite')
  if (!existsSync(file)) return { ok: false, error: '未找到 ~/.codex/state_5.sqlite', workspaces: [] }
  let db
  try { db = openCodexDb(file) } catch (e) { return { ok: false, error: `无法读取 Codex 数据库：${e.message}`, workspaces: [] } }
  try {
    const projects = db.prepare('select p.name, r.path from projects p join project_roots r on r.project_id = p.id').all()
    const threads = db.prepare(`select id, rollout_path, cwd, title, name, updated_at, updated_at_ms, tokens_used, model, git_branch, first_user_message
      from threads where archived = 0 and coalesce(thread_source, 'user') = 'user' order by coalesce(updated_at_ms, updated_at * 1000) desc limit 400`).all()
    const groups = new Map()
    for (const t of threads) {
      const proj = projects.find((p) => t.cwd === p.path || t.cwd.startsWith(`${p.path}/`))
      const key = proj?.path ?? t.cwd
      if (!groups.has(key)) groups.set(key, { id: key, title: proj?.name ?? basename(t.cwd), path: key, total: 0, threads: [] })
      const g = groups.get(key); g.total++; if (g.threads.length < perWorkspace) g.threads.push(t)
    }
    const workspaces = [...groups.values()].slice(0, maxWorkspaces).map((g) => ({
      id: g.id, title: g.title, path: g.path, total: g.total,
      updatedAt: g.threads[0] ? (g.threads[0].updated_at_ms ?? g.threads[0].updated_at * 1000) : 0,
      sessions: g.threads.map((t) => {
        let info = null
        try { info = lastTokenCount(t.rollout_path) } catch { info = null }
        const used = info?.last_token_usage?.input_tokens ?? null
        const win = info?.model_context_window ?? null
        const updated = t.updated_at_ms ?? t.updated_at * 1000
        return {
          id: t.id, title: t.name || t.title || t.first_user_message?.slice(0, 60) || '(未命名)',
          lastActiveAt: updated, status: now - updated < 3 * 60000 ? 'running' : 'idle',
          model: t.model, branch: t.git_branch,
          contextUsed: used, contextWindow: win, contextPct: pct(used, win), totalTokens: t.tokens_used,
        }
      }),
    }))
    return { ok: true, workspaces }
  } finally { db.close() }
}
