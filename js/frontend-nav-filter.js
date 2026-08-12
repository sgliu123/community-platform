/* frontend-nav-filter.js - 前台导航栏模块开关过滤 */
(function(){
  function applyFilter(){
    var cfg = null;
    try {
      var raw = localStorage.getItem('adminData_config');
      if (raw) cfg = JSON.parse(raw);
    } catch(e) {}
    if (!cfg || !cfg.moduleSwitches) return;
    var switches = cfg.moduleSwitches;
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
