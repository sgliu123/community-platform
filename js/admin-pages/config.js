/* js/admin-pages/config.js - 社区配置 */

function renderConfig() {
  if (!appData.config) appData.config = {};
  if (!appData.config.community) appData.config.community = {};
  if (!appData.config.settings) appData.config.settings = {};
  const c = appData.config.community;
  const s = appData.config.settings;
  const themes = s.themeOptions || [];
  let html = '<div class="card"><div class="card-header"><h3>🏘️ 社区基本信息</h3></div>' +
    '<div class="form-group"><label>网页标题（显示在浏览器标签页）</label><input type="text" id="cfgSiteTitle" value="' + (c.siteTitle||'') + '" placeholder="留空则自动使用：社区名称 - 社区数字化平台"></div>' +
    '<div class="form-row"><div class="form-group"><label>社区名称</label><input type="text" id="cfgName" value="' + (c.name||'') + '"></div>' +
    '<div class="form-group"><label>地址</label><input type="text" id="cfgAddress" value="' + (c.address||'') + '"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>总户数</label><input type="number" id="cfgUnits" value="' + (c.totalUnits||'') + '"></div>' +
    '<div class="form-group"><label>建成年份</label><input type="text" id="cfgYear" value="' + (c.builtYear||'') + '"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>占地面积</label><input type="text" id="cfgArea" value="' + (c.area||'') + '"></div>' +
    '<div class="form-group"><label>物业公司</label><input type="text" id="cfgProperty" value="' + (c.propertyCompany||'') + '"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>居委会电话</label><input type="text" id="cfgCommittee" value="' + (c.committeePhone||'') + '"></div>' +
    '<div class="form-group"><label>物业电话</label><input type="text" id="cfgPropertyPhone" value="' + (c.propertyPhone||'') + '"></div></div>' +
    '<div class="form-group"><label>社区口号</label><input type="text" id="cfgSlogan" value="' + (c.slogan||'') + '"></div>';

  html += '<div class="form-group"><label>社区Logo</label><input type="text" id="cfgLogoInput" value="' + (c.logo||'') + '" placeholder="assets/logo.png 或 https://...">' +
    createFileUploaderHTML({id:'cfgLogo', accept:'image/*', hint:'支持拖拽或点击上传图片（自动压缩）'}) + '</div>';

  html += '<div class="form-group"><label>浏览器图标（favicon）</label><input type="text" id="cfgFavicon" value="' + (c.favicon||'') + '" placeholder="assets/logo.png 或 https://...">' +
    createFileUploaderHTML({id:'cfgFavicon', accept:'image/png,image/x-icon,image/svg+xml', hint:'支持拖拽或点击上传图标（自动压缩，推荐 .png / .ico / .svg）'}) + '</div></div>';

  html += '<div class="card"><div class="card-header"><h3>🎨 主题设置</h3></div>' +
    '<div class="form-group"><label>默认主题</label><select id="cfgTheme">' +
    themes.map(t => '<option value="' + t.id + '" ' + (s.defaultTheme===t.id?'selected':'') + '>' + t.name + ' (' + t.desc + ')</option>').join('') +
    '</select></div></div>';

  setTimeout(function() {
    if (c && c.logo) setUploadedPath('cfgLogo', c.logo, 'logo');
    if (c && c.favicon) setUploadedPath('cfgFavicon', c.favicon, 'favicon');
  }, 0);
  return html;
}

