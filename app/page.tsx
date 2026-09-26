import Link from 'next/link'
import { listEvents } from '@/lib/data/load'
import type { EventStatus } from '@/lib/data/schema'
import { formatDateTime } from '@/lib/view'

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
}

export default function HomePage() {
  const events = listEvents()

  if (events.length === 0) {
    return <p className="text-muted">暂无赛事。</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">赛事列表</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {events.map((ev) => {
          const pct = ev.totalMatches === 0 ? 0 : Math.round((ev.finishedMatches / ev.totalMatches) * 100)
          return (
            <li key={ev.id}>
              <Link
                href={`/event/${ev.id}/`}
                className="block rounded-lg border border-line bg-panel p-4 transition-colors hover:border-wb/60 hover:bg-panel-hi"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{ev.name}</span>
                  <span className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted">
                    {STATUS_LABEL[ev.status]}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{`${ev.bracketSize} 队 · 双败淘汰`}</span>
                  <span className="tabular-nums">
                    {`${ev.finishedMatches} / ${ev.totalMatches} 场已完成`}
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-line">
                  <div className="h-full bg-wb" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 text-xs text-muted">{`更新于 ${formatDateTime(ev.updatedAt)}`}</div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
