/* frontend-nav-filter.js - 前台导航栏与首页卡片模块开关过滤 */
(function(){
  'use strict';

  // ========== 1. 读取模块开关配置 ==========
  function getSwitches() {
    try {
      var raw = localStorage.getItem('config');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.moduleSwitches) return p.moduleSwitches;
      }
    } catch(e) {}
    try {
      var raw = localStorage.getItem('adminData_config');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.config && p.config.moduleSwitches) return p.config.moduleSwitches;
      }
    } catch(e) {}
    try {
      var raw = localStorage.getItem('adminData');
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.config && p.config.moduleSwitches) return p.config.moduleSwitches;
      }
    } catch(e) {}
    return null;
  }

  // ========== 2. 模块定义 ==========
  var MOD_TEXTS = {
    'announcements': ['公告栏', '最新公告'],
    'documents':     ['上级文件', '文件管理'],
    'activities':    ['社区动态', '动态管理'],
    'polls':         ['投票征集', '投票管理'],
    'workorders':    ['我要报修', '我的报修', '工单管理'],
    'complaints':    ['投诉建议', '我的反馈', '投诉管理'],
    'life':          ['生活服务', '便民生活'],
    'trade':         ['房屋租售和物品交易', '房屋租售']
  };

  // 页面标识到模块的映射
  var PAGE_TO_MOD = {
    'announcements': 'announcements',
    'documents':     'documents',
    'activities':    'activities',
    'polls':         'polls',
    'workorders':    'workorders',
    'complaints':    'complaints',
    'life':          'life',
    'trade':         'trade'
  };

  // ========== 3. 推断元素所属模块 ==========
  function inferModule(el) {
    // 方式1: data-page
    if (el.dataset && el.dataset.page && PAGE_TO_MOD[el.dataset.page]) {
      return PAGE_TO_MOD[el.dataset.page];
    }

    // 方式2: 子元素 data-page
    var child = el.querySelector('[data-page]');
    if (child && child.dataset.page && PAGE_TO_MOD[child.dataset.page]) {
      return PAGE_TO_MOD[child.dataset.page];
    }

    // 方式3: onclick navigate
    var oc = (el.getAttribute('onclick') || '');
    var m = oc.match(/navigate\s*\(\s*['"](\w+)['"]\s*\)/);
    if (m && PAGE_TO_MOD[m[1]]) return PAGE_TO_MOD[m[1]];

    // 方式4: href
    var links = el.querySelectorAll('a[href]');
    for (var li = 0; li < links.length; li++) {
      var href = links[li].getAttribute('href') || '';
      if (href.indexOf('life.html') >= 0) return 'life';
      if (href.indexOf('trade.html') >= 0) return 'trade';
      var hm = href.match(/[#?]page=(\w+)/);
      if (hm && PAGE_TO_MOD[hm[1]]) return PAGE_TO_MOD[hm[1]];
    }

    // 方式5: 文本内容匹配
    var text = (el.textContent || '').replace(/\s+/g, '');
    for (var mod in MOD_TEXTS) {
      for (var i = 0; i < MOD_TEXTS[mod].length; i++) {
        if (text.indexOf(MOD_TEXTS[mod][i]) >= 0) return mod;
      }
    }

    return null;
  }

  // 计算元素在 main 下的深度
  function getDepth(el, main) {
    var d = 0;
    var node = el;
    while (node && node !== main) {
      d++;
      node = node.parentElement;
    }
    return d;
  }

  // 检查元素文本是否包含其他模块的关键词
  function containsOtherModule(el, ownMod) {
    var text = el.textContent || '';
    for (var otherMod in MOD_TEXTS) {
      if (otherMod === ownMod) continue;
      for (var i = 0; i < MOD_TEXTS[otherMod].length; i++) {
        if (text.indexOf(MOD_TEXTS[otherMod][i]) >= 0) return true;
      }
    }
    return false;
  }

  // ========== 4. 核心过滤逻辑 ==========
  function applyFilter() {
    var switches = getSwitches();
    if (!switches) {
      console.log('[模块开关] 未读取到配置');
      return;
    }
    console.log('[模块开关] 配置:', JSON.stringify(switches));

    var main = document.querySelector('main');
    if (!main) {
      console.log('[模块开关] 未找到 main');
      return;
    }

    // 收集 main 内所有元素及其匹配的模块
    var allEls = main.querySelectorAll('*');
    var matches = []; // { el, mod, depth }

    for (var i = 0; i < allEls.length; i++) {
      var el = allEls[i];
      if (el === main) continue;
      var mod = inferModule(el);
      if (mod && switches[mod] === false) {
        matches.push({
          el: el,
          mod: mod,
          depth: getDepth(el, main)
        });
      }
    }

    console.log('[模块开关] 匹配元素数:', matches.length);

    // 按模块分组，每组按深度降序（深的优先）
    var byMod = {};
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      if (!byMod[m.mod]) byMod[m.mod] = [];
      byMod[m.mod].push(m);
    }

    var hiddenCount = 0;
    var hiddenEls = [];

    for (var mod in byMod) {
      if (switches[mod] !== false) continue;

      // 按深度降序排列
      byMod[mod].sort(function(a, b) { return b.depth - a.depth; });

      for (var i = 0; i < byMod[mod].length; i++) {
        var item = byMod[mod][i];
        var el = item.el;

        if (el.style.display === 'none') continue;

        // 检查是否已被隐藏的元素包含
        var alreadyHidden = false;
        for (var h = 0; h < hiddenEls.length; h++) {
          if (hiddenEls[h].contains(el)) {
            alreadyHidden = true;
            break;
          }
        }
        if (alreadyHidden) continue;

        // 检查是否包含其他模块的内容（容器检测）
        if (containsOtherModule(el, mod)) {
          console.log('[模块开关] 跳过容器:', mod, (el.textContent||'').substring(0,25));
          continue;
        }

        // 安全隐藏
        el.style.display = 'none';
        hiddenEls.push(el);
        hiddenCount++;
        console.log('[模块开关] 隐藏:', mod, 'depth=' + item.depth, (el.textContent||'').substring(0,25));
      }
    }

    console.log('[模块开关] 共隐藏:', hiddenCount);
  }

  // ========== 5. 拦截 navigate ==========
  function interceptNavigate() {
    if (typeof window.navigate !== 'function') return;
    var orig = window.navigate;
    window.navigate = function(page) {
      var sw = getSwitches();
      if (sw && sw[page] === false) {
        console.log('[模块开关] 禁止跳转:', page);
        if (typeof showToast === 'function') showToast('该模块已关闭', 'info');
        return;
      }
      return orig.apply(this, arguments);
    };
  }

  // ========== 6. 初始化 ==========
  function init() {
    console.log('[模块开关] 初始化');
    applyFilter();
    interceptNavigate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 轮询（应对动态渲染，最多10次）
  var count = 0;
  var timer = setInterval(function() {
    count++;
    applyFilter();
    if (count >= 10) {
      clearInterval(timer);
      console.log('[模块开关] 轮询结束');
    }
  }, 300);

  // Storage 变更监听
  window.addEventListener('storage', function(e) {
    if (e.key && /config|adminData/.test(e.key)) {
      console.log('[模块开关] 配置变更，重新过滤');
      applyFilter();
    }
  });

  // DOM 变更监听
  var observer = new MutationObserver(function(muts) {
    var hasNew = false;
    for (var i = 0; i < muts.length; i++) {
      if (muts[i].addedNodes.length > 0) { hasNew = true; break; }
    }
    if (hasNew) {
      clearTimeout(window._navFilterTimer);
      window._navFilterTimer = setTimeout(applyFilter, 150);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();