'use client'

import { useState } from 'react'
import { winsNeeded, validateScore } from '@/lib/bracket/validate'
import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { BRACKET_COLOR, bracketLabel, formatDateTime, fromDateTimeInput, nextStops, slotLabel, statusLabel, toDateTimeInput } from '@/lib/view'
import type { PendingChange } from '@/lib/useEventData'
import { useAuth } from './auth/AuthProvider'

export type MatchDetailDialogProps = {
  match: DerivedMatch
  derived: DerivedBracket
  onClose: () => void
  /** 把改动放进本地暂存；不写仓库，等页面上的「全部提交」统一提交 */
  onStage: (matchId: string, patch: PendingChange['patch']) => void
  /** 该场比赛已有的暂存内容，用于提示 */
  staged?: PendingChange['patch']
}

function ScoreRow({
  name,
  seed,
  score,
  won,
}: {
  name: string
  seed: number | null
  score: number | null
  won: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-panel-hi px-3 py-2">
      <span className="w-5 text-[11px] text-muted">{seed ?? '–'}</span>
      <span className={`flex-1 truncate text-sm ${won ? 'font-semibold text-fg' : 'text-muted'}`}>
        {name}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${won ? 'text-wb' : 'text-muted'}`}>
        {score ?? '–'}
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function ScoreEditor({
  match,
  staged,
  onStage,
}: {
  match: DerivedMatch
  staged?: PendingChange['patch']
  onStage: (matchId: string, patch: PendingChange['patch']) => void
}) {
  const { isAdmin } = useAuth()
  const [scoreA, setScoreA] = useState(match.scoreA === null ? '' : String(match.scoreA))
  const [scoreB, setScoreB] = useState(match.scoreB === null ? '' : String(match.scoreB))
  const [timeDraft, setTimeDraft] = useState(() => toDateTimeInput(match.scheduledAt))
  const [error, setError] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <p className="rounded border border-line bg-panel-hi px-3 py-2 text-[11px] text-muted">
        只有登录后的管理员可以录入或修改比分。
      </p>
    )
  }

  function toScore(raw: string): number | null {
    const trimmed = raw.trim()
    return trimmed === '' ? null : Number(trimmed)
  }

  function stageScore(next: { scoreA: number | null; scoreB: number | null; live: boolean }) {
    const check = validateScore(match.bo, next.scoreA, next.scoreB)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setError(null)
    onStage(match.id, { scoreA: next.scoreA, scoreB: next.scoreB, live: next.live })
  }

  function stageTime() {
    const trimmed = timeDraft.trim()
    const next = trimmed === '' ? null : fromDateTimeInput(trimmed)
    // 留空是「清除时间」，非法格式才报错
    if (trimmed !== '' && next === null) {
      setError('时间格式不正确，请用日期时间选择器重新选择')
      return
    }
    setError(null)
    onStage(match.id, { scheduledAt: next })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">录入比分</h3>
        <span className="text-[11px] text-muted">{`BO${match.bo} · 先赢 ${winsNeeded(match.bo)} 局`}</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label="甲队局分"
          inputMode="numeric"
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          className="w-14 rounded border border-line bg-base px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-wb"
        />
        <span className="text-muted">:</span>
        <input
          aria-label="乙队局分"
          inputMode="numeric"
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          className="w-14 rounded border border-line bg-base px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-wb"
        />
        <button
          type="button"
          onClick={() => stageScore({ scoreA: toScore(scoreA), scoreB: toScore(scoreB), live: false })}
          className="ml-auto rounded border border-wb px-3 py-1 text-xs text-wb hover:bg-wb/10"
        >
          暂存
        </button>
      </div>

      {/* DerivedMatch 没有 live 字段：live 已被 deriveStatus 折算进 status（与 MatchCard 的判定一致） */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => stageScore({ scoreA: null, scoreB: null, live: false })}
          className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg"
        >
          清除比分
        </button>
        <button
          type="button"
          onClick={() =>
            stageScore({
              scoreA: match.scoreA,
              scoreB: match.scoreB,
              live: match.status !== 'live',
            })
          }
          className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg"
        >
          {match.status === 'live' ? '取消「进行中」' : '标记「进行中」'}
        </button>
      </div>

      <div className="space-y-2 border-t border-line pt-3">
        <h3 className="text-xs font-medium">开始时间</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            aria-label="开始时间"
            value={timeDraft}
            onChange={(e) => setTimeDraft(e.target.value)}
            className="rounded border border-line bg-base px-2 py-1 text-xs outline-none focus:border-wb"
          />
          <button
            type="button"
            onClick={stageTime}
            className="rounded border border-wb px-3 py-1 text-xs text-wb hover:bg-wb/10"
          >
            暂存时间
          </button>
          <span className="text-[11px] text-muted">{'留空 = 时间待定（按北京时间显示）'}</span>
        </div>
      </div>

      {staged ? (
        <p className="text-[11px] text-wb">{'本场已有暂存改动，点页面上的「全部提交」后统一写入。'}</p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <p className="text-[11px] leading-relaxed text-muted">
        {'改动先存在本地草稿里并立即预览，点页面上的「全部提交」会合成一次写入 GitHub 仓库，等 Actions 重建后对所有人生效。'}
      </p>
    </div>
  )
}

export function MatchDetailDialog({ match, derived, onClose, onStage, staged }: MatchDetailDialogProps) {
  const stops = nextStops(derived, match.id)
  const winnerStop = stops.find((s) => s.kind === 'winner')
  const loserStop = stops.find((s) => s.kind === 'loser')
  const isFinal = match.bracket === 'GF'
  const done = match.status === 'finished'

  const winnerTarget = winnerStop ? winnerStop.matchId : isFinal ? '冠军' : '—'
  const loserTarget = loserStop ? loserStop.matchId : isFinal ? '亚军' : '淘汰'
  const title = `${bracketLabel(match.bracket, derived.format)} · 第 ${match.round} 轮 · 第 ${match.index} 场`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-lg border border-line bg-panel sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BRACKET_COLOR[match.bracket] }}
            />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <ScoreRow
              name={match.teamA?.name ?? slotLabel(match.sourceA)}
              seed={match.teamA?.seed ?? null}
              score={match.scoreA}
              won={done && match.teamA !== null && match.winnerId === match.teamA.id}
            />
            <ScoreRow
              name={match.teamB?.name ?? slotLabel(match.sourceB)}
              seed={match.teamB?.seed ?? null}
              score={match.scoreB}
              won={done && match.teamB !== null && match.winnerId === match.teamB.id}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Field label="状态" value={statusLabel(match.status)} />
            <Field label="赛制" value={`BO${match.bo}`} />
            <Field label="开始时间" value={formatDateTime(match.scheduledAt)} />
            <Field label="裁判" value={match.referee ?? '—'} />
            <div className="col-span-2 min-w-0">
              <dt className="text-muted">直播</dt>
              <dd className="truncate">
                {match.streamUrl ? (
                  <a href={match.streamUrl} target="_blank" rel="noreferrer" className="text-wb hover:underline">
                    {match.streamUrl}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">备注</dt>
              <dd className="whitespace-pre-wrap">{match.note ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">去向</dt>
              <dd className="space-y-0.5">
                <div>{`胜者 → ${winnerTarget}`}</div>
                <div>{`败者 → ${loserTarget}`}</div>
              </dd>
            </div>
          </dl>
        </div>

        <footer className="border-t border-line px-4 py-3">
          <ScoreEditor match={match} staged={staged} onStage={onStage} />
        </footer>
      </div>
    </div>
  )
}
