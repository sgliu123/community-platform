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
    if (!nav) { debugLog('Fallback', '找不到 sidebarNav', true); return; }

    // 如果 renderSidebar 已可用，直接调用它
    if (typeof window.renderSidebar === 'function') {
      debugLog('Fallback', '检测到 renderSidebar，优先调用');
      try { window.renderSidebar(); return; } catch(e) { debugLog('Fallback', 'renderSidebar 报错: ' + e.message, true); }
    }

    const content = $('contentArea');
    const pageTitle = $('pageTitle');
    const perms = getAuthPermissions();
    const config = getModuleConfig();

    // 模块定义（与 admin-core.js 的 renderSidebar 保持一致）
    const modules = [
      { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
      { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
      { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
      { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
      { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
      { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
      { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
      { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
      { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
      { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
      { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
      { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
    ];
    const isSuper = role === 'admin-super' || role === 'super';
    if (isSuper) {
      modules.push({ id: 'admin-manage', label: '管理员管理', icon: '👤', perm: 'all', roles: ['super'] });
      modules.push({ id: 'dev-tools', label: '开发者工具', icon: '🛠️', perm: 'all', roles: ['super'] });
    }

    // 正确的渲染函数名映射（与 admin-core.js 的 navigateTo 一致）
    const rendererMap = {
      dashboard: 'renderDashboard',
      config: 'renderConfig',
      announcements: 'renderAnnouncementsAdmin',
      documents: 'renderDocumentsAdmin',
      activities: 'renderActivitiesAdmin',
      polls: 'renderPollsAdmin',
      residents: 'renderResidentsAdmin',
      workorders: 'renderWorkordersAdmin',
      complaints: 'renderComplaintsAdmin',
      audit: 'renderAuditLog',
      settings: 'renderSettings',
      'admin-manage': 'renderAdminManage',
      'dev-tools': 'renderDevTools'
    };

    nav.innerHTML = '';
    modules.forEach(function(mod) {
      // 权限检查（非 super）
      if (!isSuper) {
        const hasRole = !mod.roles || mod.roles.indexOf(role) >= 0;
        if (!hasRole) return;
        if (config.modules && config.modules[mod.id] && config.modules[mod.id].visible === false) return;
      }
      const a = document.createElement('a');
      a.className = 'nav-item';
      a.setAttribute('data-module', mod.id);
      a.href = 'javascript:void(0)';
      // 与 renderSidebar 一致的内联样式
      a.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;margin:4px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:inherit;text-decoration:none;transition:all 0.2s;border-left:3px solid transparent;background:transparent;font-weight:400;';
      a.innerHTML = '<span style="font-size:17px;width:22px;text-align:center;flex-shrink:0;">' + mod.icon + '</span><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + mod.label + '</span>';
      if (mod.external) a.innerHTML += '<span style="font-size:10px;opacity:0.5;flex-shrink:0;">↗</span>';
      a.onclick = function() {
        // 更新 active 样式
        nav.querySelectorAll('a').forEach(function(x) {
          x.classList.remove('active');
          x.style.borderLeftColor = 'transparent';
          x.style.background = 'transparent';
          x.style.fontWeight = '400';
        });
        a.classList.add('active');
        a.style.borderLeftColor = '#fff';
        a.style.background = 'rgba(255,255,255,0.15)';
        a.style.fontWeight = '600';
        if (pageTitle) pageTitle.textContent = mod.label;
        if (mod.external) {
          window.open(mod.external, '_blank');
          return;
        }
        // 优先使用 navigateTo（admin-core.js）
        if (typeof window.navigateTo === 'function') {
          try { window.navigateTo(mod.id); } catch(e) {}
          return;
        }
        // 兜底：直接调用渲染函数
        const fnName = rendererMap[mod.id];
        if (fnName && typeof window[fnName] === 'function') {
          debugLog('Fallback', '调用 ' + fnName);
          try { window[fnName](); } catch(e) { debugLog('Fallback', fnName + ' 报错', true); }
        } else if (content) {
          content.innerHTML = '<div style="padding:40px;text-align:center;"><h2>' + mod.icon + ' ' + mod.label + '</h2><p style="color:#666;">模块渲染函数 <code>' + (fnName || mod.id) + '</code> 未定义</p><p style="color:#999;font-size:12px;">请确认对应 js 文件已正确加载</p></div>';
        }
      };
      nav.appendChild(a);
    });

    // 默认点击第一个
    const first = nav.querySelector('a');
    if (first) {
      setTimeout(function() { first.click(); }, 50);
    }
    debugLog('Fallback', '兜底渲染完成: ' + nav.children.length + ' 项');

    // 强制确保后台布局可见
    const adminLayout2 = $('adminLayout');
    if (adminLayout2) {
      adminLayout2.style.display = 'flex';
      adminLayout2.style.visibility = 'visible';
      adminLayout2.style.opacity = '1';
      debugLog('Fallback', '已强制 adminLayout 可见');
    }
    const sidebar = $('sidebar');
    if (sidebar) { sidebar.style.display = ''; sidebar.style.visibility = 'visible'; }
    const mainContent = document.querySelector('.main-content');
    if (mainContent) { mainContent.style.display = ''; mainContent.style.visibility = 'visible'; }
    if (content) { content.style.display = ''; content.style.visibility = 'visible'; content.style.minHeight = '200px'; }

    // 轮询：一旦 renderSidebar 可用，自动重新渲染为正确菜单
    if (!window._sidebarCheckInterval) {
      var checkCount = 0;
      window._sidebarCheckInterval = setInterval(function() {
        checkCount++;
        if (typeof window.renderSidebar === 'function') {
          clearInterval(window._sidebarCheckInterval);
          window._sidebarCheckInterval = null;
          debugLog('Fallback', '检测到 renderSidebar 已加载，自动重新渲染菜单');
          try { window.renderSidebar(); } catch(e) { debugLog('Fallback', '重新渲染失败: ' + e.message, true); }
        }
        if (checkCount > 30) { clearInterval(window._sidebarCheckInterval); window._sidebarCheckInterval = null; }
      }, 200);
    }
  };
      nav.appendChild(devA);
    }

    const first = nav.querySelector('a');
    if (first) first.click();
    debugLog('Fallback', '兜底渲染完成: ' + nav.children.length + ' 项');

    // 强制确保后台布局可见
    const adminLayout2 = $('adminLayout');
    if (adminLayout2) {
      adminLayout2.style.display = 'flex';
      adminLayout2.style.visibility = 'visible';
      adminLayout2.style.opacity = '1';
      debugLog('Fallback', '已强制 adminLayout 可见');
    }
    const sidebar = $('sidebar');
    if (sidebar) {
      sidebar.style.display = '';
      sidebar.style.visibility = 'visible';
    }
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
      mainContent.style.display = '';
      mainContent.style.visibility = 'visible';
    }
    if (content) {
      content.style.display = '';
      content.style.visibility = 'visible';
      content.style.minHeight = '200px';
    }
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

            // 设置 currentAdmin，供 admin-core.js 使用
      window.currentAdmin = {
        id: data.role || 'admin-super',
        name: data.name || '管理员',
        role: (data.role === 'admin-super') ? 'super' : (data.role || 'admin'),
        permissions: data.permissions ? Object.keys(data.permissions).filter(function(k){ return data.permissions[k]; }) : []
      };
      window.adminSession = { adminId: window.currentAdmin.id, loginTime: new Date().toISOString() };
      debugLog('Login', 'currentAdmin 已设置: ' + JSON.stringify(window.currentAdmin));
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
                // 设置 currentAdmin，供 admin-core.js 使用
        window.currentAdmin = {
          id: data.role || 'admin-super',
          name: name || '管理员',
          role: (data.role === 'admin-super') ? 'super' : (data.role || 'admin'),
          permissions: data.permissions ? Object.keys(data.permissions).filter(function(k){ return data.permissions[k]; }) : []
        };
        window.adminSession = { adminId: window.currentAdmin.id, loginTime: new Date().toISOString() };
        debugLog('Boot', 'currentAdmin 已设置: ' + JSON.stringify(window.currentAdmin));
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