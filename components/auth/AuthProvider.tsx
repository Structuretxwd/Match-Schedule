'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  createData,
  deleteData,
  describeScopeRequirement,
  matchAdmin,
  mutateData,
  verifyLogin,
  type CreateOptions,
  type DeleteOptions,
  type MutateOptions,
  type WriteOutcome,
} from '@/lib/data/github'
import type { AppConfig, Role } from '@/lib/data/schema'
import {
  browserStorage,
  clearSession,
  readSession,
  writeSession,
  type SessionStorage,
  type StoredSession,
} from '@/lib/auth/session'

/**
 * token 只存在于模块作用域内，不进入 React context（设计文档 §6.5 原则 ①）。
 * 业务代码能拿到的只有 isAdmin 与 mutate()，无法读取或传递 token。
 */
let tokenRef: string | null = null

export type AuthState = { login: string; role: Role }

export type AuthContextValue = {
  /** 本地会话是否已恢复完成；恢复前无法判断是否管理员 */
  ready: boolean
  isAdmin: boolean
  role: Role | null
  login: string | null
  /** 登录表单展示的 PAT 权限要求；配置缺失时为 null */
  scopeHint: string | null
  signIn: (login: string, token: string) => Promise<WriteOutcome>
  signOut: () => void
  /** 唯一写入口：改已有文件。repo 与 token 由 Provider 附加 */
  mutate: <T>(opts: Omit<MutateOptions<T>, 'repo' | 'token'>) => Promise<WriteOutcome>
  /** 唯一写入口：新建文件（Task 19/20 创建赛事、发布公告用），已存在则拒绝 */
  create: (opts: Omit<CreateOptions, 'repo' | 'token'>) => Promise<WriteOutcome>
  /** 唯一写入口：删除文件（Task 20 删除公告用） */
  remove: (opts: Omit<DeleteOptions, 'repo' | 'token'>) => Promise<WriteOutcome>
}

/** 没有 Provider 时也绝不抛错，一律按游客渲染（设计文档 §11） */
const FALLBACK: AuthContextValue = {
  ready: true,
  isAdmin: false,
  role: null,
  login: null,
  scopeHint: null,
  signIn: async () => ({ ok: false, reason: 'auth', message: '认证上下文缺失' }),
  signOut: () => {},
  mutate: async () => ({ ok: false, reason: 'auth', message: '认证上下文缺失' }),
  create: async () => ({ ok: false, reason: 'auth', message: '认证上下文缺失' }),
  remove: async () => ({ ok: false, reason: 'auth', message: '认证上下文缺失' }),
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  return useContext(AuthContext) ?? FALLBACK
}

/** 以 config.json 为唯一事实来源：白名单与角色都从配置读取，localStorage 里的旧角色不作数 */
function resolve(config: AppConfig | null, session: StoredSession | null): AuthState | null {
  if (!config || !session) return null
  const entry = matchAdmin(config, session.login)
  if (!entry) return null
  return { login: entry.login, role: entry.role }
}

export type AuthProviderProps = {
  config: AppConfig | null
  children: React.ReactNode
  /** 测试注入：不传则使用 localStorage */
  storage?: SessionStorage | null
  /** 测试注入：不传则在挂载后从存储恢复（SSR 与首帧一律按游客渲染，避免 hydration 不一致） */
  initialSession?: StoredSession | null
}

