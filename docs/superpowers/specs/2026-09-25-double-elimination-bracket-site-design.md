# 双败淘汰赛程网站 — 设计文档

* 日期：2026-09-25

* 状态：设计已确认，待实施

* 部署目标：GitHub Pages（纯静态托管）

***

## 1. 项目目标

搭建一个比赛赛程网站，核心是展示与管理**双败淘汰制**赛程，并为后续接入其他赛制（单败、小组循环等）预留结构。三类使用者：

* **观众 / 参赛者**：直接访问即可查看赛程、比分、晋级路径与比赛详情，无需登录。

* **管理员 / 裁判**：在页面上直接录入与修改比分、维护队伍、管理赛事与公告，改动自动同步到线上。

* **后续扩展**：赛制不写死，为新增赛制留出接口边界。

## 2. 范围

### 本期实现（MVP）

1. 双败淘汰赛制，支持 **4 / 8 / 16 / 32** 队签表
2. 赛程总览：经典双败对阵图（胜者组上 / 败者组下 / 总决赛右）
3. 双败分区清晰区分，标明晋级、掉落、淘汰路径
4. 比赛详情：队伍、选手、比分、时间、BO 赛制、裁判、直播链接、备注
5. 比分录入与修改，**修改后后续对阵自动重算**
6. 队伍管理：队伍 / 选手信息、战绩、当前状态（存活胜者组 / 存活败者组 / 已淘汰）
7. 后台管理：创建赛事、添加队伍、生成签表、发布公告
8. 附加视图：时间顺序赛程列表、公告
9. 响应式设计：手机与桌面均可正常浏览，复杂对阵图支持横向滚动与缩放

### 本期不做（YAGNI）

* 赛制类型除双败外的具体实现（仅预留扩展边界，不实现单败/循环）

* 队伍数量非 2 的幂时的轮空（bye）处理（仅支持 4/8/16/32）

* 选手个人数据统计、赛事历史归档、多赛事对比

* 真实的多用户注册体系（见第 6 节）

* WebSocket 实时推送（改用轮询）

* 总决赛重置规则（Bracket Reset）——**明确不做**

## 3. 关键决策记录

| 决策项    | 结论                                                      | 理由                      |
| ------ | ------------------------------------------------------- | ----------------------- |
| 赛程总览布局 | **方案 A**：经典双败对阵图（单画布）                                   | 一张图看清全部晋级路径，对齐参考站点      |
| 视觉风格   | **HLTV 深色风格**                                           | 用户提供参考截图确认              |
| 赛制     | 双败淘汰制，4/8/16/32 队                                       | 覆盖绝大多数场景，实现量可控          |
| 决赛规则   | **不采用重置规则**，单场决胜                                        | 用户明确要求                  |
| BO 赛制  | 可调，除总决赛默认 BO3，总决赛默认 BO5                                 | 用户要求可切换 BO1/BO3/BO5     |
| 技术栈    | Next.js（App Router）+ TypeScript + Tailwind CSS，**静态导出** | 必须适配 GitHub Pages 纯静态托管 |
| 数据存储   | 仓库内 JSON 文件（`public/data/`）                             | 无服务端，数据即代码，随仓库版本化       |
| 数据同步   | GitHub Contents API 自动提交 → Actions 自动重建                 | 管理员在页面上录分即可上线           |
| 鉴权     | 无注册功能，仅"管理员 / 游客"两类角色（见第 6 节）                           | 用户要求；静态站点不做自建身份系统       |
| 数据更新   | 前端轮询（30 秒）                                              | 实现简单可靠，无额外基础设施          |
| 赛程状态   | **纯函数实时推导，不存储**                                         | 改任何一场比分，后续对阵自动重算，天然一致   |

### 3.1 为什么赛程状态不存储

赛程推进关系是「种子排位 + 已确认赛果」的**确定性函数**：

```
bracketState = deriveBracket(eventSeeds, confirmedResults)
```

不把"某场对阵是谁"写进数据。数据里只存**结果**（哪场、几比几、谁赢），对阵关系与队伍去向全部由纯函数推导。带来的直接好处：

* 修改历史比分后，后续所有对阵、队伍去向自动重算，不存在需要级联更新的冗余字段，也就没有"数据不同步"类 bug

