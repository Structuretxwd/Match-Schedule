# 双败淘汰赛程网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个部署在 GitHub Pages 的双败淘汰制赛程网站：观众直接访问即可查看对阵图、比分与晋级路径；管理员通过 GitHub 凭证在页面上录入比分，改动经 GitHub API 自动提交并触发重建。

**Architecture:** Next.js App Router 静态导出（`output: 'export'`）+ Tailwind CSS 深色主题。数据以 JSON 存放于 `public/data/`，构建期由 `fs` 读取、运行时由浏览器 `fetch` 轮询。赛程对阵关系**不存储**，由纯函数 `deriveBracket(种子, 结果)` 实时推导，因此改任何一场比分后下游自动重算。所有写操作收敛到单一 `mutateData()`，写入前惰性复验 token。

**Tech Stack:** Next.js 15（App Router）、React 19、TypeScript、Tailwind CSS 4、Vitest 3。零运行时依赖（不引入 zod / octokit / swr）。

**参考文档：** [设计文档](file:///d:/project/TraeProject/Match%20Schedule/docs/superpowers/specs/2026-09-25-double-elimination-bracket-site-design.md)

---

## 阶段划分与验收点

| 阶段 | 任务 | 完成后可验证的成果 |
|---|---|---|
| Phase 0 | 1-4 | 项目可 `npm run dev`；数据层与校验有测试覆盖 |
| Phase 1 | 5-8 | 赛制引擎与布局算法全部通过单测（核心风险已消除） |
| Phase 2 | 9-14 | **观众端完整可用**：赛事列表 + 对阵图 + 赛程 + 队伍 + 30s 轮询 |
| Phase 3 | 15-18 | 管理员可登录并录入比分，改动提交到 GitHub |
| Phase 4 | 19-21 | 后台赛事 CRUD + Actions 自动部署 |

Phase 2 结束是自然里程碑：站点已可上线供观众使用，只是还不能改数据。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `package.json` / `next.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `vitest.config.ts` | 构建与测试配置 |
| `app/globals.css` | Tailwind 引入 + HLTV 深色主题 token |
| `app/layout.tsx` | 全局布局：深色背景、站点头部 |
| `app/page.tsx` | 赛事列表 |
| `app/event/[id]/layout.tsx` | 赛事子导航（对阵图 / 赛程 / 队伍） |
| `app/event/[id]/page.tsx` | 对阵图主视图 |
| `app/event/[id]/schedule/page.tsx` | 时间顺序赛程列表 |
| `app/event/[id]/teams/page.tsx` | 队伍、选手、战绩、状态 |
| `app/admin/page.tsx` | 后台路由：构建期取赛事清单，交给 `AdminPage` |
| `components/admin/AdminPage.tsx` | 后台容器：登录状态、赛事列表、待生效提示 |
| `components/admin/CreateEventForm.tsx` | 创建赛事表单 |
| `components/admin/EventList.tsx` | 赛事列表 + 删除确认（需输入 ID） |
| `components/admin/EventEditPanel.tsx` | 队伍与公告编辑面板 |
| `lib/admin/newEvent.ts` | 新建赛事的校验与数据构建（纯函数） |
| `lib/admin/editEvent.ts` | 队伍 / 公告编辑（纯函数） |
| `lib/data/schema.ts` | 类型定义 + 运行时校验 |
| `lib/data/load.ts` | 构建期读取数据（`fs`） |
| `lib/data/github.ts` | GitHub API：登录验证、`mutateData`、`createData`、`deleteData` |
| `lib/bracket/generate.ts` | 签表模板生成（纯函数） |
| `lib/bracket/validate.ts` | BO 与比分校验（纯函数） |
| `lib/bracket/advance.ts` | 推进引擎：模板 + 结果 → 对阵与队伍状态（纯函数） |
| `lib/bracket/layout.ts` | 对阵图坐标与连接线计算（纯函数） |
| `lib/auth/session.ts` | 版本化会话存储（`ms.auth.v1`） |
| `lib/urls.ts` | `basePath` 与 URL 构造 |
| `lib/view.ts` | 展示层纯函数：时间格式化、赛程分组、队伍排序、连接线视图 |
| `lib/useEventData.ts` | 轮询 hook + 待生效改动叠加 |
| `components/BracketView.tsx` | 对阵图容器：滚动、缩放、分区标签 |
| `components/MatchCard.tsx` | 单场对阵卡片 |
| `components/Connectors.tsx` | SVG 连接线层 |
| `components/MatchDetailDialog.tsx` | 比赛详情 / 录分弹窗 |
| `components/ScheduleView.tsx` | 赛程列表视图 |
| `components/TeamsView.tsx` | 队伍表视图 |
| `components/EventClient.tsx` | 赛事客户端容器：轮询、视图切换、选中比赛、详情弹窗 |
| `components/auth/AuthProvider.tsx` | 认证上下文：只暴露 `isAdmin` / `role` / `login` / `signIn` / `signOut` / `mutate` / `create` / `remove` |
| `components/auth/AdminGate.tsx` | 管理功能包裹组件 |
| `components/auth/LoginForm.tsx` | 登录表单 |
| `public/data/config.json` | 管理员白名单 |
| `public/data/events/*.json` | 赛事数据 |
| `.github/workflows/deploy.yml` | 构建并部署到 Pages |
| `README.md` | 部署步骤、PAT 授权、日常运维说明 |

---

## Phase 0：脚手架与数据层

### Task 1：项目脚手架

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `vitest.config.ts`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1：写入 `package.json`**

```json
{
  "name": "match-schedule",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2：写入 `next.config.ts`**

`basePath` 从环境变量读取，是部署到 Pages 项目站点的关键；`trailingSlash: true` 让 `out/event/x/index.html` 能被 `/event/x/` 正确访问。

```ts
import type { NextConfig } from 'next'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true },
}

export default nextConfig
```

- [ ] **Step 3：写入 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "out", "docs"]
}
```

- [ ] **Step 4：写入 `postcss.config.mjs`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

- [ ] **Step 5：写入 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // tsconfig 里 jsx 为 "preserve"（Next.js 要求），Vitest 需要显式覆盖为 automatic
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
```

- [ ] **Step 6：写入 `app/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-base: #0f141b;
  --color-panel: #171f29;
  --color-panel-hi: #1e2833;
  --color-line: #2b3745;
  --color-fg: #d5dee9;
  --color-muted: #8296ab;
  --color-wb: #34d399;
  --color-wb-soft: #10291f;
  --color-lb: #fbbf24;
  --color-lb-soft: #2c2410;
  --color-gf: #818cf8;
  --color-gf-soft: #1c1f3a;
  --color-live: #f87171;
  --color-danger: #f87171;
}

html,
body {
  background: var(--color-base);
  color: var(--color-fg);
}

body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
```

- [ ] **Step 7：写入 `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: '赛事赛程',
  description: '双败淘汰制赛程展示与管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-base text-fg">
        <header className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight hover:text-wb">
              赛事赛程
            </Link>
            <Link href="/admin/" className="text-sm text-muted hover:text-fg">
              管理
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
```

- [ ] **Step 8：写入临时 `app/page.tsx`（Task 10 会替换）**

```tsx
export default function HomePage() {
  return <p className="text-muted">项目初始化完成。</p>
}
```

- [ ] **Step 9：安装依赖**

Run: `npm install`
Expected: 安装成功，生成 `package-lock.json`

- [ ] **Step 10：验证开发服务器可启动**

Run: `npm run dev`
Expected: 显示 `Ready`，访问 `http://localhost:3000` 出现"项目初始化完成。"。确认后 Ctrl+C 停止。

- [ ] **Step 11：Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs vitest.config.ts app
git commit -m "chore: 初始化 Next.js 静态导出项目与 Tailwind 深色主题"
```

---

### Task 2：数据模型与运行时校验

**Files:**
- Create: `lib/data/schema.ts`
- Test: `lib/data/schema.test.ts`

- [ ] **Step 1：写失败的测试 `lib/data/schema.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { parseConfig, parseEvent, SchemaError } from './schema'

const validEvent = {
  id: 'spring',
  name: '春季赛',
  format: 'double-elimination',
  bracketSize: 8,
  status: 'ongoing',
  defaultBO: 3,
  grandFinalBO: 5,
  teams: [{ id: 't1', name: 'A 队', seed: 1, players: [{ name: '甲' }], logo: null }],
  matches: [
    {
      id: 'WB-R1-M1', bracket: 'WB', round: 1, index: 1, bo: 3,
      scoreA: null, scoreB: null, live: false,
      scheduledAt: null, referee: null, streamUrl: null, note: null,
    },
  ],
  announcements: [],
  updatedAt: '2026-09-25T10:00:00+08:00',
}

describe('parseEvent', () => {
  it('接受合法数据', () => {
    const ev = parseEvent(validEvent)
    expect(ev.id).toBe('spring')
    expect(ev.bracketSize).toBe(8)
  })

  it('拒绝非 2 的幂的签表规模', () => {
    expect(() => parseEvent({ ...validEvent, bracketSize: 6 })).toThrow(SchemaError)
  })

  it('拒绝非法赛制', () => {
    expect(() => parseEvent({ ...validEvent, format: 'round-robin' })).toThrow(SchemaError)
  })

  it('拒绝非法 BO 值', () => {
    const bad = { ...validEvent, matches: [{ ...validEvent.matches[0], bo: 4 }] }
    expect(() => parseEvent(bad)).toThrow(SchemaError)
  })

  it('拒绝缺失的 scoreA 字段', () => {
    const bad = { ...validEvent, matches: [{ ...validEvent.matches[0], scoreA: undefined }] }
    expect(() => parseEvent(bad)).toThrow(SchemaError)
  })

  it('拒绝非对象输入', () => {
    expect(() => parseEvent(null)).toThrow(SchemaError)
    expect(() => parseEvent('<html>')).toThrow(SchemaError)
  })

  it('错误信息包含出错路径', () => {
    try {
      parseEvent({ ...validEvent, teams: [{ id: 1 }] })
      throw new Error('应当抛错')
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError)
      expect((e as SchemaError).path).toContain('teams')
    }
  })
})

describe('parseConfig', () => {
  const repo = { owner: 'alice', repo: 'match-schedule', branch: 'main' }
  const scopes = { contents: 'write', path: 'public/data/' }

  it('接受合法配置', () => {
    const cfg = parseConfig({ repo, admins: [{ login: 'alice', role: 'admin' }], requiredTokenScopes: scopes })
    expect(cfg.admins[0].login).toBe('alice')
    expect(cfg.repo.repo).toBe('match-schedule')
  })

  it('拒绝非法 role', () => {
    expect(() =>
      parseConfig({ repo, admins: [{ login: 'alice', role: 'root' }], requiredTokenScopes: scopes }),
    ).toThrow(SchemaError)
  })

  it('允许 admins 为空数组', () => {
    expect(parseConfig({ repo, admins: [], requiredTokenScopes: scopes }).admins).toEqual([])
  })

  it('拒绝缺失的 repo 配置', () => {
    expect(() => parseConfig({ admins: [], requiredTokenScopes: scopes })).toThrow(SchemaError)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/data/schema.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./schema"`

- [ ] **Step 3：实现 `lib/data/schema.ts`**

```ts
export type BracketKind = 'WB' | 'LB' | 'GF'
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
  format: 'double-elimination'
  bracketSize: 4 | 8 | 16 | 32
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
const VALID_BRACKET_SIZE = [4, 8, 16, 32] as const

function checkBO(v: unknown, path: string): number {
  const n = int(v, path)
  if (!(VALID_BO as readonly number[]).includes(n)) {
    throw new SchemaError(path, `应为 1/3/5/7 之一，实际为 ${n}`)
  }
  return n
}

export function isBracketSize(v: unknown): v is 4 | 8 | 16 | 32 {
  return typeof v === 'number' && (VALID_BRACKET_SIZE as readonly number[]).includes(v)
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
  const bracketSize = int(o.bracketSize, 'event.bracketSize')
  if (!isBracketSize(bracketSize)) {
    throw new SchemaError('event.bracketSize', `应为 4/8/16/32 之一，实际为 ${bracketSize}`)
  }
  return {
    id: nonEmptyStr(o.id, 'event.id'),
    name: nonEmptyStr(o.name, 'event.name'),
    format: oneOf(o.format, 'event.format', ['double-elimination'] as const),
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
    bracketSize: ev.bracketSize,
    status: ev.status,
    finishedMatches: ev.matches.filter((m) => m.scoreA !== null && m.scoreB !== null).length,
    totalMatches: ev.matches.length,
    updatedAt: ev.updatedAt,
  }
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/data/schema.test.ts`
Expected: PASS，11 个用例全绿

- [ ] **Step 5：Commit**

```bash
git add lib/data/schema.ts lib/data/schema.test.ts
git commit -m "feat(data): 数据模型与运行时校验"
```

---

### Task 3：示例数据与构建期读取

**Files:**
- Create: `public/data/config.json`, `public/data/events/spring-2026.json`, `lib/data/load.ts`
- Test: `lib/data/load.test.ts`

- [ ] **Step 1：写入 `public/data/config.json`**

把 `owner` / `repo` 改为实际的数据仓库（本项目部署到 Pages 的那个仓库），`login` 改为实际管理员的 GitHub 用户名。

```json
{
  "repo": { "owner": "your-github-name", "repo": "match-schedule", "branch": "main" },
  "admins": [{ "login": "your-github-name", "role": "admin" }],
  "requiredTokenScopes": { "contents": "write", "path": "public/data/" }
}
```

- [ ] **Step 2：写入示例赛事 `public/data/events/spring-2026.json`**

8 队双败，14 场（`2n-2`），前两场已有比分用于验证界面。ID 必须与 Task 5 的模板规则一致：`WB-R<轮>-M<序>`、`LB-R<轮>-M<序>`、`GF`。

```json
{
  "id": "spring-2026",
  "name": "2026 春季赛",
  "format": "double-elimination",
  "bracketSize": 8,
  "status": "ongoing",
  "defaultBO": 3,
  "grandFinalBO": 5,
  "teams": [
    { "id": "t1", "name": "赤霄", "seed": 1, "players": [{ "name": "阿岚" }, { "name": "小林" }], "logo": null },
    { "id": "t2", "name": "沧溟", "seed": 2, "players": [{ "name": "子墨" }, { "name": "老陈" }], "logo": null },
    { "id": "t3", "name": "流火", "seed": 3, "players": [{ "name": "小满" }, { "name": "阿澈" }], "logo": null },
    { "id": "t4", "name": "玄鸟", "seed": 4, "players": [{ "name": "青黛" }, { "name": "木木" }], "logo": null },
    { "id": "t5", "name": "长风", "seed": 5, "players": [{ "name": "阿凯" }, { "name": "沐风" }], "logo": null },
    { "id": "t6", "name": "惊蛰", "seed": 6, "players": [{ "name": "小九" }, { "name": "阿岩" }], "logo": null },
    { "id": "t7", "name": "白露", "seed": 7, "players": [{ "name": "林间" }, { "name": "阿舟" }], "logo": null },
    { "id": "t8", "name": "望舒", "seed": 8, "players": [{ "name": "阿羽" }, { "name": "小淮" }], "logo": null }
  ],
  "matches": [
    { "id": "WB-R1-M1", "bracket": "WB", "round": 1, "index": 1, "bo": 3, "scoreA": 2, "scoreB": 1, "live": false, "scheduledAt": "2026-10-01T14:00:00+08:00", "referee": "老周", "streamUrl": null, "note": null },
    { "id": "WB-R1-M2", "bracket": "WB", "round": 1, "index": 2, "bo": 3, "scoreA": 0, "scoreB": 2, "live": false, "scheduledAt": "2026-10-01T16:00:00+08:00", "referee": "老周", "streamUrl": null, "note": null },
    { "id": "WB-R1-M3", "bracket": "WB", "round": 1, "index": 3, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-01T19:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "WB-R1-M4", "bracket": "WB", "round": 1, "index": 4, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-01T21:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "WB-R2-M1", "bracket": "WB", "round": 2, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-03T14:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "WB-R2-M2", "bracket": "WB", "round": 2, "index": 2, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-03T16:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "WB-R3-M1", "bracket": "WB", "round": 3, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-05T14:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R1-M1", "bracket": "LB", "round": 1, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-02T14:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R1-M2", "bracket": "LB", "round": 1, "index": 2, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-02T16:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R2-M1", "bracket": "LB", "round": 2, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-04T14:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R2-M2", "bracket": "LB", "round": 2, "index": 2, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-04T16:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R3-M1", "bracket": "LB", "round": 3, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-05T19:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "LB-R4-M1", "bracket": "LB", "round": 4, "index": 1, "bo": 3, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-06T19:00:00+08:00", "referee": null, "streamUrl": null, "note": null },
    { "id": "GF", "bracket": "GF", "round": 1, "index": 1, "bo": 5, "scoreA": null, "scoreB": null, "live": false, "scheduledAt": "2026-10-08T19:00:00+08:00", "referee": null, "streamUrl": null, "note": null }
  ],
  "announcements": [
    { "id": "a1", "content": "赛程已发布，10 月 1 日 14:00 开赛。", "createdAt": "2026-09-25T10:00:00+08:00" }
  ],
  "updatedAt": "2026-09-25T10:00:00+08:00"
}
```

- [ ] **Step 3：校验比赛数量**

Run: `node -e "console.log(require('./public/data/events/spring-2026.json').matches.length)"`
Expected: `14`

- [ ] **Step 4：写失败的测试 `lib/data/load.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { listEventIds, listEvents, loadEvent } from './load'

describe('load', () => {
  it('列出仓库中的示例赛事', () => {
    expect(listEventIds()).toContain('spring-2026')
  })

  it('读取示例赛事并解析成功', () => {
    const ev = loadEvent('spring-2026')
    expect(ev).not.toBeNull()
    expect(ev!.bracketSize).toBe(8)
    expect(ev!.teams).toHaveLength(8)
    expect(ev!.matches).toHaveLength(14)
  })

  it('读取不存在的赛事返回 null', () => {
    expect(loadEvent('no-such-event')).toBeNull()
  })

  it('数据文件损坏时返回 null 而不抛错', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadEvent('spring-2026')).toBeNull()
    read.mockRestore()
    log.mockRestore()
  })

  it('listEvents 返回摘要且包含进度', () => {
    const found = listEvents().find((e) => e.id === 'spring-2026')
    expect(found).toBeDefined()
    expect(found!.totalMatches).toBe(14)
    expect(found!.finishedMatches).toBe(2)
  })
})
```

- [ ] **Step 5：运行测试确认失败**

Run: `npx vitest run lib/data/load.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./load"`

- [ ] **Step 6：实现 `lib/data/load.ts`**

关键约束：`listEventIds()` 只扫描目录不解析 JSON，因此某个赛事文件损坏时路由仍然生成、页面可显示"数据暂不可用"，不会导致整站构建失败（设计文档 §11）。

```ts
import fs from 'node:fs'
import path from 'node:path'
import { parseEvent, summarize, type EventSummary, type TournamentEvent } from './schema'

const EVENTS_DIR = path.join(process.cwd(), 'public', 'data', 'events')

export function listEventIds(): string[] {
  try {
    if (!fs.existsSync(EVENTS_DIR)) return []
    return fs
      .readdirSync(EVENTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  } catch (err) {
    console.error('[load] 无法扫描赛事目录', err)
    return []
  }
}

export function loadEvent(id: string): TournamentEvent | null {
  const file = path.join(EVENTS_DIR, `${id}.json`)
  try {
    if (!fs.existsSync(file)) return null
    return parseEvent(JSON.parse(fs.readFileSync(file, 'utf-8')))
  } catch (err) {
    console.error(`[load] 赛事数据不可用：${id}`, err)
    return null
  }
}

export function listEvents(): EventSummary[] {
  const out: EventSummary[] = []
  for (const id of listEventIds()) {
    const ev = loadEvent(id)
    if (ev) out.push(summarize(ev))
  }
  return out
}
```

- [ ] **Step 7：运行测试确认通过**

Run: `npx vitest run lib/data/load.test.ts`
Expected: PASS，5 个用例全绿

- [ ] **Step 8：Commit**

```bash
git add public/data lib/data/load.ts lib/data/load.test.ts
git commit -m "feat(data): 示例赛事数据与构建期读取"
```

---

### Task 4：URL 工具（basePath 单一入口）

**Files:**
- Create: `lib/urls.ts`
- Test: `lib/urls.test.ts`

- [ ] **Step 1：写失败的测试 `lib/urls.test.ts`**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadWithBase(base: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', base)
  return await import('./urls')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('urls', () => {
  it('根路径部署时不加前缀', async () => {
    const { dataUrl, withBase } = await loadWithBase('')
    expect(withBase('/event/x/')).toBe('/event/x/')
    expect(dataUrl('/events/spring-2026.json')).toBe('/data/events/spring-2026.json')
  })

  it('项目站点部署时统一加 basePath 前缀', async () => {
    const { dataUrl, withBase } = await loadWithBase('/match-schedule')
    expect(withBase('/event/x/')).toBe('/match-schedule/event/x/')
    expect(dataUrl('/events/spring-2026.json')).toBe('/match-schedule/data/events/spring-2026.json')
  })

  it('dataUrl 自动补前导斜杠', async () => {
    const { dataUrl } = await loadWithBase('/repo')
    expect(dataUrl('events/a.json')).toBe('/repo/data/events/a.json')
  })

  it('pollUrl 附加时间戳用于绕过 CDN 缓存', async () => {
    const { pollUrl } = await loadWithBase('/repo')
    expect(pollUrl('/events/a.json')).toMatch(/^\/repo\/data\/events\/a\.json\?t=\d+$/)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/urls.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./urls"`

- [ ] **Step 3：实现 `lib/urls.ts`**

所有数据与资源请求必须经过本模块，页面代码中不得出现硬编码绝对路径（设计文档 §4.3）。

```ts
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function withBase(pathname: string): string {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${BASE}${p}`
}

export function dataUrl(pathname: string): string {
  return withBase(`/data${pathname.startsWith('/') ? pathname : `/${pathname}`}`)
}

export function pollUrl(pathname: string): string {
  return `${dataUrl(pathname)}?t=${Date.now()}`
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/urls.test.ts`
Expected: PASS，4 个用例全绿

- [ ] **Step 5：Commit**

```bash
git add lib/urls.ts lib/urls.test.ts
git commit -m "feat: basePath 统一入口 urls 工具"
```

---

## Phase 1：赛制引擎（核心风险区）

这 4 个任务全部是纯函数，不涉及 React，是本项目风险最高的部分，因此用单测完全覆盖。

### Task 5：签表模板生成

**Files:**
- Create: `lib/bracket/generate.ts`
- Test: `lib/bracket/generate.test.ts`

模板只依赖 `bracketSize`，不依赖队伍与结果。它定义每个槽位的队伍来源（种子 / 某场胜者 / 某场败者），是推进引擎的骨架。模板中的比赛顺序保证**拓扑有序**（依赖的场次一定排在前面）。

- [ ] **Step 1：写失败的测试 `lib/bracket/generate.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { generateTemplate, lbRoundCount, seedOrder, wbRoundCount } from './generate'

describe('seedOrder（标准排位顺序）', () => {
  it('2 / 4 / 8 队结果符合预期', () => {
    expect(seedOrder(2)).toEqual([1, 2])
    expect(seedOrder(4)).toEqual([1, 4, 2, 3])
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })

  it.each([4, 8, 16, 32])('%i 队：首轮每对种子之和为 n+1', (n) => {
    const o = seedOrder(n)
    for (let i = 0; i < o.length; i += 2) {
      expect(o[i] + o[i + 1]).toBe(n + 1)
    }
  })

  it.each([4, 8, 16, 32])('%i 队：包含 1..n 全部种子且不重复', (n) => {
    const o = seedOrder(n)
    expect([...o].sort((a, b) => a - b)).toEqual(
      Array.from({ length: n }, (_, i) => i + 1),
    )
  })
})

describe('轮次数量', () => {
  it.each([
    [4, 2, 2],
    [8, 3, 4],
    [16, 4, 6],
    [32, 5, 8],
  ])('%i 队：胜者组 %i 轮、败者组 %i 轮', (n, wb, lb) => {
    expect(wbRoundCount(n)).toBe(wb)
    expect(lbRoundCount(n)).toBe(lb)
  })
})

describe('generateTemplate', () => {
  it.each([4, 8, 16, 32])('%i 队：总场次为 2n-2', (n) => {
    expect(generateTemplate(n).matches).toHaveLength(2 * n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：败者组场次为 n-2', (n) => {
    const lb = generateTemplate(n).matches.filter((m) => m.bracket === 'LB')
    expect(lb).toHaveLength(n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：胜者组每轮场次数为 n/2^r', (n) => {
    const t = generateTemplate(n)
    for (let r = 1; r <= wbRoundCount(n); r++) {
      const count = t.matches.filter((m) => m.bracket === 'WB' && m.round === r).length
      expect(count).toBe(n / 2 ** r)
    }
  })

  it.each([4, 8, 16, 32])('%i 队：恰好一场总决赛', (n) => {
    const gf = generateTemplate(n).matches.filter((m) => m.bracket === 'GF')
    expect(gf).toHaveLength(1)
    expect(gf[0].id).toBe('GF')
  })

  it.each([4, 8, 16, 32])('%i 队：matchId 唯一', (n) => {
    const ids = generateTemplate(n).matches.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each([4, 8, 16, 32])('%i 队：所有引用都指向更早的场次（拓扑有序）', (n) => {
    const seen = new Set<string>()
    for (const m of generateTemplate(n).matches) {
      for (const src of [m.sourceA, m.sourceB]) {
        if (src.kind !== 'seed') expect(seen.has(src.matchId)).toBe(true)
      }
      seen.add(m.id)
    }
  })

  it('4 队：首轮对位为 1v4、2v3', () => {
    const t = generateTemplate(4)
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceA).toEqual({ kind: 'seed', seed: 1 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M1')!.sourceB).toEqual({ kind: 'seed', seed: 4 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceA).toEqual({ kind: 'seed', seed: 2 })
    expect(t.matches.find((m) => m.id === 'WB-R1-M2')!.sourceB).toEqual({ kind: 'seed', seed: 3 })
  })

  it('8 队：败者组第一轮来自胜者组第一轮败者', () => {
    const lb1 = generateTemplate(8).matches.find((m) => m.id === 'LB-R1-M1')!
    expect(lb1.sourceA).toEqual({ kind: 'loser', matchId: 'WB-R1-M1' })
    expect(lb1.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R1-M2' })
  })

  it('8 队：败者组第二轮为 LB 胜者 vs WB 第二轮败者', () => {
    const lb2 = generateTemplate(8).matches.find((m) => m.id === 'LB-R2-M1')!
    expect(lb2.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R1-M1' })
    expect(lb2.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R2-M1' })
  })

  it('8 队：败者组第三轮为两个 LB 胜者互相对阵', () => {
    const lb3 = generateTemplate(8).matches.find((m) => m.id === 'LB-R3-M1')!
    expect(lb3.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R2-M1' })
    expect(lb3.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R2-M2' })
  })

  it('8 队：败者组第四轮为 LB 胜者 vs 胜者组决赛败者', () => {
    const lb4 = generateTemplate(8).matches.find((m) => m.id === 'LB-R4-M1')!
    expect(lb4.sourceA).toEqual({ kind: 'winner', matchId: 'LB-R3-M1' })
    expect(lb4.sourceB).toEqual({ kind: 'loser', matchId: 'WB-R3-M1' })
  })

  it('8 队：总决赛为两个分区冠军', () => {
    const gf = generateTemplate(8).matches.find((m) => m.id === 'GF')!
    expect(gf.sourceA).toEqual({ kind: 'winner', matchId: 'WB-R3-M1' })
    expect(gf.sourceB).toEqual({ kind: 'winner', matchId: 'LB-R4-M1' })
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/bracket/generate.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./generate"`

- [ ] **Step 3：实现 `lib/bracket/generate.ts`**

败者组配对规则（设计文档 §7.1）：`r=1` 取胜者组第一轮败者两两配对；`r` 为偶数时取「败者组第 `r-1` 轮第 `i` 场胜者」对「胜者组第 `r/2+1` 轮第 `i` 场败者」；`r` 为奇数且 ≥3 时取败者组上轮两个胜者互相对阵。

```ts
import type { BracketKind } from '@/lib/data/schema'

export type SlotSource =
  | { kind: 'seed'; seed: number }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string }

export type MatchTemplate = {
  id: string
  bracket: BracketKind
  round: number
  index: number
  sourceA: SlotSource
  sourceB: SlotSource
}

export type BracketTemplate = {
  bracketSize: number
  rounds: { wb: number; lb: number }
  matches: MatchTemplate[]
}

export const GF_ID = 'GF'

export function wbRoundCount(bracketSize: number): number {
  return Math.log2(bracketSize)
}

export function lbRoundCount(bracketSize: number): number {
  return 2 * Math.log2(bracketSize) - 2
}

export function wbMatchId(round: number, index: number): string {
  return `WB-R${round}-M${index}`
}

export function lbMatchId(round: number, index: number): string {
  return `LB-R${round}-M${index}`
}

/**
 * 标准排位顺序：order(1) = [1]；order(2n) 由 order(n) 的每项 x 展开为 [x, 2n+1-x]。
 * 保证首轮每对种子之和为 n+1，高种子在后续轮次相遇。
 */
export function seedOrder(bracketSize: number): number[] {
  let order = [1]
  let size = 2
  while (size <= bracketSize) {
    const next: number[] = []
    for (const x of order) next.push(x, size + 1 - x)
    order = next
    size *= 2
  }
  return order
}

/** 败者组第 round 轮的场次数：r=1 为 n/4；偶数轮与上一轮相同；奇数轮（≥3）减半 */
export function lbMatchCount(bracketSize: number, round: number): number {
  let count = bracketSize / 4
  for (let r = 2; r <= round; r++) {
    if (r % 2 !== 0) count /= 2
  }
  return count
}

export function generateTemplate(bracketSize: number): BracketTemplate {
  const k = wbRoundCount(bracketSize)
  const lbRounds = lbRoundCount(bracketSize)
  const matches: MatchTemplate[] = []

  // 胜者组
  const order = seedOrder(bracketSize)
  for (let round = 1; round <= k; round++) {
    const count = bracketSize / 2 ** round
    for (let index = 1; index <= count; index++) {
      const sourceA: SlotSource =
        round === 1
          ? { kind: 'seed', seed: order[(index - 1) * 2] }
          : { kind: 'winner', matchId: wbMatchId(round - 1, index * 2 - 1) }
      const sourceB: SlotSource =
        round === 1
          ? { kind: 'seed', seed: order[(index - 1) * 2 + 1] }
          : { kind: 'winner', matchId: wbMatchId(round - 1, index * 2) }
      matches.push({ id: wbMatchId(round, index), bracket: 'WB', round, index, sourceA, sourceB })
    }
  }

  // 败者组
  for (let round = 1; round <= lbRounds; round++) {
    const count = lbMatchCount(bracketSize, round)
    for (let index = 1; index <= count; index++) {
      let sourceA: SlotSource
      let sourceB: SlotSource
      if (round === 1) {
        sourceA = { kind: 'loser', matchId: wbMatchId(1, index * 2 - 1) }
        sourceB = { kind: 'loser', matchId: wbMatchId(1, index * 2) }
      } else if (round % 2 === 0) {
        sourceA = { kind: 'winner', matchId: lbMatchId(round - 1, index) }
        sourceB = { kind: 'loser', matchId: wbMatchId(round / 2 + 1, index) }
      } else {
        sourceA = { kind: 'winner', matchId: lbMatchId(round - 1, index * 2 - 1) }
        sourceB = { kind: 'winner', matchId: lbMatchId(round - 1, index * 2) }
      }
      matches.push({ id: lbMatchId(round, index), bracket: 'LB', round, index, sourceA, sourceB })
    }
  }

  // 总决赛（单场决胜，不采用重置规则）
  matches.push({
    id: GF_ID,
    bracket: 'GF',
    round: 1,
    index: 1,
    sourceA: { kind: 'winner', matchId: wbMatchId(k, 1) },
    sourceB: { kind: 'winner', matchId: lbMatchId(lbRounds, 1) },
  })

  return { bracketSize, rounds: { wb: k, lb: lbRounds }, matches }
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/bracket/generate.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 5：Commit**

```bash
git add lib/bracket/generate.ts lib/bracket/generate.test.ts
git commit -m "feat(bracket): 双败签表模板生成"
```

---

### Task 6：BO 与比分校验

**Files:**
- Create: `lib/bracket/validate.ts`
- Test: `lib/bracket/validate.test.ts`

- [ ] **Step 1：写失败的测试 `lib/bracket/validate.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { isValidBO, validateScore, winsNeeded } from './validate'

describe('winsNeeded', () => {
  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
    [7, 4],
  ])('BO%i 需要赢 %i 局', (bo, need) => {
    expect(winsNeeded(bo)).toBe(need)
  })
})

describe('isValidBO', () => {
  it('接受 1/3/5/7', () => {
    for (const bo of [1, 3, 5, 7]) expect(isValidBO(bo)).toBe(true)
  })

  it('拒绝偶数与负值', () => {
    for (const bo of [0, 2, 4, 6, -1]) expect(isValidBO(bo)).toBe(false)
  })
})

describe('validateScore', () => {
  it('双方为空表示清除结果，合法', () => {
    expect(validateScore(3, null, null)).toEqual({ ok: true })
  })

  it('单侧为空不合法', () => {
    const r = validateScore(3, 2, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('同时填写')
  })

  it('BO3 合法比分 2:0 与 2:1', () => {
    expect(validateScore(3, 2, 0)).toEqual({ ok: true })
    expect(validateScore(3, 2, 1)).toEqual({ ok: true })
  })

  it('BO3 拒绝 1:1（未分出胜负）', () => {
    const r = validateScore(3, 1, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('2 局')
  })

  it('BO3 拒绝单方超过 2 局', () => {
    expect(validateScore(3, 3, 0).ok).toBe(false)
    expect(validateScore(3, 2, 2).ok).toBe(false)
  })

  it('BO5 合法比分 3:0 / 3:1 / 3:2', () => {
    expect(validateScore(5, 3, 0)).toEqual({ ok: true })
    expect(validateScore(5, 3, 1)).toEqual({ ok: true })
    expect(validateScore(5, 3, 2)).toEqual({ ok: true })
  })

  it('BO5 拒绝 2:2', () => {
    expect(validateScore(5, 2, 2).ok).toBe(false)
  })

  it('BO1 合法比分 1:0', () => {
    expect(validateScore(1, 1, 0)).toEqual({ ok: true })
    expect(validateScore(1, 0, 0).ok).toBe(false)
  })

  it('拒绝负数与非整数', () => {
    expect(validateScore(3, -1, 2).ok).toBe(false)
    expect(validateScore(3, 2.5, 0).ok).toBe(false)
  })

  it('拒绝非法 BO', () => {
    expect(validateScore(4, 2, 0).ok).toBe(false)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/bracket/validate.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./validate"`

- [ ] **Step 3：实现 `lib/bracket/validate.ts`**

判定核心：**恰好一方达到获胜所需局分**才合法。双方都未达到说明比赛未结束；双方都达到则不可能。

```ts
const VALID_BO = [1, 3, 5, 7]

export function isValidBO(bo: number): boolean {
  return Number.isInteger(bo) && VALID_BO.includes(bo)
}

export function winsNeeded(bo: number): number {
  return Math.ceil((bo + 1) / 2)
}

export type ScoreCheck = { ok: true } | { ok: false; message: string }

export function validateScore(
  bo: number,
  scoreA: number | null,
  scoreB: number | null,
): ScoreCheck {
  if (!isValidBO(bo)) {
    return { ok: false, message: `BO 值非法：${bo}，仅支持 1/3/5/7` }
  }

  const aNull = scoreA === null
  const bNull = scoreB === null
  if (aNull && bNull) return { ok: true }
  if (aNull !== bNull) return { ok: false, message: '比分必须同时填写或同时留空' }

  const a = scoreA as number
  const b = scoreB as number
  if (!Number.isInteger(a) || a < 0) return { ok: false, message: '甲队局分必须为非负整数' }
  if (!Number.isInteger(b) || b < 0) return { ok: false, message: '乙队局分必须为非负整数' }

  const need = winsNeeded(bo)
  if (a > need) return { ok: false, message: `BO${bo} 下单方最多赢 ${need} 局，甲队为 ${a}` }
  if (b > need) return { ok: false, message: `BO${bo} 下单方最多赢 ${need} 局，乙队为 ${b}` }

  const aWin = a === need
  const bWin = b === need
  if (aWin && bWin) {
    return { ok: false, message: `BO${bo} 下双方不可能同时达到 ${need} 局` }
  }
  if (!aWin && !bWin) {
    return { ok: false, message: `BO${bo} 下需有一方赢下 ${need} 局才算结束` }
  }

  return { ok: true }
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/bracket/validate.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 5：Commit**

```bash
git add lib/bracket/validate.ts lib/bracket/validate.test.ts
git commit -m "feat(bracket): BO 与比分校验"
```

---

### Task 7：推进引擎

**Files:**
- Create: `lib/bracket/advance.ts`
- Test: `lib/bracket/advance.test.ts`

引擎把「模板 + 已存结果」推导为完整的对阵与队伍状态。**对阵关系不存储**，因此改任何一场比分后重跑本函数即可得到一致的赛程（设计文档 §3.1、§7.5）。

- [ ] **Step 1：写失败的测试 `lib/bracket/advance.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { deriveBracket, loserOf, winnerOf } from './advance'
import { generateTemplate } from './generate'
import type { StoredMatch, Team, TournamentEvent } from '@/lib/data/schema'

function makeTeams(n: number): Team[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    name: `T${i + 1}`,
    seed: i + 1,
    players: [],
    logo: null,
  }))
}

