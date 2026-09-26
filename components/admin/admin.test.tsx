import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/components/auth/AuthProvider'
import type { AppConfig, EventSummary } from '@/lib/data/schema'
import { AdminPage } from './AdminPage'
import { CreateEventForm } from './CreateEventForm'
import { EventList } from './EventList'

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

const EVENTS: EventSummary[] = [
  {
    id: 'spring-2026',
    name: '2026 春季赛',
    bracketSize: 8,
    status: 'ongoing',
    finishedMatches: 2,
    totalMatches: 14,
    updatedAt: '2026-09-25T10:00:00+08:00',
  },
]

function render(node: ReactNode, session: typeof ADMIN_SESSION | null = ADMIN_SESSION) {
  return renderToStaticMarkup(
    <AuthProvider config={CONFIG} initialSession={session}>
      {node}
    </AuthProvider>,
  )
}

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0
}

describe('CreateEventForm', () => {
  it('默认 8 队规模，渲染 8 个队伍名称输入框', () => {
    const html = render(<CreateEventForm />)
    expect(html).toContain('创建赛事')
    expect(html).toContain('赛事 ID')
    expect(html).toContain('签表规模')
    expect(html).toContain('总决赛 BO')
    expect(html).toContain('顺序即种子顺序')
    expect(countMatches(html, /name="team-\d+"/g)).toBe(8)
  })

  it('默认 BO3、总决赛 BO5', () => {
    const html = render(<CreateEventForm />)
    expect(html).toContain('value="3" selected')
    expect(html).toContain('value="5" selected')
  })

  it('未登录时表单仍在（写入会被 Provider 拒绝），但不会渲染 token 输入框', () => {
    const html = render(<CreateEventForm />, null)
    expect(html).not.toContain('type="password"')
  })
})

describe('EventList', () => {
  it('渲染赛事名称、状态、场次进度与操作按钮', () => {
    const html = render(
      <EventList events={EVENTS} selectedId={null} onSelect={() => {}} />,
    )
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('进行中')
    expect(html).toContain('8 队')
    expect(html).toContain('2 / 14 场')
    expect(html).toContain('删除')
    expect(html).toContain('编辑队伍与公告')
  })

  it('未展开确认时不出现二次确认输入框', () => {
    const html = render(
      <EventList events={EVENTS} selectedId={null} onSelect={() => {}} />,
    )
    expect(html).not.toContain('name="confirm-event-id"')
  })

  it('没有赛事时给出提示', () => {
    const html = render(<EventList events={[]} selectedId={null} onSelect={() => {}} />)
    expect(html).toContain('还没有任何赛事数据文件')
  })
})

describe('AdminPage', () => {
  it('未登录时只有登录表单与提示，没有创建入口', () => {
    const html = render(<AdminPage events={EVENTS} />, null)
    expect(html).toContain('管理员登录')
    expect(html).not.toContain('name="event-id"')
    expect(html).not.toContain('name="confirm-event-id"')
    expect(html).not.toContain('退出登录')
  })

  it('登录后显示身份、退出登录、赛事列表与创建表单', () => {
    const html = render(<AdminPage events={EVENTS} />)
    expect(html).toContain('admin-user')
    expect(html).toContain('退出登录')
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('创建赛事')
  })
})
