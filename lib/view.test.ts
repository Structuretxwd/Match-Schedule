import { describe, expect, it } from 'vitest'
import { deriveBracket } from './bracket/advance'
import type { TeamState } from './bracket/advance'
import { generateTemplate } from './bracket/generate'
import { layoutBracket } from './bracket/layout'
import type { TournamentEvent } from './data/schema'
import {
  BRACKET_COLOR,
  BRACKET_LABEL,
  connectorViews,
  formatDateTime,
  groupMatchesByDay,
  laneLabel,
  nextStops,
  slotLabel,
  sortTeams,
  statusLabel,
} from './view'

function makeEvent(n: 4 | 8 | 16 | 32, scores: Record<string, [number, number]> = {}): TournamentEvent {
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
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
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

describe('formatDateTime', () => {
  it('带时区偏移的 ISO 直接按北京时间展示', () => {
    expect(formatDateTime('2026-10-01T14:00:00+08:00')).toBe('10-01 14:00')
  })

  it('UTC 时间换算为北京时间', () => {
    expect(formatDateTime('2026-10-01T06:00:00Z')).toBe('10-01 14:00')
  })

  it('跨日进位正确', () => {
    expect(formatDateTime('2026-09-30T20:30:00Z')).toBe('10-01 04:30')
  })

  it('null 与非法值返回占位文案', () => {
    expect(formatDateTime(null)).toBe('时间待定')
    expect(formatDateTime('不是时间')).toBe('时间待定')
  })
})

describe('文案映射', () => {
  it('比赛状态', () => {
    expect(statusLabel('pending')).toBe('待定')
    expect(statusLabel('ready')).toBe('未开始')
    expect(statusLabel('live')).toBe('进行中')
    expect(statusLabel('finished')).toBe('已结束')
  })

  it('队伍状态', () => {
    expect(laneLabel('alive-wb')).toBe('胜者组存活')
    expect(laneLabel('alive-lb')).toBe('败者组存活')
    expect(laneLabel('eliminated')).toBe('已淘汰')
  })

  it('三种分区都有文案与六位十六进制颜色', () => {
    for (const k of ['WB', 'LB', 'GF'] as const) {
      expect(BRACKET_LABEL[k].length).toBeGreaterThan(0)
      expect(BRACKET_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('未确定队伍显示来源描述', () => {
    expect(slotLabel({ kind: 'seed', seed: 3 })).toBe('种子 3')
    expect(slotLabel({ kind: 'winner', matchId: 'WB-R1-M1' })).toBe('WB-R1-M1 胜者')
    expect(slotLabel({ kind: 'loser', matchId: 'WB-R2-M1' })).toBe('WB-R2-M1 败者')
  })
})

describe('groupMatchesByDay', () => {
  it('空数组返回空分组', () => {
    expect(groupMatchesByDay([])).toEqual([])
  })

  it('按日期升序分组，未定时间的排在最后', () => {
    const d = deriveBracket(makeEvent(8))
    const times: Record<string, string> = {
      'WB-R1-M1': '2026-10-02T14:00:00+08:00',
      'WB-R1-M2': '2026-10-01T14:00:00+08:00',
    }
    const matches = d.matches.map((m) => ({ ...m, scheduledAt: times[m.id] ?? null }))
    const groups = groupMatchesByDay(matches)

    expect(groups[0].key).toBe('2026-10-01')
    expect(groups[0].label).toBe('10-01')
    expect(groups[0].matches.map((m) => m.id)).toEqual(['WB-R1-M2'])

    expect(groups[1].key).toBe('2026-10-02')
    expect(groups[1].matches.map((m) => m.id)).toEqual(['WB-R1-M1'])

    const last = groups[groups.length - 1]
    expect(last.key).toBe('tbd')
    expect(last.label).toBe('时间待定')
    expect(last.matches).toHaveLength(12)
  })
})

describe('sortTeams', () => {
  it('胜者组存活 → 败者组存活 → 已淘汰，同状态按种子升序', () => {
    const states: TeamState[] = [
      { teamId: 'c', name: 'C', seed: 3, wins: 0, losses: 1, status: 'eliminated', eliminatedByMatchId: null },
      { teamId: 'a', name: 'A', seed: 5, wins: 0, losses: 1, status: 'alive-lb', eliminatedByMatchId: null },
      { teamId: 'b', name: 'B', seed: 2, wins: 1, losses: 0, status: 'alive-wb', eliminatedByMatchId: null },
      { teamId: 'd', name: 'D', seed: 1, wins: 0, losses: 0, status: 'alive-wb', eliminatedByMatchId: null },
    ]
    expect(sortTeams(states).map((s) => s.teamId)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('nextStops', () => {
  it('胜者组首轮：胜者进 WB-R2-M1，败者掉进败者组首轮', () => {
    const stops = nextStops(deriveBracket(makeEvent(8)), 'WB-R1-M1')
    expect(stops).toContainEqual({ matchId: 'WB-R2-M1', kind: 'winner' })
    expect(stops.some((s) => s.kind === 'loser' && s.matchId.startsWith('LB-R1-'))).toBe(true)
  })

  it('总决赛之后没有去向', () => {
    expect(nextStops(deriveBracket(makeEvent(8)), 'GF')).toEqual([])
  })

  it('败者组决赛：胜者进总决赛，败者无处可去', () => {
    const stops = nextStops(deriveBracket(makeEvent(8)), 'LB-R4-M1')
    expect(stops).toEqual([{ matchId: 'GF', kind: 'winner' }])
  })
})

describe('connectorViews', () => {
  it('8 队共 20 条连接线（28 个来源位减去 8 个种子位）', () => {
    const d = deriveBracket(makeEvent(8))
    expect(connectorViews(layoutBracket(d, 8), d)).toHaveLength(20)
  })

  it('同时存在跨区虚线（掉落）与同区实线（晋级）', () => {
    const d = deriveBracket(makeEvent(8))
    const views = connectorViews(layoutBracket(d, 8), d)
    expect(views.some((v) => v.dashed)).toBe(true)
    expect(views.some((v) => !v.dashed)).toBe(true)
  })

  it('每条线都有从 M 起始的 path 与包含 -> 的 key', () => {
    const d = deriveBracket(makeEvent(4))
    const views = connectorViews(layoutBracket(d, 4), d)
    expect(views).toHaveLength(8)
    for (const v of views) {
      expect(v.path.startsWith('M ')).toBe(true)
      expect(v.key).toContain('->')
    }
  })
})
