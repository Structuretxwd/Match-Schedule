'use client'

import { useMemo, useState } from 'react'
import type { DerivedBracket } from '@/lib/bracket/advance'
import { CARD_W, layoutBracket } from '@/lib/bracket/layout'
import { BRACKET_COLOR, connectorViews } from '@/lib/view'
import { Connectors } from './Connectors'
import { MatchCard } from './MatchCard'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

export type BracketViewProps = {
  derived: DerivedBracket
  bracketSize: 4 | 8 | 16 | 32
  selectedMatchId: string | null
  onSelectMatch: (matchId: string) => void
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

export function BracketView({ derived, bracketSize, selectedMatchId, onSelectMatch }: BracketViewProps) {
  const [zoom, setZoom] = useState(1)
  const layout = useMemo(() => layoutBracket(derived, bracketSize), [derived, bracketSize])
  const connectors = useMemo(() => connectorViews(layout, derived), [layout, derived])

  // 列标题贴在每列最上方卡片之上，因此各列标题的纵向位置不同
  const columnHeaders = useMemo(
    () =>
      layout.columns.flatMap((col) => {
        const cards = layout.cards.filter(
          (c) => c.matchId === col.key || c.matchId.startsWith(`${col.key}-`),
        )
        if (cards.length === 0) return []
        return [
          {
            key: col.key,
            label: col.label,
            bracket: col.bracket,
            x: col.x,
            y: Math.min(...cards.map((c) => c.y)) - 18,
          },
        ]
      }),
    [layout],
  )

  return (
    <div className="rounded-lg border border-line bg-base">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>实线 = 晋级</span>
          <span>虚线 = 掉落至败者组</span>
          <span>点击卡片查看详情</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
            aria-label="缩小"
          >
            −
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-muted">
            {`${Math.round(zoom * 100)}%`}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
            aria-label="放大"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="h-6 rounded border border-line px-2 text-xs text-muted hover:text-fg"
          >
            重置
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto p-3">
        <div
          className="relative"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            {layout.sections.map((s) => (
              <div
                key={s.bracket}
                className="absolute rounded-md border-t-2"
                style={{
                  left: 0,
                  top: s.y,
                  width: layout.width,
                  height: s.height,
                  borderColor: BRACKET_COLOR[s.bracket],
                  backgroundColor: `${BRACKET_COLOR[s.bracket]}0d`,
                }}
              />
            ))}

            {columnHeaders.map((h) => (
              <div
                key={h.key}
                className="absolute text-[10px] font-semibold uppercase tracking-wide"
                style={{ left: h.x, top: h.y, width: CARD_W, color: BRACKET_COLOR[h.bracket] }}
              >
                {h.label}
              </div>
            ))}

            <Connectors connectors={connectors} width={layout.width} height={layout.height} />

            {layout.cards.map((c) => (
              <div
                key={c.matchId}
                className="absolute"
                style={{ left: c.x, top: c.y, width: c.width, height: c.height }}
              >
                <MatchCard
                  match={derived.byId[c.matchId]}
                  selected={selectedMatchId === c.matchId}
                  onSelect={onSelectMatch}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
