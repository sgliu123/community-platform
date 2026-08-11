/**
 * admin-auth.js
 * 安全认证模块 + 权限系统 + 模块开关
 * 调试增强版 - 防止闪退
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

    // 持久化到 localStorage
    try {
      const logs = JSON.parse(localStorage.getItem(CONFIG.DEBUG_KEY) || '[]');
      logs.push(line);
      if (logs.length > 200) logs.shift();
      localStorage.setItem(CONFIG.DEBUG_KEY, JSON.stringify(logs));
    } catch(e) {}

    // 同时显示在页面调试面板上
    const panel = document.getElementById('authDebugPanel');
    if (panel) {
      const div = document.createElement('div');
      div.style.cssText = 'font-size:11px;font-family:monospace;padding:2px 4px;border-bottom:1px solid #333;' + (isError ? 'color:#ff6b6b;' : 'color:#51cf66;');
      div.textContent = line;
      panel.appendChild(div);
      panel.scrollTop = panel.scrollHeight;
    }
  }

  // 创建调试面板
  function ensureDebugPanel() {
    if (document.getElementById('authDebugPanel')) return;
    const panel = document.createElement('div');
    panel.id = 'authDebugPanel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;height:120px;background:rgba(0,0,0,0.85);color:#51cf66;overflow-y:auto;z-index:99999;font-family:monospace;font-size:11px;padding:4px;box-sizing:border-box;';
    panel.innerHTML = '<div style="color:#ffd43b;padding:2px 4px;border-bottom:1px solid #555;">🔧 Auth 调试面板 (Ctrl+Shift+D 隐藏/显示)</div>';
    document.body.appendChild(panel);

    // 快捷键隐藏
    document.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      }
    });

    // 恢复历史日志
    try {
      const logs = JSON.parse(localStorage.getItem(CONFIG.DEBUG_KEY) || '[]');
      logs.forEach(l => {
        const div = document.createElement('div');
        div.style.cssText = 'font-size:11px;font-family:monospace;padding:2px 4px;border-bottom:1px solid #333;color:#aaa;';
        div.textContent = '[历史] ' + l;
        panel.appendChild(div);
      });
    } catch(e) {}
  }

  function $(id) { return document.getElementById(id); }

  function saveAuth(token, role, name, permissions) {
    debugLog('Auth', '保存认证信息: role=' + role);
    sessionStorage.setItem(CONFIG.TOKEN_KEY, token);
    sessionStorage.setItem(CONFIG.ROLE_KEY, role);
    sessionStorage.setItem(CONFIG.NAME_KEY, name);
    sessionStorage.setItem(CONFIG.EXPIRE_KEY, String(Date.now() + 8 * 60 * 60 * 1000));
    sessionStorage.setItem(CONFIG.PERMISSIONS_KEY, JSON.stringify(permissions || {}));
  }

  function clearAuth() {
    debugLog('Auth', '清除认证信息');
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

    // 登录接口的 401 是正常业务错误（如密码错误），不要拦截
    if (res.status === 401 && path !== '/api/auth/login') {
      debugLog('API', '收到 401，清除认证', true);
      clearAuth();
      throw new Error('登录已过期（401）');
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      debugLog('API', '非JSON响应: ' + text.substring(0, 80), true);
      throw new Error('服务端返回非 JSON(' + res.status + ')：' + text.substring(0, 80));
    }

    const data = await res.json();
    debugLog('API', '响应数据: ' + JSON.stringify(data).substring(0, 200));
    return data;
  }

  window.doAdminLogin = async function() {
    ensureDebugPanel();
    debugLog('Login', '========== 登录流程开始 ==========');

    const role     = $('loginRole').value;
    const password = $('loginPassword').value;
    const errorEl  = $('loginError');

    if (errorEl) errorEl.textContent = '';
    if (!role)     { if (errorEl) errorEl.textContent = '请选择身份'; debugLog('Login', '未选身份', true); return; }
    if (!password) { if (errorEl) errorEl.textContent = '请输入密码'; debugLog('Login', '未输密码', true); return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      debugLog('Login', '请求登录 API，角色: ' + role);
      const data = await apiPost('/api/auth/login', { role, password }, false);
      if (loading) loading.style.display = 'none';

      if (!data.success) {
        debugLog('Login', '登录失败: ' + (data.error || '未知错误'), true);
        if (errorEl) errorEl.textContent = data.error || '登录失败';
        return;
      }

      debugLog('Login', '登录成功，token 获取成功');
      saveAuth(data.token, data.role, data.name, data.permissions);
      debugLog('Login', '认证信息已保存');

      // 页面切换 - 带详细检查
      const loginPage = $('loginPage');
      const tokenPage = $('tokenPage');
      const adminLayout = $('adminLayout');

      debugLog('Login', 'DOM 检查: loginPage=' + !!loginPage + ' tokenPage=' + !!tokenPage + ' adminLayout=' + !!adminLayout);

      if (loginPage) { 
        loginPage.style.display = 'none'; 
        debugLog('Login', '已隐藏 loginPage'); 
      } else { 
        debugLog('Login', '警告: 未找到 loginPage', true); 
      }

      if (tokenPage) { 
        tokenPage.style.display = 'none'; 
        debugLog('Login', '已隐藏 tokenPage'); 
      }

      if (adminLayout) { 
        adminLayout.style.display = ''; 
        debugLog('Login', '已显示 adminLayout'); 
      } else { 
        debugLog('Login', '严重: 未找到 adminLayout，尝试备用方案', true);
        // 备用：尝试其他常见 ID
        const fallbacks = ['app', 'main', 'dashboard', 'container', 'wrapper', 'content'];
        let found = false;
        for (const id of fallbacks) {
          const el = $(id);
          if (el) { 
            el.style.display = ''; 
            debugLog('Login', '备用: 显示 #' + id); 
            found = true; 
            break; 
          }
        }
        if (!found) {
          debugLog('Login', '所有备用 ID 都未找到，登录框已隐藏但后台未显示', true);
          if (errorEl) errorEl.textContent = '页面结构异常：找不到后台容器(adminLayout)';
          return;
        }
      }

      const roleEl = $('adminRole');
      const infoEl = $('adminInfo');
      if (roleEl) roleEl.textContent = data.name || '管理员';
      if (infoEl) infoEl.textContent = data.name || '管理员';
      debugLog('Login', '角色名称已更新');

      debugLog('Login', '开始加载模块配置...');
      await loadModuleConfig();
      debugLog('Login', '模块配置加载完成');

      applyModuleFilters();
      debugLog('Login', '模块过滤已应用');

      injectDevToolsEntry();
      debugLog('Login', '开发者工具入口已注入');

      setTimeout(() => {
        debugLog('Login', '延迟 50ms 执行初始化...');
        try {
          if (typeof window.initAdminApp === 'function') {
            debugLog('Login', '调用 initAdminApp()');
            window.initAdminApp();
            debugLog('Login', 'initAdminApp() 执行完成');
          } else if (typeof window.renderNav === 'function') {
            debugLog('Login', '调用 renderNav()');
            window.renderNav();
            debugLog('Login', 'renderNav() 执行完成');
          } else {
            debugLog('Login', '警告: initAdminApp 和 renderNav 都不存在', true);
          }
        } catch (initErr) {
          debugLog('Login', '初始化函数报错: ' + initErr.message, true);
          debugLog('Login', '错误堆栈: ' + (initErr.stack || '无'), true);
        }

        try {
          document.dispatchEvent(new Event('auth:ready'));
          debugLog('Login', 'auth:ready 事件已派发');
        } catch (e) {
          debugLog('Login', '派发事件失败: ' + e.message, true);
        }

        debugLog('Login', '========== 登录流程结束 ==========');
      }, 50);

    } catch (err) {
      if (loading) loading.style.display = 'none';
      const msg = '连接失败：' + (err.message || '请检查 Worker 是否已部署');
      debugLog('Login', '异常捕获: ' + msg, true);
      debugLog('Login', '异常堆栈: ' + (err.stack || '无'), true);
      if (errorEl) errorEl.textContent = msg;
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
    // 使用 replace 避免历史记录堆积
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
      debugLog('Config', '加载模块配置: ' + url);
      const res = await fetch(url, { method: 'GET' });
      debugLog('Config', '模块配置响应: ' + res.status);
      const result = await res.json();
      if (result.success && result.data) {
        setModuleConfig(result.data);
        debugLog('Config', '模块配置已保存');
      } else {
        debugLog('Config', '模块配置响应异常: ' + JSON.stringify(result), true);
      }
    } catch (err) {
      debugLog('Config', '加载模块配置失败: ' + err.message, true);
    }
  }

  function applyModuleFilters() {
    const nav = $('sidebarNav');
    if (!nav) { debugLog('Filter', '未找到 sidebarNav'); return; }

    const config = getModuleConfig();
    if (!config || !config.modules) { debugLog('Filter', '无模块配置'); return; }

    const items = nav.querySelectorAll('a, .nav-item, [onclick]');
    let hidden = 0;
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
        hidden++;
      } else {
        item.style.display = '';
      }
    });
    debugLog('Filter', '已隐藏 ' + hidden + ' 个模块');
  }

  function injectDevToolsEntry() {
    const nav = $('sidebarNav');
    const perms = getAuthPermissions();
    if (!nav || !perms.canToggleModules) { debugLog('Dev', '无权限或找不到导航'); return; }
    if (nav.querySelector('[data-module="dev-modules"]')) { debugLog('Dev', '开发者工具已存在'); return; }

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
    debugLog('Dev', '开发者工具入口已添加');
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
    ensureDebugPanel();
    const token = getToken();
    debugLog('Boot', '启动检查，token 存在: ' + !!token);
    if (!token) { debugLog('Boot', '无 token，跳过自动登录'); return; }

    const loading = $('loadingOverlay');
    if (loading) loading.style.display = 'flex';

    try {
      debugLog('Boot', '验证 token...');
      const data = await apiPost('/api/auth/verify', {}, true);
      if (loading) loading.style.display = 'none';

      if (data.valid) {
        debugLog('Boot', 'Token 有效，恢复登录状态');
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
            document.dispatchEvent(new Event('auth:ready'));
          } catch (e) {
            debugLog('Boot', '初始化报错: ' + e.message, true);
          }
        }, 50);
      } else {
        debugLog('Boot', 'Token 无效，清除认证', true);
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