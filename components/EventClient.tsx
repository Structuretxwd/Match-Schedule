'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { deriveBracket } from '@/lib/bracket/advance'
import type { TournamentEvent } from '@/lib/data/schema'
import { prunePending, useEventData, type PendingChange } from '@/lib/useEventData'
import { formatDateTime } from '@/lib/view'
import { BracketView } from './BracketView'
import { MatchDetailDialog } from './MatchDetailDialog'
import { ScheduleView } from './ScheduleView'
import { TeamsView } from './TeamsView'

export type EventViewKind = 'bracket' | 'schedule' | 'teams'

export type EventClientProps = {
  initial: TournamentEvent | null
  view: EventViewKind
}

const TABS: { view: EventViewKind; label: string; segment: string }[] = [
  { view: 'bracket', label: '对阵图', segment: '' },
  { view: 'schedule', label: '赛程', segment: 'schedule/' },
  { view: 'teams', label: '队伍', segment: 'teams/' },
]

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EventClient({ initial, view }: EventClientProps) {
  if (!initial) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
        该赛事的数据暂不可用。数据文件可能缺失或格式有误。
      </div>
    )
  }
  return <EventLive initial={initial} view={view} />
}

function EventLive({ initial, view }: { initial: TournamentEvent; view: EventViewKind }) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChange[]>([])
  const { event, remote, error, lastFetchedAt } = useEventData(initial, pending)
  const derived = useMemo(() => deriveBracket(event), [event])
  const selected = selectedMatchId ? derived.byId[selectedMatchId] : null

  // Actions 重建完成后，把已生效的改动从待生效列表里移除，避免它覆盖之后的新比分
  useEffect(() => {
    setPending((current) => {
      const next = prunePending(remote, current)
      return next.length === current.length ? current : next
    })
  }, [remote])

  const finished = event.matches.filter((m) => m.scoreA !== null && m.scoreB !== null).length
  const champion = derived.championId
    ? event.teams.find((t) => t.id === derived.championId)
    : undefined

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
            <p className="mt-1 text-xs text-muted">
              {`${event.bracketSize} 队 · 双败淘汰 · ${finished} / ${event.matches.length} 场已完成`}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted">
            {champion ? (
              <div className="text-sm font-semibold text-wb">{`冠军：${champion.name}`}</div>
            ) : null}
            <div>{lastFetchedAt ? `已同步 ${formatClock(lastFetchedAt)}` : '30 秒自动刷新'}</div>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-danger/40 bg-panel px-3 py-2 text-xs text-danger">
            {`数据刷新失败：${error}。页面显示的可能是稍早的数据。`}
          </p>
        ) : null}

        {pending.length > 0 ? (
          <p className="rounded border border-line bg-panel px-3 py-2 text-xs text-muted">
            {`已提交 ${pending.length} 处改动，等待 GitHub Actions 重建后生效（约 1–2 分钟）。`}
          </p>
        ) : null}

        {event.announcements.length > 0 ? (
          <ul className="space-y-1 rounded border border-line bg-panel px-3 py-2 text-xs">
            {event.announcements.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-muted">{formatDateTime(a.createdAt)}</span>
                <span className="flex-1">{a.content}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <nav className="flex gap-1 border-b border-line">
          {TABS.map((tab) => (
            <Link
              key={tab.view}
              href={`/event/${event.id}/${tab.segment}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                view === tab.view
                  ? 'border-wb text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {view === 'bracket' ? (
        <BracketView
          derived={derived}
          bracketSize={event.bracketSize}
          selectedMatchId={selectedMatchId}
          onSelectMatch={setSelectedMatchId}
        />
      ) : null}
      {view === 'schedule' ? (
        <ScheduleView derived={derived} onSelectMatch={setSelectedMatchId} />
      ) : null}
      {view === 'teams' ? <TeamsView event={event} derived={derived} /> : null}

      {selected ? (
        <MatchDetailDialog
          match={selected}
          derived={derived}
          eventId={event.id}
          onClose={() => setSelectedMatchId(null)}
          onSaved={(change) =>
            setPending((current) => [...current.filter((p) => p.matchId !== change.matchId), change])
          }
        />
      ) : null}
    </div>
  )
}
