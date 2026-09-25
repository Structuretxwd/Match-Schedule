import fs from 'node:fs'
import path from 'node:path'
import { parseEvent, summarize, type EventSummary, type TournamentEvent } from './schema'

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
