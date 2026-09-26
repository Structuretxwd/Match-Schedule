import type { Announcement, TournamentEvent } from '@/lib/data/schema'

export type EventEdit =
  | { kind: 'update-team'; teamId: string; name: string; players: string[] }
  | { kind: 'add-announcement'; content: string }
  | { kind: 'remove-announcement'; announcementId: string }

/** 「甲, 乙，丙」→ ['甲','乙','丙']；空项被丢弃 */
export function parsePlayers(text: string): string[] {
  return text
    .split(/[,，]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** 返回第一条错误信息；合法时返回 null。组件在提交前调用它来给出即时反馈 */
export function validateEventEdit(event: TournamentEvent, edit: EventEdit): string | null {
  switch (edit.kind) {
    case 'update-team':
      if (!event.teams.some((t) => t.id === edit.teamId)) return `队伍 ${edit.teamId} 不存在`
      if (edit.name.trim().length === 0) return '队伍名称不能为空'
      return null
    case 'add-announcement':
      if (edit.content.trim().length === 0) return '公告内容不能为空'
      return null
    case 'remove-announcement':
      if (!event.announcements.some((a) => a.id === edit.announcementId)) {
        return `公告 ${edit.announcementId} 不存在`
      }
      return null
  }
}

/** 公告 id 以 createdAt 为基准；同毫秒内多次添加时追加序号保证唯一 */
function nextAnnouncementId(event: TournamentEvent, now: string): string {
  const base = `a-${now}`
  if (!event.announcements.some((a) => a.id === base)) return base
  let n = 2
  while (event.announcements.some((a) => a.id === `${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/**
 * 纯函数：返回改动后的新赛事对象，绝不修改入参。
 * 目标不存在时抛错——mutateData() 会捕获并中止写入，因此不会把空改动提交到仓库。
 */
export function applyEventEdit(event: TournamentEvent, edit: EventEdit, now: string): TournamentEvent {
  switch (edit.kind) {
    case 'update-team': {
      if (!event.teams.some((t) => t.id === edit.teamId)) throw new Error(`队伍 ${edit.teamId} 不存在`)
      const players = edit.players.map((p) => p.trim()).filter((p) => p.length > 0)
      return {
        ...event,
        teams: event.teams.map((t) =>
          t.id === edit.teamId ? { ...t, name: edit.name.trim(), players: players.map((name) => ({ name })) } : t,
        ),
        updatedAt: now,
      }
    }
    case 'add-announcement': {
      const content = edit.content.trim()
      if (content.length === 0) throw new Error('公告内容不能为空')
      const announcement: Announcement = {
        id: nextAnnouncementId(event, now),
        content,
        createdAt: now,
      }
      return { ...event, announcements: [announcement, ...event.announcements], updatedAt: now }
    }
    case 'remove-announcement': {
      if (!event.announcements.some((a) => a.id === edit.announcementId)) {
        throw new Error(`公告 ${edit.announcementId} 不存在`)
      }
      return {
        ...event,
        announcements: event.announcements.filter((a) => a.id !== edit.announcementId),
        updatedAt: now,
      }
    }
  }
}
