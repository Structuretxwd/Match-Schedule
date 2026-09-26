import { describe, expect, it } from 'vitest'
import { SESSION_KEY, clearSession, readSession, writeSession, type SessionStorage } from './session'

class FakeStorage implements SessionStorage {
  private map = new Map<string, string>()
  failOnWrite = false

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new Error('QuotaExceededError')
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  seed(key: string, value: string): void {
    this.map.set(key, value)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }
}

const SESSION = { login: 'octocat', token: 'github_pat_x', role: 'admin' as const }

describe('session', () => {
  it('没有浏览器存储时读写都不抛错', () => {
    expect(readSession(null)).toBeNull()
    expect(() => writeSession(null, SESSION)).not.toThrow()
    expect(() => clearSession(null)).not.toThrow()
  })

  it('写入后能原样读回，并带上保存时间', () => {
    const s = new FakeStorage()
    writeSession(s, SESSION)
    const read = readSession(s)
    expect(read?.login).toBe('octocat')
    expect(read?.token).toBe('github_pat_x')
    expect(read?.role).toBe('admin')
    expect(typeof read?.savedAt).toBe('number')
  })

  it('损坏的 JSON 视为未登录并清空该 key', () => {
    const s = new FakeStorage()
    s.seed(SESSION_KEY, '{ not json')
    expect(readSession(s)).toBeNull()
    expect(s.has(SESSION_KEY)).toBe(false)
  })

  it('缺字段或字段类型不对视为未登录', () => {
    const s = new FakeStorage()
    s.seed(SESSION_KEY, JSON.stringify({ login: 'a', token: 'b' }))
    expect(readSession(s)).toBeNull()

    s.seed(SESSION_KEY, JSON.stringify({ login: 'a', token: 'b', role: 'root', savedAt: 1 }))
    expect(readSession(s)).toBeNull()

    s.seed(SESSION_KEY, JSON.stringify({ login: '', token: 'b', role: 'admin', savedAt: 1 }))
    expect(readSession(s)).toBeNull()
  })

  it('旧版本的 key 不会被读取', () => {
    const s = new FakeStorage()
    s.seed('ms.auth.v0', JSON.stringify({ login: 'a', token: 'b', role: 'admin', savedAt: 1 }))
    expect(readSession(s)).toBeNull()
  })

  it('存储写入抛错（隐私模式 / 配额满）时静默降级', () => {
    const s = new FakeStorage()
    s.failOnWrite = true
    expect(() => writeSession(s, SESSION)).not.toThrow()
    expect(readSession(s)).toBeNull()
  })

  it('clearSession 删除 key', () => {
    const s = new FakeStorage()
    writeSession(s, SESSION)
    clearSession(s)
    expect(s.has(SESSION_KEY)).toBe(false)
  })
})
