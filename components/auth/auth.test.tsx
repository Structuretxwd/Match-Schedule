import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminPage } from '@/components/admin/AdminPage'
import type { AppConfig, EventSummary } from '@/lib/data/schema'
import { AdminGate } from './AdminGate'
import { AuthProvider } from './AuthProvider'
import { LoginForm } from './LoginForm'

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

function render(
  node: ReactNode,
  session: typeof ADMIN_SESSION | null = null,
  config: AppConfig | null = CONFIG,
) {
  return renderToStaticMarkup(
    <AuthProvider config={config} initialSession={session}>
      {node}
    </AuthProvider>,
  )
}

describe('AdminGate', () => {
  it('未登录时不渲染管理内容', () => {
    expect(render(<AdminGate><p>管理功能</p></AdminGate>)).not.toContain('管理功能')
  })

  it('登录后渲染管理内容', () => {
    expect(render(<AdminGate><p>管理功能</p></AdminGate>, ADMIN_SESSION)).toContain('管理功能')
  })

  it('会话中的登录名不在白名单时视为未登录', () => {
    const stranger = { ...ADMIN_SESSION, login: 'stranger' }
    expect(render(<AdminGate><p>管理功能</p></AdminGate>, stranger)).not.toContain('管理功能')
  })
})

describe('LoginForm', () => {
  it('渲染用户名、Token 输入框与所需的 GitHub 权限说明', () => {
    const html = render(<LoginForm />)
    expect(html).toContain('管理员登录')
    expect(html).toContain('GitHub 用户名')
    expect(html).toContain('Fine-grained Token')
    expect(html).toContain('name="token"')
    expect(html).toContain('type="password"')
    expect(html).toContain('octo/match-schedule')
    expect(html).toContain('public/data/')
  })

  it('配置缺失时提示登录被禁用', () => {
    const html = render(<LoginForm />, null, null)
    expect(html).toContain('管理员配置不可用')
  })
})

describe('AdminPage', () => {
  it('未登录时显示登录表单', () => {
    const html = render(<AdminPage events={EVENTS} />)
    expect(html).toContain('管理员登录')
    expect(html).not.toContain('退出登录')
  })

  it('登录后显示身份、退出按钮与赛事列表', () => {
    const html = render(<AdminPage events={EVENTS} />, ADMIN_SESSION)
    expect(html).toContain('admin-user')
    expect(html).toContain('管理员')
    expect(html).toContain('退出登录')
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('2 / 14 场')
  })
})
