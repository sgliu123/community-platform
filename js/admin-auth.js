/**
 * admin-auth.js
 * 安全认证模块 —— 替换原有的前端硬编码密码校验
 * 
 * 核心原则：
 *   - 没有 token 时绝不干预页面显示，让原有代码控制登录框
 *   - 有 token 时验证有效性，自动进入后台
 *   - 劫持全局 fetch，自动给同域名 /api/ 请求加 Authorization Token
 */

(function() {
  'use strict';

  // ==================== 配置区域 ====================
  const CONFIG = {
    // 前端和 Worker 共用域名（根据实际访问域名自动适配）
    WORKER_URL: '', // 空字符串表示使用相对路径（同域名）
    TOKEN_KEY:    'admin_auth_token',
    ROLE_KEY:     'admin_auth_role',
    NAME_KEY:     'admin_auth_name',
    EXPIRE_KEY:   'admin_auth_expire'
  };
  // =================================================

  function $(id) { return document.getElementById(id); }

  // ==================== Session 管理 ====================

  function saveAuth(token, role, name) {
    sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
    sessionStorage.setItem(CONFIG.ROLE_KEY, role);
    sessionStorage.setItem(CONFIG.NAME_KEY, name);
    sessionStorage.setItem(CONFIG.EXPIRE_KEY, String(Date.now() + 8 * 60 * 60 * 1000));
  }

  function clearAuth() {
    sessionStorage.removeItem(CONFIG.TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.ROLE_KEY);
    sessionStorage.removeItem(CONFIG.NAME_KEY);
    sessionStorage.removeItem(CONFIG.EXPIRE_KEY);
  }

  function getToken() { return sessionStorage.getItem(CONFIG.TOKEN_KEY); }
  function getRole()  { return sessionStorage.getItem(CONFIG.ROLE_KEY); }

  function isExpired() {
    const exp = sessionStorage.getItem(CONFIG.EXPIRE_KEY);
    return !exp || Date.now() > parseInt(exp);
  }

  // ==================== API 封装 ====================

  async function apiPost(path, body, needAuth) {
    const headers = { 'Content-Type': 'application/json' };
    if (needAuth) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    const url = (CONFIG.WORKER_URL || '') + path;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      clearAuth();
      location.reload();
      throw new Error('登录已过期');
    }
    return res.json();
  }

  // ==================== 覆盖：登录 ====================

  window.doAdminLogin = async function() {
    const role     = $('loginRole').value;
    const password = $('loginPassword').value;
    const errorEl  = $('loginError');

    if (errorEl) errorEl.textContent = '';
    if (!role)     { if (errorEl) errorEl.textContent = '请选择身份'; return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      const data = await apiPost('/api/auth/login', { role, password }, false);
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      saveAuth(data.token, data.role, data.name);

      // 隐藏登录框，显示后台
      const loginPage   = $('loginPage');
      const tokenPage   = $('tokenPage');
      const adminLayout = $('adminLayout');
      if (loginPage)   loginPage.style.display   = 'none';
      if (tokenPage)   tokenPage.style.display   = 'none';
      if (adminLayout) adminLayout.style.display = '';

      // 更新管理员信息
      const roleEl = $('adminRole');
      const infoEl = $('adminInfo');
      if (roleEl) roleEl.textContent = data.name || '管理员';
      if (infoEl) infoEl.textContent = data.name || '管理员';

      // 触发原有初始化逻辑
      setTimeout(() => {
        if (typeof window.initAdminApp === 'function') window.initAdminApp();
        else if (typeof window.renderNav === 'function') window.renderNav();
        document.dispatchEvent(new Event('auth:ready'));
      }, 50);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      if (errorEl) errorEl.textContent = '连接失败，请检查 Worker 是否运行 / CORS 配置';
      console.error('[Auth] Login error:', err);
    }
  };

  // ==================== 覆盖：退出 ====================

  window.logout = function() {
    clearAuth();
    location.reload();
  };

  // ==================== 全局 fetch 劫持（自动带 Token） ====================

  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};

    let urlStr = typeof url === 'string' ? url : (url.href || url.toString());

    // 匹配同域名下的 /api/ 请求（相对路径或绝对路径）
    const isApiRequest = 
      urlStr.startsWith('/api/') ||
      urlStr.includes(location.host + '/api/');

    if (isApiRequest) {
      const token = getToken();
      if (token) {
        if (opts.headers instanceof Headers) {
          opts.headers.set('Authorization', 'Bearer ' + token);
        } else {
          opts.headers['Authorization'] = 'Bearer ' + token;
        }
      }
    }
    return _origFetch(url, opts);
  };

  // ==================== 暴露全局方法 ====================

  window.getAuthToken    = getToken;
  window.getCurrentRole  = getRole;
  window.isAdminAuthenticated = function() { return !!getToken() && !isExpired(); };

  // ==================== 启动校验（温和模式） ====================
  // 只在有 token 时验证并自动进入后台；没有 token 时不干预原有流程

  async function boot() {
    const token = getToken();
    if (!token) return; // 没有 token，让原有代码显示登录框，不做任何干预

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      const data = await apiPost('/api/auth/verify', {}, true);
      if (loading) loading.style.display = 'none';

      if (data.valid) {
        // Token 有效，静默进入后台
        const loginPage   = $('loginPage');
        const tokenPage   = $('tokenPage');
        const adminLayout = $('adminLayout');
        if (loginPage)   loginPage.style.display   = 'none';
        if (tokenPage)   tokenPage.style.display   = 'none';
        if (adminLayout) adminLayout.style.display = '';

        const name = sessionStorage.getItem(CONFIG.NAME_KEY);
        const roleEl = $('adminRole');
        const infoEl = $('adminInfo');
        if (roleEl) roleEl.textContent = name || '管理员';
        if (infoEl) infoEl.textContent = name || '管理员';

        setTimeout(() => {
          if (typeof window.initAdminApp === 'function') window.initAdminApp();
          else if (typeof window.renderNav === 'function') window.renderNav();
          document.dispatchEvent(new Event('auth:ready'));
        }, 50);
      } else {
        clearAuth(); // Token 无效，清除后让原有代码显示登录框
      }
    } catch (e) {
      if (loading) loading.style.display = 'none';
      clearAuth(); // 验证失败，清除后让原有代码显示登录框
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }

})();
