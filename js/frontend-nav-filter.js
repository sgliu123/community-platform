/* frontend-nav-filter.js - 前台导航栏模块开关过滤 */
(function(){
  function getModuleSwitches() {
    var cfg = null;
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
    var map = {
      'announcements': ['[data-page="announcements"]', 'a[href*="announcements"]', '.nav-announcements'],
      'polls': ['[data-page="polls"]', 'a[href*="polls"]', '.nav-polls'],
      'workorders': ['[data-page="workorders"]', 'a[href*="workorders"]', '.nav-workorders'],
      'complaints': ['[data-page="complaints"]', 'a[href*="complaints"]', '.nav-complaints'],
      'activities': ['[data-page="activities"]', 'a[href*="activities"]', '.nav-activities'],
      'documents': ['[data-page="documents"]', 'a[href*="documents"]', '.nav-documents']
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  setTimeout(applyNavFilter, 100);
  setTimeout(applyNavFilter, 500);
  setTimeout(applyNavFilter, 1000);
  setTimeout(applyNavFilter, 2000);

  // FIX: 增加轮询，确保后台修改后前台能即时响应
  setInterval(applyNavFilter, 3000);

  window.addEventListener('storage', function(e) {
    if (e.key && (e.key.indexOf('config') >= 0 || e.key.indexOf('adminData') >= 0)) {
      applyNavFilter();
    }
  });
})();
