import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { AppConfig, TournamentEvent } from '@/lib/data/schema'
import { MatchDetailDialog } from './MatchDetailDialog'

const CONFIG: AppConfig = {
  repo: { owner: 'octo', repo: 'match-schedule', branch: 'main' },
  admins: [{ login: 'admin-user', role: 'admin' }],
  requiredTokenScopes: { contents: 'write', path: 'public/data/' },
}

const ADMIN_SESSION = {
  login: 'admin-user',
  token: 'github_pat_x',
  role: 'admin' as const,
  savedAt: 0,
}

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
      scheduledAt: '2026-10-01T14:00:00+08:00',
      referee: '裁判甲',
      streamUrl: 'https://example.com/live',
      note: '备注文本',
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

function render(matchId: string, scores = {}, session: typeof ADMIN_SESSION | null = null) {
  const d = deriveBracket(makeEvent(scores))
  return renderToStaticMarkup(
    <AuthProvider config={CONFIG} initialSession={session}>
      <MatchDetailDialog match={d.byId[matchId]} derived={d} eventId="spring-2026" onClose={() => {}} />
    </AuthProvider>,
  )
}

describe('MatchDetailDialog', () => {
  it('显示标题、双方与比分、赛制、状态', () => {
    const html = render('WB-R1-M1', { 'WB-R1-M1': [2, 1] })
    expect(html).toContain('胜者组 · 第 1 轮 · 第 1 场')
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('BO3')
    expect(html).toContain('已结束')
  })

  it('显示时间、裁判、直播链接与备注', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('10-01 14:00')
    expect(html).toContain('裁判甲')
    expect(html).toContain('https://example.com/live')
    expect(html).toContain('备注文本')
  })

  it('标注晋级与掉落去向', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('胜者 → WB-R2-M1')
    expect(html).toContain('败者 → LB-R1-M1')
  })

  it('败者组比赛标注落败即淘汰', () => {
    const html = render('LB-R3-M1')
    expect(html).toContain('败者 → 淘汰')
  })

  it('总决赛标注冠亚军', () => {
    const html = render('GF')
    expect(html).toContain('胜者 → 冠军')
    expect(html).toContain('败者 → 亚军')
  })

  it('未确定队伍显示来源描述', () => {
    const html = render('WB-R2-M1')
    expect(html).toContain('WB-R1-M1 胜者')
    expect(html).toContain('WB-R1-M2 胜者')
  })

  it('游客只看到提示，看不到录分表单', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('只有登录后的管理员可以录入或修改比分')
    expect(html).not.toContain('aria-label="甲队局分"')
  })

  it('管理员看到录分表单、BO 提示与生效说明', () => {
    const html = render('WB-R1-M1', {}, ADMIN_SESSION)
    expect(html).toContain('aria-label="甲队局分"')
    expect(html).toContain('aria-label="乙队局分"')
    expect(html).toContain('BO3 · 先赢 2 局')
    expect(html).toContain('清除比分')
    expect(html).toContain('约 1–2 分钟后')
  })
})
