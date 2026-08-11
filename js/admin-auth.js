/**
 * admin-auth.js
 * 安全认证模块 + 权限系统 + 模块开关
 */

(function() {
  'use strict';

  const CONFIG = {
    WORKER_URL: 'https://api.firstblade.site',
    TOKEN_KEY:      'admin_auth_token',
    ROLE_KEY:       'admin_auth_role',
    NAME_KEY:       'admin_auth_name',
    EXPIRE_KEY:     'admin_auth_expire',
    PERMISSIONS_KEY:'admin_auth_permissions',
    MODULE_CONFIG_KEY:'admin_auth_module_config'
  };

  window.AUTH_WORKER_URL = CONFIG.WORKER_URL;

  function $(id) { return document.getElementById(id); }

  function saveAuth(token, role, name, permissions) {
    sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
    sessionStorage.setItem(CONFIG.ROLE_KEY, role);
    sessionStorage.setItem(CONFIG.NAME_KEY, name);
    sessionStorage.setItem(CONFIG.EXPIRE_KEY, String(Date.now() + 8 * 60 * 60 * 1000));
    sessionStorage.setItem(CONFIG.PERMISSIONS_KEY, JSON.stringify(permissions || {}));
  }

  function clearAuth() {
    sessionStorage.removeItem(CONFIG.TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.ROLE_KEY);
    sessionStorage.removeItem(CONFIG.NAME_KEY);
    sessionStorage.removeItem(CONFIG.EXPIRE_KEY);
    sessionStorage.removeItem(CONFIG.PERMISSIONS_KEY);
    sessionStorage.removeItem(CONFIG.MODULE_CONFIG_KEY);
  }

  function getToken() { return sessionStorage.getItem(CONFIG.TOKEN_KEY); }
  function getRole()  { return sessionStorage.getItem(CONFIG.ROLE_KEY); }

  function getAuthPermissions() {
    try { return JSON.parse(sessionStorage.getItem(CONFIG.PERMISSIONS_KEY) || '{}'); }
    catch(e) { return {}; }
  }

  function getModuleConfig() {
    try { return JSON.parse(sessionStorage.getItem(CONFIG.MODULE_CONFIG_KEY) || '{}'); }
    catch(e) { return {}; }
  }

  function setModuleConfig(config) {
    sessionStorage.setItem(CONFIG.MODULE_CONFIG_KEY, JSON.stringify(config || {}));
  }

  function isExpired() {
    const exp = sessionStorage.getItem(CONFIG.EXPIRE_KEY);
    return !exp || Date.now() > parseInt(exp);
  }

  async function apiPost(path, body, needAuth) {
    const headers = { 'Content-Type': 'application/json' };
    if (needAuth) {
      const t = getToken();
      if (t) headers['Authorization'] = 'Bearer ' + t;
    }
    const url = CONFIG.WORKER_URL + path;
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (res.status === 401) {
      clearAuth();
      location.reload();
      throw new Error('登录已过期');
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      throw new Error('服务端返回非 JSON(' + res.status + ')：' + text.substring(0, 80));
    }
    return res.json();
  }

  window.doAdminLogin = async function() {
    const role     = $('loginRole').value;
    const password = $('loginPassword').value;
    const errorEl  = $('loginError');

    console.log('[Auth] 登录开始，角色:', role);
    if (errorEl) errorEl.textContent = '';
    if (!role)     { if (errorEl) errorEl.textContent = '请选择身份'; return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      console.log('[Auth] 请求登录 API...');
      const data = await apiPost('/api/auth/login', { role, password }, false);
      console.log('[Auth] 收到响应:', JSON.stringify(data));
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        console.log('[Auth] 登录失败:', data.error);
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      console.log('[Auth] 登录成功，保存认证信息');
      saveAuth(data.token, data.role, data.name, data.permissions);

      const loginPage = $('loginPage');
      const tokenPage = $('tokenPage');
      const adminLayout = $('adminLayout');
      console.log('[Auth] DOM 元素检查: loginPage=', !!loginPage, 'tokenPage=', !!tokenPage, 'adminLayout=', !!adminLayout);
      if (loginPage) { loginPage.style.display = 'none'; console.log('[Auth] 已隐藏 loginPage'); }
      else { console.warn('[Auth] 未找到 loginPage 元素'); }
      if (tokenPage) { tokenPage.style.display = 'none'; console.log('[Auth] 已隐藏 tokenPage'); }
      if (adminLayout) { adminLayout.style.display = ''; console.log('[Auth] 已显示 adminLayout'); }
      else { console.warn('[Auth] 未找到 adminLayout 元素，页面无法切换'); }

      const roleEl = $('adminRole');
      const infoEl = $('adminInfo');
      if (roleEl) roleEl.textContent = data.name || '管理员';
      if (infoEl) infoEl.textContent = data.name || '管理员';

      await loadModuleConfig();
      applyModuleFilters();
      injectDevToolsEntry();

      setTimeout(() => {
        if (typeof window.initAdminApp === 'function') window.initAdminApp();
        else if (typeof window.renderNav === 'function') window.renderNav();
        document.dispatchEvent(new Event('auth:ready'));
      }, 50);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      if (errorEl) errorEl.textContent = '连接失败：' + (err.message || '请检查 Worker 是否已部署');
      console.error('[Auth] Login error:', err);
      console.error('[Auth] 错误详情:', err.stack);
    }
  };

  window.logout = function() {
    clearAuth();
    const keysToRemove = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (/admin|auth|token|login|user/i).test(key)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    location.href = location.pathname;
  };

  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};

    let urlStr = typeof url === 'string' ? url : (url.href || url.toString());

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

  async function loadModuleConfig() {
    try {
      const url = CONFIG.WORKER_URL + '/api/data/module-config';
      const res = await fetch(url, { method: 'GET' });
      const result = await res.json();
      if (result.success && result.data) {
        setModuleConfig(result.data);
      }
    } catch (err) {
      console.warn('[Auth] Failed to load module config:', err);
    }
  }

  function applyModuleFilters() {
    const nav = $('sidebarNav');
    if (!nav) return;

    const config = getModuleConfig();
    if (!config || !config.modules) return;

    const items = nav.querySelectorAll('a, .nav-item, [onclick]');
    items.forEach(item => {
      let moduleId = item.dataset.module;

      if (!moduleId) {
        const onclick = item.getAttribute('onclick') || '';
        const match = onclick.match(/loadModule\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (match) moduleId = match[1];
      }

      if (!moduleId) return;

      const mod = config.modules[moduleId];
      if (mod && mod.visible === false) {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });
  }

  function injectDevToolsEntry() {
    const nav = $('sidebarNav');
    const perms = getAuthPermissions();
    if (!nav || !perms.canToggleModules) return;
    if (nav.querySelector('[data-module="dev-modules"]')) return;

    const entry = document.createElement('a');
    entry.href = 'javascript:void(0)';
    entry.setAttribute('data-module', 'dev-modules');
    entry.innerHTML = '🔧 开发者工具';
    entry.onclick = function(e) {
      e.preventDefault();
      if (typeof window.renderDevModulesPage === 'function') {
        window.renderDevModulesPage();
      } else {
        alert('开发者工具模块未加载（dev-modules.js 404）');
      }
    };

    nav.appendChild(entry);
  }

  window.getAuthToken       = getToken;
  window.getCurrentRole     = getRole;
  window.getAuthPermissions = getAuthPermissions;
  window.getModuleConfig    = getModuleConfig;
  window.setModuleConfig    = setModuleConfig;
  window.applyModuleFilters = applyModuleFilters;

  window.isAdminAuthenticated = function() {
    return !!getToken() && !isExpired();
  };

  window.canAccessModule = function(moduleId) {
    const config = getModuleConfig();
    if (!config || !config.modules) return true;
    const mod = config.modules[moduleId];
    return !mod || mod.visible !== false;
  };

  window.canEditModule = function(moduleId) {
    const config = getModuleConfig();
    if (!config || !config.modules) return true;
    const mod = config.modules[moduleId];
    return !mod || mod.editable !== false;
  };

  async function boot() {
    const token = getToken();
    console.log('[Auth] boot 检查，token 存在:', !!token);
    if (!token) return;

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      const data = await apiPost('/api/auth/verify', {}, true);
      if (loading) loading.style.display = 'none';

      if (data.valid) {
        const loginPage = $('loginPage');
        const tokenPage = $('tokenPage');
        const adminLayout = $('adminLayout');
        if (loginPage) loginPage.style.display = 'none';
        if (tokenPage) tokenPage.style.display = 'none';
        if (adminLayout) adminLayout.style.display = '';

        const name = sessionStorage.getItem(CONFIG.NAME_KEY);
        const roleEl = $('adminRole');
        const infoEl = $('adminInfo');
        if (roleEl) roleEl.textContent = name || '管理员';
        if (infoEl) infoEl.textContent = name || '管理员';

        await loadModuleConfig();
        applyModuleFilters();
        injectDevToolsEntry();

        setTimeout(() => {
          if (typeof window.initAdminApp === 'function') window.initAdminApp();
          else if (typeof window.renderNav === 'function') window.renderNav();
          document.dispatchEvent(new Event('auth:ready'));
        }, 50);
      } else {
        clearAuth();
      }
    } catch (e) {
      if (loading) loading.style.display = 'none';
      clearAuth();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }

})();
