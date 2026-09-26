'use client'

import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { BRACKET_COLOR, BRACKET_LABEL, formatDateTime, nextStops, slotLabel, statusLabel } from '@/lib/view'

export type MatchDetailDialogProps = {
  match: DerivedMatch
  derived: DerivedBracket
  onClose: () => void
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

export function MatchDetailDialog({ match, derived, onClose }: MatchDetailDialogProps) {
  const stops = nextStops(derived, match.id)
  const winnerStop = stops.find((s) => s.kind === 'winner')
  const loserStop = stops.find((s) => s.kind === 'loser')
  const isFinal = match.bracket === 'GF'
  const done = match.status === 'finished'

  const winnerTarget = winnerStop ? winnerStop.matchId : isFinal ? '冠军' : '—'
  const loserTarget = loserStop ? loserStop.matchId : isFinal ? '亚军' : '淘汰'
  const title = `${BRACKET_LABEL[match.bracket]} · 第 ${match.round} 轮 · 第 ${match.index} 场`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-lg border border-line bg-panel sm:rounded-lg"
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

        <footer className="border-t border-line px-4 py-3 text-xs text-muted">
          登录管理员后可在此录入比分
        </footer>
      </div>
    </div>
  )
}
