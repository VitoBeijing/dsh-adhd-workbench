// dsh-adhd-workbench 宿主入口（Cordis 插件）。
// 负责：数据存储、计划/学习、读 DSH/Codex 工作区、调用宿主 llm、导出汇报；通过 webServer 暴露 HTTP API。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { Store, DEFAULT_DIR } from './store.js'
import { Ai } from './ai.js'
import { createHandler, API_PREFIX } from './api.js'

export const name = 'dsh-adhd-workbench'
export const inject = ['llm', 'agents']

/** 文件兜底：取最近一次使用的 provider/model（DSH 会话缓存里的 modelSelection.lastUsed）。 */
function lastUsedModelFromDisk() {
  const dir = join(homedir(), '.dsh', 'storages', 'session_projcache', 'sessions')
  let best = null
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const rows = JSON.parse(readFileSync(join(dir, f), 'utf8'))?.record?.rows ?? {}
        const used = rows.modelSelection?.val?.lastUsed
        const at = rows.sessionListMetadata?.val?.lastPromptAt ?? 0
        if (used?.provider && used?.model && (!best || at > best.at)) best = { provider: used.provider, model: used.model, at }
      } catch { /* 跳过损坏文件 */ }
    }
  } catch { /* 目录不存在 */ }
  return best ? { provider: best.provider, model: best.model } : null
}

export function apply(ctx, config = {}) {
  const dataDir = typeof config.dataDir === 'string' && config.dataDir ? config.dataDir : DEFAULT_DIR
  const store = new Store(dataDir)
  const agents = () => { try { return ctx.get('agents') } catch { return undefined } }
  const listAgents = () => { const a = agents(); try { return a?.list?.() ?? a?.roots?.() ?? [] } catch { return [] } }

  const ai = new Ai({
    logger: ctx.logger,
    getLlm: () => {
      // llm 适配器注册在应用根；隔离作用域可能拿不到，优先取根
      try { const root = ctx.get?.('root') ?? ctx.root; const l = root?.get?.('llm'); if (l?.stream) return l } catch { /* ignore */ }
      try { return ctx.get('llm') } catch { return ctx.llm }
    },
    resolveRoute: () => {
      if (config.provider && config.model) return { provider: config.provider, model: config.model }
      const live = listAgents().find((a) => a?.options?.provider && a?.options?.model)
      if (live) return { provider: live.options.provider, model: live.options.model }
      return lastUsedModelFromDisk()
    },
  })

  const liveStatus = (sessionId) => {
    try { return agents()?.get?.(sessionId)?.status } catch { return undefined }
  }

  ctx.inject(['webServer'], (web) => {
    const handler = createHandler({ store, ai, liveStatus, dataDir, logger: ctx.logger })
    web.effect(() => web.webServer.register({ kind: 'prefix', path: API_PREFIX, handler }), 'adhd-workbench: api')
  })
}
