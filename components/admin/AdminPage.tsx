'use client'

import Link from 'next/link'
import { AdminGate } from '@/components/auth/AdminGate'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/components/auth/AuthProvider'
import type { EventSummary } from '@/lib/data/schema'

export function AdminPage({ events }: { events: EventSummary[] }) {
  const { ready, isAdmin, login, role, signOut } = useAuth()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">后台管理</h1>
        <p className="text-xs text-muted">
          观众无需登录即可查看全部赛程；只有 config.json 名单内的人可以修改数据。
        </p>
      </header>

      {!ready ? (
        <p className="rounded border border-line bg-panel px-3 py-2 text-sm text-muted">
          正在检查登录状态...
        </p>
      ) : isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel px-3 py-2 text-sm">
          <span>{`已登录：${login}（${role === 'admin' ? '管理员' : '裁判'}）`}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            退出登录
          </button>
        </div>
      ) : (
        <LoginForm />
      )}

      <AdminGate
        fallback={<p className="text-xs text-muted">登录后可创建赛事、维护队伍与发布公告。</p>}
      >
        <section className="space-y-2">
          <h2 className="text-sm font-medium">赛事</h2>
          {events.length === 0 ? (
            <p className="text-xs text-muted">还没有任何赛事数据文件。</p>
          ) : (
            <ul className="divide-y divide-line rounded border border-line bg-panel text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link href={`/event/${e.id}/`} className="hover:text-wb">
                    {e.name}
                  </Link>
                  <span className="text-xs text-muted">{`${e.finishedMatches} / ${e.totalMatches} 场`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </AdminGate>
    </div>
  )
}