* 推导逻辑可独立单元测试，无需渲染 UI

## 4. 架构

### 4.1 整体结构

```
浏览器（观众）
  ├─ 静态页面（构建时生成）
  └─ fetch /data/events/<id>.json  ← 每 30s 轮询（带 cache-bust）

浏览器（管理员）
  ├─ 同一套静态页面
  └─ GitHub Contents API（PUT /repos/{owner}/{repo}/contents/…）
        ↓ 提交 JSON 变更
     GitHub 仓库
        ↓ push 触发
     GitHub Actions → next build（静态导出）→ 部署到 Pages
        ↓ 约 1–2 分钟
     全网更新
```

### 4.2 关键约束与后果

**没有服务端。** 因此：

* 所有页面必须能静态导出：动态路由用 `generateStaticParams` 在构建时枚举

* 不存在构建期环境变量注入的密钥，一切运行时行为在浏览器完成

* 写入操作直接由浏览器调用 GitHub API，**PAT 必须存在客户端**

* 比分提交后不会立即对他人可见，需等 Actions 构建完成（约 1–2 分钟）。管理员本地做乐观更新立即看到结果，并明确提示"约 1–2 分钟后全网生效"

### 4.3 basePath 处理

GitHub Pages 项目站点部署在 `https://<user>.github.io/<repo>/` 下。这是最容易被忽略、也最容易在后续迭代中被改坏的地方，因此收敛为单一入口：

* 构建时由 CI 注入 `NEXT_PUBLIC_BASE_PATH`（值为 `/<repo>`）

* `next.config.js` 读取并设置 `basePath` / `assetPrefix`

* **所有**数据请求与资源引用必须经过 `lib/urls.ts` 的 `dataUrl(path)` / `assetUrl(path)`

* 任何页面代码中不得出现硬编码的绝对路径

若将来切换到自定义域名或用户站点（根路径），只需把 `NEXT_PUBLIC_BASE_PATH` 置空，其余代码不动。

### 4.4 目录结构

```
app/
  layout.tsx                          # 全局布局：深色主题、导航
  page.tsx                            # 赛事列表
  event/[id]/page.tsx                 # 对阵图主视图
  event/[id]/teams/page.tsx           # 队伍与战绩
  event/[id]/schedule/page.tsx        # 时间顺序赛程列表
  admin/page.tsx                      # 后台管理
components/
  bracket/BracketView.tsx             # 对阵图容器（滚动 + 缩放）
  bracket/MatchCard.tsx               # 单场对阵卡片
  bracket/Connectors.tsx              # SVG 连接线
  auth/AuthProvider.tsx               # 认证上下文（只暴露 isAdmin）
  auth/AdminGate.tsx                  # 管理功能包裹组件
  MatchDetailDialog.tsx               # 比赛详情 / 录分弹窗
lib/
  bracket/generate.ts                 # 签表生成（纯函数）
  bracket/advance.ts                  # 推进引擎（纯函数）
  bracket/layout.ts                   # 对阵图布局坐标计算（纯函数）
  bracket/validate.ts                 # 比分合法性校验（纯函数）
  data/schema.ts                      # 类型定义 + 运行时校验
  data/load.ts                        # 构建期读取数据（fs）
  data/github.ts                      # mutateData：唯一写入入口
  auth/session.ts                     # 版本化会话存储
  urls.ts                             # basePath 与 URL 构造
public/data/
  config.json                         # 管理员白名单 + 所需权限
  events/<eventId>.json               # 每赛事一个数据文件
```

## 5. 数据模型

### 5.1 存储的数据

数据文件放 `public/data/`，使其既能在构建期用 `fs` 读取，又能被浏览器直接 `fetch`。GitHub API 提交路径即 `public/data/...`。

```jsonc
// public/data/config.json
{
  "admins": [
    { "login": "your-github-name", "role": "admin" },
    { "login": "referee-a", "role": "referee" }
  ],
  "requiredTokenScopes": { "contents": "write", "path": "public/data/" }
}
```

