'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import {
  MAX_BRACKET_SIZE,
  MIN_BRACKET_SIZE,
  parseEvent,
  type TournamentFormat,
} from '@/lib/data/schema'
import {
  buildNewEvent,
  eventFilePath,
  resizeTeamNames,
  validateNewEvent,
  type NewEventInput,
} from '@/lib/admin/newEvent'

/** 双败的败者组轮次按 2 的幂推导，规模只能是这几个 */
const DOUBLE_ELIM_SIZES = [4, 8, 16, 32]
const BOS = [1, 3, 5, 7]

const FORMATS: { value: TournamentFormat; label: string }[] = [
  { value: 'single-elimination', label: '单败淘汰（输一场即出局）' },
  { value: 'double-elimination', label: '双败淘汰（输两场才出局）' },
]

export type CreateEventFormProps = {
  /** 写入成功后的回调，用于在父组件记录"待生效"提示 */
  onCreated?: (eventId: string, eventName: string) => void
}

export function CreateEventForm({ onCreated }: CreateEventFormProps) {
  const { create } = useAuth()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat>('single-elimination')
  const [bracketSize, setBracketSize] = useState(8)
  /** 人数输入框的原始文本；单败允许任意 4–32，逐字符输入期间不想改名单 */
  const [sizeDraft, setSizeDraft] = useState('8')
  const [defaultBO, setDefaultBO] = useState(3)
  const [grandFinalBO, setGrandFinalBO] = useState(5)
  const [teamNames, setTeamNames] = useState<string[]>(() => resizeTeamNames([], 8))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function applySize(next: number) {
    setBracketSize(next)
    setSizeDraft(String(next))
    setTeamNames((current) => resizeTeamNames(current, next))
  }

  function changeFormat(next: TournamentFormat) {
    setFormat(next)
    // 双败只认 4/8/16/32，当前规模不合规时退回 8
    if (next === 'double-elimination' && !DOUBLE_ELIM_SIZES.includes(bracketSize)) {
      applySize(8)
    }
  }

  function commitSizeDraft(raw: string) {
    setSizeDraft(raw)
    const n = Number(raw)
    if (Number.isInteger(n) && n >= MIN_BRACKET_SIZE && n <= MAX_BRACKET_SIZE) {
      setBracketSize(n)
      setTeamNames((current) => resizeTeamNames(current, n))
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const input: NewEventInput = {
      id: id.trim(),
      name: name.trim(),
      format,
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
          <span className="text-muted">赛制</span>
          <select
            name="format"
            value={format}
            onChange={(e) => changeFormat(e.target.value as TournamentFormat)}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted">
            {format === 'double-elimination' ? '签表规模' : '参赛人数'}
          </span>
          {format === 'double-elimination' ? (
            <select
              name="bracket-size"
              value={bracketSize}
              onChange={(e) => applySize(Number(e.target.value))}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            >
              {DOUBLE_ELIM_SIZES.map((s) => (
                <option key={s} value={s}>{`${s} 人`}</option>
              ))}
            </select>
          ) : (
            <input
              name="bracket-size"
              type="number"
              min={MIN_BRACKET_SIZE}
              max={MAX_BRACKET_SIZE}
              value={sizeDraft}
              placeholder="28"
              onChange={(e) => commitSizeDraft(e.target.value)}
              onBlur={(e) => commitSizeDraft(e.target.value)}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            />
          )}
          {format === 'single-elimination' ? (
            <span className="block text-[11px] text-muted">
              {`${MIN_BRACKET_SIZE}–${MAX_BRACKET_SIZE} 人，非 2 的幂会产生轮空；签位与轮空归属由创建时的随机抽签决定`}
            </span>
          ) : null}
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
          {format === 'single-elimination'
            ? `选手名单（共 ${bracketSize} 人；创建时随机抽签落位，输入顺序不影响签位）`
            : `选手名单（顺序即种子顺序，1 号种子在最上；共 ${bracketSize} 人）`}
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