function makeEvent(n: 4 | 8 | 16 | 32, scores: Record<string, [number, number]> = {}): TournamentEvent {
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: makeTeams(n),
    matches: generateTemplate(n).matches.map((t) => {
      const s = scores[t.id]
      return {
        id: t.id,
        bracket: t.bracket,
        round: t.round,
        index: t.index,
        bo: t.bracket === 'GF' ? 5 : 3,
        scoreA: s ? s[0] : null,
        scoreB: s ? s[1] : null,
        live: false,
        scheduledAt: null,
        referee: null,
        streamUrl: null,
        note: null,
      } satisfies StoredMatch
    }),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('winnerOf / loserOf', () => {
  it('未结束时返回 null', () => {
    const ev = makeEvent(4)
    const b = deriveBracket(ev)
    expect(winnerOf(b.byId['WB-R1-M1'])).toBeNull()
    expect(loserOf(b.byId['WB-R1-M1'])).toBeNull()
  })

  it('有比分时正确判定胜负', () => {
    const ev = makeEvent(4, { 'WB-R1-M1': [2, 1] })
    const b = deriveBracket(ev)
    expect(winnerOf(b.byId['WB-R1-M1'])!.seed).toBe(1)
    expect(loserOf(b.byId['WB-R1-M1'])!.seed).toBe(4)
  })
})

describe('首轮对阵', () => {
  it('4 队按 1v4、2v3 展开', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R1-M1'].teamA!.seed).toBe(1)
    expect(b.byId['WB-R1-M1'].teamB!.seed).toBe(4)
    expect(b.byId['WB-R1-M2'].teamA!.seed).toBe(2)
    expect(b.byId['WB-R1-M2'].teamB!.seed).toBe(3)
  })

  it('8 队 8 支队伍全部进入首轮且不重复', () => {
    const b = deriveBracket(makeEvent(8))
    const first = ['WB-R1-M1', 'WB-R1-M2', 'WB-R1-M3', 'WB-R1-M4'].flatMap((id) => [
      b.byId[id].teamA!.id,
      b.byId[id].teamB!.id,
    ])
    expect(new Set(first).size).toBe(8)
  })

  it('后续轮次在来源未决时队伍为 null 且状态为 pending', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R2-M1'].teamA).toBeNull()
    expect(b.byId['WB-R2-M1'].status).toBe('pending')
  })
})

describe('晋级与掉落', () => {
  it('胜者组胜者晋级、败者掉入败者组对应槽位', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    // 胜者组决赛：两场胜者
    expect(b.byId['WB-R2-M1'].teamA!.seed).toBe(1)
    expect(b.byId['WB-R2-M1'].teamB!.seed).toBe(2)
    // 败者组第一轮：两场败者
    expect(b.byId['LB-R1-M1'].teamA!.seed).toBe(4)
    expect(b.byId['LB-R1-M1'].teamB!.seed).toBe(3)
  })

  it('败者组败者被淘汰、胜者继续', () => {
    const b = deriveBracket(
      makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1], 'LB-R1-M1': [0, 2] }),
    )
    expect(b.byId['LB-R2-M1'].teamA!.seed).toBe(3) // LB 胜者
    const seed4 = b.teamStates.find((s) => s.teamId === 't4')!
    expect(seed4.status).toBe('eliminated')
    expect(seed4.losses).toBe(2)
  })
})

describe('队伍状态', () => {
  it('0 败为胜者组存活、1 败为败者组存活、2 败为淘汰', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    expect(b.teamStates.find((s) => s.teamId === 't1')!.status).toBe('alive-wb')
    expect(b.teamStates.find((s) => s.teamId === 't4')!.status).toBe('alive-lb')
    expect(b.teamStates.find((s) => s.teamId === 't2')!.status).toBe('alive-wb')
  })

  it('战绩累计正确', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 1] }))
    const t1 = b.teamStates.find((s) => s.teamId === 't1')!
    expect(t1.wins).toBe(1)
    expect(t1.losses).toBe(0)
  })
})

describe('完整跑通 4 队', () => {
  it('决出冠军且恰有 3 支队伍被淘汰', () => {
    // WB R1: t1 胜 t4, t2 胜 t3
    // LB R1: t3 胜 t4（t4 淘汰）
    // WB R2: t1 胜 t2（t2 掉入 LB 决赛）
    // LB R2: t3 vs t2 -> t2 胜（t3 淘汰）
    // GF: t1 vs t2 -> t1 胜（t2 淘汰）
    const b = deriveBracket(
      makeEvent(4, {
        'WB-R1-M1': [2, 0],
        'WB-R1-M2': [2, 1],
        'LB-R1-M1': [2, 1],
        'WB-R2-M1': [2, 0],
        'LB-R2-M1': [2, 1],
        GF: [3, 1],
      }),
    )
    expect(b.championId).toBe('t1')
    expect(b.teamStates.filter((s) => s.status === 'eliminated')).toHaveLength(3)
    expect(b.byId['GF'].teamA!.seed).toBe(1)
    expect(b.byId['GF'].teamB!.seed).toBe(2)
  })

  it('总决赛败者一律淘汰（含零败的胜者组冠军）', () => {
    const b = deriveBracket(
      makeEvent(4, {
        'WB-R1-M1': [2, 0],
        'WB-R1-M2': [2, 1],
        'LB-R1-M1': [2, 1],
        'WB-R2-M1': [2, 0],
        'LB-R2-M1': [2, 1],
        GF: [1, 3],
      }),
    )
    expect(b.championId).toBe('t2')
    expect(b.teamStates.find((s) => s.teamId === 't1')!.status).toBe('eliminated')
  })
})

describe('完整跑通 8 队', () => {
  it('共 14 场、冠军唯一、7 支队伍被淘汰', () => {
    const scores: Record<string, [number, number]> = {}
    // 高种子全胜：WB 每场 A 胜
    for (const t of generateTemplate(8).matches) {
      if (t.bracket === 'WB') scores[t.id] = [2, 0]
    }
    // 败者组：一律 A 胜，保证流程走完
    for (const t of generateTemplate(8).matches) {
      if (t.bracket === 'LB') scores[t.id] = [2, 0]
    }
    scores['GF'] = [3, 0]

    const b = deriveBracket(makeEvent(8, scores))
    expect(b.championId).not.toBeNull()
    expect(b.teamStates.filter((s) => s.status === 'eliminated')).toHaveLength(7)
    expect(b.matches).toHaveLength(14)
  })
})

describe('状态推导', () => {
  it('比分填齐为 finished', () => {
    const b = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    expect(b.byId['WB-R1-M1'].status).toBe('finished')
  })

  it('对阵确定但无比分为 ready', () => {
    const b = deriveBracket(makeEvent(4))
    expect(b.byId['WB-R1-M1'].status).toBe('ready')
  })

  it('live 标记生效', () => {
    const ev = makeEvent(4)
    ev.matches[0].live = true
    expect(deriveBracket(ev).byId['WB-R1-M1'].status).toBe('live')
  })

  it('单侧比分视为数据异常，降级为 ready', () => {
    const ev = makeEvent(4)
    ev.matches[0].scoreA = 2
    expect(deriveBracket(ev).byId['WB-R1-M1'].status).toBe('ready')
  })
})

describe('修改比分后下游重算', () => {
  it('把已确认结果改为未确认，下游回到 pending', () => {
    const withResult = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    expect(withResult.byId['LB-R1-M1'].teamA).not.toBeNull()

    const cleared = deriveBracket(makeEvent(4))
    expect(cleared.byId['LB-R1-M1'].teamA).toBeNull()
    expect(cleared.byId['LB-R1-M1'].status).toBe('pending')
  })

  it('翻转胜者会导致下游对阵整体改变', () => {
    const before = deriveBracket(makeEvent(4, { 'WB-R1-M1': [2, 0] }))
    const after = deriveBracket(makeEvent(4, { 'WB-R1-M1': [0, 2] }))
    expect(before.byId['WB-R2-M1'].teamA!.seed).toBe(1)
    expect(after.byId['WB-R2-M1'].teamA!.seed).toBe(4)
    expect(before.byId['LB-R1-M1'].teamA!.seed).toBe(4)
    expect(after.byId['LB-R1-M1'].teamA!.seed).toBe(1)
  })
})

