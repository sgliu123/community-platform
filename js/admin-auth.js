/**
 * admin-auth.js
 * 安全认证模块 + 权限系统 + 模块开关
 * 完整修复版
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
    MODULE_CONFIG_KEY:'admin_auth_module_config',
    DEBUG_KEY:      'admin_auth_debug_logs'
  };

  window.AUTH_WORKER_URL = CONFIG.WORKER_URL;

  // ========== 调试系统 ==========
  function debugLog(tag, msg, isError) {
    const line = '[' + new Date().toLocaleTimeString() + '] [' + tag + '] ' + msg;
    console.log(line);
    try {
      const logs = JSON.parse(localStorage.getItem(CONFIG.DEBUG_KEY) || '[]');
      logs.push(line);
      if (logs.length > 200) logs.shift();
      localStorage.setItem(CONFIG.DEBUG_KEY, JSON.stringify(logs));
    } catch(e) {}
    const panel = document.getElementById('authDebugPanel');
    if (panel) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size:11px;font-family:monospace;padding:2px 4px;border-bottom:1px solid #333;' + (isError ? 'color:#ff6b6b;' : 'color:#51cf66;');
      div.textContent = line;
      panel.appendChild(div);
      panel.scrollTop = panel.scrollHeight;
    }
  }

  function ensureDebugPanel() {
    if (document.getElementById('authDebugPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'authDebugPanel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:120px;background:rgba(0,0,0,0.85);color:#51cf66;overflow-y:auto;z-index:99999;font-family:monospace;font-size:11px;padding:4px;box-sizing:border-box;';
    panel.innerHTML = '<div style="color:#ffd43b;padding:2px 4px;border-bottom:1px solid #555;">🔧 Auth 调试面板 (Ctrl+Shift+D 隐藏/显示)</div>';
    document.body.appendChild(panel);
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      }
    });
  }

  function $(id) { return document.getElementById(id); }

  function saveAuth(token, role, name, permissions) {
    debugLog('Auth', '保存认证: role=' + role);
    sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
    sessionStorage.setItem(CONFIG.ROLE_KEY, role);
    sessionStorage.setItem(CONFIG.NAME_KEY, name);
    sessionStorage.setItem(CONFIG.EXPIRE_KEY, String(Date.now() + 8 * 60 * 60 * 1000));
    sessionStorage.setItem(CONFIG.PERMISSIONS_KEY, JSON.stringify(permissions || {}));
  }

  function clearAuth() {
    debugLog('Auth', '清除认证');
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
    debugLog('API', 'POST ' + path);
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch (netErr) {
      debugLog('API', '网络错误: ' + netErr.message, true);
      throw netErr;
    }
    debugLog('API', '响应状态: ' + res.status);
    // 登录接口的401是业务错误（密码错误），不拦截
    if (res.status === 401 && path !== '/api/auth/login') {
      debugLog('API', '收到401，清除认证', true);
      clearAuth();
      throw new Error('登录已过期（401）');
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      debugLog('API', '非JSON: ' + text.substring(0, 80), true);
      throw new Error('非JSON(' + res.status + ')：' + text.substring(0, 80));
    }
    const data = await res.json();
    debugLog('API', '响应: ' + JSON.stringify(data).substring(0, 200));
    return data;
  }

  // ========== 兜底渲染系统 ==========
  function fallbackRenderAdmin(role, name) {
    debugLog('Fallback', '开始兜底渲染');
    const nav = $('sidebarNav');
    const content = $('contentArea');
    const pageTitle = $('pageTitle');
    if (!nav) { debugLog('Fallback', '找不到 sidebarNav', true); return; }

    const modules = [
      { id: 'dashboard', icon: '📊', title: '仪表盘' },
      { id: 'config', icon: '⚙️', title: '小区配置' },
      { id: 'announcements', icon: '📢', title: '公告管理' },
      { id: 'documents', icon: '📄', title: '文档管理' },
      { id: 'activities', icon: '🎉', title: '活动管理' },
      { id: 'residents', icon: '👥', title: '业主管理' },
      { id: 'audit', icon: '🔍', title: '审计日志' },
      { id: 'workorders', icon: '🔧', title: '工单管理' },
      { id: 'complaints', icon: '💬', title: '投诉建议' },
      { id: 'polls', icon: '📊', title: '投票管理' },
      { id: 'settings', icon: '🔒', title: '系统设置' }
    ];

    const perms = getAuthPermissions();
    const config = getModuleConfig();

    nav.innerHTML = '';
    modules.forEach(mod => {
      if (config.modules && config.modules[mod.id] && config.modules[mod.id].visible === false) return;
      const a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.setAttribute('data-module', mod.id);
      a.innerHTML = mod.icon + ' ' + mod.title;
      a.onclick = function() {
        if (pageTitle) pageTitle.textContent = mod.title;
        nav.querySelectorAll('a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        if (content) {
          const fnName = 'render' + mod.id.charAt(0).toUpperCase() + mod.id.slice(1) + 'Page';
          if (typeof window[fnName] === 'function') {
            debugLog('Fallback', '调用 ' + fnName);
            try { window[fnName](); } catch(e) { debugLog('Fallback', fnName + ' 报错', true); }
          } else {
            content.innerHTML = '<div style="padding:40px;text-align:center;"><h2>' + mod.icon + ' ' + mod.title + '</h2><p style="color:#666;">模块渲染函数 <code>' + fnName + '</code> 未定义</p><p style="color:#999;font-size:12px;">请确认 js/admin-pages/' + mod.id + '.js 已正确加载</p></div>';
          }
        }
      };
      nav.appendChild(a);
    });

    if (perms.canToggleModules) {
      const devA = document.createElement('a');
      devA.href = 'javascript:void(0)';
      devA.setAttribute('data-module', 'dev-modules');
      devA.innerHTML = '🔧 开发者工具';
      devA.onclick = function() {
        if (pageTitle) pageTitle.textContent = '开发者工具';
        if (typeof window.renderDevModulesPage === 'function') window.renderDevModulesPage();
        else if (content) content.innerHTML = '<div style="padding:40px;text-align:center;"><h2>🔧 开发者工具</h2><p>renderDevModulesPage 未定义</p></div>';
      };
      nav.appendChild(devA);
    }

    const first = nav.querySelector('a');
    if (first) first.click();
    debugLog('Fallback', '兜底渲染完成: ' + nav.children.length + ' 项');
  }

  // ========== 登录 ==========
  window.doAdminLogin = async function() {
    ensureDebugPanel();
    debugLog('Login', '========== 登录开始 ==========');
    const role = $('loginRole').value;
    const password = $('loginPassword').value;
    const errorEl = $('loginError');
    if (errorEl) errorEl.textContent = '';
    if (!role) { if (errorEl) errorEl.textContent = '请选择身份'; debugLog('Login', '未选身份', true); return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; debugLog('Login', '未输密码', true); return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      debugLog('Login', '请求登录: ' + role);
      const data = await apiPost('/api/auth/login', { role, password }, false);
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        debugLog('Login', '失败: ' + (data.error || '未知'), true);
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      debugLog('Login', '登录成功');
      saveAuth(data.token, data.role, data.name, data.permissions);

      const loginPage = $('loginPage');
      const tokenPage = $('tokenPage');
      const adminLayout = $('adminLayout');
      debugLog('Login', 'DOM: loginPage=' + !!loginPage + ' tokenPage=' + !!tokenPage + ' adminLayout=' + !!adminLayout);
      if (loginPage) { loginPage.style.display = 'none'; debugLog('Login', '隐藏 loginPage'); }
      if (tokenPage) { tokenPage.style.display = 'none'; debugLog('Login', '隐藏 tokenPage'); }
      if (adminLayout) { adminLayout.style.display = ''; debugLog('Login', '显示 adminLayout'); }

      const roleEl = $('adminRole');
      const infoEl = $('adminInfo');
      if (roleEl) roleEl.textContent = data.name || '管理员';
      if (infoEl) infoEl.textContent = data.name || '管理员';

      debugLog('Login', '加载模块配置...');
      await loadModuleConfig();
      applyModuleFilters();
      injectDevToolsEntry();

      setTimeout(() => {
        debugLog('Login', '执行初始化...');
        try {
          if (typeof window.initAdminApp === 'function') { window.initAdminApp(); debugLog('Login', 'initAdminApp 完成'); }
          else if (typeof window.renderNav === 'function') { window.renderNav(); debugLog('Login', 'renderNav 完成'); }
          else { debugLog('Login', '无初始化函数，启用兜底', true); fallbackRenderAdmin(data.role, data.name); }
          document.dispatchEvent(new Event('auth:ready'));
          debugLog('Login', 'auth:ready 已派发');
        } catch (e) {
          debugLog('Login', '初始化报错: ' + e.message, true);
        }
        debugLog('Login', '========== 登录结束 ==========');
      }, 50);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      const msg = '连接失败：' + (err.message || '请检查 Worker');
      debugLog('Login', '异常: ' + msg, true);
      if (errorEl) errorEl.textContent = msg;
    }
  };

  window.logout = function() {
    clearAuth();
    const keysToRemove = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (/admin|auth|token|login|user/i).test(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    location.href = location.pathname;
  };

  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    let urlStr = typeof url === 'string' ? url : (url.href || url.toString());
    const isApiRequest = urlStr.startsWith('/api/') || urlStr.includes(location.host + '/api/');
    if (isApiRequest) {
      const token = getToken();
      if (token) {
        if (opts.headers instanceof Headers) opts.headers.set('Authorization', 'Bearer ' + token);
        else opts.headers['Authorization'] = 'Bearer ' + token;
      }
    }
    return _origFetch(url, opts);
  };

  // ========== 关键修复：loadModuleConfig 必须带 token ==========
  async function loadModuleConfig() {
    try {
      const url = CONFIG.WORKER_URL + '/api/data/module-config';
      const token = getToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
        debugLog('Config', '已附加 token');
      } else {
        debugLog('Config', '警告: 无 token', true);
      }
      debugLog('Config', 'GET ' + url);
      const res = await fetch(url, { method: 'GET', headers: headers });
      debugLog('Config', '响应: ' + res.status);
      const result = await res.json();
      if (result.success && result.data) {
        setModuleConfig(result.data);
        debugLog('Config', '配置已保存');
      } else {
        debugLog('Config', '响应异常: ' + JSON.stringify(result), true);
      }
    } catch (err) {
      debugLog('Config', '失败: ' + err.message, true);
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
      if (mod && mod.visible === false) item.style.display = 'none';
      else item.style.display = '';
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
      if (typeof window.renderDevModulesPage === 'function') window.renderDevModulesPage();
      else alert('开发者工具模块未加载');
    };
    nav.appendChild(entry);
  }

  window.getAuthToken = getToken;
  window.getCurrentRole = getRole;
  window.getAuthPermissions = getAuthPermissions;
  window.getModuleConfig = getModuleConfig;
  window.setModuleConfig = setModuleConfig;
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
    ensureDebugPanel();
    const token = getToken();
    debugLog('Boot', 'token 存在: ' + !!token);
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
          try {
            if (typeof window.initAdminApp === 'function') window.initAdminApp();
            else if (typeof window.renderNav === 'function') window.renderNav();
            else fallbackRenderAdmin(data.role, name);
            document.dispatchEvent(new Event('auth:ready'));
          } catch (e) {
            debugLog('Boot', '初始化报错: ' + e.message, true);
          }
        }, 50);
      } else {
        clearAuth();
      }
    } catch (e) {
      if (loading) loading.style.display = 'none';
      debugLog('Boot', '验证异常: ' + e.message, true);
      clearAuth();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 100));
  } else {
    setTimeout(boot, 100);
  }

})();