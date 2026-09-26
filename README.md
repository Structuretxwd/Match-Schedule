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
