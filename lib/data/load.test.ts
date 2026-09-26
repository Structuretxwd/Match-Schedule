import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { listEventIds, listEvents, loadConfig, loadEvent } from './load'

describe('load', () => {
  it('列出仓库中的示例赛事', () => {
    expect(listEventIds()).toContain('spring-2026')
  })

  it('读取示例赛事并解析成功', () => {
    const ev = loadEvent('spring-2026')
    expect(ev).not.toBeNull()
    expect(ev!.bracketSize).toBe(8)
    expect(ev!.teams).toHaveLength(8)
    expect(ev!.matches).toHaveLength(14)
  })

  it('读取不存在的赛事返回 null', () => {
    expect(loadEvent('no-such-event')).toBeNull()
  })

  it('数据文件损坏时返回 null 而不抛错', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadEvent('spring-2026')).toBeNull()
    read.mockRestore()
    log.mockRestore()
  })

  it('listEvents 返回摘要且包含进度', () => {
    const found = listEvents().find((e) => e.id === 'spring-2026')
    expect(found).toBeDefined()
    expect(found!.totalMatches).toBe(14)
    expect(found!.finishedMatches).toBe(2)
  })
})

describe('loadConfig', () => {
  it('读取管理员白名单、仓库坐标与所需权限', () => {
    const cfg = loadConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.repo.repo).toBe('Match-Schedule')
    expect(cfg!.repo.branch).toBe('main')
    expect(cfg!.admins.length).toBeGreaterThan(0)
    expect(cfg!.requiredTokenScopes.path).toBe('public/data/')
  })

  it('配置损坏时返回 null 而非抛错（管理功能降级为禁用）', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadConfig()).toBeNull()
    read.mockRestore()
    log.mockRestore()
  })
})
