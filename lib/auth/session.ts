import type { Role } from '@/lib/data/schema'

/** 版本化 key：将来会话结构升级时改版本号即可，旧数据自然失效（设计文档 §6.5 原则 ④） */
export const SESSION_KEY = 'ms.auth.v1'

export type StoredSession = {
  login: string
  token: string
  role: Role
  savedAt: number
}

/** 只依赖这三个方法，便于测试注入；浏览器环境由 browserStorage() 提供 */
export type SessionStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 服务端渲染（window 不存在）与隐私模式（localStorage 抛错）都返回 null */
export function browserStorage(): SessionStorage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    const probe = '__ms_storage_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

function isRole(v: unknown): v is Role {
  return v === 'admin' || v === 'referee'
}

function parseSession(raw: string): StoredSession | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>
  if (typeof o.login !== 'string' || o.login.length === 0) return null
  if (typeof o.token !== 'string' || o.token.length === 0) return null
  if (!isRole(o.role)) return null
  if (typeof o.savedAt !== 'number' || !Number.isFinite(o.savedAt)) return null
  return { login: o.login, token: o.token, role: o.role, savedAt: o.savedAt }
}

/** 读到任何不认识的结构一律视为未登录，并顺手清掉这个 key，绝不抛错 */
export function readSession(storage: SessionStorage | null): StoredSession | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(SESSION_KEY)
  } catch {
    return null
  }
  if (raw === null) return null
  const session = parseSession(raw)
  if (!session) clearSession(storage)
  return session
}

export function writeSession(
  storage: SessionStorage | null,
  session: Omit<StoredSession, 'savedAt'>,
): void {
  if (!storage) return
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ ...session, savedAt: Date.now() }))
  } catch {
    // 写不进去就只保留本次会话内的登录态，刷新后需重新登录，不影响正常使用
  }
}

export function clearSession(storage: SessionStorage | null): void {
  if (!storage) return
  try {
    storage.removeItem(SESSION_KEY)
  } catch {
    // 忽略
  }
}
