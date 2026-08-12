/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
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

  // 需要隐藏的模块 key
  var MODULE_KEYS = ['announcements','documents','activities','polls','workorders','complaints','life','trade'];

  function hideElements(key) {
    // 1. 顶部导航
    var navSelectors = [
      '[data-page="' + key + '"]',
      'a[href*="' + key + '"]',
      '.nav-' + key
    ];
    navSelectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
    });

    // 2. 首页卡片/按钮 — 通过 onclick 中的 navigate 调用来识别
    var patterns = [
      "navigate('" + key + "')",
      'navigate("' + key + '")',
      "navigate('" + key,
      'navigate("' + key
    ];
    document.querySelectorAll('[onclick], [data-page]').forEach(function(el) {
      var onclickStr = (el.getAttribute('onclick') || '').replace(/\s/g, '');
      var dataPage = el.getAttribute('data-page') || '';
      var shouldHide = false;
      if (dataPage === key) shouldHide = true;
      if (!shouldHide) {
        for (var p = 0; p < patterns.length; p++) {
          if (onclickStr.indexOf(patterns[p].replace(/\s/g, '')) !== -1) {
            shouldHide = true; break;
          }
        }
      }
      if (shouldHide) {
        var card = el.closest('.card, .grid-item, .feature-card, .quick-card, .nav-card, [class*="card"], [class*="item"]');
        if (card && card !== el) {
          card.style.display = 'none';
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;
    MODULE_KEYS.forEach(function(key){
      if (switches[key] === false) {
        hideElements(key);
      }
    });
  }

  // 拦截 navigate 函数，阻止进入已关闭模块
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

  // 用 MutationObserver 实时监听 DOM 变化，卡片一出现就隐藏，消除延迟
  function observeDOM() {
    var target = document.getElementById('main') || document.body;
    if (!target) return;
    var observer = new MutationObserver(function(mutations) {
      applyNavFilter();
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    applyNavFilter();
    interceptNavigate();
    observeDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // 兜底：极短间隔快速执行几次，确保 SPA 路由切换后也能及时过滤
  [50, 150, 300, 600, 1000].forEach(function(t){ setTimeout(applyNavFilter, t); });

  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });
})();
