import type { DerivedBracket } from './advance'
import { GF_ID, lbMatchCount, lbRoundCount, wbRoundCount } from './generate'

export const CARD_W = 208
export const CARD_H = 68
export const COL_GAP = 56
export const ROW_GAP = 20
export const SECTION_GAP = 56
export const HEADER_H = 34
export const PAD = 20

const COL_W = CARD_W + COL_GAP

export type LayoutCard = {
  matchId: string
  x: number
  y: number
  width: number
  height: number
}

export type LayoutColumn = {
  key: string
  bracket: 'WB' | 'LB' | 'GF'
  round: number
  label: string
  x: number
}

export type LayoutSection = {
  bracket: 'WB' | 'LB'
  label: string
  y: number
  height: number
}

export type LayoutConnector = {
  fromMatchId: string
  toMatchId: string
  path: string
}

export type BracketLayout = {
  width: number
  height: number
  columns: LayoutColumn[]
  sections: LayoutSection[]
  cards: LayoutCard[]
  connectors: LayoutConnector[]
}

function wbLabel(round: number, wbRounds: number): string {
  return round === wbRounds ? '胜者组决赛' : `胜者组 第 ${round} 轮`
}

function lbLabel(round: number, lbRounds: number): string {
  return round === lbRounds ? '败者组决赛' : `败者组 第 ${round} 轮`
}

function elbowPath(from: LayoutCard, to: LayoutCard): string {
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const mx = x2 - COL_GAP / 2
  return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`
}

export function layoutBracket(derived: DerivedBracket, bracketSize: number): BracketLayout {
  const k = wbRoundCount(bracketSize)
  const lbRounds = lbRoundCount(bracketSize)
  const wbHeight = (bracketSize / 2) * (CARD_H + ROW_GAP) - ROW_GAP
  const lbHeight = lbMatchCount(bracketSize, 1) * (CARD_H + ROW_GAP) - ROW_GAP

  const wbY0 = HEADER_H
  const lbY0 = wbY0 + wbHeight + SECTION_GAP + HEADER_H

  const cards: LayoutCard[] = []
  const relY = new Map<string, number>()

  // 胜者组：第一轮用基础位置，后续轮次取两个上游的中点
  for (let round = 1; round <= k; round++) {
    const count = bracketSize / 2 ** round
    for (let index = 1; index <= count; index++) {
      const id = `WB-R${round}-M${index}`
      const rel =
        round === 1
          ? (index - 1) * (CARD_H + ROW_GAP)
          : (relY.get(`WB-R${round - 1}-M${index * 2 - 1}`)! +
              relY.get(`WB-R${round - 1}-M${index * 2}`)!) /
            2
      relY.set(id, rel)
      cards.push({
        matchId: id,
        x: PAD + (round - 1) * COL_W,
        y: wbY0 + rel,
        width: CARD_W,
        height: CARD_H,
      })
    }
  }

  // 败者组：列位整体右移一列；偶数轮锚定同轮的败者组上游，避免被胜者组坐标带偏
  for (let round = 1; round <= lbRounds; round++) {
    const count = lbMatchCount(bracketSize, round)
    for (let index = 1; index <= count; index++) {
      const id = `LB-R${round}-M${index}`
      let rel: number
      if (round === 1) {
        rel = (index - 1) * (CARD_H + ROW_GAP)
      } else if (round % 2 === 0) {
        rel = relY.get(`LB-R${round - 1}-M${index}`)!
      } else {
        rel =
          (relY.get(`LB-R${round - 1}-M${index * 2 - 1}`)! +
            relY.get(`LB-R${round - 1}-M${index * 2}`)!) /
          2
      }
      relY.set(id, rel)
      cards.push({
        matchId: id,
        x: PAD + round * COL_W,
        y: lbY0 + rel,
        width: CARD_W,
        height: CARD_H,
      })
    }
  }

  const bodyHeight = lbY0 + lbHeight
  const gfX = PAD + (lbRounds + 1) * COL_W
  cards.push({
    matchId: GF_ID,
    x: gfX,
    y: wbY0 + (bodyHeight - wbY0 - CARD_H) / 2,
    width: CARD_W,
    height: CARD_H,
  })

  const columns: LayoutColumn[] = []
  for (let round = 1; round <= k; round++) {
    columns.push({
      key: `WB-R${round}`,
      bracket: 'WB',
      round,
      label: wbLabel(round, k),
      x: PAD + (round - 1) * COL_W,
    })
  }
  for (let round = 1; round <= lbRounds; round++) {
    columns.push({
      key: `LB-R${round}`,
      bracket: 'LB',
      round,
      label: lbLabel(round, lbRounds),
      x: PAD + round * COL_W,
    })
  }
  columns.push({ key: GF_ID, bracket: 'GF', round: 1, label: '总决赛', x: gfX })

  const sections: LayoutSection[] = [
    {
      bracket: 'WB',
      label: '胜者组 Winners Bracket',
      y: wbY0 - HEADER_H,
      height: wbHeight + HEADER_H,
    },
    {
      bracket: 'LB',
      label: '败者组 Losers Bracket',
      y: lbY0 - HEADER_H,
      height: lbHeight + HEADER_H,
    },
  ]

  const cardById = new Map(cards.map((c) => [c.matchId, c]))
  const connectors: LayoutConnector[] = []
  for (const m of derived.matches) {
    for (const src of [m.sourceA, m.sourceB]) {
      if (src.kind === 'seed') continue
      const from = cardById.get(src.matchId)
      const to = cardById.get(m.id)
      if (!from || !to) continue
      connectors.push({
        fromMatchId: src.matchId,
        toMatchId: m.id,
        path: elbowPath(from, to),
      })
    }
  }

  const width = Math.max(...cards.map((c) => c.x + c.width)) + PAD
  const height = Math.max(...cards.map((c) => c.y + c.height)) + PAD

  return { width, height, columns, sections, cards, connectors }
}
