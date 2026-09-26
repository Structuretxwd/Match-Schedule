'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { eventFilePath } from '@/lib/admin/newEvent'
import type { EventSummary } from '@/lib/data/schema'

export type EventListProps = {
  events: EventSummary[]
  selectedId: string | null
  onSelect: (eventId: string) => void
  onDeleted?: (eventId: string) => void
}

const STATUS_LABEL: Record<EventSummary['status'], string> = {
  draft: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
}

export function EventList({ events, selectedId, onSelect, onDeleted }: EventListProps) {
  const { remove } = useAuth()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onDelete(event: EventSummary) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    const outcome = await remove({
      path: eventFilePath(event.id),
      message: `chore(data): 删除赛事 ${event.name}（${event.id}）`,
    })
    setBusy(false)
    if (!outcome.ok) {
      setMessage(outcome.message)
      return
    }
    setConfirming(null)
    setTyped('')
    setMessage(`已删除「${event.name}」。约 1–2 分钟后 Actions 重建完成，列表中的条目才会消失。`)
    onDeleted?.(event.id)
  }

  if (events.length === 0) {
    return <p className="text-xs text-muted">还没有任何赛事数据文件。</p>
  }

  return (
    <div className="space-y-2">
      {message ? <p className="text-xs text-wb">{message}</p> : null}
      <ul className="divide-y divide-line rounded border border-line bg-panel text-sm">
        {events.map((event) => (
          <li key={event.id} className="space-y-2 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/event/${event.id}/`} className="hover:text-wb">
                  {event.name}
                </Link>
                <span className="text-[11px] text-muted">{`${STATUS_LABEL[event.status]} · ${event.bracketSize} 队`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">{`${event.finishedMatches} / ${event.totalMatches} 场`}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null)
                    setConfirming(confirming === event.id ? null : event.id)
                    setTyped('')
                  }}
                  className="rounded border border-line px-2 py-1 text-muted hover:text-fg"
                >
                  {confirming === event.id ? '取消删除' : '删除'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(event.id)}
                  className={`rounded border px-2 py-1 ${
                    selectedId === event.id
                      ? 'border-wb text-wb'
                      : 'border-line text-muted hover:text-fg'
                  }`}
                >
                  {selectedId === event.id ? '正在编辑' : '编辑队伍与公告'}
                </button>
              </div>
            </div>

            {confirming === event.id ? (
              <div className="space-y-2 rounded border border-danger/40 bg-panel-hi p-2">
                <p className="text-[11px] text-danger">
                  {`删除会从仓库中移除 ${eventFilePath(event.id)}，且无法撤销。请输入赛事 ID「${event.id}」以确认：`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="confirm-event-id"
                    value={typed}
                    placeholder={event.id}
                    onChange={(e) => setTyped(e.target.value)}
                    className="w-48 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-danger"
                  />
                  <button
                    type="button"
                    disabled={busy || typed !== event.id}
                    onClick={() => onDelete(event)}
                    className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
                  >
                    {busy ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
