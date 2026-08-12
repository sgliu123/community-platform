/* frontend-nav-filter.js - 前台导航栏模块开关过滤
 * 使用方式：在 index.html 中，导航栏渲染完成后引入此文件
 * <script src="js/frontend-nav-filter.js"></script>
 */
(function(){
  function applyNavFilter(){
    var cfg = null;
    try {
      var raw = localStorage.getItem('adminData_config');
      if (raw) cfg = JSON.parse(raw);
    } catch(e) {}
    if (!cfg || !cfg.moduleSwitches) return;
    var switches = cfg.moduleSwitches;
    // 模块ID到前台导航选择器的映射（根据你的DOM结构调整）
    var map = {
      'polls': ['[data-nav="polls"]','[data-module="polls"]','.nav-polls','#nav-polls'],
      'workorders': ['[data-nav="workorders"]','[data-module="workorders"]','.nav-workorders','#nav-workorders','[href*="workorder"]','[href*="repair"]'],
      'complaints': ['[data-nav="complaints"]','[data-module="complaints"]','.nav-complaints','#nav-complaints','[href*="complaint"]','[href*="feedback"]'],
      'settings': ['[data-nav="settings"]','[data-module="settings"]']
    };
    Object.keys(switches).forEach(function(key){
      if (switches[key] === false) {
        var selectors = map[key] || ['[data-module="'+key+'"]','[data-nav="'+key+'"]','#nav-'+key,'.nav-'+key];
        selectors.forEach(function(sel){
          document.querySelectorAll(sel).forEach(function(el){ el.style.display = 'none'; });
        });
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyNavFilter);
  } else {
    applyNavFilter();
  }
  // 延迟再执行一次，确保异步渲染的导航项也被处理
  setTimeout(applyNavFilter, 500);
  setTimeout(applyNavFilter, 1500);
})();
