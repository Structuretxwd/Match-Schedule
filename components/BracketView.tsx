'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { DerivedBracket } from '@/lib/bracket/advance'
import { CARD_W, layoutBracket } from '@/lib/bracket/layout'
import { BRACKET_COLOR, connectorViews } from '@/lib/view'
import { Connectors } from './Connectors'
import { MatchCard } from './MatchCard'

const ZOOM_MIN = 0.1
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1
/** 滚动容器的左右内边距（p-3），量可视宽度时要扣掉 */
const PAD_PX = 24
/** 位移不超过这个距离仍按点击处理，避免手抖吃掉卡片点击 */
const DRAG_THRESHOLD = 4

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
  /** null 表示「适应宽度」，跟随容器宽度自动计算；手动缩放后变成固定倍数 */
  const [manualZoom, setManualZoom] = useState<number | null>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const layout = useMemo(() => layoutBracket(derived, bracketSize), [derived, bracketSize])
  const connectors = useMemo(() => connectorViews(layout, derived), [layout, derived])

  // 量出可视宽度；窗口缩放时重算，使整张图始终横向铺满而不出滚动条
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => setAvailableWidth(Math.max(0, el.clientWidth - PAD_PX))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 首次渲染（含 SSR）还没有量到宽度，先按 100% 出，挂载后立刻贴合容器
  const fitZoom = availableWidth > 0 ? Math.floor((availableWidth / layout.width) * 1000) / 1000 : 1
  const zoom = manualZoom ?? fitZoom

  const zoomBy = (delta: number) => setManualZoom(clampZoom(zoom + delta))

  // 只有放大到超出容器时拖拽才有意义，否则按住鼠标却纹丝不动反而费解
  const canPan = availableWidth > 0 && layout.width * zoom > availableWidth + 1
  const dragRef = useRef<{
    x: number
    y: number
    left: number
    pageY: number
    moved: boolean
  } | null>(null)
  /** 拖拽结束后紧跟的那次 click 要吞掉，否则会误开详情弹窗 */
  const swallowClickRef = useRef(false)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 触摸端交给浏览器原生滚动与双指缩放，这里只接管鼠标和手写笔
    if (!canPan || e.pointerType === 'touch' || e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    swallowClickRef.current = false
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      pageY: window.scrollY,
      moved: false,
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const el = scrollRef.current
    if (!drag || !el) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return
    if (!drag.moved) {
      // 确认是拖拽而非点击之后才接管指针。若在 pointerdown 就 capture，
      // mouseup 会被重定向到容器，click 的公共祖先随之变成容器，卡片点击就再也收不到了。
      el.setPointerCapture(e.pointerId)
      drag.moved = true
      setDragging(true)
    }
    // 横向挪容器自身，纵向挪整页（容器不限制高度，纵向滚动条在浏览器窗口上）
    el.scrollLeft = drag.left - dx
    window.scrollTo(0, drag.pageY - dy)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    if (dragRef.current?.moved) swallowClickRef.current = true
    dragRef.current = null
    setDragging(false)
  }

  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!swallowClickRef.current) return
    swallowClickRef.current = false
    e.stopPropagation()
    e.preventDefault()
  }

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
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>实线 = 晋级</span>
          <span>虚线 = 掉落至败者组</span>
          <span>点击卡片查看详情</span>
          {canPan ? <span>按住拖动平移</span> : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomBy(-ZOOM_STEP)}
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
            onClick={() => zoomBy(ZOOM_STEP)}
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
            aria-label="放大"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setManualZoom(null)}
            className="h-6 rounded border border-line px-2 text-xs text-muted hover:text-fg"
          >
            适应宽度
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={`overflow-x-auto p-3 ${
          canPan ? (dragging ? 'cursor-grabbing select-none' : 'cursor-grab') : ''
        }`}
      >
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
