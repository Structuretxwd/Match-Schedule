import type { AdminEntry, AppConfig } from './schema'

export type GhRepo = { owner: string; repo: string; branch: string }

export type FailureReason =
  | 'auth' // Token 缺失 / 无效 / 被撤销
  | 'permission' // Token 有效但缺少本仓库 Contents 写权限
  | 'conflict' // 并发冲突，自动重试后仍失败
  | 'network' // 无法连接 GitHub
  | 'server' // GitHub 返回其他错误（含限流）
  | 'invalid-data' // 远端内容无法解析

export type WriteOutcome = { ok: true } | { ok: false; reason: FailureReason; message: string }

const API = 'https://api.github.com'
const API_VERSION = '2022-11-28'
/** 409 后自动重试的上限：1 次正常尝试 + 2 次重试 */
const MAX_ATTEMPTS = 3

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** btoa/atob 只接受 Latin-1，中文队名会抛错，因此手动做 UTF-8 字节转换 */
export function toBase64Utf8(text: string): string {
  let binary = ''
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return decoder.decode(bytes)
}

class GhError extends Error {
  constructor(readonly reason: FailureReason, message: string) {
    super(message)
  }
}

function toOutcome(err: unknown): WriteOutcome {
  if (err instanceof GhError) return { ok: false, reason: err.reason, message: err.message }
  return {
    ok: false,
    reason: 'server',
    message: err instanceof Error ? err.message : '未知错误',
  }
}

async function ghFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${API}${url}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(init.headers ?? {}),
      },
    })
  } catch (err) {
    throw new GhError(
      'network',
      err instanceof Error ? `无法连接 GitHub：${err.message}` : '无法连接 GitHub',
    )
  }
}

/** 把非 2xx 响应翻译成带语义的错误；409/422 由调用方在更前面自行处理 */
function checkStatus(res: Response): void {
  if (res.ok) return
  if (res.status === 401) {
    throw new GhError('auth', 'Token 无效、已过期或被撤销，请在 GitHub 重新生成')
  }
  if (res.status === 403) {
    if (res.headers.get('x-ratelimit-remaining') === '0') {
      throw new GhError('server', 'GitHub API 请求次数已达上限，请稍后重试')
    }
    throw new GhError('permission', 'Token 权限不足：需要本仓库 Contents 的写权限')
  }
  throw new GhError('server', `GitHub 返回 HTTP ${res.status}`)
}

type RemoteFile = { sha: string; text: string }

async function getFile(url: string, token: string, branch: string): Promise<RemoteFile | null> {
  const res = await ghFetch(`${url}?ref=${encodeURIComponent(branch)}`, token)
  if (res.status === 404) return null
  checkStatus(res)
  const body = (await res.json()) as { sha?: unknown; content?: unknown }
  if (typeof body.sha !== 'string') throw new GhError('invalid-data', 'GitHub 返回的文件信息缺少 sha')
  if (typeof body.content !== 'string' || body.content === '') {
    throw new GhError('invalid-data', 'GitHub 返回的文件内容为空，可能不是普通文件')
  }
  return { sha: body.sha, text: fromBase64Utf8(body.content) }
}

function serialize(content: unknown): string {
  return toBase64Utf8(`${JSON.stringify(content, null, 2)}\n`)
}

/** 409（sha 过期）与 422（sha 不匹配 / 文件已存在）都表示并发冲突 */
function isConflict(status: number): boolean {
  return status === 409 || status === 422
}

