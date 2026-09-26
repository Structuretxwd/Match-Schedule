import { generateTemplate } from '@/lib/bracket/generate'
import { isValidBO } from '@/lib/bracket/validate'
import type { StoredMatch, Team, TournamentEvent } from '@/lib/data/schema'

export type NewEventInput = {
  id: string
  name: string
  /** 4 | 8 | 16 | 32 */
  bracketSize: 4 | 8 | 16 | 32
  defaultBO: number
  grandFinalBO: number
  /** 长度必须等于 bracketSize；顺序即种子顺序 */
  teamNames: string[]
  /** 注入当前时间，便于测试 */
  now: string
}

/** 赛事 ID 会同时成为文件名与网址路径段，因此限制得比普通字符串更严 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/

export function eventFilePath(eventId: string): string {
  return `public/data/events/${eventId}.json`
}

/** 返回第一条错误信息；合法时返回 null */
export function validateNewEvent(input: NewEventInput): string | null {
  if (!ID_PATTERN.test(input.id)) {
    return '赛事 ID 只能用小写字母、数字与连字符，需以字母或数字开头、不超过 40 个字符（它会成为文件名与网址的一部分）'
  }
  if (input.name.trim().length === 0) return '赛事名称不能为空'
  if (!isValidBO(input.defaultBO)) return '默认 BO 只能是 1 / 3 / 5 / 7'
  if (!isValidBO(input.grandFinalBO)) return '总决赛 BO 只能是 1 / 3 / 5 / 7'
  if (input.teamNames.length !== input.bracketSize) {
    return `需要 ${input.bracketSize} 个队伍名称，当前 ${input.teamNames.length} 个`
  }
  const names = input.teamNames.map((n) => n.trim())
  if (names.some((n) => n.length === 0)) return '队伍名称不能为空'
  if (new Set(names).size !== names.length) return '队伍名称不能重复'
  return null
}

/** 调整队伍名称输入框数量：扩容补默认名，缩容截断 */
export function resizeTeamNames(current: string[], next: number): string[] {
  return Array.from({ length: next }, (_, i) => current[i] ?? `队伍 ${i + 1}`)
}

/**
 * 生成一份全新的赛事数据：签表模板来自 generateTemplate()，
 * 与推进引擎共用同一份模板，保证生成的对阵图不会有孤儿场次。
 */
export function buildNewEvent(input: NewEventInput): TournamentEvent {
  const teams: Team[] = input.teamNames.map((raw, i) => ({
    id: `t${i + 1}`,
    name: raw.trim(),
    seed: i + 1,
    players: [],
    logo: null,
  }))

  const matches: StoredMatch[] = generateTemplate(input.bracketSize).matches.map((tpl) => ({
    id: tpl.id,
    bracket: tpl.bracket,
    round: tpl.round,
    index: tpl.index,
    bo: tpl.bracket === 'GF' ? input.grandFinalBO : input.defaultBO,
    scoreA: null,
    scoreB: null,
    live: false,
    scheduledAt: null,
    referee: null,
    streamUrl: null,
    note: null,
  }))

  return {
    id: input.id,
    name: input.name.trim(),
    format: 'double-elimination',
    bracketSize: input.bracketSize,
    status: 'draft',
    defaultBO: input.defaultBO,
    grandFinalBO: input.grandFinalBO,
    teams,
    matches,
    announcements: [],
    updatedAt: input.now,
  }
}
