// ==========================================
// Cloudflare Pages _worker.js (社区数字化平台)
// 部署方式：放在仓库根目录，Cloudflare Pages 自动识别
// 绑定要求：
//   R2 bucket "community-uploads" (binding: UPLOADS) —— 二进制文件与旧数据源
//   D1 database (binding: DB) —— 结构化数据（可选；未绑定自动回退 R2）
// ==========================================

const API_BASE = ''; // 同域相对路径，前端无需写死域名

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

/* =====================================================================
 * 多租户（一街 N 小区）
 * 路由 = Host 头 → tid；每个 tid 拥有独立的 D1 绑定（DB / DB_tNN）与
 * R2 桶（UPLOADS / UPLOADS_tNN），数据物理隔离。
 * 默认租户 t01 = 现网主体（未匹配域名且访问主域名时均为 t01，老功能零变化）。
 * 租户清单优先读环境变量 TENANT_ROUTES（JSON 数组），否则用内置默认。
 * ===================================================================== */

const DEFAULT_TENANTS = [
  { tid: 't01', name: '美丽小区', domains: ['www.firstblade.site', 'community-platform-4ru.pages.dev', 'localhost', '127.0.0.1'] }
];
const DEFAULT_TID = 't01';
const UNKNOWN_HOST_TID = DEFAULT_TID; // 未登记域名一律回默认租户

function parseTenants(env) {
  try {
    const raw = env.TENANT_ROUTES;
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length) return arr;
    }
  } catch (e) {}
  return DEFAULT_TENANTS;
}

// 租户总表：主租户库中的 tenants.json（60 秒缓存）覆盖/合并内置默认
const _tenantCache = { at: 0, list: null };
async function tenantsList(env) {
  const now = Date.now();
  if (_tenantCache.list && now - _tenantCache.at < 60000) return _tenantCache.list;
  const merged = parseTenants(env).slice();
  try {
    if (await d1Ready(env)) {
      const text = await readDocText(env, 'tenants.json');
      const list = safeJsonParse(text, null);
      if (Array.isArray(list)) {
        for (const t of list) {
          if (!t || !t.tid) continue;
          const i = merged.findIndex(x => x.tid === t.tid);
          if (i >= 0) merged[i] = Object.assign({}, merged[i], t);
          else merged.push(t);
        }
      }
    }
  } catch (e) { /* 主表读取失败时退内置默认 */ }
  _tenantCache.at = now;
  _tenantCache.list = merged;
  return merged;
}

function resolveTenant(list, request) {
  let host = '';
  try { host = (new URL(request.url).hostname || '').toLowerCase(); } catch (e) {}
  for (const t of list) {
    const domains = Array.isArray(t.domains) ? t.domains : (t.domain ? [t.domain] : []);
    if (domains.some(d => String(d).toLowerCase() === host)) return t;
  }
  return list.find(t => t.tid === UNKNOWN_HOST_TID) || list[0];
}

// tid → 绑定名：t01 沿用 DB/UPLOADS（现网绑定），其余为 DB_tNN / UPLOADS_tNN
function dbBindingName(tid) { return tid === DEFAULT_TID ? 'DB' : 'DB_' + tid; }
function r2BindingName(tid) { return tid === DEFAULT_TID ? 'UPLOADS' : 'UPLOADS_' + tid; }

// R2 前缀隔离：未给租户建独立桶时，自动回落共享主桶 + 'tNN/' 前缀
// （键全部透明加前缀；list 返回时剥掉前缀，调用方无感知）
function prefixedR2(base, prefix) {
  if (!base) return null;
  const withPrefix = key => prefix + key;
  return {
    async get(key) { return base.get(withPrefix(key)); },
    async put(key, value, opts) { return base.put(withPrefix(key), value, opts); },
    async delete(key) { return base.delete(withPrefix(key)); },
    async head(key) { return base.head ? base.head(withPrefix(key)) : null; },
    async list(opts) {
      const o = Object.assign({}, opts || {});
      o.prefix = prefix + (o.prefix || '');
      const res = await base.list(o);
      return {
        objects: ((res && res.objects) || []).map(x => ({ key: String(x.key).slice(prefix.length) })),
        truncated: !!(res && res.truncated),
        cursor: res && res.cursor
      };
    }
  };
}

// 为本次请求构造"租户视角 env"：DB/UPLOADS 指向该租户绑定，其余字段透传
function withTenant(list, env, request) {
  const t = resolveTenant(list, request);
  const tenv = Object.create(env);
  tenv.RID = t.tid;
  tenv.TENANT_NAME = String(t.name || t.tid);
  tenv.TENANT_LIST = list;
  let db = null, uploads = null;
  try { db = env[dbBindingName(t.tid)] || null; } catch (e) { db = null; }
  try {
    uploads = env[r2BindingName(t.tid)] || null;
    if (!uploads && t.tid !== DEFAULT_TID) {
      // 允许不给租户单独建桶：回落共享主桶 + 前缀隔离
      uploads = prefixedR2(env.UPLOADS, t.tid + '/');
    }
  } catch (e) { uploads = null; }
  tenv.DB = db;
  tenv.UPLOADS = uploads;
  return tenv;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}

// ==================== 通用工具 ====================

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const ADMIN_ACCOUNTS_PATH = 'data/admin-accounts.json';

async function readAdminAccounts(env) {
  const data = await readDocJson(env, ADMIN_ACCOUNTS_PATH, []);
  return Array.isArray(data) ? data : (Array.isArray(data.accounts) ? data.accounts : []);
}

async function writeAdminAccounts(env, accounts, actor) {
  await writeDocText(env, ADMIN_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2),
    '管理员账号更新', actor || 'system');
}

// 申请类账号的状态文案（直观区分拒绝原因）
function accountLoginError(account) {
  if (account.status === 'pending') return '申请待总维护人员审批';
  if (account.status === 'rejected') return '申请未通过审批';
  if (account.disabled === true) return '该账号已被总维护人员停用';
  return null;
}


// ==================== 认证工具 ====================

function getPasswordEnvKey(role) {
  const map = {
    'admin-super': 'ADMIN_PASSWORD_ADMIN_SUPER',
    'admin-property': 'ADMIN_PASSWORD_ADMIN_PROPERTY',
    'admin-committee': 'ADMIN_PASSWORD_ADMIN_COMMITTEE',
    'admin-community': 'ADMIN_PASSWORD_ADMIN_COMMUNITY',
    'admin-dev': 'ADMIN_PASSWORD_ADMIN_DEV'
  };
  return map[role];
}

function getRoleDisplayName(role) {
  const map = {
    'admin-super': '总维护人员',
    'admin-property': '物管人员',
    'admin-committee': '业委会成员',
    'admin-community': '社区人员',
    'admin-dev': '开发者'
  };
  return map[role] || '管理员';
}

function getRolePermissions(role) {
  // 客户端侧边栏按 {view, announcements, documents, workorders, residents,
  // polls, complaints, activities, all, canEditAll...} 匹配，务必同步返回
  const perms = {
    'admin-super': {
      all: true, view: true,
      canToggleModules: true, canEditAll: true, canManageUsers: true
    },
    'admin-dev': {
      view: true,
      canToggleModules: true, canEditAll: false, canManageUsers: false
    },
    'admin-property': {
      view: true, announcements: true, documents: true, workorders: true, residents: true,
      canToggleModules: false, canEditAll: false, canManageUsers: false
    },
    'admin-committee': {
      view: true, polls: true, residents: true, complaints: true,
      canToggleModules: false, canEditAll: false, canManageUsers: false
    },
    'admin-community': {
      view: true, announcements: true, activities: true, complaints: true,
      canToggleModules: false, canEditAll: false, canManageUsers: false
    }
  };
  return perms[role] || {};
}

const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 });
    return true;
  }
  if (record.count >= 5) return false;
  record.count++;
  return true;
}

// UTF-8 安全的 base64（中文 token 载荷必需；兼容旧版 ASCII 签名做双格式校验）
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64uDecode(b64) {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

async function createToken(role, secret, extra = {}, ttlMs = 8 * 60 * 60 * 1000) {
  const payload = JSON.stringify({ role, ...extra, iat: Date.now(), exp: Date.now() + ttlMs });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return b64uEncode(payload) + '.' + sigHex;
}

async function verifyToken(token, secret) {
  try {
    const [dataB64, sigHex] = token.split('.');
    if (!dataB64 || !sigHex) return null;
    let payload;
    try { payload = JSON.parse(b64uDecode(dataB64)); }
    catch (e1) { payload = JSON.parse(atob(dataB64)); }  // 兼容旧版 ASCII token
    if (!payload) return null;
    if (Date.now() > payload.exp) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify(payload)));
    const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
    if (sigHex !== expectedHex) return null;
    return payload;
  } catch (e) { return null; }
}

// 多租户：token 必须来自当前小区（老 token 无 tid 仅默认租户兼容）
function tenantOk(env, payload) {
  if (!payload.tid) return env.RID === DEFAULT_TID; // 旧版 token 仅默认租户兼容
  return payload.tid === env.RID;
}

async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('未登录');
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload) throw new Error('登录已过期');
  if (!payload.role || payload.role === 'resident') throw new Error('无管理员权限');
  if (!tenantOk(env, payload)) throw new Error('登录与当前小区不匹配');
  return payload;
}

// ===== 业主侧鉴权（resident token：业主登录后签发的 HMAC 令牌）=====
async function verifyResidentRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('未登录业主账号');
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload || payload.role !== 'resident' || !payload.roomNo || !payload.name) throw new Error('登录已失效，请重新登录');
  if (!tenantOk(env, payload)) throw new Error('登录与当前小区不匹配');
  return payload;
}

async function readJsonFile(env, filePath, fallback) {
  const text = await readDocText(env, filePath);
  if (text === null || text === undefined) return fallback;
  const v = safeJsonParse(text, null);
  return v === null ? fallback : v;
}

async function writeJsonFile(env, filePath, data, message) {
  await writeDocJson(env, filePath, data, message);
}

/* =====================================================================
 * D1 存储层（大容量 + 强一致）
 * - 结构化数据主存 D1（docs/doc_chunks 自动分片，旧 KV 25MB / R2 单值上限解除）
 * - R2 保留为迁移只读源 + 镜像写（未绑定 DB 时 100% 走 R2 回退）
 * - 惰性导入：D1 未命中 → 读 R2 → 自动导入 D1
 * - 虚拟视图：canteen-orders / canteen-users / polls-responses 表化，
 *   对通用 /api/read|write 完全透明（旧键名读写照常工作）
 * ===================================================================== */

const D1_CHUNK = 900000; // 单 chunk 字符数（< D1 绑定参数 1MB 上限）
const D1_DOC_MIRROR_LIMIT = 20 * 1024 * 1024; // 超过 20MB 不镜像回 R2
const D1_FAIL_LIMIT = 3;

// 虚拟键（由表支撑的文档键）
const V_CANTEEN_ORDERS = 'canteen-orders.json';
const V_CANTEEN_USERS = 'canteen-users.json';
const V_CANTEEN_MENU = 'canteen-menu.json';
const DOC_META_CANTEEN_ORDERS = 'import:canteen-orders.json';
const DOC_META_CANTEEN_USERS = 'import:canteen-users.json';
const DOC_META_SOLD_INIT = 'init:canteen-sold';

const D1_STATES = new Map(); // tid → { db, ready, fails }
function hasDb(env) {
  return !!(env && env.DB && typeof env.DB.prepare === 'function');
}

function dstate(env) {
  const key = env.RID || DEFAULT_TID;
  if (!D1_STATES.has(key)) D1_STATES.set(key, { db: null, ready: false, fails: 0, p: null });
  return D1_STATES.get(key);
}

async function d1Ready(env) {
  if (!hasDb(env)) return false;
  const st = dstate(env); // 按租户隔离（含建表 promise，防止跨租户误用）
  if (st.db === env.DB && st.ready) return true;
  if (st.db === env.DB && st.fails >= D1_FAIL_LIMIT) return false;
  if (!st.p) {
    st.p = (async () => {
      await ensureSchemaD1(env.DB);
      st.db = env.DB;
      st.ready = true;
      st.fails = 0;
      return true;
    })().catch(e => {
      try { console.error('D1 初始化失败:', e && e.message); } catch (e2) {}
      st.db = env.DB;
      st.ready = false;
      st.fails += 1;
      st.p = null;
      return false;
    });
  }
  return st.p;
}