```jsonc
// public/data/events/<eventId>.json
{
  "id": "2026-spring",
  "name": "2026 春季赛",
  "format": "double-elimination",
  "bracketSize": 8,              // 4 | 8 | 16 | 32
  "status": "ongoing",           // draft | ongoing | finished
  "defaultBO": 3,                // 除总决赛外的 BO
  "grandFinalBO": 5,             // 总决赛 BO
  "teams": [
    { "id": "t1", "name": "Team A", "seed": 1,
      "players": [{ "name": "选手甲" }],
      "logo": null }
  ],
  "matches": [
    {
      "id": "WB-R1-M1",
      "bracket": "WB",           // WB | LB | GF
      "round": 1,
      "index": 1,                // 该轮内序号，决定对阵图布局次序
      "bo": 3,
      "scoreA": 2, "scoreB": 0,  // 均为 null 表示尚无结果；两个数字同时存在即视为结果已确认
      "live": false,             // 管理员手动标记"进行中"
      "scheduledAt": "2026-10-01T14:00:00+08:00",
      "referee": "裁判名",
      "streamUrl": "https://...",
      "note": "备注文本"
    }
  ],
  "announcements": [
    { "id": "a1", "content": "内容", "createdAt": "2026-09-25T10:00:00+08:00" }
  ],
  "updatedAt": "2026-09-25T10:00:00+08:00"
}
```

**注意：`matches`** **中不存队伍去向。** `teamAId` / `teamBId` 不持久化，由推进引擎推导。首轮对阵来自 `teams[].seed` 的固定对位，后续轮次来自前置比赛结果。

**赛事列表无需索引文件。** 构建期由 `lib/data/load.ts` 直接扫描 `public/data/events/` 目录得到赛事清单；`generateStaticParams` 亦复用同一扫描结果生成各赛事的静态路由。新增赛事后由 Actions 重新构建，清单自动更新，不存在需要手工维护的索引文件。

### 5.2 推导出的数据（不存储）

```ts
type DerivedMatch = {
  id: string
  bracket: 'WB' | 'LB' | 'GF'
  round: number
  index: number
  teamA: Team | null          // null 表示来源未确定
  teamB: Team | null
  scoreA: number | null
  scoreB: number | null
  status: 'pending' | 'ready' | 'live' | 'finished'
  bo: number
  sourceA: MatchRef | null    // 队伍来源（用于对阵图标注）
  sourceB: MatchRef | null    // 如「WB-R1-M1 败者」
  isElimination: boolean      // 败者是否被淘汰
  isEliminatedBy: MatchRef | null
}

type DerivedBracket = {
  matches: DerivedMatch[]
  teamStates: TeamState[]     // 每队：存活(胜者组) | 存活(败者组) | 已淘汰
}
```

`status` 为纯推导，规则如下（优先级从高到低）：

| 条件                       | status          |
| ------------------------ | --------------- |
| `scoreA` 与 `scoreB` 均为数字 | `finished`      |
| 仅有单侧为数字（数据异常）            | `ready` + 控制台告警 |
| `live === true`          | `live`          |
| 双方队伍均已确定                 | `ready`         |
| 至少一方队伍未确定                | `pending`       |

### 5.3 数据校验

`lib/data/schema.ts` 提供运行时校验。所有写入路径在提交前校验，所有读取路径在解析后校验：

* 读取失败或结构不认识 → 页面降级为"数据暂不可用"提示，**不白屏**

* 写入校验失败 → 弹窗提示具体字段错误，**不提交**

## 6. 鉴权设计

### 6.1 设计前提

GitHub Pages 是纯静态托管。任何"自己实现的账号 + 密码登录"都必须把校验逻辑放在前端，密码对所有人可见，且每次增删账号都要改代码或改数据——这正是最容易出 bug 的地方。因此**不在站点内实现身份系统，而是把身份委托给 GitHub**。

### 6.2 角色模型

只有两类：

* **游客**：默认状态，零配置。直接访问即可查看所有赛程、比分、晋级情况、比赛详情。无任何写权限。不需要"游客账号"实体。

* **管理员**：持有 GitHub 凭证且用户名在白名单内。

### 6.3 "注册管理员账号"

不是注册，而是**授权**：在 `public/data/config.json` 的 `admins` 数组中加入一行 GitHub 用户名。由此：

* 无需密码库、邮件服务、找回密码流程 —— 这些全部是 bug 源头，直接不存在

* 无需站点内注册表单

* 账号的启用/停用 = 一次配置提交

