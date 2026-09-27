#!/usr/bin/env python3
"""多租户开通脚本：一街 N 小区（方案 B'：一码多库，按域名路由）

用法：
  export CF_API_TOKEN=...        # Account.D1 Edit + Account Pages Edit + Account R2 Edit
  export CF_ACCOUNT_ID=...
  python3 scripts/provision-tenant.py --name 二小区 --slug xiaoqu2 --tenant t02 \\
      --domain x2.firstblade.site [--super-password ...] [--super-name 总维护]

步骤：
  1. 创建 D1 数据库 community-<slug>（不存在时）
  2. 创建 R2 桶 community-uploads-<slug>（不存在时）
  3. 给 Pages 项目追加绑定 DB_<tid> / UPLOADS_<tid>（合并式 PATCH，不动其他配置）
  4. 添加自定义域名到 Pages 项目
  5. 云端部署生效后（配合一次仓库发布），脚本继续：
     - 探活 /api/health（触发 D1 建表）
     - 直接向该租户 D1 写入：小区配置、总维护人员账号（sha256，首次登录自动升级 PBKDF2）
     - 在主租户库登记 tenants.json（总控门户/路由清单用）
"""
import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
import time
import urllib.request

API = "https://api.cloudflare.com/client/v4"


def api(token, method, url, data=None):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read().decode()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        print(f"  !! HTTP {e.code}: {e.read().decode()[:300]}")
        return {"success": False, "errors": [{"message": f"HTTP {e.code}"}]}


