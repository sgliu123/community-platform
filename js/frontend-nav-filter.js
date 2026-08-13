/* frontend-nav-filter.js - 前台模块开关过滤 */
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

  var textToModule = {
    '公告栏': 'announcements',
    '上级文件': 'documents',
    '社区动态': 'activities',
    '投票征集': 'polls',
    '我要报修': 'workorders',
    '投诉建议': 'complaints',
    '生活服务': 'life',
    '房屋租售和物品交易': 'trade',
    '我的报修': 'workorders',
    '我的反馈': 'complaints'
  };

  function getModuleFromElement(el) {
    // 方式1: onclick navigate
    var onclick = el.getAttribute('onclick') || '';
    var m = onclick.match(/navigate\s*\(\s*['"](\w+)['"]\s*\)/);
    if (m) return m[1];

    // 方式2: data-page
    if (el.dataset && el.dataset.page) return el.dataset.page;

    // 方式3: 文本匹配
    var text = (el.textContent || '').replace(/\s+/g, '');
    for (var key in textToModule) {
      if (text.indexOf(key) >= 0) return textToModule[key];
    }

    // 方式4: href
    var href = el.getAttribute('href') || '';
    if (href.indexOf('life.html') >= 0) return 'life';
    if (href.indexOf('trade.html') >= 0) return 'trade';
    var hm = href.match(/[#?]page=(\w+)/);
    if (hm) return hm[1];

    return null;
  }

  function applyFilter() {
    var switches = getModuleSwitches();
    if (!switches) return;

    var mainEl = document.querySelector('main');
    if (!mainEl) return;

    console.log('[模块开关] 配置:', JSON.stringify(switches));

    // 收集 main 内所有元素
    var allEls = Array.from(mainEl.querySelectorAll('*'));

    // 逐个处理被关闭的模块
    Object.keys(switches).forEach(function(module) {
      if (switches[module] !== false) return;

      // 找到所有匹配该模块的元素
      var matches = allEls.filter(function(el) {
        return getModuleFromElement(el) === module;
      });

      if (matches.length === 0) {
        console.log('[模块开关] 未找到 ' + module);
        return;
      }

      // 过滤出叶子节点：不包含其他匹配元素的元素
      var leaves = matches.filter(function(el) {
        for (var i = 0; i < matches.length; i++) {
          if (matches[i] !== el && el.contains(matches[i])) {
            return false; // el 包含另一个匹配，说明 el 是父容器
          }
        }
        return true;
      });

      console.log('[模块开关] ' + module + ': ' + matches.length + ' 匹配, ' + leaves.length + ' 叶子');

      // 隐藏叶子节点
      leaves.forEach(function(leaf) {
        // 安全检查：如果叶子节点包含超过 30 个子元素，可能是误匹配的容器
        var childCount = leaf.querySelectorAll('*').length;
        if (childCount > 30) {
          console.log('[模块开关] 跳过可能的大容器(' + childCount + '子元素):', leaf.tagName, leaf.className || '');
          return;
        }

        leaf.style.display = 'none';
        console.log('[模块开关] 已隐藏 ' + module + ':', leaf.tagName, leaf.className || '(no class)');
      });
    });
  }

  function init() {
    applyFilter();

    // 拦截 navigate
    if (typeof window.navigate === 'function') {
      var orig = window.navigate;
      window.navigate = function(page) {
        var switches = getModuleSwitches();
        if (switches && switches[page] === false) {
          console.log('[模块开关] 禁止跳转:', page);
          return;
        }
        return orig.apply(this, arguments);
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 多次重试（动态渲染的内容）
  var count = 0;
  var timer = setInterval(function() {
    count++;
    applyFilter();
    if (count >= 8) clearInterval(timer);
  }, 250);

  // MutationObserver
  var observer = new MutationObserver(function(mutations) {
    var hasNew = mutations.some(function(m) { return m.addedNodes.length > 0; });
    if (hasNew) {
      clearTimeout(window._debounceTimer);
      window._debounceTimer = setTimeout(applyFilter, 100);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();