async function ensureSchemaD1(db) {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, value TEXT, total INTEGER, updated_at INTEGER, updated_by TEXT)`,
    `CREATE TABLE IF NOT EXISTS doc_chunks (key TEXT, part INTEGER, chunk TEXT, PRIMARY KEY (key, part))`,
    `CREATE TABLE IF NOT EXISTS doc_meta (key TEXT PRIMARY KEY, info TEXT, imported_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      room_no TEXT, name TEXT, area REAL DEFAULT 0,
      choice TEXT, vote_time TEXT, ip_hash TEXT, device_hash TEXT, nonce TEXT,
      prev_hash TEXT DEFAULT '',
      bucket TEXT, seq INTEGER DEFAULT 0, created_at INTEGER,
      UNIQUE (poll_id, user_id))`,
    `CREATE INDEX IF NOT EXISTS idx_votes_bucket ON votes (bucket, seq)`,
    `CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes (poll_id, seq)`,
    `CREATE TABLE IF NOT EXISTS canteen_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT, order_date TEXT, meal_type TEXT,
      status TEXT, pay_mode TEXT, total REAL DEFAULT 0,
      data TEXT, created_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS idx_co_date ON canteen_orders (created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_co_user ON canteen_orders (user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS order_packages (
      order_id TEXT, pkg_id TEXT, name TEXT, price REAL DEFAULT 0, quantity INTEGER DEFAULT 0,
      PRIMARY KEY (order_id, pkg_id))`,
    `CREATE INDEX IF NOT EXISTS idx_op_pkg ON order_packages (pkg_id)`,
    `CREATE TABLE IF NOT EXISTS canteen_balances (
      user_id TEXT PRIMARY KEY, name TEXT, room_no TEXT,
      balance REAL DEFAULT 0, updated_at INTEGER)`,
    `CREATE TABLE IF NOT EXISTS canteen_sold (
      order_date TEXT, meal_type TEXT, pkg_id TEXT,
      sold INTEGER DEFAULT 0,
      PRIMARY KEY (order_date, meal_type, pkg_id))`,
    `CREATE TABLE IF NOT EXISTS canteen_txns (
      txn_id TEXT PRIMARY KEY, user_id TEXT, name TEXT, type TEXT,
      amount REAL DEFAULT 0, order_id TEXT, note TEXT, at TEXT, created_at INTEGER)`,
    `CREATE INDEX IF NOT EXISTS idx_ctx_user ON canteen_txns (user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS canteen_penalties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT, name TEXT, order_id TEXT, reason TEXT,
      active INTEGER DEFAULT 1, revoked_by TEXT, revoked_at TEXT, at TEXT)`,
    `CREATE TABLE IF NOT EXISTS admins (
      kind TEXT, key TEXT, username TEXT,
      salt TEXT, iters INTEGER, hash TEXT, upgraded_at INTEGER,
      PRIMARY KEY (kind, key))`,
    `CREATE TABLE IF NOT EXISTS auth_fails (
      scope TEXT, key TEXT, count INTEGER DEFAULT 0, until INTEGER DEFAULT 0,
      PRIMARY KEY (scope, key))`,
    `CREATE TABLE IF NOT EXISTS usage_counters (
      scope TEXT, key TEXT, count INTEGER DEFAULT 0, reset_at INTEGER DEFAULT 0,
      PRIMARY KEY (scope, key))`
  ];
  for (const sql of ddl) {
    await db.prepare(sql).run();
  }
}

/* ---------- D1 基础访问（与 D1 官方 API 同形，node:sqlite 垫片可复用） ---------- */

async function d1All(env, sql, params) {
  const stmt = env.DB.prepare(sql).bind(...(params || []));
  const res = await stmt.all();
  return (res && res.results) ? res.results : [];
}

async function d1First(env, sql, params) {
  const stmt = env.DB.prepare(sql).bind(...(params || []));
  return await stmt.first();
}

async function d1Run(env, sql, params) {
  const stmt = env.DB.prepare(sql).bind(...(params || []));
  const res = await stmt.run();
  return res; // { success, meta: { changes, ... } }
}

/* ---------- 限流（D1 持久化；未启用 D1 时不启用） ---------- */

async function d1IsLocked(env, scope, key) {
  try {
    const row = await d1First(env,
      'SELECT count, until FROM auth_fails WHERE scope=? AND key=?', [scope, String(key)]);
    if (row && Number(row.until) > Date.now() && Number(row.count) >= 5) return true;
    return false;
  } catch (e) { return false; }
}
async function d1RecordFail(env, scope, key, windowMs) {
  const now = Date.now();
  try {
    await d1Run(env,
      `INSERT INTO auth_fails (scope, key, count, until) VALUES (?,?,1,?)
       ON CONFLICT (scope, key) DO UPDATE SET
         count = CASE WHEN until <= ? THEN 1 ELSE count + 1 END,
         until = CASE WHEN until <= ? THEN ? ELSE until END`,
      [scope, String(key), now + windowMs, now, now, now + windowMs]);
  } catch (e) {}
}
async function d1ClearFails(env, scope, key) {
  try { await d1Run(env, 'DELETE FROM auth_fails WHERE scope=? AND key=?', [scope, String(key)]); } catch (e) {}
}
// 计数限流（返回是否放行）：scope 维度的滑动窗口计数
async function d1AllowUsage(env, scope, key, max, windowMs) {
  const now = Date.now();
  try {
    const row = await d1First(env,
      'SELECT count, reset_at FROM usage_counters WHERE scope=? AND key=?', [scope, String(key)]);
    if (!row || Number(row.reset_at) <= now) {
      await d1Run(env,
        `INSERT INTO usage_counters (scope, key, count, reset_at) VALUES (?,?,1,?)
         ON CONFLICT (scope, key) DO UPDATE SET count=1, reset_at=?`,
        [scope, String(key), now + windowMs, now + windowMs]);
      return true;
    }
    if (Number(row.count) >= max) return false;
    await d1Run(env, 'UPDATE usage_counters SET count = count + 1 WHERE scope=? AND key=?', [scope, String(key)]);
    return true;
  } catch (e) { return true; } // 限流器故障不阻塞业务
}

/* ---------- PBKDF2 口令散列（管理员登录升级） ---------- */

async function pbkdf2Hash(password, saltHex, iters) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array((saltHex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iters }, keyMat, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}
// 登录成功后把口令升级为 PBKDF2（幂等；口令变更时自动覆盖）
async function upgradeAdminPassword(env, kind, key, username, password) {
  const st = dstate(env); if (!st.ready || !password) return;
  try {
    const iters = 100000;
    const salt = randomHex(16);
    const hash = await pbkdf2Hash(password, salt, iters);
    await d1Run(env,
      `INSERT INTO admins (kind, key, username, salt, iters, hash, upgraded_at) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT (kind, key) DO UPDATE SET username=excluded.username, salt=excluded.salt,
         iters=excluded.iters, hash=excluded.hash, upgraded_at=excluded.upgraded_at`,
      [kind, key, username || '', salt, iters, hash, Date.now()]);
  } catch (e) {}
}

/* ---------- 虚拟视图：投票（polls-responses/*） ---------- */

function voteLegacyObj(r) {
  return {
    pollId: r.pollId,
    residentId: r.residentId,
    roomNo: r.roomNo,
    area: typeof r.area === 'number' ? r.area : Number(r.area) || 0,
    choice: r.choice,
    voteTime: r.voteTime,
    ipHash: r.ipHash,
    deviceHash: r.deviceHash,
    nonce: r.nonce,
    prevHash: r.prevHash || ''
  };
}

async function virtualVotesRead(env, key) {
  const rows = await d1All(env,
    `SELECT poll_id, user_id, room_no, name, area, choice, vote_time, ip_hash, device_hash, nonce, prev_hash
     FROM votes WHERE bucket=? AND seq>=0 ORDER BY seq ASC, id ASC`, [key]);
  return rows.map(r => voteLegacyObj({
    pollId: r.poll_id, residentId: r.user_id, roomNo: r.room_no, area: Number(r.area) || 0,
    choice: safeJsonParse(r.choice, r.choice), voteTime: r.vote_time,
    ipHash: r.ip_hash, deviceHash: r.device_hash, nonce: r.nonce, prevHash: r.prev_hash
  }));
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch (e) { return fallback; }
}

/* ---------- 虚拟视图：食堂订单（canteen-orders.json） ---------- */

async function virtualOrdersRead(env) {
  const rows = await d1All(env,
    'SELECT data, created_at FROM canteen_orders ORDER BY created_at DESC LIMIT 2000', []);
  const orders = rows.map(r => safeJsonParse(r.data, null)).filter(Boolean);
  return JSON.stringify({
    version: '1.0',
    updatedAt: new Date().toISOString(),
    orders: orders
  });
}

function orderCreatedAtTs(o) {
  const t = Date.parse(o && (o.createdAt || o.orderDate) || '');
  return Number.isFinite(t) ? t : Date.now();
}

// 管理端整表写：按 orderId UPSERT；表内存在但本次缺失且创建时间早于 10 分钟的视为删除，
// 最近 10 分钟内新建的订单保留（防止管理员整表覆盖误删刚下的单）。
// 全部语句分批提交（90 条/批），支持万单级整表写；订单状态翻转/删除时同步回调销量表。
// 某套餐在 D1 模式下的真实已售数量：
// 以 canteen_sold 表为准（下单原子累加、取消/删除同步回调）；
// 表未初始化前回退文档 sold（保守取大值，防超卖）
async function soldCountFor(env, dateStr, mealType, pkgId, docSold) {
  const row = await d1First(env,
    'SELECT sold FROM canteen_sold WHERE order_date=? AND meal_type=? AND pkg_id=?',
    [dateStr, mealType, pkgId]);
  const fromTable = row ? (Number(row.sold) || 0) : null;
  const fromDoc = Math.max(0, Number(docSold) || 0);
  if (fromTable === null) return fromDoc;
  return Math.max(fromTable, fromDoc);
}

function stmtChunks(stmts, size) {
  const out = [];
  for (let i = 0; i < stmts.length; i += size) out.push(stmts.slice(i, i + size));
  return out;
}

async function virtualOrdersWrite(env, payload) {
  const orders = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.orders) ? payload.orders : []);
  if (!orders.length) return true;
  const now = Date.now();
  const cutoff = now - 10 * 60 * 1000;
  const valid = [];
  const incomingIds = [];
  for (const o of orders) {
    if (!o || typeof o !== 'object') continue;
    const orderId = String(o.orderId || '').slice(0, 64);
    if (!orderId) continue;
    incomingIds.push(orderId);
    valid.push(o);
  }
  if (!valid.length) return true;

  // 批量 IN 查询旧状态与旧套餐行（销量回调需要）
  const oldStatus = {};
  const oldPkgs = {};
  const qChunks = [];
  for (let i = 0; i < incomingIds.length; i += 80) qChunks.push(incomingIds.slice(i, i + 80));
  for (const ch of qChunks) {
    const marks = ch.map(() => '?').join(',');
    try {
      const st = await d1All(env, 'SELECT order_id, status FROM canteen_orders WHERE order_id IN (' + marks + ')', ch);
      for (const r of st) oldStatus[r.order_id] = r.status;
      const pk = await d1All(env, 'SELECT order_id, pkg_id, quantity FROM order_packages WHERE order_id IN (' + marks + ')', ch);
      for (const r of pk) {
        if (!oldPkgs[r.order_id]) oldPkgs[r.order_id] = {};
        oldPkgs[r.order_id][r.pkg_id] = Number(r.quantity) || 0;
      }
    } catch (e) { /* 回调失败不影响主写 */ }
  }

  const stmts = [];
  for (const o of valid) {
    const orderId = String(o.orderId || '').slice(0, 64);
    const pkgs = Array.isArray(o.packages) ? o.packages : [];
    const newStatus = String(o.status || 'pending');
    const newActive = newStatus !== 'cancelled';
    const oldActive = oldStatus[orderId] !== undefined && oldStatus[orderId] !== 'cancelled';
    // 销量差量：仅套餐合计（状态从取消<->未取消或数量变化）
    const newQty = {};
    for (const p of pkgs) {
      if (!p) continue;
      const pid = String(p.pkgId || p.id || '-').slice(0, 64);
      newQty[pid] = (newQty[pid] || 0) + (parseInt(p.quantity, 10) || 0);
    }
    const oldQty = oldPkgs[orderId] || {};
    const deltaBy = {};
    for (const pid of Object.keys(newQty)) {
      const d = (newActive ? newQty[pid] : 0) - (oldActive ? (oldQty[pid] || 0) : 0);
      if (d) deltaBy[pid] = (deltaBy[pid] || 0) + d;
    }
    for (const pid of Object.keys(oldQty)) {
      if (!(pid in newQty) && oldActive && oldQty[pid]) {
        deltaBy[pid] = (deltaBy[pid] || 0) - oldQty[pid];
      }
    }
    for (const p of pkgs) {
      if (!p) continue;
      stmts.push(env.DB.prepare(
        `INSERT INTO order_packages (order_id, pkg_id, name, price, quantity) VALUES (?,?,?,?,?)
         ON CONFLICT (order_id, pkg_id) DO UPDATE SET name=excluded.name, price=excluded.price, quantity=excluded.quantity`)
        .bind(orderId, String(p.pkgId || p.id || '').slice(0, 64) || '-', String(p.name || '').slice(0, 120),
          Number(p.price) || 0, parseInt(p.quantity, 10) || 0));
    }
    for (const pid of Object.keys(deltaBy)) {
      if (deltaBy[pid]) stmts.push(soldAdjustStmts(env, String(o.orderDate || ''), String(o.mealType || ''), pid, deltaBy[pid]));
    }
    stmts.push(env.DB.prepare(
      `INSERT INTO canteen_orders (order_id, user_id, order_date, meal_type, status, pay_mode, total, data, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT (order_id) DO UPDATE SET user_id=excluded.user_id, order_date=excluded.order_date,
         meal_type=excluded.meal_type, status=excluded.status, pay_mode=excluded.pay_mode,
         total=excluded.total, data=excluded.data`)
      .bind(orderId, String(o.userId || '').slice(0, 80), String(o.orderDate || '').slice(0, 10),
        String(o.mealType || '').slice(0, 16), newStatus.slice(0, 16),
        String(o.payMode || '').slice(0, 16), Number(o.totalAmount) || 0,
        JSON.stringify(o), orderCreatedAtTs(o)));
  }

  // 删除：不在整表里、已过保护窗口、且在本次读窗口内的旧订单（同步扣销量）
  const stored = await d1All(env, 'SELECT order_id, created_at FROM canteen_orders', []);
  const incomingSet = new Set(incomingIds);
  const incomingMinTs = valid.length ? Math.min.apply(null, valid.map(orderCreatedAtTs)) : Infinity;
  const toDelete = [];
  for (const row of stored) {
    if (!incomingSet.has(row.order_id) && Number(row.created_at) < cutoff &&
        Number(row.created_at) >= incomingMinTs) {
      toDelete.push(row.order_id);
    }
  }
  const delChunks = [];
  for (let i = 0; i < toDelete.length; i += 80) delChunks.push(toDelete.slice(i, i + 80));
  for (const ch of delChunks) {
    const marks = ch.map(() => '?').join(',');
    try {
      const pk = await d1All(env,
        `SELECT o.order_date AS od, o.meal_type AS mt, o.status AS st, op.pkg_id AS pid, op.quantity AS q
         FROM order_packages op JOIN canteen_orders o ON o.order_id = op.order_id
         WHERE o.order_id IN (` + marks + ')', ch);
      for (const r of pk) {
        if (r.st !== 'cancelled' && (Number(r.q) || 0) > 0) {
          stmts.push(soldAdjustStmts(env, r.od, r.mt, r.pid, -(Number(r.q) || 0)));
        }
      }
    } catch (e) { /* 尽力而为：历史取消不影响库存守卫主链路 */ }
  }
  for (const ch of delChunks) {
    const marks = ch.map(() => '?').join(',');
    stmts.push(env.DB.prepare('DELETE FROM order_packages WHERE order_id IN (' + marks + ')').bind(...ch));
    stmts.push(env.DB.prepare('DELETE FROM canteen_orders WHERE order_id IN (' + marks + ')').bind(...ch));
  }

  for (const batch of stmtChunks(stmts, 90)) {
    try { await env.DB.batch(batch); }
    catch (e) { for (const st of batch) { try { await st.run(); } catch (e2) {} } }
  }
  return true;
}

// sold 增减（+qty / -qty，下限 0）
function soldAdjustStmts(env, dateStr, mealType, pkgId, delta) {
  return env.DB.prepare(
    `INSERT INTO canteen_sold (order_date, meal_type, pkg_id, sold) VALUES (?,?,?,?)
     ON CONFLICT (order_date, meal_type, pkg_id)
     DO UPDATE SET sold = MAX(sold + ?, 0)`)
    .bind(dateStr, mealType, pkgId, delta > 0 ? delta : 0, delta);
}

// 菜单虚拟读：把 canteen_sold 表实时销量注入菜单（前端"剩余"显示实时准确，且不再每单重写菜单文档）
async function virtualMenuRead(env, baseText) {
  const menu = safeJsonParse(baseText, null);
  if (!menu || !menu.menus) return baseText;
  let soldRows = [];
  try {
    soldRows = await d1All(env, 'SELECT order_date, meal_type, pkg_id, sold FROM canteen_sold', []);
  } catch (e) { soldRows = []; }
  if (soldRows.length) {
    const map = {};
    for (const r of soldRows) {
      map[String(r.order_date) + '|' + String(r.meal_type) + '|' + String(r.pkg_id)] = Number(r.sold) || 0;
    }
    for (const dateKey of Object.keys(menu.menus)) {
      const day = menu.menus[dateKey];
      const meals = day && day.meals ? day.meals : {};
      for (const mealKey of Object.keys(meals)) {
        const pkgs = meals[mealKey] && Array.isArray(meals[mealKey].packages) ? meals[mealKey].packages : [];
        for (const pkg of pkgs) {
          if (!pkg || !pkg.id) continue;
          const k = dateKey + '|' + mealKey + '|' + String(pkg.id);
          if (Object.prototype.hasOwnProperty.call(map, k)) pkg.sold = map[k];
        }
      }
    }
  }
  return JSON.stringify(menu);
}

/* ---------- 虚拟视图：食堂账本（canteen-users.json） ---------- */

async function virtualUsersRead(env) {
  const balRows = await d1All(env,
    'SELECT user_id, name, room_no, balance, updated_at FROM canteen_balances', []);
  const penRows = await d1All(env,
    `SELECT id, user_id, name, order_id, reason, active, revoked_by, revoked_at, at
     FROM canteen_penalties ORDER BY id ASC`, []);
  const txnRows = await d1All(env,
    `SELECT txn_id, user_id, name, type, amount, order_id, note, at, created_at
     FROM canteen_txns ORDER BY created_at DESC, txn_id DESC LIMIT 300`, []);
  const balances = {};
  for (const r of balRows) {
    balances[r.user_id] = {
      userId: r.user_id, name: r.name || '', roomNo: r.room_no || '',
      balance: Math.round((Number(r.balance) || 0) * 100) / 100,
      updatedAt: r.updated_at ? new Date(Number(r.updated_at)).toISOString() : undefined
    };
  }
  const penalties = penRows.map(r => ({
    userId: r.user_id, name: r.name || '', orderId: r.order_id || null,
    reason: r.reason || '', at: r.at || new Date().toISOString(),
    active: !!Number(r.active), revokedBy: r.revoked_by || null, revokedAt: r.revoked_at || null
  }));
  const transactions = txnRows.map(r => ({
    txnId: r.txn_id, userId: r.user_id, name: r.name || '', type: r.type || 'adjust',
    amount: Math.round((Number(r.amount) || 0) * 100) / 100, orderId: r.order_id || null,
    note: r.note || '', at: r.at || new Date().toISOString()
  }));
  return JSON.stringify({
    version: '1.0', updatedAt: new Date().toISOString(),
    balances: balances, penalties: penalties, transactions: transactions
  });
}

async function virtualUsersWrite(env, payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const stmts = [];
  const balances = p.balances && typeof p.balances === 'object' ? p.balances : {};
  for (const uid of Object.keys(balances)) {
    const r = balances[uid] || {};
    if (typeof r.balance !== 'number') continue;
    stmts.push(env.DB.prepare(
      `INSERT INTO canteen_balances (user_id, name, room_no, balance, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT (user_id) DO UPDATE SET name=excluded.name, room_no=excluded.room_no,
         balance=excluded.balance, updated_at=excluded.updated_at`)
      .bind(uid, String(r.name || '').slice(0, 60), String(r.roomNo || '').slice(0, 60),
        Math.round(r.balance * 100) / 100, Date.parse(r.updatedAt || '') || Date.now()));
  }
  if (Array.isArray(p.penalties)) {
    stmts.push(env.DB.prepare('DELETE FROM canteen_penalties').bind());
    for (const pen of p.penalties) {
      if (!pen || !pen.userId) continue;
      stmts.push(env.DB.prepare(
        `INSERT INTO canteen_penalties (user_id, name, order_id, reason, active, revoked_by, revoked_at, at)
         VALUES (?,?,?,?,?,?,?,?)`)
        .bind(String(pen.userId).slice(0, 80), String(pen.name || '').slice(0, 60),
          pen.orderId ? String(pen.orderId).slice(0, 64) : null,
          String(pen.reason || '').slice(0, 160),
          pen.active ? 1 : 0, pen.revokedBy || null, pen.revokedAt || null,
          pen.at || new Date().toISOString()));
    }
  }
  if (Array.isArray(p.transactions)) {
    for (const t of p.transactions) {
      if (!t || !t.txnId) continue;
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO canteen_txns (txn_id, user_id, name, type, amount, order_id, note, at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(String(t.txnId).slice(0, 64), String(t.userId || '').slice(0, 80), String(t.name || '').slice(0, 60),
          String(t.type || 'adjust').slice(0, 16), Number(t.amount) || 0,
          t.orderId ? String(t.orderId).slice(0, 64) : null,
          String(t.note || '').slice(0, 160), t.at || new Date().toISOString(), Date.parse(t.at || '') || Date.now()));
    }
  }
  for (const batch of stmtChunks(stmts, 90)) {
    try { await env.DB.batch(batch); }
    catch (e) { for (const st of batch) { try { await st.run(); } catch (e2) {} } }
  }
  return true;
}

/* ---------- 文档读写核心（D1 + R2 桥接） ---------- */

async function r2GetText(env, key) {
  try {
    const obj = await env.UPLOADS.get(key);
    if (!obj) return null;
    return await obj.text();
  } catch (e) { return null; }
}

async function d1WriteDocChunks(env, key, text) {
  const now = Date.now();
  if (text.length <= D1_CHUNK) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM doc_chunks WHERE key=?').bind(key),
      env.DB.prepare(
        `INSERT INTO docs (key, value, total, updated_at) VALUES (?,?,?,?)
         ON CONFLICT (key) DO UPDATE SET value=excluded.value, total=excluded.total, updated_at=excluded.updated_at`)
        .bind(key, text, text.length, now)
    ]);
    return;
  }
  const parts = [];
  for (let i = 0; i * D1_CHUNK < text.length; i++) {
    parts.push(text.slice(i * D1_CHUNK, (i + 1) * D1_CHUNK));
  }
  const stmts = [
    env.DB.prepare('DELETE FROM doc_chunks WHERE key=?').bind(key),
    env.DB.prepare('UPDATE docs SET value=NULL, total=?, updated_at=? WHERE key=?').bind(text.length, now, key)
  ];
  let i = 0;
  for (const chunk of parts) {
    stmts.push(env.DB.prepare(
      `INSERT INTO doc_chunks (key, part, chunk) VALUES (?,?,?)
       ON CONFLICT (key, part) DO UPDATE SET chunk=excluded.chunk`).bind(key, i, chunk));
    i += 1;
    if (stmts.length >= 90) { // D1 单批次语句数量限制内
      await env.DB.batch(stmts);
      stmts.length = 0;
    }
  }
  stmts.push(env.DB.prepare(
    `INSERT INTO docs (key, value, total, updated_at) VALUES (?,NULL,?,?)
     ON CONFLICT (key) DO UPDATE SET value=NULL, total=excluded.total, updated_at=excluded.updated_at`)
    .bind(key, text.length, now));
  await env.DB.batch(stmts);
}

async function d1ReadDocText(env, key) {
  const row = await d1First(env, 'SELECT value, total FROM docs WHERE key=?', [key]);
  if (!row) return null;
  if (row.value !== null && row.value !== undefined) return String(row.value);
  const parts = await d1All(env, 'SELECT part, chunk FROM doc_chunks WHERE key=? ORDER BY part ASC', [key]);
  if (!parts.length) return null;
  return parts.map(p => String(p.chunk)).join('');
}

async function d1ImportDoc(env, key, text) {
  try {
    if (await d1First(env, 'SELECT key FROM docs WHERE key=?', [key])) return;
    await d1WriteDocChunks(env, key, text);
  } catch (e) { /* 导入失败不阻塞读路径 */ }
}

async function readDocText(env, key) {
  if (await d1Ready(env)) {
    try {
      if (key === V_CANTEEN_ORDERS) return await virtualOrdersRead(env);
      if (key === V_CANTEEN_USERS) return await virtualUsersRead(env);
      if (key.startsWith('polls-responses/')) return JSON.stringify(await virtualVotesRead(env, key));
      if (key === V_CANTEEN_MENU) {
        let base = await d1ReadDocText(env, key);
        if (base === null) {
          const legacy = await r2GetText(env, key);
          if (legacy !== null) {
            await d1ImportDoc(env, key, legacy);
            base = legacy;
          }
        }
        if (base === null) return null;
        return await virtualMenuRead(env, base);
      }
      const text = await d1ReadDocText(env, key);
      if (text !== null) return text;
      const legacy = await r2GetText(env, key);
      if (legacy !== null) {
        await d1ImportDoc(env, key, legacy);
        return legacy;
      }
      return null;
    } catch (e) {
      // D1 故障时降级 R2
      return await r2GetText(env, key);
    }
  }
  return await r2GetText(env, key);
}

// D1 未启用时 conventional 写（老逻辑）
async function r2PutJson(env, key, text, message) {
  await env.UPLOADS.put(key, text, {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache, no-store, must-revalidate' },
    customMetadata: { updatedAt: new Date().toISOString(), message: message || '' }
  });
}

async function writeDocText(env, key, text, message, by) {
  if (await d1Ready(env)) {
    try {
      if (key === V_CANTEEN_ORDERS) {
        await virtualOrdersWrite(env, safeJsonParse(text, null));
        return;
      }
      if (key === V_CANTEEN_USERS) {
        await virtualUsersWrite(env, safeJsonParse(text, null));
        return;
      }
      if (key.startsWith('polls-responses/')) {
        throw new Error('投票数据由 /api/vote 接口写入');
      }
      // 先惰性导入（防止覆盖未导入的 R2 内容），再写入
      if (null === await d1ReadDocText(env, key)) {
        const legacy = await r2GetText(env, key);
        if (legacy !== null) await d1ImportDoc(env, key, legacy);
      }
      await d1WriteDocChunks(env, key, text);
      if (text.length <= D1_DOC_MIRROR_LIMIT) {
        try { await r2PutJson(env, key, text, message); } catch (e2) { /* 镜像失败不影响主存 */ }
      }
      return;
    } catch (e) {
      if (String(e && e.message).indexOf('/api/vote') >= 0) throw e;
      // D1 故障降级 R2
      await r2PutJson(env, key, text, message);
      return;
    }
  }
  await r2PutJson(env, key, text, message);
}

async function deleteDocText(env, key) {
  if (await d1Ready(env)) {
    try {
      if (key === V_CANTEEN_ORDERS) {
        await d1Run(env, 'DELETE FROM order_packages', []);
        await d1Run(env, 'DELETE FROM canteen_orders', []);
        return;
      }
      if (key === V_CANTEEN_USERS) {
        await d1Run(env, 'DELETE FROM canteen_txns', []);
        await d1Run(env, 'DELETE FROM canteen_penalties', []);
        await d1Run(env, 'DELETE FROM canteen_balances', []);
        return;
      }
      if (key.startsWith('polls-responses/')) {
        await d1Run(env, 'DELETE FROM votes WHERE bucket=?', [key]);
        return;
      }
      await d1Run(env, 'DELETE FROM doc_chunks WHERE key=?', [key]);
      await d1Run(env, 'DELETE FROM docs WHERE key=?', [key]);
    } catch (e) { /* 降级 */ }
  }
  try { await env.UPLOADS.delete(key); } catch (e) {}
}

// JSON 便捷封装（全站统一入口）
async function readDocJson(env, key, fallback) {
  const text = await readDocText(env, key);
  if (text === null || text === undefined) return fallback;
  const v = safeJsonParse(text, null);
  return v === null ? fallback : v;
}

async function writeDocJson(env, key, data, message) {
  await writeDocText(env, key, JSON.stringify(data, null, 2), message);
}

/* ---------- D1 导入（/api/setup 调用） ---------- */

async function r2ListKeys(env, prefix) {
  const keys = [];
  let cursor;
  try {
    for (let i = 0; i < 40; i++) {
      const opts = { prefix: prefix };
      if (cursor) opts.cursor = cursor;
      const res = await env.UPLOADS.list(opts);
      if (!res || !res.objects) break;
      for (const o of res.objects) keys.push(o.key);
      if (!res.truncated || !res.cursor) break;
      cursor = res.cursor;
    }
  } catch (e) {}
  return keys;
}

async function d1ImportVotes(env) {
  const keys = await r2ListKeys(env, 'polls-responses/');
  let imported = 0, skipped = 0, dup = 0, rows = 0;
  keys.sort();
  for (const key of keys) {
    const done = await d1First(env, 'SELECT imported_at FROM doc_meta WHERE key=?', ['votefile:' + key]);
    if (done) { skipped += 1; continue; }
    const text = await r2GetText(env, key);
    const arr = safeJsonParse(text, null);
    if (!Array.isArray(arr)) {
      await d1Run(env, 'INSERT OR REPLACE INTO doc_meta (key, info, imported_at) VALUES (?,?,?)',
        ['votefile:' + key, 'not-array', Date.now()]);
      continue;
    }
    const stmts = [];
    for (const r of arr) {
      if (!r || !r.pollId) continue;
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO votes
           (poll_id, user_id, room_no, name, area, choice, vote_time, ip_hash, device_hash, nonce, prev_hash, bucket, seq, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(String(r.pollId).slice(0, 80), String(r.residentId || r.userId || '').slice(0, 80),
          String(r.roomNo || '').slice(0, 60), String(r.name || '').slice(0, 60),
          Number(r.area) || 0, JSON.stringify(r.choice === undefined ? null : r.choice),
          String(r.voteTime || new Date().toISOString()).slice(0, 40),
          String(r.ipHash || '').slice(0, 80), String(r.deviceHash || '').slice(0, 80),
          String(r.nonce || '').slice(0, 80), String(r.prevHash || '').slice(0, 80),
          key, Number(r.seq) || 0, Date.parse(r.voteTime || '') || Date.now()));
    }
    for (const batch of stmtChunks(stmts, 90)) {
      try {
        const results = await env.DB.batch(batch);
        for (const rr of results) { rows += 1; if (rr && rr.meta && rr.meta.changes === 0) dup += 1; }
      } catch (e) {
        for (const st of batch) { try { await st.run(); rows += 1; } catch (e2) { dup += 1; } }
      }
    }
    await d1Run(env, 'INSERT OR REPLACE INTO doc_meta (key, info, imported_at) VALUES (?,?,?)',
      ['votefile:' + key, JSON.stringify({ count: arr.length }), Date.now()]);
    imported += 1;
  }
  return { files: keys.length, imported, skipped, dup, rows };
}

async function d1BackfillCanteen(env) {
  const done = await d1First(env, 'SELECT imported_at FROM doc_meta WHERE key=?', [DOC_META_CANTEEN_ORDERS]);
  if (done) return { skipped: true };
  // 订单 + 套餐行
  const ordersDoc = await r2GetText(env, 'canteen-orders.json');
  let orders = [];
  if (ordersDoc) {
    const parsed = safeJsonParse(ordersDoc, null);
    orders = parsed && Array.isArray(parsed.orders) ? parsed.orders : (Array.isArray(parsed) ? parsed : []);
  }
  let orderCount = 0;
  const stmts = [];
  for (const o of orders.slice(0, 5000)) {
    if (!o || !o.orderId) continue;
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO canteen_orders (order_id, user_id, order_date, meal_type, status, pay_mode, total, data, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(String(o.orderId).slice(0, 64), String(o.userId || '').slice(0, 80),
        String(o.orderDate || '').slice(0, 10), String(o.mealType || '').slice(0, 16),
        String(o.status || 'pending').slice(0, 16), String(o.payMode || '').slice(0, 16),
        Number(o.totalAmount) || 0, JSON.stringify(o),
        Number.isFinite(Date.parse(o.createdAt || '')) ? Date.parse(o.createdAt) : Date.now()));
    for (const p of (Array.isArray(o.packages) ? o.packages : [])) {
      if (!p) continue;
      stmts.push(env.DB.prepare(
        'INSERT OR IGNORE INTO order_packages (order_id, pkg_id, name, price, quantity) VALUES (?,?,?,?,?)')
        .bind(String(o.orderId).slice(0, 64), String(p.pkgId || p.id || '-').slice(0, 64),
          String(p.name || '').slice(0, 120), Number(p.price) || 0, parseInt(p.quantity, 10) || 0));
    }
    orderCount += 1;
  }
  for (const batch of stmtChunks(stmts, 90)) {
    try { await env.DB.batch(batch); }
    catch (e) { for (const st of batch) { try { await st.run(); } catch (e2) {} } }
  }
  // 账本
  const usersDoc = await r2GetText(env, 'canteen-users.json');
  let balCount = 0, penCount = 0, txnCount = 0;
  if (usersDoc) {
    const u = safeJsonParse(usersDoc, null) || {};
    const stmtsU = [];
    for (const uid of Object.keys(u.balances || {})) {
      const r = u.balances[uid] || {};
      if (typeof r.balance !== 'number') continue;
      balCount += 1;
      stmtsU.push(env.DB.prepare(
        'INSERT OR IGNORE INTO canteen_balances (user_id, name, room_no, balance, updated_at) VALUES (?,?,?,?,?)')
        .bind(uid, String(r.name || '').slice(0, 60), String(r.roomNo || '').slice(0, 60),
          r.balance, Date.parse(r.updatedAt || '') || Date.now()));
    }
    for (const pen of (Array.isArray(u.penalties) ? u.penalties : [])) {
      if (!pen || !pen.userId) continue;
      penCount += 1;
      stmtsU.push(env.DB.prepare(
        `INSERT INTO canteen_penalties (user_id, name, order_id, reason, active, revoked_by, revoked_at, at)
         VALUES (?,?,?,?,?,?,?,?)`)
        .bind(String(pen.userId).slice(0, 80), String(pen.name || '').slice(0, 60), pen.orderId || null,
          String(pen.reason || '').slice(0, 160), pen.active ? 1 : 0, pen.revokedBy || null,
          pen.revokedAt || null, pen.at || new Date().toISOString()));
    }
    for (const t of (Array.isArray(u.transactions) ? u.transactions : [])) {
      if (!t || !t.txnId) continue;
      txnCount += 1;
      stmtsU.push(env.DB.prepare(
        `INSERT OR IGNORE INTO canteen_txns (txn_id, user_id, name, type, amount, order_id, note, at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`)
        .bind(String(t.txnId).slice(0, 64), String(t.userId || '').slice(0, 80), String(t.name || '').slice(0, 60),
          String(t.type || 'adjust').slice(0, 16), Number(t.amount) || 0, t.orderId || null,
          String(t.note || '').slice(0, 160), t.at || new Date().toISOString(),
          Date.parse(t.at || '') || Date.now()));
    }
    for (const batch of stmtChunks(stmtsU, 90)) {
      try { await env.DB.batch(batch); }
      catch (e) { for (const st of batch) { try { await st.run(); } catch (e2) {} } }
    }
  }
  await d1Run(env, 'INSERT OR REPLACE INTO doc_meta (key, info, imported_at) VALUES (?,?,?)',
    [DOC_META_CANTEEN_ORDERS, JSON.stringify({ orders: orderCount }), Date.now()]);
  await d1Run(env, 'INSERT OR REPLACE INTO doc_meta (key, info, imported_at) VALUES (?,?,?)',
    [DOC_META_CANTEEN_USERS, JSON.stringify({ balances: balCount }), Date.now()]);
  return { skipped: false, orders: orderCount, balances: balCount, penalties: penCount, transactions: txnCount };
}

// 销量表聚合初始化（一次性）：以订单表真实聚合为准；幂等
async function d1InitSoldAggregate(env) {
  const done = await d1First(env, 'SELECT imported_at FROM doc_meta WHERE key=?', [DOC_META_SOLD_INIT]);
  if (done) return { skipped: true };
  const cnt = await d1First(env,
    `WITH agg AS (
       SELECT o.order_date AS od, o.meal_type AS mt, op.pkg_id AS pid, SUM(op.quantity) AS q
       FROM order_packages op JOIN canteen_orders o ON o.order_id = op.order_id
       WHERE o.status != 'cancelled'
       GROUP BY o.order_date, o.meal_type, op.pkg_id)
     SELECT COUNT(*) AS c FROM agg`, []);
  const total = cnt ? (Number(cnt.c) || 0) : 0;
  if (!total) return { skipped: false, groups: 0 };
  await d1Run(env,
    `INSERT INTO canteen_sold (order_date, meal_type, pkg_id, sold)
     SELECT o.order_date, o.meal_type, op.pkg_id, SUM(op.quantity)
     FROM order_packages op JOIN canteen_orders o ON o.order_id = op.order_id
     WHERE o.status != 'cancelled'
     GROUP BY o.order_date, o.meal_type, op.pkg_id
     ON CONFLICT (order_date, meal_type, pkg_id) DO UPDATE SET sold = excluded.sold`, []);
  await d1Run(env, 'INSERT OR REPLACE INTO doc_meta (key, info, imported_at) VALUES (?,?,?)',
    [DOC_META_SOLD_INIT, JSON.stringify({ groups: total }), Date.now()]);
  return { skipped: false, groups: total };
}

async function handleSetup(request, env) {
  let admin;
  try { admin = await requireAuth(request, env); }
  catch (e) { return jsonResponse({ success: false, error: '需要管理员权限' }, 401); }
  const isD1 = await d1Ready(env);
  if (!isD1) {
    return jsonResponse({ success: false, error: 'D1 未绑定或不可用（将在未启用 D1 的部署上运行迁移前检查）' }, 400,
      { 'X-D1': 'off' });
  }
  const votesImport = await d1ImportVotes(env);
  const canteenBackfill = await d1BackfillCanteen(env);

  let soldInit = { skipped: true };
  if (canteenBackfill.skipped) soldInit = await d1InitSoldAggregate(env);
  else {
    // 全新导入路径：订单已进表 → 一次性聚合销量
    try { soldInit = await d1InitSoldAggregate(env); } catch (e) { soldInit = { error: e.message }; }
  }

  const counts = {};
  const q = async (name, sql, params) => {
    try { const r = await d1First(env, sql, params || []); counts[name] = Number((r && Object.values(r)[0]) || 0); }
    catch (e) { counts[name] = 'ERR'; }
  };
  await q('docs', 'SELECT COUNT(*) FROM docs');
  await q('doc_chunks', 'SELECT COUNT(*) FROM doc_chunks');
  await q('votes', 'SELECT COUNT(*) FROM votes');
  await q('canteen_orders', 'SELECT COUNT(*) FROM canteen_orders');
  await q('canteen_balances', 'SELECT COUNT(*) FROM canteen_balances');
  await q('canteen_txns', 'SELECT COUNT(*) FROM canteen_txns');
  await q('canteen_penalties', 'SELECT COUNT(*) FROM canteen_penalties');
  await q('canteen_sold', 'SELECT COUNT(*) FROM canteen_sold');

  return jsonResponse({
    success: true,
    by: (admin && (admin.sub || admin.role)) || 'admin',
    storage: 'D1',
    counts: counts,
    imports: { votes: votesImport, canteen: canteenBackfill, soldInit: soldInit },
    note: 'D1 已启用并完成建表/历史导入'
  });
}

async function handleSetupStatus(request, env) {
  try { await requireAuth(request, env); }
  catch (e) { return jsonResponse({ success: false, error: '需要管理员权限' }, 401); }
  const isD1 = await d1Ready(env);
  const out = { success: true, storage: isD1 ? 'D1' : 'R2', d1: isD1 };
  if (isD1) {
    try {
      const row = await d1First(env,
        `SELECT (SELECT COUNT(*) FROM docs) AS docs,
                (SELECT COUNT(*) FROM doc_chunks) AS chunks,
                (SELECT COUNT(*) FROM votes) AS votes,
                (SELECT COUNT(*) FROM canteen_orders) AS orders,
                (SELECT COUNT(*) FROM canteen_balances) AS balances,
                (SELECT COUNT(*) FROM canteen_txns) AS txns,
                (SELECT COUNT(*) FROM canteen_sold) AS sold,
                (SELECT COUNT(*) FROM admins) AS admins`, []);
      out.counts = row;
      const markers = await d1All(env, 'SELECT key, imported_at FROM doc_meta', []);
      out.imported = markers.map(m => ({ key: m.key, at: m.imported_at }));
    } catch (e) { out.error = e.message; }
  }
  return jsonResponse(out);
}

/* ===== 食堂历史归档（仅总维护人员）：订单导出到 R2 后从 D1 删除 ===== */
async function handleCanteenArchive(request, env) {
  let user;
  try { user = await requireAuth(request, env); }
  catch (e) { return jsonResponse({ success: false, error: '需要管理员权限' }, 401); }
  if (!requireSuper(user)) return jsonResponse({ success: false, error: '仅总维护人员可操作' }, 403);
  if (!(await d1Ready(env))) return jsonResponse({ success: false, error: 'D1 未启用' }, 400);
  const body = await request.json().catch(() => ({}));
  const before = String(body.before || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    return jsonResponse({ success: false, error: '参数错误：before 需为 YYYY-MM-DD（归档该日期之前的订单）' }, 400);
  }
  const rows = await d1All(env,
    'SELECT order_id, data, order_date, status FROM canteen_orders WHERE order_date < ? ORDER BY created_at ASC', [before]);
  if (!rows.length) return jsonResponse({ success: true, archived: 0, before: before });

  // 按 ORDER_DATE 年份分组导出到 R2：canteen-archive/<年>.json（与已有归档按 orderId 去重合并）
  const byYear = {};
  for (const r of rows) {
    const order = safeJsonParse(r.data, null);
    if (!order) continue;
    const y = (String(order.orderDate || r.order_date || '').slice(0, 4)) || 'unknown';
    (byYear[y] = byYear[y] || []).push(order);
  }
  const years = [];
  for (const y of Object.keys(byYear)) {
    const key = 'canteen-archive/' + y + '.json';
    let existed = [];
    try { existed = safeJsonParse(await r2GetText(env, key), null) || []; } catch (e) {}
    let cur = Array.isArray(existed) ? existed : (Array.isArray(existed.orders) ? existed.orders : []);
    const seen = new Set(cur.map(o => o && o.orderId));
    for (const o of byYear[y]) {
      if (o.orderId && !seen.has(o.orderId)) { cur.push(o); seen.add(o.orderId); }
    }
    try { await r2PutJson(env, key, JSON.stringify({ version: '1.0', year: y, count: cur.length, orders: cur }, null, 2), 'D1 历史归档 ' + before); } catch (e) {}
    years.push({ year: y, count: cur.length });
  }

  // 删除已归档订单（连带套餐行；流水账保留）
  const ids = rows.map(r => r.order_id);
  let stmts = [];
  for (let i = 0; i < ids.length; i += 80) {
    const ch = ids.slice(i, i + 80);
    const marks = ch.map(() => '?').join(',');
    stmts.push(env.DB.prepare('DELETE FROM order_packages WHERE order_id IN (' + marks + ')').bind(...ch));
    stmts.push(env.DB.prepare('DELETE FROM canteen_orders WHERE order_id IN (' + marks + ')').bind(...ch));
  }
  for (const batch of stmtChunks(stmts, 90)) {
    await env.DB.batch(batch);
  }
  return jsonResponse({ success: true, archived: rows.length, before: before, years: years, by: user.sub || user.role });
}

/* ===== 业主登录（服务端校验房号+姓名+手机后四位/身份证后四位，签发 resident token）===== */
async function handleResidentsLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) return jsonResponse({ success: false, error: '尝试过于频繁，请稍后再试' }, 429);
  const ipHash = await sha256Hex(ip);
  if (await d1IsLocked(env, 'reslogin', ipHash)) {
    return jsonResponse({ success: false, error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }
  const body = await request.json().catch(() => ({}));
  const roomNo = String(body.roomNo || '').trim();
  const name = String(body.name || '').trim();
  const phoneSuffix = String(body.phoneSuffix || '').trim();
  const idSuffix = String(body.idSuffix || '').trim();
  if (!roomNo || !name || (!phoneSuffix && !idSuffix)) return jsonResponse({ success: false, error: '请填写完整信息' }, 400);
  const candidates = ['residents.json', 'data/residents.json', 'community/residents.json'];
  let residents = null;
  for (const p of candidates) {
    const v = await readDocJson(env, p, null);
    if (Array.isArray(v) && v.length) { residents = v; break; }
  }
  if (!residents) return jsonResponse({ success: false, error: '居民数据未配置' }, 500);
  const match = residents.find(r => {
    if (String(r.roomNo) !== roomNo || String(r.name) !== name || r.status !== 'active') return false;
    if (phoneSuffix) return String(r.phoneSuffix || '') === phoneSuffix;
    // 身份证后四位（与投票页验证规则一致：优先 idCardHash，无则退化 phoneSuffix）
    if (r.idCardHash && String(r.idCardHash).length >= 4) {
      return String(r.idCardHash).slice(-4) === idSuffix;
    }
    if (r.phoneSuffix) return String(r.phoneSuffix).slice(-4) === idSuffix;
    return !r.idCardHash && !r.phoneSuffix; // 均未配置时视为匹配（测试数据兼容）
  });
  if (!match) {
    await d1RecordFail(env, 'reslogin', ipHash, 15 * 60 * 1000);
    return jsonResponse({ success: false, error: '信息不匹配，请联系物业核实' }, 401);
  }
  await d1ClearFails(env, 'reslogin', ipHash);
  const token = await createToken('resident', env.JWT_SECRET, {
    roomNo: String(match.roomNo),
    name: String(match.name),
    rid: String(match.id || ''),
    tid: env.RID
  }, 30 * 24 * 60 * 60 * 1000);
  return jsonResponse({
    success: true, token: token, name: String(match.name), roomNo: String(match.roomNo),
    rid: String(match.id || ''), area: Number(match.area) || 0
  });
}

/* ===== 食堂：业主视角数据（仅本人订单 + 余额 + 信用 + 我的流水）===== */
async function handleCanteenOwnerState(request, env) {
  let owner;
  try { owner = await verifyResidentRequest(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  const userId = 'u-' + String(owner.roomNo).trim().replace(/\s+/g, '') + '-' + String(owner.name).trim().replace(/\s+/g, '');
  const ordersData = await readJsonFile(env, 'canteen-orders.json', { orders: [] });
  const orders = (ordersData.orders || []).filter(o => o.userId === userId)
    .slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
  const usersData = await readJsonFile(env, 'canteen-users.json', { balances: {}, penalties: [], transactions: [] });
  const rec = (usersData.balances || {})[userId];
  const penalty = (usersData.penalties || []).find(p => p.userId === userId && p.active) || null;
  const transactions = (usersData.transactions || []).filter(t => t.userId === userId).slice(0, 10);
  return jsonResponse({
    success: true,
    userId: userId,
    orders: orders,
    balance: rec && typeof rec.balance === 'number' ? rec.balance : 0,
    penalty: penalty,
    transactions: transactions
  });
}

/* ===== 食堂：业主下单（服务端定价/库存/扣款，防止前端篡改）===== */
function canteenDeadline(dateStr, mealType) {
  const d = new Date(dateStr + 'T00:00:00');
  if (mealType === 'breakfast') { d.setDate(d.getDate() - 1); d.setHours(20, 0, 0, 0); }
  else if (mealType === 'lunch') { d.setDate(d.getDate() - 1); d.setHours(22, 0, 0, 0); }
  else if (mealType === 'dinner') { d.setHours(10, 0, 0, 0); }
  else { d.setHours(12, 0, 0, 0); }
  return d;
}
async function handleCanteenOrder(request, env) {
  let owner;
  try { owner = await verifyResidentRequest(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  const body = await request.json().catch(() => ({}));
  const dateStr = String(body.orderDate || '');
  const mealType = String(body.mealType || '');
  const userId = 'u-' + String(owner.roomNo).trim().replace(/\s+/g, '') + '-' + String(owner.name).trim().replace(/\s+/g, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !['breakfast', 'lunch', 'dinner'].includes(mealType)) {
    return jsonResponse({ success: false, error: '参数错误' }, 400);
  }
  if (!Array.isArray(body.packages) || !body.packages.length) return jsonResponse({ success: false, error: '购物车为空' }, 400);
  if (Date.now() > canteenDeadline(dateStr, mealType).getTime()) {
    return jsonResponse({ success: false, error: '该餐别已截止预订' }, 400);
  }
  // ===== D1 模式：表化订单 + 数据库级库存守卫 + 余额原子扣款 =====
  if (await d1Ready(env)) {
    return await handleCanteenOrderD1(request, env, owner, body, dateStr, mealType, userId);
  }
  // 读取数据（订单 / 菜单 / 账本）
  const ordersData = await readJsonFile(env, 'canteen-orders.json', { orders: [] });
  if (!Array.isArray(ordersData.orders)) ordersData.orders = [];
  const menu = await readJsonFile(env, 'canteen-menu.json', { menus: {} });
  if (!menu.menus) menu.menus = {};
  const usersData = await readJsonFile(env, 'canteen-users.json', { balances: {}, penalties: [], transactions: [] });
  if (!usersData.balances) usersData.balances = {};
  if (!Array.isArray(usersData.penalties)) usersData.penalties = [];
  if (!Array.isArray(usersData.transactions)) usersData.transactions = [];
  const penalty = usersData.penalties.find(p => p.userId === userId && p.active);
  if (penalty) return jsonResponse({ success: false, error: '您的订餐资格已停用（' + (penalty.reason || '爽约') + '），请联系食堂管理员解除' }, 403);
  // 菜单校验 + 服务端重新计价 + 库存扣减
  const day = menu.menus[dateStr];
  const meal = day && day.meals ? day.meals[mealType] : null;
  if (!meal || !meal.packages) return jsonResponse({ success: false, error: '该日期暂无菜单' }, 400);
  const packArr = [];
  let totalAmount = 0;
  for (const it of body.packages) {
    const pkg = meal.packages.find(p => p.id === it.pkgId);
    if (!pkg) return jsonResponse({ success: false, error: '套餐已下架：' + (it.pkgId || '') }, 400);
    const qty = parseInt(it.quantity, 10);
    if (!qty || qty <= 0) return jsonResponse({ success: false, error: '份数无效' }, 400);
    const remaining = (pkg.stock === -1 || pkg.stock === null || pkg.stock === undefined) ? Infinity : (pkg.stock || 0) - (pkg.sold || 0);
    if (qty > remaining) return jsonResponse({ success: false, error: '订购未成功：「' + pkg.name + '」库存不足，当前仅可订 ' + Math.max(0, remaining) + ' 份' }, 400);
    packArr.push({ pkgId: pkg.id, name: pkg.name, price: pkg.price, quantity: qty });
    totalAmount = Math.round((totalAmount + pkg.price * qty) * 100) / 100;
    if (pkg.stock !== -1 && pkg.stock !== null && pkg.stock !== undefined) pkg.sold = (pkg.sold || 0) + qty;
  }
  // 支付方式：余额充足即扣款（服务端操作账本），否则到店付款
  let payMode = 'postpaid';
  const rec = usersData.balances[userId] ||
    (usersData.balances[userId] = { userId: userId, name: owner.name, roomNo: owner.roomNo, balance: 0, updatedAt: new Date().toISOString() });
  const cur = typeof rec.balance === 'number' ? rec.balance : 0;
  if (cur >= totalAmount && totalAmount > 0) {
    payMode = 'balance';
    rec.balance = Math.round((cur - totalAmount) * 100) / 100;
    rec.updatedAt = new Date().toISOString();
    usersData.transactions.unshift({ txnId: 'txn-' + Date.now(), userId: userId, name: owner.name, type: 'order', amount: -totalAmount, orderId: null, note: dateStr + ' 预订', at: new Date().toISOString() });
    if (usersData.transactions.length > 300) usersData.transactions.length = 300;
  }
  const order = {
    orderId: 'ord-' + Date.now(),
    userId: userId,
    payMode: payMode,
    userName: String(body.userName || owner.name).slice(0, 40),
    userPhone: String(body.userPhone || '').slice(0, 20),
    orderDate: dateStr,
    mealType: mealType,
    mealName: ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' })[mealType] || mealType,
    packages: packArr,
    peopleCount: parseInt(body.peopleCount, 10) || 1,
    pickupType: ['self', 'dinein', 'delivery'].includes(body.pickupType) ? body.pickupType : 'self',
    deliveryAddress: body.pickupType === 'delivery' ? String(body.deliveryAddress || '').slice(0, 120) : '',
    totalAmount: totalAmount,
    status: 'pending',
    remark: String(body.remark || '').slice(0, 200),
    createdAt: new Date().toISOString(),
    confirmedAt: null, cancelledAt: null, completedAt: null, cancelReason: null
  };
  ordersData.orders.unshift(order);
  if (ordersData.orders.length > 2000) ordersData.orders.length = 2000;
  ordersData.updatedAt = new Date().toISOString();
  let txn = payMode === 'balance' ? usersData.transactions[0] : null;
  if (txn) txn.orderId = order.orderId;
  // 写入：订单（失败即中止，未扣款不计账）→ 库存（尽力而为）→ 账本（失败则订单回退为到店付款，防止钱单不一致）
  try {
    await writeJsonFile(env, 'canteen-orders.json', ordersData, '业主下单 ' + order.orderId + (payMode === 'balance' ? '（余额扣款）' : '（到店付款）'));
  } catch (e) {
    return jsonResponse({ success: false, error: '下单保存失败，请重试' }, 500);
  }
  let deducted = false;
  try { await writeJsonFile(env, 'canteen-menu.json', menu, '扣减库存 ' + dateStr + ' ' + mealType); } catch (e) {}
  if (payMode === 'balance') {
    deducted = true;
    try {
      await writeJsonFile(env, 'canteen-users.json', usersData, '余额扣款 ' + order.orderId + ' ¥' + totalAmount.toFixed(2));
    } catch (e) {
      deducted = false;
      payMode = 'postpaid';
      order.payMode = 'postpaid';
      try {
        rec.balance = Math.round((rec.balance + totalAmount) * 100) / 100;
        usersData.transactions.unshift({ txnId: 'txn-' + Date.now(), userId: userId, name: owner.name, type: 'adjust', amount: totalAmount, orderId: order.orderId, note: '扣款落盘失败，系统回退', at: new Date().toISOString() });
        await writeJsonFile(env, 'canteen-users.json', usersData, '扣款落盘失败回退 ' + order.orderId);
        const od2 = ordersData.orders.find(x => x.orderId === order.orderId);
        if (od2) od2.payMode = 'postpaid';
        await writeJsonFile(env, 'canteen-orders.json', ordersData, '订单支付方式修正 ' + order.orderId);
      } catch (e2) {}
    }
  }
  return jsonResponse({ success: true, order: order, payMode: payMode, balance: typeof rec.balance === 'number' ? rec.balance : cur });
}

/* ===== D1 模式：服务端下单（订单/套餐/余额/流水原子落库）===== */
async function handleCanteenOrderD1(request, env, owner, body, dateStr, mealType, userId) {
  // 频次：同一业主单日最多 8 单
  const dayKey = userId + ':' + new Date().toISOString().slice(0, 10);
  if (!(await d1AllowUsage(env, 'canteen-order', dayKey, 8, 24 * 3600 * 1000))) {
    return jsonResponse({ success: false, error: '今日下单次数已达上限' }, 429);
  }
  // 爽约停用检查（数据库级）
  const pen = await d1First(env,
    'SELECT reason FROM canteen_penalties WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 1', [userId]);
  if (pen) {
    return jsonResponse({ success: false, error: '您的订餐资格已停用（' + (pen.reason || '爽约') + '），请联系食堂管理员解除' }, 403);
  }
  // 菜单校验 + 服务端重新计价（库存守卫用订单表聚合，不再信任文档 sold）
  const menu = await readDocJson(env, 'canteen-menu.json', { menus: {} });
  const day = menu.menus && menu.menus[dateStr];
  const meal = day && day.meals ? day.meals[mealType] : null;
  if (!meal || !meal.packages) return jsonResponse({ success: false, error: '该日期暂无菜单' }, 400);
  const packArr = [];
  let totalAmount = 0;
  for (const it of (Array.isArray(body.packages) ? body.packages : [])) {
    const pkg = meal.packages.find(p => p.id === it.pkgId);
    if (!pkg) return jsonResponse({ success: false, error: '套餐已下架：' + (it.pkgId || '') }, 400);
    const qty = parseInt(it.quantity, 10);
    if (!qty || qty <= 0 || qty > 50) return jsonResponse({ success: false, error: '份数无效' }, 400);
    const stock = (pkg.stock === -1 || pkg.stock === null || pkg.stock === undefined) ? Infinity : (pkg.stock || 0);
    const remaining = stock === Infinity ? Infinity : stock - (await soldCountFor(env, dateStr, mealType, String(pkg.id), pkg.sold));
    if (qty > remaining) {
      return jsonResponse({ success: false, error: '订购未成功：「' + pkg.name + '」库存不足，当前仅可订 ' + Math.max(0, remaining) + ' 份' }, 400);
    }
    packArr.push({ pkgId: pkg.id, name: pkg.name, price: pkg.price, quantity: qty });
    totalAmount = Math.round((totalAmount + pkg.price * qty) * 100) / 100;
  }
  if (!packArr.length) return jsonResponse({ success: false, error: '购物车为空' }, 400);

  // 余额（数据库原子扣减：WHERE balance >= ? 保证不透支）
  let balRow = await d1First(env,
    'SELECT balance, name, room_no FROM canteen_balances WHERE user_id=?', [userId]);
  if (!balRow) {
    await d1Run(env,
      'INSERT OR IGNORE INTO canteen_balances (user_id, name, room_no, balance, updated_at) VALUES (?,?,?,0,?)',
      [userId, owner.name, owner.roomNo, Date.now()]);
    balRow = { balance: 0 };
  }
  const cur = Math.round((Number(balRow.balance) || 0) * 100) / 100;
  const useBalance = cur >= totalAmount && totalAmount > 0;

  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const order = {
    orderId: 'ord-' + now + '-' + rand,
    userId: userId,
    payMode: useBalance ? 'balance' : 'postpaid',
    userName: String(body.userName || owner.name).slice(0, 40),
    userPhone: String(body.userPhone || '').slice(0, 20),
    orderDate: dateStr,
    mealType: mealType,
    mealName: ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' })[mealType] || mealType,
    packages: packArr,
    peopleCount: parseInt(body.peopleCount, 10) || 1,
    pickupType: ['self', 'dinein', 'delivery'].includes(body.pickupType) ? body.pickupType : 'self',
    deliveryAddress: body.pickupType === 'delivery' ? String(body.deliveryAddress || '').slice(0, 120) : '',
    totalAmount: totalAmount,
    status: 'pending',
    remark: String(body.remark || '').slice(0, 200),
    createdAt: new Date().toISOString(),
    confirmedAt: null, cancelledAt: null, completedAt: null, cancelReason: null
  };

  const statements = [
    env.DB.prepare(
      `INSERT INTO canteen_orders (order_id, user_id, order_date, meal_type, status, pay_mode, total, data, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(order.orderId, userId, dateStr, mealType, 'pending', order.payMode, totalAmount,
        JSON.stringify(order), now)
  ];
  for (const p of packArr) {
    statements.push(env.DB.prepare(
      'INSERT OR IGNORE INTO order_packages (order_id, pkg_id, name, price, quantity) VALUES (?,?,?,?,?)')
      .bind(order.orderId, String(p.pkgId).slice(0, 64), String(p.name).slice(0, 120),
        Number(p.price) || 0, p.quantity));
    // 实时销量原子累加（同一事务内，菜单文档不再每单重写）
    statements.push(soldAdjustStmts(env, dateStr, mealType, String(p.pkgId), p.quantity));
  }
  if (useBalance) {
    statements.push(env.DB.prepare(
      `UPDATE canteen_balances SET balance = balance - ?, updated_at = ? WHERE user_id=? AND balance >= ?`)
      .bind(totalAmount, now, userId, totalAmount));
  }
  const res = await env.DB.batch(statements);
  let deducted = useBalance;
  if (useBalance) {
    const upd = res[res.length - 1];
    const changed = upd && upd.meta && typeof upd.meta.changes === 'number' ? upd.meta.changes : 1;
    if (changed === 0) {
      // 扣款条件未满足（并发消耗）→ 回退到店付款（订单仍在，无扣款事务）
      deducted = false;
      order.payMode = 'postpaid';
      await d1Run(env, 'UPDATE canteen_orders SET pay_mode=?, data=? WHERE order_id=?',
        ['postpaid', JSON.stringify(order), order.orderId]);
    } else {
      await d1Run(env,
        `INSERT INTO canteen_txns (txn_id, user_id, name, type, amount, order_id, note, at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        ['txn-' + now + '-' + rand, userId, owner.name, 'order', -totalAmount, order.orderId,
          dateStr + ' 预订', order.createdAt, now]);
    }
  }

  // 库存显示不再重写菜单文档：前端读到的菜单由虚拟视图实时注入 canteen_sold 表数据
  const newBalance = deducted ? Math.round((cur - totalAmount) * 100) / 100 : cur;
  return jsonResponse({
    success: true,
    order: order,
    payMode: order.payMode,
    balance: newBalance
  });
}

/* ===== 阳光资金：业主实名异议（服务端附加，姓名/房号取自 token）===== */
async function handleFundsDispute(request, env) {
  let owner;
  try { owner = await verifyResidentRequest(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  const body = await request.json().catch(() => ({}));
  const content = String(body.content || '').trim().slice(0, 500);
  if (!content) return jsonResponse({ success: false, error: '请填写异议内容' }, 400);
  const data = await readJsonFile(env, 'funds-data.json', { version: '1.0', accounts: [], txns: [], contracts: [], assets: [], disputes: [], audit: [] });
  if (!Array.isArray(data.disputes)) data.disputes = [];
  data.disputes.unshift({
    disputeId: 'dsp-' + Date.now(),
    userId: 'u-' + String(owner.roomNo).trim().replace(/\s+/g, '') + '-' + String(owner.name).trim().replace(/\s+/g, ''),
    name: owner.name, roomNo: owner.roomNo,
    content: content, status: '待处理', reply: '',
    createdAt: new Date().toISOString()
  });
  if (data.disputes.length > 200) data.disputes.length = 200;
  data.updatedAt = new Date().toISOString();
  await writeDocJson(env, 'funds-data.json', data, '业主异议 ' + owner.roomNo);
  return jsonResponse({ success: true });
}

/* ===== 投票提交（D1：一人一票 + 服务端续链；业主实名 token 强制）===== */
function voteRowToLegacy(r) {
  return voteLegacyObj({
    pollId: r.poll_id, residentId: r.user_id, roomNo: r.room_no,
    area: Number(r.area) || 0,
    choice: safeJsonParse(r.choice, r.choice),
    voteTime: r.vote_time, ipHash: r.ip_hash, deviceHash: r.device_hash,
    nonce: r.nonce, prevHash: r.prev_hash
  });
}

async function handleVotePost(request, env) {
  let owner;
  try { owner = await verifyResidentRequest(request, env); }
  catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  if (!(await d1Ready(env))) {
    return jsonResponse({ success: false, error: '投票服务暂不可用，请稍后再试' }, 503);
  }
  const body = await request.json().catch(() => ({}));
  const pollId = String(body.pollId || '').trim().slice(0, 80);
  const deviceHash = String(body.deviceHash || '').slice(0, 80);
  if (!pollId) return jsonResponse({ success: false, error: '参数错误' }, 400);
  let choice = body.choice === undefined ? null : body.choice;
  try { const s = JSON.stringify(choice); if (!s || s.length > 4000) choice = s ? safeJsonParse(s, null) : null; }
  catch (e) { return jsonResponse({ success: false, error: '选项数据无效' }, 400); }

  // 服务器侧居民档案：防伪造投票权重
  const candidates = ['residents.json', 'data/residents.json', 'community/residents.json'];
  let match = null;
  for (const p of candidates) {
    const residents = await readDocJson(env, p, null);
    if (Array.isArray(residents) && residents.length) {
      match = residents.find(r => String(r.roomNo) === String(owner.roomNo) && String(r.name) === String(owner.name) &&
        (!owner.rid || String(r.id) === String(owner.rid))) || match || null;
      if (match) break;
    }
  }
  if (!match) return jsonResponse({ success: false, error: '业主身份未在居民名册中找到，请联系管理员' }, 403);
  const userId = String(match.id || owner.rid || ('u-' + String(owner.roomNo).replace(/\s+/g, '') + '-' + String(owner.name).replace(/\s+/g, ''))).slice(0, 80);

  // 投票活动校验（进行中才可投）
  const polls = await readDocJson(env, 'data/polls.json', []);
  const poll = Array.isArray(polls) ? polls.find(p => p && String(p.id) === pollId) : null;
  if (!poll) return jsonResponse({ success: false, error: '投票活动不存在' }, 404);
  if (poll.status && poll.status !== '进行中') {
    return jsonResponse({ success: false, error: '该投票已' + poll.status }, 403);
  }

  // 哈希链：以库内最后一票续链（服务端计算，客户端无法重写历史）
  const lastRow = await d1First(env,
    'SELECT * FROM votes WHERE poll_id=? ORDER BY seq DESC, id DESC LIMIT 1', [pollId]);
  let prevHash = '';
  if (lastRow) {
    prevHash = await sha256Hex(JSON.stringify(voteRowToLegacy(lastRow)));
  }
  const seqRow = await d1First(env, 'SELECT COALESCE(MAX(seq),0)+1 AS seq FROM votes WHERE poll_id=?', [pollId]);
  const seq = Number(seqRow && seqRow.seq) || 1;
  const now = new Date();
  const bucket = 'polls-responses/' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '.json';
  const nonce = Math.random().toString(36).slice(2, 12) + now.getTime().toString(36);
  const ipHash = await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');
  const voteTime = now.toISOString();
  const area = Number(match.area) || 0;

  try {
    await d1Run(env,
      `INSERT INTO votes (poll_id, user_id, room_no, name, area, choice, vote_time, ip_hash, device_hash, nonce, prev_hash, bucket, seq, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [pollId, userId, String(owner.roomNo), String(owner.name), area,
        JSON.stringify(choice), voteTime, ipHash, deviceHash, nonce, prevHash, bucket, seq, now.getTime()]);
  } catch (e) {
    return jsonResponse({ success: false, error: '您已投过票，请勿重复提交' }, 409);
  }

  const record = voteLegacyObj({
    pollId, residentId: userId, roomNo: String(owner.roomNo), area,
    choice, voteTime, ipHash, deviceHash, nonce, prevHash
  });
  return jsonResponse({ success: true, record: record, caseNo: poll.caseNo || '' });
}

// ==================== 主入口 ====================

export default {
  async fetch(request, env_raw, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ===== 静态文件直出（HTML/CSS/JS/图片等）=====
    // 多租户共享同一份前端资源，无需按租户分流
    if (!path.startsWith('/api/')) {
      return env_raw.ASSETS ? await env_raw.ASSETS.fetch(request) : fetch(request);
    }

    try {
      // 多租户：Host → 租户（主控表 60 秒缓存），DB/UPLOADS 按租户解析
      const env = withTenant(await tenantsList(env_raw), env_raw, request);

      // ===== 认证接口 =====
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      if (path === '/api/auth/verify' && request.method === 'POST') {
        return await handleVerify(request, env);
      }
      if (path === '/api/auth/logout' && request.method === 'POST') {
        return jsonResponse({ success: true });
      }
      if (path === '/api/auth/apply' && request.method === 'POST') {
        return await handleApply(request, env);
      }
      if (path === '/api/auth/login-targets' && request.method === 'GET') {
        return await handleLoginTargets(request, env);
      }

      // ===== 业主侧接口（resident token）=====
      if (path === '/api/residents/login' && request.method === 'POST') {
        return await handleResidentsLogin(request, env);
      }
      if (path === '/api/canteen/owner/state' && request.method === 'GET') {
        return await handleCanteenOwnerState(request, env);
      }
      if (path === '/api/canteen/order' && request.method === 'POST') {
        return await handleCanteenOrder(request, env);
      }
      if (path === '/api/funds/dispute' && request.method === 'POST') {
        return await handleFundsDispute(request, env);
      }

      // ===== 投票（D1：数据库级一人一票 + 服务端哈希链）=====
      if (path === '/api/vote' && request.method === 'POST') {
        return await handleVotePost(request, env);
      }

      // ===== 多租户公开信息 =====
      if (path === '/api/tenants' && request.method === 'GET') {
        const list = (env.TENANT_LIST || []).map(t => ({
          tid: t.tid, name: t.name,
          domains: Array.isArray(t.domains) ? t.domains : (t.domain ? [t.domain] : []),
          current: t.tid === env.RID
        }));
        const cur = list.find(x => x.current) || null;
        return jsonResponse({ success: true, tenants: list, current: cur });
      }
      if (path === '/api/health' && request.method === 'GET') {
        let d1on = false;
        try { d1on = await d1Ready(env); } catch (e) {}
        return jsonResponse({ success: true, tenant: env.RID, name: env.TENANT_NAME, d1: d1on });
      }

      // ===== D1 初始化 / 状态（管理员）=====
      if (path === '/api/setup' && request.method === 'POST') {
        return await handleSetup(request, env);
      }
      if (path === '/api/setup' && request.method === 'GET') {
        return await handleSetupStatus(request, env);
      }
      if (path === '/api/canteen/archive' && request.method === 'POST') {
        return await handleCanteenArchive(request, env);
      }

      // ===== 管理员账号管理（仅总维护人员）=====
      if (path === '/api/admin/accounts' && request.method === 'GET') {
        return await handleListAccounts(request, env);
      }
      if (path === '/api/admin/accounts/review' && request.method === 'POST') {
        return await handleReviewAccount(request, env);
      }
      if (path === '/api/admin/accounts/toggle' && request.method === 'POST') {
        return await handleToggleAccount(request, env);
      }

      // ===== 数据接口（通用 CRUD，读写 R2）=====
      if (path.startsWith('/api/data/')) {
        return await handleData(request, env, path);
      }

      // ===== 原有业务接口（保留不变）=====
      if (path === '/api/upload' && request.method === 'POST') {
        return await handleUpload(request, env);
      }
      if (path === '/api/batch-upload' && request.method === 'POST') {
        return await handleBatchUpload(request, env);
      }
      if (path.startsWith('/api/read/') && request.method === 'GET') {
        return await handleRead(request, env);
      }
      if (path.startsWith('/api/write/') && request.method === 'POST') {
        return await handleWrite(request, env);
      }
      if (path.startsWith('/api/delete/') && request.method === 'DELETE') {
        return await handleDelete(request, env);
      }
      if (path.startsWith('/api/image/') && request.method === 'GET') {
        return await handleImage(request, env);
      }

      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('Worker Error:', err);
      return jsonResponse({ error: err.message || 'Internal Server Error' }, 500);
    }
  }
};

// ==================== 认证接口 ====================

// 登录页下拉数据源：内置身份 + 已批准且未停用的个人账号（公开只读，不含密码等敏感信息）
async function handleLoginTargets(request, env) {
  const roles = ['admin-super', 'admin-property', 'admin-committee', 'admin-community', 'admin-dev']
    .filter(r => !!env[getPasswordEnvKey(r)])
    .map(r => ({ id: r, type: 'role', label: getRoleDisplayName(r) }));
  const accounts = await readAdminAccounts(env);
  const accts = accounts
    .filter(a => a.status === 'approved' && !a.disabled)
    .map(a => ({
      id: 'acct:' + a.id,
      type: 'account',
      label: a.name + '（' + (a.roleName || getRoleDisplayName(a.role)) + '）'
    }));
  return jsonResponse({ success: true, targets: roles.concat(accts) });
}

async function handleLogin(request, env) {
  // 新协议：用户名（姓名或身份名）+ 密码；remember=true 时签发 30 天 token
  const { username, password, remember, role, accountId } = await request.json();
  const user = String(username || '').trim();
  if ((!user && !role && !accountId) || !password) return jsonResponse({ success: false, error: '参数不完整' }, 400);
  const ttl = remember ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;

  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return jsonResponse({ success: false, error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }
  const loginIpHash = await sha256Hex(clientIP);
  if (await d1IsLocked(env, 'login', loginIpHash)) {
    return jsonResponse({ success: false, error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }
  const loginFail = async () => {
    await d1RecordFail(env, 'login', loginIpHash, 15 * 60 * 1000);
  };

  // A) 用户名登录：优先匹配个人账号姓名
  if (user) {
    const accounts = await readAdminAccounts(env);
    const acc = accounts.find(a => a.name === user);
    if (acc) {
      const blocked = accountLoginError(acc);
      if (blocked) return jsonResponse({ success: false, error: blocked }, 403);
      if (!(await verifyAccountPassword(env, acc, password))) {
        await loginFail();
        return jsonResponse({ success: false, error: '密码错误' }, 401);
      }
      await d1ClearFails(env, 'login', loginIpHash);
      const token = await createToken(acc.role, env.JWT_SECRET, { sub: acc.name, accountId: acc.id, tid: env.RID }, ttl);
      return jsonResponse({
        success: true, token, role: acc.role,
        name: acc.name || getRoleDisplayName(acc.role),
        permissions: getRolePermissions(acc.role),
        accountId: acc.id, modules: acc.modules || null, remember: !!remember
      });
    }
    // B) 用户名匹配内置身份（显示名 或 短名 或 完整 id）
    const ALIASES = {
      '总维护人员': 'admin-super', 'super': 'admin-super', 'admin-super': 'admin-super',
      '开发者': 'admin-dev', 'dev': 'admin-dev', 'admin-dev': 'admin-dev',
      '物管人员': 'admin-property', '物管': 'admin-property', 'property': 'admin-property', 'admin-property': 'admin-property',
      '业委会成员': 'admin-committee', '业委会': 'admin-committee', 'committee': 'admin-committee', 'admin-committee': 'admin-committee',
      '社区人员': 'admin-community', '社区': 'admin-community', 'community': 'admin-community', 'admin-community': 'admin-community'
    };
    const roleId = ALIASES[user];
    if (roleId) {
      if (!(await verifyBuiltinPassword(env, roleId, password))) {
        await loginFail();
        return jsonResponse({ success: false, error: '密码错误' }, 401);
      }
      await d1ClearFails(env, 'login', loginIpHash);
      const token = await createToken(roleId, env.JWT_SECRET, { tid: env.RID }, ttl);
      return jsonResponse({
        success: true, token, role: roleId, name: getRoleDisplayName(roleId),
        permissions: getRolePermissions(roleId), remember: !!remember
      });
    }
    return jsonResponse({ success: false, error: '用户名不存在或未通过审批' }, 401);
  }

  // 0) 登录页直接点名个人账号（下拉中选择 "mr li（物管人员）"）
  if (accountId) {
    const accounts0 = await readAdminAccounts(env);
    const acc0 = accounts0.find(a => a.id === accountId);
    if (!acc0) return jsonResponse({ success: false, error: '账号不存在或已被移除' }, 401);
    const blocked0 = accountLoginError(acc0);
    if (blocked0) return jsonResponse({ success: false, error: blocked0 }, 403);
    if (!(await verifyAccountPassword(env, acc0, password))) {
      await loginFail();
      return jsonResponse({ success: false, error: '密码错误' }, 401);
    }
    await d1ClearFails(env, 'login', loginIpHash);
    const token0 = await createToken(acc0.role, env.JWT_SECRET, { sub: acc0.name, accountId: acc0.id, tid: env.RID });
    return jsonResponse({
      success: true,
      token: token0,
      role: acc0.role,
      name: acc0.name || getRoleDisplayName(acc0.role),
      permissions: getRolePermissions(acc0.role),
      accountId: acc0.id,
      modules: acc0.modules || null
    });
  }

  const envKey = getPasswordEnvKey(role);
  if (!envKey) return jsonResponse({ success: false, error: '无效身份' }, 400);

  // 1) 环境变量角色密码（5 个内置身份；PBKDF2 升级存储在 admins 表）
  if (await verifyBuiltinPassword(env, role, password)) {
    await d1ClearFails(env, 'login', loginIpHash);
    const token = await createToken(role, env.JWT_SECRET, { tid: env.RID });
    return jsonResponse({
      success: true,
      token,
      role,
      name: getRoleDisplayName(role),
      permissions: getRolePermissions(role)
    });
  }

  // 2) 经审批的个人管理员账号（data/admin-accounts.json）
  const accounts = await readAdminAccounts(env);
  let matched = null;
  for (const a of accounts) {
    if (a.role === role && a.passHash && (await verifyAccountPassword(env, a, password))) {
      matched = a; break;
    }
  }
  if (matched) {
    const blocked = accountLoginError(matched);
    if (blocked) return jsonResponse({ success: false, error: blocked }, 403);
    await d1ClearFails(env, 'login', loginIpHash);
    const token = await createToken(role, env.JWT_SECRET, { sub: matched.name, accountId: matched.id, tid: env.RID });
    return jsonResponse({
      success: true,
      token,
      role,
      name: matched.name || getRoleDisplayName(role),
      permissions: getRolePermissions(role),
      accountId: matched.id,
      modules: matched.modules || null // 账号级板块开关（null = 默认全开）
    });
  }

  await loginFail();
  return jsonResponse({ success: false, error: '密码错误' }, 401);
}

// 管理员密码验证：PBKDF2（admins 表，D1）优先，sha256/明文兼容（升级窗口）
async function verifyAccountPassword(env, acc, password) {
  if (dstate(env).ready) {
    try {
      const row = await d1First(env, 'SELECT salt, iters, hash FROM admins WHERE kind=? AND key=?', ['account', String(acc.id || '')]);
      if (row) {
        const t = await pbkdf2Hash(password, String(row.salt), Number(row.iters) || 100000);
        if (t === String(row.hash)) return true;
      }
    } catch (e) { /* 降级 */ }
  }
  const direct = acc.passHash && (acc.passHash === password);
  const sha = acc.passHash && (acc.passHash === await sha256Hex(password));
  if (sha || direct) {
    if (D1_STATE.ready) {
      await upgradeAdminPassword(env, 'account', String(acc.id || ''), acc.name, password);
    }
    return true;
  }
  return false;
}

async function verifyBuiltinPassword(env, roleId, password) {
  const correct = env[getPasswordEnvKey(roleId)];
  if (!correct) return false;
  if (dstate(env).ready) {
    try {
      const row = await d1First(env, 'SELECT salt, iters, hash FROM admins WHERE kind=? AND key=?', ['builtin', roleId]);
      if (row) {
        const t = await pbkdf2Hash(password, String(row.salt), Number(row.iters) || 100000);
        if (t === String(row.hash)) return true;
      }
      if (password === correct) {
        await upgradeAdminPassword(env, 'builtin', roleId, getRoleDisplayName(roleId), password);
        return true;
      }
      return false;
    } catch (e) { /* D1 故障降级明文比对 */ }
  }
  return password === correct;
}

async function handleVerify(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ valid: false });
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload) return jsonResponse({ valid: false });

  // 个人账号：实时校验停用状态并回传最新板块开关
  if (payload.accountId) {
    const accounts = await readAdminAccounts(env);
    const acc = accounts.find(a => a.id === payload.accountId);
    if (!acc || acc.status !== 'approved' || acc.disabled === true) {
      return jsonResponse({ valid: false, error: '账号已被停用或删除' });
    }
    return jsonResponse({
      valid: true,
      role: payload.role,
      permissions: getRolePermissions(payload.role),
      modules: acc.modules || null
    });
  }

  return jsonResponse({
    valid: true,
    role: payload.role,
    permissions: getRolePermissions(payload.role)
  });
}

// ==================== 数据网关 ====================

async function handleData(request, env, path) {
  try {
    const user = await requireAuth(request, env);
    const segments = path.replace('/api/data/', '').split('/').filter(Boolean);
    const dataType = segments[0] || 'default';
    const filePath = 'data/' + dataType + '.json';

    if (request.method === 'GET') {
      const text = await readDocText(env, filePath);
      if (text === null || text === undefined) {
        if (dataType === 'module-config') {
          return jsonResponse({ success: true, data: getDefaultModuleConfig() });
        }
        return jsonResponse({ success: true, data: [] });
      }
      const v = safeJsonParse(text, null);
      return jsonResponse({ success: true, data: v });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const content = JSON.stringify(body.data || body, null, 2);
      await writeDocText(env, filePath, content, '管理员数据更新 ' + dataType, user.role);
      return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
      await deleteDocText(env, filePath);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    return jsonResponse({ error: err.message }, 401);
  }
}

function getDefaultModuleConfig() {
  return {
    modules: {
      dashboard:     { visible: true, editable: true },
      config:        { visible: true, editable: true },
      announcements: { visible: true, editable: true },
      documents:     { visible: true, editable: true },
      activities:    { visible: true, editable: true },
      residents:     { visible: true, editable: true },
      audit:         { visible: true, editable: false },
      workorders:    { visible: true, editable: true },
      complaints:    { visible: true, editable: true },
      polls:         { visible: true, editable: true },
      settings:      { visible: true, editable: false },
      'dev-modules': { visible: true, editable: false }
    }
  };
}

// ==================== 原有业务接口（保留不变）====================

// 上传白名单与上限
const MAX_UPLOAD_SIZE = 8 * 1024 * 1024; // 8MB
const UPLOAD_EXT_OK = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov'];

async function uploadAllowed(request, env, file, folder) {
  if (file.size > MAX_UPLOAD_SIZE) {
    return '文件过大（上限 8MB）';
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const typeOk = (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) ||
    UPLOAD_EXT_OK.includes(ext);
  if (!typeOk || folder === 'uploads') {
    return '不支持的文件类型';
  }
  // 限流：未登录 30 张/天；登录（业主/管理员）200 张/天
  const ipHash = await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');
  let cap = 30;
  try {
    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) {
      const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
      if (payload) cap = 200;
    }
  } catch (e) {}
  const dayKey = ipHash + ':' + new Date().toISOString().slice(0, 10);
  if (!(await d1AllowUsage(env, 'upload', dayKey, cap, 24 * 3600 * 1000))) {
    return '今日上传次数已达上限';
  }
  return null;
}

async function handleUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: '未提供文件或文件无效' }, 400);
  }

  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = safeName.split('.').pop().toLowerCase();

  let folder = 'uploads';
  if (file.type.startsWith('image/')) folder = 'images';
  else if (file.type.startsWith('video/')) folder = 'videos';
  else if (['pdf','doc','docx','xls','xlsx','csv','txt','zip'].includes(ext)) folder = 'files';

  const block = await uploadAllowed(request, env, file, folder);
  if (block) return jsonResponse({ error: block }, 403);

  const key = `${folder}/${timestamp}_${random}_${safeName}`;

  const isImage = file.type.startsWith('image/');
  const cacheControl = isImage
    ? 'public, max-age=31536000, immutable, stale-while-revalidate=86400'
    : 'public, max-age=86400';

  await env.UPLOADS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || 'application/octet-stream',
      cacheControl: cacheControl
    },
    customMetadata: {
      originalName: file.name,
      size: String(file.size),
      uploadedAt: new Date().toISOString(),
      uploaderIp: request.headers.get('CF-Connecting-IP') || 'unknown'
    }
  });

  const publicUrl = `${API_BASE}/api/image/${encodeURIComponent(key)}`;

  return jsonResponse({
    success: true,
    url: publicUrl,
    key: key,
    name: file.name,
    size: file.size,
    type: file.type,
    folder: folder
  });
}

async function handleBatchUpload(request, env) {
  const formData = await request.formData();
  const files = formData.getAll('files');

  if (!files || files.length === 0) {
    return jsonResponse({ error: '未提供文件' }, 400);
  }

  const results = [];
  const errors = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;

    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 10);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ext = safeName.split('.').pop().toLowerCase();

      let folder = 'uploads';
      if (file.type.startsWith('image/')) folder = 'images';
      else if (file.type.startsWith('video/')) folder = 'videos';
      else if (['pdf','doc','docx','xls','xlsx','csv','txt','zip'].includes(ext)) folder = 'files';

      const block = await uploadAllowed(request, env, file, folder);
      if (block) { errors.push({ name: file.name, error: block }); continue; }

      const key = `${folder}/${timestamp}_${random}_${safeName}`;
      const isImage = file.type.startsWith('image/');
      const cacheControl = isImage
        ? 'public, max-age=31536000, immutable, stale-while-revalidate=86400'
        : 'public, max-age=86400';

      await env.UPLOADS.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type || 'application/octet-stream',
          cacheControl: cacheControl
        },
        customMetadata: {
          originalName: file.name,
          size: String(file.size),
          uploadedAt: new Date().toISOString()
        }
      });

      const publicUrl = `${API_BASE}/api/image/${encodeURIComponent(key)}`;

      results.push({
        url: publicUrl,
        key: key,
        name: file.name,
        size: file.size,
        type: file.type
      });
    } catch (err) {
      errors.push({ name: file.name, error: err.message });
    }
  }

  return jsonResponse({
    success: true,
    uploaded: results,
    errors: errors,
    total: files.length,
    successCount: results.length
  });
}

