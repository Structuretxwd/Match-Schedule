import { generateTemplate } from '@/lib/bracket/generate'
import { isValidBO } from '@/lib/bracket/validate'
import { isValidBracketSize, MAX_BRACKET_SIZE, MIN_BRACKET_SIZE, type StoredMatch, type Team, type TournamentEvent, type TournamentFormat } from '@/lib/data/schema'

export type NewEventInput = {
  id: string
  name: string
  format: TournamentFormat
  /** 参赛人数。双败只能 4/8/16/32；单败为 4–32 中任意整数 */
  bracketSize: number
  defaultBO: number
  grandFinalBO: number
  /** 长度必须等于 bracketSize。双败为种子顺序；单败仅作为参赛名单，创建时随机抽签落位 */
  teamNames: string[]
  /** 注入当前时间，便于测试 */
  now: string
  /** 单败抽签用的随机源，返回 [0, 1)；注入固定序列即可复现签表 */
  random?: () => number
}

/** Fisher–Yates 洗牌：返回新数组，不改动入参 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
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
  if (!isValidBracketSize(input.format, input.bracketSize)) {
    return input.format === 'double-elimination'
      ? '双败的签表规模只能是 4 / 8 / 16 / 32'
      : `单败的参赛人数需在 ${MIN_BRACKET_SIZE}–${MAX_BRACKET_SIZE} 之间`
  }
  if (input.teamNames.length !== input.bracketSize) {
    return `需要 ${input.bracketSize} 个选手名称，当前 ${input.teamNames.length} 个`
  }
  const names = input.teamNames.map((n) => n.trim())
  if (names.some((n) => n.length === 0)) return '选手名称不能为空'
  if (new Set(names).size !== names.length) return '选手名称不能重复'
  return null
}

/** 调整选手名称输入框数量：扩容补默认名，缩容截断 */
export function resizeTeamNames(current: string[], next: number): string[] {
  return Array.from({ length: next }, (_, i) => current[i] ?? `选手 ${i + 1}`)
}

/**
 * 生成一份全新的赛事数据：签表模板来自 generateTemplate()，
 * 与推进引擎共用同一份模板，保证生成的对阵图不会有孤儿场次。
 *
 * 单败在创建时随机抽签：选手整体打乱后按签位落座，因此录入顺序不影响签位，
 * 轮空名额（补签后多出的签位）也随之落到抽到该位置的选手头上。
 * 双败按 2 的幂满签、没有轮空，仍按录入顺序对号入座。
 */
export function buildNewEvent(input: NewEventInput): TournamentEvent {
  const names = input.teamNames.map((n) => n.trim())
  const drawn = input.format === 'single-elimination' ? shuffle(names, input.random ?? Math.random) : names

  const teams: Team[] = drawn.map((name, i) => ({
    id: `t${i + 1}`,
    name,
    seed: i + 1,
    players: [],
    logo: null,
  }))

  const matches: StoredMatch[] = generateTemplate(input.bracketSize, input.format).matches.map((tpl) => ({
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
    format: input.format,
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
