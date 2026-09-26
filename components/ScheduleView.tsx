'use client'

import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { BRACKET_COLOR, BRACKET_LABEL, formatDateTime, groupMatchesByDay, slotLabel } from '@/lib/view'

export type ScheduleViewProps = {
  derived: DerivedBracket
  onSelectMatch: (matchId: string) => void
}

function StatusBadge({ match }: { match: DerivedMatch }) {
  if (match.status === 'live') {
    return <span className="rounded border border-live/50 px-1.5 py-0.5 text-[10px] text-live">进行中</span>
  }
  if (match.status === 'finished') {
    return <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">已结束</span>
  }
  if (match.status === 'ready') {
    return <span className="rounded border border-wb/40 px-1.5 py-0.5 text-[10px] text-wb">未开始</span>
  }
  return <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted/70">待定</span>
}

export function ScheduleView({ derived, onSelectMatch }: ScheduleViewProps) {
  const days = groupMatchesByDay(derived.matches)

  if (days.length === 0) {
    return <p className="text-muted">暂无赛程。</p>
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day.key} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{day.label}</h2>
          <ul className="space-y-1.5">
            {day.matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelectMatch(m.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-line bg-panel px-3 py-2 text-left transition-colors hover:border-muted/60 hover:bg-panel-hi"
                >
                  <span className="w-24 shrink-0 text-[11px] text-muted">
                    {formatDateTime(m.scheduledAt)}
                  </span>
                  <span
                    className="w-12 shrink-0 text-[11px]"
                    style={{ color: BRACKET_COLOR[m.bracket] }}
                  >
                    {BRACKET_LABEL[m.bracket]}
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {`${m.teamA?.name ?? slotLabel(m.sourceA)} vs ${m.teamB?.name ?? slotLabel(m.sourceB)}`}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {m.scoreA === null || m.scoreB === null ? `BO${m.bo}` : `${m.scoreA} : ${m.scoreB}`}
                  </span>
                  <StatusBadge match={m} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
