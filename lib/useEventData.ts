'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseEvent, type StoredMatch, type TournamentEvent } from '@/lib/data/schema'
import { pollUrl } from '@/lib/urls'

export const POLL_INTERVAL_MS = 30_000

/** 一次尚未随 Actions 重建生效的改动；patch 只描述被改动的字段 */
export type PendingChange = {
  matchId: string
  patch: Partial<Pick<StoredMatch, 'scoreA' | 'scoreB' | 'live' | 'scheduledAt'>>
}

/**
 * 本地暂存（草稿）的改动，key 为比赛 id。
 * 只活在当前页面会话里：立即参与预览，但不写仓库，直到管理员点「全部提交」。
 */
export type StagedEdits = Record<string, PendingChange['patch']>

/** 暂存 map → applyPending 需要的列表 */
export function stagedToPending(staged: StagedEdits): PendingChange[] {
  return Object.entries(staged).map(([matchId, patch]) => ({ matchId, patch }))
}

/**
 * 把尚未生效的改动叠加到服务端数据上。
 * 同一场比赛的多条改动会按顺序合并：后一条只覆盖它自己声明的字段，
 * 因此「已提交待重建」的改动与「本地暂存」的改动可以共存，且暂存的部分优先。
 */
export function applyPending(event: TournamentEvent, pending: PendingChange[]): TournamentEvent {
  if (pending.length === 0) return event
  const patches = new Map<string, PendingChange['patch']>()
  for (const p of pending) {
    patches.set(p.matchId, { ...patches.get(p.matchId), ...p.patch })
  }
  let changed = false
  const matches = event.matches.map((m) => {
    const patch = patches.get(m.id)
    if (!patch) return m
    const merged: StoredMatch = { ...m, ...patch }
    if (
      merged.scoreA === m.scoreA &&
      merged.scoreB === m.scoreB &&
      merged.live === m.live &&
      merged.scheduledAt === m.scheduledAt
    ) {
      return m
    }
    changed = true
    return merged
  })
  return changed ? { ...event, matches } : event
}

/** 丢弃服务端已生效的改动；patch 中只要有一个字段与远端不一致就保留整条 */
export function prunePending(event: TournamentEvent, pending: PendingChange[]): PendingChange[] {
  const byId = new Map(event.matches.map((m) => [m.id, m]))
  return pending.filter((p) => {
    const m = byId.get(p.matchId)
    if (!m) return true
    return Object.entries(p.patch).some(
      ([key, value]) => (m as unknown as Record<string, unknown>)[key] !== value,
    )
  })
}

export type EventDataState = {
  /** 叠加了待生效改动后的数据，用于渲染 */
  event: TournamentEvent
  /** 轮询拿到的原始数据，用于判断待生效改动是否已生效 */
  remote: TournamentEvent
  loading: boolean
  error: string | null
  lastFetchedAt: number | null
  refresh: () => Promise<void>
}

export function useEventData(initial: TournamentEvent, pending: PendingChange[] = []): EventDataState {
  const [remote, setRemote] = useState<TournamentEvent>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(pollUrl(`/events/${initial.id}.json`), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRemote(parseEvent(await res.json()))
      setError(null)
      setLastFetchedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [initial.id])

  useEffect(() => {
    const timer = setInterval(() => {
      // 页面在后台时暂停轮询，减少无谓请求（设计文档 §10.3）
      if (typeof document !== 'undefined' && document.hidden) return
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const event = useMemo(() => applyPending(remote, pending), [remote, pending])

  return { event, remote, loading, error, lastFetchedAt, refresh }
}
