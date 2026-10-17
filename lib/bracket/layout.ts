import type { DerivedBracket } from './advance'
import { GF_ID, lbMatchCount, lbRoundCount, seRoundCount, slotsFor, wbRoundCount } from './generate'

export const CARD_W = 208
export const CARD_H = 68
export const COL_GAP = 56
export const ROW_GAP = 20
export const SECTION_GAP = 56
export const HEADER_H = 34
export const PAD = 20

const COL_W = CARD_W + COL_GAP
const ROW_H = CARD_H + ROW_GAP

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

/** 单败只有一条命：末轮即半决赛，前面各轮按序号称呼 */
function seWbLabel(round: number, wbRounds: number): string {
  return round === wbRounds ? '半决赛' : `第 ${round} 轮`
}

function elbowPath(from: LayoutCard, to: LayoutCard): string {
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const mx = x2 - COL_GAP / 2
  return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`
}

/** 卡片、列标题、分区与连接线的装配逻辑两种赛制完全一致 */
function assemble(
  cards: LayoutCard[],
  columns: LayoutColumn[],
  sections: LayoutSection[],
  derived: DerivedBracket,
): BracketLayout {
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

export function layoutBracket(derived: DerivedBracket): BracketLayout {
  return derived.format === 'single-elimination'
    ? layoutSingleElim(derived)
    : layoutDoubleElim(derived)
}

function layoutDoubleElim(derived: DerivedBracket): BracketLayout {
  const bracketSize = derived.bracketSize
  const k = wbRoundCount(bracketSize)
  const lbRounds = lbRoundCount(bracketSize)
  const wbHeight = (bracketSize / 2) * ROW_H - ROW_GAP
  const lbHeight = lbMatchCount(bracketSize, 1) * ROW_H - ROW_GAP

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
          ? (index - 1) * ROW_H
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
        rel = (index - 1) * ROW_H
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

  return assemble(cards, columns, sections, derived)
}

/**
 * 单败布局：只有一条主线，从左到右排到底，最右一列是决赛。
 * 末轮轮空（4 人时首轮即末轮）会在下一轮留下空位，
 * 因此纵向位置按完整签位网格计算，轮空处留白，下游才能落在两个上游的中点。
 */
function layoutSingleElim(derived: DerivedBracket): BracketLayout {
  const bracketSize = derived.bracketSize
  const slots = slotsFor(bracketSize)
  const wbRounds = Math.max(1, seRoundCount(bracketSize) - 1)
  const wbY0 = HEADER_H

  // 签位网格：第 1 轮的每个签位占一行；轮空不画卡片，但同样占住这一行
  const nodes = new Map<string, number>()
  const key = (round: number, index: number) => `${round}-${index}`
  for (let index = 1; index <= slots / 2; index++) {
    nodes.set(key(1, index), (index - 1) * ROW_H)
  }
  for (let round = 2; round <= wbRounds; round++) {
    for (let index = 1; index <= slots / 2 ** round; index++) {
      nodes.set(
        key(round, index),
        (nodes.get(key(round - 1, index * 2 - 1))! + nodes.get(key(round - 1, index * 2))!) / 2,
      )
    }
  }

  const cards: LayoutCard[] = []
  for (const m of derived.matches) {
    if (m.bracket !== 'WB') continue
    cards.push({
      matchId: m.id,
      x: PAD + (m.round - 1) * COL_W,
      y: wbY0 + nodes.get(key(m.round, m.index))!,
      width: CARD_W,
      height: CARD_H,
    })
  }

  const gfX = PAD + wbRounds * COL_W
  cards.push({
    matchId: GF_ID,
    x: gfX,
    y: wbY0 + (nodes.get(key(wbRounds, 1))! + nodes.get(key(wbRounds, 2))!) / 2,
    width: CARD_W,
    height: CARD_H,
  })

  const columns: LayoutColumn[] = []
  for (let round = 1; round <= wbRounds; round++) {
    columns.push({
      key: `WB-R${round}`,
      bracket: 'WB',
      round,
      label: seWbLabel(round, wbRounds),
      x: PAD + (round - 1) * COL_W,
    })
  }
  columns.push({ key: GF_ID, bracket: 'GF', round: 1, label: '决赛', x: gfX })

  const sections: LayoutSection[] = [
    {
      bracket: 'WB',
      label: '淘汰赛 Single Elimination',
      y: wbY0 - HEADER_H,
      height: (slots / 2) * ROW_H - ROW_GAP + HEADER_H,
    },
  ]

  return assemble(cards, columns, sections, derived)
}
