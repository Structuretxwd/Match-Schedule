import { describe, expect, it } from 'vitest'
import { generateTemplate } from '@/lib/bracket/generate'
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
  const tpl = generateTemplate(size).matches.find((x) => x.id === id)
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

  it('队伍数量必须等于签表规模', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '乙队'] }))).toContain('4 个队伍名称')
  })

  it('队伍名称不能为空或重复', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '', '丙队', '丁队'] }))).toContain(
      '队伍名称不能为空',
    )
    expect(validateNewEvent(input({ teamNames: ['甲队', '甲队', '丙队', '丁队'] }))).toContain(
      '队伍名称不能重复',
    )
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

  it('队伍种子按输入顺序为 1..n，队伍 id 为 t1..tn', () => {
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

describe('resizeTeamNames', () => {
  it('扩容时保留已填名称并补默认名', () => {
    expect(resizeTeamNames(['甲队', '乙队'], 4)).toEqual(['甲队', '乙队', '队伍 3', '队伍 4'])
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
