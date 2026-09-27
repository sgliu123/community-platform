/**
 * admin-auth.js
 * 安全认证模块 + 权限系统 + 模块开关
 * 完整修复版
 */

(function() {
  'use strict';

  const CONFIG = {
    // 同域相对路径：Cloudflare Pages 一体化部署，前后端同一域名，无需配置域名
    WORKER_URL: '',
    TOKEN_KEY:      'admin_auth_token',
    ROLE_KEY:       'admin_auth_role',
    NAME_KEY:       'admin_auth_name',
    EXPIRE_KEY:     'admin_auth_expire',
    PERMISSIONS_KEY:'admin_auth_permissions',
    MODULE_CONFIG_KEY:'admin_auth_module_config',
    ACCOUNT_MODULES_KEY:'admin_auth_account_modules',
    REMEMBER_KEY:   'admin_auth_remember',
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
    // 同步兼容 admin-core.js 的旧 session 格式，避免两套系统冲突
    sessionStorage.setItem('adminSession', JSON.stringify({
      adminId: role,
      loginTime: new Date().toISOString()
    }));
  }

  function clearAuth() {
    debugLog('Auth', '清除认证');
    sessionStorage.removeItem(CONFIG.TOKEN_KEY);
    sessionStorage.removeItem(CONFIG.ROLE_KEY);
    sessionStorage.removeItem(CONFIG.NAME_KEY);
    sessionStorage.removeItem(CONFIG.EXPIRE_KEY);
    sessionStorage.removeItem(CONFIG.PERMISSIONS_KEY);
    sessionStorage.removeItem(CONFIG.MODULE_CONFIG_KEY);
    sessionStorage.removeItem(CONFIG.ACCOUNT_MODULES_KEY);
    try { localStorage.removeItem(CONFIG.REMEMBER_KEY); } catch (ignore) {}
  }

  function getToken() { return sessionStorage.getItem(CONFIG.TOKEN_KEY); }
  function getRole()  { return sessionStorage.getItem(CONFIG.ROLE_KEY); }

  // 角色归一：服务端标识 admin-property → 前端侧边栏统一用 property/super/dev/committee/community
  function normalizeRole(role) {
    const map = { 'admin-super': 'super', 'admin-dev': 'dev' };
    if (map[role]) return map[role];
    if (role && role.indexOf('admin-') === 0) return role.slice(6);
    return role || 'admin';
  }

  // 30 天免登录：从 localStorage 恢复会话到 sessionStorage
  function restoreRemembered() {
    try {
      const raw = localStorage.getItem(CONFIG.REMEMBER_KEY);
      if (!raw) return;
      const bundle = JSON.parse(raw);
      if (!bundle || !bundle.token) { localStorage.removeItem(CONFIG.REMEMBER_KEY); return; }
      if (Date.now() > (bundle.expire || 0)) { localStorage.removeItem(CONFIG.REMEMBER_KEY); return; }
      sessionStorage.setItem(CONFIG.TOKEN_KEY, bundle.token);
      sessionStorage.setItem(CONFIG.ROLE_KEY, bundle.role || '');
      sessionStorage.setItem(CONFIG.NAME_KEY, bundle.name || '管理员');
      sessionStorage.setItem(CONFIG.PERMISSIONS_KEY, JSON.stringify(bundle.permissions || {}));
      sessionStorage.setItem(CONFIG.EXPIRE_KEY, String(bundle.expire));
      setAccountModules(bundle.modules || null);
      debugLog('Boot', '已从免登录缓存恢复会话');
    } catch (e) {
      try { localStorage.removeItem(CONFIG.REMEMBER_KEY); } catch (ignore) {}
    }
  }

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

  // ========== 个人账号级板块开关（总维护在「管理员管理」按账号设置） ==========
  function getAccountModules() {
    try { return JSON.parse(sessionStorage.getItem(CONFIG.ACCOUNT_MODULES_KEY) || 'null'); }
    catch(e) { return null; }
  }

  function setAccountModules(modules) {
    if (modules && typeof modules === 'object' && Object.keys(modules).length) {
      sessionStorage.setItem(CONFIG.ACCOUNT_MODULES_KEY, JSON.stringify(modules));
    } else {
      sessionStorage.removeItem(CONFIG.ACCOUNT_MODULES_KEY);
    }
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

    // 如果 renderSidebar 已可用，尝试调用它
    if (typeof window.renderSidebar === 'function') {
      debugLog('Fallback', '检测到 renderSidebar，尝试调用');
      try { 
        window.renderSidebar(); 
        // 检查菜单是否渲染成功（至少5项）
        const navCheck = $('sidebarNav');
        if (navCheck && navCheck.children.length >= 5) {
          debugLog('Fallback', 'renderSidebar 渲染成功');
          // 菜单渲染成功，但还需要显示默认页面内容
          setTimeout(function() {
            if (typeof window.navigateTo === 'function') {
              debugLog('Fallback', '调用 navigateTo(dashboard)');
              try { window.navigateTo('dashboard'); } catch(e) {}
            } else if (typeof window.renderDashboard === 'function') {
              debugLog('Fallback', '调用 renderDashboard()');
              try { window.renderDashboard(); } catch(e) {}
            }
          }, 100);
          return;
        }
        debugLog('Fallback', 'renderSidebar 渲染结果为空（' + (navCheck ? navCheck.children.length : 0) + '项），继续兜底');
      } catch(e) { 
        debugLog('Fallback', 'renderSidebar 报错: ' + e.message, true); 
      }
    }

    const content = $('contentArea');
    const pageTitle = $('pageTitle');
    const perms = getAuthPermissions();
    const config = getModuleConfig();
    const isSuper = role === 'admin-super' || role === 'super';

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
      { id: 'funds', label: '阳光资金', icon: '🏦', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-funds.html' },
      { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
      { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
      { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
    ];
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
      // 非 super：可见性统一由 canAccessModule 判定（身份默认基线 + 账号级板块开关 + 全局开关），
      // 不再在构建时按 role 硬过滤，保证「管理员管理 → 板块权限」的勾选与实际侧边栏一致
      if (!isSuper) {
        if (window.canAccessModule && !window.canAccessModule(mod.id)) return;
        if (!window.canAccessModule) {
          const hasRole = !mod.roles || mod.roles.indexOf(role) >= 0;
          if (!hasRole) return;
          if (config.modules && config.modules[mod.id] && config.modules[mod.id].visible === false) return;
        }
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
      adminLayout2.classList.add('active');
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
  }

  // ========== 申请管理员权限（物业/业委会/社区 → 总维护人员审批） ==========
  window.showApplyForm = function() {
    const f = $('applyForm');
    if (f) f.style.display = 'block';
    const tip = $('loginTip');
    if (tip) tip.style.display = 'none';
  };
  window.hideApplyForm = function() {
    const f = $('applyForm');
    if (f) f.style.display = 'none';
    const tip = $('loginTip');
    if (tip) tip.style.display = '';
    const err = $('applyError');
    if (err) err.textContent = '';
  };

  window.doAdminApply = async function() {
    const role = $('applyRole').value;
    const name = $('applyName').value.trim();
    const pwd = $('applyPassword').value;
    const pwd2 = $('applyPassword2').value;
    const note = $('applyNote').value.trim();
    const err = $('applyError');
    if (err) err.textContent = '';
    if (!role) { if (err) err.textContent = '请选择申请身份'; return; }
    if (!name) { if (err) err.textContent = '请填写姓名'; return; }
    if (!pwd || pwd.length < 6) { if (err) err.textContent = '密码需 6 位以上'; return; }
    if (pwd !== pwd2) { if (err) err.textContent = '两次输入的密码不一致'; return; }

    try {
      debugLog('Apply', '提交管理员申请: ' + role + ' / ' + name);
      const data = await apiPost('/api/auth/apply', { role, name, password: pwd, note }, false);
      if (!data.success) { if (err) err.textContent = data.error || '提交失败'; return; }
      // 清空并提示
      $('applyRole').value = ''; $('applyName').value = ''; $('applyPassword').value = ''; $('applyPassword2').value = ''; $('applyNote').value = '';
      hideApplyForm();
      const loginErr = $('loginError');
      if (loginErr) {
        loginErr.style.color = '#2E8B57';
        loginErr.textContent = '✅ 申请已提交，请等待总维护人员审批。审批通过后即可使用该身份密码登录。';
        setTimeout(() => { loginErr.style.color = ''; loginErr.textContent = ''; }, 8000);
      }
    } catch (e) {
      if (err) err.textContent = '提交失败：' + (e.message || '网络错误');
      debugLog('Apply', '异常: ' + e.message, true);
    }
  };

  // ========== 登录 ==========
  window.doAdminLogin = async function() {
    ensureDebugPanel();
    debugLog('Login', '========== 登录开始 ==========');
    const username = ($('loginName') ? $('loginName').value : '').trim();
    const password = $('loginPassword').value;
    const remember = ($('loginRemember') && $('loginRemember').checked) || false;
    const errorEl = $('loginError');
    if (errorEl) errorEl.style.display = 'block', errorEl.textContent = '';
    if (!username) { if (errorEl) errorEl.textContent = '请输入用户名'; debugLog('Login', '未输用户名', true); return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; debugLog('Login', '未输密码', true); return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      debugLog('Login', '请求登录: ' + username);
      const data = await apiPost('/api/auth/login', { username, password, remember }, false);
      // 记住本机用户名（30 天预填），不存密码
      try {
        localStorage.setItem('admin_auth_last_user', username);
        localStorage.setItem('admin_auth_remember_flag', remember ? '1' : '0');
      } catch (ignore) {}
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        debugLog('Login', '失败: ' + (data.error || '未知'), true);
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      debugLog('Login', '登录成功');
      saveAuth(data.token, data.role, data.name, data.permissions);
      setAccountModules(data.modules);
      // 30 天免登录：把会话打包进 localStorage，刷新/重开浏览器自动续上
      if (remember) {
        try {
          localStorage.setItem(CONFIG.REMEMBER_KEY, JSON.stringify({
            token: data.token, role: data.role, name: data.name,
            permissions: data.permissions || {}, modules: data.modules || null,
            expire: Date.now() + 30 * 24 * 60 * 60 * 1000
          }));
        } catch (e) { debugLog('Login', '写入免登录缓存失败: ' + e.message, true); }
      } else {
        try { localStorage.removeItem(CONFIG.REMEMBER_KEY); } catch (ignore) {}
      }
      const normRoleLogin = normalizeRole(data.role);

      const loginPage = $('loginPage');
      const tokenPage = $('tokenPage');
      const adminLayout = $('adminLayout');
      debugLog('Login', 'DOM: loginPage=' + !!loginPage + ' tokenPage=' + !!tokenPage + ' adminLayout=' + !!adminLayout);
      if (loginPage) { loginPage.style.display = 'none'; debugLog('Login', '隐藏 loginPage'); }
      if (tokenPage) { tokenPage.style.display = 'none'; debugLog('Login', '隐藏 tokenPage'); }
      if (adminLayout) {
        adminLayout.style.display = 'flex';
        adminLayout.classList.add('active');
        debugLog('Login', '显示 adminLayout');
      }

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
        role: normRoleLogin,
        permissions: data.permissions ? Object.keys(data.permissions).filter(function(k){ return data.permissions[k]; }) : []
      };
      window.adminSession = { adminId: window.currentAdmin.id, loginTime: new Date().toISOString() };
      debugLog('Login', 'currentAdmin 已设置: ' + JSON.stringify(window.currentAdmin));
setTimeout(() => {
        debugLog('Login', '执行初始化...');
        try {
          if (typeof window.showAdminLayout === 'function') {
            window.showAdminLayout();
            debugLog('Login', 'showAdminLayout 完成');
          } else if (typeof window.initAdminApp === 'function') {
            window.initAdminApp();
            debugLog('Login', 'initAdminApp 完成');
          } else if (typeof window.renderNav === 'function') {
            window.renderNav();
            debugLog('Login', 'renderNav 完成');
          } else {
            debugLog('Login', '无初始化函数，启用兜底', true);
            fallbackRenderAdmin(data.role, data.name);
          }
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
    const items = nav.querySelectorAll('a, .nav-item, [onclick]');
    items.forEach(item => {
      let moduleId = item.dataset.module;
      if (!moduleId) {
        const onclick = item.getAttribute('onclick') || '';
        const match = onclick.match(/loadModule\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (match) moduleId = match[1];
      }
      if (!moduleId) return;
      // 统一走 canAccessModule：账号级开关 + 全局配置任一关闭即隐藏
      item.style.display = window.canAccessModule(moduleId) ? '' : 'none';
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
    // 总维护人员 / 开发者不受任何板块开关限制
    const role = sessionStorage.getItem(CONFIG.ROLE_KEY) || '';
    if (role === 'admin-super' || role === 'admin-dev') return true;
    // 全局板块开关对所有人生效（三处来源：localStorage config + appData.moduleSwitches + 模块配置接口）
    let globalOff = false;
    try {
      const savedSwitches = JSON.parse(localStorage.getItem('config') || 'null');
      if (savedSwitches && savedSwitches.moduleSwitches && savedSwitches.moduleSwitches[moduleId] === false) globalOff = true;
    } catch (e) {}
    try {
      if (window.appData && window.appData.config && window.appData.config.moduleSwitches &&
          window.appData.config.moduleSwitches[moduleId] === false) globalOff = true;
    } catch (e) {}
    if (!globalOff) {
      const config = getModuleConfig();
      if (config && config.modules && config.modules[moduleId] && config.modules[moduleId].visible === false) globalOff = true;
    }
    if (globalOff) return false;
    // 账号级开关（仅个人账号有值）：显式设置过则以账号设置为准（可超出身份基线）
    const acct = getAccountModules();
    if (acct && typeof acct[moduleId] === 'boolean') return acct[moduleId];
    // 未显式设置：按身份默认基线（与 ROLE_MODULE_MAP / 板块权限面板一致）
    const BASELINE_FALLBACK = {
      'admin-property':  ['dashboard', 'announcements', 'documents', 'residents', 'workorders', 'life', 'trade', 'settings'],
      'admin-committee': ['dashboard', 'polls', 'residents', 'complaints', 'life', 'trade', 'settings'],
      'admin-community': ['dashboard', 'announcements', 'activities', 'complaints', 'life', 'trade', 'settings']
    };
    const MAP = window.ROLE_MODULE_MAP || BASELINE_FALLBACK;
    const baseline = MAP[role] || null;
    if (baseline && baseline.indexOf(moduleId) < 0) return false;
    return true;
  };

  window.canEditModule = function(moduleId) {
    const config = getModuleConfig();
    if (!config || !config.modules) return true;
    const mod = config.modules[moduleId];
    return !mod || mod.editable !== false;
  };

  async function boot() {
    ensureDebugPanel();
    if (!getToken()) restoreRemembered();
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
        setAccountModules(data.modules); // 个人账号板块开关实时同步（含停用后强制登出已由 verify 拦截）
        applyModuleFilters();
        injectDevToolsEntry();
                // 设置 currentAdmin，供 admin-core.js 使用
        window.currentAdmin = {
          id: data.role || 'admin-super',
          name: name || '管理员',
          role: normalizeRole(data.role),
          permissions: data.permissions ? Object.keys(data.permissions).filter(function(k){ return data.permissions[k]; }) : []
        };
        window.adminSession = { adminId: window.currentAdmin.id, loginTime: new Date().toISOString() };
        debugLog('Boot', 'currentAdmin 已设置: ' + JSON.stringify(window.currentAdmin));
setTimeout(() => {
          try {
            if (typeof window.showAdminLayout === 'function') {
              window.showAdminLayout();
            } else if (typeof window.initAdminApp === 'function') {
              window.initAdminApp();
            } else if (typeof window.renderNav === 'function') {
              window.renderNav();
            } else {
              fallbackRenderAdmin(data.role, name);
            }
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