`role` 字段区分 `admin`（全部权限）与 `referee`（仅录分），用于界面展示与操作范围控制。

### 6.4 登录流程

1. 管理员进入 `/admin`，输入 **GitHub 用户名** + **fine-grained PAT**
2. 调用 `GET https://api.github.com/user` 验证 token 有效，且返回的 `login` 与输入一致
3. 读取 `config.json` 校验该 `login` 在白名单内
4. 通过 → `isAdmin = true`，会话写入 localStorage

### 6.5 四个"迭代也弄不坏"的设计原则

| 原则             | 做法                                                 | 解决什么问题                                            |
| -------------- | -------------------------------------------------- | ------------------------------------------------- |
| ① 单一布尔状态       | 业务代码只读 `isAdmin`，永不直接接触 token                      | 新增页面/功能在物理上无法影响登录逻辑                               |
| ② 写入前惰性复验      | 所有写入收敛到唯一的 `mutateData()`，每次提交前复验 token            | token 过期、被撤销、被移出白名单 → 自然降级为游客并提示重登；不存在"陈旧会话"类 bug |
| ③ 权限数据驱动       | 所需 scopes 写在 `config.json` 的 `requiredTokenScopes` | 将来某功能需要更多 GitHub 权限，改配置即可；旧 token 明确报错提示重登，而非静默失败 |
| ④ 版本化存储 + 宽容解析 | key 为 `ms.auth.v1`；读取时 try/catch + schema 校验       | 读到任何不认识的结构一律视为未登录，绝不崩溃                            |

原则 ①的实现约束：`AuthProvider` 对外只暴露 `{ isAdmin, role, login, login$(), logout() }`，token 封装在模块私有作用域内，不进入 React context，页面代码无法拿到。

### 6.6 安全边界（必须诚实说明）

**白名单是前端校验，不构成安全边界。** 真正的安全边界是 PAT 自带的仓库写权限——GitHub 服务端会拒绝越权提交。白名单的真实作用是区分管理员/裁判角色与界面展示。

防线依赖 PAT 的最小权限配置，文档与 `/admin` 页面均需明确提示：

* **仅本仓库**（不要给 org 或全部仓库）

* **仅** **`public/data/`** **路径**

* **仅** **`Contents: Read and write`**

* **90 天过期**

PAT 存于 localStorage 存在 XSS 暴露面，这是纯静态托管的固有代价，通过上述最小权限把爆炸半径限制在 `data/` 目录。缓解措施：设置 CSP、不在 URL/日志中出现 token、提供"登出"清除会话。

### 6.7 未来升级路径

若将来需要彻底不在客户端存放 token，可切换到 GitHub Device Flow / OAuth App + Cloudflare Worker 换取 httpOnly cookie。**届时只需替换认证模块**——因为原则 ① 保证了业务代码只读 `isAdmin`，页面代码无需改动。

## 7. 赛制逻辑

### 7.1 签表生成

对 `n = 4/8/16/32` 队（`k = log2(n)`）：

* **胜者组**：`k` 轮，第 1 轮 `n/2` 场，逐轮减半，最后一轮 1 场

* **败者组**：`2k - 2` 轮，共 `n - 2` 场

* **总决赛**：1 场

总场次 `2n - 2`。

败者组轮次配对规则（`r` 为败者组轮次序号）：

| 轮次               | 配对方式                                  |
| ---------------- | ------------------------------------- |
| `r = 1`          | 胜者组第 1 轮的败者之间互相对阵                     |
| `r` 为偶数          | 败者组第 `r-1` 轮胜者 对阵 胜者组第 `r/2 + 1` 轮的败者 |
| `r` 为奇数且 `r ≥ 3` | 败者组第 `r-1` 轮胜者之间互相对阵                  |

以 `n = 8` 验证：LB R1 = 2 场（WB R1 的 4 个败者）；LB R2 = 2 场（LB R1 胜者 2 队 vs WB R2 败者 2 队）；LB R3 = 1 场（LB R2 胜者 2 队）；LB R4 = 1 场（LB R3 胜者 vs WB 决赛败者）。合计 6 场 = `n - 2` ✓

首轮种子对位采用标准排位（`n = 8` 时：1v8、4v5、3v6、2v7），确保高种子在后续轮次相遇。支持管理员手动调整首轮对位。