async function handleRead(request, env) {
  const url = new URL(request.url);
  const filePath = decodeURIComponent(url.pathname.replace('/api/read/', ''));

  if (!filePath) {
    return new Response('[]', {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  // 读保护：敏感文件（订单含电话、账本含余额/身份）需管理员登录后读取
  const base = filePath.split('/').pop() || '';
  const ADMIN_ONLY_READ = ['canteen-orders.json', 'canteen-users.json', 'admin-accounts.json', 'accounts.json'];
  if (ADMIN_ONLY_READ.includes(base)) {
    try { await requireAuth(request, env); }
    catch (e) { return jsonResponse({ error: '该文件需管理员权限读取' }, 401); }
  }

  const text = await readDocText(env, filePath);

  if (text === null || text === undefined) {
    return jsonResponse({ error: '文件不存在' }, 404);
  }

  return new Response(text, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    }
  });
}

async function handleWrite(request, env) {
  const url = new URL(request.url);
  const filePath = decodeURIComponent(url.pathname.replace('/api/write/', ''));

  if (!filePath) {
    return jsonResponse({ error: '路径不能为空' }, 400);
  }

  // ===== 写保护（L2 安全加固）=====
  // 匿名只允许写业主提交类文件（投诉/工单/投票——路径或文件名以其开头/包含）
  const fileName = filePath.split('/').pop() || '';
  const ANON_OK = filePath.startsWith('complaints') || filePath.startsWith('workorders') ||
    filePath.startsWith('polls') || filePath.startsWith('trade') || fileName.startsWith('polls') ||
    filePath.indexOf('/complaints') >= 0 || filePath.indexOf('/workorders') >= 0 ||
    filePath.indexOf('/polls') >= 0 || filePath.indexOf('/trade') >= 0;
  let isAnonWrite = false;
  if (!ANON_OK) {
    let adminErr = null;
    try { await requireAuth(request, env); } catch (e) { adminErr = e; }
    if (adminErr) {
      // 业主 token 也不可写管理文件
      return jsonResponse({ error: '该文件需要管理员登录后才能写入' }, 401);
    }
  } else {
    isAnonWrite = true;
  }

  // ===== 投票数据保护（D1 模式：投票一律走 /api/vote，数据库级一人一票）=====
  if (await d1Ready(env)) {
    if (filePath.startsWith('polls-responses/')) {
      return jsonResponse({ error: '投票请通过投票页提交（服务端一人一票）' }, 403);
    }
    if (filePath === 'data/polls.json' && isAnonWrite) {
      return jsonResponse({ error: '投票配置为管理员数据' }, 403);
    }
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = { content: await request.text() };
  }

  const content = body.content || JSON.stringify(body);
  const message = body.message || 'update';

  // 内容大小护栏（单次写 ≤ 5MB）
  if (content.length > 5 * 1024 * 1024) {
    return jsonResponse({ error: '数据过大（超过 5MB）' }, 413);
  }

  // 匿名写限流：100 次/天/IP
  if (isAnonWrite) {
    try {
      const ipHash = await sha256Hex(request.headers.get('CF-Connecting-IP') || 'unknown');
      const dayKey = ipHash + ':' + new Date().toISOString().slice(0, 10);
      if (!(await d1AllowUsage(env, 'anon-write', dayKey, 100, 24 * 3600 * 1000))) {
        return jsonResponse({ error: '今日提交次数已达上限，请明天再试' }, 429);
      }
    } catch (e) { /* 限流器故障不阻塞 */ }
  }

  await writeDocText(env, filePath, content, message);

  return jsonResponse({
    success: true,
    path: filePath,
    message: message
  });
}

async function handleDelete(request, env) {
  const url = new URL(request.url);
  const filePath = decodeURIComponent(url.pathname.replace('/api/delete/', ''));

  // 删除操作一律需要管理员登录
  try { await requireAuth(request, env); }
  catch (e) { return jsonResponse({ error: '删除操作需要管理员权限' }, 401); }

  await deleteDocText(env, filePath);

  return jsonResponse({
    success: true,
    path: filePath,
    deleted: true
  });
}

async function handleImage(request, env) {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace('/api/image/', ''));

  const object = await env.UPLOADS.get(key);

  if (!object) {
    return new Response('Image Not Found', {
      status: 404,
      headers: CORS_HEADERS
    });
  }

  const headers = {
    ...CORS_HEADERS,
    'Content-Type': object.httpMetadata.contentType || 'image/jpeg',
    'Cache-Control': 'public, max-age=31536000, immutable, stale-while-revalidate=86400',
    'CDN-Cache-Control': 'public, max-age=31536000, immutable',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000, immutable'
  };

  if (object.httpMetadata.etag) {
    headers['ETag'] = object.httpMetadata.etag;
  }

  return new Response(object.body, { headers });
}

