import type { BracketKind, TournamentFormat } from '@/lib/data/schema'

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

/** 单败要把人数补齐到下一个 2 的幂；人数本身就是 2 的幂时等于人数 */
export function slotsFor(bracketSize: number): number {
  let slots = 1
  while (slots < bracketSize) slots *= 2
  return slots
}

export function wbRoundCount(bracketSize: number): number {
  return Math.log2(bracketSize)
}

export function lbRoundCount(bracketSize: number): number {
  return 2 * Math.log2(bracketSize) - 2
}

/** 单败的总轮数（含决赛），由补签后的签位数决定 */
export function seRoundCount(bracketSize: number): number {
  return Math.log2(slotsFor(bracketSize))
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

export function generateTemplate(bracketSize: number, format: TournamentFormat): BracketTemplate {
  return format === 'single-elimination'
    ? generateSingleElim(bracketSize)
    : generateDoubleElim(bracketSize)
}

export function generateDoubleElim(bracketSize: number): BracketTemplate {
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

/**
 * 单败：把人数补齐到下一个 2 的幂，多出来的签位由高种子首轮轮空。
 * 轮空不产生比赛——该种子直接落位到下一轮的对应签位，所以场次数恒为 n-1。
 * 最后一轮是决赛，标记为 GF，与双败的总决赛共用同一条渲染路径。
 */
export function generateSingleElim(bracketSize: number): BracketTemplate {
  const slots = slotsFor(bracketSize)
  /** 总轮数含决赛；决赛单独成场，所以胜者组只有前面这些轮 */
  const wbRounds = seRoundCount(bracketSize) - 1
  const order = seedOrder(slots)
  const matches: MatchTemplate[] = []

  // 第 1 轮：签位两两配对。两个签位都有人才是真打；
  // 只有一个签位有人，说明另一方是空签，该种子轮空，直接进入下一轮。
  const byeAt = new Map<number, SlotSource>()
  for (let index = 1; index <= slots / 2; index++) {
    const seedA = order[(index - 1) * 2]
    const seedB = order[(index - 1) * 2 + 1]
    const hasA = seedA <= bracketSize
    const hasB = seedB <= bracketSize
    if (hasA && hasB) {
      matches.push({
        id: wbMatchId(1, index),
        bracket: 'WB',
        round: 1,
        index,
        sourceA: { kind: 'seed', seed: seedA },
        sourceB: { kind: 'seed', seed: seedB },
      })
    } else {
      // 空签只会有一侧，两侧都空意味着签位数还没补够
      byeAt.set(index, { kind: 'seed', seed: hasA ? seedA : seedB })
    }
  }

  /** 第 round 轮第 index 个签位晋级出来的来源：轮空的种子直接落位，其余取该场胜者 */
  const advanceFrom = (round: number, index: number): SlotSource =>
    (round === 1 ? byeAt.get(index) : undefined) ?? {
      kind: 'winner',
      matchId: wbMatchId(round, index),
    }

  for (let round = 2; round <= wbRounds; round++) {
    for (let index = 1; index <= slots / 2 ** round; index++) {
      matches.push({
        id: wbMatchId(round, index),
        bracket: 'WB',
        round,
        index,
        sourceA: advanceFrom(round - 1, index * 2 - 1),
        sourceB: advanceFrom(round - 1, index * 2),
      })
    }
  }

  // 决赛（单场决胜）。4 人时胜者组只有一轮，那里的轮空同样要在决赛侧生效。
  matches.push({
    id: GF_ID,
    bracket: 'GF',
    round: 1,
    index: 1,
    sourceA: advanceFrom(wbRounds, 1),
    sourceB: advanceFrom(wbRounds, 2),
  })

  return { bracketSize, rounds: { wb: wbRounds, lb: 0 }, matches }
}