### 7.2 晋级与掉落

* **胜者组**：胜者留在胜者组进入下一轮；败者掉落至败者组对应槽位

* **败者组**：胜者晋级下一轮；败者**淘汰**（累计两败）

* **总决赛**：胜者组冠军 vs 败者组冠军，**单场决胜，不采用重置规则**

### 7.3 队伍状态推导

由已确认结果累计推导，不存储：

* 0 败 → 存活（胜者组）

* 1 败 → 存活（败者组）

* 2 败 → 已淘汰

### 7.4 BO 与比分校验

* 合法的 `bo` 值为奇数：1 / 3 / 5 / 7

* 获胜所需局分 = `ceil((bo + 1) / 2)`：BO1 需 1 局，BO3 需 2 局，BO5 需 3 局

* 校验规则（`lib/bracket/validate.ts`，纯函数）：

  * 单方局分不得超过获胜所需局分

  * 总比分不能出现双方均达标的平局

  * 必须有一方达到获胜局分，才允许写入比分（写入即视为该场结束，`status` 推导为 `finished`）

* 默认：`defaultBO = 3`（除总决赛外），`grandFinalBO = 5`。两者均可在创建赛事时及后台修改为 BO1/BO3/BO5。

### 7.5 修改比分后的重算

由于赛程状态不存储，修改任意一场比分后：

1. 重新执行 `deriveBracket()`
2. 所有依赖该结果的后续对阵、队伍去向、淘汰状态全部自动更新
3. 若某场比分从"已确认"改为"未确认"，下游比赛回到 `pending`

无需任何级联更新代码，这是纯函数推导的直接收益。

## 8. 页面与路由

| 路由                     | 用途                  | 可见性               |
| ---------------------- | ------------------- | ----------------- |
| `/`                    | 赛事列表                | 所有访客              |
| `/event/[id]`          | 对阵图主视图（默认视图）        | 所有访客              |
| `/event/[id]/schedule` | 时间顺序赛程列表            | 所有访客              |
| `/event/[id]/teams`    | 队伍、选手、战绩、当前状态       | 所有访客              |
| `/admin`               | 后台：赛事 CRUD、队伍、公告、登录 | 页面公开可达，管理功能需登录后可用 |

**对阵图主视图**（`/event/[id]`）：

* 胜者组在上、败者组在下、总决赛居右

* 轮次分列，列内按 `index` 纵向排列

* 卡片显示：双方队名 + 比分、状态标签（待赛/进行中/已结束）、BO、时间

* 晋级/掉落路径由 SVG 连接线表示；已淘汰队伍置灰

* 点击卡片打开比赛详情弹窗

* 管理员在此直接录分

**移动端**：对阵图容器横向滚动为主，另提供缩放控制（按钮 + 双指）；页面其余部分常规响应式。

## 9. 对阵图布局算法

对阵图布局是本期最复杂的 UI 部分，因此拆为**独立的纯函数**，与渲染解耦、可单独测试：

```ts
layoutBracket(derived: DerivedBracket) => {
  columns: { bracket, round, x, width }[]
  cards:   { matchId, x, y, width, height }[]
  connectors: { from, to, path }[]   // SVG path 数据
}
```

* 卡片 `y` 坐标由轮次与 `index` 递推计算，保证同一轮卡片等距

* 连接线路径由卡片边缘坐标生成

* 渲染层只负责把计算结果画出来，不含任何定位逻辑

这样布局数学可以被单测覆盖，视觉问题与算法问题分离。

## 10. 数据同步与写入

### 10.1 唯一写入入口

所有写操作收敛到 `lib/data/github.ts` 的单一函数：

```ts
mutateData<T>(
  path: string,
  mutate: (current: T) => T
): Promise<Result<void>>
```

内部流程：

1. 惰性复验 token（原则 ②）→ 失败则清除会话、降级游客、返回明确的错误
2. `GET` 当前文件内容与 `sha`
3. 应用 `mutate` 得到新内容 → 运行时 schema 校验（§5.3）
4. `PUT` 提交（携带 `sha`）
5. 若返回 **409**（并发冲突）：重新 `GET` 最新内容与 `sha`，重新应用 `mutate` 再提交，最多重试 1 次
6. 提交成功后返回，UI 提示"已提交，约 1–2 分钟后全网生效"

