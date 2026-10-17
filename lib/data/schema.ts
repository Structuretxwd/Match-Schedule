export type BracketKind = 'WB' | 'LB' | 'GF'
export type TournamentFormat = 'double-elimination' | 'single-elimination'
export type EventStatus = 'draft' | 'ongoing' | 'finished'
export type Role = 'admin' | 'referee'

export type Player = { name: string }

export type Team = {
  id: string
  name: string
  seed: number
  players: Player[]
  logo: string | null
}

export type StoredMatch = {
  id: string
  bracket: BracketKind
  round: number
  index: number
  bo: number
  scoreA: number | null
  scoreB: number | null
  live: boolean
  scheduledAt: string | null
  referee: string | null
  streamUrl: string | null
  note: string | null
}

export type Announcement = { id: string; content: string; createdAt: string }

export type TournamentEvent = {
  id: string
  name: string
  format: TournamentFormat
  /** 参赛人数。双败必须为 2 的幂；单败可任意，签位数由内部补齐 */
  bracketSize: number
  status: EventStatus
  defaultBO: number
  grandFinalBO: number
  teams: Team[]
  matches: StoredMatch[]
  announcements: Announcement[]
  updatedAt: string
}

export type EventSummary = {
  id: string
  name: string
  format: TournamentFormat
  bracketSize: number
  status: EventStatus
  finishedMatches: number
  totalMatches: number
  updatedAt: string
}

export type AdminEntry = { login: string; role: Role }

/** 数据仓库位置：管理员的写操作需要它来拼 GitHub Contents API 的地址 */
export type RepoConfig = { owner: string; repo: string; branch: string }

export type AppConfig = {
  repo: RepoConfig
  admins: AdminEntry[]
  requiredTokenScopes: { contents: string; path: string }
}

export class SchemaError extends Error {
  constructor(readonly path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'SchemaError'
  }
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new SchemaError(path, '应为对象')
  }
  return v as Record<string, unknown>
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) throw new SchemaError(path, '应为数组')
  return v
}

function nonEmptyStr(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new SchemaError(path, '应为字符串')
  if (v.length === 0) throw new SchemaError(path, '不应为空字符串')
  return v
}

function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new SchemaError(path, '应为整数')
  return v
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new SchemaError(path, '应为布尔值')
  return v
}

function numOrNull(v: unknown, path: string): number | null {
  if (v === null) return null
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new SchemaError(path, '应为数字或 null')
  }
  return v
}

function strOrNull(v: unknown, path: string): string | null {
  if (v === null) return null
  if (typeof v !== 'string') throw new SchemaError(path, '应为字符串或 null')
  return v
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  if (typeof v !== 'string') throw new SchemaError(path, '应为字符串')
  if (!(allowed as readonly string[]).includes(v)) {
    throw new SchemaError(path, `应为 ${allowed.join(' | ')} 之一，实际为 ${v}`)
  }
  return v as T
}

const VALID_BO = [1, 3, 5, 7] as const
export const VALID_FORMATS = ['double-elimination', 'single-elimination'] as const
/** 双败的败者组轮次与场次都按 2 的幂推导，因此规模必须严格是 4/8/16/32 */
const DOUBLE_ELIM_SIZES = [4, 8, 16, 32] as const
export const MIN_BRACKET_SIZE = 4
export const MAX_BRACKET_SIZE = 32

function checkBO(v: unknown, path: string): number {
  const n = int(v, path)
  if (!(VALID_BO as readonly number[]).includes(n)) {
    throw new SchemaError(path, `应为 1/3/5/7 之一，实际为 ${n}`)
  }
  return n
}

export function isValidBracketSize(format: TournamentFormat, v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return false
  if (format === 'double-elimination') {
    return (DOUBLE_ELIM_SIZES as readonly number[]).includes(v)
  }
  return v >= MIN_BRACKET_SIZE && v <= MAX_BRACKET_SIZE
}

function bracketSizeRule(format: TournamentFormat): string {
  return format === 'double-elimination'
    ? '双败的签表规模应为 4/8/16/32 之一'
    : `单败的参赛人数应为 ${MIN_BRACKET_SIZE}–${MAX_BRACKET_SIZE} 之间的整数`
}

