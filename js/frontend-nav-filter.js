/* frontend-nav-filter.js - 前台模块开关过滤 */
(function(){
  'use strict';

  // ========== 配置读取 ==========
  function getModuleSwitches() {
    var keys = ['adminData', 'adminData_config', 'config', 'app_config'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.moduleSwitches) return parsed.moduleSwitches;
        if (parsed && parsed.config && parsed.config.moduleSwitches) return parsed.config.moduleSwitches;
        if (parsed && parsed.data && parsed.data.moduleSwitches) return parsed.data.moduleSwitches;
      } catch(e) {}
    }
    return null;
  }

  // ========== 模块映射 ==========
  // key: 模块ID, value: 卡片中可能出现的文本标识
  var MODULE_MAP = {
    'announcements': ['公告栏', '最新公告', '公告管理'],
    'documents':     ['上级文件', '文件管理', '社区文件'],
    'activities':    ['社区动态', '最新动态', '动态管理'],
    'polls':         ['投票征集', '投票管理', '民意调查'],
    'workorders':    ['我要报修', '工单管理', '报修服务', '我的报修'],
    'complaints':    ['投诉建议', '投诉管理', '我的反馈'],
    'life':          ['生活服务', '便民生活'],
    'trade':         ['房屋租售', '房屋租售和物品交易', '交易管理']
  };

  // ========== 核心过滤函数 ==========
  function applyFilter() {
    var switches = getModuleSwitches();
    if (!switches) {
      console.log('[模块开关] 未读取到配置');
      return;
    }
    console.log('[模块开关] 配置:', JSON.stringify(switches));

    var mainEl = document.querySelector('main');
    if (!mainEl) return;

    // 收集所有需要隐藏的模块
    var hiddenModules = [];
    for (var mod in switches) {
      if (switches[mod] === false) hiddenModules.push(mod);
    }
    if (hiddenModules.length === 0) {
      console.log('[模块开关] 无关闭的模块');
      return;
    }
    console.log('[模块开关] 需要隐藏:', hiddenModules.join(', '));

    // 策略：找到 main 下所有包含模块文本的元素，只隐藏最精确匹配的那个
    var allEls = mainEl.querySelectorAll('*');
    var hiddenCount = 0;

    hiddenModules.forEach(function(mod) {
      var keywords = MODULE_MAP[mod] || [mod];

      // 找到所有包含该模块关键词的元素
      var matchedEls = [];
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        if (el.style.display === 'none') continue;

        var text = (el.textContent || '').trim();
        for (var k = 0; k < keywords.length; k++) {
          if (text.indexOf(keywords[k]) >= 0) {
            matchedEls.push(el);
            break;
          }
        }
      }

      if (matchedEls.length === 0) {
        console.log('[模块开关] 未找到 "' + mod + '" 的卡片');
        return;
      }

      // 对每个匹配的元素，找到它在 DOM 树中的"代表节点"
      // 代表节点 = 包含该文本的最小独立单元（叶子或接近叶子）
      matchedEls.forEach(function(el) {
        // 如果该元素包含子元素且子元素也包含同样的关键词，
        // 说明该元素是容器，不隐藏它，让子元素去处理
        var children = el.querySelectorAll('*');
        var hasChildMatch = false;
        for (var c = 0; c < children.length; c++) {
          var childText = (children[c].textContent || '').trim();
          for (var k2 = 0; k2 < keywords.length; k2++) {
            if (childText.indexOf(keywords[k2]) >= 0) {
              hasChildMatch = true;
              break;
            }
          }
          if (hasChildMatch) break;
        }

        // 只有当该元素是叶子（无子元素匹配）或者是 a/div 直接卡片时，才隐藏
        if (!hasChildMatch || el.children.length === 0) {
          // 额外检查：确保不隐藏包含其他模块关键词的容器
          var elText = (el.textContent || '').trim();
          var otherModules = 0;
          for (var otherMod in MODULE_MAP) {
            if (otherMod === mod) continue;
            var otherKeywords = MODULE_MAP[otherMod];
            for (var ok = 0; ok < otherKeywords.length; ok++) {
              if (elText.indexOf(otherKeywords[ok]) >= 0) {
                otherModules++;
                break;
              }
            }
          }

          // 如果包含其他模块文本，说明是容器，不隐藏
          if (otherModules > 0) {
            console.log('[模块开关] 跳过容器(含多模块):', elText.substring(0, 20));
            return;
          }

          el.style.display = 'none';
          hiddenCount++;
          console.log('[模块开关] 隐藏:', mod, '-', elText.substring(0, 20));
        }
      });
    });

    console.log('[模块开关] 共隐藏', hiddenCount, '个元素');
  }

  // ========== 导航栏过滤 ==========
  function filterNav() {
    var switches = getModuleSwitches();
    if (!switches) return;

    var nav = document.getElementById('headerNav');
    if (!nav) return;

    var navItems = nav.querySelectorAll('a');
    navItems.forEach(function(el) {
      var page = el.dataset ? el.dataset.page : null;
      if (!page) {
        var oc = el.getAttribute('onclick') || '';
        var m = oc.match(/navigate\s*\(\s*['"](\w+)['"]\s*\)/);
        if (m) page = m[1];
      }
      if (page && switches[page] === false) {
        el.style.display = 'none';
      }
    });
  }

  // ========== 初始化 ==========
  function init() {
    console.log('[模块开关] 初始化开始');
    filterNav();
    applyFilter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 延迟执行，确保动态内容加载
  var checkCount = 0;
  var timer = setInterval(function() {
    checkCount++;
    applyFilter();
    if (checkCount >= 15) clearInterval(timer);
  }, 200);

  // 监听 storage 变化
  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      console.log('[模块开关] 配置变更');
      filterNav();
      applyFilter();
    }
  });

  // 监听 DOM 变化
  var observer = new MutationObserver(function(mutations) {
    var hasNew = false;
    mutations.forEach(function(m) {
      if (m.addedNodes.length > 0) hasNew = true;
    });
    if (hasNew) {
      clearTimeout(window._filterTimer);
      window._filterTimer = setTimeout(applyFilter, 200);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 暴露全局方法供调试
  window._applyModuleFilter = applyFilter;
  window._getModuleSwitches = getModuleSwitches;
})();