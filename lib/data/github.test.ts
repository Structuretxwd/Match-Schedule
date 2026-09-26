import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from './schema'
import {
  createData,
  deleteData,
  describeScopeRequirement,
  fromBase64Utf8,
  matchAdmin,
  mutateData,
  toBase64Utf8,
  verifyLogin,
} from './github'

const REPO = { owner: 'octo', repo: 'match-schedule', branch: 'main' }

const CONFIG: AppConfig = {
  repo: REPO,
  admins: [{ login: 'Alice', role: 'admin' }],
  requiredTokenScopes: { contents: 'write', path: 'public/data/' },
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

type Call = { url: string; init: RequestInit }

/** 按顺序返回预设响应；调用方可通过返回的 calls 断言实际发出的请求 */
function queueFetch(responses: Array<() => Response>): Call[] {
  const calls: Call[] = []
  let cursor = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} })
      const make = responses[Math.min(cursor, responses.length - 1)]
      cursor += 1
      return make()
    }),
  )
  return calls
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('base64 编解码', () => {
  it('中文与 emoji 往返一致', () => {
    const text = '{\n  "name": "赤霄战队 🏆"\n}'
    expect(fromBase64Utf8(toBase64Utf8(text))).toBe(text)
  })
})

describe('matchAdmin', () => {
  it('用户名大小写不敏感', () => {
    expect(matchAdmin(CONFIG, 'alice')?.role).toBe('admin')
    expect(matchAdmin(CONFIG, '  ALICE  ')?.role).toBe('admin')
  })

  it('不在白名单返回 null', () => {
    expect(matchAdmin(CONFIG, 'mallory')).toBeNull()
  })
})

describe('describeScopeRequirement', () => {
  it('说明仓库、权限与路径范围', () => {
    const hint = describeScopeRequirement(CONFIG)
    expect(hint).toContain('octo/match-schedule')
    expect(hint).toContain('public/data/')
  })
})

describe('verifyLogin', () => {
  it('Token 属于他人时拒绝登录', async () => {
    queueFetch([() => jsonResponse(200, { login: 'someone-else' })])
    const outcome = await verifyLogin('alice', 'tok')
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toBe('auth')
  })

  it('401 归类为鉴权失败', async () => {
    queueFetch([() => jsonResponse(401, { message: 'Bad credentials' })])
    const outcome = await verifyLogin('alice', 'tok')
    expect(outcome.ok === false && outcome.reason).toBe('auth')
  })

  it('网络异常归类为 network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    const outcome = await verifyLogin('alice', 'tok')
    expect(outcome.ok === false && outcome.reason).toBe('network')
  })

  it('用户名一致时通过', async () => {
    const calls = queueFetch([() => jsonResponse(200, { login: 'Alice' })])
    await expect(verifyLogin(' alice ', 'tok')).resolves.toEqual({ ok: true })
    expect(calls[0].url).toBe('https://api.github.com/user')
  })
})