describe('缺省合并', () => {
  it('存储中缺少某场比赛时使用模板默认值', () => {
    const ev = makeEvent(4)
    ev.matches = ev.matches.filter((m) => m.id !== 'LB-R1-M1')
    const b = deriveBracket(ev)
    expect(b.byId['LB-R1-M1']).toBeDefined()
    expect(b.byId['LB-R1-M1'].bo).toBe(3)
    expect(b.byId['LB-R1-M1'].scoreA).toBeNull()
  })

  it('总决赛使用 grandFinalBO，其余使用 defaultBO', () => {
    const b = deriveBracket(makeEvent(8))
    expect(b.byId['GF'].bo).toBe(5)
    expect(b.byId['WB-R1-M1'].bo).toBe(3)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/bracket/advance.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./advance"`

- [ ] **Step 3：实现 `lib/bracket/advance.ts`**

依赖顺序由模板保证（Task 5 已用测试锁定"拓扑有序"），因此单次顺序遍历即可完成推导，无需递归。

```ts
import type { StoredMatch, Team, TournamentEvent } from '@/lib/data/schema'
import { GF_ID, generateTemplate, type BracketTemplate, type SlotSource } from './generate'

export type MatchStatus = 'pending' | 'ready' | 'live' | 'finished'
export type TeamLaneStatus = 'alive-wb' | 'alive-lb' | 'eliminated'

export type DerivedMatch = {
  id: string
  bracket: 'WB' | 'LB' | 'GF'
  round: number
  index: number
  teamA: Team | null
  teamB: Team | null
  scoreA: number | null
  scoreB: number | null
  status: MatchStatus
  bo: number
  sourceA: SlotSource
  sourceB: SlotSource
  winnerId: string | null
  loserId: string | null
  isElimination: boolean
  scheduledAt: string | null
  referee: string | null
  streamUrl: string | null
  note: string | null
}

export type TeamState = {
  teamId: string
  name: string
  seed: number
  wins: number
  losses: number
  status: TeamLaneStatus
  eliminatedByMatchId: string | null
}

export type DerivedBracket = {
  matches: DerivedMatch[]
  byId: Record<string, DerivedMatch>
  teamStates: TeamState[]
  championId: string | null
}

const templateCache = new Map<number, BracketTemplate>()

function templateFor(bracketSize: number): BracketTemplate {
  let t = templateCache.get(bracketSize)
  if (!t) {
    t = generateTemplate(bracketSize)
    templateCache.set(bracketSize, t)
  }
  return t
}

export function winnerOf(m: DerivedMatch | undefined): Team | null {
  if (!m || !m.teamA || !m.teamB) return null
  if (m.scoreA === null || m.scoreB === null) return null
  if (m.scoreA > m.scoreB) return m.teamA
  if (m.scoreB > m.scoreA) return m.teamB
  return null
}

export function loserOf(m: DerivedMatch | undefined): Team | null {
  const w = winnerOf(m)
  if (!w || !m) return null
  return w.id === m.teamA!.id ? m.teamB : m.teamA
}

function resolveSource(
  source: SlotSource,
  byId: Record<string, DerivedMatch>,
  teamBySeed: Map<number, Team>,
): Team | null {
  switch (source.kind) {
    case 'seed':
      return teamBySeed.get(source.seed) ?? null
    case 'winner':
      return winnerOf(byId[source.matchId])
    case 'loser':
      return loserOf(byId[source.matchId])
  }
}

function deriveStatus(m: DerivedMatch, live: boolean): MatchStatus {
  const hasA = m.scoreA !== null
  const hasB = m.scoreB !== null
  if (hasA && hasB) return 'finished'
  if (hasA !== hasB) return 'ready'
  if (live) return 'live'
  if (m.teamA && m.teamB) return 'ready'
  return 'pending'
}

export function deriveBracket(event: TournamentEvent): DerivedBracket {
  const template = templateFor(event.bracketSize)
  const storedById = new Map(event.matches.map((m) => [m.id, m]))
  const teamBySeed = new Map(event.teams.map((t) => [t.seed, t]))

  const byId: Record<string, DerivedMatch> = {}
  const ordered: DerivedMatch[] = []

  for (const tpl of template.matches) {
    const stored: StoredMatch | undefined = storedById.get(tpl.id)
    const bo = stored?.bo ?? (tpl.bracket === 'GF' ? event.grandFinalBO : event.defaultBO)
    const m: DerivedMatch = {
      id: tpl.id,
      bracket: tpl.bracket,
      round: tpl.round,
      index: tpl.index,
      teamA: null,
      teamB: null,
      scoreA: stored?.scoreA ?? null,
      scoreB: stored?.scoreB ?? null,
      status: 'pending',
      bo,
      sourceA: tpl.sourceA,
      sourceB: tpl.sourceB,
      winnerId: null,
      loserId: null,
      isElimination: tpl.bracket === 'LB' || tpl.bracket === 'GF',
      scheduledAt: stored?.scheduledAt ?? null,
      referee: stored?.referee ?? null,
      streamUrl: stored?.streamUrl ?? null,
      note: stored?.note ?? null,
    }
    m.teamA = resolveSource(tpl.sourceA, byId, teamBySeed)
    m.teamB = resolveSource(tpl.sourceB, byId, teamBySeed)
    m.winnerId = winnerOf(m)?.id ?? null
    m.loserId = loserOf(m)?.id ?? null
    m.status = deriveStatus(m, stored?.live ?? false)
    byId[m.id] = m
    ordered.push(m)
  }

  return {
    matches: ordered,
    byId,
    teamStates: deriveTeamStates(event, byId),
    championId: byId[GF_ID]?.winnerId ?? null,
  }
}

function deriveTeamStates(
  event: TournamentEvent,
  byId: Record<string, DerivedMatch>,
): TeamState[] {
  const acc = new Map<string, TeamState>()
  for (const t of event.teams) {
    acc.set(t.id, {
      teamId: t.id,
      name: t.name,
      seed: t.seed,
      wins: 0,
      losses: 0,
      status: 'alive-wb',
      eliminatedByMatchId: null,
    })
  }

  for (const m of Object.values(byId)) {
    if (m.status !== 'finished') continue
    if (m.winnerId) {
      const s = acc.get(m.winnerId)
      if (s) s.wins += 1
    }
    if (m.loserId) {
      const s = acc.get(m.loserId)
      if (s) {
        s.losses += 1
        if (m.isElimination) s.eliminatedByMatchId = m.id
      }
    }
  }

  for (const s of acc.values()) {
    s.status = s.losses >= 2 ? 'eliminated' : s.losses === 1 ? 'alive-lb' : 'alive-wb'
  }

  // 总决赛败者一律淘汰，即使其此前零败（不采用重置规则）
  const gf = byId[GF_ID]
  if (gf && gf.status === 'finished' && gf.loserId) {
    const s = acc.get(gf.loserId)
    if (s) {
      s.status = 'eliminated'
      s.eliminatedByMatchId = GF_ID
    }
  }

  return event.teams.map((t) => acc.get(t.id)!)
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/bracket/advance.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 5：Commit**

```bash
git add lib/bracket/advance.ts lib/bracket/advance.test.ts
git commit -m "feat(bracket): 推进引擎与队伍状态推导"
```

---

### Task 8：对阵图布局算法

**Files:**
- Create: `lib/bracket/layout.ts`
- Test: `lib/bracket/layout.test.ts`

布局与渲染解耦：本模块只输出坐标与 SVG path，渲染层不做任何定位计算（设计文档 §9）。

列位规划：胜者组第 `r` 轮在第 `r-1` 列，败者组第 `r` 轮在第 `r` 列（因此败者组第一轮与胜者组第二轮对齐，掉落线的走向更自然），总决赛在最后一列。

- [ ] **Step 1：写失败的测试 `lib/bracket/layout.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { deriveBracket } from './advance'
import { generateTemplate } from './generate'
import { CARD_H, layoutBracket } from './layout'
import type { TournamentEvent } from '@/lib/data/schema'

function makeEvent(n: 4 | 8 | 16 | 32): TournamentEvent {
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: null,
      scoreB: null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('layoutBracket', () => {
  it.each([4, 8, 16, 32])('%i 队：每场比赛都有坐标', (n) => {
    const ev = makeEvent(n)
    const layout = layoutBracket(deriveBracket(ev), n)
    expect(layout.cards).toHaveLength(2 * n - 2)
  })

  it.each([4, 8, 16, 32])('%i 队：坐标均为有限非负数', (n) => {
    const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
    for (const c of layout.cards) {
      expect(Number.isFinite(c.x)).toBe(true)
      expect(Number.isFinite(c.y)).toBe(true)
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('同一列内卡片不重叠（纵向间距不小于卡高）', () => {
    for (const n of [4, 8, 16, 32]) {
      const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
      const byColumn = new Map<number, { y: number }[]>()
      for (const c of layout.cards) {
        const list = byColumn.get(c.x) ?? []
        list.push(c)
        byColumn.set(c.x, list)
      }
      for (const list of byColumn.values()) {
        const ys = list.map((c) => c.y).sort((a, b) => a - b)
        for (let i = 1; i < ys.length; i++) {
          expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(CARD_H)
        }
      }
    }
  })

  it('胜者组在上、败者组在下', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const wbBottom = Math.max(
      ...layout.cards.filter((c) => c.matchId.startsWith('WB')).map((c) => c.y + CARD_H),
    )
    const lbTop = Math.min(
      ...layout.cards.filter((c) => c.matchId.startsWith('LB')).map((c) => c.y),
    )
    expect(lbTop).toBeGreaterThan(wbBottom)
  })

  it('总决赛在最右列', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const gf = layout.cards.find((c) => c.matchId === 'GF')!
    const maxOther = Math.max(
      ...layout.cards.filter((c) => c.matchId !== 'GF').map((c) => c.x),
    )
    expect(gf.x).toBeGreaterThan(maxOther)
  })

  it('败者组第一轮与胜者组第二轮对齐', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const wbR2 = layout.cards.find((c) => c.matchId === 'WB-R2-M1')!
    const lbR1 = layout.cards.find((c) => c.matchId === 'LB-R1-M1')!
    expect(lbR1.x).toBe(wbR2.x)
  })

  it('胜者组每轮卡片纵向居中于两个上游之间', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const a = layout.cards.find((c) => c.matchId === 'WB-R1-M1')!
    const b = layout.cards.find((c) => c.matchId === 'WB-R1-M2')!
    const target = layout.cards.find((c) => c.matchId === 'WB-R2-M1')!
    expect(target.y).toBeCloseTo((a.y + b.y) / 2, 6)
  })

  it('连接线数量等于非种子来源数量', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    // 8 队：WB 首轮 8 个种子来源，其余 (7-4)+6+1 = 10 个非种子来源
    expect(layout.connectors).toHaveLength(10)
  })

  it('连接线均从左侧指向右侧', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const byId = new Map(layout.cards.map((c) => [c.matchId, c]))
    for (const conn of layout.connectors) {
      const from = byId.get(conn.fromMatchId)!
      const to = byId.get(conn.toMatchId)!
      expect(from.x).toBeLessThan(to.x)
    }
  })

  it('连接线 path 以 M 开头且端点落在卡片边缘', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    const byId = new Map(layout.cards.map((c) => [c.matchId, c]))
    for (const conn of layout.connectors) {
      const from = byId.get(conn.fromMatchId)!
      const to = byId.get(conn.toMatchId)!
      const start = `M ${from.x + from.width} ${from.y + from.height / 2}`
      expect(conn.path.startsWith(start)).toBe(true)
      expect(conn.path.endsWith(`H ${to.x}`)).toBe(true)
    }
  })

  it('输出整体宽高能容纳所有卡片', () => {
    for (const n of [4, 8, 16, 32]) {
      const layout = layoutBracket(deriveBracket(makeEvent(n)), n)
      const right = Math.max(...layout.cards.map((c) => c.x + c.width))
      const bottom = Math.max(...layout.cards.map((c) => c.y + c.height))
      expect(layout.width).toBeGreaterThanOrEqual(right)
      expect(layout.height).toBeGreaterThanOrEqual(bottom)
    }
  })

  it('包含胜者组、败者组、总决赛三段列标题', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    expect(layout.columns.some((c) => c.label.includes('胜者组'))).toBe(true)
    expect(layout.columns.some((c) => c.label.includes('败者组'))).toBe(true)
    expect(layout.columns.some((c) => c.label === '总决赛')).toBe(true)
  })

  it('分区标签存在且下标正确', () => {
    const layout = layoutBracket(deriveBracket(makeEvent(8)), 8)
    expect(layout.sections.map((s) => s.bracket)).toEqual(['WB', 'LB'])
    expect(layout.sections[0].label).toContain('胜者组')
    expect(layout.sections[1].label).toContain('败者组')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/bracket/layout.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./layout"`

- [ ] **Step 3：实现 `lib/bracket/layout.ts`**

```ts
import type { DerivedBracket } from './advance'
import { GF_ID, lbMatchCount, lbRoundCount, wbRoundCount } from './generate'

export const CARD_W = 208
export const CARD_H = 68
export const COL_GAP = 56
export const ROW_GAP = 20
export const SECTION_GAP = 56
export const HEADER_H = 34
export const PAD = 20

const COL_W = CARD_W + COL_GAP

export type LayoutCard = {
  matchId: string
  x: number
  y: number
  width: number
  height: number
}

export type LayoutColumn = {
  key: string
  bracket: 'WB' | 'LB' | 'GF'
  round: number
  label: string
  x: number
}

export type LayoutSection = {
  bracket: 'WB' | 'LB'
  label: string
  y: number
  height: number
}

export type LayoutConnector = {
  fromMatchId: string
  toMatchId: string
  path: string
}

export type BracketLayout = {
  width: number
  height: number
  columns: LayoutColumn[]
  sections: LayoutSection[]
  cards: LayoutCard[]
  connectors: LayoutConnector[]
}

function wbLabel(round: number, wbRounds: number): string {
  return round === wbRounds ? '胜者组决赛' : `胜者组 第 ${round} 轮`
}

function lbLabel(round: number, lbRounds: number): string {
  return round === lbRounds ? '败者组决赛' : `败者组 第 ${round} 轮`
}

function elbowPath(from: LayoutCard, to: LayoutCard): string {
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  const mx = x2 - COL_GAP / 2
  return `M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`
}

export function layoutBracket(derived: DerivedBracket, bracketSize: number): BracketLayout {
  const k = wbRoundCount(bracketSize)
  const lbRounds = lbRoundCount(bracketSize)
  const wbHeight = (bracketSize / 2) * (CARD_H + ROW_GAP) - ROW_GAP
  const lbHeight = lbMatchCount(bracketSize, 1) * (CARD_H + ROW_GAP) - ROW_GAP

  const wbY0 = HEADER_H
  const lbY0 = wbY0 + wbHeight + SECTION_GAP + HEADER_H

  const cards: LayoutCard[] = []
  const relY = new Map<string, number>()

  // 胜者组：第一轮用基础位置，后续轮次取两个上游的中点
  for (let round = 1; round <= k; round++) {
    const count = bracketSize / 2 ** round
    for (let index = 1; index <= count; index++) {
      const id = `WB-R${round}-M${index}`
      const rel =
        round === 1
          ? (index - 1) * (CARD_H + ROW_GAP)
          : (relY.get(`WB-R${round - 1}-M${index * 2 - 1}`)! +
              relY.get(`WB-R${round - 1}-M${index * 2}`)!) /
            2
      relY.set(id, rel)
      cards.push({
        matchId: id,
        x: PAD + (round - 1) * COL_W,
        y: wbY0 + rel,
        width: CARD_W,
        height: CARD_H,
      })
    }
  }

  // 败者组：列位整体右移一列；偶数轮锚定同轮的败者组上游，避免被胜者组坐标带偏
  for (let round = 1; round <= lbRounds; round++) {
    const count = lbMatchCount(bracketSize, round)
    for (let index = 1; index <= count; index++) {
      const id = `LB-R${round}-M${index}`
      let rel: number
      if (round === 1) {
        rel = (index - 1) * (CARD_H + ROW_GAP)
      } else if (round % 2 === 0) {
        rel = relY.get(`LB-R${round - 1}-M${index}`)!
      } else {
        rel =
          (relY.get(`LB-R${round - 1}-M${index * 2 - 1}`)! +
            relY.get(`LB-R${round - 1}-M${index * 2}`)!) /
          2
      }
      relY.set(id, rel)
      cards.push({
        matchId: id,
        x: PAD + round * COL_W,
        y: lbY0 + rel,
        width: CARD_W,
        height: CARD_H,
      })
    }
  }

  const bodyHeight = lbY0 + lbHeight
  const gfX = PAD + (lbRounds + 1) * COL_W
  cards.push({
    matchId: GF_ID,
    x: gfX,
    y: wbY0 + (bodyHeight - wbY0 - CARD_H) / 2,
    width: CARD_W,
    height: CARD_H,
  })

  const columns: LayoutColumn[] = []
  for (let round = 1; round <= k; round++) {
    columns.push({
      key: `WB-R${round}`,
      bracket: 'WB',
      round,
      label: wbLabel(round, k),
      x: PAD + (round - 1) * COL_W,
    })
  }
  for (let round = 1; round <= lbRounds; round++) {
    columns.push({
      key: `LB-R${round}`,
      bracket: 'LB',
      round,
      label: lbLabel(round, lbRounds),
      x: PAD + round * COL_W,
    })
  }
  columns.push({ key: GF_ID, bracket: 'GF', round: 1, label: '总决赛', x: gfX })

  const sections: LayoutSection[] = [
    {
      bracket: 'WB',
      label: '胜者组 Winners Bracket',
      y: wbY0 - HEADER_H,
      height: wbHeight + HEADER_H,
    },
    {
      bracket: 'LB',
      label: '败者组 Losers Bracket',
      y: lbY0 - HEADER_H,
      height: lbHeight + HEADER_H,
    },
  ]

  const cardById = new Map(cards.map((c) => [c.matchId, c]))
  const connectors: LayoutConnector[] = []
  for (const m of derived.matches) {
    for (const src of [m.sourceA, m.sourceB]) {
      if (src.kind === 'seed') continue
      const from = cardById.get(src.matchId)
      const to = cardById.get(m.id)
      if (!from || !to) continue
      connectors.push({
        fromMatchId: src.matchId,
        toMatchId: m.id,
        path: elbowPath(from, to),
      })
    }
  }

  const width = Math.max(...cards.map((c) => c.x + c.width)) + PAD
  const height = Math.max(...cards.map((c) => c.y + c.height)) + PAD

  return { width, height, columns, sections, cards, connectors }
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/bracket/layout.test.ts`
Expected: PASS，全部用例绿

- [ ] **Step 5：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 6：Commit**

```bash
git add lib/bracket/layout.ts lib/bracket/layout.test.ts
git commit -m "feat(bracket): 对阵图布局与连接线计算"
```

---

## Phase 2：展示层（观众端）

本阶段结束时站点即可上线供观众浏览，只有"不能改数据"这一项待 Phase 3 补齐。

组件测试说明：不引入 jsdom / @testing-library（设计文档要求零运行时依赖，测试依赖也尽量不膨胀），组件测试统一用 `react-dom/server` 的 `renderToStaticMarkup` 断言产出 HTML。它能在 Node 环境跑通 hooks（`useState` / `useMemo`）与 JSX，足以覆盖"渲染出什么"这一类断言。

---

### Task 9：展示层纯函数 `lib/view.ts`

**Files:**
- Create: `lib/view.ts`
- Test: `lib/view.test.ts`

把"推导结果 → 渲染文案/分组"的逻辑集中在本模块，**不含任何 React**，因此可以直接单测。时间格式化按 Asia/Shanghai 手工计算，不依赖 Node 或浏览器的 ICU 数据，保证在任何 CI 环境下结果一致。

- [ ] **Step 1：写失败的测试 `lib/view.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { deriveBracket } from './bracket/advance'
import type { TeamState } from './bracket/advance'
import { generateTemplate } from './bracket/generate'
import { layoutBracket } from './bracket/layout'
import type { TournamentEvent } from './data/schema'
import {
  BRACKET_COLOR,
  BRACKET_LABEL,
  connectorViews,
  formatDateTime,
  groupMatchesByDay,
  laneLabel,
  nextStops,
  slotLabel,
  sortTeams,
  statusLabel,
} from './view'

function makeEvent(n: 4 | 8 | 16 | 32, scores: Record<string, [number, number]> = {}): TournamentEvent {
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('formatDateTime', () => {
  it('带时区偏移的 ISO 直接按北京时间展示', () => {
    expect(formatDateTime('2026-10-01T14:00:00+08:00')).toBe('10-01 14:00')
  })

  it('UTC 时间换算为北京时间', () => {
    expect(formatDateTime('2026-10-01T06:00:00Z')).toBe('10-01 14:00')
  })

  it('跨日进位正确', () => {
    expect(formatDateTime('2026-09-30T20:30:00Z')).toBe('10-01 04:30')
  })

  it('null 与非法值返回占位文案', () => {
    expect(formatDateTime(null)).toBe('时间待定')
    expect(formatDateTime('不是时间')).toBe('时间待定')
  })
})

describe('文案映射', () => {
  it('比赛状态', () => {
    expect(statusLabel('pending')).toBe('待定')
    expect(statusLabel('ready')).toBe('未开始')
    expect(statusLabel('live')).toBe('进行中')
    expect(statusLabel('finished')).toBe('已结束')
  })

  it('队伍状态', () => {
    expect(laneLabel('alive-wb')).toBe('胜者组存活')
    expect(laneLabel('alive-lb')).toBe('败者组存活')
    expect(laneLabel('eliminated')).toBe('已淘汰')
  })

  it('三种分区都有文案与六位十六进制颜色', () => {
    for (const k of ['WB', 'LB', 'GF'] as const) {
      expect(BRACKET_LABEL[k].length).toBeGreaterThan(0)
      expect(BRACKET_COLOR[k]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('未确定队伍显示来源描述', () => {
    expect(slotLabel({ kind: 'seed', seed: 3 })).toBe('种子 3')
    expect(slotLabel({ kind: 'winner', matchId: 'WB-R1-M1' })).toBe('WB-R1-M1 胜者')
    expect(slotLabel({ kind: 'loser', matchId: 'WB-R2-M1' })).toBe('WB-R2-M1 败者')
  })
})

describe('groupMatchesByDay', () => {
  it('空数组返回空分组', () => {
    expect(groupMatchesByDay([])).toEqual([])
  })

  it('按日期升序分组，未定时间的排在最后', () => {
    const d = deriveBracket(makeEvent(8))
    const times: Record<string, string> = {
      'WB-R1-M1': '2026-10-02T14:00:00+08:00',
      'WB-R1-M2': '2026-10-01T14:00:00+08:00',
    }
    const matches = d.matches.map((m) => ({ ...m, scheduledAt: times[m.id] ?? null }))
    const groups = groupMatchesByDay(matches)

    expect(groups[0].key).toBe('2026-10-01')
    expect(groups[0].label).toBe('10-01')
    expect(groups[0].matches.map((m) => m.id)).toEqual(['WB-R1-M2'])

    expect(groups[1].key).toBe('2026-10-02')
    expect(groups[1].matches.map((m) => m.id)).toEqual(['WB-R1-M1'])

    const last = groups[groups.length - 1]
    expect(last.key).toBe('tbd')
    expect(last.label).toBe('时间待定')
    expect(last.matches).toHaveLength(12)
  })
})

describe('sortTeams', () => {
  it('胜者组存活 → 败者组存活 → 已淘汰，同状态按种子升序', () => {
    const states: TeamState[] = [
      { teamId: 'c', name: 'C', seed: 3, wins: 0, losses: 1, status: 'eliminated', eliminatedByMatchId: null },
      { teamId: 'a', name: 'A', seed: 5, wins: 0, losses: 1, status: 'alive-lb', eliminatedByMatchId: null },
      { teamId: 'b', name: 'B', seed: 2, wins: 1, losses: 0, status: 'alive-wb', eliminatedByMatchId: null },
      { teamId: 'd', name: 'D', seed: 1, wins: 0, losses: 0, status: 'alive-wb', eliminatedByMatchId: null },
    ]
    expect(sortTeams(states).map((s) => s.teamId)).toEqual(['d', 'b', 'a', 'c'])
  })
})

describe('nextStops', () => {
  it('胜者组首轮：胜者进 WB-R2-M1，败者掉进败者组首轮', () => {
    const stops = nextStops(deriveBracket(makeEvent(8)), 'WB-R1-M1')
    expect(stops).toContainEqual({ matchId: 'WB-R2-M1', kind: 'winner' })
    expect(stops.some((s) => s.kind === 'loser' && s.matchId.startsWith('LB-R1-'))).toBe(true)
  })

  it('总决赛之后没有去向', () => {
    expect(nextStops(deriveBracket(makeEvent(8)), 'GF')).toEqual([])
  })

  it('败者组决赛：胜者进总决赛，败者无处可去', () => {
    const stops = nextStops(deriveBracket(makeEvent(8)), 'LB-R4-M1')
    expect(stops).toEqual([{ matchId: 'GF', kind: 'winner' }])
  })
})

describe('connectorViews', () => {
  it('8 队共 20 条连接线（28 个来源位减去 8 个种子位）', () => {
    const d = deriveBracket(makeEvent(8))
    expect(connectorViews(layoutBracket(d, 8), d)).toHaveLength(20)
  })

  it('同时存在跨区虚线（掉落）与同区实线（晋级）', () => {
    const d = deriveBracket(makeEvent(8))
    const views = connectorViews(layoutBracket(d, 8), d)
    expect(views.some((v) => v.dashed)).toBe(true)
    expect(views.some((v) => !v.dashed)).toBe(true)
  })

  it('每条线都有从 M 起始的 path 与包含 -> 的 key', () => {
    const d = deriveBracket(makeEvent(4))
    const views = connectorViews(layoutBracket(d, 4), d)
    expect(views).toHaveLength(8)
    for (const v of views) {
      expect(v.path.startsWith('M ')).toBe(true)
      expect(v.key).toContain('->')
    }
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/view.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./view"`

- [ ] **Step 3：实现 `lib/view.ts`**

```ts
import type { DerivedBracket, DerivedMatch, MatchStatus, TeamLaneStatus, TeamState } from '@/lib/bracket/advance'
import type { SlotSource } from '@/lib/bracket/generate'
import type { BracketLayout } from '@/lib/bracket/layout'
import type { BracketKind } from '@/lib/data/schema'

// 手动做时区换算，避免依赖运行环境的 ICU 数据导致不同机器输出不一致
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function shiftToShanghai(iso: string): Date | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t + SHANGHAI_OFFSET_MS)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function dayKey(iso: string | null): string {
  if (!iso) return 'tbd'
  const d = shiftToShanghai(iso)
  if (!d) return 'tbd'
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '时间待定'
  const d = shiftToShanghai(iso)
  if (!d) return '时间待定'
  return `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

const STATUS_LABEL: Record<MatchStatus, string> = {
  pending: '待定',
  ready: '未开始',
  live: '进行中',
  finished: '已结束',
}

export function statusLabel(status: MatchStatus): string {
  return STATUS_LABEL[status]
}

const LANE_LABEL: Record<TeamLaneStatus, string> = {
  'alive-wb': '胜者组存活',
  'alive-lb': '败者组存活',
  eliminated: '已淘汰',
}

export function laneLabel(status: TeamLaneStatus): string {
  return LANE_LABEL[status]
}

export const BRACKET_LABEL: Record<BracketKind, string> = {
  WB: '胜者组',
  LB: '败者组',
  GF: '总决赛',
}

export const BRACKET_COLOR: Record<BracketKind, string> = {
  WB: '#34d399',
  LB: '#fbbf24',
  GF: '#818cf8',
}

export function slotLabel(source: SlotSource): string {
  switch (source.kind) {
    case 'seed':
      return `种子 ${source.seed}`
    case 'winner':
      return `${source.matchId} 胜者`
    case 'loser':
      return `${source.matchId} 败者`
  }
}

export type ScheduleDay = { key: string; label: string; matches: DerivedMatch[] }

export function sortForSchedule(matches: DerivedMatch[]): DerivedMatch[] {
  return [...matches].sort((a, b) => {
    const ta = a.scheduledAt ? Date.parse(a.scheduledAt) : Number.NaN
    const tb = b.scheduledAt ? Date.parse(b.scheduledAt) : Number.NaN
    const va = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta
    const vb = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb
    if (va !== vb) return va - vb
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function groupMatchesByDay(matches: DerivedMatch[]): ScheduleDay[] {
  const out: ScheduleDay[] = []
  for (const m of sortForSchedule(matches)) {
    const key = dayKey(m.scheduledAt)
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.matches.push(m)
    } else {
      out.push({ key, label: key === 'tbd' ? '时间待定' : key.slice(5), matches: [m] })
    }
  }
  return out
}

const LANE_ORDER: Record<TeamLaneStatus, number> = { 'alive-wb': 0, 'alive-lb': 1, eliminated: 2 }

export function sortTeams(states: TeamState[]): TeamState[] {
  return [...states].sort((a, b) => LANE_ORDER[a.status] - LANE_ORDER[b.status] || a.seed - b.seed)
}

export type NextStop = { matchId: string; kind: 'winner' | 'loser' }

export function nextStops(derived: DerivedBracket, matchId: string): NextStop[] {
  const out: NextStop[] = []
  for (const m of derived.matches) {
    for (const src of [m.sourceA, m.sourceB]) {
      if (src.kind !== 'seed' && src.matchId === matchId) {
        out.push({ matchId: m.id, kind: src.kind })
      }
    }
  }
  return out
}

export type ConnectorView = { key: string; path: string; dashed: boolean }

export function connectorViews(layout: BracketLayout, derived: DerivedBracket): ConnectorView[] {
  return layout.connectors.map((c) => {
    const from = derived.byId[c.fromMatchId]?.bracket
    const to = derived.byId[c.toMatchId]?.bracket
    return {
      key: `${c.fromMatchId}->${c.toMatchId}`,
      path: c.path,
      // 跨分区（胜者组 → 败者组）用虚线，表示"掉落"
      dashed: from !== to,
    }
  })
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/view.test.ts`
Expected: PASS，14 个用例全绿

- [ ] **Step 5：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 6：Commit**

```bash
git add lib/view.ts lib/view.test.ts
git commit -m "feat(view): 展示层文案、分组与连接线视图"
```

---

### Task 10：赛事列表页

**Files:**
- Modify: `app/page.tsx`（替换 Task 1 的临时内容）

`app/page.tsx` 是服务端组件，`listEvents()` 在构建期用 `fs` 扫描 `public/data/events/`，静态导出后 `out/index.html` 即含赛事清单。

- [ ] **Step 1：替换 `app/page.tsx`**

```tsx
import Link from 'next/link'
import { listEvents } from '@/lib/data/load'
import type { EventStatus } from '@/lib/data/schema'
import { formatDateTime } from '@/lib/view'

const STATUS_LABEL: Record<EventStatus, string> = {
  draft: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
}

export default function HomePage() {
  const events = listEvents()

  if (events.length === 0) {
    return <p className="text-muted">暂无赛事。</p>
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">赛事列表</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {events.map((ev) => {
          const pct = ev.totalMatches === 0 ? 0 : Math.round((ev.finishedMatches / ev.totalMatches) * 100)
          return (
            <li key={ev.id}>
              <Link
                href={`/event/${ev.id}/`}
                className="block rounded-lg border border-line bg-panel p-4 transition-colors hover:border-wb/60 hover:bg-panel-hi"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-base font-medium">{ev.name}</span>
                  <span className="shrink-0 rounded border border-line px-2 py-0.5 text-xs text-muted">
                    {STATUS_LABEL[ev.status]}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{ev.bracketSize} 队 · 双败淘汰</span>
                  <span className="tabular-nums">
                    {ev.finishedMatches} / {ev.totalMatches} 场已完成
                  </span>
                </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded bg-line">
                  <div className="h-full bg-wb" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-2 text-xs text-muted">更新于 {formatDateTime(ev.updatedAt)}</div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2：类型检查**

Run: `npm run typecheck`
Expected: 无错误输出（exit code 0）

- [ ] **Step 3：构建并确认静态产出中包含赛事**

Run: `npm run build`
Expected: 构建成功，输出中存在 `out/index.html`

Run: `Select-String -Path out/index.html -Pattern "2026 春季赛" -SimpleMatch`
Expected: 至少命中一行（说明赛事清单已在构建期渲染进静态 HTML）

- [ ] **Step 4：人工目视确认**

Run: `npm run dev`
打开 `http://localhost:3000`，确认：标题"赛事列表"、一张卡片显示"2026 春季赛"、"8 队 · 双败淘汰"、"2 / 14 场已完成"、绿色进度条约为 14% 宽、状态标签"进行中"。确认后 Ctrl+C 停止。

- [ ] **Step 5：Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): 赛事列表页"
```

---

### Task 11：单场对阵卡片 `MatchCard`

**Files:**
- Create: `components/MatchCard.tsx`
- Test: `components/MatchCard.test.tsx`

卡片只负责"画一场比赛"，坐标由 `BracketView` 决定（设计文档 §9：布局与渲染解耦）。卡片高度固定为 `CARD_H`，因此内容必须单行截断，不能撑高。

- [ ] **Step 1：写失败的测试 `components/MatchCard.test.tsx`**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { TournamentEvent } from '@/lib/data/schema'
import { MatchCard } from './MatchCard'

function makeEvent(scores: Record<string, [number, number]> = {}): TournamentEvent {
  const n = 8 as const
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
      live: false,
      scheduledAt: '2026-10-01T14:00:00+08:00',
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

function render(matchId: string, selected = false, scores = {}) {
  const d = deriveBracket(makeEvent(scores))
  return renderToStaticMarkup(
    <MatchCard match={d.byId[matchId]} selected={selected} onSelect={() => {}} />,
  )
}

describe('MatchCard', () => {
  it('显示两队名称与 BO 与时间', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('BO3')
    expect(html).toContain('10-01 14:00')
    expect(html).toContain('data-match-id="WB-R1-M1"')
  })

  it('已有比分时显示比分与胜者比分徽标', () => {
    const html = render('WB-R1-M1', false, { 'WB-R1-M1': [2, 1] })
    expect(html).toContain('>2<')
    expect(html).toContain('>1<')
    expect(html).toContain('text-wb')
  })

  it('队伍未确定时显示来源描述', () => {
    const html = render('WB-R2-M1')
    expect(html).toContain('WB-R1-M1 胜者')
    expect(html).toContain('WB-R1-M2 胜者')
  })

  it('选中态使用高亮边框', () => {
    expect(render('WB-R1-M1', true)).toContain('border-wb')
    expect(render('WB-R1-M1', false)).toContain('border-line')
  })

  it('进行中的比赛显示实时标记', () => {
    const ev = makeEvent()
    ev.matches = ev.matches.map((m) => (m.id === 'WB-R1-M1' ? { ...m, live: true } : m))
    const d = deriveBracket(ev)
    const html = renderToStaticMarkup(
      <MatchCard match={d.byId['WB-R1-M1']} selected={false} onSelect={() => {}} />,
    )
    expect(html).toContain('进行中')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run components/MatchCard.test.tsx`
Expected: FAIL，报错 `Failed to resolve import "./MatchCard"`

- [ ] **Step 3：实现 `components/MatchCard.tsx`**

```tsx
'use client'

import type { DerivedMatch } from '@/lib/bracket/advance'
import { formatDateTime, slotLabel } from '@/lib/view'

export type MatchCardProps = {
  match: DerivedMatch
  selected: boolean
  onSelect: (matchId: string) => void
}

type TeamRowProps = {
  name: string
  seed: number | null
  unresolved: boolean
  score: number | null
  won: boolean
  lost: boolean
}

function TeamRow({ name, seed, unresolved, score, won, lost }: TeamRowProps) {
  const nameClass = won
    ? 'font-semibold text-fg'
    : lost
      ? 'text-muted/70'
      : unresolved
        ? 'italic text-muted/70'
        : 'text-fg'
  const scoreClass = won ? 'font-semibold text-wb' : lost ? 'text-muted/70' : 'text-muted'

  return (
    <div className="flex items-center gap-1.5 text-xs leading-none">
      <span className="w-3.5 shrink-0 text-[10px] text-muted">{seed ?? '–'}</span>
      <span className={`flex-1 truncate ${nameClass}`} title={name}>
        {name}
      </span>
      <span className={`w-3.5 shrink-0 text-right tabular-nums ${scoreClass}`}>{score ?? ''}</span>
    </div>
  )
}

export function MatchCard({ match, selected, onSelect }: MatchCardProps) {
  const done = match.status === 'finished'
  const aWon = done && match.teamA !== null && match.winnerId === match.teamA.id
  const bWon = done && match.teamB !== null && match.winnerId === match.teamB.id

  return (
    <button
      type="button"
      data-match-id={match.id}
      onClick={() => onSelect(match.id)}
      title={`${slotLabel(match.sourceA)} vs ${slotLabel(match.sourceB)}`}
      className={`flex h-full w-full flex-col justify-center gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-colors ${
        selected ? 'border-wb bg-panel-hi' : 'border-line bg-panel hover:border-muted/60 hover:bg-panel-hi'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] leading-none text-muted">
        <span>{`BO${match.bo}`}</span>
        {match.status === 'live' ? (
          <span className="font-semibold text-live">进行中</span>
        ) : (
          <span>{formatDateTime(match.scheduledAt)}</span>
        )}
      </div>
      <TeamRow
        name={match.teamA?.name ?? slotLabel(match.sourceA)}
        seed={match.teamA?.seed ?? null}
        unresolved={match.teamA === null}
        score={match.scoreA}
        won={aWon}
        lost={done && !aWon && match.teamA !== null}
      />
      <TeamRow
        name={match.teamB?.name ?? slotLabel(match.sourceB)}
        seed={match.teamB?.seed ?? null}
        unresolved={match.teamB === null}
        score={match.scoreB}
        won={bWon}
        lost={done && !bWon && match.teamB !== null}
      />
    </button>
  )
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run components/MatchCard.test.tsx`
Expected: PASS，5 个用例全绿

- [ ] **Step 5：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 6：Commit**

```bash
git add components/MatchCard.tsx components/MatchCard.test.tsx
git commit -m "feat(ui): 对阵图单场卡片"
```

---

### Task 12：连接线层与对阵图容器

**Files:**
- Create: `components/Connectors.tsx`, `components/BracketView.tsx`
- Test: `components/BracketView.test.tsx`

`BracketView` 只做三件事：把 `layoutBracket()` 的坐标画出来、提供缩放、把点击事件冒泡出去。所有定位都用绝对坐标 + `transform: scale()`，容器负责滚动，因此手机上可以直接横向拖动查看（设计文档 §2 响应式要求）。

- [ ] **Step 1：写失败的测试 `components/BracketView.test.tsx`**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import { layoutBracket } from '@/lib/bracket/layout'
import type { TournamentEvent } from '@/lib/data/schema'
import { connectorViews } from '@/lib/view'
import { BracketView } from './BracketView'
import { Connectors } from './Connectors'

function makeEvent(): TournamentEvent {
  const n = 8 as const
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: null,
      scoreB: null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('Connectors', () => {
  it('每条连接线渲染一个 path，虚线带 stroke-dasharray', () => {
    const d = deriveBracket(makeEvent())
    const l = layoutBracket(d, 8)
    const views = connectorViews(l, d)
    const html = renderToStaticMarkup(
      <Connectors connectors={views} width={l.width} height={l.height} />,
    )
    expect((html.match(/<path/g) ?? []).length).toBe(20)
    expect(html).toContain('stroke-dasharray="4 4"')
  })
})

describe('BracketView', () => {
  const d = deriveBracket(makeEvent())
  const html = renderToStaticMarkup(
    <BracketView derived={d} bracketSize={8} selectedMatchId="WB-R1-M1" onSelectMatch={() => {}} />,
  )

  it('渲染全部 14 场比赛卡片', () => {
    expect((html.match(/data-match-id=/g) ?? []).length).toBe(14)
  })

  it('渲染各轮列标题', () => {
    expect(html).toContain('胜者组 第 1 轮')
    expect(html).toContain('胜者组决赛')
    expect(html).toContain('败者组决赛')
    expect(html).toContain('总决赛')
  })

  it('渲染缩放控件与图例', () => {
    expect(html).toContain('100%')
    expect(html).toContain('实线 = 晋级')
    expect(html).toContain('虚线 = 掉落至败者组')
  })

  it('选中比赛使用高亮样式', () => {
    expect(html).toContain('border-wb')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run components/BracketView.test.tsx`
Expected: FAIL，报错 `Failed to resolve import "./BracketView"`

- [ ] **Step 3：实现 `components/Connectors.tsx`**

```tsx
'use client'

import type { ConnectorView } from '@/lib/view'

export type ConnectorsProps = {
  connectors: ConnectorView[]
  width: number
  height: number
}

export function Connectors({ connectors, width, height }: ConnectorsProps) {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {connectors.map((c) => (
        <path
          key={c.key}
          d={c.path}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={1.5}
          strokeDasharray={c.dashed ? '4 4' : undefined}
        />
      ))}
    </svg>
  )
}
```

- [ ] **Step 4：实现 `components/BracketView.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import type { DerivedBracket } from '@/lib/bracket/advance'
import { CARD_W, layoutBracket } from '@/lib/bracket/layout'
import { BRACKET_COLOR, connectorViews } from '@/lib/view'
import { Connectors } from './Connectors'
import { MatchCard } from './MatchCard'

const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

export type BracketViewProps = {
  derived: DerivedBracket
  bracketSize: 4 | 8 | 16 | 32
  selectedMatchId: string | null
  onSelectMatch: (matchId: string) => void
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

export function BracketView({ derived, bracketSize, selectedMatchId, onSelectMatch }: BracketViewProps) {
  const [zoom, setZoom] = useState(1)
  const layout = useMemo(() => layoutBracket(derived, bracketSize), [derived, bracketSize])
  const connectors = useMemo(() => connectorViews(layout, derived), [layout, derived])

  // 列标题贴在每列最上方卡片之上，因此各列标题的纵向位置不同
  const columnHeaders = useMemo(
    () =>
      layout.columns.flatMap((col) => {
        const cards = layout.cards.filter(
          (c) => c.matchId === col.key || c.matchId.startsWith(`${col.key}-`),
        )
        if (cards.length === 0) return []
        return [
          {
            key: col.key,
            label: col.label,
            bracket: col.bracket,
            x: col.x,
            y: Math.min(...cards.map((c) => c.y)) - 18,
          },
        ]
      }),
    [layout],
  )

  return (
    <div className="rounded-lg border border-line bg-base">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-panel px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>实线 = 晋级</span>
          <span>虚线 = 掉落至败者组</span>
          <span>点击卡片查看详情</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
            aria-label="缩小"
          >
            −
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-muted">
            {`${Math.round(zoom * 100)}%`}
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
            aria-label="放大"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="h-6 rounded border border-line px-2 text-xs text-muted hover:text-fg"
          >
            重置
          </button>
        </div>
      </div>

      <div className="max-h-[72vh] overflow-auto p-3">
        <div
          className="relative"
          style={{ width: layout.width * zoom, height: layout.height * zoom }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            {layout.sections.map((s) => (
              <div
                key={s.bracket}
                className="absolute rounded-md border-t-2"
                style={{
                  left: 0,
                  top: s.y,
                  width: layout.width,
                  height: s.height,
                  borderColor: BRACKET_COLOR[s.bracket],
                  backgroundColor: `${BRACKET_COLOR[s.bracket]}0d`,
                }}
              />
            ))}

            {columnHeaders.map((h) => (
              <div
                key={h.key}
                className="absolute text-[10px] font-semibold uppercase tracking-wide"
                style={{ left: h.x, top: h.y, width: CARD_W, color: BRACKET_COLOR[h.bracket] }}
              >
                {h.label}
              </div>
            ))}

            <Connectors connectors={connectors} width={layout.width} height={layout.height} />

            {layout.cards.map((c) => (
              <div
                key={c.matchId}
                className="absolute"
                style={{ left: c.x, top: c.y, width: c.width, height: c.height }}
              >
                <MatchCard
                  match={derived.byId[c.matchId]}
                  selected={selectedMatchId === c.matchId}
                  onSelect={onSelectMatch}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5：运行测试确认通过**

Run: `npx vitest run components/BracketView.test.tsx`
Expected: PASS，5 个用例全绿

- [ ] **Step 6：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 7：Commit**

```bash
git add components/Connectors.tsx components/BracketView.tsx components/BracketView.test.tsx
git commit -m "feat(ui): 对阵图容器、连接线与缩放"
```

---

### Task 13：轮询 hook 与比赛详情弹窗

**Files:**
- Create: `lib/useEventData.ts`, `components/MatchDetailDialog.tsx`
- Test: `lib/useEventData.test.ts`, `components/MatchDetailDialog.test.tsx`

`applyPending` 是"乐观更新"的关键：管理员提交比分后本地立刻显示新结果，但在 GitHub Actions 重建完成前，轮询拿到的仍是旧数据。若不叠加待生效改动，用户会看到自己的修改"闪一下又变回去"。因此每次轮询后用 `prunePending` 丢弃已生效的改动。

- [ ] **Step 1：写失败的测试 `lib/useEventData.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { generateTemplate } from './bracket/generate'
import type { TournamentEvent } from './data/schema'
import { applyPending, prunePending } from './useEventData'

function makeEvent(scores: Record<string, [number, number]> = {}): TournamentEvent {
  const n = 8 as const
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

describe('applyPending', () => {
  it('没有待生效改动时原样返回同一引用', () => {
    const ev = makeEvent()
    expect(applyPending(ev, [])).toBe(ev)
  })

  it('把待生效比分叠加到对应比赛上', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])
    const m = out.matches.find((x) => x.id === 'WB-R1-M1')!
    expect([m.scoreA, m.scoreB]).toEqual([2, 0])
    expect(out.matches).not.toBe(ev.matches)
  })

  it('服务端比分与待生效一致时保持原引用（说明已生效）', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    expect(applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])).toBe(ev)
  })

  it('可以叠加 live 标记', () => {
    const ev = makeEvent()
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { live: true } }])
    expect(out.matches.find((x) => x.id === 'WB-R1-M1')!.live).toBe(true)
  })

  it('未涉及的其他比赛比分不受影响', () => {
    const ev = makeEvent({ 'WB-R1-M2': [0, 2] })
    const out = applyPending(ev, [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } }])
    const m2 = out.matches.find((x) => x.id === 'WB-R1-M2')!
    expect([m2.scoreA, m2.scoreB]).toEqual([0, 2])
  })
})

