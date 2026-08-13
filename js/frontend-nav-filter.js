/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  var _lastSwitches = null;
  var _initTimer = null;
  var _checkCount = 0;

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

  // 文本到模块的映射
  var textToModule = {
    '公告栏': 'announcements', '公告管理': 'announcements', '最新公告': 'announcements',
    '上级文件': 'documents', '文件管理': 'documents', '社区文件': 'documents',
    '社区动态': 'activities', '动态管理': 'activities', '最新动态': 'activities',
    '投票征集': 'polls', '投票管理': 'polls', '民意调查': 'polls',
    '我要报修': 'workorders', '工单管理': 'workorders', '报修服务': 'workorders',
    '投诉建议': 'complaints', '投诉管理': 'complaints', '反馈': 'complaints',
    '生活服务': 'life', '生活': 'life', '便民生活': 'life',
    '房屋租售': 'trade', '租售': 'trade', '交易管理': 'trade', '房屋租售和物品交易': 'trade',
    '我的报修': 'workorders', '我的反馈': 'complaints'
  };

  // 链接/路由到模块的映射
  var routeToModule = {
    'announcements': 'announcements', 'documents': 'documents', 'activities': 'activities',
    'polls': 'polls', 'workorders': 'workorders', 'complaints': 'complaints',
    'life': 'life', 'trade': 'trade'
  };

  function inferModuleFromElement(el) {
    // 方式1: 自身或子元素的 data-page
    var page = el.dataset ? el.dataset.page : null;
    if (!page) {
      var child = el.querySelector('[data-page]');
      if (child) page = child.dataset.page;
    }
    if (page && routeToModule[page]) return routeToModule[page];

    // 方式2: 检查所有子链接的 href
    var links = el.querySelectorAll('a[href]');
    for (var li = 0; li < links.length; li++) {
      var href = links[li].getAttribute('href') || '';
      for (var rkey in routeToModule) {
        if (href.indexOf(rkey) >= 0 || href.indexOf('#' + rkey) >= 0 || href.indexOf('page=' + rkey) >= 0) {
          return routeToModule[rkey];
        }
      }
      // 检查 life.html / trade.html
      if (href.indexOf('life.html') >= 0) return 'life';
      if (href.indexOf('trade.html') >= 0) return 'trade';
    }

    // 方式3: 检查 onclick
    var clickable = el.querySelector('[onclick]') || el;
    var onclickStr = clickable.getAttribute('onclick') || '';
    var match = onclickStr.match(/navigate(?:To)?\s*\(\s*['"](\w+)['"]\s*\)/);
    if (match && routeToModule[match[1]]) return routeToModule[match[1]];

    // 方式4: 文本内容匹配
    var text = (el.textContent || '').replace(/\s+/g, '');
    for (var tkey in textToModule) {
      if (text.indexOf(tkey) >= 0) return textToModule[tkey];
    }

    // 方式5: 检查图片 alt/title
    var imgs = el.querySelectorAll('img[alt], img[title]');
    for (var ii = 0; ii < imgs.length; ii++) {
      var imgText = (imgs[ii].getAttribute('alt') || '') + (imgs[ii].getAttribute('title') || '');
      for (var tkey2 in textToModule) {
        if (imgText.indexOf(tkey2) >= 0) return textToModule[tkey2];
      }
    }

    return null;
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) {
      console.log('[模块开关] 未找到配置');
      return;
    }
    console.log('[模块开关] 应用过滤，配置:', JSON.stringify(switches));

    // 顶部导航栏过滤（保留首页）
    var navMap = {
      'announcements': ['[data-page="announcements"]'],
      'polls': ['[data-page="polls"]'],
      'workorders': ['[data-page="workorders"]'],
      'complaints': ['[data-page="complaints"]'],
      'activities': ['[data-page="activities"]'],
      'documents': ['[data-page="documents"]']
    };
    Object.keys(switches).forEach(function(key){
      if (switches[key] === false) {
        var navSelectors = navMap[key] || ['[data-page="'+key+'"]'];
        navSelectors.forEach(function(sel){
          var els = document.querySelectorAll(sel);
          for (var j = 0; j < els.length; j++) {
            els[j].style.display = 'none';
          }
        });
      }
    });

    // ===== 首页卡片过滤（核心改进） =====
    // 策略：扫描 main 区域的所有可见块级元素
    var mainEl = document.querySelector('main');
    if (!mainEl) {
      console.log('[模块开关] 未找到 main 元素');
      return;
    }

    // 收集所有候选卡片元素
    var candidates = [];

    // 1. 常见卡片类名
    var cardSelectors = [
      '.card', '.grid-item', '.feature-card', '.quick-card', '.nav-card', 
      '.home-card', '.module-card', '.service-card', '.icon-card', '.func-card', 
      '.menu-card', '.service-grid > div', '.quick-links > div', 
      '.home-modules > div', '.module-list > div', '.grid > div', '.flex > div',
      '.stat-card', '.info-card', '.dashboard-card', '.entry-card',
      'main > div > div', 'main > section > div'
    ];
    cardSelectors.forEach(function(sel) {
      try {
        var found = document.querySelectorAll(sel);
        for (var i = 0; i < found.length; i++) {
          if (candidates.indexOf(found[i]) === -1) candidates.push(found[i]);
        }
      } catch(e) {}
    });

    // 2. main 下的直接子 div（可能是卡片容器）
    var mainChildren = mainEl.querySelectorAll(':scope > div');
    mainChildren.forEach(function(child) {
      if (candidates.indexOf(child) === -1) candidates.push(child);
      // 再深入一层
      var grandChildren = child.querySelectorAll(':scope > div');
      grandChildren.forEach(function(gc) {
        if (candidates.indexOf(gc) === -1) candidates.push(gc);
      });
    });

    console.log('[模块开关] 扫描到 ' + candidates.length + ' 个候选元素');

    var hiddenCount = 0;
    candidates.forEach(function(card) {
      if (card.style.display === 'none') return;

      var page = inferModuleFromElement(card);
      if (page && switches[page] === false) {
        card.style.display = 'none';
        hiddenCount++;
        console.log('[模块开关] 隐藏卡片: ' + page + ', 文本: ' + (card.textContent || '').substring(0, 20));
      }
    });

    // 3. 暴力兜底：扫描 main 下所有包含特定文本的 div
    var allDivs = mainEl.querySelectorAll('div');
    allDivs.forEach(function(div) {
      if (div.style.display === 'none') return;
      // 只处理包含文本的直接文本节点或子元素
      var text = (div.textContent || '').replace(/\s+/g, '');
      var matchedPage = null;
      for (var tkey in textToModule) {
        if (text.indexOf(tkey) >= 0) { 
          matchedPage = textToModule[tkey]; 
          break; 
        }
      }
      if (matchedPage && switches[matchedPage] === false) {
        // 找到最外层包含该文本的容器（避免只隐藏文字而留下空壳）
        var container = div;
        while (container.parentElement && container.parentElement !== mainEl && 
               container.parentElement.children.length <= 4) {
          container = container.parentElement;
        }
        if (container.style.display !== 'none') {
          container.style.display = 'none';
          hiddenCount++;
          console.log('[模块开关] 兜底隐藏: ' + matchedPage);
        }
      }
    });

    console.log('[模块开关] 共隐藏 ' + hiddenCount + ' 个元素');
  }

  // 拦截 navigate 函数
  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var originalNavigate = window.navigate;
    window.navigate = function(page) {
      var switches = getModuleSwitches();
      if (switches && switches[page] === false) {
        console.log('[模块开关] ' + page + ' 已关闭，禁止跳转');
        // 显示提示
        if (typeof showToast === 'function') {
          showToast('该模块已关闭', 'info');
        }
        return;
      }
      return originalNavigate.apply(this, arguments);
    };
  }

  function init() {
    console.log('[模块开关] 初始化...');
    applyNavFilter();
    interceptNavigate();
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 延迟多次执行，确保动态内容加载后被过滤
  _initTimer = setInterval(function() {
    _checkCount++;
    applyNavFilter();
    if (_checkCount >= 10) {
      clearInterval(_initTimer);
      console.log('[模块开关] 初始化完成，停止轮询');
    }
  }, 300);

  // storage 事件跨标签页同步
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      console.log('[模块开关] 检测到配置变更，重新过滤');
      applyNavFilter();
    }
  });

  // MutationObserver：监听 DOM 变化
  var _observer = new MutationObserver(function(mutations) {
    var hasNewNodes = false;
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length > 0) hasNewNodes = true;
    });
    if (hasNewNodes) {
      // 延迟执行，避免频繁触发
      clearTimeout(window._filterDebounceTimer);
      window._filterDebounceTimer = setTimeout(function() {
        console.log('[模块开关] DOM 变化，重新过滤');
        applyNavFilter();
      }, 100);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
  console.log('[模块开关] MutationObserver 已启动');
})();