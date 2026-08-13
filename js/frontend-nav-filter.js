/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  var _lastSwitches = null;

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

    // 顶部导航栏
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

    // 首页卡片/按钮：多种方式匹配模块
    var cardSelectors = ['.card', '.grid-item', '.feature-card', '.quick-card', '.nav-card', '.home-card', '.module-card', '.service-card'];
    var allCards = [];
    cardSelectors.forEach(function(sel) {
      var found = document.querySelectorAll(sel);
      for (var i = 0; i < found.length; i++) {
        if (allCards.indexOf(found[i]) === -1) allCards.push(found[i]);
      }
    });

    allCards.forEach(function(card) {
      var page = null;
      // 方式1: 卡片自身有 data-page
      if (card.dataset && card.dataset.page) page = card.dataset.page;
      // 方式2: 子元素有 data-page
      if (!page) {
        var childWithPage = card.querySelector('[data-page]');
        if (childWithPage) page = childWithPage.dataset.page;
      }
      // 方式3: onclick 匹配 navigate('xxx')
      if (!page) {
        var elWithClick = card.querySelector('[onclick]') || card;
        var onclickStr = elWithClick.getAttribute('onclick') || '';
        var match = onclickStr.match(/navigate\s*\(\s*['"](\w+)['"]\s*\)/);
        if (match) page = match[1];
      }
      // 方式4: href 匹配 #page=xxx
      if (!page) {
        var link = card.querySelector('a[href*="#"]');
        if (link) {
          var hrefMatch = link.getAttribute('href').match(/#page=(\w+)/);
          if (hrefMatch) page = hrefMatch[1];
        }
      }
      // 方式5: 文本内容匹配（公告栏->announcements 等）
      if (!page) {
        var text = card.textContent || '';
        var textMap = {
          '公告': 'announcements',
          '文件': 'documents',
          '动态': 'activities',
          '投票': 'polls',
          '工单': 'workorders',
          '报修': 'workorders',
          '投诉': 'complaints',
          '反馈': 'complaints',
          '生活': 'life',
          '交易': 'trade',
          '房屋': 'trade',
          '租售': 'trade'
        };
        for (var key in textMap) {
          if (text.indexOf(key) >= 0) { page = textMap[key]; break; }
        }
      }
      // 执行隐藏
      if (page && switches[page] === false) {
        card.style.display = 'none';
        console.log('[模块开关] 隐藏卡片: ' + page);
      }
    });
  }

  // 拦截 navigate 函数
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

  // 仅通过 storage 事件跨标签页同步，去掉轮询
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });
})();