describe('prunePending', () => {
  it('已生效的改动被移除，未生效的保留', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    const pending = [
      { matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0 } },
      { matchId: 'WB-R1-M2', patch: { scoreA: 2, scoreB: 1 } },
    ]
    expect(prunePending(ev, pending)).toEqual([{ matchId: 'WB-R1-M2', patch: { scoreA: 2, scoreB: 1 } }])
  })

  it('patch 里只要有一个字段尚未生效就保留整条改动', () => {
    const ev = makeEvent({ 'WB-R1-M1': [2, 0] })
    const pending = [{ matchId: 'WB-R1-M1', patch: { scoreA: 2, scoreB: 0, live: true } }]
    expect(prunePending(ev, pending)).toEqual(pending)
  })

  it('比赛不存在时保留该改动（等数据文件出现）', () => {
    const ev = makeEvent()
    const pending = [{ matchId: 'NOT-EXIST', patch: { scoreA: 3, scoreB: 0 } }]
    expect(prunePending(ev, pending)).toEqual(pending)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/useEventData.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./useEventData"`

- [ ] **Step 3：实现 `lib/useEventData.ts`**

```ts
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseEvent, type StoredMatch, type TournamentEvent } from '@/lib/data/schema'
import { pollUrl } from '@/lib/urls'

export const POLL_INTERVAL_MS = 30_000

/** 一次尚未随 Actions 重建生效的改动；patch 只描述被改动的字段 */
export type PendingChange = {
  matchId: string
  patch: Partial<Pick<StoredMatch, 'scoreA' | 'scoreB' | 'live'>>
}

/** 把尚未生效的改动叠加到服务端数据上 */
export function applyPending(event: TournamentEvent, pending: PendingChange[]): TournamentEvent {
  if (pending.length === 0) return event
  const byId = new Map(pending.map((p) => [p.matchId, p.patch]))
  let changed = false
  const matches = event.matches.map((m) => {
    const patch = byId.get(m.id)
    if (!patch) return m
    const merged: StoredMatch = { ...m, ...patch }
    if (merged.scoreA === m.scoreA && merged.scoreB === m.scoreB && merged.live === m.live) return m
    changed = true
    return merged
  })
  return changed ? { ...event, matches } : event
}

/** 丢弃服务端已生效的改动；patch 中只要有一个字段与远端不一致就保留整条 */
export function prunePending(event: TournamentEvent, pending: PendingChange[]): PendingChange[] {
  const byId = new Map(event.matches.map((m) => [m.id, m]))
  return pending.filter((p) => {
    const m = byId.get(p.matchId)
    if (!m) return true
    return Object.entries(p.patch).some(
      ([key, value]) => (m as unknown as Record<string, unknown>)[key] !== value,
    )
  })
}

export type EventDataState = {
  /** 叠加了待生效改动后的数据，用于渲染 */
  event: TournamentEvent
  /** 轮询拿到的原始数据，用于判断待生效改动是否已生效 */
  remote: TournamentEvent
  loading: boolean
  error: string | null
  lastFetchedAt: number | null
  refresh: () => Promise<void>
}

export function useEventData(initial: TournamentEvent, pending: PendingChange[] = []): EventDataState {
  const [remote, setRemote] = useState<TournamentEvent>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(pollUrl(`/events/${initial.id}.json`), { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRemote(parseEvent(await res.json()))
      setError(null)
      setLastFetchedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [initial.id])

  useEffect(() => {
    const timer = setInterval(() => {
      // 页面在后台时暂停轮询，减少无谓请求（设计文档 §10.3）
      if (typeof document !== 'undefined' && document.hidden) return
      void refresh()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const event = useMemo(() => applyPending(remote, pending), [remote, pending])

  return { event, remote, loading, error, lastFetchedAt, refresh }
}
```

设计要点：不在挂载时立即 fetch——首屏数据已由服务端静态渲染，立刻再拉一次纯属浪费；首次轮询发生在一个周期之后。

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/useEventData.test.ts`
Expected: PASS，8 个用例全绿

- [ ] **Step 5：写失败的测试 `components/MatchDetailDialog.test.tsx`**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { TournamentEvent } from '@/lib/data/schema'
import { MatchDetailDialog } from './MatchDetailDialog'

function makeEvent(scores: Record<string, [number, number]> = {}): TournamentEvent {
  const n = 8 as const
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [{ name: `选手${i + 1}` }],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
      live: false,
      scheduledAt: '2026-10-01T14:00:00+08:00',
      referee: '裁判甲',
      streamUrl: 'https://example.com/live',
      note: '备注文本',
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

function render(matchId: string, scores = {}) {
  const d = deriveBracket(makeEvent(scores))
  return renderToStaticMarkup(
    <MatchDetailDialog match={d.byId[matchId]} derived={d} onClose={() => {}} />,
  )
}

describe('MatchDetailDialog', () => {
  it('显示标题、双方与比分、赛制、状态', () => {
    const html = render('WB-R1-M1', { 'WB-R1-M1': [2, 1] })
    expect(html).toContain('胜者组 · 第 1 轮 · 第 1 场')
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('BO3')
    expect(html).toContain('已结束')
  })

  it('显示时间、裁判、直播链接与备注', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('10-01 14:00')
    expect(html).toContain('裁判甲')
    expect(html).toContain('https://example.com/live')
    expect(html).toContain('备注文本')
  })

  it('标注晋级与掉落去向', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('胜者 → WB-R2-M1')
    expect(html).toContain('败者 → LB-R1-M1')
  })

  it('败者组比赛标注落败即淘汰', () => {
    const html = render('LB-R3-M1')
    expect(html).toContain('败者 → 淘汰')
  })

  it('总决赛标注冠亚军', () => {
    const html = render('GF')
    expect(html).toContain('胜者 → 冠军')
    expect(html).toContain('败者 → 亚军')
  })

  it('未确定队伍显示来源描述', () => {
    const html = render('WB-R2-M1')
    expect(html).toContain('WB-R1-M1 胜者')
    expect(html).toContain('WB-R1-M2 胜者')
  })
})
```

- [ ] **Step 6：运行测试确认失败**

Run: `npx vitest run components/MatchDetailDialog.test.tsx`
Expected: FAIL，报错 `Failed to resolve import "./MatchDetailDialog"`

- [ ] **Step 7：实现 `components/MatchDetailDialog.tsx`**

本阶段只有只读展示；Task 18 会在其中加入管理员录分表单。

```tsx
'use client'

import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { BRACKET_COLOR, BRACKET_LABEL, formatDateTime, nextStops, slotLabel, statusLabel } from '@/lib/view'

export type MatchDetailDialogProps = {
  match: DerivedMatch
  derived: DerivedBracket
  onClose: () => void
}

function ScoreRow({
  name,
  seed,
  score,
  won,
}: {
  name: string
  seed: number | null
  score: number | null
  won: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-panel-hi px-3 py-2">
      <span className="w-5 text-[11px] text-muted">{seed ?? '–'}</span>
      <span className={`flex-1 truncate text-sm ${won ? 'font-semibold text-fg' : 'text-muted'}`}>
        {name}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${won ? 'text-wb' : 'text-muted'}`}>
        {score ?? '–'}
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

export function MatchDetailDialog({ match, derived, onClose }: MatchDetailDialogProps) {
  const stops = nextStops(derived, match.id)
  const winnerStop = stops.find((s) => s.kind === 'winner')
  const loserStop = stops.find((s) => s.kind === 'loser')
  const isFinal = match.bracket === 'GF'
  const done = match.status === 'finished'

  const winnerTarget = winnerStop ? winnerStop.matchId : isFinal ? '冠军' : '—'
  const loserTarget = loserStop ? loserStop.matchId : isFinal ? '亚军' : '淘汰'
  const title = `${BRACKET_LABEL[match.bracket]} · 第 ${match.round} 轮 · 第 ${match.index} 场`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-lg border border-line bg-panel sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BRACKET_COLOR[match.bracket] }}
            />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <ScoreRow
              name={match.teamA?.name ?? slotLabel(match.sourceA)}
              seed={match.teamA?.seed ?? null}
              score={match.scoreA}
              won={done && match.teamA !== null && match.winnerId === match.teamA.id}
            />
            <ScoreRow
              name={match.teamB?.name ?? slotLabel(match.sourceB)}
              seed={match.teamB?.seed ?? null}
              score={match.scoreB}
              won={done && match.teamB !== null && match.winnerId === match.teamB.id}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Field label="状态" value={statusLabel(match.status)} />
            <Field label="赛制" value={`BO${match.bo}`} />
            <Field label="开始时间" value={formatDateTime(match.scheduledAt)} />
            <Field label="裁判" value={match.referee ?? '—'} />
            <div className="col-span-2 min-w-0">
              <dt className="text-muted">直播</dt>
              <dd className="truncate">
                {match.streamUrl ? (
                  <a href={match.streamUrl} target="_blank" rel="noreferrer" className="text-wb hover:underline">
                    {match.streamUrl}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">备注</dt>
              <dd className="whitespace-pre-wrap">{match.note ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">去向</dt>
              <dd className="space-y-0.5">
                <div>{`胜者 → ${winnerTarget}`}</div>
                <div>{`败者 → ${loserTarget}`}</div>
              </dd>
            </div>
          </dl>
        </div>

        <footer className="border-t border-line px-4 py-3 text-xs text-muted">
          登录管理员后可在此录入比分
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 8：运行测试确认通过**

Run: `npx vitest run components/MatchDetailDialog.test.tsx`
Expected: PASS，6 个用例全绿

- [ ] **Step 9：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 10：Commit**

```bash
git add lib/useEventData.ts lib/useEventData.test.ts components/MatchDetailDialog.tsx components/MatchDetailDialog.test.tsx
git commit -m "feat(ui): 轮询 hook 与比赛详情弹窗"
```

---

### Task 14：赛事客户端容器、赛程页与队伍页

**Files:**
- Create: `components/EventClient.tsx`, `components/ScheduleView.tsx`, `components/TeamsView.tsx`
- Create: `app/event/[id]/layout.tsx`, `app/event/[id]/page.tsx`, `app/event/[id]/schedule/page.tsx`, `app/event/[id]/teams/page.tsx`
- Test: `components/EventViews.test.tsx`

三个页面共用同一个客户端容器 `EventClient`：它负责轮询、视图切换、选中比赛与详情弹窗。页面本身只是服务端组件，负责 `loadEvent()` 与传递 `view`，因此轮询逻辑只存在一份。

- [ ] **Step 1：写失败的测试 `components/EventViews.test.tsx`**

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { TournamentEvent } from '@/lib/data/schema'
import { ScheduleView } from './ScheduleView'
import { TeamsView } from './TeamsView'

function makeEvent(scores: Record<string, [number, number]> = {}): TournamentEvent {
  const n = 8 as const
  return {
    id: 'e',
    name: '测试赛',
    format: 'double-elimination',
    bracketSize: n,
    status: 'ongoing',
    defaultBO: 3,
    grandFinalBO: 5,
    teams: Array.from({ length: n }, (_, i) => ({
      id: `t${i + 1}`,
      name: `T${i + 1}`,
      seed: i + 1,
      players: [{ name: `选手${i + 1}` }],
      logo: null,
    })),
    matches: generateTemplate(n).matches.map((t) => ({
      id: t.id,
      bracket: t.bracket,
      round: t.round,
      index: t.index,
      bo: t.bracket === 'GF' ? 5 : 3,
      scoreA: scores[t.id]?.[0] ?? null,
      scoreB: scores[t.id]?.[1] ?? null,
      live: false,
      scheduledAt: null,
      referee: null,
      streamUrl: null,
      note: null,
    })),
    announcements: [],
    updatedAt: '2026-09-25T10:00:00+08:00',
  }
}

const ALL_WINS: Record<string, [number, number]> = {
  'WB-R1-M1': [2, 0],
  'WB-R1-M2': [2, 0],
  'WB-R1-M3': [2, 0],
  'WB-R1-M4': [2, 0],
  'WB-R2-M1': [2, 0],
  'WB-R2-M2': [2, 0],
  'WB-R3-M1': [2, 0],
  'LB-R1-M1': [2, 0],
  'LB-R1-M2': [2, 0],
  'LB-R2-M1': [2, 0],
  'LB-R2-M2': [2, 0],
  'LB-R3-M1': [2, 0],
  'LB-R4-M1': [2, 0],
  GF: [3, 1],
}

describe('ScheduleView', () => {
  it('渲染全部 14 场比赛行', () => {
    const d = deriveBracket(makeEvent())
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect((html.match(/<li/g) ?? []).length).toBe(14)
    expect(html).toContain('时间待定')
  })

  it('已有比分显示比分，未确定的对阵显示来源', () => {
    const d = deriveBracket(makeEvent({ 'WB-R1-M1': [2, 1] }))
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect(html).toContain('2 : 1')
    expect(html).toContain('WB-R1-M1 胜者')
  })

  it('按状态给出不同徽标文案', () => {
    const d = deriveBracket(makeEvent({ 'WB-R1-M1': [2, 1] }))
    const html = renderToStaticMarkup(<ScheduleView derived={d} onSelectMatch={() => {}} />)
    expect(html).toContain('已结束')
    expect(html).toContain('未开始')
    expect(html).toContain('待定')
  })
})

describe('TeamsView', () => {
  it('列出全部队伍并标注存活状态', () => {
    const ev = makeEvent()
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={deriveBracket(ev)} />)
    expect(html).toContain('T1')
    expect(html).toContain('T8')
    expect(html).toContain('选手1')
    expect((html.match(/胜者组存活/g) ?? []).length).toBe(8)
  })

  it('比赛全部结束后显示冠军', () => {
    const ev = makeEvent(ALL_WINS)
    const d = deriveBracket(ev)
    expect(d.championId).toBe('t1')
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={d} />)
    expect(html).toContain('冠军：T1')
    expect((html.match(/已淘汰/g) ?? []).length).toBe(7)
  })

  it('被淘汰的队伍标注淘汰于哪一场', () => {
    // 输掉胜者组比赛只是掉落败者组；真正被淘汰发生在败者组比赛上
    const ev = makeEvent({ 'WB-R1-M1': [2, 0], 'WB-R1-M2': [2, 0], 'LB-R1-M1': [2, 1] })
    const html = renderToStaticMarkup(<TeamsView event={ev} derived={deriveBracket(ev)} />)
    expect(html).toContain('已淘汰（LB-R1-M1）')
    expect(html).toContain('败者组存活')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run components/EventViews.test.tsx`
Expected: FAIL，报错 `Failed to resolve import "./ScheduleView"`

- [ ] **Step 3：实现 `components/ScheduleView.tsx`**

```tsx
'use client'

import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { BRACKET_COLOR, BRACKET_LABEL, formatDateTime, groupMatchesByDay, slotLabel } from '@/lib/view'

export type ScheduleViewProps = {
  derived: DerivedBracket
  onSelectMatch: (matchId: string) => void
}

function StatusBadge({ match }: { match: DerivedMatch }) {
  if (match.status === 'live') {
    return <span className="rounded border border-live/50 px-1.5 py-0.5 text-[10px] text-live">进行中</span>
  }
  if (match.status === 'finished') {
    return <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">已结束</span>
  }
  if (match.status === 'ready') {
    return <span className="rounded border border-wb/40 px-1.5 py-0.5 text-[10px] text-wb">未开始</span>
  }
  return <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted/70">待定</span>
}

export function ScheduleView({ derived, onSelectMatch }: ScheduleViewProps) {
  const days = groupMatchesByDay(derived.matches)

  if (days.length === 0) {
    return <p className="text-muted">暂无赛程。</p>
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day.key} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">{day.label}</h2>
          <ul className="space-y-1.5">
            {day.matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelectMatch(m.id)}
                  className="flex w-full items-center gap-3 rounded-md border border-line bg-panel px-3 py-2 text-left transition-colors hover:border-muted/60 hover:bg-panel-hi"
                >
                  <span className="w-24 shrink-0 text-[11px] text-muted">
                    {formatDateTime(m.scheduledAt)}
                  </span>
                  <span
                    className="w-12 shrink-0 text-[11px]"
                    style={{ color: BRACKET_COLOR[m.bracket] }}
                  >
                    {BRACKET_LABEL[m.bracket]}
                  </span>
                  <span className="flex-1 truncate text-sm">
                    {`${m.teamA?.name ?? slotLabel(m.sourceA)} vs ${m.teamB?.name ?? slotLabel(m.sourceB)}`}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {m.scoreA === null || m.scoreB === null ? `BO${m.bo}` : `${m.scoreA} : ${m.scoreB}`}
                  </span>
                  <StatusBadge match={m} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

- [ ] **Step 4：实现 `components/TeamsView.tsx`**

```tsx
'use client'

import type { DerivedBracket } from '@/lib/bracket/advance'
import type { TournamentEvent } from '@/lib/data/schema'
import { laneLabel, sortTeams } from '@/lib/view'

const LANE_CLASS: Record<'alive-wb' | 'alive-lb' | 'eliminated', string> = {
  'alive-wb': 'text-wb',
  'alive-lb': 'text-lb',
  eliminated: 'text-muted/60',
}

export type TeamsViewProps = {
  event: TournamentEvent
  derived: DerivedBracket
}

export function TeamsView({ event, derived }: TeamsViewProps) {
  const teamById = new Map(event.teams.map((t) => [t.id, t]))
  const teams = sortTeams(derived.teamStates)

  if (teams.length === 0) {
    return <p className="text-muted">暂无队伍。</p>
  }

  const champion = derived.championId ? teamById.get(derived.championId) : undefined

  return (
    <div className="space-y-3">
      {champion ? (
        <div className="rounded-md border border-wb/50 bg-panel px-3 py-2 text-sm text-wb">
          {`冠军：${champion.name}`}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-panel text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">种子</th>
              <th className="px-3 py-2 font-medium">队伍</th>
              <th className="px-3 py-2 font-medium">选手</th>
              <th className="px-3 py-2 text-right font-medium">胜</th>
              <th className="px-3 py-2 text-right font-medium">负</th>
              <th className="px-3 py-2 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const players = teamById.get(t.teamId)?.players ?? []
              const status =
                t.status === 'eliminated' && t.eliminatedByMatchId
                  ? `${laneLabel(t.status)}（${t.eliminatedByMatchId}）`
                  : laneLabel(t.status)
              return (
                <tr key={t.teamId} className="border-t border-line">
                  <td className="px-3 py-2 text-muted">{t.seed}</td>
                  <td className="px-3 py-2">{t.name}</td>
                  <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted">
                    {players.length > 0 ? players.map((p) => p.name).join('、') : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.wins}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.losses}</td>
                  <td className={`px-3 py-2 text-xs ${LANE_CLASS[t.status]}`}>{status}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 5：实现 `components/EventClient.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { deriveBracket } from '@/lib/bracket/advance'
import type { TournamentEvent } from '@/lib/data/schema'
import { useEventData } from '@/lib/useEventData'
import { formatDateTime } from '@/lib/view'
import { BracketView } from './BracketView'
import { MatchDetailDialog } from './MatchDetailDialog'
import { ScheduleView } from './ScheduleView'
import { TeamsView } from './TeamsView'

export type EventViewKind = 'bracket' | 'schedule' | 'teams'

export type EventClientProps = {
  initial: TournamentEvent | null
  view: EventViewKind
}

const TABS: { view: EventViewKind; label: string; segment: string }[] = [
  { view: 'bracket', label: '对阵图', segment: '' },
  { view: 'schedule', label: '赛程', segment: 'schedule/' },
  { view: 'teams', label: '队伍', segment: 'teams/' },
]

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EventClient({ initial, view }: EventClientProps) {
  if (!initial) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
        该赛事的数据暂不可用。数据文件可能缺失或格式有误。
      </div>
    )
  }
  return <EventLive initial={initial} view={view} />
}

function EventLive({ initial, view }: { initial: TournamentEvent; view: EventViewKind }) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const { event, error, lastFetchedAt } = useEventData(initial)
  const derived = useMemo(() => deriveBracket(event), [event])
  const selected = selectedMatchId ? derived.byId[selectedMatchId] : null

  const finished = event.matches.filter((m) => m.scoreA !== null && m.scoreB !== null).length
  const champion = derived.championId
    ? event.teams.find((t) => t.id === derived.championId)
    : undefined

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
            <p className="mt-1 text-xs text-muted">
              {`${event.bracketSize} 队 · 双败淘汰 · ${finished} / ${event.matches.length} 场已完成`}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted">
            {champion ? (
              <div className="text-sm font-semibold text-wb">{`冠军：${champion.name}`}</div>
            ) : null}
            <div>{lastFetchedAt ? `已同步 ${formatClock(lastFetchedAt)}` : '30 秒自动刷新'}</div>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-danger/40 bg-panel px-3 py-2 text-xs text-danger">
            {`数据刷新失败：${error}。页面显示的可能是稍早的数据。`}
          </p>
        ) : null}

        {event.announcements.length > 0 ? (
          <ul className="space-y-1 rounded border border-line bg-panel px-3 py-2 text-xs">
            {event.announcements.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-muted">{formatDateTime(a.createdAt)}</span>
                <span className="flex-1">{a.content}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <nav className="flex gap-1 border-b border-line">
          {TABS.map((tab) => (
            <Link
              key={tab.view}
              href={`/event/${event.id}/${tab.segment}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                view === tab.view
                  ? 'border-wb text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {view === 'bracket' ? (
        <BracketView
          derived={derived}
          bracketSize={event.bracketSize}
          selectedMatchId={selectedMatchId}
          onSelectMatch={setSelectedMatchId}
        />
      ) : null}
      {view === 'schedule' ? (
        <ScheduleView derived={derived} onSelectMatch={setSelectedMatchId} />
      ) : null}
      {view === 'teams' ? <TeamsView event={event} derived={derived} /> : null}

      {selected ? (
        <MatchDetailDialog
          match={selected}
          derived={derived}
          onClose={() => setSelectedMatchId(null)}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6：实现 `app/event/[id]/layout.tsx`**

`generateStaticParams` 在这里声明，三个子页面（对阵图 / 赛程 / 队伍）就都会在构建期生成对应的静态 HTML。

```tsx
import { listEventIds } from '@/lib/data/load'

export function generateStaticParams() {
  return listEventIds().map((id) => ({ id }))
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 7：实现三个赛事页面**

`app/event/[id]/page.tsx`：

```tsx
import { EventClient } from '@/components/EventClient'
import { loadEvent } from '@/lib/data/load'

export default async function EventBracketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EventClient initial={loadEvent(id)} view="bracket" />
}
```

`app/event/[id]/schedule/page.tsx`：

```tsx
import { EventClient } from '@/components/EventClient'
import { loadEvent } from '@/lib/data/load'

export default async function EventSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EventClient initial={loadEvent(id)} view="schedule" />
}
```

`app/event/[id]/teams/page.tsx`：

```tsx
import { EventClient } from '@/components/EventClient'
import { loadEvent } from '@/lib/data/load'

export default async function EventTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EventClient initial={loadEvent(id)} view="teams" />
}
```

- [ ] **Step 8：运行测试确认通过**

Run: `npx vitest run components/EventViews.test.tsx`
Expected: PASS，6 个用例全绿

- [ ] **Step 9：类型检查与构建**

Run: `npm run typecheck`
Expected: 无错误输出

Run: `npm run build`
Expected: 构建成功，`out/event/spring-2026/index.html`、`out/event/spring-2026/schedule/index.html`、`out/event/spring-2026/teams/index.html` 均存在

- [ ] **Step 10：人工目视确认（Phase 2 验收点）**

Run: `npm run dev`，逐项确认：

1. `http://localhost:3000/` → 赛事列表，点击"2026 春季赛"进入对阵图
2. 对阵图页：上方绿色带 = 胜者组、下方琥珀色带 = 败者组、最右 = 总决赛；胜者组第 1 轮的 4 张卡片显示 T1–T8；有比分的前两场显示 2:1 与 0:2；跨区连接线为虚线
3. 点击任意卡片 → 弹出详情，显示双方、比分、BO、时间、裁判、直播、备注与"胜者 → …／败者 → …"
4. 分别点击"缩小""放大""重置"，百分比随之变化且布局不错位
5. 切到"赛程"页 → 按日期（10-01、10-02…）分组的列表；切到"队伍"页 → 8 支队伍，状态均为"胜者组存活"
6. 把浏览器窗口缩到手机宽度（或开发者工具切换设备模拟）→ 对阵图可横向滚动、页面不出现横向溢出
7. 打开开发者工具 Network，等待 30 秒 → 观察到对 `/data/events/spring-2026.json?t=…` 的新请求，页面顶部"已同步 hh:mm"更新

确认后 Ctrl+C 停止。

- [ ] **Step 11：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 12：Commit**

```bash
git add components/EventClient.tsx components/ScheduleView.tsx components/TeamsView.tsx components/EventViews.test.tsx app/event
git commit -m "feat(ui): 赛事对阵图、赛程与队伍页面"
```

---

## Phase 3：鉴权与写入

Phase 2 结束时站点已可上线，但任何人都改不了数据。本阶段把"管理员改数据"这条链路打通：会话存储 → GitHub 写入通道 → 认证上下文与登录界面 → 录分交互。

三条贯穿本阶段的设计约束（设计文档 §6.5、§11）：

1. **token 永不进入业务代码**：它只存在于 `AuthProvider` 模块的私有作用域内，业务代码只能拿到 `isAdmin` 与 `mutate()`
2. **写入前惰性复验**：每次提交前重新验证 token 与白名单，失效即自动降级为游客
3. **任何鉴权异常都不得白屏**：最差情况是降级为游客 / 只读

---

### Task 15：会话存储与配置加载

**Files:**
- Create: `lib/auth/session.ts`
- Modify: `lib/data/load.ts`, `lib/data/load.test.ts`
- Test: `lib/auth/session.test.ts`

- [ ] **Step 1：写失败的测试 `lib/auth/session.test.ts`**

存储被抽成 `SessionStorage` 适配器，测试不需要真实浏览器环境；所有读写路径都必须在异常时静默降级（设计文档 §6.5 原则 ④、§11）。

```ts
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
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./session"`

- [ ] **Step 3：实现 `lib/auth/session.ts`**

```ts
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
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS，7 个用例全绿

- [ ] **Step 5：给 `lib/data/load.test.ts` 追加 `loadConfig` 用例**

把测试文件顶部的 import 改为（其余内容不动）：

```ts
import { listEventIds, listEvents, loadConfig, loadEvent } from './load'
```

在文件末尾的 `describe('load', ...)` 之后追加：

```ts
describe('loadConfig', () => {
  it('读取管理员白名单、仓库坐标与所需权限', () => {
    const cfg = loadConfig()
    expect(cfg).not.toBeNull()
    expect(cfg!.repo.repo).toBe('match-schedule')
    expect(cfg!.repo.branch).toBe('main')
    expect(cfg!.admins.length).toBeGreaterThan(0)
    expect(cfg!.requiredTokenScopes.path).toBe('public/data/')
  })

  it('配置损坏时返回 null 而非抛错（管理功能降级为禁用）', () => {
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => '{ 这不是 JSON')
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(loadConfig()).toBeNull()
    read.mockRestore()
    log.mockRestore()
  })
})
```

- [ ] **Step 6：运行测试确认失败**

Run: `npx vitest run lib/data/load.test.ts`
Expected: FAIL，报错提示 `loadConfig` 未导出

- [ ] **Step 7：给 `lib/data/load.ts` 增加 `loadConfig`**

把 import 行改为（新增 `AppConfig` 与 `parseConfig`）：

```ts
import { parseConfig, parseEvent, summarize, type AppConfig, type EventSummary, type TournamentEvent } from './schema'
```

在文件末尾追加：

```ts
const CONFIG_FILE = path.join(process.cwd(), 'public', 'data', 'config.json')

/**
 * 配置只影响"能否管理"，读取失败必须降级而不是中断构建（设计文档 §11）。
 * 返回 null 时 AuthProvider 会禁用一切管理功能，站点仍可正常浏览。
 */
export function loadConfig(): AppConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    return parseConfig(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')))
  } catch (err) {
    console.error('[load] 配置不可用，管理功能将被禁用', err)
    return null
  }
}
```

- [ ] **Step 8：运行测试确认通过**

Run: `npx vitest run lib/data/load.test.ts`
Expected: PASS，7 个用例全绿

- [ ] **Step 9：Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts lib/data/load.ts lib/data/load.test.ts
git commit -m "feat(auth): 版本化会话存储与配置加载"
```

---

### Task 16：GitHub 写入通道

**Files:**
- Create: `lib/data/github.ts`
- Test: `lib/data/github.test.ts`

本模块是**唯一写入入口**，也是唯一接触 GitHub HTTP 接口的地方（设计文档 §10.1、§10.2）。所有错误都被归类为 6 种 `FailureReason`，上层据此决定"退出登录"还是"提示权限不足"，而不必解析文案。

- [ ] **Step 1：写失败的测试 `lib/data/github.test.ts`**

```ts
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
  const current = { id: 'spring-2026', matches: [{ id: 'WB-R1-M1', scoreA: null, scoreB: null }] }

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
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/data/github.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./github"`

- [ ] **Step 3：实现 `lib/data/github.ts`**

关键点：手写 base64 编解码（`btoa` 只接受 Latin-1，队名里的中文会直接抛错）；409 与 422 都按并发冲突处理；写操作一律先 GET 再 PUT，保证携带正确 `sha`。

```ts
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
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/data/github.test.ts`
Expected: PASS，13 个用例全绿

- [ ] **Step 5：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 6：Commit**

```bash
git add lib/data/github.ts lib/data/github.test.ts
git commit -m "feat(data): GitHub Contents API 唯一写入通道"
```

---

### Task 17：认证上下文与登录界面

**Files:**
- Create: `components/auth/AuthProvider.tsx`, `components/auth/AdminGate.tsx`, `components/auth/LoginForm.tsx`
- Create: `components/admin/AdminPage.tsx`, `app/admin/page.tsx`
- Modify: `app/layout.tsx`
- Test: `components/auth/auth.test.tsx`

本任务落实设计文档 §6.5 的原则 ①：**token 只存在于模块作用域内**，不进入 React context。业务代码能拿到的只有 `isAdmin` 与 `mutate()`。

- [ ] **Step 1：写失败的测试 `components/auth/auth.test.tsx`**

用 `initialSession` 注入会话，从而在无浏览器环境下静态渲染出"已登录"与"未登录"两条分支。

```tsx
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminPage } from '@/components/admin/AdminPage'
import type { AppConfig, EventSummary } from '@/lib/data/schema'
import { AdminGate } from './AdminGate'
import { AuthProvider } from './AuthProvider'
import { LoginForm } from './LoginForm'

const CONFIG: AppConfig = {
  repo: { owner: 'octo', repo: 'match-schedule', branch: 'main' },
  admins: [{ login: 'admin-user', role: 'admin' }],
  requiredTokenScopes: { contents: 'write', path: 'public/data/' },
}

const ADMIN_SESSION = {
  login: 'admin-user',
  token: 'github_pat_x',
  role: 'admin' as const,
  savedAt: 0,
}

const EVENTS: EventSummary[] = [
  {
    id: 'spring-2026',
    name: '2026 春季赛',
    bracketSize: 8,
    status: 'ongoing',
    finishedMatches: 2,
    totalMatches: 14,
    updatedAt: '2026-09-25T10:00:00+08:00',
  },
]

function render(
  node: ReactNode,
  session: typeof ADMIN_SESSION | null = null,
  config: AppConfig | null = CONFIG,
) {
  return renderToStaticMarkup(
    <AuthProvider config={config} initialSession={session}>
      {node}
    </AuthProvider>,
  )
}

describe('AdminGate', () => {
  it('未登录时不渲染管理内容', () => {
    expect(render(<AdminGate><p>管理功能</p></AdminGate>)).not.toContain('管理功能')
  })

  it('登录后渲染管理内容', () => {
    expect(render(<AdminGate><p>管理功能</p></AdminGate>, ADMIN_SESSION)).toContain('管理功能')
  })

  it('会话中的登录名不在白名单时视为未登录', () => {
    const stranger = { ...ADMIN_SESSION, login: 'stranger' }
    expect(render(<AdminGate><p>管理功能</p></AdminGate>, stranger)).not.toContain('管理功能')
  })
})

describe('LoginForm', () => {
  it('渲染用户名、Token 输入框与所需的 GitHub 权限说明', () => {
    const html = render(<LoginForm />)
    expect(html).toContain('管理员登录')
    expect(html).toContain('GitHub 用户名')
    expect(html).toContain('Fine-grained Token')
    expect(html).toContain('name="token"')
    expect(html).toContain('type="password"')
    expect(html).toContain('octo/match-schedule')
    expect(html).toContain('public/data/')
  })

  it('配置缺失时提示登录被禁用', () => {
    const html = render(<LoginForm />, null, null)
    expect(html).toContain('管理员配置不可用')
  })
})

describe('AdminPage', () => {
  it('未登录时显示登录表单', () => {
    const html = render(<AdminPage events={EVENTS} />)
    expect(html).toContain('管理员登录')
    expect(html).not.toContain('退出登录')
  })

  it('登录后显示身份、退出按钮与赛事列表', () => {
    const html = render(<AdminPage events={EVENTS} />, ADMIN_SESSION)
    expect(html).toContain('admin-user')
    expect(html).toContain('管理员')
    expect(html).toContain('退出登录')
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('2 / 14 场')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run components/auth/auth.test.tsx`
Expected: FAIL，报错 `Failed to resolve import "./AuthProvider"`

- [ ] **Step 3：实现 `components/auth/AuthProvider.tsx`**

```tsx
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
```

- [ ] **Step 4：实现 `components/auth/AdminGate.tsx`**

```tsx
'use client'

import { useAuth } from './AuthProvider'

export type AdminGateProps = {
  children: React.ReactNode
  fallback?: React.ReactNode
}

/** 包裹管理功能：未登录或会话尚未恢复完成时渲染 fallback */
export function AdminGate({ children, fallback = null }: AdminGateProps) {
  const { ready, isAdmin } = useAuth()
  if (!ready || !isAdmin) return <>{fallback}</>
  return <>{children}</>
}
```

- [ ] **Step 5：实现 `components/auth/LoginForm.tsx`**

```tsx
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
```

- [ ] **Step 6：实现 `components/admin/AdminPage.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { AdminGate } from '@/components/auth/AdminGate'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/components/auth/AuthProvider'
import type { EventSummary } from '@/lib/data/schema'

export function AdminPage({ events }: { events: EventSummary[] }) {
  const { ready, isAdmin, login, role, signOut } = useAuth()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">后台管理</h1>
        <p className="text-xs text-muted">
          观众无需登录即可查看全部赛程；只有 config.json 名单内的人可以修改数据。
        </p>
      </header>

      {!ready ? (
        <p className="rounded border border-line bg-panel px-3 py-2 text-sm text-muted">
          正在检查登录状态...
        </p>
      ) : isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel px-3 py-2 text-sm">
          <span>{`已登录：${login}（${role === 'admin' ? '管理员' : '裁判'}）`}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            退出登录
          </button>
        </div>
      ) : (
        <LoginForm />
      )}

      <AdminGate
        fallback={<p className="text-xs text-muted">登录后可创建赛事、维护队伍与发布公告。</p>}
      >
        <section className="space-y-2">
          <h2 className="text-sm font-medium">赛事</h2>
          {events.length === 0 ? (
            <p className="text-xs text-muted">还没有任何赛事数据文件。</p>
          ) : (
            <ul className="divide-y divide-line rounded border border-line bg-panel text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Link href={`/event/${e.id}/`} className="hover:text-wb">
                    {e.name}
                  </Link>
                  <span className="text-xs text-muted">{`${e.finishedMatches} / ${e.totalMatches} 场`}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </AdminGate>
    </div>
  )
}
```

- [ ] **Step 7：实现 `app/admin/page.tsx`**

服务端组件在构建期用 `fs` 读取赛事清单，再交给客户端组件渲染——客户端组件不能 `import fs`。

```tsx
import type { Metadata } from 'next'
import { AdminPage } from '@/components/admin/AdminPage'
import { listEvents } from '@/lib/data/load'

export const metadata: Metadata = { title: '后台管理 · 赛事赛程' }

export default function AdminRoute() {
  return <AdminPage events={listEvents()} />
}
```

- [ ] **Step 8：修改 `app/layout.tsx`**

用 `AuthProvider` 包裹全站，`loadConfig()` 在构建期读取（返回 `null` 时管理功能整体禁用，浏览不受影响）。

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { loadConfig } from '@/lib/data/load'
import './globals.css'

export const metadata: Metadata = {
  title: '赛事赛程',
  description: '双败淘汰制赛程展示与管理',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-base text-fg">
        <AuthProvider config={loadConfig()}>
          <header className="border-b border-line bg-panel">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="text-lg font-semibold tracking-tight hover:text-wb">
                赛事赛程
              </Link>
              <Link href="/admin/" className="text-sm text-muted hover:text-fg">
                管理
              </Link>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 9：运行测试确认通过**

Run: `npx vitest run components/auth/auth.test.tsx`
Expected: PASS，8 个用例全绿

- [ ] **Step 10：类型检查**

Run: `npm run typecheck`
Expected: 无错误输出

- [ ] **Step 11：Commit**

```bash
git add components/auth components/admin app/admin app/layout.tsx
git commit -m "feat(auth): 认证上下文、登录界面与后台入口"
```

---

### Task 18：比分录入

**Files:**
- Modify: `components/MatchDetailDialog.tsx`, `components/EventClient.tsx`, `components/MatchDetailDialog.test.tsx`

录分是全站唯一让数据发生变化的入口，因此要点是：**提交前校验 → 写入 GitHub → 本地乐观更新 → 等 Actions 重建后自动对齐**。

- [ ] **Step 1：更新 `components/MatchDetailDialog.test.tsx`**

`MatchDetailDialog` 新增了 `eventId` 属性，且渲染时需要 `AuthProvider`。把测试文件顶部的 import 与 `render` 辅助函数替换为：

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { deriveBracket } from '@/lib/bracket/advance'
import { generateTemplate } from '@/lib/bracket/generate'
import type { AppConfig, TournamentEvent } from '@/lib/data/schema'
import { MatchDetailDialog } from './MatchDetailDialog'

const CONFIG: AppConfig = {
  repo: { owner: 'octo', repo: 'match-schedule', branch: 'main' },
  admins: [{ login: 'admin-user', role: 'admin' }],
  requiredTokenScopes: { contents: 'write', path: 'public/data/' },
}

const ADMIN_SESSION = {
  login: 'admin-user',
  token: 'github_pat_x',
  role: 'admin' as const,
  savedAt: 0,
}
```

`makeEvent` 保持不变，把 `render` 换成：

```tsx
function render(matchId: string, scores = {}, session: typeof ADMIN_SESSION | null = null) {
  const d = deriveBracket(makeEvent(scores))
  return renderToStaticMarkup(
    <AuthProvider config={CONFIG} initialSession={session}>
      <MatchDetailDialog match={d.byId[matchId]} derived={d} eventId="spring-2026" onClose={() => {}} />
    </AuthProvider>,
  )
}
```

在 `describe('MatchDetailDialog', ...)` 末尾追加两个用例：

```tsx
  it('游客只看到提示，看不到录分表单', () => {
    const html = render('WB-R1-M1')
    expect(html).toContain('只有登录后的管理员可以录入或修改比分')
    expect(html).not.toContain('aria-label="甲队局分"')
  })

  it('管理员看到录分表单、BO 提示与生效说明', () => {
    const html = render('WB-R1-M1', {}, ADMIN_SESSION)
    expect(html).toContain('aria-label="甲队局分"')
    expect(html).toContain('aria-label="乙队局分"')
    expect(html).toContain('BO3 · 先赢 2 局')
    expect(html).toContain('清除比分')
    expect(html).toContain('约 1–2 分钟后')
  })
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run components/MatchDetailDialog.test.tsx`
Expected: FAIL，报错 `eventId` 不是 `MatchDetailDialogProps` 的属性

- [ ] **Step 3：实现 `components/MatchDetailDialog.tsx`（完整替换）**

`ScoreEditor` 的三个动作都提交**完整**的 `{ scoreA, scoreB, live }`，避免"只改一半"的中间状态；提交前一律经过 `validateScore`。

```tsx
'use client'

import { useState } from 'react'
import { winsNeeded, validateScore } from '@/lib/bracket/validate'
import type { DerivedBracket, DerivedMatch } from '@/lib/bracket/advance'
import { parseEvent, type TournamentEvent } from '@/lib/data/schema'
import { BRACKET_COLOR, BRACKET_LABEL, formatDateTime, nextStops, slotLabel, statusLabel } from '@/lib/view'
import type { PendingChange } from '@/lib/useEventData'
import { useAuth } from './auth/AuthProvider'

export type MatchDetailDialogProps = {
  match: DerivedMatch
  derived: DerivedBracket
  eventId: string
  onClose: () => void
  /** 提交成功后把待生效改动交给上层做乐观更新 */
  onSaved?: (change: PendingChange) => void
}

function ScoreRow({
  name,
  seed,
  score,
  won,
}: {
  name: string
  seed: number | null
  score: number | null
  won: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-panel-hi px-3 py-2">
      <span className="w-5 text-[11px] text-muted">{seed ?? '–'}</span>
      <span className={`flex-1 truncate text-sm ${won ? 'font-semibold text-fg' : 'text-muted'}`}>
        {name}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${won ? 'text-wb' : 'text-muted'}`}>
        {score ?? '–'}
      </span>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  )
}

function ScoreEditor({
  match,
  eventId,
  onSaved,
}: {
  match: DerivedMatch
  eventId: string
  onSaved?: (change: PendingChange) => void
}) {
  const { isAdmin, mutate } = useAuth()
  const [scoreA, setScoreA] = useState(match.scoreA === null ? '' : String(match.scoreA))
  const [scoreB, setScoreB] = useState(match.scoreB === null ? '' : String(match.scoreB))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <p className="rounded border border-line bg-panel-hi px-3 py-2 text-[11px] text-muted">
        只有登录后的管理员可以录入或修改比分。
      </p>
    )
  }

  function toScore(raw: string): number | null {
    const trimmed = raw.trim()
    return trimmed === '' ? null : Number(trimmed)
  }

  async function save(next: { scoreA: number | null; scoreB: number | null; live: boolean }) {
    const check = validateScore(match.bo, next.scoreA, next.scoreB)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)

    const patch: PendingChange['patch'] = {
      scoreA: next.scoreA,
      scoreB: next.scoreB,
      live: next.live,
    }

    const outcome = await mutate<TournamentEvent>({
      path: `public/data/events/${eventId}.json`,
      parse: parseEvent,
      mutate: (current) => ({
        ...current,
        matches: current.matches.map((m) => (m.id === match.id ? { ...m, ...patch } : m)),
        updatedAt: new Date().toISOString(),
      }),
      message: `chore(data): ${eventId} 更新 ${match.id} 比分`,
    })

    setBusy(false)
    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    onSaved?.({ matchId: match.id, patch })
    setNotice('已提交，约 1–2 分钟后全网生效。')
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">录入比分</h3>
        <span className="text-[11px] text-muted">{`BO${match.bo} · 先赢 ${winsNeeded(match.bo)} 局`}</span>
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label="甲队局分"
          inputMode="numeric"
          value={scoreA}
          disabled={busy}
          onChange={(e) => setScoreA(e.target.value)}
          className="w-14 rounded border border-line bg-base px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-wb"
        />
        <span className="text-muted">:</span>
        <input
          aria-label="乙队局分"
          inputMode="numeric"
          value={scoreB}
          disabled={busy}
          onChange={(e) => setScoreB(e.target.value)}
          className="w-14 rounded border border-line bg-base px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-wb"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ scoreA: toScore(scoreA), scoreB: toScore(scoreB), live: false })}
          className="ml-auto rounded border border-wb px-3 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
        >
          {busy ? '提交中...' : '提交'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ scoreA: null, scoreB: null, live: false })}
          className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg disabled:opacity-40"
        >
          清除比分
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save({ scoreA: match.scoreA, scoreB: match.scoreB, live: !match.live })}
          className="rounded border border-line px-2 py-1 text-[11px] text-muted hover:text-fg disabled:opacity-40"
        >
          {match.live ? '取消「进行中」' : '标记「进行中」'}
        </button>
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-wb">{notice}</p> : null}
      <p className="text-[11px] leading-relaxed text-muted">
        提交会直接写入 GitHub 仓库中的数据文件，随后由 Actions 重建站点，约 1–2 分钟后对所有人生效。
      </p>
    </div>
  )
}

export function MatchDetailDialog({ match, derived, eventId, onClose, onSaved }: MatchDetailDialogProps) {
  const stops = nextStops(derived, match.id)
  const winnerStop = stops.find((s) => s.kind === 'winner')
  const loserStop = stops.find((s) => s.kind === 'loser')
  const isFinal = match.bracket === 'GF'
  const done = match.status === 'finished'

  const winnerTarget = winnerStop ? winnerStop.matchId : isFinal ? '冠军' : '—'
  const loserTarget = loserStop ? loserStop.matchId : isFinal ? '亚军' : '淘汰'
  const title = `${BRACKET_LABEL[match.bracket]} · 第 ${match.round} 轮 · 第 ${match.index} 场`

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-lg border border-line bg-panel sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BRACKET_COLOR[match.bracket] }}
            />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="h-6 w-6 rounded border border-line text-xs text-muted hover:text-fg"
          >
            ✕
          </button>
        </header>

        <div className="space-y-4 px-4 py-4">
          <div className="space-y-2">
            <ScoreRow
              name={match.teamA?.name ?? slotLabel(match.sourceA)}
              seed={match.teamA?.seed ?? null}
              score={match.scoreA}
              won={done && match.teamA !== null && match.winnerId === match.teamA.id}
            />
            <ScoreRow
              name={match.teamB?.name ?? slotLabel(match.sourceB)}
              seed={match.teamB?.seed ?? null}
              score={match.scoreB}
              won={done && match.teamB !== null && match.winnerId === match.teamB.id}
            />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <Field label="状态" value={statusLabel(match.status)} />
            <Field label="赛制" value={`BO${match.bo}`} />
            <Field label="开始时间" value={formatDateTime(match.scheduledAt)} />
            <Field label="裁判" value={match.referee ?? '—'} />
            <div className="col-span-2 min-w-0">
              <dt className="text-muted">直播</dt>
              <dd className="truncate">
                {match.streamUrl ? (
                  <a href={match.streamUrl} target="_blank" rel="noreferrer" className="text-wb hover:underline">
                    {match.streamUrl}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">备注</dt>
              <dd className="whitespace-pre-wrap">{match.note ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted">去向</dt>
              <dd className="space-y-0.5">
                <div>{`胜者 → ${winnerTarget}`}</div>
                <div>{`败者 → ${loserTarget}`}</div>
              </dd>
            </div>
          </dl>
        </div>

        <footer className="border-t border-line px-4 py-3">
          <ScoreEditor match={match} eventId={eventId} onSaved={onSaved} />
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run components/MatchDetailDialog.test.tsx`
Expected: PASS，8 个用例全绿

- [ ] **Step 5：把待生效改动接进 `components/EventClient.tsx`**

用 `EventLive` 整体替换（顶部 import 增加 `useEffect`、`PendingChange`、`prunePending`）：

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { deriveBracket } from '@/lib/bracket/advance'
import type { TournamentEvent } from '@/lib/data/schema'
import { prunePending, useEventData, type PendingChange } from '@/lib/useEventData'
import { formatDateTime } from '@/lib/view'
import { BracketView } from './BracketView'
import { MatchDetailDialog } from './MatchDetailDialog'
import { ScheduleView } from './ScheduleView'
import { TeamsView } from './TeamsView'

export type EventViewKind = 'bracket' | 'schedule' | 'teams'

export type EventClientProps = {
  initial: TournamentEvent | null
  view: EventViewKind
}

const TABS: { view: EventViewKind; label: string; segment: string }[] = [
  { view: 'bracket', label: '对阵图', segment: '' },
  { view: 'schedule', label: '赛程', segment: 'schedule/' },
  { view: 'teams', label: '队伍', segment: 'teams/' },
]

function formatClock(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function EventClient({ initial, view }: EventClientProps) {
  if (!initial) {
    return (
      <div className="rounded-lg border border-line bg-panel p-6 text-sm text-muted">
        该赛事的数据暂不可用。数据文件可能缺失或格式有误。
      </div>
    )
  }
  return <EventLive initial={initial} view={view} />
}

function EventLive({ initial, view }: { initial: TournamentEvent; view: EventViewKind }) {
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChange[]>([])
  const { event, remote, error, lastFetchedAt } = useEventData(initial, pending)
  const derived = useMemo(() => deriveBracket(event), [event])
  const selected = selectedMatchId ? derived.byId[selectedMatchId] : null

  // Actions 重建完成后，把已生效的改动从待生效列表里移除，避免它覆盖之后的新比分
  useEffect(() => {
    setPending((current) => {
      const next = prunePending(remote, current)
      return next.length === current.length ? current : next
    })
  }, [remote])

  const finished = event.matches.filter((m) => m.scoreA !== null && m.scoreB !== null).length
  const champion = derived.championId
    ? event.teams.find((t) => t.id === derived.championId)
    : undefined

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{event.name}</h1>
            <p className="mt-1 text-xs text-muted">
              {`${event.bracketSize} 队 · 双败淘汰 · ${finished} / ${event.matches.length} 场已完成`}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted">
            {champion ? (
              <div className="text-sm font-semibold text-wb">{`冠军：${champion.name}`}</div>
            ) : null}
            <div>{lastFetchedAt ? `已同步 ${formatClock(lastFetchedAt)}` : '30 秒自动刷新'}</div>
          </div>
        </div>

        {error ? (
          <p className="rounded border border-danger/40 bg-panel px-3 py-2 text-xs text-danger">
            {`数据刷新失败：${error}。页面显示的可能是稍早的数据。`}
          </p>
        ) : null}

        {pending.length > 0 ? (
          <p className="rounded border border-line bg-panel px-3 py-2 text-xs text-muted">
            {`已提交 ${pending.length} 处改动，等待 GitHub Actions 重建后生效（约 1–2 分钟）。`}
          </p>
        ) : null}

        {event.announcements.length > 0 ? (
          <ul className="space-y-1 rounded border border-line bg-panel px-3 py-2 text-xs">
            {event.announcements.map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="shrink-0 text-muted">{formatDateTime(a.createdAt)}</span>
                <span className="flex-1">{a.content}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <nav className="flex gap-1 border-b border-line">
          {TABS.map((tab) => (
            <Link
              key={tab.view}
              href={`/event/${event.id}/${tab.segment}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                view === tab.view
                  ? 'border-wb text-fg'
                  : 'border-transparent text-muted hover:text-fg'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {view === 'bracket' ? (
        <BracketView
          derived={derived}
          bracketSize={event.bracketSize}
          selectedMatchId={selectedMatchId}
          onSelectMatch={setSelectedMatchId}
        />
      ) : null}
      {view === 'schedule' ? (
        <ScheduleView derived={derived} onSelectMatch={setSelectedMatchId} />
      ) : null}
      {view === 'teams' ? <TeamsView event={event} derived={derived} /> : null}

      {selected ? (
        <MatchDetailDialog
          match={selected}
          derived={derived}
          eventId={event.id}
          onClose={() => setSelectedMatchId(null)}
          onSaved={(change) =>
            setPending((current) => [...current.filter((p) => p.matchId !== change.matchId), change])
          }
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6：跑一次全量测试确认无回归**

Run: `npm test`
Expected: 全部测试文件 PASS

- [ ] **Step 7：人工验收（Phase 3 验收点）**

Run: `npm run dev`

1. 访问 `http://localhost:3000/admin/` → 看到登录表单与 Token 权限说明
2. 不填任何内容时"登录"按钮为禁用态；随便填一个用户名与假 Token → 提示 `Token 无效、已过期或被撤销`
3. 登录成功后显示"已登录：<用户名>（管理员）"与"退出登录"
4. 回到 `http://localhost:3000/event/spring-2026/`，点击 `WB-R2-M1` 卡片 → 弹窗底部出现录分表单
5. 输入 `3:0` → 提示 `BO3 下需有一方赢下 2 局才算结束`，不提交
6. 输入 `2:1` 并提交 → 若 Token 权限正确则提示"已提交，约 1–2 分钟后全网生效"；页面顶部出现"N 处改动等待生效"；对阵图与队伍页立刻按新比分重算
7. 点击"清除比分" → 下游重新回到"待赛"
8. 点击"标记「进行中」" → 状态变为"进行中"
9. 点击"退出登录" → 录分表单消失，页面回到只读

确认后 Ctrl+C 停止。

- [ ] **Step 8：Commit**

```bash
git add components/MatchDetailDialog.tsx components/MatchDetailDialog.test.tsx components/EventClient.tsx
git commit -m "feat(admin): 管理员在比赛详情中录入比分并乐观更新"
```

---

## Phase 4：后台 CRUD 与自动部署

**为什么赛事 CRUD 要放在最后：** 创建赛事需要 `buildNewEvent()` 生成完整的 `matches` 数组，而这件事只有在 Phase 1 的 `generateTemplate()` 完成后才可能做对；删除、改队伍、发公告都只是对已有 JSON 的局部改写，依赖 Phase 3 的 `create` / `remove` 写入口。

**Phase 4 的统一约束：**

1. **后台任何一次写入都必须走 `useAuth()` 暴露的 `mutate` / `create` / `remove`。** 组件里不出现 token、不出现 `fetch('https://api.github.com/...')`。
2. **纯逻辑抽到 `lib/admin/` 下的纯函数里**，组件只负责收集输入与展示结果。理由与 Phase 1 相同：写坏数据是后台最严重的故障，而纯函数是唯一能被穷举测试的东西。
3. **所有破坏性操作都要二次确认**（删除赛事必须手工输入赛事 ID）。
4. **写入成功后一律提示"约 1–2 分钟后全网生效"**，因为 GitHub Actions 重建不是瞬时的。当前页面的列表来自构建期，新建/删除的赛事要到重建完成后才出现在列表里——这一点必须写进界面，否则管理员会以为操作失败了。

---

### Task 19：创建赛事与删除赛事

**Files:**
- Create: `lib/admin/newEvent.ts`
- Create: `components/admin/CreateEventForm.tsx`
- Create: `components/admin/EventList.tsx`
- Modify: `components/admin/AdminPage.tsx`（完整替换 Step 6 的版本）
- Test: `lib/admin/newEvent.test.ts`
- Test: `components/admin/admin.test.tsx`

- [ ] **Step 1：写失败的测试 `lib/admin/newEvent.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { generateTemplate } from '@/lib/bracket/generate'
import { parseEvent } from '@/lib/data/schema'
import {
  buildNewEvent,
  eventFilePath,
  resizeTeamNames,
  validateNewEvent,
  type NewEventInput,
} from './newEvent'

const NOW = '2026-09-25T10:00:00+08:00'

function input(overrides: Partial<NewEventInput> = {}): NewEventInput {
  return {
    id: 'autumn-2026',
    name: '2026 秋季赛',
    bracketSize: 4,
    defaultBO: 3,
    grandFinalBO: 5,
    teamNames: ['甲队', '乙队', '丙队', '丁队'],
    now: NOW,
    ...overrides,
  }
}

/** 从模板里取出某场比赛两个槽位的种子号，非种子来源记 -1 */
function seedPair(id: string, size: number): number[] {
  const tpl = generateTemplate(size).matches.find((x) => x.id === id)
  if (!tpl) throw new Error(`${id} 不在模板中`)
  return [tpl.sourceA, tpl.sourceB].map((s) => (s.kind === 'seed' ? s.seed : -1))
}

describe('validateNewEvent', () => {
  it('合法输入返回 null', () => {
    expect(validateNewEvent(input())).toBeNull()
  })

  it('赛事 ID 只允许小写字母、数字与连字符', () => {
    expect(validateNewEvent(input({ id: 'Autumn 2026' }))).toContain('赛事 ID')
    expect(validateNewEvent(input({ id: '-abc' }))).toContain('赛事 ID')
    expect(validateNewEvent(input({ id: 'autumn_2026' }))).toContain('赛事 ID')
  })

  it('赛事名称不能为空', () => {
    expect(validateNewEvent(input({ name: '   ' }))).toContain('赛事名称')
  })

  it('BO 只能是 1 / 3 / 5 / 7', () => {
    expect(validateNewEvent(input({ defaultBO: 2 }))).toContain('默认 BO')
    expect(validateNewEvent(input({ grandFinalBO: 9 }))).toContain('总决赛 BO')
  })

  it('队伍数量必须等于签表规模', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '乙队'] }))).toContain('4 个队伍名称')
  })

  it('队伍名称不能为空或重复', () => {
    expect(validateNewEvent(input({ teamNames: ['甲队', '', '丙队', '丁队'] }))).toContain(
      '队伍名称不能为空',
    )
    expect(validateNewEvent(input({ teamNames: ['甲队', '甲队', '丙队', '丁队'] }))).toContain(
      '队伍名称不能重复',
    )
  })
})

describe('buildNewEvent', () => {
  it('生成的赛事能通过 parseEvent 校验（写出去的文件一定读得回来）', () => {
    const event = buildNewEvent(input())
    expect(() => parseEvent(event)).not.toThrow()
  })

  it('8 队签表生成 14 场比赛（2n-2）', () => {
    const event = buildNewEvent(
      input({ bracketSize: 8, teamNames: Array.from({ length: 8 }, (_, i) => `队${i + 1}`) }),
    )
    expect(event.matches).toHaveLength(14)
    expect(event.matches.filter((m) => m.bracket === 'WB')).toHaveLength(7)
    expect(event.matches.filter((m) => m.bracket === 'LB')).toHaveLength(6)
    expect(event.matches.filter((m) => m.bracket === 'GF')).toHaveLength(1)
  })

  it('全部比赛初始为未开赛：无比分、非进行中、无时间', () => {
    const event = buildNewEvent(input())
    expect(event.matches.every((m) => m.scoreA === null && m.scoreB === null)).toBe(true)
    expect(event.matches.every((m) => m.live === false)).toBe(true)
    expect(event.matches.every((m) => m.scheduledAt === null)).toBe(true)
  })

  it('总决赛使用 grandFinalBO，其余场次使用 defaultBO', () => {
    const event = buildNewEvent(input({ defaultBO: 1, grandFinalBO: 5 }))
    expect(event.matches.find((m) => m.id === 'GF')?.bo).toBe(5)
    expect(event.matches.filter((m) => m.bracket !== 'GF').every((m) => m.bo === 1)).toBe(true)
  })

  it('队伍种子按输入顺序为 1..n，队伍 id 为 t1..tn', () => {
    const event = buildNewEvent(input())
    expect(event.teams.map((t) => t.seed)).toEqual([1, 2, 3, 4])
    expect(event.teams.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])
    expect(event.teams[0].name).toBe('甲队')
  })

  it('赛事初始状态为 draft，无公告', () => {
    const event = buildNewEvent(input())
    expect(event.status).toBe('draft')
    expect(event.announcements).toEqual([])
    expect(event.updatedAt).toBe(NOW)
  })

  it('首轮对阵来自 1 号与末号种子的固定对位（种子之和为 n+1）', () => {
    buildNewEvent(
      input({ bracketSize: 8, teamNames: Array.from({ length: 8 }, (_, i) => `队${i + 1}`) }),
    )
    expect(seedPair('WB-R1-M1', 8)).toEqual([1, 8])
    expect(seedPair('WB-R1-M2', 8)).toEqual([4, 5])
  })
})

describe('resizeTeamNames', () => {
  it('扩容时保留已填名称并补默认名', () => {
    expect(resizeTeamNames(['甲队', '乙队'], 4)).toEqual(['甲队', '乙队', '队伍 3', '队伍 4'])
  })

  it('缩容时截断多余名称', () => {
    expect(resizeTeamNames(['甲队', '乙队', '丙队', '丁队'], 2)).toEqual(['甲队', '乙队'])
  })
})

describe('eventFilePath', () => {
  it('指向 public/data/events 下的赛事文件', () => {
    expect(eventFilePath('autumn-2026')).toBe('public/data/events/autumn-2026.json')
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/admin/newEvent.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./newEvent"`

- [ ] **Step 3：实现 `lib/admin/newEvent.ts`**

`teams[].seed` 采用**输入顺序即种子顺序**的约定：第一行填的队伍就是 1 号种子。`deriveBracket` 通过 `team.seed` 把队伍放进首轮槽位，因此这里不需要、也不应该自己重排队伍。

```ts
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
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/admin/newEvent.test.ts`
Expected: PASS，16 个用例全绿

- [ ] **Step 5：实现 `components/admin/CreateEventForm.tsx`**

表单在提交前做两道自检：`validateNewEvent()` 检查人填的内容，`parseEvent()` 检查生成的数据。后者是防"写出去的文件读不回来"的最后一道闸门——它不通过就绝不提交。

```tsx
'use client'

import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { parseEvent } from '@/lib/data/schema'
import {
  buildNewEvent,
  eventFilePath,
  resizeTeamNames,
  validateNewEvent,
  type NewEventInput,
} from '@/lib/admin/newEvent'

const SIZES: NewEventInput['bracketSize'][] = [4, 8, 16, 32]
const BOS = [1, 3, 5, 7]

export type CreateEventFormProps = {
  /** 写入成功后的回调，用于在父组件记录"待生效"提示 */
  onCreated?: (eventId: string, eventName: string) => void
}

export function CreateEventForm({ onCreated }: CreateEventFormProps) {
  const { create } = useAuth()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [bracketSize, setBracketSize] = useState<NewEventInput['bracketSize']>(8)
  const [defaultBO, setDefaultBO] = useState(3)
  const [grandFinalBO, setGrandFinalBO] = useState(5)
  const [teamNames, setTeamNames] = useState<string[]>(() => resizeTeamNames([], 8))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function changeSize(next: NewEventInput['bracketSize']) {
    setBracketSize(next)
    setTeamNames((current) => resizeTeamNames(current, next))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const input: NewEventInput = {
      id: id.trim(),
      name: name.trim(),
      bracketSize,
      defaultBO,
      grandFinalBO,
      teamNames,
      now: new Date().toISOString(),
    }

    const invalid = validateNewEvent(input)
    if (invalid) {
      setNotice(null)
      setError(invalid)
      return
    }

    let content: unknown
    try {
      content = buildNewEvent(input)
      // 自检：生成的 JSON 必须能被读回，否则宁可不提交
      parseEvent(content)
    } catch (err) {
      setNotice(null)
      setError(`生成的数据不合法，已中止提交：${err instanceof Error ? err.message : '未知错误'}`)
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    const outcome = await create({
      path: eventFilePath(input.id),
      content,
      message: `chore(data): 创建赛事 ${input.name}（${input.id}）`,
    })
    setBusy(false)

    if (!outcome.ok) {
      setError(outcome.message)
      return
    }
    setNotice(`已提交「${input.name}」。约 1–2 分钟后 Actions 重建完成，赛事会出现在下方列表中。`)
    onCreated?.(input.id, input.name)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded border border-line bg-panel p-3">
      <h2 className="text-sm font-medium">创建赛事</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs">
          <span className="text-muted">赛事 ID（小写字母、数字、连字符）</span>
          <input
            name="event-id"
            value={id}
            placeholder="autumn-2026"
            onChange={(e) => setId(e.target.value)}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted">赛事名称</span>
          <input
            name="event-name"
            value={name}
            placeholder="2026 秋季赛"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          />
        </label>

        <label className="block space-y-1 text-xs">
          <span className="text-muted">签表规模</span>
          <select
            name="bracket-size"
            value={bracketSize}
            onChange={(e) => changeSize(Number(e.target.value) as NewEventInput['bracketSize'])}
            className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>{`${s} 队`}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs">
            <span className="text-muted">默认 BO</span>
            <select
              name="default-bo"
              value={defaultBO}
              onChange={(e) => setDefaultBO(Number(e.target.value))}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            >
              {BOS.map((b) => (
                <option key={b} value={b}>{`BO${b}`}</option>
              ))}
            </select>
          </label>

          <label className="block space-y-1 text-xs">
            <span className="text-muted">总决赛 BO</span>
            <select
              name="grand-final-bo"
              value={grandFinalBO}
              onChange={(e) => setGrandFinalBO(Number(e.target.value))}
              className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
            >
              {BOS.map((b) => (
                <option key={b} value={b}>{`BO${b}`}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs text-muted">
          {`队伍名单（顺序即种子顺序，1 号种子在最上；共 ${bracketSize} 支）`}
        </legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {teamNames.map((teamName, i) => (
            <label key={i} className="block space-y-1 text-[11px]">
              <span className="text-muted">{`#${i + 1}`}</span>
              <input
                name={`team-${i + 1}`}
                value={teamName}
                onChange={(e) =>
                  setTeamNames((current) =>
                    current.map((v, idx) => (idx === i ? e.target.value : v)),
                  )
                }
                className="w-full rounded border border-line bg-base px-2 py-1.5 text-sm outline-none focus:border-wb"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-wb">{notice}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="rounded border border-wb px-3 py-1.5 text-sm text-wb hover:bg-wb/10 disabled:opacity-40"
      >
        {busy ? '提交中...' : '创建赛事'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6：实现 `components/admin/EventList.tsx`**

删除是不可逆的远端操作（文件从仓库消失），因此按钮第一次点击只展开确认区，必须在确认框里**手工输入赛事 ID** 才能执行。

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { eventFilePath } from '@/lib/admin/newEvent'
import type { EventSummary } from '@/lib/data/schema'

export type EventListProps = {
  events: EventSummary[]
  selectedId: string | null
  onSelect: (eventId: string) => void
  onDeleted?: (eventId: string) => void
}

const STATUS_LABEL: Record<EventSummary['status'], string> = {
  draft: '筹备中',
  ongoing: '进行中',
  finished: '已结束',
}

export function EventList({ events, selectedId, onSelect, onDeleted }: EventListProps) {
  const { remove } = useAuth()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function onDelete(event: EventSummary) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    const outcome = await remove({
      path: eventFilePath(event.id),
      message: `chore(data): 删除赛事 ${event.name}（${event.id}）`,
    })
    setBusy(false)
    if (!outcome.ok) {
      setMessage(outcome.message)
      return
    }
    setConfirming(null)
    setTyped('')
    setMessage(`已删除「${event.name}」。约 1–2 分钟后 Actions 重建完成，列表中的条目才会消失。`)
    onDeleted?.(event.id)
  }

  if (events.length === 0) {
    return <p className="text-xs text-muted">还没有任何赛事数据文件。</p>
  }

  return (
    <div className="space-y-2">
      {message ? <p className="text-xs text-wb">{message}</p> : null}
      <ul className="divide-y divide-line rounded border border-line bg-panel text-sm">
        {events.map((event) => (
          <li key={event.id} className="space-y-2 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/event/${event.id}/`} className="hover:text-wb">
                  {event.name}
                </Link>
                <span className="text-[11px] text-muted">{`${STATUS_LABEL[event.status]} · ${event.bracketSize} 队`}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">{`${event.finishedMatches} / ${event.totalMatches} 场`}</span>
                <button
                  type="button"
                  onClick={() => {
                    setMessage(null)
                    setConfirming(confirming === event.id ? null : event.id)
                    setTyped('')
                  }}
                  className="rounded border border-line px-2 py-1 text-muted hover:text-fg"
                >
                  {confirming === event.id ? '取消删除' : '删除'}
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(event.id)}
                  className={`rounded border px-2 py-1 ${
                    selectedId === event.id
                      ? 'border-wb text-wb'
                      : 'border-line text-muted hover:text-fg'
                  }`}
                >
                  {selectedId === event.id ? '正在编辑' : '编辑队伍与公告'}
                </button>
              </div>
            </div>

            {confirming === event.id ? (
              <div className="space-y-2 rounded border border-danger/40 bg-panel-hi p-2">
                <p className="text-[11px] text-danger">
                  {`删除会从仓库中移除 ${eventFilePath(event.id)}，且无法撤销。请输入赛事 ID「${event.id}」以确认：`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="confirm-event-id"
                    value={typed}
                    placeholder={event.id}
                    onChange={(e) => setTyped(e.target.value)}
                    className="w-48 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-danger"
                  />
                  <button
                    type="button"
                    disabled={busy || typed !== event.id}
                    onClick={() => onDelete(event)}
                    className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
                  >
                    {busy ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 7：替换 `components/admin/AdminPage.tsx`**

`AdminPage` 只做三件事：管理登录态展示、把赛事列表与编辑面板串起来、记录并展示"本次会话中提交过、但尚未在构建产物中生效"的操作。

```tsx
'use client'

import { useState } from 'react'
import { AdminGate } from '@/components/auth/AdminGate'
import { LoginForm } from '@/components/auth/LoginForm'
import { useAuth } from '@/components/auth/AuthProvider'
import { CreateEventForm } from './CreateEventForm'
import { EventEditPanel } from './EventEditPanel'
import { EventList } from './EventList'
import type { EventSummary } from '@/lib/data/schema'

export function AdminPage({ events }: { events: EventSummary[] }) {
  const { ready, isAdmin, login, role, signOut } = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pending, setPending] = useState<string[]>([])

  function addPending(text: string) {
    setPending((current) => (current.includes(text) ? current : [...current, text]))
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">后台管理</h1>
        <p className="text-xs text-muted">
          观众无需登录即可查看全部赛程；只有 config.json 名单内的人可以修改数据。
        </p>
      </header>

      {!ready ? (
        <p className="rounded border border-line bg-panel px-3 py-2 text-sm text-muted">
          正在检查登录状态...
        </p>
      ) : isAdmin ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line bg-panel px-3 py-2 text-sm">
          <span>{`已登录：${login}（${role === 'admin' ? '管理员' : '裁判'}）`}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
          >
            退出登录
          </button>
        </div>
      ) : (
        <LoginForm />
      )}

      {pending.length > 0 ? (
        <div className="space-y-1 rounded border border-wb/40 bg-panel px-3 py-2 text-xs">
          <p className="text-wb">{`${pending.length} 项改动已提交，等待 Actions 重建（约 1–2 分钟）`}</p>
          <ul className="list-inside list-disc text-muted">
            {pending.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AdminGate
        fallback={<p className="text-xs text-muted">登录后可创建赛事、维护队伍与发布公告。</p>}
      >
        <section className="space-y-2">
          <h2 className="text-sm font-medium">赛事列表</h2>
          <p className="text-[11px] text-muted">
            列表来自构建产物，新建或删除的赛事要到本次重建完成后才会在这里变化。
          </p>
          <EventList
            events={events}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
            onDeleted={() => setSelectedId(null)}
          />
        </section>

        {selectedId ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">{`编辑：${selectedId}`}</h2>
            <EventEditPanel eventId={selectedId} onSaved={addPending} />
          </section>
        ) : null}

        <CreateEventForm onCreated={(id, name) => addPending(`创建赛事「${name}」（${id}）`)} />
      </AdminGate>
    </div>
  )
}
```

> `EventEditPanel` 在 Task 20 实现。为了让 Task 19 的测试能单独跑通，先建一个占位版本，Task 20 再替换为完整实现：

```tsx
'use client'

export type EventEditPanelProps = {
  eventId: string
  onSaved?: (text: string) => void
}

export function EventEditPanel({ eventId }: EventEditPanelProps) {
  return <p className="text-xs text-muted">{`正在加载 ${eventId} ...`}</p>
}
```

- [ ] **Step 8：写 `components/admin/admin.test.tsx`**

静态渲染只能验证首屏标记，**交互行为（点删除按钮、提交表单）在第 10 步的人工验收里确认**。这里验证的是最容易写错、也最难在人工检查中发现的几点：默认队伍输入框数量、按钮文案、`AdminGate` 是否真的挡住了未登录用户。

```tsx
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '@/components/auth/AuthProvider'
import type { AppConfig, EventSummary } from '@/lib/data/schema'
import { AdminPage } from './AdminPage'
import { CreateEventForm } from './CreateEventForm'
import { EventList } from './EventList'

const CONFIG: AppConfig = {
  repo: { owner: 'octo', repo: 'match-schedule', branch: 'main' },
  admins: [{ login: 'admin-user', role: 'admin' }],
  requiredTokenScopes: { contents: 'write', path: 'public/data/' },
}

const ADMIN_SESSION = {
  login: 'admin-user',
  token: 'github_pat_x',
  role: 'admin' as const,
  savedAt: 0,
}

const EVENTS: EventSummary[] = [
  {
    id: 'spring-2026',
    name: '2026 春季赛',
    bracketSize: 8,
    status: 'ongoing',
    finishedMatches: 2,
    totalMatches: 14,
    updatedAt: '2026-09-25T10:00:00+08:00',
  },
]

function render(node: ReactNode, session: typeof ADMIN_SESSION | null = ADMIN_SESSION) {
  return renderToStaticMarkup(
    <AuthProvider config={CONFIG} initialSession={session}>
      {node}
    </AuthProvider>,
  )
}

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0
}

describe('CreateEventForm', () => {
  it('默认 8 队规模，渲染 8 个队伍名称输入框', () => {
    const html = render(<CreateEventForm />)
    expect(html).toContain('创建赛事')
    expect(html).toContain('赛事 ID')
    expect(html).toContain('签表规模')
    expect(html).toContain('总决赛 BO')
    expect(html).toContain('顺序即种子顺序')
    expect(countMatches(html, /name="team-\d+"/g)).toBe(8)
  })

  it('默认 BO3、总决赛 BO5', () => {
    const html = render(<CreateEventForm />)
    expect(html).toContain('value="3" selected')
    expect(html).toContain('value="5" selected')
  })

  it('未登录时表单仍在（写入会被 Provider 拒绝），但不会渲染 token 输入框', () => {
    const html = render(<CreateEventForm />, null)
    expect(html).not.toContain('type="password"')
  })
})

describe('EventList', () => {
  it('渲染赛事名称、状态、场次进度与操作按钮', () => {
    const html = render(
      <EventList events={EVENTS} selectedId={null} onSelect={() => {}} />,
    )
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('进行中')
    expect(html).toContain('8 队')
    expect(html).toContain('2 / 14 场')
    expect(html).toContain('删除')
    expect(html).toContain('编辑队伍与公告')
  })

  it('未展开确认时不出现二次确认输入框', () => {
    const html = render(
      <EventList events={EVENTS} selectedId={null} onSelect={() => {}} />,
    )
    expect(html).not.toContain('name="confirm-event-id"')
  })

  it('没有赛事时给出提示', () => {
    const html = render(<EventList events={[]} selectedId={null} onSelect={() => {}} />)
    expect(html).toContain('还没有任何赛事数据文件')
  })
})

describe('AdminPage', () => {
  it('未登录时只有登录表单与提示，没有创建入口', () => {
    const html = render(<AdminPage events={EVENTS} />, null)
    expect(html).toContain('管理员登录')
    expect(html).not.toContain('name="event-id"')
    expect(html).not.toContain('name="confirm-event-id"')
    expect(html).not.toContain('退出登录')
  })

  it('登录后显示身份、退出登录、赛事列表与创建表单', () => {
    const html = render(<AdminPage events={EVENTS} />)
    expect(html).toContain('admin-user')
    expect(html).toContain('退出登录')
    expect(html).toContain('2026 春季赛')
    expect(html).toContain('创建赛事')
  })
})
```

- [ ] **Step 9：运行测试并做类型检查**

Run: `npx vitest run lib/admin/newEvent.test.ts components/admin/admin.test.tsx`
Expected: PASS（16 + 8 = 24 个用例）

Run: `npm run typecheck`
Expected: 无输出（无类型错误）

- [ ] **Step 10：人工验收**

Run: `npm run dev`，登录后访问 `http://localhost:3000/admin/`

1. 把"签表规模"切到 16 → 队伍输入框立刻变成 16 个；切回 4 → 只剩 4 个，已填名称保留
2. 赛事 ID 填 `Autumn 2026` → 点"创建赛事" → 提示"赛事 ID 只能用小写字母…"，不发请求
3. 赛事 ID 填 `autumn-2026`、名称留空 → 提示"赛事名称不能为空"
4. 队伍名称重复 → 提示"队伍名称不能重复"
5. 填一份合法数据提交 → 提示"已提交「…」。约 1–2 分钟后…"；页面顶部出现"1 项改动已提交"
6. 在 GitHub 仓库中确认 `public/data/events/autumn-2026.json` 已生成，且 `matches` 有 14 条（8 队）
7. 等 Actions 重建完成后刷新 `/admin/` → 新赛事出现在列表中；访问 `/event/autumn-2026/` 能看到完整对阵图且全部为"待赛"
8. 点某赛事的"删除" → 展开确认区；不输入 ID 时"确认删除"为禁用；输入错误 ID 仍禁用；输入正确 ID 后可点
9. 删除后确认仓库中文件消失、提示文案出现

- [ ] **Step 11：Commit**

```bash
git add lib/admin/newEvent.ts lib/admin/newEvent.test.ts components/admin/CreateEventForm.tsx components/admin/EventList.tsx components/admin/AdminPage.tsx components/admin/EventEditPanel.tsx components/admin/admin.test.tsx
git commit -m "feat(admin): 创建与删除赛事"
```

---

### Task 20：队伍与公告管理

**Files:**
- Create: `lib/admin/editEvent.ts`
- Create: `components/admin/EventEditPanel.tsx`（替换 Task 19 Step 7 的占位版本）
- Modify: `components/admin/admin.test.tsx`（追加用例）
- Test: `lib/admin/editEvent.test.ts`

- [ ] **Step 1：写失败的测试 `lib/admin/editEvent.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { buildNewEvent } from '@/lib/admin/newEvent'
import type { TournamentEvent } from '@/lib/data/schema'
import { applyEventEdit, parsePlayers, validateEventEdit } from './editEvent'

const NOW = '2026-09-25T10:00:00+08:00'

function makeEvent(): TournamentEvent {
  return {
    ...buildNewEvent({
      id: 'spring-2026',
      name: '2026 春季赛',
      bracketSize: 4,
      defaultBO: 3,
      grandFinalBO: 5,
      teamNames: ['赤霄', '沧溟', '流火', '玄鸟'],
      now: '2026-09-01T00:00:00+08:00',
    }),
    status: 'ongoing',
    announcements: [{ id: 'a1', content: '报名截止', createdAt: '2026-08-31T10:00:00+08:00' }],
  }
}

describe('parsePlayers', () => {
  it('中英文逗号都能分隔，忽略空白项', () => {
    expect(parsePlayers(' 甲 , 乙，丙 ')).toEqual(['甲', '乙', '丙'])
  })

  it('空字符串得到空数组', () => {
    expect(parsePlayers('   ')).toEqual([])
    expect(parsePlayers(',,，')).toEqual([])
  })
})

describe('validateEventEdit', () => {
  it('合法改动返回 null', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't1', name: '赤霄', players: ['甲'] }),
    ).toBeNull()
    expect(validateEventEdit(event, { kind: 'add-announcement', content: '决赛改期' })).toBeNull()
    expect(validateEventEdit(event, { kind: 'remove-announcement', announcementId: 'a1' })).toBeNull()
  })

  it('队伍名称不能为空', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't1', name: '  ', players: [] }),
    ).toContain('队伍名称')
  })

  it('目标队伍必须存在', () => {
    const event = makeEvent()
    expect(
      validateEventEdit(event, { kind: 'update-team', teamId: 't9', name: '新队', players: [] }),
    ).toContain('不存在')
  })

  it('公告内容不能为空', () => {
    expect(
      validateEventEdit(makeEvent(), { kind: 'add-announcement', content: '   ' }),
    ).toContain('公告内容')
  })

  it('删除的公告必须存在', () => {
    expect(
      validateEventEdit(makeEvent(), { kind: 'remove-announcement', announcementId: 'a9' }),
    ).toContain('不存在')
  })
})

describe('applyEventEdit', () => {
  it('改队伍名称不影响其他字段与其它队伍', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'update-team', teamId: 't2', name: '沧溟二队', players: [] },
      NOW,
    )
    expect(next.teams[1].name).toBe('沧溟二队')
    expect(next.teams[1].seed).toBe(2)
    expect(next.teams[0].name).toBe('赤霄')
    expect(next.updatedAt).toBe(NOW)
  })

  it('选手名单被解析为对象数组', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'update-team', teamId: 't1', name: '赤霄', players: ['甲', '乙'] },
      NOW,
    )
    expect(next.teams[0].players).toEqual([{ name: '甲' }, { name: '乙' }])
  })

  it('改动不污染原对象（纯函数）', () => {
    const event = makeEvent()
    applyEventEdit(event, { kind: 'update-team', teamId: 't1', name: '改过的名字', players: [] }, NOW)
    expect(event.teams[0].name).toBe('赤霄')
  })

  it('新公告排在最前，id 以时间戳为基准且不与已有公告冲突', () => {
    const first = applyEventEdit(makeEvent(), { kind: 'add-announcement', content: '第一条' }, NOW)
    expect(first.announcements[0].content).toBe('第一条')
    expect(first.announcements[0].createdAt).toBe(NOW)

    const second = applyEventEdit(first, { kind: 'add-announcement', content: '第二条' }, NOW)
    const ids = second.announcements.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(second.announcements).toHaveLength(3)
  })

  it('删除公告后其余公告顺序不变', () => {
    const next = applyEventEdit(
      makeEvent(),
      { kind: 'remove-announcement', announcementId: 'a1' },
      NOW,
    )
    expect(next.announcements).toHaveLength(0)
    expect(next.updatedAt).toBe(NOW)
  })

  it('目标不存在时抛错，避免静默写入一次空改动', () => {
    expect(() =>
      applyEventEdit(makeEvent(), { kind: 'update-team', teamId: 't9', name: '新队', players: [] }, NOW),
    ).toThrow(/不存在/)
    expect(() =>
      applyEventEdit(makeEvent(), { kind: 'remove-announcement', announcementId: 'a9' }, NOW),
    ).toThrow(/不存在/)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `npx vitest run lib/admin/editEvent.test.ts`
Expected: FAIL，报错 `Failed to resolve import "./editEvent"`

- [ ] **Step 3：实现 `lib/admin/editEvent.ts`**

```ts
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
```

- [ ] **Step 4：运行测试确认通过**

Run: `npx vitest run lib/admin/editEvent.test.ts`
Expected: PASS，13 个用例全绿

- [ ] **Step 5：替换 `components/admin/EventEditPanel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { eventFilePath } from '@/lib/admin/newEvent'
import { applyEventEdit, parsePlayers, validateEventEdit, type EventEdit } from '@/lib/admin/editEvent'
import { parseEvent, type TournamentEvent } from '@/lib/data/schema'
import { pollUrl } from '@/lib/urls'

export type EventEditPanelProps = {
  eventId: string
  /** 测试注入：不传则挂载后从 /data/events/<id>.json 加载 */
  initialEvent?: TournamentEvent
  onSaved?: (text: string) => void
}

export function EventEditPanel({ eventId, initialEvent, onSaved }: EventEditPanelProps) {
  const { mutate } = useAuth()
  const [event, setEvent] = useState<TournamentEvent | null>(initialEvent ?? null)
  const [loading, setLoading] = useState(initialEvent === undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { name: string; players: string }>>({})
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (initialEvent !== undefined) return
    let cancelled = false
    setLoading(true)
    fetch(pollUrl(`/events/${eventId}.json`))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((raw) => {
        if (cancelled) return
        setEvent(parseEvent(raw))
        setLoadError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(`赛事数据加载失败：${err instanceof Error ? err.message : '未知错误'}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, initialEvent])

  /**
   * 本地副本的同步发生在写入成功之后，因此它是"服务端已接受"的快照，而不是乐观猜测。
   * 返回 true 表示已提交成功，调用方据此决定是否清空输入框。
   */
  async function save(edit: EventEdit, text: string): Promise<boolean> {
    if (!event || busy) return false
    const invalid = validateEventEdit(event, edit)
    if (invalid) {
      setNotice(null)
      setError(invalid)
      return false
    }

    setBusy(true)
    setError(null)
    setNotice(null)
    const outcome = await mutate<TournamentEvent>({
      path: eventFilePath(eventId),
      parse: parseEvent,
      mutate: (current) => applyEventEdit(current, edit, new Date().toISOString()),
      message: `chore(data): ${event.name} ${text}`,
    })
    setBusy(false)

    if (!outcome.ok) {
      setError(outcome.message)
      return false
    }
    setEvent((current) => (current ? applyEventEdit(current, edit, new Date().toISOString()) : current))
    setNotice(`已提交：${text}。约 1–2 分钟后 Actions 重建完成，观众端才会看到。`)
    onSaved?.(`${event.name}：${text}`)
    return true
  }

  if (loading) {
    return <p className="text-xs text-muted">{`正在加载 ${eventId} 的赛事数据...`}</p>
  }
  if (loadError) {
    return <p className="text-xs text-danger">{loadError}</p>
  }
  if (!event) {
    return <p className="text-xs text-muted">没有可编辑的数据。</p>
  }

  return (
    <div className="space-y-4 rounded border border-line bg-panel p-3">
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {notice ? <p className="text-xs text-wb">{notice}</p> : null}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{`队伍（${event.teams.length} 支）`}</h3>
        <p className="text-[11px] text-muted">
          只改名称与选手名单；种子顺序与签表结构在创建赛事时确定，改动种子需新建赛事。
        </p>
        <ul className="space-y-2">
          {event.teams.map((team) => {
            const draft = drafts[team.id] ?? {
              name: team.name,
              players: team.players.map((p) => p.name).join('、'),
            }
            return (
              <li key={team.id} className="flex flex-wrap items-end gap-2">
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted">{`#${team.seed} 名称`}</span>
                  <input
                    name={`name-${team.id}`}
                    value={draft.name}
                    onChange={(e) =>
                      setDrafts((current) => ({ ...current, [team.id]: { ...draft, name: e.target.value } }))
                    }
                    className="w-40 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
                  />
                </label>
                <label className="block space-y-1 text-[11px]">
                  <span className="text-muted">选手（顿号或逗号分隔）</span>
                  <input
                    name={`players-${team.id}`}
                    value={draft.players}
                    onChange={(e) =>
                      setDrafts((current) => ({
                        ...current,
                        [team.id]: { ...draft, players: e.target.value },
                      }))
                    }
                    className="w-64 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    save(
                      {
                        kind: 'update-team',
                        teamId: team.id,
                        name: draft.name,
                        players: parsePlayers(draft.players),
                      },
                      `更新队伍「${draft.name.trim() || team.name}」`,
                    )
                  }
                  className="rounded border border-wb px-2 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
                >
                  保存
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">{`公告（${event.announcements.length} 条）`}</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block space-y-1 text-[11px]">
            <span className="text-muted">新公告</span>
            <input
              name="new-announcement"
              value={announcement}
              placeholder="例如：决赛改为 10 月 5 日 20:00"
              onChange={(e) => setAnnouncement(e.target.value)}
              className="w-80 rounded border border-line bg-base px-2 py-1 text-sm outline-none focus:border-wb"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const content = announcement.trim()
              const ok = await save({ kind: 'add-announcement', content }, `发布公告「${content}」`)
              if (ok) setAnnouncement('')
            }}
            className="rounded border border-wb px-2 py-1 text-xs text-wb hover:bg-wb/10 disabled:opacity-40"
          >
            发布公告
          </button>
        </div>
        {event.announcements.length === 0 ? (
          <p className="text-xs text-muted">暂无公告。</p>
        ) : (
          <ul className="divide-y divide-line rounded border border-line text-sm">
            {event.announcements.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>{a.content}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    save({ kind: 'remove-announcement', announcementId: a.id }, `删除公告「${a.content}」`)
                  }
                  className="rounded border border-line px-2 py-1 text-xs text-muted hover:text-danger disabled:opacity-40"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 6：给 `components/admin/admin.test.tsx` 追加 `EventEditPanel` 用例**

在文件顶部补充 import：

```tsx
import { buildNewEvent } from '@/lib/admin/newEvent'
import { EventEditPanel } from './EventEditPanel'
import type { TournamentEvent } from '@/lib/data/schema'
```

在文件末尾追加：

```tsx
/** 直接复用 buildNewEvent 造一份合法赛事，顺带验证它生成的数据能被渲染 */
const EVENT: TournamentEvent = {
  ...buildNewEvent({
    id: 'spring-2026',
    name: '2026 春季赛',
    bracketSize: 4,
    defaultBO: 3,
    grandFinalBO: 5,
    teamNames: ['赤霄', '沧溟', '流火', '玄鸟'],
    now: '2026-09-25T10:00:00+08:00',
  }),
  status: 'ongoing',
  announcements: [{ id: 'a1', content: '报名截止', createdAt: '2026-09-24T10:00:00+08:00' }],
}

describe('EventEditPanel', () => {
  it('注入数据后渲染队伍名称、选手输入框与公告列表', () => {
    const html = render(<EventEditPanel eventId="spring-2026" initialEvent={EVENT} />)
    expect(html).toContain('赤霄')
    expect(html).toContain('玄鸟')
    expect(html).toContain('name="players-t1"')
    expect(html).toContain('报名截止')
    expect(html).toContain('发布公告')
    expect(html).toContain('保存')
  })

  it('队伍名称已填入输入框，而不是留给用户重新输入', () => {
    const html = render(<EventEditPanel eventId="spring-2026" initialEvent={EVENT} />)
    expect(html).toContain('value="赤霄"')
  })

  it('未注入数据时先显示加载中', () => {
    const html = render(<EventEditPanel eventId="spring-2026" />)
    expect(html).toContain('正在加载 spring-2026')
  })
})
```

- [ ] **Step 7：运行测试并做类型检查**

Run: `npx vitest run lib/admin/editEvent.test.ts lib/admin/newEvent.test.ts components/admin/admin.test.tsx`
Expected: PASS（13 + 16 + 11 = 40 个用例）

Run: `npm run typecheck`
Expected: 无输出

- [ ] **Step 8：人工验收**

Run: `npm run dev`，登录后访问 `/admin/`，点某赛事的"编辑队伍与公告"

1. 面板加载出该赛事的队伍列表，名称输入框预填当前队名
2. 把 1 号队名改成"赤霄二队"、选手填"甲、乙" → 点"保存" → 提示"已提交…约 1–2 分钟后…"；面板内立即显示新队名
3. 刷新 `/event/spring-2026/teams/` → 队伍页显示新队名与选手（若未生效，说明 Actions 还在跑，等 1–2 分钟）
4. 把队名清空 → 点"保存" → 提示"队伍名称不能为空"，不发请求
5. 发一条公告 → 输入框清空、列表顶部出现新公告
6. 删掉该公告 → 列表恢复
7. 登录另一个不在白名单的 GitHub 账号（或把浏览器 localStorage 里的会话改为陌生人）→ 面板与保存按钮消失，页面回到只读

- [ ] **Step 9：Commit**

```bash
git add lib/admin/editEvent.ts lib/admin/editEvent.test.ts components/admin/EventEditPanel.tsx components/admin/admin.test.tsx
git commit -m "feat(admin): 队伍与公告管理"
```

---

### Task 21：自动部署与运维文档

**Files:**
- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

- [ ] **Step 1：写 `.github/workflows/deploy.yml`**

三个要点：`NEXT_PUBLIC_BASE_PATH` 必须等于仓库名（项目站点的路径前缀）；构建前先跑测试，坏数据不该部署上去；`out/.nojekyll` 必须有，否则 GitHub Pages 会吞掉 `_next/` 目录。

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Type check
        run: npm run typecheck

      - name: Build static site
        env:
          # 项目站点部署在 https://<user>.github.io/<repo>/，必须注入仓库名作为 basePath
          NEXT_PUBLIC_BASE_PATH: /${{ github.event.repository.name }}
        run: npm run build

      - name: Disable Jekyll
        run: touch out/.nojekyll

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2：写 `README.md`**

内容必须覆盖设计文档 §6.6 的安全边界说明——这是唯一能让后来者不误判"白名单等于安全"的地方。

````markdown
# 比赛赛程网站

双败淘汰制赛事赛程的展示与管理站点。观众直接访问即可查看对阵图、比分与晋级路径；管理员通过 GitHub 账号在本站页面上录入比分，改动自动提交到仓库并触发重建。部署在 GitHub Pages，无服务器、无数据库。

## 本地开发

```bash
npm ci
npm run dev          # http://localhost:3000
npm test             # 单元测试
npm run typecheck    # 类型检查
npm run build        # 静态导出到 out/
```

本地默认部署在根路径（`NEXT_PUBLIC_BASE_PATH` 为空）。要模拟项目站点的子路径部署：

```bash
# PowerShell
$env:NEXT_PUBLIC_BASE_PATH="/match-schedule"; npm run build
```

## 首次部署

1. **推送仓库到 GitHub**，分支名 `main`。
2. **确认 `package-lock.json` 已提交**（workflow 使用 `npm ci`）。
3. **开启 Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**。
4. **首次构建**：push 到 `main` 即自动触发；也可在 Actions 页手动 `Run workflow`。
5. 构建完成后访问 `https://<你的用户名>.github.io/<仓库名>/`。

若改用自定义域名或用户站点（部署在根路径），把 `.github/workflows/deploy.yml` 里的 `NEXT_PUBLIC_BASE_PATH` 改为空字符串即可，其余代码无需改动。

## 添加管理员

**不需要注册功能。** 管理员 = 在 `public/data/config.json` 的 `admins` 数组里加一行：

```jsonc
{
  "repo": { "owner": "你的用户名", "repo": "仓库名", "branch": "main" },
  "admins": [
    { "login": "your-github-name", "role": "admin" },
    { "login": "referee-a", "role": "referee" }
  ],
  "requiredTokenScopes": { "contents": "write", "path": "public/data/" }
}
```

提交后等 Actions 重建完成，该用户即可在 `/admin/` 登录。`role` 为 `admin`（全部权限）或 `referee`（录分）。

`repo` 三个字段必须与仓库真实位置一致，页面的写入功能靠它拼 GitHub API 地址。

## 创建管理员用的 Token

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
2. **Repository access**：Only select repositories → 只勾选本站仓库
3. **Permissions** → Repository permissions → **Contents: Read and write**（其余全部保持 No access）
4. **Expiration**：建议 90 天，到期后重新生成并在页面上重新登录

登录时把 Token 粘贴到 `/admin/` 的登录框即可。Token 只保存在**该浏览器的 localStorage** 中，不会提交到仓库，也不会发送给 GitHub 以外的任何服务器。

## 安全边界（务必读完）

- `config.json` 里的 `admins` 白名单是**前端校验，不构成安全边界**。它只能防止误操作，不能防止恶意行为：任何人都能看到这份名单，也能自己改一份前端代码绕过它。
- **真正的安全边界是 GitHub Token 自身的仓库写权限。** 站点没有服务端，写入由浏览器直接调用 GitHub API，所以每个管理员手里的 Token 就是他的权限范围。
- 因此请遵守两条硬规则：
  1. **永远不要给 Token 超过 `Contents: write` 的权限**，也不要勾选「All repositories」。
  2. **不要把 Token 写进任何文件、聊天记录或截图**。
- 站点的公开数据（赛程、比分、队名）本来就是要给所有人看的，不是敏感信息；真正需要保护的是仓库的写权限。

## 日常运维

| 想做什么 | 怎么做 |
|---|---|
| 录入 / 修改比分 | `/admin/` 登录 → 进入赛事 → 点对阵卡片 → 填比分 → 提交 |
| 标记比赛进行中 | 比赛详情弹窗 → 「标记「进行中」」 |
| 创建赛事 | `/admin/` → 填 ID、名称、规模、队伍名单 → 创建赛事 |
| 改队名 / 选手名单 | `/admin/` → 赛事列表点「编辑队伍与公告」 |
| 发布 / 删除公告 | 同上，公告区 |
| 删除赛事 | `/admin/` → 赛事列表点「删除」→ 输入赛事 ID 确认 |

**所有改动都不是即时生效的。** 提交后 GitHub Actions 需要重新构建（约 1–2 分钟），之后全网才会看到。管理员自己的页面会立即按新比分重算，并显示「N 项改动已提交，等待 Actions 重建」——这是预期的，不是故障。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| 页面显示「数据暂不可用」 | `public/data/events/<id>.json` 不存在或结构不合法。看 Actions 日志里的报错字段名，按提示修数据 |
| 登录提示「不在管理员名单中」 | 用户名没写进 `config.json`，或写入后 Actions 还没重建完成 |
| 登录提示「Token 无效、已过期或被撤销」 | Token 过期或被删除，重新生成一个 |
| 提交时提示权限不足 | Token 缺 `Contents: write`，按提示里的说明重新勾选权限 |
| 提交成功但页面没变化 | Actions 还在构建，等 1–2 分钟；仍无变化则去 Actions 页看构建是否失败 |
| 构建报「比赛数量与签表规模不符」 | 手工改过 `matches` 数组。删掉多余场次或重新创建赛事 |
| 子路径部署后样式 / 数据 404 | `NEXT_PUBLIC_BASE_PATH` 与仓库名不一致；检查 workflow 里注入的值 |
````

- [ ] **Step 3：提交**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "ci: GitHub Pages 自动部署与运维文档"
```

- [ ] **Step 4：端到端验收（需要真实 GitHub 仓库）**

1. push 到 `main` → Actions 页看到 `Deploy to GitHub Pages` 工作流运行
2. 工作流全绿后访问 `https://<用户名>.github.io/<仓库名>/` → 赛事列表正常显示，样式无 404（F12 → Network 无红色请求）
3. 进入赛事对阵图 → 连接线正确、可横向滚动、移动端可缩放
4. 用管理员账号登录 `/admin/` → 录一场比分 → 提交
5. 约 1–2 分钟后刷新页面 → 比分与下游对阵都已更新
6. 换一个浏览器（未登录）访问同一地址 → 同样看到新比分（验证写入确实落到了仓库）

---

## 附录：Self-Review 记录

计划写完后按 writing-plans 的要求做了三项自检。

**1. Spec 覆盖检查**

| 设计文档要求 | 对应任务 |
|---|---|
| §2 4/8/16/32 队签表 | Task 5（生成）、Task 19（创建时选择） |
| §2 经典双败对阵图（胜者组上 / 败者组下 / 总决赛右） | Task 8（布局）、Task 12（渲染） |
| §2 双败分区与晋级 / 掉落 / 淘汰路径标注 | Task 7（`sourceA` / `sourceB` / `isElimination`）、Task 11（卡片标注）、Task 12（连接线） |
| §2 比赛详情（队伍 / 选手 / 比分 / 时间 / BO / 裁判 / 直播 / 备注） | Task 2（字段）、Task 13（弹窗） |
| §2 比分录入与自动重算 | Task 7（纯函数推导）、Task 18（录入） |
| §2 队伍管理（信息 / 战绩 / 状态） | Task 7（`teamStates`）、Task 14（`TeamsView`）、Task 20（编辑） |
| §2 后台：创建赛事 / 生成签表 / 发布公告 | Task 19（创建）、Task 20（公告） |
| §2 时间顺序赛程列表 | Task 9（`groupMatchesByDay`）、Task 14（`ScheduleView`） |
| §2 响应式与横向滚动 / 缩放 | Task 12（`BracketView` 缩放与滚动） |
| §4.3 basePath 单一入口 | Task 4（`lib/urls.ts`）、Task 21（CI 注入） |
| §5.2 状态纯推导不存储 | Task 7（`deriveBracket`） |
| §5.3 读写双向校验、不白屏 | Task 2（`parseEvent`）、Task 3（降级）、Task 9（错误态） |
| §6.4 登录流程（验证 token → 校验白名单 → 存会话） | Task 15（会话）、Task 16（`verifyLogin` / `matchAdmin`）、Task 17（`signIn`） |
| §6.5 原则 ①单一布尔 `isAdmin` | Task 17（`tokenRef` 模块私有、context 只暴露 `isAdmin` 与写入口） |
| §6.5 原则 ②写入前惰性复验 | Task 17（`authorize()` 被 `mutate` / `create` / `remove` 共用） |
| §6.5 原则 ③权限数据驱动 | Task 2（`requiredTokenScopes`）、Task 16（`describeScopeRequirement`）、Task 17（`explain()`） |
| §6.5 原则 ④版本化存储 + 宽容解析 | Task 15（`ms.auth.v1`、`parseSession`、读失败即清） |
| §10.1 唯一写入入口 | Task 16（`mutateData` / `createData` / `deleteData`）、Task 17（`mutate` / `create` / `remove`） |
| §10.3 轮询 30s 且页面隐藏时暂停 | Task 13（`document.hidden` 提前返回） |
| §11 错误处理逐项降级 | Task 9（页面级）、Task 16（写入级）、Task 17（鉴权级） |
| §12 测试策略 | 全篇 TDD；纯函数与静态渲染两层 |
| §13 部署 | Task 21 |

未纳入本期实现的部分与设计文档 §2「本期不做（YAGNI）」逐条对应：单败 / 循环赛、轮空处理、选手统计、注册体系、WebSocket、总决赛重置规则。

**2. Placeholder 扫描**

逐一检查了「TBD / TODO / 稍后实现 / 类似 Task N / 自行补充错误处理」这几类写法，未发现。所有步骤都给出了可粘贴的完整代码、确切的文件路径与预期输出。Task 19 Step 7 中先给 `EventEditPanel` 的占位实现是为了让 Task 19 的测试独立跑通，Task 20 Step 5 会把它整体替换掉，两处代码都已写全。

**3. 类型一致性检查**

- `AuthContextValue` 的三个写入口（`mutate` / `create` / `remove`）在 Task 17 定义，Task 19 / 20 使用，签名一致：都接收 `Omit<Options, 'repo' | 'token'>`，都返回 `Promise<WriteOutcome>`。
- `WriteOutcome` / `FailureReason` 只在 `lib/data/github.ts` 定义一次（Task 16），Task 17 / 19 / 20 只引用不重定义。
- `eventFilePath()` 定义在 `lib/admin/newEvent.ts`（Task 19），Task 19 的 `CreateEventForm` / `EventList` 与 Task 20 的 `EventEditPanel` 都从这里导入，没有各自的字符串拼接。Task 18 的 `MatchDetailDialog` 里那处 `public/data/events/${eventId}.json` 是 Phase 3 写下的、当时 `newEvent.ts` 尚不存在，两者字面量完全相同。
- `NewEventInput['bracketSize']` 为 `4 | 8 | 16 | 32`，与 `generateTemplate(bracketSize)`、`TournamentEvent.bracketSize` 一致。
- `EventEdit` 的三个 `kind` 在 `validateEventEdit` 与 `applyEventEdit` 中一一对应；`applyEventEdit` 的 `now` 参数与 `TournamentEvent.updatedAt` 同为 ISO 字符串。
- `EventEditPanelProps.initialEvent` 与 `AuthProviderProps.initialSession` 是同一套测试注入约定（`undefined` = 真实加载，`null`/对象 = 注入）。
- `DerivedMatch` 的字段名（`sourceA` / `sourceB` / `status` / `bo`）在 Task 7 定义、Task 9 的 `slotLabel` / `connectorViews`、Task 11 的卡片、Task 13 的弹窗中一致使用。

**已知的实现顺序约束（执行时不要打乱）：** Task 19 依赖 Task 5 的 `generateTemplate` 与 Task 17 的 `create`；Task 20 依赖 Task 19 的 `eventFilePath`；Task 21 依赖全部前序任务（CI 里会跑全量测试）。
