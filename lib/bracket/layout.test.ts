import { describe, expect, it } from 'vitest'
import { deriveBracket } from './advance'
import { generateTemplate } from './generate'
import { CARD_H, layoutBracket } from './layout'
import type { TournamentEvent } from '@/lib/data/schema'

function makeEvent(n: 4 | 8 | 16 | 32): TournamentEvent {
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: null,
      scoreB: null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('layoutBracket', () => {
  it.each([4, 8, 16, 32] as const)('%i 队：每场比赛都有坐标', (n) => {
    const ev = makeEvent(n)
    const layout = layoutBracket(deriveBracket(ev), n)
    expect(layout.cards).toHaveLength(2 * n - 2)
  })

  it.each([4, 8, 16, 32] as const)('%i 队：坐标均为有限非负数', (n) => {
    const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
    for (const c of layout.cards) {
      expect(Number.isFinite(c.x)).toBe(true)
      expect(Number.isFinite(c.y)).toBe(true)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('同一列内卡片不重叠（纵向间距不小于卡高）', () => {
    for (const n of [4, 8, 16, 32] as const) {
      const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
      const byColumn = new Map<number, { y: number }[]>()
      for (const c of layout.cards) {
        const list = byColumn.get(c.x) ?? []
        list.push(c)
        byColumn.set(c.x, list)
      }
      for (const list of byColumn.values()) {
        const ys = list.map((c) => c.y).sort((a, b) => a - b)
        for (let i = 1; i < ys.length; i++) {
          expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(CARD_H)
        }
      }
    }
  })

  it('胜者组在上、败者组在下', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const wbBottom = Math.max(
      ...layout.cards.filter((c) => c.matchId.startsWith('WB')).map((c) => c.y + CARD_H),
    )
    const lbTop = Math.min(
      ...layout.cards.filter((c) => c.matchId.startsWith('LB')).map((c) => c.y),
    )
    expect(lbTop).toBeGreaterThan(wbBottom)
  })

  it('总决赛在最右列', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const gf = layout.cards.find((c) => c.matchId === 'GF')!
    const maxOther = Math.max(
      ...layout.cards.filter((c) => c.matchId !== 'GF').map((c) => c.x),
    )
    expect(gf.x).toBeGreaterThan(maxOther)
  })

  it('败者组第一轮与胜者组第二轮对齐', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const wbR2 = layout.cards.find((c) => c.matchId === 'WB-R2-M1')!
    const lbR1 = layout.cards.find((c) => c.matchId === 'LB-R1-M1')!
    expect(lbR1.x).toBe(wbR2.x)
  })

  it('胜者组每轮卡片纵向居中于两个上游之间', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const a = layout.cards.find((c) => c.matchId === 'WB-R1-M1')!
    const b = layout.cards.find((c) => c.matchId === 'WB-R1-M2')!
    const target = layout.cards.find((c) => c.matchId === 'WB-R2-M1')!
    expect(target.y).toBeCloseTo((a.y + b.y) / 2, 6)
  })

  it('连接线数量等于非种子来源数量', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    // 8 队：28 个来源位减去 8 个种子位 = 20
    expect(layout.connectors).toHaveLength(20)
  })

  it('连接线均从左侧指向右侧', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const byId = new Map(layout.cards.map((c) => [c.matchId, c]))
    for (const conn of layout.connectors) {
      const from = byId.get(conn.fromMatchId)!
      const to = byId.get(conn.toMatchId)!
      expect(from.x).toBeLessThan(to.x)
    }
  })

  it('连接线 path 以 M 开头且端点落在卡片边缘', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const byId = new Map(layout.cards.map((c) => [c.matchId, c]))
    for (const conn of layout.connectors) {
      const from = byId.get(conn.fromMatchId)!
      const to = byId.get(conn.toMatchId)!
      const start = `M ${from.x + from.width} ${from.y + from.height / 2}`
      expect(conn.path.startsWith(start)).toBe(true)
      expect(conn.path.endsWith(`H ${to.x}`)).toBe(true)
    }
  })

  it('输出整体宽高能容纳所有卡片', () => {
    for (const n of [4, 8, 16, 32] as const) {
      const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
      const right = Math.max(...layout.cards.map((c) => c.x + c.width))
      const bottom = Math.max(...layout.cards.map((c) => c.y + c.height))
      expect(layout.width).toBeGreaterThanOrEqual(right)
      expect(layout.height).toBeGreaterThanOrEqual(bottom)
    }
  })

  it('包含胜者组、败者组、总决赛三段列标题', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    expect(layout.columns.some((c) => c.label.includes('胜者组'))).toBe(true)
    expect(layout.columns.some((c) => c.label.includes('败者组'))).toBe(true)
    expect(layout.columns.some((c) => c.label === '总决赛')).toBe(true)
  })

  it('分区标签存在且下标正确', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    expect(layout.sections.map((s) => s.bracket)).toEqual(['WB', 'LB'])
    expect(layout.sections[0].label).toContain('胜者组')
    expect(layout.sections[1].label).toContain('败者组')
  })
})
