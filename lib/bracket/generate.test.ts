import { describe, expect, it } from 'vitest'
import {
  generateTemplate,
  lbRoundCount,
  seedOrder,
  seRoundCount,
  slotsFor,
  wbRoundCount,
} from './generate'

describe('seedOrder（标准排位顺序）', () => {
  it('2 / 4 / 8 队结果符合预期', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it.each([4, 8, 16, 32])('%i 队：首轮每对种子之和为 n+1', (n) => {
    const o = seedOrder(n)
    for (let i = 0; i < o.length; i += 2) {
      expect(o[i] + o[i + 1]).toBe(n + 1)
    }
  })

  it.each([4, 8, 16, 32])('%i 队：包含 1..n 全部种子且不重复', (n) => {
    const o = seedOrder(n)
    expect([...o].sort((a, b) => a - b)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    )
  })
})

describe('轮次数量', () => {
  it.each([
    [4, 2, 2],
    [8, 3, 4],
    [16, 4, 6],
    [32, 5, 8],
  ])('%i 队：胜者组 %i 轮、败者组 %i 轮', (n, wb, lb) => {
    expect(wbRoundCount(n)).toBe(wb)
    expect(lbRoundCount(n)).toBe(lb)
  })
})

describe('generateTemplate', () => {
  it.each([4, 8, 16, 32])('%i 队：总场次为 2n-2', (n) => {
    expect(generateTemplate(n, 'double-elimination').matches).toHaveLength(2 * n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：败者组场次为 n-2', (n) => {
    const lb = generateTemplate(n, 'double-elimination').matches.filter((m) => m.bracket === 'LB')
    expect(lb).toHaveLength(n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：胜者组每轮场次数为 n/2^r', (n) => {
    const t = generateTemplate(n, 'double-elimination')
    for (let r = 1; r <= wbRoundCount(n); r++) {
      const count = t.matches.filter((m) => m.bracket === 'WB' && m.round === r).length
      expect(count).toBe(n / 2 ** r)
    }
  })

  it.each([4, 8, 16, 32])('%i 队：恰好一场总决赛', (n) => {
    const gf = generateTemplate(n, 'double-elimination').matches.filter((m) => m.bracket === 'GF')
    expect(gf).toHaveLength(1)
    expect(gf[0].id).toBe('GF')
  })

  it.each([4, 8, 16, 32])('%i 队：matchId 唯一', (n) => {
    const ids = generateTemplate(n, 'double-elimination').matches.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([4, 8, 16, 32])('%i 队：所有引用都指向更早的场次（拓扑有序）', (n) => {
    const seen = new Set<string>()
    for (const m of generateTemplate(n, 'double-elimination').matches) {
      for (const src of [m.sourceA, m.sourceB]) {
        if (src.kind !== 'seed') expect(seen.has(src.matchId)).toBe(true)
      }
      seen.add(m.id)
    }
  })

  it('4 队：首轮对位为 1v4、2v3', () => {
    const t = generateTemplate(4, 'double-elimination')
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceA).toEqual({ kind: 'seed', seed: 1 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceB).toEqual({ kind: 'seed', seed: 4 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceA).toEqual({ kind: 'seed', seed: 2 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceB).toEqual({ kind: 'seed', seed: 3 })
  })

  it('8 队：败者组第一轮来自胜者组第一轮败者', () => {
    const lb1 = generateTemplate(8, 'double-elimination').matches.find((m) => m.id === 'LB-R1-M1')!
    expect(lb1.sourceA).toEqual({ kind: 'loser', matchId: 'WB-R1-M1' })
    expect(lb1.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R1-M2' })
  })

  it('8 队：败者组第二轮为 LB 胜者 vs WB 第二轮败者', () => {
    const lb2 = generateTemplate(8, 'double-elimination').matches.find((m) => m.id === 'LB-R2-M1')!
    expect(lb2.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R1-M1' })
    expect(lb2.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R2-M1' })
  })

  it('8 队：败者组第三轮为两个 LB 胜者互相对阵', () => {
    const lb3 = generateTemplate(8, 'double-elimination').matches.find((m) => m.id === 'LB-R3-M1')!
    expect(lb3.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R2-M1' })
    expect(lb3.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R2-M2' })
  })

  it('8 队：败者组第四轮为 LB 胜者 vs 胜者组决赛败者', () => {
    const lb4 = generateTemplate(8, 'double-elimination').matches.find((m) => m.id === 'LB-R4-M1')!
    expect(lb4.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R3-M1' })
    expect(lb4.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R3-M1' })
  })

  it('8 队：总决赛为两个分区冠军', () => {
    const gf = generateTemplate(8, 'double-elimination').matches.find((m) => m.id === 'GF')!
    expect(gf.sourceA).toEqual({ kind: 'winner', matchId: 'WB-R3-M1' })
    expect(gf.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R4-M1' })
  })
})

describe('slotsFor / seRoundCount', () => {
  it('人数本身是 2 的幂时补签等于人数', () => {
    expect(slotsFor(4)).toBe(4)
    expect(slotsFor(32)).toBe(32)
  })

  it('非 2 的幂向上补齐到下一个 2 的幂', () => {
    expect(slotsFor(5)).toBe(8)
    expect(slotsFor(28)).toBe(32)
  })

  it('总轮数由补签后的签位数决定', () => {
    expect(seRoundCount(4)).toBe(2)
    expect(seRoundCount(5)).toBe(3)
    expect(seRoundCount(28)).toBe(5)
  })
})

describe('generateTemplate（单败）', () => {
  it.each([4, 8, 16, 32])('%i 人：总场次为 n-1', (n) => {
    expect(generateTemplate(n, 'single-elimination').matches).toHaveLength(n - 1)
  })

  it.each([5, 6, 7, 12, 28])('%i 人：补签后总场次仍为 n-1', (n) => {
    expect(generateTemplate(n, 'single-elimination').matches).toHaveLength(n - 1)
  })

  it.each([5, 6, 7, 12, 28])('%i 人：没有败者组场次', (n) => {
    const t = generateTemplate(n, 'single-elimination')
    expect(t.rounds.lb).toBe(0)
    expect(t.matches.some((m) => m.bracket === 'LB')).toBe(false)
  })

  it('没有任何轮空比赛（空签位的种子直接落位，不生成比赛）', () => {
    for (const n of [5, 6, 7, 12, 28]) {
      const t = generateTemplate(n, 'single-elimination')
      expect(t.matches.filter((m) => m.bracket === 'WB' && m.round === 1)).toHaveLength(
        n - slotsFor(n) / 2,
      )
    }
  })

  it('28 人：12 + 8 + 4 + 2 场淘汰赛与 1 场决赛', () => {
    const t = generateTemplate(28, 'single-elimination')
    expect(t.rounds.wb).toBe(4)
    expect(t.matches.filter((m) => m.bracket === 'WB' && m.round === 1)).toHaveLength(12)
    expect(t.matches.filter((m) => m.bracket === 'WB' && m.round === 2)).toHaveLength(8)
    expect(t.matches.filter((m) => m.bracket === 'WB' && m.round === 3)).toHaveLength(4)
    expect(t.matches.filter((m) => m.bracket === 'WB' && m.round === 4)).toHaveLength(2)
    expect(t.matches.filter((m) => m.bracket === 'GF')).toHaveLength(1)
    expect(t.matches).toHaveLength(27)
  })

  it('28 人：种子 1–4 首轮轮空，直接成为第二轮来源', () => {
    const t = generateTemplate(28, 'single-elimination')
    const r2 = t.matches.filter((m) => m.bracket === 'WB' && m.round === 2)
    const seedsInR2 = r2.flatMap((m) => [m.sourceA, m.sourceB]).filter((s) => s.kind === 'seed')
    expect(seedsInR2.map((s) => (s.kind === 'seed' ? s.seed : -1)).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4,
    ])
  })

  it('5 人：首轮只有 4v5 一场，其余三人轮空', () => {
    const t = generateTemplate(5, 'single-elimination')
    const r1 = t.matches.filter((m) => m.bracket === 'WB' && m.round === 1)
    expect(r1).toHaveLength(1)
    expect([r1[0].sourceA, r1[0].sourceB]).toEqual([
      { kind: 'seed', seed: 4 },
      { kind: 'seed', seed: 5 },
    ])
  })

  it.each([4, 5, 28, 32])('%i 人：matchId 唯一且拓扑有序', (n) => {
    const seen = new Set<string>()
    const ids = new Set<string>()
    for (const m of generateTemplate(n, 'single-elimination').matches) {
      expect(ids.has(m.id)).toBe(false)
      ids.add(m.id)
      for (const src of [m.sourceA, m.sourceB]) {
        if (src.kind !== 'seed') expect(seen.has(src.matchId)).toBe(true)
      }
      seen.add(m.id)
    }
  })

  it.each([4, 5, 28, 32])('%i 人：决赛是最后一场且恰有一场', (n) => {
    const t = generateTemplate(n, 'single-elimination')
    const gf = t.matches.filter((m) => m.bracket === 'GF')
    expect(gf).toHaveLength(1)
    expect(gf[0].id).toBe('GF')
  })
})
