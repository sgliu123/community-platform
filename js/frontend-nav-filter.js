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

  // 模块关键字映射（用于文本匹配）
  var MODULE_KEYWORDS = {
    announcements: ['公告栏', '最新公告', '公告管理', '社区公告'],
    documents: ['上级文件', '文件管理', '社区文件'],
    activities: ['社区动态', '动态管理', '最新动态'],
    polls: ['投票征集', '投票管理', '民意调查'],
    workorders: ['我要报修', '工单管理', '报修服务', '我的报修'],
    complaints: ['投诉建议', '投诉管理', '我的反馈', '反馈'],
    life: ['生活服务', '便民生活'],
    trade: ['房屋租售和物品交易', '房屋租售', '租售', '交易管理']
  };

  // 从元素自身属性推断模块
  function getModuleFromElement(el) {
    // 1. data-page
    var dp = el.getAttribute('data-page');
    if (dp && MODULE_KEYWORDS[dp]) return dp;

    // 2. onclick navigate
    var oc = el.getAttribute('onclick') || '';
    var m = oc.match(/navigate(?:To)?\s*\(\s*['"](\w+)['"]\s*\)/);
    if (m && MODULE_KEYWORDS[m[1]]) return m[1];

    // 3. href
    var href = el.getAttribute('href') || '';
    if (href.indexOf('life.html') >= 0) return 'life';
    if (href.indexOf('trade.html') >= 0) return 'trade';
    var hm = href.match(/[#?]page=(\w+)/);
    if (hm && MODULE_KEYWORDS[hm[1]]) return hm[1];

    return null;
  }

  // 从元素文本推断模块
  function getModuleFromText(el) {
    var text = (el.textContent || '').replace(/\s+/g, '');
    for (var mod in MODULE_KEYWORDS) {
      var keywords = MODULE_KEYWORDS[mod];
      for (var k = 0; k < keywords.length; k++) {
        if (text.indexOf(keywords[k]) >= 0) {
          return mod;
        }
      }
    }
    return null;
  }

  // 获取元素在页面中的"面积"（用于判断是否是容器）
  function getElementArea(el) {
    var rect = el.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) {
      console.log('[模块开关] 未找到配置');
      return;
    }
    console.log('[模块开关] 配置:', JSON.stringify(switches));

    var mainEl = document.querySelector('main');
    if (!mainEl) {
      console.log('[模块开关] 未找到 main');
      return;
    }

    var hiddenCount = 0;

    // === 阶段1: 隐藏顶部导航中已关闭的模块 ===
    var navLinks = document.querySelectorAll('#headerNav a');
    navLinks.forEach(function(a) {
      var mod = getModuleFromElement(a);
      if (mod && switches[mod] === false) {
        a.style.display = 'none';
        hiddenCount++;
      }
    });

    // === 阶段2: 扫描 main 内所有可见块级元素 ===
    // 收集候选元素：所有 div, a, button, section 以及带常见卡片类名的元素
    var candidates = [];
    var selectors = [
      'main div', 'main a', 'main button', 'main section',
      'main .card', 'main .grid-item', 'main .feature-card',
      'main .quick-card', 'main .nav-card', 'main .home-card',
      'main .module-card', 'main .service-card', 'main .icon-card'
    ];
    selectors.forEach(function(sel) {
      try {
        var found = mainEl.querySelectorAll(sel);
        for (var i = 0; i < found.length; i++) {
          if (candidates.indexOf(found[i]) === -1) {
            candidates.push(found[i]);
          }
        }
      } catch(e) {}
    });

    console.log('[模块开关] 候选元素数:', candidates.length);

    // 处理每个候选元素
    candidates.forEach(function(el) {
      // 跳过已隐藏的
      if (el.style.display === 'none') return;
      // 跳过太小的元素（可能是图标、文字片段）
      var rect = el.getBoundingClientRect();
      if (rect.width < 30 || rect.height < 30) return;

      // 尝试从属性推断模块
      var mod = getModuleFromElement(el);
      if (!mod) {
        // 尝试从文本推断
        mod = getModuleFromText(el);
      }

      if (mod && switches[mod] === false) {
        // 关键判断：确保该元素不是包含多个不同模块的容器
        // 检查子元素是否包含其他模块的内容
        var childTexts = [];
        var children = el.querySelectorAll(':scope > *');
        var hasOtherModuleChild = false;

        for (var ci = 0; ci < children.length; ci++) {
          var childMod = getModuleFromText(children[ci]);
          if (childMod && childMod !== mod) {
            hasOtherModuleChild = true;
            break;
          }
        }

        if (hasOtherModuleChild) {
          // 当前元素是容器，不隐藏自己，而是让子元素各自处理
          console.log('[模块开关] 跳过容器:', mod, el.tagName, (el.textContent||'').substring(0,20));
          return;
        }

        // 检查父元素是否已经被标记为隐藏（避免重复）
        var parent = el.parentElement;
        while (parent && parent !== mainEl) {
          if (parent.style.display === 'none') return;
          parent = parent.parentElement;
        }

        el.style.display = 'none';
        hiddenCount++;
        console.log('[模块开关] 隐藏:', mod, el.tagName, (el.textContent||'').substring(0,20));
      }
    });

    // === 阶段3: 特殊处理 - 扫描"最新公告"等列表区块 ===
    // 这些区块可能没有 data-page，需要通过标题文字识别
    var allDivs = mainEl.querySelectorAll('div, section');
    allDivs.forEach(function(el) {
      if (el.style.display === 'none') return;
      var text = (el.textContent || '').replace(/\s+/g, '');

      // 检查是否是"最新公告"区块
      if (text.indexOf('最新公告') >= 0 && text.indexOf('查看全部') >= 0) {
        if (switches.announcements === false) {
          // 检查是否包含其他模块的内容（通过检查子元素）
          var hasNonAnnounce = false;
          var childDivs = el.querySelectorAll(':scope > div, :scope > section');
          for (var cdi = 0; cdi < childDivs.length; cdi++) {
            var ctext = (childDivs[cdi].textContent || '').replace(/\s+/g, '');
            // 如果子元素包含其他模块关键字，说明是混合容器
            var isOther = false;
            for (var omod in MODULE_KEYWORDS) {
              if (omod === 'announcements') continue;
              var okeys = MODULE_KEYWORDS[omod];
              for (var oki = 0; oki < okeys.length; oki++) {
                if (ctext.indexOf(okeys[oki]) >= 0) { isOther = true; break; }
              }
              if (isOther) break;
            }
            if (isOther) { hasNonAnnounce = true; break; }
          }

          if (!hasNonAnnounce) {
            el.style.display = 'none';
            hiddenCount++;
            console.log('[模块开关] 隐藏区块: announcements(最新公告列表)');
          }
        }
      }
    });

    console.log('[模块开关] 共隐藏', hiddenCount, '个元素');
  }

  // 拦截 navigate
  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var orig = window.navigate;
    window.navigate = function(page) {
      var switches = getModuleSwitches();
      if (switches && switches[page] === false) {
        console.log('[模块开关] 禁止跳转:', page);
        if (typeof showToast === 'function') showToast('该模块已关闭', 'info');
        return;
      }
      return orig.apply(this, arguments);
    };
  }

  function init() {
    console.log('[模块开关] 初始化');
    applyNavFilter();
    interceptNavigate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 轮询：确保动态内容加载后被处理
  _initTimer = setInterval(function() {
    _checkCount++;
    applyNavFilter();
    if (_checkCount >= 15) {
      clearInterval(_initTimer);
      console.log('[模块开关] 轮询结束');
    }
  }, 250);

  // storage 同步
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      console.log('[模块开关] 配置变更，重新过滤');
      applyNavFilter();
    }
  });

  // MutationObserver
  var _observer = new MutationObserver(function(mutations) {
    var hasNew = false;
    mutations.forEach(function(m) {
      if (m.addedNodes.length > 0) hasNew = true;
    });
    if (hasNew) {
      clearTimeout(window._filterDebounceTimer);
      window._filterDebounceTimer = setTimeout(function() {
        applyNavFilter();
      }, 200);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
})();