import { describe, expect, it } from 'vitest'
import { generateTemplate } from './bracket/generate'
import type { TournamentEvent } from './data/schema'
import { applyPending, prunePending, stagedToPending } from './useEventData'

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
    matches: generateTemplate(n, 'double-elimination').matches.map((t) => ({
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

describe('applyPending', () => {
  it('没有待生效改动时原样返回同一引用', () => {
    const ev = makeEvent()
    expect(applyPending(ev, [])).toBe(ev)
  })

  it('把待生效比分叠加到对应比赛上', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])
    const m = out.matches.find((x) => x.id === 'WB-R1-M1')!
    expect([m.scoreA, m.scoreB]).toEqual([2, 0])
    expect(out.matches).not.toBe(ev.matches)
  })

  it('服务端比分与待生效一致时保持原引用（说明已生效）', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    expect(applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])).toBe(ev)
  })

  it('可以叠加 live 标记', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { live: true } }])
    expect(out.matches.find((x) => x.id === 'WB-R1-M1')!.live).toBe(true)
  })

  it('未涉及的其他比赛比分不受影响', () => {
    const ev = makeEvent({ 'WB-R1-M2': [0, 2] })
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])
    const m2 = out.matches.find((x) => x.id === 'WB-R1-M2')!
    expect([m2.scoreA, m2.scoreB]).toEqual([0, 2])
  })

  it('同一场比赛的多条改动会合并：后面的只覆盖自己声明的字段', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [
      { matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } },
      { matchId: 'WB-R1-M1', patch: { scheduledAt: '2026-10-05T20:00:00+08:00' } },
    ])
    const m = out.matches.find((x) => x.id === 'WB-R1-M1')!
    expect([m.scoreA, m.scoreB]).toEqual([2, 0])
    expect(m.scheduledAt).toBe('2026-10-05T20:00:00+08:00')
  })

  it('后一条改动可以覆盖前一条的同一字段', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [
      { matchId: 'WB-R1-M1', patch: { scheduledAt: '2026-10-05T20:00:00+08:00' } },
      { matchId: 'WB-R1-M1', patch: { scheduledAt: null } },
    ])
    expect(out.matches.find((x) => x.id === 'WB-R1-M1')!.scheduledAt).toBeNull()
  })
})

describe('stagedToPending', () => {
  it('把暂存 map 拍平成待提交列表', () => {
    expect(stagedToPending({ 'WB-R1-M1': { scoreA: 2 }, 'WB-R1-M2': { live: true } })).toEqual([
      { matchId: 'WB-R1-M1', patch: { scoreA: 2 } },
      { matchId: 'WB-R1-M2', patch: { live: true } },
    ])
  })

  it('空暂存返回空数组', () => {
    expect(stagedToPending({})).toEqual([])
  })
})

describe('prunePending', () => {
  it('已生效的改动被移除，未生效的保留', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    const pending = [
      { matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } },
      { matchId: 'WB-R1-M2', patch: { scoreA: 2, scoreB: 1 } },
    ]
    expect(prunePending(ev, pending)).toEqual([{ matchId: 'WB-R1-M2', patch: { scoreA: 2, scoreB: 1 } }])
  })

  it('patch 里只要有一个字段尚未生效就保留整条改动', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    const pending = [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0, live: true } }]
    expect(prunePending(ev, pending)).toEqual(pending)
  })

  it('比赛不存在时保留该改动（等数据文件出现）', () => {
    const ev = makeEvent()
    const pending = [{ matchId: 'NOT-EXIST', patch: { scoreA: 3, scoreB: 0 } }]
    expect(prunePending(ev, pending)).toEqual(pending)
  })
})
