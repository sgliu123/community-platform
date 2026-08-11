/**
 * admin-auth.js
 * 安全认证模块 —— 替换原有的前端硬编码密码校验
 * 
 * 原理：
 *   1. 密码从 JS 源码中移除，改为由 Cloudflare Worker 环境变量存储
 *   2. 登录时前端只传递角色+密码给 Worker，Worker 校验后返回 Token
 *   3. Token 存在 sessionStorage 中，8 小时过期，关闭标签页即失效
 *   4. 劫持全局 fetch，自动给发往同域名 /api/ 的请求加上 Authorization Token
 * 
 * 部署：放到 js/admin-auth.js，admin.html 末尾引入即可
 */

(function() {
  'use strict';

  // ==================== 配置区域 ====================
  const CONFIG = {
    // 前端和 Worker 共用同一个域名 community.firstblade.site
    WORKER_URL: 'https://community.firstblade.site',
    TOKEN_KEY:    'admin_auth_token',
    ROLE_KEY:     'admin_auth_role',
    NAME_KEY:     'admin_auth_name',
    EXPIRE_KEY:   'admin_auth_expire'
  };
  // =================================================

  function $(id) { return document.getElementById(id); }

  const _showLoading = typeof window.showLoading === 'function' ? window.showLoading : function(show) {
    const el = $('loadingOverlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  };

  const _showToast = typeof window.showToast === 'function' ? window.showToast : function(msg, type) {
    const container = $('toastContainer');
    if (!container) { alert(msg); return; }
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

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
    const res = await fetch(CONFIG.WORKER_URL + path, {
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

    _showLoading(true);
    try {
      const data = await apiPost('/api/auth/login', { role, password }, false);
      _showLoading(false);

      if (!data.success) {
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      saveAuth(data.token, data.role, data.name);
      enterPanel(data.role, data.name);
      _showToast('登录成功', 'success');

    } catch (err) {
      _showLoading(false);
      if (errorEl) errorEl.textContent = '连接失败，请检查 Worker 是否运行';
      console.error('[Auth] Login error:', err);
    }
  };

  // ==================== 覆盖：退出 ====================

  window.logout = function() {
    clearAuth();
    location.reload();
  };

  // ==================== 全局 fetch 劫持（自动带 Token） ====================
  // 劫持所有 fetch，如果请求的是 community.firstblade.site 域名下的 /api/ 路径，自动加 Token

  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};

    let urlStr = typeof url === 'string' ? url : url.href || url.toString();

    // 匹配同域名下的 /api/ 请求（包括相对路径和绝对路径）
    const isApiRequest = 
      urlStr.startsWith('/api/') ||
      urlStr.includes('community.firstblade.site/api/');

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

  // ==================== 页面切换 ====================

  function enterPanel(role, name) {
    const loginPage   = $('loginPage');
    const tokenPage   = $('tokenPage');
    const adminLayout = $('adminLayout');

    if (loginPage)   loginPage.style.display   = 'none';
    if (tokenPage)   tokenPage.style.display   = 'none';
    if (adminLayout) adminLayout.style.display = '';

    const roleEl = $('adminRole');
    const infoEl = $('adminInfo');
    if (roleEl) roleEl.textContent = name || '管理员';
    if (infoEl) infoEl.textContent = name || '管理员';

    setTimeout(() => {
      if (typeof window.initAdminApp === 'function') window.initAdminApp();
      else if (typeof window.renderNav === 'function') window.renderNav();
      document.dispatchEvent(new Event('auth:ready'));
    }, 50);
  }

  function showLogin() {
    const loginPage   = $('loginPage');
    const tokenPage   = $('tokenPage');
    const adminLayout = $('adminLayout');
    if (loginPage)   loginPage.style.display   = '';
    if (tokenPage)   tokenPage.style.display   = 'none';
    if (adminLayout) adminLayout.style.display = 'none';
  }

  // ==================== 启动校验 ====================

  async function boot() {
    const loginPage   = $('loginPage');
    const tokenPage   = $('tokenPage');
    const adminLayout = $('adminLayout');
    if (loginPage)   loginPage.style.display   = 'none';
    if (tokenPage)   tokenPage.style.display   = 'none';
    if (adminLayout) adminLayout.style.display = 'none';

    const token = getToken();
    if (!token) { showLogin(); return; }

    _showLoading(true);
    try {
      const data = await apiPost('/api/auth/verify', {}, true);
      _showLoading(false);
      if (data.valid) {
        enterPanel(getRole(), sessionStorage.getItem(CONFIG.NAME_KEY));
      } else {
        clearAuth();
        showLogin();
      }
    } catch (e) {
      _showLoading(false);
      clearAuth();
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }

})();
