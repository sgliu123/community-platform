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

  // 文本到模块的精确映射
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

  // 根据元素文本推断模块，返回 {module, matchedText}
  function inferModuleFromText(el) {
    var text = (el.textContent || '').replace(/\s+/g, '');
    for (var key in textToModule) {
      if (text.indexOf(key) >= 0) {
        return { module: textToModule[key], text: key };
      }
    }
    return null;
  }

  // 根据 data-page / href / onclick 推断模块
  function inferModuleFromAttrs(el) {
    // data-page
    if (el.dataset && el.dataset.page) {
      var p = el.dataset.page;
      if (p === 'announcements' || p === 'documents' || p === 'activities' ||
          p === 'polls' || p === 'workorders' || p === 'complaints' ||
          p === 'life' || p === 'trade') {
        return { module: p };
      }
    }
    // 子元素 data-page
    var child = el.querySelector('[data-page]');
    if (child && child.dataset.page) {
      var cp = child.dataset.page;
      if (cp === 'announcements' || cp === 'documents' || cp === 'activities' ||
          cp === 'polls' || cp === 'workorders' || cp === 'complaints' ||
          cp === 'life' || cp === 'trade') {
        return { module: cp };
      }
    }
    // onclick navigate
    var clickable = el.querySelector('[onclick]') || el;
    var onclickStr = clickable.getAttribute('onclick') || '';
    var match = onclickStr.match(/navigate(?:To)?\s*\(\s*['"](\w+)['"]\s*\)/);
    if (match) {
      var mp = match[1];
      if (mp === 'announcements' || mp === 'documents' || mp === 'activities' ||
          mp === 'polls' || mp === 'workorders' || mp === 'complaints' ||
          mp === 'life' || mp === 'trade') {
        return { module: mp };
      }
    }
    // href
    var links = el.querySelectorAll('a[href]');
    for (var li = 0; li < links.length; li++) {
      var href = links[li].getAttribute('href') || '';
      if (href.indexOf('life.html') >= 0) return { module: 'life' };
      if (href.indexOf('trade.html') >= 0) return { module: 'trade' };
      var hm = href.match(/[#?]page=(\w+)/);
      if (hm) {
        var hp = hm[1];
        if (hp === 'announcements' || hp === 'documents' || hp === 'activities' ||
            hp === 'polls' || hp === 'workorders' || hp === 'complaints' ||
            hp === 'life' || hp === 'trade') {
          return { module: hp };
        }
      }
    }
    return null;
  }

  // 判断一个元素是否是"叶子卡片"（有明确边界、可独立隐藏的单元）
  function isLeafCard(el) {
    // 有边框、阴影、圆角、背景色等卡片特征
    var style = window.getComputedStyle(el);
    var hasCardStyle = style.borderRadius !== '0px' || 
                       parseFloat(style.padding) > 0 ||
                       style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';

    // 或者是 a 标签直接作为卡片
    if (el.tagName === 'A') return true;

    // 或者包含图标+文字的典型卡片结构
    var hasIcon = el.querySelector('img, svg, .icon, i') !== null;
    var hasText = (el.textContent || '').trim().length > 0;

    return hasCardStyle || (hasIcon && hasText && el.children.length <= 5);
  }

  function applyNavFilter(){
    var switches = getModuleSwitches();
    if (!switches) {
      console.log('[模块开关] 未找到配置');
      return;
    }
    console.log('[模块开关] 应用过滤，配置:', JSON.stringify(switches));

    // === 1. 顶部导航栏过滤 ===
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
        console.log('[模块开关] 隐藏导航: ' + page);
      } else if (page && switches[page] !== false) {
        el.style.display = '';
      }
    });

    // === 2. 首页卡片过滤（核心）===
    var mainEl = document.querySelector('main');
    if (!mainEl) {
      console.log('[模块开关] 未找到 main 元素');
      return;
    }

    var hiddenCount = 0;
    var processed = new Set(); // 避免重复处理

    // 策略 A：先尝试精确匹配常见的卡片选择器
    var cardSelectors = [
      '.card', '.grid-item', '.feature-card', '.quick-card', '.nav-card',
      '.home-card', '.module-card', '.service-card', '.icon-card', '.func-card',
      '.menu-card', '.stat-card', '.info-card', '.dashboard-card', '.entry-card'
    ];

    cardSelectors.forEach(function(sel) {
      try {
        var cards = mainEl.querySelectorAll(sel);
        cards.forEach(function(card) {
          if (processed.has(card)) return;
          processed.add(card);

          var attrResult = inferModuleFromAttrs(card);
          if (attrResult && switches[attrResult.module] === false) {
            card.style.display = 'none';
            hiddenCount++;
            console.log('[模块开关] 隐藏卡片(A): ' + attrResult.module + ', selector=' + sel);
            return;
          }

          var textResult = inferModuleFromText(card);
          if (textResult && switches[textResult.module] === false) {
            card.style.display = 'none';
            hiddenCount++;
            console.log('[模块开关] 隐藏卡片(A-text): ' + textResult.module + ', text=' + textResult.text);
          }
        });
      } catch(e) {}
    });

    // 策略 B：扫描 main 下的所有直接子元素（可能是卡片容器）
    var directChildren = mainEl.querySelectorAll(':scope > div, :scope > section');
    directChildren.forEach(function(container) {
      // 如果容器本身是一个卡片（有图标+文字）
      var containerResult = inferModuleFromAttrs(container) || inferModuleFromText(container);
      if (containerResult && switches[containerResult.module] === false) {
        if (!processed.has(container)) {
          container.style.display = 'none';
          processed.add(container);
          hiddenCount++;
          console.log('[模块开关] 隐藏容器(B): ' + containerResult.module);
        }
        return;
      }

      // 扫描容器内的子元素（真正的卡片）
      var subCards = container.querySelectorAll(':scope > div, :scope > a, :scope > button');
      subCards.forEach(function(card) {
        if (processed.has(card)) return;

        var result = inferModuleFromAttrs(card) || inferModuleFromText(card);
        if (result && switches[result.module] === false) {
          card.style.display = 'none';
          processed.add(card);
          hiddenCount++;
          console.log('[模块开关] 隐藏子卡片(B): ' + result.module + ', text=' + (card.textContent||'').substring(0,15));
        }
      });
    });

    // 策略 C：兜底 - 扫描 main 内所有包含模块文本的 div，但只隐藏叶子节点
    var allDivs = mainEl.querySelectorAll('div, a, button');
    allDivs.forEach(function(el) {
      if (processed.has(el)) return;
      if (el.style.display === 'none') return;

      var result = inferModuleFromAttrs(el) || inferModuleFromText(el);
      if (result && switches[result.module] === false) {
        // 关键修复：只隐藏叶子卡片，不隐藏父容器
        // 找到包含该文本的最小独立单元
        var target = el;

        // 如果当前元素是 main 的直接子元素，或者包含很多子元素，可能是容器
        // 尝试向下找到更精确的目标
        if (target.children.length > 2) {
          var children = target.querySelectorAll(':scope > div, :scope > a');
          for (var ci = 0; ci < children.length; ci++) {
            var childResult = inferModuleFromText(children[ci]);
            if (childResult && childResult.module === result.module) {
              target = children[ci];
              break;
            }
          }
        }

        // 确保不隐藏包含多个不同模块的容器
        var siblingModules = [];
        if (target.parentElement) {
          var siblings = target.parentElement.querySelectorAll(':scope > div, :scope > a');
          siblings.forEach(function(sib) {
            var sibResult = inferModuleFromText(sib);
            if (sibResult && sibResult.module !== result.module) {
              siblingModules.push(sibResult.module);
            }
          });
        }

        // 如果父元素包含多个不同模块，说明父元素是容器，只隐藏当前 target
        target.style.display = 'none';
        processed.add(target);
        hiddenCount++;
        console.log('[模块开关] 隐藏卡片(C): ' + result.module + ', tag=' + target.tagName + ', text=' + (target.textContent||'').substring(0,15));
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 延迟多次执行
  _initTimer = setInterval(function() {
    _checkCount++;
    applyNavFilter();
    if (_checkCount >= 10) {
      clearInterval(_initTimer);
      console.log('[模块开关] 初始化完成');
    }
  }, 300);

  // storage 事件
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
      }, 150);
    }
  });
  _observer.observe(document.body, { childList: true, subtree: true });
})();