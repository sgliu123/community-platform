# 🏘️ 春天阳光小区 - 社区数字化平台

> **项目代号**：Sunlight Community
> **部署平台**：GitHub（代码）+ Cloudflare Pages（网站 + API 一体化）
> **技术栈**：纯 HTML/CSS/JS 前端 + Cloudflare Pages Functions（`_worker.js`）
> **数据存储**：Cloudflare R2 对象存储（桶：`community-uploads`）

---

## 🏗️ 架构说明

```
业主/管理员浏览器
      │  （同一个域名 www.firstblade.site）
      ▼
Cloudflare Pages ── 静态文件（本仓库根目录的 HTML/CSS/JS）
      │
      └─ _worker.js（Pages Functions，拦截 /api/* 请求）
             ├── /api/auth/*    登录认证（密码在环境变量，HMAC 令牌）
             ├── /api/read/*    读取数据 ──┐
             ├── /api/write/*   写入数据 ──┤
             ├── /api/data/*    数据网关 ──┼──▶ R2 桶 community-uploads
             ├── /api/upload    文件上传 ──┤     （data/*.json + images/ + videos/ + uploads/）
             └── /api/image/*   文件读取 ──┘
```

- **前后端同域**:前端所有 API 请求走相对路径（`/api/...`)，代码里不写死任何域名
- **R2 是唯一数据源**：仓库里 `data/*.json` 仅作初始化/兜底，线上真实数据以 R2 为准
- **密码不落库**：管理员密码、JWT 密钥全部在 Cloudflare 环境变量里，不进仓库

---

## 📁 文件结构

```
community-platform/
├── index.html             # 前台（居民端）入口
├── admin.html             # 后台（管理端）入口
├── life.html              # 生活服务页（前台）
├── admin-life.html        # 生活服务管理（后台）
├── trade.html             # 房屋租售/物品交易（前台）
├── trade-admin.html       # 交易管理（后台）
├── vote.html              # 投票页（独立）
├── _worker.js             # Cloudflare Pages Functions（API 层）
├── css/                   # main.css / admin.css
├── js/                    # 前后台业务 JS（core/data/app/utils + pages/ + admin-pages/）
├── assets/                # 图片/视频/附件（历史资源）
└── data/                  # 初始化 JSON（兜底数据；线上数据以 R2 为准）
```

> ⚠️ 已废弃并移除：`index-inline.html`、`admin-inline.html`（整页内联旧版）、仓库根目录误传的 `polls.js` / `admin-auth.js`、`pages/` 重复目录、`data/cv` 乱入文件、`CNAME`(GitHub Pages 时代的自定义域名配置）。

---

## 🚀 部署（一次性，约 15 分钟）

### 第 1 步：Fork/上传代码到 GitHub

代码仓库：`sgliu123/community-platform`（main 分支，保持 Public)。

### 第 2 步：创建 Cloudflare Pages 项目

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com)
2. 左侧 **Workers & Pages** → **Create** → 选 **Pages** 标签 → **Connect to Git**
3. 授权 GitHub，选择仓库 `community-platform` → **Begin setup**
4. 构建设置：
   - Framework preset:**None**
   - Build command:**留空**
   - Build output directory:**/**
5. 点 **Save and Deploy**，等待首次部署完成，得到预览地址 `<项目名>.pages.dev`

### 第 3 步：绑定 R2 桶

Pages 项目 → **Settings** → **Bindings** → **Add**:

| 类型 | 变量名 | 值 |
|------|--------|-----|
| R2 bucket | `UPLOADS` | `community-uploads` |

（变量名必须是 `UPLOADS`,`_worker.js` 按这个名字读取。)

### 第 4 步：配置环境变量

Pages 项目 → **Settings** → **Environment variables** → Production 下添加（类型都选 **Secret**):

| 变量名 | 说明 |
|--------|------|
| `JWT_SECRET` | 登录令牌签名密钥，填一段随机长字符串（如 32 位以上） |
| `ADMIN_PASSWORD_ADMIN_SUPER` | 总维护人员 登录密码 |
| `ADMIN_PASSWORD_ADMIN_PROPERTY` | 物管人员 登录密码 |
| `ADMIN_PASSWORD_ADMIN_COMMITTEE` | 业委会成员 登录密码 |
| `ADMIN_PASSWORD_ADMIN_COMMUNITY` | 社区人员 登录密码 |
| `ADMIN_PASSWORD_ADMIN_DEV` | 开发者 登录密码 |

改密码 = 改环境变量值，保存后自动重新部署生效。

### 第 5 步：绑定自定义域名

1. Pages 项目 → **Custom domains** → **Set up a custom domain** → 输入 `www.firstblade.site`
2. 域名 DNS 在 Cloudflare 的，会自动完成验证和接入（约 1 分钟）
3. 如 DNS 里 `www` 有指向 GitHub 的旧记录（A/CNAME)，先删掉再绑定

### 第 6 步：验证清单

- [ ] `https://www.firstblade.site/` 打开前台，公告/动态正常显示（数据来自 R2)
- [ ] `https://www.firstblade.site/admin.html` 选身份登录后台（用第 4 步的密码）
- [ ] 后台随便改一条公告保存 → 前台首页刷新可见（验证 R2 写入链路）
- [ ] 后台上传一张图片成功（验证 R2 上传链路）

全部通过后：GitHub 仓库 **Settings → Pages** 里关掉旧的 GitHub Pages；旧 Worker `sunlight-api`(api.firstblade.site）确认无人使用后删除（**不影响 R2 数据**)。

---

## 🔧 日常维护

| 操作 | 入口 |
|------|------|
| 居民端 | `https://www.firstblade.site/` |
| 管理端 | `https://www.firstblade.site/admin.html` |
| 改代码 | 推送/合并 PR 到 GitHub `main` 分支，Pages 自动重新部署 |
| 改密码 | Cloudflare Pages 项目 → Settings → Environment variables |
| 看错误日志 | Cloudflare Pages 项目 → Functions → Logs |
| 本地开发模式 | 浏览器控制台执行 `localStorage.setItem('workerBase','off')` 后刷新，数据仅存内存；恢复： `localStorage.removeItem('workerBase')` |

## ⚠️ 重要提示

1. **R2 是唯一数据源**，请在 Cloudflare R2 控制台定期导出备份（每月）
2. **数据接口公开可读**(`/api/read/*`)，请勿在公告/工单中填写敏感个人信息
3. 后台「系统设置 → Worker 网关地址」**保持留空**（同域模式），不要乱填旧域名
4. 代码改动集中推送，Pages 每次提交都会触发全量重新部署（约 1 分钟）

---

**社区数字化平台 · Sunlight Community · 共建和谐社区，共享美好生活**
