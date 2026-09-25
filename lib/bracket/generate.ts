import type { BracketKind } from '@/lib/data/schema'

export type SlotSource =
  | { kind: 'seed'; seed: number }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string }

export type MatchTemplate = {
  id: string
  bracket: BracketKind
  round: number
  index: number
  sourceA: SlotSource
  sourceB: SlotSource
}

export type BracketTemplate = {
  bracketSize: number
  rounds: { wb: number; lb: number }
  matches: MatchTemplate[]
}

export const GF_ID = 'GF'

export function wbRoundCount(bracketSize: number): number {
  return Math.log2(bracketSize)
}

export function lbRoundCount(bracketSize: number): number {
  return 2 * Math.log2(bracketSize) - 2
}

export function wbMatchId(round: number, index: number): string {
  return `WB-R${round}-M${index}`
}

export function lbMatchId(round: number, index: number): string {
  return `LB-R${round}-M${index}`
}

/**
 * 标准排位顺序：order(1) = [1]；order(2n) 由 order(n) 的每项 x 展开为 [x, 2n+1-x]。
 * 保证首轮每对种子之和为 n+1，高种子在后续轮次相遇。
 */
export function seedOrder(bracketSize: number): number[] {
  let order = [1]
  let size = 2
  while (size <= bracketSize) {
    const next: number[] = []
    for (const x of order) next.push(x, size + 1 - x)
    order = next
    size *= 2
  }
  return order
}

/** 败者组第 round 轮的场次数：r=1 为 n/4；偶数轮与上一轮相同；奇数轮（≥3）减半 */
export function lbMatchCount(bracketSize: number, round: number): number {
  let count = bracketSize / 4
  for (let r = 2; r <= round; r++) {
    if (r % 2 !== 0) count /= 2
  }
  return count
}

export function generateTemplate(bracketSize: number): BracketTemplate {
  const k = wbRoundCount(bracketSize)
  const lbRounds = lbRoundCount(bracketSize)
  const matches: MatchTemplate[] = []

  // 胜者组
  const order = seedOrder(bracketSize)
  for (let round = 1; round <= k; round++) {
    const count = bracketSize / 2 ** round
    for (let index = 1; index <= count; index++) {
      const sourceA: SlotSource =
        round === 1
          ? { kind: 'seed', seed: order[(index - 1) * 2] }
          : { kind: 'winner', matchId: wbMatchId(round - 1, index * 2 - 1) }
      const sourceB: SlotSource =
        round === 1
          ? { kind: 'seed', seed: order[(index - 1) * 2 + 1] }
          : { kind: 'winner', matchId: wbMatchId(round - 1, index * 2) }
      matches.push({ id: wbMatchId(round, index), bracket: 'WB', round, index, sourceA, sourceB })
    }
  }

  // 败者组
  for (let round = 1; round <= lbRounds; round++) {
    const count = lbMatchCount(bracketSize, round)
    for (let index = 1; index <= count; index++) {
      let sourceA: SlotSource
      let sourceB: SlotSource
      if (round === 1) {
        sourceA = { kind: 'loser', matchId: wbMatchId(1, index * 2 - 1) }
        sourceB = { kind: 'loser', matchId: wbMatchId(1, index * 2) }
      } else if (round % 2 === 0) {
        sourceA = { kind: 'winner', matchId: lbMatchId(round - 1, index) }
        sourceB = { kind: 'loser', matchId: wbMatchId(round / 2 + 1, index) }
      } else {
        sourceA = { kind: 'winner', matchId: lbMatchId(round - 1, index * 2 - 1) }
        sourceB = { kind: 'winner', matchId: lbMatchId(round - 1, index * 2) }
      }
      matches.push({ id: lbMatchId(round, index), bracket: 'LB', round, index, sourceA, sourceB })
    }
  }

  // 总决赛（单场决胜，不采用重置规则）
  matches.push({
    id: GF_ID,
    bracket: 'GF',
    round: 1,
    index: 1,
    sourceA: { kind: 'winner', matchId: wbMatchId(k, 1) },
    sourceB: { kind: 'winner', matchId: lbMatchId(lbRounds, 1) },
  })

  return { bracketSize, rounds: { wb: k, lb: lbRounds }, matches }
}
