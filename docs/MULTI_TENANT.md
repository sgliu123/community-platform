# 多租户运维手册（一街 N 小区）

> 一码多库，按域名路由。每小区独立 D1（物理隔离），图片等大文件共用主桶 + `t<tid>/` 前缀隔离。
> 代码一份，发布一次全员升级；新增小区约 5 分钟。

## 架构速览

```
业主/管理浏览器 → 各小区域名（x2.firstblade.site …）
        │  Host 头
        ▼
   Cloudflare Pages（同一个项目，同一份 _worker.js）
        │  resolveTenant：Host → tid（读主租户库 tenants.json，60s 缓存）
        ├── D1      → DB / DB_t02 / DB_t03 …   （每小区独立数据库）
        └── R2      → UPLOADS（共享桶内 t<tid>/ 前缀隔离；可选用独立桶 UPLOADS_tNN）
```

- 主租户 `t01` = 现网主体（www.firstblade.site，community-db）
- token 全部带 `tid`，跨小区一律 401；旧版无 `tid` 的 token 仅在 t01 兼容
- 总控门户：`https://www.firstblade.site/portal`（健康灯 + 前后台入口）

## 新增小区（两条命令）

```bash
export CF_API_TOKEN=...      # 需 Account.D1 Edit + Account Pages Edit（R2 权限可选）
export CF_ACCOUNT_ID=...
python3 scripts/provision-tenant.py \
  --name "红星小区" --slug hongxing --tenant t02 \
  --domain hongxing.firstblade.site \
  --super-name 红星总维护 --super-password 123456

# （发布一次仓库让绑定生效后）
python3 scripts/provision-tenant.py --name "红星小区" --slug hongxing \
  --tenant t02 --domain hongxing.firstblade.site --bootstrap
```

- 脚本自动：建 D1 → 绑定 → 加域名 → 写入小区配置 + 总维护账号（sha256，登录后自动升级 PBKDF2）→ 登记进总控清单
- 投票历史等业务数据导入：各小区后台「开发者工具 → D1 一键初始化」幂等执行

## 管理约定

- **初始密码 123456**：小区总维护首次登录后请立即在后台自行修改
- 每小区 1 名总维护（admin-super，存放于小区自己的库）；其他管理员由其审批/管理，密码互相独立
- 主租户管理员密码（环境变量）仅平台方自留的“万能钥匙”，日常不使用
- 重命名小区：更新主租户库 `tenants.json` 文档即可（门户/路由 60 秒内生效）

## 容量与配额

- D1 免费额度按**账号**共享（每天 500 万行读 / 10 万行写 / 5GB 库容），按小区分库不叠加额度，
  但相互独立不挤占；小区多、量大时建议开启 Workers Paid
- R2 共享桶免费 10GB；历史订单归档出口为 `canteen-archive/<年>.json`
- 单小区容量结论：食堂开启 ~2,000 户轻松、1 万户级需已上线的批量/销量表优化（已完成）；
  食堂关闭则基本无实际上限
