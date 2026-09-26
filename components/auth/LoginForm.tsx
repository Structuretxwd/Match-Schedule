'use client'

import { useState } from 'react'
import { useAuth } from './AuthProvider'

export function LoginForm() {
  const { signIn, scopeHint } = useAuth()
  const [login, setLogin] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const outcome = await signIn(login, token)
    setBusy(false)
    if (outcome.ok) {
      setToken('')
      return
    }
    setError(outcome.message)
  }

  const disabled = busy || login.trim() === '' || token.trim() === ''

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded border border-line bg-panel p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-medium">管理员登录</h2>
        <p className="text-xs text-muted">
          使用 GitHub 账号登录，站内不需要注册。Token 只保存在你自己的浏览器里，登出即清除。
        </p>
      </div>

      <label className="block space-y-1 text-xs">
        <span className="text-muted">GitHub 用户名</span>
        <input
          name="login"
          value={login}
          autoComplete="username"
          placeholder="octocat"
          onChange={(e) => setLogin(e.target.value)}
          className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
        />
      </label>

      <label className="block space-y-1 text-xs">
        <span className="text-muted">Fine-grained Token</span>
        <input
          name="token"
          type="password"
          value={token}
          autoComplete="current-password"
          placeholder="github_pat_..."
          onChange={(e) => setToken(e.target.value)}
          className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
        />
      </label>

      {scopeHint ? (
        <p className="rounded border border-line bg-panel-hi px-2 py-1.5 text-[11px] leading-relaxed text-muted">
          {scopeHint}
        </p>
      ) : (
        <p className="text-[11px] text-danger">管理员配置不可用，登录功能已禁用。</p>
      )}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={disabled}
        className="rounded border border-wb px-3 py-1.5 text-sm text-wb hover:bg-wb/10 disabled:opacity-40"
      >
        {busy ? '验证中...' : '登录'}
      </button>
    </form>
  )
}
