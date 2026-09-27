/* js/admin-core.js - 核心框架：路由、登录、通用编辑保存、异议管理 */

function checkLoginState() {
  autoSkipLogin();
}

function autoSkipLogin() {
  // 兼容 admin-auth.js 的新认证系统：若新 token 存在且未过期，直接跳过旧登录检测
  const authToken = sessionStorage.getItem('admin_auth_token');
  const authExpire = sessionStorage.getItem('admin_auth_expire');
  if (authToken && authExpire && Date.now() < parseInt(authExpire)) {
    return;
  }
  // 先尝试从 sessionStorage 恢复登录状态
  const savedSession = sessionStorage.getItem('adminSession');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      const account = ADMIN_ACCOUNTS.find(a => a.id === session.adminId);
      if (account && session.loginTime) {
        // 会话有效期：8小时
        const loginTime = new Date(session.loginTime).getTime();
        if (Date.now() - loginTime < 8 * 3600 * 1000) {
          currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
          adminSession = session;
          document.getElementById('loginPage').style.display = 'none';
          document.getElementById('tokenPage').style.display = 'none';
          showAdminLayout();
          return;
        }
      }
    } catch(e) {}
    sessionStorage.removeItem('adminSession');
  }
  // 无有效会话，显示登录页
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('tokenPage').style.display = 'none';
  document.getElementById('adminLayout').classList.remove('active');
}

async function doAdminLogin() {
  const roleId = document.getElementById('loginRole').value;
  const pwd = document.getElementById('loginPassword').value;
  const err = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  err.style.display = 'none';
  if (!roleId) { err.textContent = '请选择身份'; err.style.display = 'block'; return; }
  if (!pwd) { err.textContent = '请输入密码'; err.style.display = 'block'; return; }

  let account = ADMIN_ACCOUNTS.find(a => a.id === roleId);
  let isRegistered = false;
  if (!account) {
    const reg = ((appData.config && appData.config.adminUsers) || []).find(a => a.id === roleId && a.status === 'approved');
    if (reg) { account = reg; isRegistered = true; }
  }
  if (!account) { err.textContent = '身份配置错误，请联系总维护人员'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = '验证中...';

  if (pwd !== account.password) {
    err.textContent = '密码错误，请重新输入'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '登录';
    return;
  }

  currentAdmin = {
    id: account.id,
    name: account.name,
    role: isRegistered ? 'admin' : account.role,
    canDelete: account.canDelete !== false,
    isRegistered: isRegistered
  };
  adminSession = { adminId: currentAdmin.id, loginTime: new Date().toISOString() };
  sessionStorage.setItem('adminSession', JSON.stringify(adminSession));

  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('tokenPage').style.display = 'none';
  showAdminLayout();
  showToast('欢迎，' + account.name, 'success');
}

async function saveToken() {
  // GitHub Token 已不再需要（使用 Cloudflare Worker），直接跳过
  autoSkipLogin();
}

function showAdminLayout() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('tokenPage').style.display = 'none';
  document.getElementById('adminLayout').classList.add('active');
  if (!currentAdmin && window.currentAdmin) {
    // admin-auth.js 登录/免密恢复时已设置好规范化角色与权限，优先采用
    currentAdmin = window.currentAdmin;
  }
  if (!currentAdmin) {
    // 从 sessionStorage 恢复（角色需归一：admin-x → x，与侧边栏 roles 名单一致）
    const authName = sessionStorage.getItem('admin_auth_name');
    const authRole = sessionStorage.getItem('admin_auth_role');
    const authPerms = sessionStorage.getItem('admin_auth_permissions');
    if (authName && authRole) {
      try {
        const permsObj = authPerms ? JSON.parse(authPerms) : {};
        const roleNorm = (authRole === 'admin-super') ? 'super'
          : (authRole === 'admin-dev') ? 'dev'
          : (String(authRole).indexOf('admin-') === 0 ? String(authRole).slice(6) : authRole);
        currentAdmin = {
          id: authRole,
          name: authName,
          role: roleNorm,
          permissions: Object.keys(permsObj).filter(function(k){ return permsObj[k]; })
        };
      } catch(e) {}
    }
    // 再尝试旧 session
    if (!currentAdmin) {
      const saved = sessionStorage.getItem('adminSession');
      if (saved) {
        try {
          const session = JSON.parse(saved);
          const account = ADMIN_ACCOUNTS.find(a => a.id === session.adminId);
          if (account) currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
        } catch(e) {}
      }
    }
  }
  if (!currentAdmin) {
    logout(); return;
  }
  document.getElementById('adminInfo').textContent = currentAdmin.name || '管理员';
  const roleMap = { super: '总维护人员', dev: '开发者', property: '物管人员', committee: '业委会成员', community: '社区人员', admin: '管理员' };
  document.getElementById('adminRole').textContent = roleMap[currentAdmin.role] || currentAdmin.role;
  renderSidebar();
  const hash = location.hash;
  const match = hash.match(/module=([^&]+)/);
  const targetModule = match ? match[1] : 'dashboard';
  const validModules = ['dashboard','config','announcements','documents','activities','polls','residents','audit','workorders','complaints','funds','settings','admin-manage','dev-tools','life','trade'];
  if (validModules.includes(targetModule)) {
    navigateTo(targetModule);
  } else {
    navigateTo('dashboard');
  }
}

function logout() {
  if (confirm('确定要退出登录吗？')) {
    sessionStorage.removeItem('adminSession');
    currentAdmin = null;
    adminSession = null;
    location.reload();
  }
}