采用 `mutate(current) => next` 而非直接传入整份内容，是为了在 409 重试时能**把本次改动应用到最新内容之上**，避免覆盖其他管理员的并发修改。

### 10.2 请求约定

* 统一使用 `X-GitHub-Api-Version: 2022-11-28`

* 所有 GitHub API 调用集中在 `lib/data/github.ts`，若 API 变更只需改一处

* 提交信息格式：`chore(data): <赛事名> <操作描述>`

### 10.3 观众端轮询

* 每 30 秒 `fetch(dataUrl('/data/events/<id>.json') + '?t=' + Date.now(), { cache: 'no-store' })`

* 查询参数用于绕过 CDN 缓存

* 内容哈希未变化则不触发重渲染

* 页面隐藏时（`document.hidden`）暂停轮询，减少无谓请求

## 11. 错误处理

| 场景                              | 处理                                   |
| ------------------------------- | ------------------------------------ |
| token 过期 / 被撤销 / 被移出白名单         | 401/403 → 清除会话、降级游客、横幅提示重新登录         |
| 网络异常                            | 保留会话但标记"未验证"，提供重试；不自动登出              |
| 并发提交冲突（409）                     | 重新拉取最新内容、重放本次改动、重试 1 次；仍失败则提示"刷新后重试" |
| GitHub 限流                       | 提示稍后重试；PAT 限额 5000 次/小时，正常使用不会触及     |
| 数据文件缺失 / JSON 解析失败 / schema 不匹配 | 页面降级为"数据暂不可用"，不白屏；控制台记录详情            |
| 比分校验不通过                         | 弹窗内联提示具体规则，禁止提交                      |
| localStorage 结构不认识              | 视为未登录，清空该 key，不抛错（原则 ④）              |

**核心原则：任何鉴权或数据异常都不得导致白屏或崩溃，最差情况是降级为游客 / 只读。**

## 12. 测试策略

### 12.1 单元测试（vitest）——重点覆盖纯函数

* `bracket/generate.ts`：4/8/16/32 队签表结构正确（轮次数、每轮场次数、总场次 = `2n-2`）

* `bracket/advance.ts`：

  * 胜者组胜者晋级、败者正确掉落至败者组指定槽位

  * 败者组败者被淘汰

  * 总决赛在"不重置"规则下单场决胜

  * 完整跑通 4 队与 8 队全流程，校验最终冠军归属

  * **修改中间轮次比分后，下游对阵正确重算**

  * 队伍状态推导（0 败 / 1 败 / 2 败）

* `bracket/validate.ts`：BO1/BO3/BO5 各边界值，非法比分被拒绝

* `bracket/layout.ts`：坐标递推无重叠、连接线端点与卡片边缘对齐

* `data/schema.ts`：合法数据通过，各类畸形数据被拒绝

* `auth/session.ts`：正常读写、旧版本 key、损坏 JSON、缺字段均不抛错且正确降级

### 12.2 集成 / 手动验收

* 构建产物能在 `basePath` 下正常加载与请求数据

* 页面冒烟：列表 → 对阵图 → 队伍 → 赛程列表 → 后台

* 管理员全流程：登录 → 创建赛事 → 加队伍 → 生成签表 → 录分 → 观察下游推进 → 公告

* 移动端：对阵图横滚与缩放手势正常

## 13. 部署

* GitHub Actions 工作流：`next build`（`output: 'export'` → `out/`）→ `actions/deploy-pages`

* 触发条件：push 到主分支（含管理员通过 API 提交的数据变更）

* 构建时注入 `NEXT_PUBLIC_BASE_PATH`

* `.gitignore` 需包含 `.superpowers/`

## 14. 后续扩展方向（不在本期实现）

* **新增赛制**：`format` 字段已预留。新增单败/小组循环时，添加对应的 `generate` + `advance` 纯函数模块，`DerivedBracket` 作为统一输出契约，页面层无需改动

* **更安全的鉴权**：GitHub Device Flow + Cloudflare Worker 换 httpOnly cookie（§6.7）

* **实时推送**：若轮询不够及时，可在保持同一数据契约的前提下替换为其他机制

* **选手数据统计、赛事历史归档**

