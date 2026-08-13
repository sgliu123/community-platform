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
    var cardSelectors = ['.card', '.grid-item', '.feature-card', '.quick-card', '.nav-card', '.home-card', '.module-card', '.service-card', '.icon-card', '.func-card', '.menu-card'];
    var allCards = [];
    cardSelectors.forEach(function(sel) {
      var found = document.querySelectorAll(sel);
      for (var i = 0; i < found.length; i++) {
        if (allCards.indexOf(found[i]) === -1) allCards.push(found[i]);
      }
    });

    console.log('[模块开关] 找到 ' + allCards.length + ' 个候选卡片');

    allCards.forEach(function(card) {
      var page = null;
      // 方式1: 卡片自身有 data-page
      if (card.dataset && card.dataset.page) page = card.dataset.page;
      // 方式2: 子元素有 data-page
      if (!page) {
        var childWithPage = card.querySelector('[data-page]');
        if (childWithPage) page = childWithPage.dataset.page;
      }
      // 方式3: onclick 匹配 navigate('xxx') 或 navigateTo('xxx')
      if (!page) {
        var elWithClick = card.querySelector('[onclick]') || card;
        var onclickStr = elWithClick.getAttribute('onclick') || '';
        var match = onclickStr.match(/navigate(?:To)?\s*\(\s*['"](\w+)['"]\s*\)/);
        if (match) page = match[1];
      }
      // 方式4: href 匹配 #page=xxx 或 ?page=xxx
      if (!page) {
        var links = card.querySelectorAll('a[href]');
        for (var li = 0; li < links.length; li++) {
          var href = links[li].getAttribute('href') || '';
          var hrefMatch = href.match(/[#?]page=(\w+)/);
          if (hrefMatch) { page = hrefMatch[1]; break; }
        }
      }
      // 方式5: 文本内容匹配
      if (!page) {
        var text = card.textContent || '';
        var textMap = {
          '公告栏': 'announcements', '公告': 'announcements',
          '上级文件': 'documents', '文件': 'documents',
          '社区动态': 'activities', '动态': 'activities',
          '投票征集': 'polls', '投票': 'polls',
          '我要报修': 'workorders', '报修': 'workorders',
          '投诉建议': 'complaints', '投诉': 'complaints', '反馈': 'complaints',
          '生活服务': 'life', '生活': 'life',
          '房屋租售': 'trade', '租售': 'trade', '交易': 'trade', '房屋': 'trade',
          '我的报修': 'workorders',
          '我的反馈': 'complaints'
        };
        for (var key in textMap) {
          if (text.indexOf(key) >= 0) { page = textMap[key]; break; }
        }
      }
      // 方式6: 图片 alt 或 title 匹配
      if (!page) {
        var imgs = card.querySelectorAll('img[alt], img[title]');
        for (var ii = 0; ii < imgs.length; ii++) {
          var imgText = (imgs[ii].getAttribute('alt') || '') + (imgs[ii].getAttribute('title') || '');
          if (imgText.indexOf('公告') >= 0) { page = 'announcements'; break; }
          if (imgText.indexOf('文件') >= 0) { page = 'documents'; break; }
          if (imgText.indexOf('动态') >= 0) { page = 'activities'; break; }
          if (imgText.indexOf('投票') >= 0) { page = 'polls'; break; }
          if (imgText.indexOf('报修') >= 0) { page = 'workorders'; break; }
          if (imgText.indexOf('投诉') >= 0) { page = 'complaints'; break; }
          if (imgText.indexOf('生活') >= 0) { page = 'life'; break; }
          if (imgText.indexOf('交易') >= 0 || imgText.indexOf('租售') >= 0) { page = 'trade'; break; }
        }
      }
      // 执行隐藏
      if (page && switches[page] === false) {
        card.style.display = 'none';
        console.log('[模块开关] 隐藏卡片: ' + page + ' (匹配方式: 自动推断)');
      }
    });

    // 兜底：遍历所有可能包含模块链接的元素
    var allClickable = document.querySelectorAll('a, button, [onclick], [data-page]');
    allClickable.forEach(function(el) {
      if (el.style.display === 'none') return;
      var page = el.dataset ? el.dataset.page : null;
      if (!page && el.getAttribute) {
        var oc = el.getAttribute('onclick') || '';
        var m = oc.match(/navigate(?:To)?\s*\(\s*['"](\w+)['"]\s*\)/);
        if (m) page = m[1];
      }
      if (page && switches[page] === false) {
        var parentCard = el.closest('.card, .grid-item, .feature-card, .quick-card, .nav-card, .home-card, .module-card, .service-card, .icon-card, .func-card, .menu-card, div');
        if (parentCard && parentCard !== el) {
          parentCard.style.display = 'none';
          console.log('[模块开关] 隐藏卡片(兜底): ' + page);
        } else {
          el.style.display = 'none';
        }
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

  // MutationObserver：监听 DOM 变化，自动过滤新添加的卡片
  var _observer = new MutationObserver(function(mutations) {
    var hasNewNodes = false;
    mutations.forEach(function(mutation) {
      if (mutation.addedNodes.length > 0) hasNewNodes = true;
    });
    if (hasNewNodes) {
      console.log('[模块开关] DOM 变化，重新过滤');
      applyNavFilter();
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
  console.log('[模块开关] MutationObserver 已启动');
})();
