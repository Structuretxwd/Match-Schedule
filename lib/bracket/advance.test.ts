import { describe, expect, it } from 'vitest'
import { deriveBracket, loserOf, winnerOf } from './advance'
import { generateTemplate } from './generate'
import type { StoredMatch, Team, TournamentEvent } from '@/lib/data/schema'

function makeTeams(n: number): Team[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seed: i + 1,
    players: [],
    logo: null,
  }))
}

function makeEvent(n: 4 | 8 | 16 | 32, scores: Record<string, [number, number]> = {}): TournamentEvent {
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: makeTeams(n),
    matches: generateTemplate(n).matches.map((t) => {
      const s = scores[t.id]
      return {
        id: t.id,
        bracket: t.bracket,
        round: t.round,
        index: t.index,
        bo: t.bracket === 'GF' ? 5 : 3,
        scoreA: s ? s[0] : null,
        scoreB: s ? s[1] : null,
        live: false,
        scheduledAt: null,
        referee: null,
        streamUrl: null,
        note: null,
      } satisfies StoredMatch
    }),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('winnerOf / loserOf', () => {
  it('未结束时返回 null', () => {
    const ev = makeEvent(4)
    const b = deriveBracket(ev)
    expect(winnerOf(b.byId['WB-R1-M1'])).toBeNull()
    expect(loserOf(b.byId['WB-R1-M1'])).toBeNull()
  })

  it('有比分时正确判定胜负', () => {
    const ev = makeEvent(4, { 'WB-R1-M1': [2, 1] })
    const b = deriveBracket(ev)
    expect(winnerOf(b.byId['WB-R1-M1'])!.seed).toBe(1)
    expect(loserOf(b.byId['WB-R1-M1'])!.seed).toBe(4)
  })
})

describe('首轮对阵', () => {
  it('4 队按 1v4、2v3 展开', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R1-M1'].teamA!.seed).toBe(1)
    expect(b.byId['WB-R1-M1'].teamB!.seed).toBe(4)
    expect(b.byId['WB-R1-M2'].teamA!.seed).toBe(2)
    expect(b.byId['WB-R1-M2'].teamB!.seed).toBe(3)
  })

  it('8 队 8 支队伍全部进入首轮且不重复', () => {
    const b = deriveBracket(makeEvent(8))
    const first = ['WB-R1-M1', 'WB-R1-M2', 'WB-R1-M3', 'WB-R1-M4'].flatMap((id) => [
      b.byId[id].teamA!.id,
      b.byId[id].teamB!.id,
    ])
    expect(new Set(first).size).toBe(8)
  })

  it('后续轮次在来源未决时队伍为 null 且状态为 pending', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R2-M1'].teamA).toBeNull()
    expect(b.byId['WB-R2-M1'].status).toBe('pending')
  })
})

describe('晋级与掉落', () => {
  it('胜者组胜者晋级、败者掉入败者组对应槽位', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    // 胜者组决赛：两场胜者
    expect(b.byId['WB-R2-M1'].teamA!.seed).toBe(1)
    expect(b.byId['WB-R2-M1'].teamB!.seed).toBe(2)
    // 败者组第一轮：两场败者
    expect(b.byId['LB-R1-M1'].teamA!.seed).toBe(4)
    expect(b.byId['LB-R1-M1'].teamB!.seed).toBe(3)
  })

  it('败者组败者被淘汰、胜者继续', () => {
    const b = deriveBracket(
      makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1], 'LB-R1-M1': [0, 2] }),
    )
    expect(b.byId['LB-R2-M1'].teamA!.seed).toBe(3) // LB 胜者
    const seed4 = b.teamStates.find((s) => s.teamId === 't4')!
    expect(seed4.status).toBe('eliminated')
    expect(seed4.losses).toBe(2)
  })
})

describe('队伍状态', () => {
  it('0 败为胜者组存活、1 败为败者组存活、2 败为淘汰', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    expect(b.teamStates.find((s) => s.teamId === 't1')!.status).toBe('alive-wb')
    expect(b.teamStates.find((s) => s.teamId === 't4')!.status).toBe('alive-lb')
    expect(b.teamStates.find((s) => s.teamId === 't2')!.status).toBe('alive-wb')
  })

  it('战绩累计正确', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    const t1 = b.teamStates.find((s) => s.teamId === 't1')!
    expect(t1.wins).toBe(1)
    expect(t1.losses).toBe(0)
  })
})