describe('mutateData', () => {
  // scoreA/scoreB 稍后会被 mutate 改成数字，必须显式放宽为 number | null，否则 strict 下只能推断出字面量类型 null
  const current = { id: 'spring-2026', matches: [{ id: 'WB-R1-M1', scoreA: null as number | null, scoreB: null as number | null }] }

  it('读取现有内容、应用变更后携带 sha 提交', async () => {
    const calls = queueFetch([
      () => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8(JSON.stringify(current)) }),
      () => jsonResponse(200, { content: { sha: 'sha-2' } }),
    ])

    const outcome = await mutateData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/spring-2026.json',
      parse: (raw) => raw as typeof current,
      mutate: (cur) => ({ ...cur, matches: [{ ...cur.matches[0], scoreA: 2, scoreB: 0 }] }),
      message: 'chore(data): 2026 春季赛 录入比分 WB-R1-M1',
    })

    expect(outcome).toEqual({ ok: true })
    expect(calls[0].url).toContain('/repos/octo/match-schedule/contents/public/data/events/spring-2026.json')
    expect(calls[0].url).toContain('ref=main')

    const put = calls[1]
    expect(put.init.method).toBe('PUT')
    const body = bodyOf(put)
    expect(body.sha).toBe('sha-1')
    expect(body.branch).toBe('main')
    expect(body.message).toBe('chore(data): 2026 春季赛 录入比分 WB-R1-M1')
    expect(JSON.parse(fromBase64Utf8(String(body.content))).matches[0].scoreA).toBe(2)
  })

  it('409 冲突后重新拉取最新内容并重放本次改动', async () => {
    const latest = {
      id: 'spring-2026',
      note: '他人刚加的备注',
      matches: [{ id: 'WB-R1-M1', scoreA: 1, scoreB: 0 }],
    }
    const calls = queueFetch([
      () => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8(JSON.stringify(current)) }),
      () => jsonResponse(409, { message: 'sha does not match' }),
      () => jsonResponse(200, { sha: 'sha-3', content: toBase64Utf8(JSON.stringify(latest)) }),
      () => jsonResponse(200, { content: { sha: 'sha-4' } }),
    ])

    const outcome = await mutateData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/spring-2026.json',
      parse: (raw) => raw as typeof current,
      mutate: (cur) => ({ ...cur, matches: [{ ...cur.matches[0], scoreA: 2, scoreB: 0 }] }),
      message: 'chore(data): 测试 录入比分',
    })

    expect(outcome).toEqual({ ok: true })
    expect(calls).toHaveLength(4)
    const finalBody = bodyOf(calls[3])
    expect(finalBody.sha).toBe('sha-3')
    const written = JSON.parse(fromBase64Utf8(String(finalBody.content)))
    expect(written.matches[0].scoreA).toBe(2)
    expect(written.note).toBe('他人刚加的备注')
  })

  it('连续冲突时返回 conflict 提示刷新重试', async () => {
    queueFetch([
      () => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8(JSON.stringify(current)) }),
      () => jsonResponse(409, { message: 'conflict' }),
      () => jsonResponse(200, { sha: 'sha-2', content: toBase64Utf8(JSON.stringify(current)) }),
      () => jsonResponse(409, { message: 'conflict' }),
      () => jsonResponse(200, { sha: 'sha-3', content: toBase64Utf8(JSON.stringify(current)) }),
      () => jsonResponse(409, { message: 'conflict' }),
    ])

    const outcome = await mutateData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/spring-2026.json',
      parse: (raw) => raw as typeof current,
      mutate: (cur) => cur,
      message: 'chore(data): 测试',
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toBe('conflict')
  })

  it('403 归类为权限不足', async () => {
    queueFetch([() => jsonResponse(403, { message: 'Resource not accessible' })])
    const outcome = await mutateData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/spring-2026.json',
      parse: (raw) => raw as typeof current,
      mutate: (cur) => cur,
      message: 'chore(data): 测试',
    })
    expect(outcome.ok === false && outcome.reason).toBe('permission')
  })

  it('远端内容无法解析时中止写入，绝不写坏数据', async () => {
    queueFetch([() => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8('{ 不是 JSON') })])
    const outcome = await mutateData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/spring-2026.json',
      parse: (raw) => raw as typeof current,
      mutate: (cur) => cur,
      message: 'chore(data): 测试',
    })
    expect(outcome.ok === false && outcome.reason).toBe('invalid-data')
  })
})

describe('createData', () => {
  it('文件已存在时拒绝创建', async () => {
    queueFetch([() => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8('{}') })])
    const outcome = await createData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/new.json',
      content: { id: 'new' },
      message: 'chore(data): 创建赛事',
    })
    expect(outcome.ok === false && outcome.reason).toBe('conflict')
  })

  it('文件不存在时提交新内容（不带 sha）', async () => {
    const calls = queueFetch([
      () => jsonResponse(404, { message: 'Not Found' }),
      () => jsonResponse(201, { content: { sha: 'sha-new' } }),
    ])
    const outcome = await createData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/new.json',
      content: { id: 'new' },
      message: 'chore(data): 创建赛事',
    })
    expect(outcome).toEqual({ ok: true })
    const body = bodyOf(calls[1])
    expect(body.sha).toBeUndefined()
    expect(JSON.parse(fromBase64Utf8(String(body.content))).id).toBe('new')
  })
})

describe('deleteData', () => {
  it('先取 sha 再删除', async () => {
    const calls = queueFetch([
      () => jsonResponse(200, { sha: 'sha-1', content: toBase64Utf8('{}') }),
      () => jsonResponse(200, { commit: {} }),
    ])
    const outcome = await deleteData({
      repo: REPO,
      token: 'tok',
      path: 'public/data/events/old.json',
      message: 'chore(data): 删除赛事',
    })
    expect(outcome).toEqual({ ok: true })
    expect(calls[1].init.method).toBe('DELETE')
    expect(bodyOf(calls[1]).sha).toBe('sha-1')
  })
})
