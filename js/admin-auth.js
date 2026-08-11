/** admin-auth.js v2.1 2026-08-11 18:20 */
/**
 * admin-auth.js
 * 安全认证模块 + 权限系统 + 模块开关
 * 最终修复版 - 优先使用原始系统函数
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
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:100px;background:rgba(0,0,0,0.85);color:#51cf66;overflow-y:auto;z-index:99999;font-family:monospace;font-size:11px;padding:4px;box-sizing:border-box;';
    panel.innerHTML = '<div style="color:#ffd43b;padding:2px 4px;border-bottom:1px solid #555;">🔧 Auth 调试面板 v2.1 (Ctrl+Shift+D 隐藏)</div>';
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
    debugLog('API', '响应: ' + res.status);
    if (res.status === 401 && path !== '/api/auth/login') {
      debugLog('API', '401 清除认证', true);
      clearAuth();
      throw new Error('登录已过期（401）');
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await res.text();
      throw new Error('非JSON(' + res.status + ')：' + text.substring(0, 80));
    }
    return res.json();
  }

  // ========== 初始化后台界面 ==========
  function initAdminUI(role, name) {
    debugLog('UI', '初始化后台界面...');

    // 1. 优先使用系统自带的 renderSidebar
    if (typeof window.renderSidebar === 'function') {
      debugLog('UI', '调用系统 renderSidebar()');
      try {
        window.renderSidebar();
        debugLog('UI', 'renderSidebar() 成功');
      } catch(e) {
        debugLog('UI', 'renderSidebar() 失败: ' + e.message, true);
        fallbackNav();
      }
    } else {
      debugLog('UI', 'renderSidebar 不存在，使用兜底导航', true);
      fallbackNav();
    }

    // 2. 加载默认页面（仪表盘）
    const pageFns = ['renderDashboard', 'renderDashboardPage'];
    let loaded = false;
    for (const fn of pageFns) {
      if (typeof window[fn] === 'function') {
        debugLog('UI', '调用 ' + fn + '()');
        try {
          const result = window[fn]();
          // 如果函数返回了HTML字符串，自动写入contentArea
          if (typeof result === 'string' && result.trim()) {
            const content = $('contentArea');
            if (content) content.innerHTML = result;
            debugLog('UI', fn + '() 返回HTML并已写入contentArea');
          } else {
            debugLog('UI', fn + '() 成功（无返回值或返回值非字符串）');
          }
          loaded = true;
          break;
        } catch(e) {
          debugLog('UI', fn + '() 失败: ' + e.message, true);
        }
      }
    }

    // 3. 检查内容是否为空，如果是则显示兜底仪表盘
    setTimeout(() => {
      const content = $('contentArea');
      const sidebarNav = $('sidebarNav');

      // 检查 sidebarNav 是否为空
      if (sidebarNav && sidebarNav.children.length === 0) {
        debugLog('UI', 'sidebarNav 为空，启用兜底导航', true);
        fallbackNav();
      }

      // 检查 contentArea 是否为空
      if (content && (!content.innerHTML || content.innerHTML.trim() === '' || content.children.length === 0)) {
        debugLog('UI', 'contentArea 为空，显示兜底仪表盘', true);
                content.innerHTML = '<div id="fallbackDashboard" style="padding:30px;font-family:sans-serif;">' +
          '<h1 style="margin-bottom:20px;">📊 仪表盘</h1>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">' +
          '<div class="dash-card" data-mod="residents" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#0369a1;">👥 业主管理</h3><p style="margin:0;color:#64748b;font-size:14px;">管理小区业主信息</p></div>' +
          '<div class="dash-card" data-mod="announcements" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#15803d;">📢 公告管理</h3><p style="margin:0;color:#64748b;font-size:14px;">发布小区公告通知</p></div>' +
          '<div class="dash-card" data-mod="workorders" style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#a16207;">🔧 工单管理</h3><p style="margin:0;color:#64748b;font-size:14px;">处理维修工单</p></div>' +
          '<div class="dash-card" data-mod="polls" style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#7c3aed;">📊 投票管理</h3><p style="margin:0;color:#64748b;font-size:14px;">发起业主投票</p></div>' +
          '<div class="dash-card" data-mod="config" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#c2410c;">⚙️ 小区配置</h3><p style="margin:0;color:#64748b;font-size:14px;">配置小区基本信息</p></div>' +
          '<div class="dash-card" data-mod="documents" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#475569;">📄 文档管理</h3><p style="margin:0;color:#64748b;font-size:14px;">管理小区文档资料</p></div>' +
          '<div class="dash-card" data-mod="activities" style="background:#fff1f2;border:1px solid #fecdd3;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#be123c;">🎉 活动管理</h3><p style="margin:0;color:#64748b;font-size:14px;">组织小区活动</p></div>' +
          '<div class="dash-card" data-mod="complaints" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:16px;cursor:pointer;"><h3 style="margin:0 0 8px;color:#0e7490;">💬 投诉建议</h3><p style="margin:0;color:#64748b;font-size:14px;">处理业主投诉</p></div>' +
          '</div><p style="margin-top:24px;color:#999;font-size:12px;">⚠️ 模块数据加载异常，显示基础界面。请检查 js/admin-pages/ 下的模块文件。</p></div>';

        // 绑定卡片点击事件
        setTimeout(function() {
          var cards = content.querySelectorAll('.dash-card');
          var fnMap = {
            residents: 'renderResidentsAdmin',
            announcements: 'renderAnnouncementsAdmin',
            workorders: 'renderWorkordersAdmin',
            polls: 'renderPollsAdmin',
            config: 'renderConfig',
            documents: 'renderDocumentsAdmin',
            activities: 'renderActivitiesAdmin',
            complaints: 'renderComplaintsAdmin'
          };
          cards.forEach(function(card) {
            card.addEventListener('click', function() {
              var mod = card.dataset.mod;
              var fn = fnMap[mod];
              if (fn && typeof window[fn] === 'function') {
                debugLog('UI', '卡片点击: ' + mod + ' -> ' + fn);
                try { window[fn](); } catch(e) { debugLog('UI', fn + ' 报错', true); }
              } else {
                debugLog('UI', '卡片点击: ' + mod + ' 无渲染函数', true);
              }
            });
          });
        }, 0);
      }
    }, 300); // 延迟300ms等待异步渲染

    // 4. 确保布局可见
    const layout = $('adminLayout');
    if (layout) {
      layout.style.display = 'flex';
      layout.style.visibility = 'visible';
      layout.style.opacity = '1';
    }
    const sidebar = $('sidebar');
    if (sidebar) { sidebar.style.display = ''; sidebar.style.visibility = 'visible'; }
    const main = document.querySelector('.main-content');
    if (main) { main.style.display = ''; main.style.visibility = 'visible'; }
  }

  // 兜底导航
  function fallbackNav() {
    debugLog('UI', '构建兜底导航...');
    const nav = $('sidebarNav');
    if (!nav) { debugLog('UI', '无 sidebarNav', true); return; }

    const modules = [
      { id: 'dashboard', icon: '📊', title: '仪表盘', fn: 'renderDashboard' },
      { id: 'config', icon: '⚙️', title: '小区配置', fn: 'renderConfig' },
      { id: 'announcements', icon: '📢', title: '公告管理', fn: 'renderAnnouncementsAdmin' },
      { id: 'documents', icon: '📄', title: '文档管理', fn: 'renderDocumentsAdmin' },
      { id: 'activities', icon: '🎉', title: '活动管理', fn: 'renderActivitiesAdmin' },
      { id: 'residents', icon: '👥', title: '业主管理', fn: 'renderResidentsAdmin' },
      { id: 'audit', icon: '🔍', title: '审计日志', fn: 'renderAuditLog' },
      { id: 'workorders', icon: '🔧', title: '工单管理', fn: 'renderWorkordersAdmin' },
      { id: 'complaints', icon: '💬', title: '投诉建议', fn: 'renderComplaintsAdmin' },
      { id: 'polls', icon: '📊', title: '投票管理', fn: 'renderPollsAdmin' },
      { id: 'settings', icon: '🔒', title: '系统设置', fn: 'renderSettings' }
    ];

    const perms = getAuthPermissions();
    const config = getModuleConfig();
    nav.innerHTML = '';

    modules.forEach(mod => {
      if (config.modules && config.modules[mod.id] && config.modules[mod.id].visible === false) return;
      if (typeof window[mod.fn] !== 'function') return;

      const a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.setAttribute('data-module', mod.id);
      a.innerHTML = mod.icon + ' ' + mod.title;
      a.onclick = function() {
        $('pageTitle').textContent = mod.title;
        nav.querySelectorAll('a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        try { window[mod.fn](); } catch(e) { debugLog('UI', mod.fn + ' 报错', true); }
      };
      nav.appendChild(a);
    });

    if (perms.canToggleModules && typeof window.renderDevModulesPage === 'function') {
      const a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.setAttribute('data-module', 'dev-modules');
      a.innerHTML = '🔧 开发者工具';
      a.onclick = function() {
        $('pageTitle').textContent = '开发者工具';
        try { window.renderDevModulesPage(); } catch(e) {}
      };
      nav.appendChild(a);
    }

    const first = nav.querySelector('a');
    if (first) first.click();
    debugLog('UI', '兜底导航: ' + nav.children.length + ' 项');
  }

  // ========== 登录 ==========
  window.doAdminLogin = async function() {
    ensureDebugPanel();
    debugLog('Login', '========== 开始 ==========');
    const role = $('loginRole').value;
    const password = $('loginPassword').value;
    const errorEl = $('loginError');
    if (errorEl) errorEl.textContent = '';
    if (!role) { if (errorEl) errorEl.textContent = '请选择身份'; return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      const data = await apiPost('/api/auth/login', { role, password }, false);
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        debugLog('Login', '失败: ' + (data.error || '未知'), true);
        return;
      }

      saveAuth(data.token, data.role, data.name, data.permissions);

      if ($('loginPage')) $('loginPage').style.display = 'none';
      if ($('tokenPage')) $('tokenPage').style.display = 'none';
      if ($('adminLayout')) $('adminLayout').style.display = '';

      const name = data.name || '管理员';
      const roleEl = $('adminRole');
      const infoEl = $('adminInfo');
      if (roleEl) roleEl.textContent = name;
      if (infoEl) infoEl.textContent = name;

      await loadModuleConfig();
      applyModuleFilters();
      injectDevToolsEntry();

      setTimeout(() => {
        initAdminUI(data.role, name);
        document.dispatchEvent(new Event('auth:ready'));
        debugLog('Login', '========== 结束 ==========');
      }, 50);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      const msg = '连接失败：' + (err.message || '请检查 Worker');
      if (errorEl) errorEl.textContent = msg;
      debugLog('Login', '异常: ' + msg, true);
    }
  };

  window.logout = function() {
    clearAuth();
    const keys = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (/admin|auth|token|login|user/i).test(k)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    location.href = location.pathname;
  };

  const _origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    let urlStr = typeof url === 'string' ? url : (url.href || url.toString());
    const isApi = urlStr.startsWith('/api/') || urlStr.includes(location.host + '/api/');
    if (isApi) {
      const token = getToken();
      if (token) {
        if (opts.headers instanceof Headers) opts.headers.set('Authorization', 'Bearer ' + token);
        else opts.headers['Authorization'] = 'Bearer ' + token;
      }
    }
    return _origFetch(url, opts);
  };

  async function loadModuleConfig() {
    try {
      const token = getToken();
      const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
      const res = await fetch(CONFIG.WORKER_URL + '/api/data/module-config', { method: 'GET', headers });
      const result = await res.json();
      if (result.success && result.data) setModuleConfig(result.data);
    } catch (err) {
      debugLog('Config', '加载失败: ' + err.message, true);
    }
  }

  function applyModuleFilters() {
    const nav = $('sidebarNav');
    if (!nav) return;
    const config = getModuleConfig();
    if (!config || !config.modules) return;
    nav.querySelectorAll('a, .nav-item, [onclick]').forEach(item => {
      let moduleId = item.dataset.module;
      if (!moduleId) {
        const m = (item.getAttribute('onclick') || '').match(/loadModule\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (m) moduleId = m[1];
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
      else alert('开发者工具未加载');
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
    debugLog('Boot', 'token: ' + !!token);
    if (!token) return;
    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';
    try {
      const data = await apiPost('/api/auth/verify', {}, true);
      if (loading) loading.style.display = 'none';
      if (data.valid) {
        if ($('loginPage')) $('loginPage').style.display = 'none';
        if ($('tokenPage')) $('tokenPage').style.display = 'none';
        if ($('adminLayout')) $('adminLayout').style.display = '';
        const name = sessionStorage.getItem(CONFIG.NAME_KEY) || '管理员';
        const roleEl = $('adminRole');
        const infoEl = $('adminInfo');
        if (roleEl) roleEl.textContent = name;
        if (infoEl) infoEl.textContent = name;
        await loadModuleConfig();
        applyModuleFilters();
        injectDevToolsEntry();
        setTimeout(() => {
          initAdminUI(data.role, name);
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