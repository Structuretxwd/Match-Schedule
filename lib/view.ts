import type { DerivedBracket, DerivedMatch, MatchStatus, TeamLaneStatus, TeamState } from '@/lib/bracket/advance'
import type { SlotSource } from '@/lib/bracket/generate'
import type { BracketLayout } from '@/lib/bracket/layout'
import type { BracketKind } from '@/lib/data/schema'

// 手动做时区换算，避免依赖运行环境的 ICU 数据导致不同机器输出不一致
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shiftToShanghai(iso: string): Date | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t + SHANGHAI_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function dayKey(iso: string | null): string {
  if (!iso) return 'tbd'
  const d = shiftToShanghai(iso)
  if (!d) return 'tbd'
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '时间待定'
  const d = shiftToShanghai(iso)
  if (!d) return '时间待定'
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: '待定',
  ready: '未开始',
  live: '进行中',
  finished: '已结束',
}

export function statusLabel(status: MatchStatus): string {
  return STATUS_LABEL[status]
}

const LANE_LABEL: Record<TeamLaneStatus, string> = {
  'alive-wb': '胜者组存活',
  'alive-lb': '败者组存活',
  eliminated: '已淘汰',
}

export function laneLabel(status: TeamLaneStatus): string {
  return LANE_LABEL[status]
}

export const BRACKET_LABEL: Record<BracketKind, string> = {
  WB: '胜者组',
  LB: '败者组',
  GF: '总决赛',
}

export const BRACKET_COLOR: Record<BracketKind, string> = {
  WB: '#34d399',
  LB: '#fbbf24',
  GF: '#818cf8',
}

export function slotLabel(source: SlotSource): string {
  switch (source.kind) {
    case 'seed':
      return `种子 ${source.seed}`
    case 'winner':
      return `${source.matchId} 胜者`
    case 'loser':
      return `${source.matchId} 败者`
  }
}

export type ScheduleDay = { key: string; label: string; matches: DerivedMatch[] }

export function sortForSchedule(matches: DerivedMatch[]): DerivedMatch[] {
  return [...matches].sort((a, b) => {
    const ta = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.NaN
    const tb = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.NaN
    const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta
    const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb
    if (va !== vb) return va - vb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function groupMatchesByDay(matches: DerivedMatch[]): ScheduleDay[] {
  const out: ScheduleDay[] = []
  for (const m of sortForSchedule(matches)) {
    const key = dayKey(m.scheduledAt)
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.matches.push(m)
    } else {
      out.push({ key, label: key === 'tbd' ? '时间待定' : key.slice(5), matches: [m] })
    }
  }
  return out
}

const LANE_ORDER: Record<TeamLaneStatus, number> = { 'alive-wb': 0, 'alive-lb': 1, eliminated: 2 }

export function sortTeams(states: TeamState[]): TeamState[] {
  return [...states].sort((a, b) => LANE_ORDER[a.status] - LANE_ORDER[b.status] || a.seed - b.seed)
}

export type NextStop = { matchId: string; kind: 'winner' | 'loser' }

export function nextStops(derived: DerivedBracket, matchId: string): NextStop[] {
  const out: NextStop[] = []
  for (const m of derived.matches) {
    for (const src of [m.sourceA, m.sourceB]) {
      if (src.kind !== 'seed' && src.matchId === matchId) {
        out.push({ matchId: m.id, kind: src.kind })
      }
    }
  }
  return out
}

export type ConnectorView = { key: string; path: string; dashed: boolean }

export function connectorViews(layout: BracketLayout, derived: DerivedBracket): ConnectorView[] {
  return layout.connectors.map((c) => {
    const from = derived.byId[c.fromMatchId]?.bracket
    const to = derived.byId[c.toMatchId]?.bracket
    return {
      key: `${c.fromMatchId}->${c.toMatchId}`,
      path: c.path,
      // 跨分区（胜者组 → 败者组）用虚线，表示"掉落"
      dashed: from !== to,
    }
  })
}
