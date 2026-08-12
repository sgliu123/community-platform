/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 (CSS注入版) */
(function(){
  var STYLE_ID = 'module-switch-css';

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

  function injectCSS() {
    var switches = getModuleSwitches();
    if (!switches) return;

    var rules = [];
    var keys = ['announcements','documents','activities','polls','workorders','complaints','life','trade'];

    keys.forEach(function(key) {
      if (switches[key] === false) {
        // 导航栏
        rules.push('[data-page="' + key + '"]{display:none!important}');
        rules.push('a[href*="' + key + '"]{display:none!important}');
        rules.push('.nav-' + key + '{display:none!important}');
        // 首页卡片：匹配 onclick 中包含 navigate('xxx') 的元素及其容器
        rules.push('[onclick*="navigate(\'' + key + '\')"],[onclick*="navigate(\\\'' + key + '\\\')"],[onclick*="navigate(\"' + key + '\")"]{display:none!important}');
      }
    });

    if (rules.length === 0) return;

    var css = rules.join('\n');
    var oldStyle = document.getElementById(STYLE_ID);
    if (oldStyle) {
      oldStyle.textContent = css;
    } else {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = css;
      document.head.appendChild(style);
    }
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

  function init() {
    injectCSS();
    interceptNavigate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听 localStorage 变化（后台在其他标签页修改时）
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      injectCSS();
    }
  });
})();
