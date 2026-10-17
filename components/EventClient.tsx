'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { deriveBracket } from '@/lib/bracket/advance'
import { parseEvent, type TournamentEvent } from '@/lib/data/schema'
import {
  prunePending,
  stagedToPending,
  useEventData,
  type PendingChange,
  type StagedEdits,
} from '@/lib/useEventData'
import { formatDateTime } from '@/lib/view'
import { useAuth } from './auth/AuthProvider'
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
  { view: 'teams', label: '选手', segment: 'teams/' },
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
  const { isAdmin, mutate } = useAuth()
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChange[]>([])
  // 本地草稿：立即参与预览，但不写仓库，直到点「全部提交」
  const [staged, setStaged] = useState<StagedEdits>({})
  const [commitBusy, setCommitBusy] = useState(false)
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitNotice, setCommitNotice] = useState<string | null>(null)

  const stagedList = useMemo(() => stagedToPending(staged), [staged])
  // 暂存放后面：同一场比赛上两边都有改动时，草稿里的字段优先
  const overrides = useMemo(() => [...pending, ...stagedList], [pending, stagedList])
  const { event, remote, error, lastFetchedAt } = useEventData(initial, overrides)
  const derived = useMemo(() => deriveBracket(event), [event])
  const selected = selectedMatchId ? derived.byId[selectedMatchId] : null

  // Actions 重建完成后，把已生效的改动从待生效列表里移除，避免它覆盖之后的新比分
  useEffect(() => {
    setPending((current) => {
      const next = prunePending(remote, current)
      return next.length === current.length ? current : next
    })
  }, [remote])

  // 草稿只存在内存里，刷新即丢；有未提交的改动时提醒一下
  useEffect(() => {
    if (stagedList.length === 0) return
    function guard(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [stagedList.length])

  function stage(matchId: string, patch: PendingChange['patch']) {
    setCommitNotice(null)
    setStaged((current) => ({ ...current, [matchId]: { ...current[matchId], ...patch } }))
  }

  /** 把全部草稿合成一次写入，只触发一次 Actions 重建 */
  async function commitStaged() {
    if (commitBusy || stagedList.length === 0) return
    setCommitBusy(true)
    setCommitError(null)
    setCommitNotice(null)

    const changes = stagedList
    const outcome = await mutate<TournamentEvent>({
      path: `public/data/events/${event.id}.json`,
      parse: parseEvent,
      mutate: (current) => ({
        ...current,
        matches: current.matches.map((m) => {
          const patch = staged[m.id]
          return patch ? { ...m, ...patch } : m
        }),
        updatedAt: new Date().toISOString(),
      }),
      message: `chore(data): ${event.id} 批量更新 ${changes.length} 场比赛`,
    })

    setCommitBusy(false)
    if (!outcome.ok) {
      setCommitError(outcome.message)
      return
    }
    // 已写入：并入 pending，继续按「等待重建」处理
    setPending((current) => [...current.filter((p) => !(p.matchId in staged)), ...changes])
    setStaged({})
    setCommitNotice(`已提交 ${changes.length} 处改动，等待 GitHub Actions 重建后生效（约 1–2 分钟）。`)
  }

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
              {`${event.bracketSize} 人 · ${event.format === 'double-elimination' ? '双败淘汰' : '单败淘汰'} · ${finished} / ${event.matches.length} 场已完成`}
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

      {isAdmin && stagedList.length > 0 ? (
        <div className="sticky top-0 z-40 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-wb/40 bg-panel px-4 py-2 text-xs shadow-sm">
          <span className="text-fg">{`待提交 ${stagedList.length} 场：改动已在本页预览，尚未写入仓库。`}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={commitBusy}
              onClick={() => void commitStaged()}
              className="rounded border border-wb px-3 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
            >
              {commitBusy ? '提交中...' : '全部提交'}
            </button>
            <button
              type="button"
              disabled={commitBusy}
              onClick={() => {
                setStaged({})
                setCommitNotice(null)
                setCommitError(null)
              }}
              className="rounded border border-line px-3 py-1 text-xs text-muted hover:text-fg disabled:opacity-40"
            >
              撤销全部
            </button>
          </div>
        </div>
      ) : null}

      {commitError ? (
        <p className="rounded border border-danger/40 bg-panel px-3 py-2 text-xs text-danger">
          {commitError}
        </p>
      ) : null}

      {commitNotice ? (
        <p className="rounded border border-line bg-panel px-3 py-2 text-xs text-wb">{commitNotice}</p>
      ) : null}

      {view === 'bracket' ? (
        <BracketView
          derived={derived}
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
          onClose={() => setSelectedMatchId(null)}
          onStage={stage}
          staged={staged[selected.id]}
        />
      ) : null}
    </div>
  )
}
