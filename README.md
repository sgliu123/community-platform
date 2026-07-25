# 🏘️ 春天阳光小区 - 社区数字化平台

> **项目代号**：Sunlight Community  
> **部署平台**：GitHub Pages（零费用）  
> **技术栈**：纯 HTML/CSS/JS 单页应用，无后端  
> **数据存储**：GitHub 仓库 JSON 文件  

---

## 📁 文件结构

```
community-platform/
├── index.html              # 前台（居民端）
├── admin.html              # 后台（管理端）
├── README.md               # 本文件
└── data/
    ├── config.json         # 社区配置 + 管理员 + 主题 + 密码哈希
    ├── announcements.json  # 公告（8条预设，2置顶）
    ├── documents.json      # 上级文件（3份预设）
    ├── activities.json     # 社区动态（4条预设）
    ├── polls.json          # 投票/征集（2个预设）
    ├── residents.json      # 业主清单（50条测试数据）
    └── audit-log.json      # 操作审计日志
```

---

## 🚀 快速部署（5步上线）

### 第1步：创建 GitHub 仓库
1. 登录 [github.com](https://github.com)
2. 点击右上角 **+** → **New repository**
3. 仓库名填写 `community-platform`
4. 选择 **Public**（公开）
5. 点击 **Create repository**

### 第2步：上传文件
1. 在新仓库页面，点击 **uploading an existing file**
2. 将本项目的所有文件和 `data/` 文件夹拖拽上传
3. 填写提交信息：`初始上传`
4. 点击 **Commit changes**

### 第3步：开启 GitHub Pages
1. 进入仓库 → **Settings** → 左侧 **Pages**
2. **Source** 选择 `Deploy from a branch`
3. **Branch** 选择 `main` / `root`
4. 点击 **Save**
5. 等待 2-5 分钟，获得网站地址：`https://你的用户名.github.io/community-platform/`

### 第4步：获取 GitHub Token
1. 点击头像 → **Settings** → 最底部 **Developer settings**
2. **Personal access tokens** → **Tokens (classic)** → **Generate new token**
3. 勾选 **repo** 权限
4. 点击 **Generate token**
5. ⚠️ **立即复制保存**（只显示一次）

### 第5步：进入后台配置
1. 访问 `https://你的用户名.github.io/community-platform/admin.html`
2. 输入默认密码：`Sunlight2026`
3. 输入 GitHub Token 和管理员名称
4. 进入后台 → **系统设置** → **立即修改密码**
5. 替换测试数据为真实内容，发布网站链接到业主群

---

## 🔐 认证说明

### 管理员登录
- **默认密码**：`Sunlight2026`
- **哈希算法**：SHA-256（加盐 `SunlightCommunity2026`）
- **修改路径**：后台 → 系统设置 → 修改密码
- **密码强度**：8位以上，必须同时含字母和数字

### GitHub Token
- 仅用于调用 GitHub API 写入数据
- 保存在浏览器 localStorage，不上传服务器
- 每位管理员使用自己的 Token
- 可在后台随时更换

### 业主登录
- **测试账号**：房号 `1-1-101`，姓名 `测试业主01`，手机号 `13800000001`
- 验证方式：房号 + 姓名 + 手机号后4位匹配
- 登录状态保存在 localStorage

---

## 👥 管理员权限（5人）

| 管理员 | 角色 | 权限 |
|--------|------|------|
| 管理员A | 超级管理员 | 全部权限 + 修改密码 |
| 管理员B | 编辑员 | 公告/文件/动态/投票/业主 |
| 管理员C | 编辑员 | 仅公告/动态 |
| 管理员D | 编辑员 | 仅投票/业主 |
| 管理员E | 查看员 | 只读 + 查看日志 |

---

## 🎨 五套主题

| 主题 | 色值 | 风格 |
|------|------|------|
| 春晓绿（默认）| #2E8B57 | 清新自然 |
| 天空蓝 | #1976D2 | 稳重专业 |
| 暖阳橙 | #E65100 | 温馨活力 |
| 中国红 | #C62828 | 庄重喜庆 |
| 优雅紫 | #6A1B9A | 高端典雅 |

- 居民在网页底部点击 🎨 按钮切换，选择永久记忆
- 管理员在后台可设置默认主题

---

## 🗳️ 腾讯问卷「一案一卷」

1. 后台 → 投票管理 → 新增
2. 系统自动生成案卷编号（如 `2026-YJ-003`）
3. 前往 [wj.qq.com](https://wj.qq.com) 创建问卷
4. 问卷标题格式：`[春天阳光小区] 2026-YJ-003 关于xxx的意见征集`
5. 复制问卷链接粘贴回后台
6. 业主点击「我要参与」跳转填写

---

## ⚠️ 重要提示

1. **首次登录后请立即修改默认密码**
2. **Token 仅保存在本地浏览器**，换电脑需重新配置
3. **数据文件为公开 JSON**，请勿存储敏感个人信息
4. **建议每月导出 `data/` 文件夹作为本地备份**
5. **GitHub Pages 更新有约 1-2 分钟延迟**

---

## 📊 预设数据

所有预设数据均标注【测试】，正式上线前请替换：

- 公告 8 条（2 条置顶）
- 上级文件 3 份
- 社区动态 4 条
- 投票/征集 2 个（1 进行中 + 1 已结束有结果）
- 测试业主 50 条（1-1-101 至 1-5-110）

---

## 💰 成本

| 项目 | 费用 |
|------|------|
| GitHub Pages 托管 | ¥0 |
| GitHub 仓库 | ¥0 |
| GitHub API | ¥0 |
| 腾讯问卷 | ¥0 |
| **年度总成本** | **¥0** |

---

**社区数字化平台 · Sunlight Community · 共建和谐社区，共享美好生活**