describe('完整跑通 4 队', () => {
  it('决出冠军且恰有 3 支队伍被淘汰', () => {
    // WB R1: t1 胜 t4, t2 胜 t3
    // LB R1: t3 胜 t4（t4 淘汰）
    // WB R2: t1 胜 t2（t2 掉入 LB 决赛）
    // LB R2: t3 vs t2 -> t2 胜（t3 淘汰）
    // GF: t1 vs t2 -> t1 胜（t2 淘汰）
    const b = deriveBracket(
      makeEvent(4, {
        'WB-R1-M1': [2, 0],
        'WB-R1-M2': [2, 1],
        'LB-R1-M1': [1, 2],
        'WB-R2-M1': [2, 0],
        'LB-R2-M1': [1, 2],
        GF: [3, 1],
      }),
    )
    expect(b.championId).toBe('t1')
    expect(b.teamStates.filter((s) => s.status === 'eliminated')).toHaveLength(3)
    expect(b.byId['GF'].teamA!.seed).toBe(1)
    expect(b.byId['GF'].teamB!.seed).toBe(2)
  })

  it('总决赛败者一律淘汰（含零败的胜者组冠军）', () => {
    const b = deriveBracket(
      makeEvent(4, {
        'WB-R1-M1': [2, 0],
        'WB-R1-M2': [2, 1],
        'LB-R1-M1': [1, 2],
        'WB-R2-M1': [2, 0],
        'LB-R2-M1': [1, 2],
        GF: [1, 3],
      }),
    )
    expect(b.championId).toBe('t2')
    expect(b.teamStates.find((s) => s.teamId === 't1')!.status).toBe('eliminated')
  })
})

describe('完整跑通 8 队', () => {
  it('共 14 场、冠军唯一、7 支队伍被淘汰', () => {
    const scores: Record<string, [number, number]> = {}
    // 高种子全胜：WB 每场 A 胜
    for (const t of generateTemplate(8).matches) {
      if (t.bracket === 'WB') scores[t.id] = [2, 0]
    }
    // 败者组：一律 A 胜，保证流程走完
    for (const t of generateTemplate(8).matches) {
      if (t.bracket === 'LB') scores[t.id] = [2, 0]
    }
    scores['GF'] = [3, 0]

    const b = deriveBracket(makeEvent(8, scores))
    expect(b.championId).not.toBeNull()
    expect(b.teamStates.filter((s) => s.status === 'eliminated')).toHaveLength(7)
    expect(b.matches).toHaveLength(14)
  })
})

describe('状态推导', () => {
  it('比分填齐为 finished', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    expect(b.byId['WB-R1-M1'].status).toBe('finished')
  })

  it('对阵确定但无比分为 ready', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R1-M1'].status).toBe('ready')
  })

  it('live 标记生效', () => {
    const ev = makeEvent(4)
    ev.matches[0].live = true
    expect(deriveBracket(ev).byId['WB-R1-M1'].status).toBe('live')
  })

  it('单侧比分视为数据异常，降级为 ready', () => {
    const ev = makeEvent(4)
    ev.matches[0].scoreA = 2
    expect(deriveBracket(ev).byId['WB-R1-M1'].status).toBe('ready')
  })
})

describe('修改比分后下游重算', () => {
  it('把已确认结果改为未确认，下游回到 pending', () => {
    const withResult = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    expect(withResult.byId['LB-R1-M1'].teamA).not.toBeNull()

    const cleared = deriveBracket(makeEvent(4))
    expect(cleared.byId['LB-R1-M1'].teamA).toBeNull()
    expect(cleared.byId['LB-R1-M1'].status).toBe('pending')
  })

  it('翻转胜者会导致下游对阵整体改变', () => {
    const before = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    const after = deriveBracket(makeEvent(4, { 'WB-R1-M1': [0, 2] }))
    expect(before.byId['WB-R2-M1'].teamA!.seed).toBe(1)
    expect(after.byId['WB-R2-M1'].teamA!.seed).toBe(4)
    expect(before.byId['LB-R1-M1'].teamA!.seed).toBe(4)
    expect(after.byId['LB-R1-M1'].teamA!.seed).toBe(1)
  })
})

describe('缺省合并', () => {
  it('存储中缺少某场比赛时使用模板默认值', () => {
    const ev = makeEvent(4)
    ev.matches = ev.matches.filter((m) => m.id !== 'LB-R1-M1')
    const b = deriveBracket(ev)
    expect(b.byId['LB-R1-M1']).toBeDefined()
    expect(b.byId['LB-R1-M1'].bo).toBe(3)
    expect(b.byId['LB-R1-M1'].scoreA).toBeNull()
  })

  it('总决赛使用 grandFinalBO，其余使用 defaultBO', () => {
    const b = deriveBracket(makeEvent(8))
    expect(b.byId['GF'].bo).toBe(5)
    expect(b.byId['WB-R1-M1'].bo).toBe(3)
  })
})