// ==================== 管理员申请与账号管理 ====================

const APPLY_ROLES = ['admin-property', 'admin-committee', 'admin-community'];
const applyAttempts = new Map();

async function handleApply(request, env) {
  // 申请频率限制（独立限速，避免与登录限速互相干扰）
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const rec = applyAttempts.get(ip);
  if (rec && now <= rec.resetTime && rec.count >= 3) {
    return jsonResponse({ success: false, error: '申请过于频繁，请 15 分钟后再试' }, 429);
  }
  if (rec && now <= rec.resetTime) rec.count++;
  else applyAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 });

  let body;
  try { body = await request.json(); } catch (e) { return jsonResponse({ success: false, error: '请求格式错误' }, 400); }

  const name = String(body.name || '').trim();
  const role = String(body.role || '').trim();
  const password = String(body.password || '');
  const note = String(body.note || '').trim();

  if (!APPLY_ROLES.includes(role)) return jsonResponse({ success: false, error: '申请身份无效（仅开放物管/业委会/社区）' }, 400);
  if (!name || name.length > 20) return jsonResponse({ success: false, error: '请填写姓名（20字以内）' }, 400);
  if (password.length < 6) return jsonResponse({ success: false, error: '密码需 6 位以上' }, 400);

  const accounts = await readAdminAccounts(env);
  const hash = await sha256Hex(password);
  const dup = accounts.find(a => a.role === role && a.passHash === hash);
  if (dup) return jsonResponse({ success: false, error: '该身份下已存在相同密码的账号，请更换密码或联系总维护人员' }, 409);

  accounts.push({
    id: 'acc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    name, role,
    roleName: getRoleDisplayName(role),
    passHash: hash,
    note: note.slice(0, 100),
    status: 'pending',
    disabled: false,
    canDelete: true,
    appliedAt: new Date().toISOString()
  });
  await writeAdminAccounts(env, accounts, 'apply:' + name);
  return jsonResponse({ success: true, message: '申请已提交，请等待总维护人员审批' });
}