function parseTeam(v: unknown, path: string): Team {
  const o = obj(v, path)
  return {
    id: nonEmptyStr(o.id, `${path}.id`),
    name: nonEmptyStr(o.name, `${path}.name`),
    seed: int(o.seed, `${path}.seed`),
    players: arr(o.players, `${path}.players`).map((p, i) => ({
      name: nonEmptyStr(obj(p, `${path}.players[${i}]`).name, `${path}.players[${i}].name`),
    })),
    logo: strOrNull(o.logo, `${path}.logo`),
  }
}

function parseStoredMatch(v: unknown, path: string): StoredMatch {
  const o = obj(v, path)
  return {
    id: nonEmptyStr(o.id, `${path}.id`),
    bracket: oneOf(o.bracket, `${path}.bracket`, ['WB', 'LB', 'GF'] as const),
    round: int(o.round, `${path}.round`),
    index: int(o.index, `${path}.index`),
    bo: checkBO(o.bo, `${path}.bo`),
    scoreA: numOrNull(o.scoreA, `${path}.scoreA`),
    scoreB: numOrNull(o.scoreB, `${path}.scoreB`),
    live: bool(o.live, `${path}.live`),
    scheduledAt: strOrNull(o.scheduledAt, `${path}.scheduledAt`),
    referee: strOrNull(o.referee, `${path}.referee`),
    streamUrl: strOrNull(o.streamUrl, `${path}.streamUrl`),
    note: strOrNull(o.note, `${path}.note`),
  }
}

function parseAnnouncement(v: unknown, path: string): Announcement {
  const o = obj(v, path)
  return {
    id: nonEmptyStr(o.id, `${path}.id`),
    content: nonEmptyStr(o.content, `${path}.content`),
    createdAt: nonEmptyStr(o.createdAt, `${path}.createdAt`),
  }
}

export function parseEvent(v: unknown): TournamentEvent {
  const o = obj(v, 'event')
  const format = oneOf(o.format, 'event.format', VALID_FORMATS)
  const bracketSize = int(o.bracketSize, 'event.bracketSize')
  if (!isValidBracketSize(format, bracketSize)) {
    throw new SchemaError('event.bracketSize', `${bracketSizeRule(format)}，实际为 ${bracketSize}`)
  }
  return {
    id: nonEmptyStr(o.id, 'event.id'),
    name: nonEmptyStr(o.name, 'event.name'),
    format,
    bracketSize,
    status: oneOf(o.status, 'event.status', ['draft', 'ongoing', 'finished'] as const),
    defaultBO: checkBO(o.defaultBO, 'event.defaultBO'),
    grandFinalBO: checkBO(o.grandFinalBO, 'event.grandFinalBO'),
    teams: arr(o.teams, 'event.teams').map((t, i) => parseTeam(t, `event.teams[${i}]`)),
    matches: arr(o.matches, 'event.matches').map((m, i) =>
      parseStoredMatch(m, `event.matches[${i}]`),
    ),
    announcements: arr(o.announcements, 'event.announcements').map((a, i) =>
      parseAnnouncement(a, `event.announcements[${i}]`),
    ),
    updatedAt: nonEmptyStr(o.updatedAt, 'event.updatedAt'),
  }
}

export function parseConfig(v: unknown): AppConfig {
  const o = obj(v, 'config')
  const repo = obj(o.repo, 'config.repo')
  const scopes = obj(o.requiredTokenScopes, 'config.requiredTokenScopes')
  return {
    repo: {
      owner: nonEmptyStr(repo.owner, 'config.repo.owner'),
      repo: nonEmptyStr(repo.repo, 'config.repo.repo'),
      branch: nonEmptyStr(repo.branch, 'config.repo.branch'),
    },
    admins: arr(o.admins, 'config.admins').map((a, i) => {
      const path = `config.admins[${i}]`
      const e = obj(a, path)
      return {
        login: nonEmptyStr(e.login, `${path}.login`),
        role: oneOf(e.role, `${path}.role`, ['admin', 'referee'] as const),
      }
    }),
    requiredTokenScopes: {
      contents: nonEmptyStr(scopes.contents, 'config.requiredTokenScopes.contents'),
      path: nonEmptyStr(scopes.path, 'config.requiredTokenScopes.path'),
    },
  }
}

export function summarize(ev: TournamentEvent): EventSummary {
  return {
    id: ev.id,
    name: ev.name,
    format: ev.format,
    bracketSize: ev.bracketSize,
    status: ev.status,
    finishedMatches: ev.matches.filter((m) => m.scoreA !== null && m.scoreB !== null).length,
    totalMatches: ev.matches.length,
    updatedAt: ev.updatedAt,
  }
}
