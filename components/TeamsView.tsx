'use client'

import type { DerivedBracket } from '@/lib/bracket/advance'
import type { TournamentEvent } from '@/lib/data/schema'
import { laneLabel, sortTeams } from '@/lib/view'

const LANE_CLASS: Record<'alive-wb' | 'alive-lb' | 'eliminated', string> = {
  'alive-wb': 'text-wb',
  'alive-lb': 'text-lb',
  eliminated: 'text-muted/60',
}

export type TeamsViewProps = {
  event: TournamentEvent
  derived: DerivedBracket
}

export function TeamsView({ event, derived }: TeamsViewProps) {
  const teamById = new Map(event.teams.map((t) => [t.id, t]))
  const teams = sortTeams(derived.teamStates)

  if (teams.length === 0) {
    return <p className="text-muted">暂无队伍。</p>
  }

  const champion = derived.championId ? teamById.get(derived.championId) : undefined

  return (
    <div className="space-y-3">
      {champion ? (
        <div className="rounded-md border border-wb/50 bg-panel px-3 py-2 text-sm text-wb">
          {`冠军：${champion.name}`}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-panel text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">种子</th>
              <th className="px-3 py-2 font-medium">队伍</th>
              <th className="px-3 py-2 font-medium">选手</th>
              <th className="px-3 py-2 text-right font-medium">胜</th>
              <th className="px-3 py-2 text-right font-medium">负</th>
              <th className="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const players = teamById.get(t.teamId)?.players ?? []
              const status =
                t.status === 'eliminated' && t.eliminatedByMatchId
                  ? `${laneLabel(t.status)}（${t.eliminatedByMatchId}）`
                  : laneLabel(t.status)
              return (
                <tr key={t.teamId} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{t.seed}</td>
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted">
                    {players.length > 0 ? players.map((p) => p.name).join('、') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.wins}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.losses}</td>
                  <td className={`px-3 py-2 text-xs ${LANE_CLASS[t.status]}`}>{status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
