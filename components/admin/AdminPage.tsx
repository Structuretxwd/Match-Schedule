'use client'

import { useState } from 'react'
import { AdminGate } from '@/components/auth/AdminGate'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/components/auth/AuthProvider'
import { CreateEventForm } from './CreateEventForm'
import { EventEditPanel } from './EventEditPanel'
import { EventList } from './EventList'
import type { EventSummary } from '@/lib/data/schema'

export function AdminPage({ events }: { events: EventSummary[] }) {
  const { ready, isAdmin, login, role, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])

  function addPending(text: string) {
    setPending((current) => (current.includes(text) ? current : [...current, text]))
  }

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

      {pending.length > 0 ? (
        <div className="space-y-1 rounded border border-wb/40 bg-panel px-3 py-2 text-xs">
          <p className="text-wb">{`${pending.length} 项改动已提交，等待 Actions 重建（约 1–2 分钟）`}</p>
          <ul className="list-inside list-disc text-muted">
            {pending.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AdminGate
        fallback={<p className="text-xs text-muted">登录后可创建赛事、维护队伍与发布公告。</p>}
      >
        <section className="space-y-2">
          <h2 className="text-sm font-medium">赛事列表</h2>
          <p className="text-[11px] text-muted">
            列表来自构建产物，新建或删除的赛事要到本次重建完成后才会在这里变化。
          </p>
          <EventList
            events={events}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            onDeleted={() => setSelectedId(null)}
          />
        </section>

        {selectedId ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">{`编辑：${selectedId}`}</h2>
            <EventEditPanel eventId={selectedId} onSaved={addPending} />
          </section>
        ) : null}

        <CreateEventForm onCreated={(id, name) => addPending(`创建赛事「${name}」（${id}）`)} />
      </AdminGate>
    </div>
  )
}
