import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { EMPTY_PARAMS_ID, eventStaticParams, listEventIds, listEvents, loadConfig, loadEvent } from './load'

/**
 * 这些用例校验的是「仓库里实际存在的数据」，而不是某个固定夹具。
 * 管理员随时可以通过后台新增或删除赛事，所以这里不能要求任何特定赛事存在 ——
 * 否则一次正常的删除就会让 npm test 失败、构建失败，站点再也无法更新。
 */
describe('load', () => {
  it('listEventIds 返回去掉扩展名且已排序的赛事 id', () => {
    const ids = listEventIds()
    expect([...ids].sort()).toEqual(ids)
    for (const id of ids) {
      expect(id.length).toBeGreaterThan(0)
      expect(id.endsWith('.json')).toBe(false)
    }
  })

  it('仓库里每个赛事都能解析成功，且队伍数与签表规模一致', () => {
    for (const id of listEventIds()) {
      const ev = loadEvent(id)
      expect(ev, `赛事 ${id} 解析失败`).not.toBeNull()
      expect(ev!.teams).toHaveLength(ev!.bracketSize)
      expect(ev!.matches.length).toBeGreaterThan(0)
    }
  })

  it('读取不存在的赛事返回 null', () => {
    expect(loadEvent('no-such-event')).toBeNull()
  })

  it('数据文件损坏时返回 null 而不抛错', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadEvent('any-event')).toBeNull()
    exists.mockRestore()
    read.mockRestore()
    log.mockRestore()
  })

  it('listEvents 不会漏掉任何赛事', () => {
    expect(listEvents()).toHaveLength(listEventIds().length)
  })

  it('赛事零个时返回空数组而不抛错', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(listEventIds()).toEqual([])
    expect(listEvents()).toEqual([])
    exists.mockRestore()
  })

  it('赛事零个时仍产出占位参数，否则 output: export 构建会失败', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(eventStaticParams()).toEqual([{ id: EMPTY_PARAMS_ID }])
    exists.mockRestore()
  })

  it('有赛事时逐个产出参数', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const read = vi.spyOn(fs, 'readdirSync').mockReturnValue(['b.json', 'a.json'] as never)
    expect(eventStaticParams()).toEqual([{ id: 'a' }, { id: 'b' }])
    read.mockRestore()
    exists.mockRestore()
  })
})

describe('loadConfig', () => {
  /**
   * 这条是构建期的哨兵：config.json 解析失败会让 loadConfig 返回 null，
   * 部署出去的站点会静默失去管理功能。所以只校验"能解析 + 关键字段齐备"，
   * 不绑定具体的仓库名或管理员名单（那些本来就该由仓库主自己改）。
   */
  it('读取管理员白名单、仓库坐标与所需权限', () => {
    const cfg = loadConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.repo.owner.length).toBeGreaterThan(0)
    expect(cfg!.repo.repo.length).toBeGreaterThan(0)
    expect(cfg!.repo.branch.length).toBeGreaterThan(0)
    expect(cfg!.requiredTokenScopes.contents.length).toBeGreaterThan(0)
    expect(cfg!.requiredTokenScopes.path.length).toBeGreaterThan(0)
    for (const admin of cfg!.admins) {
      expect(admin.login.length).toBeGreaterThan(0)
      expect(['admin', 'referee']).toContain(admin.role)
    }
  })

  it('配置损坏时返回 null 而非抛错（管理功能降级为禁用）', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadConfig()).toBeNull()
    read.mockRestore()
    log.mockRestore()
  })
})
