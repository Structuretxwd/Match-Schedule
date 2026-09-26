'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { parseEvent } from '@/lib/data/schema'
import {
  buildNewEvent,
  eventFilePath,
  resizeTeamNames,
  validateNewEvent,
  type NewEventInput,
} from '@/lib/admin/newEvent'

const SIZES: NewEventInput['bracketSize'][] = [4, 8, 16, 32]
const BOS = [1, 3, 5, 7]

export type CreateEventFormProps = {
  /** 写入成功后的回调，用于在父组件记录"待生效"提示 */
  onCreated?: (eventId: string, eventName: string) => void
}

export function CreateEventForm({ onCreated }: CreateEventFormProps) {
  const { create } = useAuth()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [bracketSize, setBracketSize] = useState<NewEventInput['bracketSize']>(8)
  const [defaultBO, setDefaultBO] = useState(3)
  const [grandFinalBO, setGrandFinalBO] = useState(5)
  const [teamNames, setTeamNames] = useState<string[]>(() => resizeTeamNames([], 8))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function changeSize(next: NewEventInput['bracketSize']) {
    setBracketSize(next)
    setTeamNames((current) => resizeTeamNames(current, next))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const input: NewEventInput = {
      id: id.trim(),
      name: name.trim(),
      bracketSize,
      defaultBO,
      grandFinalBO,
      teamNames,
      now: new Date().toISOString(),
    }

    const invalid = validateNewEvent(input)
    if (invalid) {
      setNotice(null)
      setError(invalid)
      return
    }

    let content: unknown
    try {
      content = buildNewEvent(input)
      // 自检：生成的 JSON 必须能被读回，否则宁可不提交
      parseEvent(content)
    } catch (err) {
      setNotice(null)
      setError(`生成的数据不合法，已中止提交：${err instanceof Error ? err.message : '未知错误'}`)
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    const outcome = await create({
      path: eventFilePath(input.id),
      content,
      message: `chore(data): 创建赛事 ${input.name}（${input.id}）`,
    })
    setBusy(false)

    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setNotice(`已提交「${input.name}」。约 1–2 分钟后 Actions 重建完成，赛事会出现在下方列表中。`)
    onCreated?.(input.id, input.name)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border border-line bg-panel p-3">
      <h2 className="text-sm font-medium">创建赛事</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span className="text-muted">赛事 ID（小写字母、数字、连字符）</span>
          <input
            name="event-id"
            value={id}
            placeholder="autumn-2026"
            onChange={(e) => setId(e.target.value)}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted">赛事名称</span>
          <input
            name="event-name"
            value={name}
            placeholder="2026 秋季赛"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted">签表规模</span>
          <select
            name="bracket-size"
            value={bracketSize}
            onChange={(e) => changeSize(Number(e.target.value) as NewEventInput['bracketSize'])}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>{`${s} 队`}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs">
            <span className="text-muted">默认 BO</span>
            <select
              name="default-bo"
              value={defaultBO}
              onChange={(e) => setDefaultBO(Number(e.target.value))}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            >
              {BOS.map((b) => (
                <option key={b} value={b}>{`BO${b}`}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-xs">
            <span className="text-muted">总决赛 BO</span>
            <select
              name="grand-final-bo"
              value={grandFinalBO}
              onChange={(e) => setGrandFinalBO(Number(e.target.value))}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            >
              {BOS.map((b) => (
                <option key={b} value={b}>{`BO${b}`}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted">
          {`队伍名单（顺序即种子顺序，1 号种子在最上；共 ${bracketSize} 支）`}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {teamNames.map((teamName, i) => (
            <label key={i} className="block space-y-1 text-[11px]">
              <span className="text-muted">{`#${i + 1}`}</span>
              <input
                name={`team-${i + 1}`}
                value={teamName}
                onChange={(e) =>
                  setTeamNames((current) =>
                    current.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-wb">{notice}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded border border-wb px-3 py-1.5 text-sm text-wb hover:bg-wb/10 disabled:opacity-40"
      >
        {busy ? '提交中...' : '创建赛事'}
      </button>
    </form>
  )
}