async function putFile(args: {
  url: string
  token: string
  branch: string
  message: string
  content: unknown
  sha?: string
}): Promise<'ok' | 'conflict'> {
  const payload: Record<string, unknown> = {
    message: args.message,
    branch: args.branch,
    content: serialize(args.content),
  }
  if (args.sha) payload.sha = args.sha

  const res = await ghFetch(args.url, args.token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  if (isConflict(res.status)) return 'conflict'
  checkStatus(res)
  return 'ok'
}

async function removeFile(args: {
  url: string
  token: string
  branch: string
  message: string
  sha: string
}): Promise<'ok' | 'conflict'> {
  const res = await ghFetch(args.url, args.token, {
    method: 'DELETE',
    body: JSON.stringify({ message: args.message, branch: args.branch, sha: args.sha }),
  })
  if (isConflict(res.status)) return 'conflict'
  checkStatus(res)
  return 'ok'
}

export async function verifyLogin(login: string, token: string): Promise<WriteOutcome> {
  try {
    const res = await ghFetch('/user', token)
    checkStatus(res)
    const body = (await res.json()) as { login?: unknown }
    if (typeof body.login !== 'string') {
      throw new GhError('auth', 'GitHub 返回了无法识别的用户信息')
    }
    if (body.login.toLowerCase() !== login.trim().toLowerCase()) {
      throw new GhError('auth', `该 Token 属于 ${body.login}，与填写的用户名「${login}」不一致`)
    }
    return { ok: true }
  } catch (err) {
    return toOutcome(err)
  }
}

export function matchAdmin(config: AppConfig, login: string): AdminEntry | null {
  const target = login.trim().toLowerCase()
  return config.admins.find((a) => a.login.toLowerCase() === target) ?? null
}

export function describeScopeRequirement(config: AppConfig): string {
  const { contents, path } = config.requiredTokenScopes
  return `需要一个 fine-grained Token：仅限仓库 ${config.repo.owner}/${config.repo.repo}，Repository permissions → Contents: ${contents}，且仅授权 ${path} 路径`
}

export type MutateOptions<T> = {
  repo: GhRepo
  token: string
  /** 仓库内路径，如 public/data/events/spring-2026.json */
  path: string
  /** 把远端 JSON 解析为领域对象；解析失败即中止写入，避免写坏数据 */
  parse: (raw: unknown) => T
  mutate: (current: T) => T
  /** 提交信息，格式 chore(data): <赛事名> <操作描述> */
  message: string
}

/**
 * 唯一写入入口：GET 取 sha → 应用 mutate → PUT 提交。
 * 冲突时重新 GET 并把本次改动重放到最新内容之上，避免覆盖他人并发提交（设计文档 §10.1）。
 */
export async function mutateData<T>(opts: MutateOptions<T>): Promise<WriteOutcome> {
  const url = `/repos/${opts.repo.owner}/${opts.repo.repo}/contents/${opts.path}`
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const current = await getFile(url, opts.token, opts.repo.branch)
      if (!current) throw new GhError('invalid-data', `仓库中不存在 ${opts.path}，无法修改`)

      let next: T
      try {
        next = opts.mutate(opts.parse(JSON.parse(current.text)))
      } catch (err) {
        if (err instanceof GhError) throw err
        throw new GhError(
          'invalid-data',
          `远端数据无法解析或本次改动不合法，已中止写入：${err instanceof Error ? err.message : '未知错误'}`,
        )
      }

      const result = await putFile({
        url,
        token: opts.token,
        branch: opts.repo.branch,
        message: opts.message,
        content: next,
        sha: current.sha,
      })
      if (result === 'ok') return { ok: true }
    }
    throw new GhError('conflict', '数据已被他人同时修改，自动重试仍未成功，请刷新后重试')
  } catch (err) {
    return toOutcome(err)
  }
}

export type CreateOptions = {
  repo: GhRepo
  token: string
  path: string
  content: unknown
  message: string
}

/** 新建文件；文件已存在时返回 conflict，绝不覆盖 */
export async function createData(opts: CreateOptions): Promise<WriteOutcome> {
  const url = `/repos/${opts.repo.owner}/${opts.repo.repo}/contents/${opts.path}`
  try {
    const existing = await getFile(url, opts.token, opts.repo.branch)
    if (existing) throw new GhError('conflict', `${opts.path} 已存在，无法重复创建`)

    const result = await putFile({
      url,
      token: opts.token,
      branch: opts.repo.branch,
      message: opts.message,
      content: opts.content,
    })
    if (result === 'conflict') {
      throw new GhError('conflict', `${opts.path} 已被他人创建，请刷新后重试`)
    }
    return { ok: true }
  } catch (err) {
    return toOutcome(err)
  }
}

export type DeleteOptions = { repo: GhRepo; token: string; path: string; message: string }

export async function deleteData(opts: DeleteOptions): Promise<WriteOutcome> {
  const url = `/repos/${opts.repo.owner}/${opts.repo.repo}/contents/${opts.path}`
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const current = await getFile(url, opts.token, opts.repo.branch)
      if (!current) throw new GhError('invalid-data', `仓库中不存在 ${opts.path}，无需删除`)

      const result = await removeFile({
        url,
        token: opts.token,
        branch: opts.repo.branch,
        message: opts.message,
        sha: current.sha,
      })
      if (result === 'ok') return { ok: true }
    }
    throw new GhError('conflict', '数据已被他人同时修改，自动重试仍未成功，请刷新后重试')
  } catch (err) {
    return toOutcome(err)
  }
}
