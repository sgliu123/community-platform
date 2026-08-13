/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  var _checkCount = 0;
  var _initTimer = null;

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

  // 模块关键词
  var MODULES = {
    announcements: ['公告栏', '最新公告', '公告管理'],
    documents: ['上级文件', '文件管理', '社区文件'],
    activities: ['社区动态', '动态管理', '最新动态'],
    polls: ['投票征集', '投票管理', '民意调查'],
    workorders: ['我要报修', '工单管理', '报修服务', '我的报修'],
    complaints: ['投诉建议', '投诉管理', '反馈', '我的反馈'],
    life: ['生活服务', '便民生活'],
    trade: ['房屋租售和物品交易', '房屋租售', '租售', '交易管理']
  };

  // 判断元素文本是否匹配模块
  function matchModule(el) {
    var text = (el.textContent || '').trim();
    for (var mod in MODULES) {
      var keywords = MODULES[mod];
      for (var i = 0; i < keywords.length; i++) {
        if (text.indexOf(keywords[i]) >= 0) return mod;
      }
    }
    return null;
  }

  // 深度优先遍历，只隐藏叶子匹配元素
  function hideLeafMatches(el, switches, depth) {
    depth = depth || 0;
    if (depth > 10) return; // 防止过深

    var mod = matchModule(el);
    var children = el.children;
    var hasMatchingChild = false;

    // 先检查子元素
    for (var i = 0; i < children.length; i++) {
      var childMod = matchModule(children[i]);
      if (childMod && switches[childMod] === false) {
        hasMatchingChild = true;
        hideLeafMatches(children[i], switches, depth + 1);
      }
    }

    // 如果当前元素匹配且没有匹配的子元素（是叶子），隐藏它
    if (mod && switches[mod] === false && !hasMatchingChild) {
      // 但如果当前元素就是main或body，不隐藏
      if (el.tagName === 'MAIN' || el.tagName === 'BODY') return;

      el.setAttribute('data-module-hidden', mod);
      el.style.display = 'none';
      console.log('[模块开关] 隐藏(' + mod + '): ' + (el.textContent||'').substring(0,20).replace(/\s+/g,' '));
    }
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;

    console.log('[模块开关] 应用过滤:', JSON.stringify(switches));

    // 1. 恢复之前隐藏的元素
    var mainEl = document.querySelector('main');
    if (mainEl) {
      var hidden = mainEl.querySelectorAll('[data-module-hidden]');
      hidden.forEach(function(el) {
        el.style.display = '';
        el.removeAttribute('data-module-hidden');
      });
    }

    // 2. 顶部导航栏
    var navItems = document.querySelectorAll('#headerNav a, #headerNav [data-page]');
    navItems.forEach(function(el) {
      var page = el.dataset ? el.dataset.page : null;
      if (!page) {
        var oc = el.getAttribute('onclick') || '';
        var m = oc.match(/navigate\s*\(\s*['"](\w+)['"]\s*\)/);
        if (m) page = m[1];
      }
      if (page && switches[page] === false) {
        el.style.display = 'none';
      } else if (page) {
        el.style.display = '';
      }
    });

    // 3. 首页内容 - 深度优先隐藏叶子
    if (mainEl) {
      var children = mainEl.children;
      for (var i = 0; i < children.length; i++) {
        hideLeafMatches(children[i], switches, 0);
      }
    }
  }

  // 拦截 navigate
  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var original = window.navigate;
    window.navigate = function(page) {
      var switches = getModuleSwitches();
      if (switches && switches[page] === false) {
        if (typeof showToast === 'function') showToast('该模块已关闭', 'info');
        return;
      }
      return original.apply(this, arguments);
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

  _initTimer = setInterval(function() {
    _checkCount++;
    applyNavFilter();
    if (_checkCount >= 15) clearInterval(_initTimer);
  }, 200);

  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });

  var _observer = new MutationObserver(function(mutations) {
    var hasNew = false;
    mutations.forEach(function(m) {
      if (m.addedNodes.length > 0) hasNew = true;
    });
    if (hasNew) {
      clearTimeout(window._filterDebounceTimer);
      window._filterDebounceTimer = setTimeout(applyNavFilter, 150);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
})();