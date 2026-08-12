/* frontend-nav-filter.js - 前台导航栏模块开关过滤 */
(function(){
  function getModuleSwitches(){
    // 1. 尝试从 localStorage 读取
    try {
      var raw = localStorage.getItem('adminData_config');
      if (raw) {
        var cfg = JSON.parse(raw);
        if (cfg && cfg.moduleSwitches) return cfg.moduleSwitches;
      }
    } catch(e) {}
    // 2. 尝试从内存中的 appData 读取（如果前台也加载了 admin-data.js）
    if (typeof appData !== 'undefined' && appData.config && appData.config.moduleSwitches) {
      return appData.config.moduleSwitches;
    }
    return null;
  }

  function applyFilter(){
    var switches = getModuleSwitches();
    if (!switches) return;
    var map = {
      'polls': ['[data-page="polls"]'],
      'workorders': ['[data-page="workorders"]'],
      'complaints': ['[data-page="complaints"]']
    };
    Object.keys(switches).forEach(function(key){
      if (switches[key] === false) {
        var selectors = map[key] || ['[data-page="'+key+'"]'];
        selectors.forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyFilter);
  } else {
    applyFilter();
  }
  setTimeout(applyFilter, 500);
  setTimeout(applyFilter, 1500);
})();
