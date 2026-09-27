// ==========================================
// Cloudflare Pages _worker.js (社区数字化平台)
// 部署方式：放在仓库根目录，Cloudflare Pages 自动识别
// 绑定要求：R2 bucket "community-uploads" (binding: UPLOADS)
// ==========================================

const API_BASE = ''; // 同域相对路径，前端无需写死域名

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

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
  const obj = await env.UPLOADS.get(ADMIN_ACCOUNTS_PATH);
  if (!obj) return [];
  try {
    const data = JSON.parse(await obj.text());
    return Array.isArray(data) ? data : (Array.isArray(data.accounts) ? data.accounts : []);
  } catch (e) { return []; }
}

async function writeAdminAccounts(env, accounts, actor) {
  await env.UPLOADS.put(ADMIN_ACCOUNTS_PATH, JSON.stringify(accounts, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache, no-store, must-revalidate' },
    customMetadata: { updatedAt: new Date().toISOString(), updatedBy: actor || 'system' }
  });
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

async function requireAuth(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('未登录');
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload) throw new Error('登录已过期');
  if (!payload.role || payload.role === 'resident') throw new Error('无管理员权限');
  return payload;
}

// ===== 业主侧鉴权（resident token：业主登录后签发的 HMAC 令牌）=====
async function verifyResidentRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) throw new Error('未登录业主账号');
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload || payload.role !== 'resident' || !payload.roomNo || !payload.name) throw new Error('登录已失效，请重新登录');
  return payload;
}

async function readJsonFile(env, filePath, fallback) {
  try {
    const obj = await env.UPLOADS.get(filePath);
    if (!obj) return fallback;
    const txt = await obj.text();
    return txt ? JSON.parse(txt) : fallback;
  } catch (e) { return fallback; }
}

async function writeJsonFile(env, filePath, data, message) {
  await env.UPLOADS.put(filePath, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-cache, no-store, must-revalidate' },
    customMetadata: { updatedAt: new Date().toISOString(), message: message || '' }
  });
}

/* ===== 业主登录（服务端校验房号+姓名+手机后四位，签发 resident token）===== */
async function handleResidentsLogin(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(ip)) return jsonResponse({ success: false, error: '尝试过于频繁，请稍后再试' }, 429);
  const body = await request.json().catch(() => ({}));
  const roomNo = String(body.roomNo || '').trim();
  const name = String(body.name || '').trim();
  const phoneSuffix = String(body.phoneSuffix || '').trim();
  if (!roomNo || !name || !phoneSuffix) return jsonResponse({ success: false, error: '请填写完整信息' }, 400);
  const candidates = ['residents.json', 'data/residents.json', 'community/residents.json'];
  let residents = null;
  for (const p of candidates) {
    const v = await readJsonFile(env, p, null);
    if (Array.isArray(v) && v.length) { residents = v; break; }
  }
  if (!residents) return jsonResponse({ success: false, error: '居民数据未配置' }, 500);
  const match = residents.find(r => String(r.roomNo) === roomNo && String(r.name) === name &&
    String(r.phoneSuffix || '') === phoneSuffix && r.status === 'active');
  if (!match) return jsonResponse({ success: false, error: '信息不匹配，请联系物业核实' }, 401);
  const token = await createToken('resident', env.JWT_SECRET, { roomNo: String(match.roomNo), name: String(match.name) }, 30 * 24 * 60 * 60 * 1000);
  return jsonResponse({ success: true, token: token, name: String(match.name), roomNo: String(match.roomNo) });
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
  await writeJsonFile(env, 'funds-data.json', data, '业主异议 ' + owner.roomNo);
  return jsonResponse({ success: true });
}

