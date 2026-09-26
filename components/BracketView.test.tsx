import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import { layoutBracket } from '@/lib/bracket/layout'
import type { TournamentEvent } from '@/lib/data/schema'
import { connectorViews } from '@/lib/view'
import { BracketView } from './BracketView'
import { Connectors } from './Connectors'

function makeEvent(): TournamentEvent {
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
      scoreA: null,
      scoreB: null,
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

describe('Connectors', () => {
  it('每条连接线渲染一个 path，虚线带 stroke-dasharray', () => {
    const d = deriveBracket(makeEvent())
    const l = layoutBracket(d, 8)
    const views = connectorViews(l, d)
    const html = renderToStaticMarkup(
      <Connectors connectors={views} width={l.width} height={l.height} />,
    )
    expect((html.match(/<path/g) ?? []).length).toBe(20)
    expect(html).toContain('stroke-dasharray="4 4"')
  })
})

describe('BracketView', () => {
  const d = deriveBracket(makeEvent())
  const html = renderToStaticMarkup(
    <BracketView derived={d} bracketSize={8} selectedMatchId="WB-R1-M1" onSelectMatch={() => {}} />,
  )

  it('渲染全部 14 场比赛卡片', () => {
    expect((html.match(/data-match-id=/g) ?? []).length).toBe(14)
  })

  it('渲染各轮列标题', () => {
    expect(html).toContain('胜者组 第 1 轮')
    expect(html).toContain('胜者组决赛')
    expect(html).toContain('败者组决赛')
    expect(html).toContain('总决赛')
  })

  it('渲染缩放控件与图例', () => {
    expect(html).toContain('100%')
    expect(html).toContain('实线 = 晋级')
    expect(html).toContain('虚线 = 掉落至败者组')
  })

  it('选中比赛使用高亮样式', () => {
    expect(html).toContain('border-wb')
  })
})
