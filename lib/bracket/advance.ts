import type { StoredMatch, Team, TournamentEvent } from '@/lib/data/schema'
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
  matches: DerivedMatch[]
  byId: Record<string, DerivedMatch>
  teamStates: TeamState[]
  championId: string | null
}

const templateCache = new Map<number, BracketTemplate>()

function templateFor(bracketSize: number): BracketTemplate {
  let t = templateCache.get(bracketSize)
  if (!t) {
    t = generateTemplate(bracketSize)
    templateCache.set(bracketSize, t)
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
  const template = templateFor(event.bracketSize)
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
      isElimination: tpl.bracket === 'LB' || tpl.bracket === 'GF',
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
    s.status = s.losses >= 2 ? 'eliminated' : s.losses === 1 ? 'alive-lb' : 'alive-wb'
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
