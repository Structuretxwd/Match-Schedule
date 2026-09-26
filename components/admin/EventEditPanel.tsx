'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { eventFilePath } from '@/lib/admin/newEvent'
import { applyEventEdit, parsePlayers, validateEventEdit, type EventEdit } from '@/lib/admin/editEvent'
import { parseEvent, type TournamentEvent } from '@/lib/data/schema'
import { pollUrl } from '@/lib/urls'

export type EventEditPanelProps = {
  eventId: string
  /** 测试注入：不传则挂载后从 /data/events/<id>.json 加载 */
  initialEvent?: TournamentEvent
  onSaved?: (text: string) => void
}

export function EventEditPanel({ eventId, initialEvent, onSaved }: EventEditPanelProps) {
  const { mutate } = useAuth()
  const [event, setEvent] = useState<TournamentEvent | null>(initialEvent ?? null)
  const [loading, setLoading] = useState(initialEvent === undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { name: string; players: string }>>({})
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (initialEvent !== undefined) return
    let cancelled = false
    setLoading(true)
    fetch(pollUrl(`/events/${eventId}.json`))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((raw) => {
        if (cancelled) return
        setEvent(parseEvent(raw))
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(`赛事数据加载失败：${err instanceof Error ? err.message : '未知错误'}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, initialEvent])

  /**
   * 本地副本的同步发生在写入成功之后，因此它是"服务端已接受"的快照，而不是乐观猜测。
   * 返回 true 表示已提交成功，调用方据此决定是否清空输入框。
   */
  async function save(edit: EventEdit, text: string): Promise<boolean> {
    if (!event || busy) return false
    const invalid = validateEventEdit(event, edit)
    if (invalid) {
      setNotice(null)
      setError(invalid)
      return false
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    const outcome = await mutate<TournamentEvent>({
      path: eventFilePath(eventId),
      parse: parseEvent,
      mutate: (current) => applyEventEdit(current, edit, new Date().toISOString()),
      message: `chore(data): ${event.name} ${text}`,
    })
    setBusy(false)

    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setEvent((current) => (current ? applyEventEdit(current, edit, new Date().toISOString()) : current))
    setNotice(`已提交：${text}。约 1–2 分钟后 Actions 重建完成，观众端才会看到。`)
    onSaved?.(`${event.name}：${text}`)
    return true
  }

  if (loading) {
    return <p className="text-xs text-muted">{`正在加载 ${eventId} 的赛事数据...`}</p>
  }
  if (loadError) {
    return <p className="text-xs text-danger">{loadError}</p>
  }
  if (!event) {
    return <p className="text-xs text-muted">没有可编辑的数据。</p>
  }

  return (
    <div className="space-y-4 rounded border border-line bg-panel p-3">
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-wb">{notice}</p> : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{`队伍（${event.teams.length} 支）`}</h3>
        <p className="text-[11px] text-muted">
          只改名称与选手名单；种子顺序与签表结构在创建赛事时确定，改动种子需新建赛事。
        </p>
        <ul className="space-y-2">
          {event.teams.map((team) => {
            const draft = drafts[team.id] ?? {
              name: team.name,
              players: team.players.map((p) => p.name).join('、'),
            }
            return (
              <li key={team.id} className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted">{`#${team.seed} 名称`}</span>
                  <input
                    name={`name-${team.id}`}
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((current) => ({ ...current, [team.id]: { ...draft, name: e.target.value } }))
                    }
                    className="w-40 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
                  />
                </label>
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted">选手（顿号或逗号分隔）</span>
                  <input
                    name={`players-${team.id}`}
                    value={draft.players}
                    onChange={(e) =>
                      setDrafts((current) => ({
                        ...current,
                        [team.id]: { ...draft, players: e.target.value },
                      }))
                    }
                    className="w-64 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    save(
                      {
                        kind: 'update-team',
                        teamId: team.id,
                        name: draft.name,
                        players: parsePlayers(draft.players),
                      },
                      `更新队伍「${draft.name.trim() || team.name}」`,
                    )
                  }
                  className="rounded border border-wb px-2 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
                >
                  保存
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{`公告（${event.announcements.length} 条）`}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1 text-[11px]">
            <span className="text-muted">新公告</span>
            <input
              name="new-announcement"
              value={announcement}
              placeholder="例如：决赛改为 10 月 5 日 20:00"
              onChange={(e) => setAnnouncement(e.target.value)}
              className="w-80 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const content = announcement.trim()
              const ok = await save({ kind: 'add-announcement', content }, `发布公告「${content}」`)
              if (ok) setAnnouncement('')
            }}
            className="rounded border border-wb px-2 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
          >
            发布公告
          </button>
        </div>
        {event.announcements.length === 0 ? (
          <p className="text-xs text-muted">暂无公告。</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line text-sm">
            {event.announcements.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>{a.content}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    save({ kind: 'remove-announcement', announcementId: a.id }, `删除公告「${a.content}」`)
                  }
                  className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-danger disabled:opacity-40"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
