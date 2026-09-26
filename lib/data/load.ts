import fs from 'node:fs'
import path from 'node:path'
import { parseConfig, parseEvent, summarize, type AppConfig, type EventSummary, type TournamentEvent } from './schema'

const EVENTS_DIR = path.join(process.cwd(), 'public', 'data', 'events')

export function listEventIds(): string[] {
  try {
    if (!fs.existsSync(EVENTS_DIR)) return []
    return fs
      .readdirSync(EVENTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  } catch (err) {
    console.error('[load] 无法扫描赛事目录', err)
    return []
  }
}

/**
 * output: 'export' 要求每个动态路由至少产出一个参数；generateStaticParams 返回空数组
 * 会被 Next 当成「没写这个函数」，直接中断构建。所以仓库里一个赛事都没有时，
 * 用这个占位 id 让构建通过，该路由会渲染 EventClient 的「数据暂不可用」兜底文案。
 */
export const EMPTY_PARAMS_ID = '_empty'

/** 供 app/event/[id] 各动态路由的 generateStaticParams 使用 */
export function eventStaticParams(): { id: string }[] {
  const ids = listEventIds()
  return (ids.length > 0 ? ids : [EMPTY_PARAMS_ID]).map((id) => ({ id }))
}

export function loadEvent(id: string): TournamentEvent | null {
  const file = path.join(EVENTS_DIR, `${id}.json`)
  try {
    if (!fs.existsSync(file)) return null
    return parseEvent(JSON.parse(fs.readFileSync(file, 'utf-8')))
  } catch (err) {
    console.error(`[load] 赛事数据不可用：${id}`, err)
    return null
  }
}

export function listEvents(): EventSummary[] {
  const out: EventSummary[] = []
  for (const id of listEventIds()) {
    const ev = loadEvent(id)
    if (ev) out.push(summarize(ev))
  }
  return out
}

const CONFIG_FILE = path.join(process.cwd(), 'public', 'data', 'config.json')

/**
 * 配置只影响"能否管理"，读取失败必须降级而不是中断构建（设计文档 §11）。
 * 返回 null 时 AuthProvider 会禁用一切管理功能，站点仍可正常浏览。
 */
export function loadConfig(): AppConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    return parseConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')))
  } catch (err) {
    console.error('[load] 配置不可用，管理功能将被禁用', err)
    return null
  }
}