function renderSidebar() {
  if (!currentAdmin) return;
  const perms = currentAdmin.permissions || [];
  const isSuper = currentAdmin.role === 'super';
  console.log('[renderSidebar] isSuper=' + isSuper + ', role=' + currentAdmin.role + ', perms=' + JSON.stringify(perms));

  // Super 用户直接渲染全部菜单，不受任何过滤/开关影响
  if (isSuper) {
    const allItems = [
      { id: 'dashboard', label: '仪表盘', icon: '📊', external: null },
      { id: 'config', label: '社区配置', icon: '⚙️', external: null },
      { id: 'announcements', label: '公告管理', icon: '📢', external: null },
      { id: 'documents', label: '文件管理', icon: '📄', external: null },
      { id: 'activities', label: '动态管理', icon: '🎉', external: null },
      { id: 'polls', label: '投票管理', icon: '🗳️', external: null },
      { id: 'residents', label: '业主管理', icon: '👥', external: null },
      { id: 'workorders', label: '工单管理', icon: '🔧', external: null },
      { id: 'complaints', label: '投诉建议', icon: '📝', external: null },
      { id: 'funds', label: '阳光资金', icon: '🏦', external: 'admin-funds.html' },
      { id: 'life', label: '生活服务', icon: '🍽️', external: 'admin-life.html' },
      { id: 'trade', label: '交易管理', icon: '🛒', external: 'trade-admin.html' },
      { id: 'settings', label: '系统设置', icon: '🔐', external: null },
      { id: 'admin-manage', label: '管理员管理', icon: '👤', external: null },
      { id: 'dev-tools', label: '开发者工具', icon: '🛠️', external: null }
    ];
    let html = '';
    allItems.forEach(function(item) {
      var isActive = item.id === currentModule;
      var cls = 'nav-item' + (isActive ? ' active' : '');
      var clickAction = item.external ? 'window.open(\'' + item.external + '\',\'_blank\')' : 'navigateTo(\'' + item.id + '\')';
      html += '<a class="' + cls + '" data-module="' + item.id + '" onclick="' + clickAction + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:4px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:inherit;text-decoration:none;transition:all 0.2s;border-left:3px solid ' + (isActive ? '#fff' : 'transparent') + ';background:' + (isActive ? 'rgba(255,255,255,0.15)' : 'transparent') + ';font-weight:' + (isActive ? '600' : '400') + ';">';
      html += '<span style="font-size:17px;width:22px;text-align:center;flex-shrink:0;">' + item.icon + '</span>';
      html += '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.label) + '</span>';
      if (item.external) html += '<span style="font-size:10px;opacity:0.5;flex-shrink:0;">↗</span>';
      html += '</a>';
    });
    var navEl = document.getElementById('sidebarNav');
    if (navEl) { navEl.innerHTML = html; console.log('[renderSidebar] Super用户已渲染 ' + allItems.length + ' 个菜单项'); }
    return;
  }

  // 非 Super 用户走原有逻辑（保留权限+开关过滤）
  const items = [
    { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
    { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
    { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
    { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
    { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
    { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
    { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
    { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
    { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
    { id: 'funds', label: '阳光资金', icon: '🏦', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-funds.html' },
    { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
    { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
    { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
  ];
  if (isSuper) {
    items.push({ id: 'admin-manage', label: '管理员管理', icon: '👤', perm: 'all', roles: ['super'] });
    items.push({ id: 'dev-tools', label: '开发者工具', icon: '🛠️', perm: 'all', roles: ['super'] });
  }
  const switches = (appData.config && appData.config.moduleSwitches) || {};
  let html = '';
  items.forEach(function(item) {
    // 板块可见性统一由 canAccessModule 判定（身份默认基线 + 账号级板块开关 + 全局开关），
    // 与「管理员管理 → 板块权限」勾选面板保持一致；账号显式开启的板块可以超出身份基线显示
    var visible;
    if (window.canAccessModule) {
      visible = window.canAccessModule(item.id);
    } else {
      // 兜底：admin-auth.js 未就绪时按旧逻辑（身份基线 + 全局开关）
      const hasPerm = perms.indexOf('all') >= 0 || perms.indexOf(item.perm) >= 0 || perms.indexOf('canEditAll') >= 0;
      const hasRole = !item.roles || item.roles.indexOf(currentAdmin.role) >= 0;
      visible = hasPerm && hasRole && switches[item.id] !== false;
    }
    if (!visible) return;
    var isActive = item.id === currentModule;
    var cls = 'nav-item' + (isActive ? ' active' : '');
    var clickAction = item.external ? 'window.open(\'' + item.external + '\',\'_blank\')' : 'navigateTo(\'' + item.id + '\')';
    html += '<a class="' + cls + '" data-module="' + item.id + '" onclick="' + clickAction + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin:4px 10px;border-radius:6px;cursor:pointer;font-size:14px;color:inherit;text-decoration:none;transition:all 0.2s;border-left:3px solid ' + (isActive ? '#fff' : 'transparent') + ';background:' + (isActive ? 'rgba(255,255,255,0.15)' : 'transparent') + ';font-weight:' + (isActive ? '600' : '400') + ';">';
    html += '<span style="font-size:17px;width:22px;text-align:center;flex-shrink:0;">' + item.icon + '</span>';
    html += '<span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.label) + '</span>';
    if (item.external) html += '<span style="font-size:10px;opacity:0.5;flex-shrink:0;">↗</span>';
    html += '</a>';
  });
  var navEl = document.getElementById('sidebarNav');
  if (navEl) navEl.innerHTML = html;
}

function navigateTo(module) {
  try {
    // 总维护专属页面：非 super 直接改地址栏也不进入
    if ((module === 'admin-manage' || module === 'dev-tools')) {
      var ca = window.currentAdmin || {};
      if (ca.role !== 'super') {
        if (typeof showToast === 'function') showToast('该页面仅总维护人员可见', 'error');
        module = 'dashboard';
      }
    }
    // 账号级板块开关：被关闭的板块禁止进入
    if (window.canAccessModule && !window.canAccessModule(module)) {
      if (typeof showToast === 'function') showToast('该板块已对你关闭，请联系总维护人员开通', 'error');
      return;
    }
    const externalLinks = { life: 'admin-life.html', trade: 'trade-admin.html', funds: 'admin-funds.html' };
    if (externalLinks[module]) { window.open(externalLinks[module], '_blank'); return; }
    currentModule = module;
    location.hash = 'module=' + module;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.module === module));
    const titles = { dashboard: '仪表盘', config: '社区配置', announcements: '公告管理', documents: '文件管理', activities: '动态管理', polls: '投票管理', residents: '业主管理', objections: '异议管理', audit: '操作日志', workorders: '工单管理', complaints: '投诉建议', funds: '阳光资金', life: '生活服务', settings: '系统设置', 'admin-manage': '管理员管理', 'dev-tools': '开发者工具' };
    var pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = titles[module] || module;
    var sb = document.getElementById('saveBtn');
    if (sb) sb.style.display = ['dashboard','audit','settings','admin-manage','dev-tools'].indexOf(module) >= 0 ? 'none' : 'inline-block';

    var ca = document.getElementById('contentArea');

    const renderers = {
      dashboard: renderDashboard, config: renderConfig, announcements: renderAnnouncementsAdmin,
      documents: renderDocumentsAdmin, activities: renderActivitiesAdmin, polls: renderPollsAdmin,
      residents: renderResidentsAdmin, workorders: renderWorkordersAdmin,
      complaints: renderComplaintsAdmin, audit: renderAuditLog,
      settings: renderSettings,
      'admin-manage': renderAdminManage,
      'dev-tools': renderDevTools
    };
    const fn = renderers[module];
    if (!fn) {
      if (ca) ca.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>页面模块「' + escapeHtml(module) + '」尚未加载</div><div style="font-size:12px;color:#999;margin-top:8px;">请确认对应 admin-pages/*.js 文件已正确引入</div></div>';
      return;
    }
    var ca = document.getElementById('contentArea');
    if (ca) {
      const html = fn();
      ca.innerHTML = typeof html === 'string' ? html : '<div class="empty-state"><div class="icon">⚠️</div><div>页面加载异常</div></div>';
    }
  } catch(e) {
    console.error('navigateTo error:', e);
    var ca = document.getElementById('contentArea');
    if (ca) ca.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>页面加载出错，请刷新重试</div><div style="font-size:12px;color:#999;margin-top:8px;">' + escapeHtml(e.message) + '</div></div>';
  }
}

function openEditModal(module, id) {
  const isNew = !id;
  let item = {};
  if (!isNew) {
    const list = appData[module] || [];
    item = list.find(x => x.id === id) || {};
  }
  if (!item) item = {};
  const titles = { announcements: '公告', documents: '文件', activities: '动态', polls: '投票', residents: '业主' };
  document.getElementById('modalTitle').textContent = (isNew ? '新增' : '编辑') + (titles[module] || module);
  let body = '';
  if (module === 'announcements') {
    body = '<div class="form-group"><label>标题</label><input type="text" id="edTitle" value="' + (item.title||'') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>分类</label><input type="text" id="edCategory" value="' + (item.category||'物业通知') + '"></div>' +
      '<div class="form-group"><label>发布日期</label><input type="date" id="edDate" value="' + (item.publishDate||new Date().toISOString().split('T')[0]) + '"></div></div>' +
      '<div class="form-group"><label>作者</label><input type="text" id="edAuthor" value="' + (item.author||currentAdmin&&currentAdmin.name||'') + '"></div>' +
      '<div class="form-group form-check"><input type="checkbox" id="edPinned" ' + (item.isPinned?'checked':'') + '><label for="edPinned">置顶</label></div>' +
      '<div class="form-group"><label>内容（支持HTML）</label><textarea id="edContent">' + (item.content||'') + '</textarea></div>' +
      '<div class="form-group"><label>上传附件（支持图片和PDF，自动压缩）</label>' +
      createMultiImageUploaderHTML('annAttach', '支持拖拽或点击上传多张图片或PDF（图片自动压缩至50KB以内）', 'image/*,application/pdf') + '</div>';
  } else if (module === 'documents') {
    body = '<div class="form-group"><label>标题</label><input type="text" id="edTitle" value="' + (item.title||'') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>来源</label><input type="text" id="edSource" value="' + (item.source||'') + '"></div>' +
      '<div class="form-group"><label>发布日期</label><input type="date" id="edDate" value="' + (item.publishDate||new Date().toISOString().split('T')[0]) + '"></div></div>' +
      '<div class="form-group"><label>文件链接</label><input type="text" id="edFileUrl" value="' + (item.fileUrl||'') + '" placeholder="assets/files/xxx.pdf 或外部链接"></div>' +
      '<div class="form-group"><label>上传文件（支持图片和PDF，自动压缩）</label>' +
      createMultiImageUploaderHTML('docFile', '支持拖拽或点击上传多张图片或PDF（图片自动压缩至50KB以内）', 'image/*,application/pdf') + '</div>' +
      '<div class="form-group"><label>描述</label><textarea id="edDesc">' + (item.description||'') + '</textarea></div>';
  } else if (module === 'activities') {
    body = '<div class="form-group"><label>标题</label><input type="text" id="edTitle" value="' + (item.title||'') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>日期</label><input type="date" id="edDate" value="' + (item.date||'') + '"></div>' +
      '<div class="form-group"><label>地点</label><input type="text" id="edLocation" value="' + (item.location||'') + '"></div></div>' +
      '<div class="form-group"><label>状态</label><select id="edStatus"><option value="预告" ' + (item.status==='预告'?'selected':'') + '>预告</option><option value="进行中" ' + (item.status==='进行中'?'selected':'') + '>进行中</option><option value="已结束" ' + (item.status==='已结束'?'selected':'') + '>已结束</option></select></div>' +
      '<div class="form-group"><label>封面图片链接</label><input type="text" id="edCoverImage" value="' + (item.coverImage||'') + '" placeholder="https://example.com/cover.jpg"></div>' +
      createFileUploaderHTML({id:'actCover', accept:'image/*', hint:'支持拖拽或点击上传封面图（自动压缩），上传后自动填充上方链接'}) +
      '<div class="form-group"><label>上传活动图片（支持多选拖拽，最多15张，高强度自动压缩至30KB以内）</label>' +
      createMultiImageUploaderHTML('actImages', '支持拖拽或点击上传多张图片（自动压缩至30KB以内，宽度限制640px）') + '</div>' +
      '<div class="form-group"><label>上传本地视频（支持多选拖拽，最多5个，单个800M以内，上传后自动压缩至100M以内）</label>' +
      createMultiVideoUploaderHTML('actVideos', '支持拖拽或点击上传视频（mp4/mov/webm/avi等，单个100M以内，GitHub API限制）') + '</div>' +
      '<div class="form-group"><label>视频链接（每行一个，支持哔哩哔哩/YouTube/抖音/西瓜/腾讯等，不限制数量）</label><textarea id="edVideoLinks" rows="3" placeholder="https://www.bilibili.com/video/BVxxxxx\nhttps://www.youtube.com/watch?v=xxxxx">' + (item.videoLinks||[]).join('\n') + '</textarea></div>' +
      
      '<div class="form-group"><label>外部链接（每行一个，不限制数量）</label><textarea id="edExternalLinks" rows="2" placeholder="https://www.example.com/article">' + (item.externalLinks||[]).join('\n') + '</textarea></div>' +
      '<div class="form-group"><label>内容</label><textarea id="edContent">' + (item.content||'') + '</textarea></div>';
    } else if (module === 'polls') {
    const nextCaseNo = generateId('polls', 'caseNo');
    const pollMode = item.mode || 'tencent';
    const cat = item.category || 'general';
    const thDesc = cat === 'major' 
      ? '参与双三分之二(66.67%) + 同意双四分之三(75%)' 
      : '参与双三分之二(66.67%) + 同意双过半(50%)';
    body = '<div id="pollValidationErrors" style="color:var(--danger);font-size:13px;margin-bottom:12px;padding:10px;background:#ffebee;border-radius:6px;display:none;"></div>' +
      '<div class="form-group"><label>案卷编号</label><input type="text" id="edCaseNo" value="' + (item.caseNo||nextCaseNo) + '" ' + (!isNew?'readonly style="background:#f5f5f5;"':'') + '></div>' +
      '<div class="form-group"><label>标题</label><input type="text" id="edTitle" value="' + (item.title||'') + '"></div>' +
      '<div class="form-row"><div class="form-group"><label>公告方案征求意见期</label><div class="form-row" style="grid-template-columns:1fr 1fr;"><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">开始日期</label><input type="date" id="edConsultStart" value="' + (item.consultation&&item.consultation.start||'') + '" onchange="autoFillPollDates(this.value)"></div><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">结束日期</label><input type="date" id="edConsultEnd" value="' + (item.consultation&&item.consultation.end||'') + '"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">法定7天</div></div>' +
      '<div class="form-group"><label>正式公告发布期</label><div class="form-row" style="grid-template-columns:1fr 1fr;"><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">开始日期</label><input type="date" id="edAnnounceStart" value="' + (item.announcement&&item.announcement.start||'') + '"></div><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">结束日期</label><input type="date" id="edAnnounceEnd" value="' + (item.announcement&&item.announcement.end||'') + '"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">输入后自动生成后续节点</div></div></div>' +
      '<div class="form-row"><div class="form-group"><label>事项类型 *</label><select id="edCategory" onchange="onPollCategoryChange()"><option value="">— 请选择 —</option><option value="general" '+(item.category==='general'?'selected':'')+'>一般事项</option><option value="major" '+(item.category==='major'?'selected':'')+'>重大事项</option></select></div>' +
      '<div class="form-group"><label>法律依据</label><input type="text" id="edLegalBasis" value="' + (item.legalBasis||'') + '" placeholder="如：《民法典》第278条"></div></div>' +
      '<div class="form-group"><label>表决门槛（根据事项类型自动设定，不可修改）</label><input type="text" id="edThresholdDisplay" readonly style="background:#f5f5f5;" value="' + thDesc + '"></div>' +
      '<div class="form-group"><label>议事规则PDF *</label>' + createMultiImageUploaderHTML('pollRuleFiles', '请上传议事规则PDF文件', 'application/pdf') + '</div>' +
      '<div style="background:#f8f9fa;border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px;">' +
'<div style="font-weight:600;margin-bottom:12px;font-size:15px;display:flex;align-items:center;gap:8px;">📋 业主清册 <span style="font-size:12px;color:var(--text-secondary);font-weight:400;">（支持模板下载、系统同步、上传覆盖）</span></div>' +
'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
'<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);text-align:center;">' +
'<div style="font-size:12px;color:var(--text-secondary);">清册总户数</div>' +
'<div style="font-size:20px;font-weight:700;color:var(--primary);" id="rollStatCount">—</div>' +
'</div>' +
'<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);text-align:center;">' +
'<div style="font-size:12px;color:var(--text-secondary);">清册总面积</div>' +
'<div style="font-size:20px;font-weight:700;color:var(--primary);" id="rollStatArea">—</div>' +
'</div>' +
'</div>' +
'<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">' +
'<button type="button" class="btn btn-sm" onclick="downloadRollTemplate()" title="基于当前业主库生成脱敏CSV模板，姓名已脱敏，不含完整手机号和身份证号">📥 下载脱敏清册模板(CSV)</button>' +
'<button type="button" class="btn btn-sm btn-primary" onclick="syncRollFromResidents()" title="自动从业主库统计总户数和总面积并填入表单">🔄 从业主库自动同步</button>' +
'</div>' +
'<div class="form-group" style="margin-bottom:0;">' +
'<label>上传清册文件（PDF/CSV/Excel）<span style="color:var(--danger);">*</span> <span style="font-size:12px;color:var(--text-secondary);font-weight:400;">上传CSV可自动解析户数和面积；PDF仅作存档。点击已有文件的×删除后可重新上传实现覆盖。</span></label>' +
createMultiImageUploaderHTML('pollRollFiles', '请上传业主清册文件（PDF/CSV/Excel），支持删除后重新上传覆盖', 'application/pdf,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel') + 
'</div>' +
'</div>' +
      '<div class="form-group"><label>业主清册公示期 *（必须在投票开始日期前7日结束公示）</label><div class="form-row" style="grid-template-columns:1fr 1fr;"><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">公示开始日期</label><input type="date" id="edRollStart" value="' + (item.rollPublish&&item.rollPublish.start||'') + '"></div><div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">公示结束日期</label><input type="date" id="edRollEnd" value="' + (item.rollPublish&&item.rollPublish.end||'') + '"></div></div></div>' +
      '<div class="form-group"><label>会议通知PDF *</label>' + createMultiImageUploaderHTML('pollMeetingFiles', '请上传会议通知PDF文件', 'application/pdf') + '</div>' +
      '<div class="form-row"><div class="form-group"><label>街道备案号</label><input type="text" id="edStreetRecord" value="' + (item.streetRecord||'') + '" placeholder="如：XX街备[2026]001号，无则留空"></div>' +
      '<div class="form-group form-check" style="align-self:flex-end;padding-bottom:8px;"><input type="checkbox" id="edStreetConfirm" ' + (item.streetRecordConfirmed?'checked':'') + '><label for="edStreetConfirm">当地无街道备案要求，已确认跳过</label></div></div>' +
      '<div class="form-row"><div class="form-group"><label>开始日期</label><input type="date" id="edStart" value="' + (item.startDate||'') + '"></div>' +
      '<div class="form-group"><label>结束日期</label><input type="date" id="edEnd" value="' + (item.endDate||'') + '"></div></div>' +
      '<div class="form-group"><label>状态</label><select id="edStatus"><option value="进行中" ' + (item.status==='进行中'?'selected':'') + '>进行中</option><option value="已结束" ' + (item.status==='已结束'?'selected':'') + '>已结束</option></select></div>' +
      '<div class="form-group"><label>问卷模式</label><select id="edPollMode" onchange="onPollModeChange()"><option value="tencent" ' + (pollMode==='tencent'?'selected':'') + '>腾讯问卷（外部链接）</option><option value="local" ' + (pollMode==='local'?'selected':'') + '>本地问卷（前端直接填写）</option></select></div>' +
      '<div id="tencentSection" style="' + (pollMode==='local'?'display:none;':'') + '"><div class="form-group"><label>腾讯问卷链接</label><input type="text" id="edTencent" value="' + (item.tencentUrl||'') + '"></div></div>' +
      '<div id="localSection" style="' + (pollMode==='tencent'?'display:none;':'') + 'border:1px solid var(--border);border-radius:8px;padding:16px;background:#fafafa;">' +
      '<div style="font-weight:600;margin-bottom:12px;">📝 问卷题目设置</div>' +
      '<div id="pollQuestionsEditor"></div>' +
      '<button type="button" class="btn" onclick="addPollQuestion()" style="margin-top:8px;">➕ 添加题目</button>' +
      '</div>' +
      '<div class="form-row"><div class="form-group"><label>目标户数</label><input type="number" id="edTarget" value="' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + '"></div>' +
      '<div class="form-group"><label>当前参与</label><input type="number" id="edCurrent" value="' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + '"></div></div>' +
      '<div class="form-group form-check"><input type="checkbox" id="edPublishResult" ' + (item.results&&item.results.isPublished?'checked':'') + '><label for="edPublishResult">公示结果</label></div>' +
      '<div class="form-group"><label>结果摘要</label><textarea id="edResultSummary">' + (item.results&&item.results.summary||'') + '</textarea></div>' +
      '<div class="form-group"><label>描述</label><textarea id="edDesc">' + (item.description||'') + '</textarea></div>';

    // === 计票结果展示（只读）===
    const disp = getPollDisplayStats(item);
    const res = item.results || {};
    const hasResult = res.calculatedAt !== undefined;
    const isMajor = item.category === 'major';
    const agreeTh = isMajor ? '75%' : '50%';
    const partTh = (item.threshold && item.threshold.residentPct) ? (item.threshold.residentPct + '%') : '66.67%';
    body += '<div style="margin-top:20px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
    body += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">📊 计票结果' + (hasResult ? ' <span style="font-size:12px;color:var(--text-secondary);font-weight:400;">（' + formatDateTime(res.calculatedAt) + ' 计算）</span>' : ' <span style="font-size:12px;color:var(--text-secondary);font-weight:400;">（尚未计票）</span>') + (disp.fromCache ? '' : ' <span style="font-size:12px;color:var(--warning);font-weight:400;">⚠️ 面积数据已自动从业主库补全，建议点击"重新计票"固化</span>') + '</div>';
    if (hasResult) {
      body += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">';
      body += '<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-secondary);">参与人数 / 目标户数</div><div style="font-size:18px;font-weight:700;">' + disp.participatingResidents + ' / ' + disp.totalResidents + '</div><div class="progress-bar" style="margin-top:4px;height:8px;"><div class="progress-bar-fill" style="width:' + Math.min(100, disp.residentParticipationRate) + '%;"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + disp.residentParticipationRate.toFixed(2) + '%（门槛 ' + partTh + '）</div></div>';
      body += '<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-secondary);">参与面积 / 总面积</div><div style="font-size:18px;font-weight:700;">' + disp.participatingArea.toFixed(2) + ' / ' + disp.totalArea.toFixed(2) + ' ㎡</div><div class="progress-bar" style="margin-top:4px;height:8px;"><div class="progress-bar-fill" style="width:' + Math.min(100, disp.areaParticipationRate) + '%;background:#1976D2;"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + disp.areaParticipationRate.toFixed(2) + '%（门槛 ' + partTh + '）</div></div>';
      body += '<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-secondary);">同意人数 / 参与人数</div><div style="font-size:18px;font-weight:700;">' + disp.agreeCount + ' / ' + disp.participatingResidents + '</div><div class="progress-bar" style="margin-top:4px;height:8px;"><div class="progress-bar-fill" style="width:' + Math.min(100, disp.agreeResidentRate) + '%;"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + disp.agreeResidentRate.toFixed(2) + '%（门槛 ' + agreeTh + '）</div></div>';
      body += '<div style="background:#fff;padding:10px;border-radius:6px;border:1px solid var(--border);"><div style="font-size:12px;color:var(--text-secondary);">同意面积 / 参与面积</div><div style="font-size:18px;font-weight:700;">' + disp.agreeArea.toFixed(2) + ' / ' + disp.participatingArea.toFixed(2) + ' ㎡</div><div class="progress-bar" style="margin-top:4px;height:8px;"><div class="progress-bar-fill" style="width:' + Math.min(100, disp.agreeAreaRate) + '%;background:#1976D2;"></div></div><div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + disp.agreeAreaRate.toFixed(2) + '%（门槛 ' + agreeTh + '）</div></div>';
      body += '</div>';
      if (item.status === '已结束') {
        if (disp.isPassed === true) {
          body += '<div style="text-align:center;padding:10px;background:#e8f5e9;border-radius:6px;color:#2e7d32;font-weight:600;font-size:16px;">✅ 表决通过</div>';
        } else if (disp.isPassed === false) {
          body += '<div style="text-align:center;padding:10px;background:#ffebee;border-radius:6px;color:#c62828;font-weight:600;font-size:16px;">❌ 表决未通过</div>';
        }
      } else {
        body += '<div style="text-align:center;padding:10px;background:#fff3e0;border-radius:6px;color:#e65100;font-weight:600;font-size:16px;">🗳️ 投票进行中，尚未结束</div>';
      }
      body += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">' + escapeHtml(disp.summary) + '</div>';
    } else {
      body += '<div style="text-align:center;padding:20px;color:var(--text-secondary);">暂无计票数据，请点击下方"重新计票"按钮</div>';
    }
    body += '</div>';

    setTimeout(function() {
      renderPollQuestionsEditor(item.questions || []);
      if (item.ruleFiles && item.ruleFiles.length) setMultiUploadedPaths('pollRuleFiles', item.ruleFiles);
      if (item.rollFiles && item.rollFiles.length) setMultiUploadedPaths('pollRollFiles', item.rollFiles);
      if (item.meetingFiles && item.meetingFiles.length) setMultiUploadedPaths('pollMeetingFiles', item.meetingFiles);
      // 初始化清册统计显示
      if (item.rollStats) {
        updateRollStats(item.rollStats.totalCount, item.rollStats.totalArea);
      } else {
        const activeResidents = (appData.residents || []).filter(function(r) { return r.status === 'active'; });
        const defaultCount = activeResidents.length;
        const defaultArea = activeResidents.reduce(function(sum, r) { return sum + (parseFloat(r.area) || 0); }, 0);
        updateRollStats(defaultCount, defaultArea);
      }
      if (item.consultation) {
        var cs = document.getElementById('edConsultStart');
        var ce = document.getElementById('edConsultEnd');
        if (cs) cs.value = item.consultation.start || '';
        if (ce) ce.value = item.consultation.end || '';
      }
      if (item.announcement) {
        var as = document.getElementById('edAnnounceStart');
        var ae = document.getElementById('edAnnounceEnd');
        if (as) as.value = item.announcement.start || '';
        if (ae) ae.value = item.announcement.end || '';
      }
    }, 200);
  } else if (module === 'residents') {
    body = '<div class="form-row"><div class="form-group"><label>房号</label><input type="text" id="edRoom" value="' + (item.roomNo||'') + '" placeholder="如：1-1-101"></div>' +
      '<div class="form-group"><label>姓名</label><input type="text" id="edName" value="' + (item.name||'') + '"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>专有部分面积(m²)</label><input type="number" id="edArea" value="' + (item.area||'') + '" placeholder="60-140"></div>' +
      '<div class="form-group"><label>手机号后四位</label><input type="text" id="edPhone" value="' + (item.phoneSuffix||'') + '" maxlength="4"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>身份证号哈希(SHA-256)</label><input type="text" id="edIdCardHash" value="' + (item.idCardHash||'') + '" placeholder="留空则不修改"></div>' +
      '<div class="form-group"><label>绑定方式</label><select id="edBindingMethod"><option value="">— 请选择 —</option><option value="人脸识别" '+(item.bindingMethod==='人脸识别'?'selected':'')+'>人脸识别</option><option value="现场核验" '+(item.bindingMethod==='现场核验'?'selected':'')+'>现场核验</option><option value="委托" '+(item.bindingMethod==='委托'?'selected':'')+'>委托</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>人数权重</label><input type="number" id="edVoteWeightCount" value="' + (item.voteWeightCount||1) + '" min="1"></div>' +
      '<div class="form-group"><label>面积权重</label><input type="number" id="edVoteWeightArea" value="' + (item.voteWeightArea||item.area||'') + '" placeholder="默认等于面积"></div></div>' +
      '<div class="form-group form-check"><input type="checkbox" id="edSameBuyer" ' + (item.isSameBuyer?'checked':'') + '><label for="edSameBuyer">同一买受人多套房标记</label></div>' +
      '<div class="form-group"><label>核验照片</label>' + createMultiImageUploaderHTML('resProof', '支持拖拽或点击上传核验照片（自动压缩）') + '</div>' +
      '<div class="form-group"><label>状态</label><select id="edStatus"><option value="active" ' + (item.status==='active'?'selected':'') + '>正常</option><option value="disabled" ' + (item.status==='disabled'?'selected':'') + '>禁用</option></select></div>' +
      '<div class="form-group form-check"><input type="checkbox" id="edTest" ' + (item.isTest?'checked':'') + '><label for="edTest">标记为测试数据</label></div>';
    setTimeout(function() {
      if (item.bindingProof && item.bindingProof.length) setMultiUploadedPaths('resProof', item.bindingProof);
    }, 50);
  }
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = `<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveItem('${module}','${id||''}')">保存</button>`;
  document.getElementById('modalOverlay').classList.add('active');

  // 初始化已有文件预览
  setTimeout(function() {
    if (module === 'activities') {
      if (item.coverImage) setUploadedPath('actCover', item.coverImage, 'cover');
      if (item.images && item.images.length) setMultiUploadedPaths('actImages', item.images);
      let videos = (item.videos || []).map(v => typeof v === 'string' ? { path: v, name: 'video', size: 0 } : v);
      // 兼容旧数据：只有当 videoUrl 存在且是本地路径（非外部链接）时才显示
      if (!videos.length && item.videoUrl && !item.videoUrl.match(/^https?:\/\//)) {
        videos = [{ path: item.videoUrl, name: 'video', size: 0 }];
      }
      if (videos.length) setMultiUploadedVideos('actVideos', videos);
    } else if (module === 'documents') {
      let docPaths = [];
      // 优先从新的 attachments 数组加载（参照公告管理）
      if (item.attachments && item.attachments.length) {
        docPaths.push(...item.attachments.map(a => a.url).filter(Boolean));
      }
      // 兼容旧数据：images + fileUrl
      if (item.images && item.images.length) {
        item.images.forEach(url => {
          if (url && !docPaths.includes(url)) docPaths.push(url);
        });
      }
      if (item.fileUrl && !docPaths.includes(item.fileUrl)) {
        docPaths.push(item.fileUrl);
      }
      if (docPaths.length) setMultiUploadedPaths('docFile', docPaths);
    } else if (module === 'announcements') {
      if (item.attachments && item.attachments.length) {
        const paths = item.attachments.map(a => a.url).filter(Boolean);
        if (paths.length) setMultiUploadedPaths('annAttach', paths);
      }
    }
  }, 50);
}

function generateCaseNo() {
  const year = new Date().getFullYear();
  const polls = appData.polls || [];
  const maxNum = polls.reduce((max, p) => {
    const match = p.caseNo && p.caseNo.match(/YJ-(\d+)/);
    return match ? Math.max(max, parseInt(match[1])) : max;
  }, 0);
  return year + '-YJ-' + String(maxNum + 1).padStart(3, '0');
}

function autoFillPollDates(consultStartStr) {
  if (!consultStartStr) return;
  const consultStart = new Date(consultStartStr);
  // 公告方案征求意见期：7天（含首尾）
  const consultEnd = new Date(consultStart);
  consultEnd.setDate(consultEnd.getDate() + 6);
  // 正式公告发布期：开始 = 征求意见结束 + 3天，间隔15天（含首尾）
  const announceStart = new Date(consultEnd);
  announceStart.setDate(announceStart.getDate() + 3);
  const announceEnd = new Date(announceStart);
  announceEnd.setDate(announceEnd.getDate() + 14);
  // 业主清册公示期：开始同正式公告发布期，7天（含首尾）
  const rollStart = new Date(announceStart);
  const rollEnd = new Date(announceStart);
  rollEnd.setDate(rollEnd.getDate() + 6);
  // 投票日期：开始 = 正式公告开始 + 16天，间隔10天（含首尾）
  const voteStart = new Date(announceStart);
  voteStart.setDate(voteStart.getDate() + 16);
  const voteEnd = new Date(voteStart);
  voteEnd.setDate(voteEnd.getDate() + 9);
  document.getElementById('edConsultEnd').value = formatDate(consultEnd);
  document.getElementById('edAnnounceStart').value = formatDate(announceStart);
  document.getElementById('edAnnounceEnd').value = formatDate(announceEnd);
  document.getElementById('edRollStart').value = formatDate(rollStart);
  document.getElementById('edRollEnd').value = formatDate(rollEnd);
  document.getElementById('edStart').value = formatDate(voteStart);
  document.getElementById('edEnd').value = formatDate(voteEnd);
  const thDisplay = document.getElementById('edThresholdDisplay');
  if (thDisplay) thDisplay.value = '当前时间线：征求意见7天 → 间隔3天 → 正式公告15天 → 清册公示7天（同公告期开始）→ 投票10天（公告后16天）';
}

async function saveCurrentModule() {
  if (currentModule === 'config') {
    if (!appData.config) appData.config = {};
    if (!appData.config.community) appData.config.community = {};
    const c = appData.config.community;
    c.name = document.getElementById('cfgName').value;
    c.address = document.getElementById('cfgAddress').value;
    c.totalUnits = parseInt(document.getElementById('cfgUnits').value) || 0;
    c.builtYear = document.getElementById('cfgYear').value;
    c.area = document.getElementById('cfgArea').value;
    c.propertyCompany = document.getElementById('cfgProperty').value;
    c.committeePhone = document.getElementById('cfgCommittee').value;
    c.propertyPhone = document.getElementById('cfgPropertyPhone').value;
    c.slogan = document.getElementById('cfgSlogan').value;
    c.siteTitle = document.getElementById('cfgSiteTitle').value.trim();
    c.favicon = document.getElementById('cfgFavicon').value;
    const logoPath = getUploadedPath('cfgLogo');
    if (logoPath) c.logo = logoPath;
    const faviconPath = getUploadedPath('cfgFavicon');
    if (faviconPath) c.favicon = faviconPath;
    if (!appData.config.settings) appData.config.settings = {};
    appData.config.settings.defaultTheme = document.getElementById('cfgTheme').value;
    updateFavicon();
    // 同步站点 Logo 配置到 localStorage，供所有子页面（life.html / admin-life.html）读取
    var logoCfg = {
      type: c.logo ? "image" : "emoji",
      value: c.logo || "&#127968;",
      title: c.siteTitle || c.name || "春天阳光小区",
      adminTitle: c.name ? c.name + " - 管理后台" : "管理后台"
    };
    setSiteLogoConfig(logoCfg);
    showLoading(true);
    try {
      await saveDataFile('config', appData.config, '更新社区配置', 'update');
      showToast('保存成功，站点 Logo 已同步到所有页面', 'success');
    } catch(e) {
      showToast('保存失败：' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }
}

async function saveItem(module, id) {
  const isNew = !id;
  let item = isNew ? { id: generateId(module) } : (appData[module] || []).find(x => x.id === id);
  if (!item) item = { id: id || generateId(module) };
  if (module === 'announcements') {
    item.title = document.getElementById('edTitle').value;
    item.category = document.getElementById('edCategory').value;
    item.publishDate = document.getElementById('edDate').value;
    item.author = document.getElementById('edAuthor').value;
    item.isPinned = document.getElementById('edPinned').checked;
    item.content = document.getElementById('edContent').value;
    item.views = item.views || 0;
    item.attachments = [];
    const uploadedPaths = getMultiUploadedPaths('annAttach');
    uploadedPaths.filter(path => !path.startsWith('blob:')).forEach(path => {
      item.attachments.push({ name: path.split('/').pop() || '附件', url: path });
    });
  } else if (module === 'documents') {
    item.title = document.getElementById('edTitle').value;
    item.source = document.getElementById('edSource').value;
    item.publishDate = document.getElementById('edDate').value;
    item.description = document.getElementById('edDesc').value;
    item.category = '上级文件';

    // 参照公告管理：使用 attachments 数组保存所有上传附件
    item.attachments = [];
    const uploadedPaths = getMultiUploadedPaths('docFile');
    uploadedPaths.filter(path => !path.startsWith('blob:')).forEach(path => {
      item.attachments.push({ 
        name: path.split('/').pop() || '附件', 
        url: path,
        type: /\.pdf$/i.test(path) ? 'pdf' : 'image'
      });
    });

    // 兼容旧字段：自动同步 fileUrl 和 images
    const pdfAttachments = item.attachments.filter(a => a.type === 'pdf');
    const imageAttachments = item.attachments.filter(a => a.type === 'image');

    // fileUrl：优先使用手动输入的值，否则取第一个PDF或第一个附件
    const manualFileUrl = document.getElementById('edFileUrl').value.trim();
    if (manualFileUrl) {
      item.fileUrl = manualFileUrl;
    } else if (pdfAttachments.length) {
      item.fileUrl = pdfAttachments[0].url;
    } else if (item.attachments.length) {
      item.fileUrl = item.attachments[0].url;
    } else {
      item.fileUrl = '';
    }

    // images：取所有图片附件
    item.images = imageAttachments.map(a => a.url);
  } else if (module === 'activities') {
    item.title = document.getElementById('edTitle').value;
    item.date = document.getElementById('edDate').value;
    item.location = document.getElementById('edLocation').value;
    item.status = document.getElementById('edStatus').value;
    const coverPath = getUploadedPath('actCover');
    if (coverPath) item.coverImage = coverPath;
    else item.coverImage = document.getElementById('edCoverImage').value.trim();
    const uploadedImages = getMultiUploadedPaths('actImages');
    let allImages = [...new Set(uploadedImages)].slice(0, 15);
    item.images = allImages;
    // 检测并过滤掉失效的 blob 链接
    item.images = item.images.filter(url => !url.startsWith('blob:'));
    const uploadedVideos = getMultiUploadedVideos('actVideos');
    item.videos = uploadedVideos.map(v => v.path).filter(url => !url.startsWith('blob:'));
    const vlinkText = document.getElementById('edVideoLinks').value.trim();
    item.videoLinks = vlinkText ? vlinkText.split(/\n/).map(s => s.trim()).filter(s => s) : [];
    item.videoUrl = item.videos[0] || '';  // 本地视频URL，不再混用外部链接
    const extText = document.getElementById('edExternalLinks').value.trim();
    item.externalLinks = extText ? extText.split(/\n/).map(s => s.trim()).filter(s => s) : [];
    item.externalLink = item.externalLinks[0] || '';  // 兼容旧字段
    item.content = document.getElementById('edContent').value;
  } else if (module === 'polls') {
    const validation = validatePollCompliance();
    if (!validation.valid) {
      const errBox = document.getElementById('pollValidationErrors');
      if (errBox) { errBox.innerHTML = validation.errors.map(e => '• ' + e).join('<br>'); errBox.style.display = 'block'; }
      showToast('请完善投票发起必填信息', 'error');
      return;
    }
    item.caseNo = document.getElementById('edCaseNo').value;
    item.title = document.getElementById('edTitle').value;
    item.category = document.getElementById('edCategory').value || 'general';
    item.legalBasis = document.getElementById('edLegalBasis').value;
    // item.ruleId 字段未在表单中配置，暂不保存
    item.startDate = document.getElementById('edStart').value;
    item.endDate = document.getElementById('edEnd').value;
    item.status = document.getElementById('edStatus').value;
    item.mode = document.getElementById('edPollMode').value;
    item.tencentUrl = document.getElementById('edTencent').value;
    item.streetRecord = document.getElementById('edStreetRecord').value;
    item.streetRecordConfirmed = document.getElementById('edStreetConfirm').checked;
    item.ruleFiles = getMultiUploadedPaths('pollRuleFiles');
    item.rollFiles = getMultiUploadedPaths('pollRollFiles');
    item.meetingFiles = getMultiUploadedPaths('pollMeetingFiles');
    
    // pollNotifyFiles 上传组件未在表单中配置，使用已有数据或空数组
    item.notifyFiles = item.notifyFiles || [];
    
    item.rollPublish = {
      start: document.getElementById('edRollStart').value,
      end: document.getElementById('edRollEnd').value
      // file 字段未在表单中配置，暂不保存
    };
    
    const isMajor = item.category === 'major';
    item.threshold = isMajor 
      ? { type: 'double_two_thirds', desc: '双2/3（人数+面积各过2/3）', residentPct: 66.67, areaPct: 66.67 }
      : { type: 'double_half', desc: '双过半（人数+面积各过半）', residentPct: 50, areaPct: 50 };
    
    const edTargetVal = document.getElementById('edTarget').value.trim();
    const edCurrentVal = document.getElementById('edCurrent').value.trim();
    const oldProgress = item.progress || {};
    // 保存清册同步数据
    if (window._rollSyncData) {
      item.rollStats = {
        totalCount: window._rollSyncData.count,
        totalArea: window._rollSyncData.area,
        source: window._rollSyncData.source,
        syncedAt: new Date().toISOString()
      };
      window._rollSyncData = null;
    }
    item.progress = {
      target: edTargetVal !== '' ? parseInt(edTargetVal) : (oldProgress.target !== undefined ? oldProgress.target : 300),
      current: edCurrentVal !== '' ? parseInt(edCurrentVal) : (oldProgress.current !== undefined ? oldProgress.current : 0),
      unit: '户'
    };
    // 只更新用户可编辑的结果字段，保留 calculatePollResults 生成的计票数据
    item.results = item.results || {};
    item.results.isPublished = document.getElementById('edPublishResult').checked;
    const originalSummary = item.results.summary || '';
    const userSummary = document.getElementById('edResultSummary').value.trim();
    if (userSummary && userSummary !== originalSummary) {
      item.results.summary = userSummary;
    }
    item.results.detailUrl = item.results.detailUrl || '';
    item.description = document.getElementById('edDesc').value;
    item.consultation = { start: document.getElementById('edConsultStart').value, end: document.getElementById('edConsultEnd').value };
    item.announcement = { start: document.getElementById('edAnnounceStart').value, end: document.getElementById('edAnnounceEnd').value };
    item.type = item.type || 'opinion';
    item.createdBy = item.createdBy || currentAdmin && currentAdmin.name;
    item.createdAt = item.createdAt || new Date().toISOString();
    
    item.votes = item.votes || [];
    item.notifyRecords = item.notifyRecords || [];
    item.objections = item.objections || [];
    item.participatingResidents = item.participatingResidents || 0;
    item.participatingArea = item.participatingArea || 0;
    item.agreeCount = item.agreeCount || 0;
    item.agreeArea = item.agreeArea || 0;
    
    if(item.mode === 'local') {
      item.questions = collectPollQuestions();
    } else {
      item.questions = [];
    }
  } else if (module === 'residents') {
    item.roomNo = document.getElementById('edRoom').value;
    item.name = document.getElementById('edName').value;
    item.phoneSuffix = document.getElementById('edPhone').value;
    item.area = parseFloat(document.getElementById('edArea').value) || 0;
    item.idCardHash = document.getElementById('edIdCardHash').value.trim();
    item.bindingMethod = document.getElementById('edBindingMethod').value;
    if (item.bindingMethod && !item.bindingTime) item.bindingTime = new Date().toISOString();
    item.voteWeightCount = parseInt(document.getElementById('edVoteWeightCount').value) || 1;
    item.voteWeightArea = parseFloat(document.getElementById('edVoteWeightArea').value) || item.area || 0;
    item.isSameBuyer = document.getElementById('edSameBuyer').checked;
    item.bindingProof = getMultiUploadedPaths('resProof') || item.bindingProof || [];
    item.status = document.getElementById('edStatus').value;
    item.isTest = document.getElementById('edTest').checked;
    item.registeredAt = item.registeredAt || new Date().toISOString().split('T')[0];
  }
  const list = appData[module] || [];
  const idx = list.findIndex(x => x.id === item.id);
  if (idx >= 0) list[idx] = item; else list.push(item);
  appData[module] = list;
  const action = isNew ? 'create' : 'update';
  const detail = (isNew ? '新增' : '更新') + getModuleName(module) + '《' + (item.title || item.name || '') + '》';
  closeModal(); showLoading(true);
  try {
    // 自动计票（在保存之前，确保计票结果一并持久化）
    if (module === 'polls') {
      const hasWorker = !!getWorkerBase();
      if (hasWorker) {
        try { await calculatePollResults(item.id); } catch(e) { console.error('自动计票失败', e); }
        const oldItem = (appData.polls || []).find(x => x.id === item.id);
        const wasEnded = oldItem && oldItem.status === '已结束';
        if (item.status === '已结束' && !wasEnded) {
          try { await anchorVoteData(item.id); } catch(e) { console.error('自动锚定失败', e); }
        }
      } else {
        console.log('[本地模式] 跳过自动计票，保留已有计票结果');
      }
    }
    await saveDataFile(module, list, detail, action);
    showToast('保存成功', 'success');
    navigateTo(module);
  } catch(e) {
    showToast('保存失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(module, id) {
  if (currentAdmin && currentAdmin.canDelete === false) {
    showToast('您的账号没有删除权限，请联系总维护人员', 'error');
    return;
  }
  if (!confirm('确定要删除吗？此操作不可恢复。')) return;
  const list = appData[module] || [];
  const item = list.find(x => x.id === id) || {};
  const newList = list.filter(x => x.id !== id);
  appData[module] = newList;
  showLoading(true);
  try {
    await saveDataFile(module, newList, '删除' + getModuleName(module) + '《' + (item && item.title || item && item.name || id) + '》', 'delete');
    showToast('删除成功', 'success');
    navigateTo(module);
  } catch(e) {
    showToast('删除失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}



/* ===== 管理员注册与审批 ===== */

function getAllAdminAccounts() {
  var registered = ((appData.config && appData.config.adminUsers) || [])
    .filter(function(a) { return a.status === 'approved'; })
    .map(function(a) { return { id: a.id, name: a.name, role: 'admin', password: a.password, canDelete: a.canDelete !== false }; });
  return ADMIN_ACCOUNTS.concat(registered);
}

// 登录页初始化：预填上次成功登录的用户名；勾选框沿用上次选择
function renderLoginRoles() {
  try {
    var nameEl = document.getElementById('loginName');
    if (nameEl && !nameEl.value) {
      nameEl.value = localStorage.getItem('admin_auth_last_user') || '';
    }
    var remEl = document.getElementById('loginRemember');
    if (remEl) {
      remEl.checked = localStorage.getItem('admin_auth_remember_flag') !== '0';
    }
  } catch (e) {}
}





/* ===== 管理员管理页面（仅总维护人员） =====
   数据来源：Worker /api/admin/accounts（R2 data/admin-accounts.json）
   与登录页「申请管理员权限」、登录接口三线闭环 */

function renderAdminManage() {
  setTimeout(loadAdminAccountsUI, 0);
  return '<div class="card"><div class="card-header"><h3>👤 管理员管理（申请审批 · 账号开关）</h3></div>' +
    '<div id="adminAccountsArea" style="padding:30px;text-align:center;color:var(--text-secondary);">⏳ 正在加载管理员账号...</div></div>';
}

async function loadAdminAccountsUI() {
  var area = document.getElementById('adminAccountsArea');
  if (!area) return;
  try {
    var res = await fetch('/api/admin/accounts', { headers: { 'Accept': 'application/json' } });
    var data = await res.json();
    if (!data.success) { area.innerHTML = '<span style="color:var(--danger);">加载失败：' + escapeHtml(data.error || ('HTTP ' + res.status)) + '</span>'; return; }
    area.innerHTML = buildAccountsHtml(data.accounts || []);
  } catch(e) {
    area.innerHTML = '<span style="color:var(--danger);">加载失败：' + escapeHtml(e.message) + '</span>';
  }
}

// 账号级板块开关的可配置模块清单（与侧边栏实际渲染的板块完全一致；
// admin-manage / dev-tools 仅总维护人员可用，audit 无侧边栏入口，均不在个人账号可配置范围内）
var ACCOUNT_MODULE_LIST = [
  { id: 'dashboard', name: '仪表盘' },
  { id: 'config', name: '社区配置' },
  { id: 'announcements', name: '公告管理' },
  { id: 'documents', name: '文件管理' },
  { id: 'activities', name: '动态管理' },
  { id: 'polls', name: '投票管理' },
  { id: 'residents', name: '业主管理' },
  { id: 'workorders', name: '工单管理' },
  { id: 'complaints', name: '投诉建议' },
  { id: 'funds', name: '阳光资金' },
  { id: 'settings', name: '系统设置' },
  { id: 'life', name: '生活服务' },
  { id: 'trade', name: '交易管理' }
];

// 各身份在侧边栏默认可见的板块（账号级开关未显式设置时按此基线显示）
var ROLE_MODULE_MAP = {
  'admin-property':  ['dashboard', 'announcements', 'documents', 'residents', 'workorders', 'funds', 'life', 'trade', 'settings'],
  'admin-committee': ['dashboard', 'polls', 'residents', 'complaints', 'funds', 'life', 'trade', 'settings'],
  'admin-community': ['dashboard', 'announcements', 'activities', 'complaints', 'funds', 'life', 'trade', 'settings']
};

// 全局板块开关是否关闭了某板块（开发者工具 / 模块配置，对非总维护人员生效）
function isModuleGloballyOff(moduleId) {
  try {
    var sw = (window.appData && window.appData.config && window.appData.config.moduleSwitches) || null;
    if (sw && sw[moduleId] === false) return true;
  } catch (e) {}
  try {
    var saved = JSON.parse(localStorage.getItem('config') || 'null');
    if (saved && saved.moduleSwitches && saved.moduleSwitches[moduleId] === false) return true;
  } catch (e) {}
  try {
    var cfg = (typeof window.getModuleConfig === 'function') ? window.getModuleConfig() : null;
    if (cfg && cfg.modules && cfg.modules[moduleId] && cfg.modules[moduleId].visible === false) return true;
  } catch (e) {}
  return false;
}

function buildAccountsHtml(accounts) {
  var html = '';
  var pending = accounts.filter(function(a){ return a.status === 'pending'; });
  var approved = accounts.filter(function(a){ return a.status === 'approved'; });
  var rejected = accounts.filter(function(a){ return a.status === 'rejected'; });

  html += '<p style="font-weight:600;margin-bottom:10px;">⏳ 待审批（' + pending.length + '）</p>';
  if (!pending.length) {
    html += '<p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px;">暂无待审批的申请。新管理员请从登录页「申请管理员权限」入口提交。</p>';
  } else {
    pending.forEach(function(a) {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px;background:#fff8e1;border-radius:6px;margin-bottom:8px;">' +
        '<div>' +
          '<div style="font-weight:600;">' + escapeHtml(a.name) + ' <span style="font-size:12px;color:var(--primary);font-weight:500;">' + escapeHtml(a.roleName || '') + '</span></div>' +
          '<div style="font-size:12px;color:var(--text-secondary);">' + (a.note ? '说明: ' + escapeHtml(a.note) + ' · ' : '') + '申请: ' + String(a.appliedAt || '').slice(0,10) + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0;">' +
          '<button class="btn btn-primary" style="padding:4px 14px;font-size:12px;" onclick="reviewAdminAccount(\'' + a.id + '\',\'approve\')">✅ 同意</button>' +
          '<button class="btn" style="padding:4px 14px;font-size:12px;background:var(--danger);color:#fff;" onclick="reviewAdminAccount(\'' + a.id + '\',\'reject\')">❌ 拒绝</button>' +
        '</div></div>';
    });
  }

  html += '<p style="font-weight:600;margin:16px 0 10px;">✅ 已启用账号（' + approved.length + '）</p>';
  if (!approved.length) {
    html += '<p style="color:var(--text-secondary);font-size:13px;">暂无已审批的个人账号（5 个内置身份由环境变量管理，不在此列表）。</p>';
  } else {
    approved.forEach(function(a) {
      // 完整板块清单 + 实际生效状态：
      // 勾选 = 实际可见（账号显式设置 > 身份默认基线），全局关闭的板块标灰不可勾，保证面板与侧边栏一致
      var acctMods = (a.modules && typeof a.modules === 'object') ? a.modules : {};
      var roleKey = String(a.role || '');
      if (roleKey.indexOf('admin-') !== 0) roleKey = 'admin-' + roleKey;
      var roleAllowed = ROLE_MODULE_MAP[roleKey] || [];
      var modsGrid = ACCOUNT_MODULE_LIST.map(function(m) {
        var acctSet = Object.prototype.hasOwnProperty.call(acctMods, m.id);
        var checked = acctSet ? !!acctMods[m.id] : (roleAllowed.indexOf(m.id) >= 0);
        var globalOff = isModuleGloballyOff(m.id);
        var disabledAttr = globalOff ? ' disabled title="该板块已全局关闭，需先在开发者工具中开启"' : '';
        var offTag = globalOff ? ' <span style="font-size:11px;color:#c62828;">（全局已关）</span>' : '';
        return '<label style="display:flex;align-items:center;gap:3px;font-size:12px;cursor:' + (globalOff ? 'not-allowed' : 'pointer') + ';">' +
          '<input type="checkbox" ' + (checked ? 'checked' : '') + disabledAttr + ' onchange="toggleAdminAccountModules(\'' + a.id + '\',\'' + m.id + '\',this.checked)">' + m.name + offTag + '</label>';
      }).join('');
      html += '<div style="padding:10px;background:' + (a.disabled ? '#f5f5f5' : '#e8f5e9') + ';border-radius:6px;margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">' +
        '<div>' +
          '<div style="font-weight:600;' + (a.disabled ? 'color:#999;text-decoration:line-through;' : '') + '">' + escapeHtml(a.name) + ' <span style="font-size:12px;color:var(--primary);font-weight:500;">' + escapeHtml(a.roleName || '') + '</span>' + (a.disabled ? ' <span style="font-size:11px;color:#c62828;">（已停用）</span>' : '') + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);">审批: ' + String(a.reviewedAt || '').slice(0,10) + (a.reviewedBy ? ' · 操作: ' + escapeHtml(a.reviewedBy) : '') + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:14px;flex-shrink:0;">' +
          '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;" title="关闭后该账号无法登录">' +
            '<input type="checkbox" ' + (!a.disabled ? 'checked' : '') + ' onchange="toggleAdminAccount(\'' + a.id + '\',{disabled:this.checked?false:true})">登录启用' +
          '</label>' +
          '<label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">' +
            '<input type="checkbox" ' + (a.canDelete !== false ? 'checked' : '') + ' onchange="toggleAdminAccount(\'' + a.id + '\',{canDelete:this.checked})">允许删除' +
          '</label>' +
        '</div></div>' +
        '<details style="margin-top:8px;">' +
          '<summary style="font-size:12px;cursor:pointer;color:var(--primary);user-select:none;">📂 板块权限（点击展开，勾选 = 该账号可见）</summary>' +
          '<div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:8px;padding:8px;background:rgba(255,255,255,0.6);border-radius:4px;">' + modsGrid + '</div>' +
        '</details>' +
      '</div>';
    });
  }

  if (rejected.length) {
    html += '<p style="font-weight:600;margin:16px 0 10px;">❌ 已拒绝（' + rejected.length + '）</p>';
    rejected.forEach(function(a) {
      html += '<div style="padding:10px;background:#ffebee;border-radius:6px;margin-bottom:8px;">' +
        '<div style="font-weight:600;">' + escapeHtml(a.name) + ' <span style="font-size:12px;color:var(--primary);font-weight:500;">' + escapeHtml(a.roleName || '') + '</span></div>' +
        '<div style="font-size:12px;color:var(--text-secondary);">拒绝: ' + String(a.reviewedAt || '').slice(0,10) + (a.rejectedReason ? ' · 原因: ' + escapeHtml(a.rejectedReason) : '') + '</div></div>';
    });
  }
  return html;
}

async function reviewAdminAccount(id, action) {
  var reason = '';
  if (action === 'reject') {
    reason = prompt('拒绝原因（可选）：');
    if (reason === null) return;
  }
  try {
    var res = await fetch('/api/admin/accounts/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, action: action, reason: reason || '' })
    });
    var data = await res.json();
    if (data.success) { showToast(action === 'approve' ? ('已批准 ' + (data.name || '')) : '已拒绝该申请', 'success'); loadAdminAccountsUI(); }
    else showToast('操作失败：' + (data.error || ''), 'error');
  } catch(e) { showToast('操作失败：' + e.message, 'error'); }
}

async function toggleAdminAccount(id, patch) {
  try {
    var body = { id: id };
    Object.keys(patch || {}).forEach(function(k){ body[k] = patch[k]; });
    var res = await fetch('/api/admin/accounts/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.success) { showToast('账号设置已更新', 'success'); loadAdminAccountsUI(); }
    else { showToast('操作失败：' + (data.error || ''), 'error'); loadAdminAccountsUI(); }
  } catch(e) { showToast('操作失败：' + e.message, 'error'); loadAdminAccountsUI(); }
}

// 账号级板块开关：增量更新单个模块可见性
async function toggleAdminAccountModules(id, moduleId, enabled) {
  var patch = { modules: {} };
  patch.modules[moduleId] = !!enabled;
  await toggleAdminAccount(id, patch);
}

/* ===== 开发者工具页面（仅总维护人员） ===== */

function renderDevTools() {
  var switches = (appData.config && appData.config.moduleSwitches) || {};
  var modules = [
    { key: 'announcements', label: '公告模块', desc: '前台公告导航与后台公告管理' },
    { key: 'documents', label: '文件模块', desc: '前台文件导航与后台文件管理' },
    { key: 'activities', label: '动态模块', desc: '前台动态导航与后台动态管理' },
    { key: 'polls', label: '投票管理', desc: '民意调查与投票' },
    { key: 'workorders', label: '工单管理', desc: '维修工单处理跟踪' },
    { key: 'complaints', label: '投诉管理', desc: '投诉建议收集处理' },
    { key: 'life', label: '生活服务', desc: '前台生活服务导航' },
    { key: 'trade', label: '交易管理', desc: '前台房屋租售和物品交易导航' },
    { key: 'funds', label: '阳光资金', desc: '公共收益/维修资金/公共资产的公示与台账', sensitive: true },
    { key: 'audit', label: '审计日志', desc: '操作记录与审计追踪', sensitive: true },
    { key: 'settings', label: '系统设置', desc: '高级系统选项', sensitive: true }
  ];
  var html = '<div style="margin-bottom:12px;"><button class="btn" onclick="navigateTo(\'dashboard\')">⬅️ 返回仪表盘</button><button class="btn" onclick="logout()" style="background:var(--danger);color:#fff;">🚪 退出登录</button></div>';
  html += '<div class="card"><div class="card-header"><h3>🛠️ 开发者工具 - 模块开关</h3></div>';
  modules.forEach(function(m) {
    var enabled = switches[m.key] !== false;
    var bg = enabled ? 'var(--primary)' : '#ccc';
    var transform = enabled ? 'translateX(20px)' : 'translateX(0)';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:#fafafa;border-radius:8px;margin-bottom:10px;">' +
      '<div>' +
        '<div style="font-weight:600;font-size:14px;">' + m.label + (m.sensitive ? ' <span style="background:#ffebee;color:#c62828;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:6px;">敏感</span>' : '') + '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + m.desc + '</div>' +
      '</div>' +
      '<label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">' +
        '<input type="checkbox" id="sw-' + m.key + '" style="opacity:0;width:0;height:0;" ' + (enabled ? 'checked' : '') + ' onchange="toggleModuleSwitch(' + "'" + m.key + "'" + ')">' +
        '<span id="sw-span-' + m.key + '" style="position:absolute;top:0;left:0;right:0;bottom:0;background:' + bg + ';border-radius:24px;transition:.3s;">' +
          '<span style="position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s;transform:' + transform + ';"></span>' +
        '</span>' +
      '</label>' +
    '</div>';
  });
  html += '<div style="margin-top:16px;display:flex;gap:10px;">' +
    '<button class="btn btn-primary" onclick="saveModuleSwitches()">💾 保存配置</button>' +
    '<button class="btn" onclick="resetModuleSwitches()">🔄 恢复默认</button>' +
    '</div>';
  html += '<p style="font-size:12px;color:var(--text-secondary);margin-top:12px;">💡 提示：修改保存后立即生效。敏感模块建议保持开启。</p>';
  html += '</div>';
  html += renderD1Panel();
  return html;
}

/* ===== D1 数据库（一键初始化 / 状态）===== */
function renderD1Panel() {
  var html = '<div class="card" style="margin-top:18px;border:1px solid #e3f2fd;">';
  html += '<div class="card-header"><h3>🗄️ 存储引擎 D1</h3></div>';
  html += '<p style="font-size:13px;color:var(--text-secondary);line-height:1.7;">' +
    '系统已完成 D1（Cloudflare 数据库）改造：结构化数据迁入 D1（大容量、强一致、防并发覆盖），图片等大文件仍在 R2。' +
    '<br>首次启用需要点一次「一键初始化」：自动建表 + 导入历史投票/食堂订单数据。' +
    '</p>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
    '<button class="btn btn-primary" onclick="runD1Setup()">🚀 D1 一键初始化</button>' +
    '<button class="btn" onclick="showD1Status()">📋 查看状态</button>' +
    '</div>';
  html += '<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e0e0e0;">' +
    '<div style="font-size:13px;font-weight:600;margin-bottom:6px;">📦 历史订单归档</div>' +
    '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">把指定日期之前的食堂订单导出到归档文件并从数据库移除（账本流水保留）。订单量大时定期归档可控制库容。</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
      '<input id="d1ArchiveDate" type="date" value="' + new Date().getFullYear() + '-01-01" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;">' +
      '<button class="btn" onclick="runD1Archive()">📦 归档此日期前的订单</button>' +
    '</div>' +
  '</div>';
  html += '<pre id="d1Status" style="display:none;margin-top:12px;background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;max-height:340px;overflow:auto;">点击上方按钮查看…</pre>';
  html += '</div>';
  return html;
}

function showD1Raw(data) {
  var el = document.getElementById('d1Status');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function d1ApiCall(method) {
  var base = getWorkerBase();
  if (base === null) { showD1Raw('本地模式不可用：请部署后使用'); return; }
  var el = document.getElementById('d1Status');
  el.style.display = 'block';
  el.textContent = '请求中…';
  try {
    var res = await fetch(base + '/api/setup', { method: method, headers: getAdminAuthHeaders() });
    var data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showD1Raw({ success: false, status: res.status, error: data.error || '请求失败' });
      return;
    }
    showD1Raw(data);
  } catch (e) {
    showD1Raw({ success: false, error: String(e && e.message || e) });
  }
}

function runD1Setup() {
  if (!confirm('确定执行 D1 一键初始化？\n将建表并导入历史投票/食堂数据（幂等，可重复执行）。')) return;
  d1ApiCall('POST');
}

function showD1Status() {
  d1ApiCall('GET');
}

async function runD1Archive() {
  var el = document.getElementById('d1ArchiveDate');
  var before = el && el.value ? el.value : '';
  if (!before) { alert('请选择归档日期'); return; }
  if (!confirm('确定归档 ' + before + ' 之前的全部食堂订单？\n· 订单将导出到归档文件并从数据库移除\n· 余额流水保留，不影响业主端\n· 操作不可自动撤销')) return;
  var base = getWorkerBase();
  if (base === null) { showD1Raw('本地模式不可用：请部署后使用'); return; }
  var box = document.getElementById('d1Status');
  box.style.display = 'block';
  box.textContent = '归档中…';
  try {
    var res = await fetch(base + '/api/canteen/archive', {
      method: 'POST',
      headers: getAdminAuthHeaders(),
      body: JSON.stringify({ before: before })
    });
    var data = await res.json().catch(() => ({}));
    showD1Raw({ status: res.status, data: data });
    if (data && data.success && data.archived > 0) {
      alert('已归档 ' + data.archived + ' 单（' + (data.years || []).map(function(y) { return y.year + '年' + y.count + '单'; }).join('、') + '）');
    }
  } catch (e) {
    showD1Raw({ success: false, error: String(e && e.message || e) });
  }
}

function toggleModuleSwitch(key) {
  if (!appData.config) appData.config = {};
  if (!appData.config.moduleSwitches) appData.config.moduleSwitches = {};
  var cb = document.getElementById('sw-' + key);
  appData.config.moduleSwitches[key] = cb.checked;
  var span = document.getElementById('sw-span-' + key);
  if (span) {
    span.style.background = cb.checked ? 'var(--primary)' : '#ccc';
    span.querySelector('span').style.transform = cb.checked ? 'translateX(20px)' : 'translateX(0)';
  }
}

async function saveModuleSwitches() {
  showLoading(true);
  try {
    await saveDataFile('config', appData.config, '更新模块开关配置', 'update');
    try {
      localStorage.setItem('adminData', JSON.stringify(appData));
      localStorage.setItem('adminData_config', JSON.stringify({ config: { moduleSwitches: appData.config.moduleSwitches } }));
      localStorage.setItem('config', JSON.stringify({ moduleSwitches: appData.config.moduleSwitches }));
    } catch(e) {}
    showToast('配置已保存并生效', 'success');
    renderSidebar();
  } catch(e) {
    showToast('保存失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function resetModuleSwitches() {
  if (confirm('确定恢复默认配置吗？所有模块将恢复为开启状态。')) {
    if (!appData.config) appData.config = {};
    appData.config.moduleSwitches = {};
    navigateTo('dev-tools');
    showToast('已恢复默认配置，请点击保存', 'info');
  }
}