export function AuthProvider({ config, children, storage, initialSession }: AuthProviderProps) {
  const injected = initialSession !== undefined
  const [state, setState] = useState<AuthState | null>(() => {
    if (!injected) return null
    const resolved = resolve(config, initialSession ?? null)
    if (resolved && initialSession) tokenRef = initialSession.token
    return resolved
  })
  const [ready, setReady] = useState(injected)
  const storageRef = useRef<SessionStorage | null | undefined>(storage)

  const getStorage = useCallback((): SessionStorage | null => {
    if (storageRef.current === undefined) storageRef.current = browserStorage()
    return storageRef.current
  }, [])

  useEffect(() => {
    if (injected) return
    const session = readSession(getStorage())
    const restored = resolve(config, session)
    if (restored && session) {
      tokenRef = session.token
      setState(restored)
    } else {
      // 会话损坏或登录名已被移出白名单：连带清掉本地会话
      if (session) clearSession(getStorage())
      tokenRef = null
      setState(null)
    }
    setReady(true)
  }, [config, getStorage, injected])

  const signIn = useCallback(
    async (loginInput: string, token: string): Promise<WriteOutcome> => {
      if (!config) {
        return {
          ok: false,
          reason: 'server',
          message: '管理员配置不可用，请检查 public/data/config.json',
        }
      }
      const login = loginInput.trim()
      const check = await verifyLogin(login, token)
      if (!check.ok) return check

      const entry = matchAdmin(config, login)
      if (!entry) {
        return {
          ok: false,
          reason: 'auth',
          message: `「${login}」不在管理员名单中：请先在 public/data/config.json 的 admins 里加入该用户名，并等 Actions 重建完成`,
        }
      }

      tokenRef = token
      writeSession(getStorage(), { login: entry.login, token, role: entry.role })
      setState({ login: entry.login, role: entry.role })
      return { ok: true }
    },
    [config, getStorage],
  )

  const signOut = useCallback(() => {
    tokenRef = null
    clearSession(getStorage())
    setState(null)
  }, [getStorage])

  /**
   * 所有写入共用的前置关卡：返回本次可用的 {repo, token}，或失败结果。
   * 原则 ②：写入前惰性复验，token 过期 / 被撤销 / 被移出白名单都在此降级为游客。
   */
  const authorize = useCallback(async (): Promise<
    { ok: true; repo: AppConfig['repo']; token: string } | { ok: false; outcome: WriteOutcome }
  > => {
    const token = tokenRef
    const session = state
    if (!config || !token || !session) {
      return { ok: false, outcome: { ok: false, reason: 'auth', message: '登录状态已失效，请重新登录' } }
    }

    const check = await verifyLogin(session.login, token)
    if (!check.ok) {
      signOut()
      return { ok: false, outcome: check }
    }
    if (!matchAdmin(config, session.login)) {
      signOut()
      return {
        ok: false,
        outcome: {
          ok: false,
          reason: 'auth',
          message: `「${session.login}」已不在管理员名单中，已退出登录`,
        },
      }
    }
    return { ok: true, repo: config.repo, token }
  }, [config, signOut, state])

  /** 把 GitHub 的失败结果翻译成带操作指引的提示（设计文档 §6.5 原则 ③） */
  const explain = useCallback(
    (outcome: WriteOutcome): WriteOutcome => {
      if (outcome.ok) return outcome
      if (outcome.reason === 'auth') {
        signOut()
        return outcome
      }
      if (outcome.reason === 'permission' && config) {
        // 权限不足是最常见的配置错误，附上具体该勾哪些权限
        return { ...outcome, message: `${outcome.message}。${describeScopeRequirement(config)}` }
      }
      return outcome
    },
    [config, signOut],
  )

  const mutate = useCallback(
    async <T,>(opts: Omit<MutateOptions<T>, 'repo' | 'token'>): Promise<WriteOutcome> => {
      const gate = await authorize()
      if (!gate.ok) return gate.outcome
      return explain(await mutateData<T>({ ...opts, repo: gate.repo, token: gate.token }))
    },
    [authorize, explain],
  )

  const create = useCallback(
    async (opts: Omit<CreateOptions, 'repo' | 'token'>): Promise<WriteOutcome> => {
      const gate = await authorize()
      if (!gate.ok) return gate.outcome
      return explain(await createData({ ...opts, repo: gate.repo, token: gate.token }))
    },
    [authorize, explain],
  )

  const remove = useCallback(
    async (opts: Omit<DeleteOptions, 'repo' | 'token'>): Promise<WriteOutcome> => {
      const gate = await authorize()
      if (!gate.ok) return gate.outcome
      return explain(await deleteData({ ...opts, repo: gate.repo, token: gate.token }))
    },
    [authorize, explain],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      isAdmin: state !== null,
      role: state?.role ?? null,
      login: state?.login ?? null,
      scopeHint: config ? describeScopeRequirement(config) : null,
      signIn,
      signOut,
      mutate,
      create,
      remove,
    }),
    [ready, state, config, signIn, signOut, mutate, create, remove],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
