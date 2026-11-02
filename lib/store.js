// 数据存储：单个 JSON 文件，原子写（temp + rename）。所有写操作串行化。
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export const DEFAULT_DIR = join(homedir(), '.dsh', 'adhd-workbench')

export function emptyData() {
  return {
    version: 1,
    tasks: [],
    ideas: [],
    coachLog: [],
    // 每日任务量上限（分钟），由 learning.adjustCapacity 每周校准
    profile: { dailyWorkMinutes: 240, dailyGrowthMinutes: 45, lastCapacityReview: null, workStart: '09:30', workEnd: '18:30' },
  }
}

export const newId = () => randomUUID().slice(0, 8)

export class Store {
  constructor(dir = DEFAULT_DIR) {
    this.dir = dir
    this.file = join(dir, 'data.json')
    this.data = null
    this.nonce = 0
  }

  load() {
    if (this.data) return this.data
    mkdirSync(this.dir, { recursive: true })
    if (existsSync(this.file)) {
      try {
        const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
        this.data = { ...emptyData(), ...parsed, profile: { ...emptyData().profile, ...(parsed.profile ?? {}) } }
      } catch {
        // 损坏文件先备份再重建，绝不静默覆盖用户数据
        renameSync(this.file, `${this.file}.corrupt-${Date.now()}`)
        this.data = emptyData()
      }
    } else {
      this.data = emptyData()
    }
    return this.data
  }

  save() {
    mkdirSync(this.dir, { recursive: true })
    const tmp = join(this.dir, `.tmp-${process.pid}-${++this.nonce}`)
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }

  /** 读-改-写：fn 修改 data 并返回结果。 */
  mutate(fn) {
    const data = this.load()
    const result = fn(data)
    this.save()
    return result
  }
}
