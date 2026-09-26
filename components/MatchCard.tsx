'use client'

import type { DerivedMatch } from '@/lib/bracket/advance'
import { formatDateTime, slotLabel } from '@/lib/view'

export type MatchCardProps = {
  match: DerivedMatch
  selected: boolean
  onSelect: (matchId: string) => void
}

type TeamRowProps = {
  name: string
  seed: number | null
  unresolved: boolean
  score: number | null
  won: boolean
  lost: boolean
}

function TeamRow({ name, seed, unresolved, score, won, lost }: TeamRowProps) {
  const nameClass = won
    ? 'font-semibold text-fg'
    : lost
      ? 'text-muted/70'
      : unresolved
        ? 'italic text-muted/70'
        : 'text-fg'
  const scoreClass = won ? 'font-semibold text-wb' : lost ? 'text-muted/70' : 'text-muted'

  return (
    <div className="flex items-center gap-1.5 text-xs leading-none">
      <span className="w-3.5 shrink-0 text-[10px] text-muted">{seed ?? '–'}</span>
      <span className={`flex-1 truncate ${nameClass}`} title={name}>
        {name}
      </span>
      <span className={`w-3.5 shrink-0 text-right tabular-nums ${scoreClass}`}>{score ?? ''}</span>
    </div>
  )
}

export function MatchCard({ match, selected, onSelect }: MatchCardProps) {
  const done = match.status === 'finished'
  const aWon = done && match.teamA !== null && match.winnerId === match.teamA.id
  const bWon = done && match.teamB !== null && match.winnerId === match.teamB.id

  return (
    <button
      type="button"
      data-match-id={match.id}
      onClick={() => onSelect(match.id)}
      title={`${slotLabel(match.sourceA)} vs ${slotLabel(match.sourceB)}`}
      className={`flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-colors ${
        selected ? 'border-wb bg-panel-hi' : 'border-line bg-panel hover:border-muted/60 hover:bg-panel-hi'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] leading-none text-muted">
        <span>{`BO${match.bo}`}</span>
        {match.status === 'live' ? (
          <span className="font-semibold text-live">进行中</span>
        ) : (
          <span>{formatDateTime(match.scheduledAt)}</span>
        )}
      </div>
      <TeamRow
        name={match.teamA?.name ?? slotLabel(match.sourceA)}
        seed={match.teamA?.seed ?? null}
        unresolved={match.teamA === null}
        score={match.scoreA}
        won={aWon}
        lost={done && !aWon && match.teamA !== null}
      />
      <TeamRow
        name={match.teamB?.name ?? slotLabel(match.sourceB)}
        seed={match.teamB?.seed ?? null}
        unresolved={match.teamB === null}
        score={match.scoreB}
        won={bWon}
        lost={done && !bWon && match.teamB !== null}
      />
    </button>
  )
}