function requireSuper(payload) {
  return payload && payload.role === 'admin-super';
}

async function handleListAccounts(request, env) {
  let user;
  try { user = await requireAuth(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  if (!requireSuper(user)) return jsonResponse({ success: false, error: '仅总维护人员可操作' }, 403);

  const accounts = await readAdminAccounts(env);
  return jsonResponse({
    success: true,
    accounts: accounts.map(a => ({
      id: a.id, name: a.name, role: a.role, roleName: a.roleName || getRoleDisplayName(a.role),
      note: a.note || '', status: a.status, disabled: !!a.disabled, canDelete: a.canDelete !== false,
      appliedAt: a.appliedAt, reviewedAt: a.reviewedAt || '', reviewedBy: a.reviewedBy || '',
      rejectedReason: a.rejectedReason || '',
      modules: a.modules || null
    }))
  });
}

async function handleReviewAccount(request, env) {
  let user;
  try { user = await requireAuth(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  if (!requireSuper(user)) return jsonResponse({ success: false, error: '仅总维护人员可操作' }, 403);

  const { id, action, reason } = await request.json();
  if (!id || !['approve', 'reject'].includes(action)) return jsonResponse({ success: false, error: '参数不完整' }, 400);

  const accounts = await readAdminAccounts(env);
  const acc = accounts.find(a => a.id === id);
  if (!acc) return jsonResponse({ success: false, error: '账号不存在' }, 404);
  if (acc.status !== 'pending') return jsonResponse({ success: false, error: '该申请已处理过' }, 409);

  acc.status = action === 'approve' ? 'approved' : 'rejected';
  acc.reviewedAt = new Date().toISOString();
  acc.reviewedBy = user.sub || user.role;
  if (action === 'reject') acc.rejectedReason = String(reason || '').slice(0, 100);
  await writeAdminAccounts(env, accounts, user.sub || user.role);
  return jsonResponse({ success: true, status: acc.status, name: acc.name });
}

async function handleToggleAccount(request, env) {
  let user;
  try { user = await requireAuth(request, env); } catch (e) { return jsonResponse({ success: false, error: e.message }, 401); }
  if (!requireSuper(user)) return jsonResponse({ success: false, error: '仅总维护人员可操作' }, 403);

  const { id, disabled, canDelete, modules } = await request.json();
  const accounts = await readAdminAccounts(env);
  const acc = accounts.find(a => a.id === id);
  if (!acc) return jsonResponse({ success: false, error: '账号不存在' }, 404);
  if (acc.status !== 'approved') return jsonResponse({ success: false, error: '仅已启用的账号可调整开关' }, 409);

  if (typeof disabled === 'boolean') acc.disabled = disabled;
  if (typeof canDelete === 'boolean') acc.canDelete = canDelete;
  // 账号级板块开关：以对象形式增量合并（{ moduleId: true/false }）
  if (modules && typeof modules === 'object' && !Array.isArray(modules)) {
    if (!acc.modules) acc.modules = {};
    for (const k of Object.keys(modules)) acc.modules[k] = !!modules[k];
  }
  await writeAdminAccounts(env, accounts, user.sub || user.role);
  return jsonResponse({ success: true, id: acc.id, disabled: acc.disabled, canDelete: acc.canDelete, modules: acc.modules || null });
}
