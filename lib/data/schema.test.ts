import { describe, expect, it } from 'vitest'
import { parseConfig, parseEvent, SchemaError } from './schema'

const validEvent = {
  id: 'spring',
  name: '春季赛',
  format: 'double-elimination',
  bracketSize: 8,
  status: 'ongoing',
  defaultBO: 3,
  grandFinalBO: 5,
  teams: [{ id: 't1', name: 'A 队', seed: 1, players: [{ name: '甲' }], logo: null }],
  matches: [
    {
      id: 'WB-R1-M1', bracket: 'WB', round: 1, index: 1, bo: 3,
      scoreA: null, scoreB: null, live: false,
      scheduledAt: null, referee: null, streamUrl: null, note: null,
    },
  ],
  announcements: [],
  updatedAt: '2026-09-25T10:00:00+08:00',
}

describe('parseEvent', () => {
  it('接受合法数据', () => {
    const ev = parseEvent(validEvent)
    expect(ev.id).toBe('spring')
    expect(ev.bracketSize).toBe(8)
  })

  it('拒绝非 2 的幂的签表规模', () => {
    expect(() => parseEvent({ ...validEvent, bracketSize: 6 })).toThrow(SchemaError)
  })

  it('拒绝非法赛制', () => {
    expect(() => parseEvent({ ...validEvent, format: 'round-robin' })).toThrow(SchemaError)
  })

  it('拒绝非法 BO 值', () => {
    const bad = { ...validEvent, matches: [{ ...validEvent.matches[0], bo: 4 }] }
    expect(() => parseEvent(bad)).toThrow(SchemaError)
  })

  it('拒绝缺失的 scoreA 字段', () => {
    const bad = { ...validEvent, matches: [{ ...validEvent.matches[0], scoreA: undefined }] }
    expect(() => parseEvent(bad)).toThrow(SchemaError)
  })

  it('拒绝非对象输入', () => {
    expect(() => parseEvent(null)).toThrow(SchemaError)
    expect(() => parseEvent('<html>')).toThrow(SchemaError)
  })

  it('错误信息包含出错路径', () => {
    try {
      parseEvent({ ...validEvent, teams: [{ id: 1 }] })
      throw new Error('应当抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError)
      expect((e as SchemaError).path).toContain('teams')
    }
  })
})

describe('parseConfig', () => {
  const repo = { owner: 'alice', repo: 'match-schedule', branch: 'main' }
  const scopes = { contents: 'write', path: 'public/data/' }

  it('接受合法配置', () => {
    const cfg = parseConfig({ repo, admins: [{ login: 'alice', role: 'admin' }], requiredTokenScopes: scopes })
    expect(cfg.admins[0].login).toBe('alice')
    expect(cfg.repo.repo).toBe('match-schedule')
  })

  it('拒绝非法 role', () => {
    expect(() =>
      parseConfig({ repo, admins: [{ login: 'alice', role: 'root' }], requiredTokenScopes: scopes }),
    ).toThrow(SchemaError)
  })

  it('允许 admins 为空数组', () => {
    expect(parseConfig({ repo, admins: [], requiredTokenScopes: scopes }).admins).toEqual([])
  })

  it('拒绝缺失的 repo 配置', () => {
    expect(() => parseConfig({ admins: [], requiredTokenScopes: scopes })).toThrow(SchemaError)
  })
})
