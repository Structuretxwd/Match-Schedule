import { describe, expect, it } from 'vitest'
import { buildNewEvent } from '@/lib/admin/newEvent'
import type { TournamentEvent } from '@/lib/data/schema'
import { applyEventEdit, parsePlayers, validateEventEdit } from './editEvent'

const NOW = '2026-09-25T10:00:00+08:00'

function makeEvent(): TournamentEvent {
  return {
    ...buildNewEvent({
      id: 'spring-2026',
      name: '2026 春季赛',
      bracketSize: 4,
      defaultBO: 3,
      grandFinalBO: 5,
      teamNames: ['赤霄', '沧溟', '流火', '玄鸟'],
      now: '2026-09-01T00:00:00+08:00',
    }),
    status: 'ongoing',
    announcements: [{ id: 'a1', content: '报名截止', createdAt: '2026-08-31T10:00:00+08:00' }],
  }
}

describe('parsePlayers', () => {
  it('中英文逗号都能分隔，忽略空白项', () => {
    expect(parsePlayers(' 甲 , 乙，丙 ')).toEqual(['甲', '乙', '丙'])
  })

  it('空字符串得到空数组', () => {
    expect(parsePlayers('   ')).toEqual([])
    expect(parsePlayers(',,，')).toEqual([])
  })
})

describe('validateEventEdit', () => {
  it('合法改动返回 null', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't1', name: '赤霄', players: ['甲'] }),
    ).toBeNull()
    expect(validateEventEdit(event, { kind: 'add-announcement', content: '决赛改期' })).toBeNull()
    expect(validateEventEdit(event, { kind: 'remove-announcement', announcementId: 'a1' })).toBeNull()
  })

  it('队伍名称不能为空', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't1', name: '  ', players: [] }),
    ).toContain('队伍名称')
  })

  it('目标队伍必须存在', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't9', name: '新队', players: [] }),
    ).toContain('不存在')
  })

  it('公告内容不能为空', () => {
    expect(
      validateEventEdit(makeEvent(), { kind: 'add-announcement', content: '   ' }),
    ).toContain('公告内容')
  })

  it('删除的公告必须存在', () => {
    expect(
      validateEventEdit(makeEvent(), { kind: 'remove-announcement', announcementId: 'a9' }),
    ).toContain('不存在')
  })
})

describe('applyEventEdit', () => {
  it('改队伍名称不影响其他字段与其它队伍', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'update-team', teamId: 't2', name: '沧溟二队', players: [] },
      NOW,
    )
    expect(next.teams[1].name).toBe('沧溟二队')
    expect(next.teams[1].seed).toBe(2)
    expect(next.teams[0].name).toBe('赤霄')
    expect(next.updatedAt).toBe(NOW)
  })

  it('选手名单被解析为对象数组', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'update-team', teamId: 't1', name: '赤霄', players: ['甲', '乙'] },
      NOW,
    )
    expect(next.teams[0].players).toEqual([{ name: '甲' }, { name: '乙' }])
  })

  it('改动不污染原对象（纯函数）', () => {
    const event = makeEvent()
    applyEventEdit(event, { kind: 'update-team', teamId: 't1', name: '改过的名字', players: [] }, NOW)
    expect(event.teams[0].name).toBe('赤霄')
  })

  it('新公告排在最前，id 以时间戳为基准且不与已有公告冲突', () => {
    const first = applyEventEdit(makeEvent(), { kind: 'add-announcement', content: '第一条' }, NOW)
    expect(first.announcements[0].content).toBe('第一条')
    expect(first.announcements[0].createdAt).toBe(NOW)

    const second = applyEventEdit(first, { kind: 'add-announcement', content: '第二条' }, NOW)
    const ids = second.announcements.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.announcements).toHaveLength(3)
  })

  it('删除公告后其余公告顺序不变', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'remove-announcement', announcementId: 'a1' },
      NOW,
    )
    expect(next.announcements).toHaveLength(0)
    expect(next.updatedAt).toBe(NOW)
  })

  it('目标不存在时抛错，避免静默写入一次空改动', () => {
    expect(() =>
      applyEventEdit(makeEvent(), { kind: 'update-team', teamId: 't9', name: '新队', players: [] }, NOW),
    ).toThrow(/不存在/)
    expect(() =>
      applyEventEdit(makeEvent(), { kind: 'remove-announcement', announcementId: 'a9' }, NOW),
    ).toThrow(/不存在/)
  })
})
