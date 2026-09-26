import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { TournamentEvent } from '@/lib/data/schema'
import { MatchCard } from './MatchCard'

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
      scheduledAt: '2026-10-01T14:00:00+08:00',
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

function render(matchId: string, selected = false, scores = {}) {
  const d = deriveBracket(makeEvent(scores))
  return renderToStaticMarkup(
    <MatchCard match={d.byId[matchId]} selected={selected} onSelect={() => {}} />,
  )
}

describe('MatchCard', () => {
  it('显示两队名称与 BO 与时间', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('BO3')
    expect(html).toContain('10-01 14:00')
    expect(html).toContain('data-match-id="WB-R1-M1"')
  })

  it('已有比分时显示比分与胜者比分徽标', () => {
    const html = render('WB-R1-M1', false, { 'WB-R1-M1': [2, 1] })
    expect(html).toContain('>2<')
    expect(html).toContain('>1<')
    expect(html).toContain('text-wb')
  })

  it('队伍未确定时显示来源描述', () => {
    const html = render('WB-R2-M1')
    expect(html).toContain('WB-R1-M1 胜者')
    expect(html).toContain('WB-R1-M2 胜者')
  })

  it('选中态使用高亮边框', () => {
    expect(render('WB-R1-M1', true)).toContain('border-wb')
    expect(render('WB-R1-M1', false)).toContain('border-line')
  })

  it('进行中的比赛显示实时标记', () => {
    const ev = makeEvent()
    ev.matches = ev.matches.map((m) => (m.id === 'WB-R1-M1' ? { ...m, live: true } : m))
    const d = deriveBracket(ev)
    const html = renderToStaticMarkup(
      <MatchCard match={d.byId['WB-R1-M1']} selected={false} onSelect={() => {}} />,
    )
    expect(html).toContain('进行中')
  })
})
