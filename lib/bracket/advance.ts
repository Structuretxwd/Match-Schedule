import type { StoredMatch, Team, TournamentEvent, TournamentFormat } from '@/lib/data/schema'
import { GF_ID, generateTemplate, type BracketTemplate, type SlotSource } from './generate'

export type MatchStatus = 'pending' | 'ready' | 'live' | 'finished'
export type TeamLaneStatus = 'alive-wb' | 'alive-lb' | 'eliminated'

export type DerivedMatch = {
  id: string
  bracket: 'WB' | 'LB' | 'GF'
  round: number
  index: number
  teamA: Team | null
  teamB: Team | null
  scoreA: number | null
  scoreB: number | null
  status: MatchStatus
  bo: number
  sourceA: SlotSource
  sourceB: SlotSource
  winnerId: string | null
  loserId: string | null
  isElimination: boolean
  scheduledAt: string | null
  referee: string | null
  streamUrl: string | null
  note: string | null
}

export type TeamState = {
  teamId: string
  name: string
  seed: number
  wins: number
  losses: number
  status: TeamLaneStatus
  eliminatedByMatchId: string | null
}

export type DerivedBracket = {
  bracketSize: number
  format: TournamentFormat
  matches: DerivedMatch[]
  byId: Record<string, DerivedMatch>
  teamStates: TeamState[]
  championId: string | null
}

const templateCache = new Map<string, BracketTemplate>()

function templateFor(format: TournamentFormat, bracketSize: number): BracketTemplate {
  const key = `${format}:${bracketSize}`
  let t = templateCache.get(key)
  if (!t) {
    t = generateTemplate(bracketSize, format)
    templateCache.set(key, t)
  }
  return t
}

export function winnerOf(m: DerivedMatch | undefined): Team | null {
  if (!m || !m.teamA || !m.teamB) return null
  if (m.scoreA === null || m.scoreB === null) return null
  if (m.scoreA > m.scoreB) return m.teamA
  if (m.scoreB > m.scoreA) return m.teamB
  return null
}

export function loserOf(m: DerivedMatch | undefined): Team | null {
  const w = winnerOf(m)
  if (!w || !m) return null
  return w.id === m.teamA!.id ? m.teamB : m.teamA
}

function resolveSource(
  source: SlotSource,
  byId: Record<string, DerivedMatch>,
  teamBySeed: Map<number, Team>,
): Team | null {
  switch (source.kind) {
    case 'seed':
      return teamBySeed.get(source.seed) ?? null
    case 'winner':
      return winnerOf(byId[source.matchId])
    case 'loser':
      return loserOf(byId[source.matchId])
  }
}

function deriveStatus(m: DerivedMatch, live: boolean): MatchStatus {
  const hasA = m.scoreA !== null
  const hasB = m.scoreB !== null
  if (hasA && hasB) return 'finished'
  if (hasA !== hasB) return 'ready'
  if (live) return 'live'
  if (m.teamA && m.teamB) return 'ready'
  return 'pending'
}

export function deriveBracket(event: TournamentEvent): DerivedBracket {
  const singleElim = event.format === 'single-elimination'
  const template = templateFor(event.format, event.bracketSize)
  const storedById = new Map(event.matches.map((m) => [m.id, m]))
  const teamBySeed = new Map(event.teams.map((t) => [t.seed, t]))

  const byId: Record<string, DerivedMatch> = {}
  const ordered: DerivedMatch[] = []

  for (const tpl of template.matches) {
    const stored: StoredMatch | undefined = storedById.get(tpl.id)
    const bo = stored?.bo ?? (tpl.bracket === 'GF' ? event.grandFinalBO : event.defaultBO)
    const m: DerivedMatch = {
      id: tpl.id,
      bracket: tpl.bracket,
      round: tpl.round,
      index: tpl.index,
      teamA: null,
      teamB: null,
      scoreA: stored?.scoreA ?? null,
      scoreB: stored?.scoreB ?? null,
      status: 'pending',
      bo,
      sourceA: tpl.sourceA,
      sourceB: tpl.sourceB,
      winnerId: null,
      loserId: null,
      isElimination: singleElim || tpl.bracket === 'LB' || tpl.bracket === 'GF',
      scheduledAt: stored?.scheduledAt ?? null,
      referee: stored?.referee ?? null,
      streamUrl: stored?.streamUrl ?? null,
      note: stored?.note ?? null,
    }
    m.teamA = resolveSource(tpl.sourceA, byId, teamBySeed)
    m.teamB = resolveSource(tpl.sourceB, byId, teamBySeed)
    m.winnerId = winnerOf(m)?.id ?? null
    m.loserId = loserOf(m)?.id ?? null
    m.status = deriveStatus(m, stored?.live ?? false)
    byId[m.id] = m
    ordered.push(m)
  }

  return {
    bracketSize: event.bracketSize,
    format: event.format,
    matches: ordered,
    byId,
    teamStates: deriveTeamStates(event, byId),
    championId: byId[GF_ID]?.winnerId ?? null,
  }
}

function deriveTeamStates(
  event: TournamentEvent,
  byId: Record<string, DerivedMatch>,
): TeamState[] {
  const singleElim = event.format === 'single-elimination'
  const acc = new Map<string, TeamState>()
  for (const t of event.teams) {
    acc.set(t.id, {
      teamId: t.id,
      name: t.name,
      seed: t.seed,
      wins: 0,
      losses: 0,
      status: 'alive-wb',
      eliminatedByMatchId: null,
    })
  }

  for (const m of Object.values(byId)) {
    if (m.status !== 'finished') continue
    if (m.winnerId) {
      const s = acc.get(m.winnerId)
      if (s) s.wins += 1
    }
    if (m.loserId) {
      const s = acc.get(m.loserId)
      if (s) {
        s.losses += 1
        if (m.isElimination) s.eliminatedByMatchId = m.id
      }
    }
  }

  for (const s of acc.values()) {
    if (singleElim) {
      // 单败没有败者组存活这一档：输一场即出局
      s.status = s.losses >= 1 ? 'eliminated' : 'alive-wb'
    } else {
      s.status = s.losses >= 2 ? 'eliminated' : s.losses === 1 ? 'alive-lb' : 'alive-wb'
    }
  }

  // 总决赛败者一律淘汰，即使其此前零败（不采用重置规则）
  const gf = byId[GF_ID]
  if (gf && gf.status === 'finished' && gf.loserId) {
    const s = acc.get(gf.loserId)
    if (s) {
      s.status = 'eliminated'
      s.eliminatedByMatchId = GF_ID
    }
  }

  return event.teams.map((t) => acc.get(t.id)!)
}