// ==================== 主入口 ====================

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ===== 静态文件直出（HTML/CSS/JS/图片等）=====
      // Cloudflare Pages 会自动处理，这里只拦截 /api/* 请求
      if (!path.startsWith('/api/')) {
        return env.ASSETS ? await env.ASSETS.fetch(request) : fetch(request);
      }

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

  // A) 用户名登录：优先匹配个人账号姓名
  if (user) {
    const accounts = await readAdminAccounts(env);
    const acc = accounts.find(a => a.name === user);
    if (acc) {
      const blocked = accountLoginError(acc);
      if (blocked) return jsonResponse({ success: false, error: blocked }, 403);
      const hash = await sha256Hex(password);
      if (!acc.passHash || (acc.passHash !== hash && acc.passHash !== password)) {
        return jsonResponse({ success: false, error: '密码错误' }, 401);
      }
      const token = await createToken(acc.role, env.JWT_SECRET, { sub: acc.name, accountId: acc.id }, ttl);
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
      const correctPwd = env[getPasswordEnvKey(roleId)];
      if (correctPwd && password === correctPwd) {
        const token = await createToken(roleId, env.JWT_SECRET, {}, ttl);
        return jsonResponse({
          success: true, token, role: roleId, name: getRoleDisplayName(roleId),
          permissions: getRolePermissions(roleId), remember: !!remember
        });
      }
      return jsonResponse({ success: false, error: '密码错误' }, 401);
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
    const hash0 = await sha256Hex(password);
    if (!acc0.passHash || (acc0.passHash !== hash0 && acc0.passHash !== password)) {
      return jsonResponse({ success: false, error: '密码错误' }, 401);
    }
    const token0 = await createToken(acc0.role, env.JWT_SECRET, { sub: acc0.name, accountId: acc0.id });
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

  // 1) 环境变量角色密码（5 个内置身份）
  const correct = env[envKey];
  if (correct && password === correct) {
    const token = await createToken(role, env.JWT_SECRET);
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
  const hash = await sha256Hex(password);
  const acc = accounts.find(a =>
    a.role === role &&
    a.passHash && (a.passHash === hash || a.passHash === password) // 兼容早期明文
  );
  if (acc) {
    const blocked = accountLoginError(acc);
    if (blocked) return jsonResponse({ success: false, error: blocked }, 403);
    const token = await createToken(role, env.JWT_SECRET, { sub: acc.name, accountId: acc.id });
    return jsonResponse({
      success: true,
      token,
      role,
      name: acc.name || getRoleDisplayName(role),
      permissions: getRolePermissions(role),
      accountId: acc.id,
      modules: acc.modules || null // 账号级板块开关（null = 默认全开）
    });
  }

  return jsonResponse({ success: false, error: '密码错误' }, 401);
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
      const object = await env.UPLOADS.get(filePath);
      if (!object) {
        if (dataType === 'module-config') {
          return jsonResponse({ success: true, data: getDefaultModuleConfig() });
        }
        return jsonResponse({ success: true, data: [] });
      }
      const text = await object.text();
      return jsonResponse({ success: true, data: JSON.parse(text) });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const content = JSON.stringify(body.data || body, null, 2);
      await env.UPLOADS.put(filePath, content, {
        httpMetadata: {
          contentType: 'application/json',
          cacheControl: 'no-cache, no-store, must-revalidate'
        },
        customMetadata: {
          updatedAt: new Date().toISOString(),
          updatedBy: user.role
        }
      });
      return jsonResponse({ success: true });
    }

    if (request.method === 'DELETE') {
      await env.UPLOADS.delete(filePath);
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
  else if (['pdf','doc','docx','xls','xlsx','csv','txt'].includes(ext)) folder = 'files';

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

  const object = await env.UPLOADS.get(filePath);

  if (!object) {
    return jsonResponse({ error: '文件不存在' }, 404);
  }

  const text = await object.text();
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
  if (!ANON_OK) {
    let adminErr = null;
    try { await requireAuth(request, env); } catch (e) { adminErr = e; }
    if (adminErr) {
      // 业主 token 也不可写管理文件
      return jsonResponse({ error: '该文件需要管理员登录后才能写入' }, 401);
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

  await env.UPLOADS.put(filePath, content, {
    httpMetadata: {
      contentType: 'application/json',
      cacheControl: 'no-cache, no-store, must-revalidate'
    },
    customMetadata: {
      updatedAt: new Date().toISOString(),
      message: message
    }
  });

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

  await env.UPLOADS.delete(filePath);

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
