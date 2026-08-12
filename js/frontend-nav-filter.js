/* frontend-nav-filter.js - 前台导航栏模块开关过滤 */
(function(){
  function getModuleSwitches() {
    var cfg = null;
    // 尝试多种可能的存储 key 和结构
    var keys = ['adminData_config', 'config', 'app_config', 'community_config'];
    for (var i = 0; i < keys.length; i++) {
      try {
        var raw = localStorage.getItem(keys[i]);
        if (raw) {
          var parsed = JSON.parse(raw);
          // 直接包含 moduleSwitches
          if (parsed && parsed.moduleSwitches) return parsed.moduleSwitches;
          // 嵌套在 data 或 config 中
          if (parsed && parsed.data && parsed.data.moduleSwitches) return parsed.data.moduleSwitches;
          if (parsed && parsed.config && parsed.config.moduleSwitches) return parsed.config.moduleSwitches;
        }
      } catch(e) {}
    }
    // 最后尝试读取 adminData 全量数据
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
    // 前台导航选择器映射（根据 data-page 属性匹配）
    var map = {
      'polls': ['[data-page="polls"]', 'a[href*="polls"]', '.nav-polls'],
      'workorders': ['[data-page="workorders"]', 'a[href*="workorders"]', '.nav-workorders'],
      'complaints': ['[data-page="complaints"]', 'a[href*="complaints"]', '.nav-complaints'],
      'activities': ['[data-page="activities"]', 'a[href*="activities"]'],
      'documents': ['[data-page="documents"]', 'a[href*="documents"]']
    };
    Object.keys(switches).forEach(function(key){
      if (switches[key] === false) {
        var selectors = map[key] || ['[data-page="'+key+'"]'];
        selectors.forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){ 
            el.style.display = 'none'; 
          });
        });
      }
    });
  }

  function init() {
    applyNavFilter();
    // 监听 localStorage 变化（后台在其他标签页修改时）
    window.addEventListener('storage', function(e) {
      if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
        applyNavFilter();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(applyNavFilter, 300);
  setTimeout(applyNavFilter, 1000);
})();