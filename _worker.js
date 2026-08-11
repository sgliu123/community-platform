// ==========================================
// Pages _worker.js (community.firstblade.site)
// 适配现有绑定：R2 bucket "community-uploads" (binding: UPLOADS)
// 新增：认证网关 + 开发者权限 + 模块开关
// 保留：upload/batch-upload/read/write/delete/image
// ==========================================

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
  const perms = {
    'admin-super': { canToggleModules: true, canEditAll: true, canManageUsers: true },
    'admin-dev':   { canToggleModules: true, canEditAll: false, canManageUsers: false },
    'admin-property': { canToggleModules: false, canEditAll: false, canManageUsers: false },
    'admin-committee': { canToggleModules: false, canEditAll: false, canManageUsers: false },
    'admin-community': { canToggleModules: false, canEditAll: false, canManageUsers: false }
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

async function createToken(role, secret) {
  const payload = JSON.stringify({ role, iat: Date.now(), exp: Date.now() + 8 * 60 * 60 * 1000 });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(payload) + '.' + sigHex;
}

async function verifyToken(token, secret) {
  try {
    const [dataB64, sigHex] = token.split('.');
    if (!dataB64 || !sigHex) return null;
    const payload = JSON.parse(atob(dataB64));
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
  return payload;
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

      // ===== 数据接口（通用 CRUD）=====
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

async function handleLogin(request, env) {
  const { role, password } = await request.json();
  if (!role || !password) return jsonResponse({ success: false, error: '参数不完整' }, 400);

  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!checkRateLimit(clientIP)) {
    return jsonResponse({ success: false, error: '尝试次数过多，请 15 分钟后再试' }, 429);
  }

  const envKey = getPasswordEnvKey(role);
  if (!envKey) return jsonResponse({ success: false, error: '无效身份' }, 400);

  const correct = env[envKey];
  if (!correct) return jsonResponse({ success: false, error: '该身份未配置密码' }, 401);
  if (password !== correct) return jsonResponse({ success: false, error: '密码错误' }, 401);

  const token = await createToken(role, env.JWT_SECRET);
  return jsonResponse({
    success: true,
    token,
    role,
    name: getRoleDisplayName(role),
    permissions: getRolePermissions(role)
  });
}

async function handleVerify(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ valid: false });
  const payload = await verifyToken(auth.slice(7), env.JWT_SECRET);
  if (!payload) return jsonResponse({ valid: false });
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
      const content = JSON.stringify(body.data || body);
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

  const publicUrl = `https://community.firstblade.site/api/image/${encodeURIComponent(key)}`;

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

      const publicUrl = `https://community.firstblade.site/api/image/${encodeURIComponent(key)}`;

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
