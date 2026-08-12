/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  // 检测是否在后台页面（admin.html），如果是则只执行最小化逻辑
  var isAdminPage = !!document.getElementById('adminLayout') || !!document.getElementById('sidebarNav');

  function getModuleSwitches() {
    var keys = ['adminData_config', 'config', 'app_config', 'community_config'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.moduleSwitches) return parsed.moduleSwitches;
          if (parsed && parsed.data && parsed.data.moduleSwitches) return parsed.data.moduleSwitches;
          if (parsed && parsed.config && parsed.config.moduleSwitches) return parsed.config.moduleSwitches;
        }
      } catch(e) {}
    }
    try {
      var adminRaw = localStorage.getItem('adminData');
      if (adminRaw) {
        var adminParsed = JSON.parse(adminRaw);
        if (adminParsed && adminParsed.config && adminParsed.config.moduleSwitches) {
          return adminParsed.config.moduleSwitches;
        }
      }
    } catch(e) {}
    return null;
  }

  var MODULE_KEYS = ['announcements','documents','activities','polls','workorders','complaints','life','trade'];

  function hideElements(key) {
    var navSelectors = ['[data-page="' + key + '"]', 'a[href*="' + key + '"]', '.nav-' + key];
    navSelectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
    });
    var patterns = ["navigate('" + key + "')", 'navigate("' + key + '")', "navigate('" + key, 'navigate("' + key];
    document.querySelectorAll('[onclick], [data-page]').forEach(function(el) {
      var onclickStr = (el.getAttribute('onclick') || '').replace(/\s/g, '');
      var dataPage = el.getAttribute('data-page') || '';
      var shouldHide = false;
      if (dataPage === key) shouldHide = true;
      if (!shouldHide) {
        for (var p = 0; p < patterns.length; p++) {
          if (onclickStr.indexOf(patterns[p].replace(/\s/g, '')) !== -1) { shouldHide = true; break; }
        }
      }
      if (shouldHide) {
        var card = el.closest('.card, .grid-item, .feature-card, .quick-card, .nav-card, [class*="card"], [class*="item"]');
        if (card && card !== el) { card.style.display = 'none'; } else { el.style.display = 'none'; }
      }
    });
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;
    MODULE_KEYS.forEach(function(key){
      if (switches[key] === false) hideElements(key);
    });
  }

  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var originalNavigate = window.navigate;
    window.navigate = function(page) {
      var switches = getModuleSwitches();
      if (switches && switches[page] === false) {
        console.log('[模块开关] ' + page + ' 已关闭，禁止跳转');
        return;
      }
      return originalNavigate.apply(this, arguments);
    };
  }

  function init() {
    applyNavFilter();
    interceptNavigate();
    // 只在非后台页面启用 MutationObserver，避免 admin 页面卡顿
    if (!isAdminPage) {
      var target = document.getElementById('main') || document.body;
      if (target && window.MutationObserver) {
        var observer = new MutationObserver(function() { applyNavFilter(); });
        observer.observe(target, { childList: true, subtree: true });
      }
      // 前台兜底：极短间隔快速执行
      [50, 150, 300, 600].forEach(function(t){ setTimeout(applyNavFilter, t); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });
})();
