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

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;

    // 1. 顶部导航栏
    var navMap = {
      'announcements': ['[data-page="announcements"]', 'a[href*="announcements"]', '.nav-announcements'],
      'polls': ['[data-page="polls"]', 'a[href*="polls"]', '.nav-polls'],
      'workorders': ['[data-page="workorders"]', 'a[href*="workorders"]', '.nav-workorders'],
      'complaints': ['[data-page="complaints"]', 'a[href*="complaints"]', '.nav-complaints'],
      'activities': ['[data-page="activities"]', 'a[href*="activities"]', '.nav-activities'],
      'documents': ['[data-page="documents"]', 'a[href*="documents"]', '.nav-documents']
    };

    // 2. 首页快捷卡片（通过 onclick 中的 navigate 调用来识别）
    var navigateMap = {
      'polls': ["navigate('polls')", 'navigate("polls")', "navigate('polls"],
      'workorders': ["navigate('workorders')", 'navigate("workorders")', "navigate('workorders"],
      'complaints': ["navigate('complaints')", 'navigate("complaints")', "navigate('complaints"],
      'activities': ["navigate('activities')", 'navigate("activities")', "navigate('activities"],
      'documents': ["navigate('documents')", 'navigate("documents")', "navigate('documents"],
      'announcements': ["navigate('announcements')", 'navigate("announcements")', "navigate('announcements"]
    };

    Object.keys(switches).forEach(function(key){
      if (switches[key] === false) {
        // 隐藏导航栏
        var navSelectors = navMap[key] || ['[data-page="'+key+'"]'];
        navSelectors.forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
        });

        // 隐藏首页卡片/按钮（匹配 onclick 中包含 navigate('xxx') 的元素，并隐藏其卡片容器）
        var navPatterns = navigateMap[key] || [];
        document.querySelectorAll('[onclick], [data-page]').forEach(function(el) {
          var onclickStr = (el.getAttribute('onclick') || '').replace(/\s/g, '');
          var dataPage = el.getAttribute('data-page') || '';
          var shouldHide = false;
          // 通过 data-page 匹配
          if (dataPage === key) shouldHide = true;
          // 通过 onclick 中的 navigate 匹配
          if (!shouldHide) {
            for (var p = 0; p < navPatterns.length; p++) {
              if (onclickStr.indexOf(navPatterns[p].replace(/\s/g, '')) !== -1) {
                shouldHide = true; break;
              }
            }
          }
          if (shouldHide) {
            // 尝试向上查找卡片容器（常见类名），否则隐藏自身
            var card = el.closest('.card, .grid-item, .feature-card, .quick-card, .nav-card, [class*="card"], [class*="item"]');
            if (card && card !== el) {
              card.style.display = 'none';
            } else {
              el.style.display = 'none';
            }
          }
        });
      }
    });
  }

  // 拦截 navigate 函数，从功能层面阻止进入已关闭模块
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(applyNavFilter, 100);
  setTimeout(applyNavFilter, 500);
  setTimeout(applyNavFilter, 1000);
  setTimeout(applyNavFilter, 2000);
  setInterval(applyNavFilter, 3000);

  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });
})();
