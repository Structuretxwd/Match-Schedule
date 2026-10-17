import { describe, expect, it } from 'vitest'
import { generateTemplate, seedOrder, slotsFor } from '@/lib/bracket/generate'
import { parseEvent } from '@/lib/data/schema'
import {
  buildNewEvent,
  eventFilePath,
  resizeTeamNames,
  validateNewEvent,
  type NewEventInput,
} from './newEvent'

const NOW = '2026-09-25T10:00:00+08:00'

function input(overrides: Partial<NewEventInput> = {}): NewEventInput {
  return {
    id: 'autumn-2026',
    name: '2026 秋季赛',
    format: 'double-elimination',
    bracketSize: 4,
    defaultBO: 3,
    grandFinalBO: 5,
    teamNames: ['甲队', '乙队', '丙队', '丁队'],
    now: NOW,
    ...overrides,
  }
}

/** 从模板里取出某场比赛两个槽位的种子号，非种子来源记 -1 */
function seedPair(id: string, size: number): number[] {
  const tpl = generateTemplate(size, 'double-elimination').matches.find((x) => x.id === id)
  if (!tpl) throw new Error(`${id} 不在模板中`)
  return [tpl.sourceA, tpl.sourceB].map((s) => (s.kind === 'seed' ? s.seed : -1))
}

describe('validateNewEvent', () => {
  it('合法输入返回 null', () => {
    expect(validateNewEvent(input())).toBeNull()
  })

  it('赛事 ID 只允许小写字母、数字与连字符', () => {
    expect(validateNewEvent(input({ id: 'Autumn 2026' }))).toContain('赛事 ID')
    expect(validateNewEvent(input({ id: '-abc' }))).toContain('赛事 ID')
    expect(validateNewEvent(input({ id: 'autumn_2026' }))).toContain('赛事 ID')
  })

  it('赛事名称不能为空', () => {
    expect(validateNewEvent(input({ name: '   ' }))).toContain('赛事名称')
  })

  it('BO 只能是 1 / 3 / 5 / 7', () => {
    expect(validateNewEvent(input({ defaultBO: 2 }))).toContain('默认 BO')
    expect(validateNewEvent(input({ grandFinalBO: 9 }))).toContain('总决赛 BO')
  })

  it('选手数量必须等于参赛人数', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '乙队'] }))).toContain('4 个选手名称')
  })

  it('选手名称不能为空或重复', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '', '丙队', '丁队'] }))).toContain(
      '选手名称不能为空',
    )
    expect(validateNewEvent(input({ teamNames: ['甲队', '甲队', '丙队', '丁队'] }))).toContain(
      '选手名称不能重复',
    )
  })

  it('双败只接受 4 / 8 / 16 / 32', () => {
    const names = Array.from({ length: 6 }, (_, i) => `选手${i + 1}`)
    expect(
      validateNewEvent(input({ format: 'double-elimination', bracketSize: 6, teamNames: names })),
    ).toContain('双败')
  })

  it('单败接受 4–32 之间的任意整数', () => {
    const names = Array.from({ length: 28 }, (_, i) => `选手${i + 1}`)
    expect(
      validateNewEvent(input({ format: 'single-elimination', bracketSize: 28, teamNames: names })),
    ).toBeNull()
    expect(
      validateNewEvent(input({ format: 'single-elimination', bracketSize: 33, teamNames: names })),
    ).toContain('单败')
  })
})