def ok(d):
    return bool(d.get("success"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="小区名，如：红星小区")
    ap.add_argument("--slug", required=True, help="资源 slug（小写字母数字），如：hongxing")
    ap.add_argument("--tenant", required=True, help="租户 ID，如：t02")
    ap.add_argument("--domain", required=True, help="本小区域名，如：hongxing.firstblade.site")
    ap.add_argument("--super-name", default=None, help="总维护人员姓名（默认 <小区名>总维护）")
    ap.add_argument("--super-password", default=None, help="初始密码（缺省自动生成强密码）")
    ap.add_argument("--project", default=os.environ.get("CF_PAGES_PROJECT", "community-platform"))
    ap.add_argument("--bootstrap", action="store_true", help="部署已生效后执行第 5 步（写入配置/账号/登记清单）")
    args = ap.parse_args()

    token = os.environ.get("CF_API_TOKEN")
    account = os.environ.get("CF_ACCOUNT_ID")
    if not token or not account:
        print("请设置 CF_API_TOKEN / CF_ACCOUNT_ID")
        sys.exit(1)
    if not args.tenant.startswith("t") or args.tenant in ("t01",):
        print("tenant 不能为 t01（t01 是主租户，沿用现有绑定）")
        sys.exit(1)

    password = args.super_password or secrets.token_hex(6)
    super_name = args.super_name or (args.name + "总维护")

    if not args.bootstrap:
        # 1) D1
        db_name = f"community-{args.slug}"
        existing = api(token, "GET", f"{API}/accounts/{account}/d1/database?per_page=50")
        db_uuid = None
        for row in (existing.get("result") or []):
            if row.get("name") == db_name:
                db_uuid = row["uuid"]
        if not db_uuid:
            created = api(token, "POST", f"{API}/accounts/{account}/d1/database",
                          {"name": db_name, "location_hint": "apac"})
            if not ok(created):
                sys.exit("创建 D1 失败")
            db_uuid = created["result"]["uuid"]
        print(f"[1] D1: {db_name} = {db_uuid}")

        # 2) R2（可选：无 R2 权限或创建失败时，自动回落共享主桶 + 't<tid>/' 前缀隔离）
        bucket = None
        bl = api(token, "GET", f"{API}/accounts/{account}/r2/buckets")
        if ok(bl):
            buckets = [b["name"] for b in ((bl.get("result") or {}).get("buckets") or [])]
            bucket = f"community-uploads-{args.slug}"
            if bucket not in buckets:
                cb = api(token, "POST", f"{API}/accounts/{account}/r2/buckets", {"name": bucket})
                bucket = bucket if ok(cb) else None
            if bucket:
                print(f"[2] R2: {bucket}")
            else:
                print("[2] R2 创建失败 → 使用共享主桶前缀隔离")
        else:
            print("[2] token 无 R2 权限 → 使用共享主桶前缀隔离")

        # 3) 绑定（合并式：只带本次要加的段，Cloudflare 会保留其余配置）
        proj = api(token, "GET", f"{API}/accounts/{account}/pages/projects/{args.project}")
        if not ok(proj):
            sys.exit("读取 Pages 项目失败")
        prod = (proj["result"].get("deployment_configs") or {}).get("production") or {}
        new_d1 = dict(prod.get("d1_databases") or {})
        new_d1[f"DB_{args.tenant}"] = {"id": db_uuid}
        payload = {"deployment_configs": {"production": {"d1_databases": new_d1}}}
        if bucket:
            new_r2 = dict(prod.get("r2_buckets") or {})
            new_r2[f"UPLOADS_{args.tenant}"] = {"bucket_name": bucket}
            payload["deployment_configs"]["production"]["r2_buckets"] = new_r2
        patch = api(token, "PATCH", f"{API}/accounts/{account}/pages/projects/{args.project}", payload)
        if not ok(patch):
            sys.exit("绑定失败")
        print(f"[3] 绑定: DB_{args.tenant}" + (f" + UPLOADS_{args.tenant}" if bucket else "（R2 走共享桶）") + "（还需一次发布生效）")

        # 4) 域名
        dom = api(token, "POST", f"{API}/accounts/{account}/pages/projects/{args.project}/domains",
                  {"name": args.domain})
        print(f"[4] 域名: {args.domain} -> {'OK' if ok(dom) else dom.get('errors')}")

        print("""
接下来：
  1. 发布一次仓库（让新绑定/域名生效）
  2. 域名解析生效后执行第 5 步：
     python3 scripts/provision-tenant.py --name ... --slug ... --tenant ... --domain ... --bootstrap
""")
        print(f" Super 账号：{super_name} / 初始密码：{password}（首次登录自动升级 PBKDF2）")
        return

    # ===== 第 5 步：引导数据 =====
    B = f"https://{args.domain}"
    # 探活 + 触发建表
    for i in range(30):
        try:
            with urllib.request.urlopen(B + "/api/health", timeout=8) as r:
                d = json.loads(r.read().decode())
                if d.get("success"):
                    print(f"[5a] health OK tenant={d.get('tenant')} d1={d.get('d1')}")
                    break
        except Exception:
            pass
        time.sleep(6)
    else:
        sys.exit("域名/健康检查未就绪：确认已完成发布与 DNS")

    if not d.get("d1"):
        sys.exit("该租户 D1 绑定未生效：确认已重新发布且绑定名正确（DB_%s / UPLOADS_%s）" % (args.tenant, args.tenant))

    # 查租户库 uuid（直接 SQL 写配置/账号）
    dbs = api(token, "GET", f"{API}/accounts/{account}/d1/database?per_page=50")
    db_uuid = None
    for row in (dbs.get("result") or []):
        if row.get("name") == f"community-{args.slug}":
            db_uuid = row["uuid"]
    if not db_uuid:
        sys.exit("未找到租户库")

    def q(sql):
        return api(token, "POST", f"{API}/accounts/{account}/d1/database/{db_uuid}/query", {"sql": sql})

    pass_hash = hashlib.sha256(password.encode()).hexdigest()
    now = int(time.time() * 1000)
    acc_json = json.dumps([{
        "id": f"acc-super-{args.tenant}", "name": super_name, "role": "admin-super",
        "roleName": "总维护人员", "passHash": pass_hash, "note": f"{args.name} 初始总维护",
        "status": "approved", "disabled": False, "canDelete": False,
        "appliedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }], ensure_ascii=False)
    config_json = json.dumps({"community": {
        "name": args.name, "address": "", "totalUnits": 0, "builtYear": "",
        "area": "", "propertyCompany": ""
    }}, ensure_ascii=False)

    for key, content in (("data/admin-accounts.json", acc_json), ("data/config.json", config_json)):
        v = content.replace("'", "''")
        r = q(f"INSERT INTO docs (key, value, total, updated_at) VALUES ('{key}', '{v}', {len(content)}, {now}) "
              f"ON CONFLICT (key) DO UPDATE SET value=excluded.value, total=excluded.total, updated_at=excluded.updated_at")
        print(f"[5b] {key}: {'OK' if ok(r) else r.get('errors')}")

    # 登记到主租户（t01）库存清单
    main = api(token, "GET", f"{API}/accounts/{account}/d1/database?per_page=50")
    main_uuid = None
    for row in (main.get("result") or []):
        if row.get("name") == "community-db":
            main_uuid = row["uuid"]
    if main_uuid:
        cur = api(token, "POST", f"{API}/accounts/{account}/d1/database/{main_uuid}/query",
                  {"sql": "SELECT value FROM docs WHERE key='tenants.json'"})
        rows = ((cur.get("result") or [{}])[0].get("results") or [])
        try:
            lst = json.loads(rows[0]["value"]) if rows and rows[0].get("value") else []
        except Exception:
            lst = []
        entry = {"tid": args.tenant, "name": args.name, "domains": [args.domain]}
        lst = [x for x in lst if x.get("tid") != args.tenant] + [entry]
        value = json.dumps(lst, ensure_ascii=False).replace("'", "''")
        r = api(token, "POST", f"{API}/accounts/{account}/d1/database/{main_uuid}/query",
                {"sql": f"INSERT INTO docs (key, value, total, updated_at) VALUES ('tenants.json', '{value}', {len(value)}, {now}) "
                        f"ON CONFLICT (key) DO UPDATE SET value=excluded.value, total=excluded.total, updated_at=excluded.updated_at"})
        print(f"[5c] tenants.json 登记完成（{args.tenant} {args.name}）：{'OK' if ok(r) else r.get('errors')}")

    print(f"\n✅ 完成。总维护人员账号：{super_name} / 初始密码：{password}")
    print("（60 秒内总控门户会自动出现该小区）")


if __name__ == "__main__":
    main()
