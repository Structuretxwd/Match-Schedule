import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { TournamentEvent } from '@/lib/data/schema'
import { ScheduleView } from './ScheduleView'
import { TeamsView } from './TeamsView'

function makeEvent(scores: Record<string, [number, number]> = {}): TournamentEvent {
  const n = 8 as const
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
      players: [{ name: `选手${i + 1}` }],
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

const ALL_WINS: Record<string, [number, number]> = {
  'WB-R1-M1': [2, 0],
  'WB-R1-M2': [2, 0],
  'WB-R1-M3': [2, 0],
  'WB-R1-M4': [2, 0],
  'WB-R2-M1': [2, 0],
  'WB-R2-M2': [2, 0],
  'WB-R3-M1': [2, 0],
  'LB-R1-M1': [2, 0],
  'LB-R1-M2': [2, 0],
  'LB-R2-M1': [2, 0],
  'LB-R2-M2': [2, 0],
  'LB-R3-M1': [2, 0],
  'LB-R4-M1': [2, 0],
  GF: [3, 1],
}

describe('ScheduleView', () => {
  it('渲染全部 14 场比赛行', () => {
    const d = deriveBracket(makeEvent())
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect((html.match(/<li/g) ?? []).length).toBe(14)
    expect(html).toContain('时间待定')
  })

  it('已有比分显示比分，未确定的对阵显示来源', () => {
    const d = deriveBracket(makeEvent({ 'WB-R1-M1': [2, 1] }))
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect(html).toContain('2 : 1')
    // WB-R1-M1 有比分后其胜者已解析进 WB-R2-M1，故该槽位显示队名 T1；WB-R1-M2 未录分，显示来源描述
    expect(html).toContain('T1 vs WB-R1-M2 胜者')
  })

  it('按状态给出不同徽标文案', () => {
    const d = deriveBracket(makeEvent({ 'WB-R1-M1': [2, 1] }))
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect(html).toContain('已结束')
    expect(html).toContain('未开始')
    expect(html).toContain('待定')
  })
})

describe('TeamsView', () => {
  it('列出全部队伍并标注存活状态', () => {
    const ev = makeEvent()
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={deriveBracket(ev)} />)
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('选手1')
    expect((html.match(/胜者组存活/g) ?? []).length).toBe(8)
  })

  it('比赛全部结束后显示冠军', () => {
    const ev = makeEvent(ALL_WINS)
    const d = deriveBracket(ev)
    expect(d.championId).toBe('t1')
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={d} />)
    expect(html).toContain('冠军：T1')
    expect((html.match(/已淘汰/g) ?? []).length).toBe(7)
  })

  it('被淘汰的队伍标注淘汰于哪一场', () => {
    // 输掉胜者组比赛只是掉落败者组；真正被淘汰发生在败者组比赛上
    const ev = makeEvent({ 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 0], 'LB-R1-M1': [2, 1] })
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={deriveBracket(ev)} />)
    expect(html).toContain('已淘汰（LB-R1-M1）')
    expect(html).toContain('败者组存活')
  })
})