describe('buildNewEvent', () => {
  it('生成的赛事能通过 parseEvent 校验（写出去的文件一定读得回来）', () => {
    const event = buildNewEvent(input())
    expect(() => parseEvent(event)).not.toThrow()
  })

  it('8 队签表生成 14 场比赛（2n-2）', () => {
    const event = buildNewEvent(
      input({ bracketSize: 8, teamNames: Array.from({ length: 8 }, (_, i) => `队${i + 1}`) }),
    )
    expect(event.matches).toHaveLength(14)
    expect(event.matches.filter((m) => m.bracket === 'WB')).toHaveLength(7)
    expect(event.matches.filter((m) => m.bracket === 'LB')).toHaveLength(6)
    expect(event.matches.filter((m) => m.bracket === 'GF')).toHaveLength(1)
  })

  it('28 人单败生成 27 场比赛（n-1），没有败者组', () => {
    const names = Array.from({ length: 28 }, (_, i) => `选手${i + 1}`)
    const event = buildNewEvent(
      input({ format: 'single-elimination', bracketSize: 28, teamNames: names }),
    )
    expect(event.format).toBe('single-elimination')
    expect(event.matches).toHaveLength(27)
    expect(event.matches.some((m) => m.bracket === 'LB')).toBe(false)
    expect(() => parseEvent(event)).not.toThrow()
  })

  it('全部比赛初始为未开赛：无比分、非进行中、无时间', () => {
    const event = buildNewEvent(input())
    expect(event.matches.every((m) => m.scoreA === null && m.scoreB === null)).toBe(true)
    expect(event.matches.every((m) => m.live === false)).toBe(true)
    expect(event.matches.every((m) => m.scheduledAt === null)).toBe(true)
  })

  it('总决赛使用 grandFinalBO，其余场次使用 defaultBO', () => {
    const event = buildNewEvent(input({ defaultBO: 1, grandFinalBO: 5 }))
    expect(event.matches.find((m) => m.id === 'GF')?.bo).toBe(5)
    expect(event.matches.filter((m) => m.bracket !== 'GF').every((m) => m.bo === 1)).toBe(true)
  })

  it('双败按录入顺序对号入座：选手种子为 1..n，选手 id 为 t1..tn', () => {
    const event = buildNewEvent(input())
    expect(event.teams.map((t) => t.seed)).toEqual([1, 2, 3, 4])
    expect(event.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])
    expect(event.teams[0].name).toBe('甲队')
  })

  it('赛事初始状态为 draft，无公告', () => {
    const event = buildNewEvent(input())
    expect(event.status).toBe('draft')
    expect(event.announcements).toEqual([])
    expect(event.updatedAt).toBe(NOW)
  })

  it('首轮对阵来自 1 号与末号种子的固定对位（种子之和为 n+1）', () => {
    buildNewEvent(
      input({ bracketSize: 8, teamNames: Array.from({ length: 8 }, (_, i) => `队${i + 1}`) }),
    )
    expect(seedPair('WB-R1-M1', 8)).toEqual([1, 8])
    expect(seedPair('WB-R1-M2', 8)).toEqual([4, 5])
  })
})

describe('buildNewEvent 单败随机抽签', () => {
  const SIZE = 28
  const NAMES = Array.from({ length: SIZE }, (_, i) => `选手${i + 1}`)

  /** 线性同余发生器：把抽签变成可复现的固定序列 */
  function lcg(seed: number): () => number {
    let s = seed >>> 0
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return s / 4294967296
    }
  }

  /** 补签后首轮没有对手的种子号，也就是轮空名额 */
  function byeSeeds(size: number): number[] {
    const order = seedOrder(slotsFor(size))
    const out: number[] = []
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i]
      const b = order[i + 1]
      if (a <= size && b > size) out.push(a)
      else if (b <= size && a > size) out.push(b)
    }
    return out
  }

  function draw(rng: () => number) {
    return buildNewEvent(
      input({
        format: 'single-elimination',
        bracketSize: SIZE,
        teamNames: NAMES,
        random: rng,
      }),
    )
  }

  it('28 人补到 32 签位，轮空落在种子 1 / 4 / 2 / 3 上', () => {
    expect(byeSeeds(SIZE)).toEqual([1, 4, 2, 3])
  })

  it('抽签打乱落位：名单集合不变，但顺序不再等于录入顺序', () => {
    const drawn = draw(lcg(1)).teams.map((t) => t.name)
    expect([...drawn].sort()).toEqual([...NAMES].sort())
    expect(drawn).not.toEqual(NAMES)
  })

  it('同一随机序列得到同一份签表', () => {
    expect(draw(lcg(7)).teams.map((t) => t.name)).toEqual(draw(lcg(7)).teams.map((t) => t.name))
  })

  it('不同随机序列让不同的选手轮空', () => {
    const bySeed = (rng: () => number) =>
      draw(rng)
        .teams.filter((t) => byeSeeds(SIZE).includes(t.seed))
        .map((t) => t.name)
    expect(bySeed(lcg(1))).not.toEqual(bySeed(lcg(99)))
  })

  it('抽签后仍是 27 场且能通过 parseEvent 校验', () => {
    const event = draw(lcg(3))
    expect(event.matches).toHaveLength(SIZE - 1)
    expect(() => parseEvent(event)).not.toThrow()
  })

  it('双败不抽签，仍按录入顺序对号入座', () => {
    const event = buildNewEvent(
      input({ format: 'double-elimination', bracketSize: 8, teamNames: Array.from({ length: 8 }, (_, i) => `队${i + 1}`) }),
    )
    expect(event.teams.map((t) => t.name)).toEqual(
      Array.from({ length: 8 }, (_, i) => `队${i + 1}`),
    )
  })
})

describe('resizeTeamNames', () => {
  it('扩容时保留已填名称并补默认名', () => {
    expect(resizeTeamNames(['甲队', '乙队'], 4)).toEqual(['甲队', '乙队', '选手 3', '选手 4'])
  })

  it('缩容时截断多余名称', () => {
    expect(resizeTeamNames(['甲队', '乙队', '丙队', '丁队'], 2)).toEqual(['甲队', '乙队'])
  })
})

describe('eventFilePath', () => {
  it('指向 public/data/events 下的赛事文件', () => {
    expect(eventFilePath('autumn-2026')).toBe('public/data/events/autumn-2026.json')
  })
})
