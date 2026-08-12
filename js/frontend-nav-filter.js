/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  var MODULE_KEYS = ['announcements','documents','activities','polls','workorders','complaints','life','trade'];
  var HIDDEN_ATTR = 'data-nav-hidden';

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

  function hideElement(el) {
    if (el.getAttribute(HIDDEN_ATTR) === '1') return;
    el.setAttribute(HIDDEN_ATTR, '1');
    el.style.display = 'none';
  }

  function applyFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;

    MODULE_KEYS.forEach(function(key){
      if (switches[key] !== false) return;

      // 1. 顶部导航
      var navSelectors = ['[data-page="' + key + '"]', 'a[href*="' + key + '"]', '.nav-' + key];
      navSelectors.forEach(function(sel){
        document.querySelectorAll(sel).forEach(hideElement);
      });

      // 2. 首页卡片 — 通过 onclick 匹配 navigate('xxx')
      var patterns = ["navigate('" + key + "')", 'navigate("' + key + '")'];
      document.querySelectorAll('[onclick], [data-page]').forEach(function(el) {
        if (el.getAttribute(HIDDEN_ATTR) === '1') return;
        var onclickStr = el.getAttribute('onclick') || '';
        var dataPage = el.getAttribute('data-page') || '';
        var shouldHide = dataPage === key;
        if (!shouldHide) {
          for (var p = 0; p < patterns.length; p++) {
            if (onclickStr.indexOf(patterns[p]) !== -1) { shouldHide = true; break; }
          }
        }
        if (shouldHide) {
          var card = el.closest('.card, .grid-item, .feature-card, .quick-card, .nav-card');
          hideElement(card && card !== el ? card : el);
        }
      });
    });
  }

  // 拦截 navigate，阻止进入已关闭模块
  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var orig = window.navigate;
    window.navigate = function(page) {
      var switches = getModuleSwitches();
      if (switches && switches[page] === false) {
        console.log('[模块开关] ' + page + ' 已关闭');
        return;
      }
      var ret = orig.apply(this, arguments);
      // SPA 切换后延迟过滤一次
      setTimeout(applyFilter, 50);
      return ret;
    };
  }

  // 轻量 MutationObserver：只监听 #main 的子树变化
  function observeMain() {
    var main = document.getElementById('main');
    if (!main) return;
    var observer = new MutationObserver(function() { applyFilter(); });
    observer.observe(main, { childList: true, subtree: true });
  }

  function init() {
    applyFilter();
    interceptNavigate();
    observeMain();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 兜底：页面加载过程中多次执行，确保 SPA 初始渲染完成
  [0, 50, 100, 200, 500].forEach(function(t){ setTimeout(applyFilter, t); });

  // 监听其他标签页修改 localStorage
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyFilter();
    }
  });
})();
