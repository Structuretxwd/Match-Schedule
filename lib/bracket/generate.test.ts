import { describe, expect, it } from 'vitest'
import { generateTemplate, lbRoundCount, seedOrder, wbRoundCount } from './generate'

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
    expect(generateTemplate(n).matches).toHaveLength(2 * n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：败者组场次为 n-2', (n) => {
    const lb = generateTemplate(n).matches.filter((m) => m.bracket === 'LB')
    expect(lb).toHaveLength(n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：胜者组每轮场次数为 n/2^r', (n) => {
    const t = generateTemplate(n)
    for (let r = 1; r <= wbRoundCount(n); r++) {
      const count = t.matches.filter((m) => m.bracket === 'WB' && m.round === r).length
      expect(count).toBe(n / 2 ** r)
    }
  })

  it.each([4, 8, 16, 32])('%i 队：恰好一场总决赛', (n) => {
    const gf = generateTemplate(n).matches.filter((m) => m.bracket === 'GF')
    expect(gf).toHaveLength(1)
    expect(gf[0].id).toBe('GF')
  })

  it.each([4, 8, 16, 32])('%i 队：matchId 唯一', (n) => {
    const ids = generateTemplate(n).matches.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([4, 8, 16, 32])('%i 队：所有引用都指向更早的场次（拓扑有序）', (n) => {
    const seen = new Set<string>()
    for (const m of generateTemplate(n).matches) {
      for (const src of [m.sourceA, m.sourceB]) {
        if (src.kind !== 'seed') expect(seen.has(src.matchId)).toBe(true)
      }
      seen.add(m.id)
    }
  })

  it('4 队：首轮对位为 1v4、2v3', () => {
    const t = generateTemplate(4)
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceA).toEqual({ kind: 'seed', seed: 1 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceB).toEqual({ kind: 'seed', seed: 4 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceA).toEqual({ kind: 'seed', seed: 2 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceB).toEqual({ kind: 'seed', seed: 3 })
  })

  it('8 队：败者组第一轮来自胜者组第一轮败者', () => {
    const lb1 = generateTemplate(8).matches.find((m) => m.id === 'LB-R1-M1')!
    expect(lb1.sourceA).toEqual({ kind: 'loser', matchId: 'WB-R1-M1' })
    expect(lb1.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R1-M2' })
  })

  it('8 队：败者组第二轮为 LB 胜者 vs WB 第二轮败者', () => {
    const lb2 = generateTemplate(8).matches.find((m) => m.id === 'LB-R2-M1')!
    expect(lb2.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R1-M1' })
    expect(lb2.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R2-M1' })
  })

  it('8 队：败者组第三轮为两个 LB 胜者互相对阵', () => {
    const lb3 = generateTemplate(8).matches.find((m) => m.id === 'LB-R3-M1')!
    expect(lb3.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R2-M1' })
    expect(lb3.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R2-M2' })
  })

  it('8 队：败者组第四轮为 LB 胜者 vs 胜者组决赛败者', () => {
    const lb4 = generateTemplate(8).matches.find((m) => m.id === 'LB-R4-M1')!
    expect(lb4.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R3-M1' })
    expect(lb4.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R3-M1' })
  })

  it('8 队：总决赛为两个分区冠军', () => {
    const gf = generateTemplate(8).matches.find((m) => m.id === 'GF')!
    expect(gf.sourceA).toEqual({ kind: 'winner', matchId: 'WB-R3-M1' })
    expect(gf.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R4-M1' })
  })
})
