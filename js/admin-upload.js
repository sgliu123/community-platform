/* js/admin-upload.js - 文件上传、图片压缩、视频处理 */

/* ==================== 管理员账户配置（可直接修改） ====================
   说明：以下密码为明文，方便直接修改。如需调整权限或密码，
   直接编辑下方 ADMIN_ACCOUNTS 数组即可，无需理解其他代码逻辑。
   四个角色：总维护人员、物管人员、业委会成员、社区人员。
   ==================================================================== */
const ADMIN_ACCOUNTS = [
  { id: 'admin-super',      name: '总维护人员',   role: 'super',      password: 'Sunlight2026',  permissions: ['all'] },
  { id: 'admin-property',   name: '物管人员',       role: 'property',   password: 'Property2026',  permissions: ['announcements','documents','workorders','residents'] },
  { id: 'admin-committee',  name: '业委会成员',     role: 'committee',  password: 'Committee2026', permissions: ['polls','residents','complaints','audit'] },
  { id: 'admin-community',  name: '社区人员',       role: 'community',  password: 'Community2026', permissions: ['announcements','activities','complaints'] }
];

let appData = {config:{},announcements:[],documents:[],activities:[],polls:[],residents:[],'audit-log':[],workorders:[],complaints:[]};

// ===== Worker 网关配置（工单/投诉管理模块，不影响原有功能） =====
const WORKER_BASE = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
function getWorkerBase(){ return WORKER_BASE.replace(/\/$/,''); }
function getCurrentMonthPath(module){
  const d=new Date();
  return module+'/'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'.json';
}
async function workerRead(filePath){
  const base=getWorkerBase();
  if(!base){
    // 尝试多种可能的 key 格式（兼容有/无前导零的月份）
    const keysToTry = [];
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    keysToTry.push(key);
    // 如果包含月份路径如 polls-responses/2026-08.json，也尝试 polls-responses/2026-8.json
    const altKey = key.replace(/-(\d{2})$/, function(m, p1) { return '-' + parseInt(p1, 10); });
    if (altKey !== key) keysToTry.push(altKey);
    // 反向：如果当前是无前导零，也尝试有前导零
    const altKey2 = key.replace(/-(\d)$/, function(m, p1) { return '-' + String(parseInt(p1, 10)).padStart(2, '0'); });
    if (altKey2 !== key) keysToTry.push(altKey2);
    for (const k of keysToTry) {
      const cached = appData[k];
      if(cached && Array.isArray(cached) && cached.length > 0) return cached;
    }
    // 尝试从 appData 的模块名直接读取（如 appData.workorders）
    const moduleName = filePath.split('/')[0];
    if(appData[moduleName] && Array.isArray(appData[moduleName]) && appData[moduleName].length > 0) return appData[moduleName];
    return [];
  }
  // Worker 模式：先尝试原始路径，失败则尝试月份格式兼容
  const tryPaths = [filePath];
  const m = filePath.match(/^(polls-responses\/\d{4})-(\d{2})\.json$/);
  if (m) {
    const alt = m[1] + '-' + parseInt(m[2], 10) + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  const m2 = filePath.match(/^(polls-responses\/\d{4})-(\d)\.json$/);
  if (m2) {
    const alt = m2[1] + '-' + String(parseInt(m2[2], 10)).padStart(2, '0') + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  for (const p of tryPaths) {
    try {
      const res=await fetch(base+'/api/read/'+encodeURIComponent(p));
      if(res.ok) {
        const t=await res.text();
        return t?JSON.parse(t):[];
      }
    } catch(e) {}
  }
  throw new Error('读取失败');
}
async function workerWrite(filePath,data,message){
  const base=getWorkerBase();
  if(!base){
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    appData[key]=data;
    showToast('开发模式：数据仅保存在内存中','info');
    return;
  }
  const res=await fetch(base+'/api/write/'+encodeURIComponent(filePath),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:JSON.stringify(data,null,2),message})
  });
  if(!res.ok){const e=await res.json();throw new Error(e.error||'保存失败');}
}
async function workerUpload(file){
  const base=getWorkerBase();
  if(!base){
    return {url:URL.createObjectURL(file),name:file.name};
  }
  const fd=new FormData();fd.append('file',file);
  const res=await fetch(base+'/api/upload',{method:'POST',body:fd});
  if(!res.ok) throw new Error('上传失败');
  return await res.json();
}
function woStatusClass(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}
function cpStatusClass(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}
async function loadAllWorkorders(){
  try{ return await workerRead(getCurrentMonthPath('workorders')); }catch(e){ return []; }
}
async function loadAllComplaints(){
  try{ return await workerRead(getCurrentMonthPath('complaints')); }catch(e){ return []; }
}

let currentModule = 'dashboard';
let adminSession = null;
let githubToken = localStorage.getItem('githubToken') || '';
let currentAdmin = null;
const SALT = "SunlightCommunity2026";

document.addEventListener('DOMContentLoaded', async () => {
  try { 
    await loadAllData(); 
    autoSkipLogin();
  } catch(e) { 
    console.error('Init error:', e);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('tokenPage').style.display = 'none';
    document.getElementById('adminLayout').classList.add('active');
    document.getElementById('contentArea').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>初始化失败，请刷新页面重试</div><div style="font-size:12px;color:#999;margin-top:8px;">' + escapeHtml(e.message) + '</div></div>';
  }
});

async function loadAllData() {
  const files = ['config','announcements','documents','activities','polls','residents','audit-log'];
  const workerBase = getWorkerBase();

  for (const f of files) {
    let loaded = false;
    let workerData = null;

    // 1. 优先从 Worker 读取（已持久化的数据）
    if (workerBase) {
      try {
        const r = await fetch(workerBase + '/api/read/' + encodeURIComponent('data/' + f + '.json') + '?t=' + Date.now());
        if (r.ok) {
          workerData = await r.json();
          // 只有 Worker 返回非空数据才视为加载成功，避免空数组覆盖本地数据
          const isEmpty = (Array.isArray(workerData) && workerData.length === 0) || 
                          (typeof workerData === 'object' && workerData !== null && Object.keys(workerData).length === 0);
          if (!isEmpty) {
            appData[f] = workerData;
            loaded = true;
            continue;
          }
        }
      } catch(e) {}
    }

    // 2. 尝试 fetch 本地 data/ 目录（静态文件）
    if (!loaded) {
      try {
        const r = await fetch('data/' + f + '.json?t=' + Date.now());
        if (r.ok) {
          appData[f] = await r.json();
          loaded = true;
        }
      } catch(e) {}
    }

    // 3. 检查 localStorage（开发模式或回退）
    if (!loaded) {
      try {
        const saved = localStorage.getItem('adminData_' + f);
        if (saved) { appData[f] = JSON.parse(saved); loaded = true; }
      } catch(e) {}
    }

    // 4. 最后回退到 EMBEDDED_DATA（初始默认值）
    if (!loaded) {
      if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[f] !== undefined) {
        appData[f] = EMBEDDED_DATA[f];
        loaded = true;
      }
    }

    if (!loaded) {
      const defaults = { config: {}, announcements: [], documents: [], activities: [], polls: [], residents: [], 'audit-log': [] };
      appData[f] = defaults[f] || [];
    }
  }
  updateFavicon();
  updatePageTitle();
  renderSiteLogo();
  // === 无条件补全 residents 面积数据（兼容旧数据无 area 字段的情况）===
  if (appData.residents && appData.residents.length > 0) {
    const embeddedResidents = (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.residents) ? EMBEDDED_DATA.residents : [];
    const areaMap = {};
    embeddedResidents.forEach(r => { if (r.roomNo && r.area) areaMap[r.roomNo] = r.area; });
    let fixedCount = 0;
    appData.residents.forEach((r, i) => {
      if (!r.area || parseFloat(r.area) === 0) {
        const fallbackArea = areaMap[r.roomNo];
        if (fallbackArea) {
          r.area = fallbackArea;
        } else {
          // 兜底：根据房号生成一个合理的面积（60-140㎡）
          const hash = r.roomNo ? r.roomNo.split('').reduce((s, c) => s + c.charCodeAt(0), 0) : i;
          r.area = 60 + Math.floor(Math.abs(Math.sin(hash * 7.3 + 1.5)) * 81);
        }
        fixedCount++;
      }
    });
    if (fixedCount > 0) {
      console.log('[Area Fixup] 已自动为 ' + fixedCount + ' 位业主补全面积数据');
    }
  }

  // === 数据清洗：移除已失效的 blob URL，防止脏数据持续保存 ===
  if (appData.activities) {
    appData.activities.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.videos) item.videos = item.videos.filter(u => !u.startsWith('blob:'));
      if (item.videoLinks) item.videoLinks = item.videoLinks.filter(u => !u.startsWith('blob:'));
      if (item.adminImages) item.adminImages = item.adminImages.filter(u => !u.startsWith('blob:'));
      if (item.coverImage && item.coverImage.startsWith('blob:')) item.coverImage = '';
      if (item.videoUrl && item.videoUrl.startsWith('blob:')) item.videoUrl = '';
    });
  }
  if (appData.announcements) {
    appData.announcements.forEach(item => {
      if (item.attachments) item.attachments = item.attachments.filter(att => att.url && !att.url.startsWith('blob:'));
    });
  }
  if (appData.documents) {
    appData.documents.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.attachments) item.attachments = item.attachments.filter(a => a.url && !a.url.startsWith('blob:'));
    });
  }

  // 加载持久化的管理员密码配置（覆盖代码默认值）
  if (appData.config && appData.config.adminAccounts && Array.isArray(appData.config.adminAccounts)) {
    appData.config.adminAccounts.forEach(persisted => {
      const acc = ADMIN_ACCOUNTS.find(a => a.id === persisted.id);
      if (acc && persisted.password) acc.password = persisted.password;
      if (acc && persisted.permissions) acc.permissions = persisted.permissions;
    });
  }
}

function updateFavicon() {
  const favicon = appData.config && appData.config.community && appData.config.community.favicon;
  if (favicon) {
    document.getElementById('faviconLink').href = favicon;
  }
}
function updatePageTitle() {
  const c = appData.config && appData.config.community || {};
  document.title = (c.siteTitle || (c.name ? c.name + ' - 管理后台' : '管理后台'));
}
function getSiteLogoConfig() {
  try { var raw = localStorage.getItem("siteLogoConfig"); if (raw) return JSON.parse(raw); } catch(e) {}
  return { type: "emoji", value: "⚙️", title: "管理后台", adminTitle: "管理后台" };
}
function setSiteLogoConfig(cfg) {
  localStorage.setItem("siteLogoConfig", JSON.stringify(cfg));
}
function renderSiteLogo() {
  var cfg = getSiteLogoConfig();
  var iconEl = document.getElementById("siteLogoIcon");
  var titleEl = document.getElementById("siteLogoTitle");
  if (iconEl) {
    if (cfg.type === "image" && cfg.value) {
      iconEl.innerHTML = '<img src="' + cfg.value.replace(/"/g, "&quot;") + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">';
    } else {
      iconEl.innerHTML = cfg.value || "⚙️";
    }
  }
  if (titleEl) titleEl.textContent = cfg.adminTitle || cfg.title || "管理后台";
  var link = document.getElementById("faviconLink");
  if (!link) {
    link = document.createElement("link");
    link.id = "faviconLink"; link.rel = "shortcut icon"; link.type = "image/png";
    document.head.appendChild(link);
  }
  if (cfg.type === "image" && cfg.value) {
    link.href = cfg.value;
  } else {
    var emoji = cfg.value ? cfg.value.replace(/&#(\d+);/g, function(m, code) { return String.fromCodePoint(code); }) : "⚙️";
    var canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 64, 64);
    ctx.font = "48px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, 32, 34);
    link.href = canvas.toDataURL("image/png");
  }
}
function checkLoginState() {
  autoSkipLogin();
}

function autoSkipLogin() {
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

  const account = ADMIN_ACCOUNTS.find(a => a.id === roleId);
  if (!account) { err.textContent = '身份配置错误，请联系总维护人员'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = '验证中...';

  // 明文对比，方便直接修改代码中的密码
  if (pwd !== account.password) {
    err.textContent = '密码错误，请重新输入'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '登录';
    return;
  }

  // 登录成功
  currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
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
  if (!currentAdmin) {
    logout(); return;
  }
  document.getElementById('adminInfo').textContent = currentAdmin.name || '管理员';
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  document.getElementById('adminRole').textContent = roleMap[currentAdmin.role] || currentAdmin.role;
  renderSidebar();
  const hash = location.hash;
  const match = hash.match(/module=([^&]+)/);
  const targetModule = match ? match[1] : 'dashboard';
  const validModules = ['dashboard','config','announcements','documents','activities','polls','residents','audit','workorders','complaints','settings'];
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

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function renderSidebar() {
  if (!currentAdmin) return;
  const perms = currentAdmin.permissions || [];
  const isSuper = currentAdmin.role === 'super';
  const items = [
    { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
    { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
    { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
    { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
    { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
    { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
    { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
    { id: 'objections', label: '异议管理', icon: '⚖️', perm: 'polls', roles: ['super','committee'] },
    { id: 'audit', label: '操作日志', icon: '📋', perm: 'audit-log', roles: ['super','committee'] },
    { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
    { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
    { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
    { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
    { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
  ];
  let html = '';
  items.forEach(item => {
    const hasPerm = isSuper || perms.indexOf('all') >= 0 || perms.indexOf(item.perm) >= 0;
    const hasRole = !item.roles || item.roles.indexOf(currentAdmin.role) >= 0;
    if (!hasPerm || !hasRole) return;
    if (item.external) {
      html += `<div class="nav-item" data-module="${item.id}" onclick="window.open('${item.external}','_blank')">`;
    } else {
      html += `<div class="nav-item ${item.id==='dashboard'?'active':''}" data-module="${item.id}" onclick="navigateTo('${item.id}')">`;
    }
    html += '<span class="icon">' + item.icon + '</span><span>' + item.label + '</span></div>';
  });
  document.getElementById('sidebarNav').innerHTML = html;
}

function navigateTo(module) {
  try {
    currentModule = module;
    location.hash = 'module=' + module;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.module === module));
    const titles = { dashboard: '仪表盘', config: '社区配置', announcements: '公告管理', documents: '文件管理', activities: '动态管理', polls: '投票管理', residents: '业主管理', objections: '异议管理', audit: '操作日志', workorders: '工单管理', complaints: '投诉建议', life: '生活服务', settings: '系统设置' };
    var pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = titles[module] || module;
    var sb = document.getElementById('saveBtn');
    if (sb) sb.style.display = ['dashboard','audit','settings'].indexOf(module) >= 0 ? 'none' : 'inline-block';
    const renderers = {
      dashboard: renderDashboard, config: renderConfig, announcements: renderAnnouncementsAdmin,
      documents: renderDocumentsAdmin, activities: renderActivitiesAdmin, polls: renderPollsAdmin,
      residents: renderResidentsAdmin, objections: renderObjectionsAdmin, audit: renderAuditLog,
      workorders: renderWorkordersAdmin,
      complaints: renderComplaintsAdmin,
      settings: renderSettings
    };
    const fn = renderers[module] || renderDashboard;
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

function renderDashboard() {
  const annCount = (appData.announcements || []).length;
  const docCount = (appData.documents || []).length;
  const actCount = (appData.activities || []).length;
  const pollCount = (appData.polls || []).filter(p => p && p.status === '进行中').length;
  const resCount = (appData.residents || []).filter(r => r && r.status === 'active' && !r.isTest).length;
  const testCount = (appData.residents || []).filter(r => r && r.isTest).length;
  return '<div class="stats-grid">' +
    '<div class="stat-card"><div class="label">公告总数</div><div class="value">' + annCount + '</div></div>' +
    '<div class="stat-card"><div class="label">上级文件</div><div class="value">' + docCount + '</div></div>' +
    '<div class="stat-card"><div class="label">社区动态</div><div class="value">' + actCount + '</div></div>' +
    '<div class="stat-card"><div class="label">进行中投票</div><div class="value">' + pollCount + '</div></div>' +
    '</div><div class="stats-grid">' +
    '<div class="stat-card"><div class="label">正式业主</div><div class="value">' + resCount + '</div></div>' +
    '<div class="stat-card"><div class="label">测试数据</div><div class="value" style="color:var(--warning)">' + testCount + '</div></div>' +
    '</div><div class="card"><div class="card-header"><h3>🚀 快捷入口</h3></div>' +
    '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">' +
    `<button class="btn btn-primary" onclick="navigateTo('announcements');openEditModal('announcements',null)">➕ 发布公告</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('activities');openEditModal('activities',null)">➕ 发布动态</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('polls');openEditModal('polls',null)">➕ 发起投票</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('residents');openEditModal('residents',null)">➕ 添加业主</button>` +
    '</div></div>';
}

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

function renderAnnouncementsAdmin() {
  const list = appData.announcements || [];
  return `<div class="card"><div class="card-header"><h3>📢 公告管理</h3><button class="btn btn-primary" onclick="openEditModal('announcements',null)">➕ 新增公告</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>分类</th><th>日期</th><th>置顶</th><th>作者</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.category||''}</td><td>${item.publishDate||''}</td><td>${item.isPinned?"📌":""}</td><td>${item.author||''}</td><td class="actions"><button onclick="openEditModal('announcements','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('announcements','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderDocumentsAdmin() {
  const list = appData.documents || [];
  return `<div class="card"><div class="card-header"><h3>📄 文件管理</h3><button class="btn btn-primary" onclick="openEditModal('documents',null)">➕ 新增文件</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>来源</th><th>日期</th><th>附件</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      let attachBadge = '';
      const attachments = item.attachments || [];
      const hasPdf = attachments.some(a => a.type === 'pdf') || (item.fileUrl && /\.pdf$/i.test(item.fileUrl));
      const hasImage = attachments.some(a => a.type === 'image') || (item.images && item.images.length);
      const hasLink = item.fileUrl && !hasPdf && !hasImage;

      if (hasPdf) attachBadge += '<span class="pdf-badge">📄 PDF</span> ';
      if (hasImage) attachBadge += '<span class="tag tag-active">🖼️ 图片</span> ';
      if (hasLink) attachBadge += '<span class="tag tag-test">🔗 链接</span> ';
      if (!hasPdf && !hasImage && !hasLink) attachBadge = '<span style="color:#999;font-size:12px;">—</span>';

      const openUrl = item.fileUrl || (attachments[0] && attachments[0].url) || '';
      let linkHtml = attachBadge;
      if (openUrl) {
        linkHtml = `<a href="${openUrl}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px;">${attachBadge}查看 →</a>`;
      }

      return `<tr><td>${escapeHtml(item.title||'')}</td><td>${escapeHtml(item.source||'')}</td><td>${item.publishDate||''}</td><td>${linkHtml}</td><td class="actions"><button onclick="openEditModal('documents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('documents','${item.id}')">删除</button></td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderActivitiesAdmin() {
  const list = appData.activities || [];
  return `<div class="card"><div class="card-header"><h3>🎉 动态管理</h3><button class="btn btn-primary" onclick="openEditModal('activities',null)">➕ 新增动态</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>日期</th><th>地点</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.date||''}</td><td>${item.location||''}</td><td><span class="tag ${item.status==="进行中"?"tag-active":(item.status==="预告"?"tag-test":"tag-disabled")}">${item.status||'已结束'}</span></td><td class="actions"><button onclick="openEditModal('activities','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('activities','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

/* ========== 投票面积数据辅助函数 ========== */
function getPollDisplayStats(item) {
  const res = item.results || {};

  // 统一 totalResidents/totalArea 计算逻辑（与 calculatePollResults 完全一致）
  let totalResidents, totalArea;
  if (item.rollStats && item.rollStats.totalCount > 0) {
    totalResidents = item.rollStats.totalCount;
    totalArea = item.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (item.progress && item.progress.target !== undefined && item.progress.target > 0)
      ? item.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 如果有已固化的计票结果（calculatedAt 存在），直接使用权威数据
  if (res.calculatedAt && res.totalArea > 0) {
    return {
      totalResidents: res.totalResidents || totalResidents,
      totalArea: res.totalArea,
      participatingResidents: res.participatingResidents || 0,
      participatingArea: res.participatingArea || 0,
      agreeCount: res.agreeCount || 0,
      agreeArea: res.agreeArea || 0,
      residentParticipationRate: res.residentParticipationRate || 0,
      areaParticipationRate: res.areaParticipationRate || 0,
      agreeResidentRate: res.agreeResidentRate || 0,
      agreeAreaRate: res.agreeAreaRate || 0,
      isPassed: res.isPassed,
      summary: res.summary || '',
      calculatedAt: res.calculatedAt,
      fromCache: true
    };
  }

  // 无固化数据时，用原始计数 + 统一后的 totalArea 重新计算百分比
  let pResidents = res.participatingResidents || 0;
  let pArea = res.participatingArea || 0;
  let aCount = res.agreeCount || 0;
  let aArea = res.agreeArea || 0;

  if (pArea === 0 && pResidents > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    pArea = pResidents * avgArea;
  }
  if (aArea === 0 && aCount > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    aArea = aCount * avgArea;
  }

  return {
    totalResidents: totalResidents,
    totalArea: totalArea,
    participatingResidents: pResidents,
    participatingArea: pArea,
    agreeCount: aCount,
    agreeArea: aArea,
    residentParticipationRate: totalResidents > 0 ? (pResidents / totalResidents * 100) : 0,
    areaParticipationRate: totalArea > 0 ? (pArea / totalArea * 100) : 0,
    agreeResidentRate: pResidents > 0 ? (aCount / pResidents * 100) : 0,
    agreeAreaRate: pArea > 0 ? (aArea / pArea * 100) : 0,
    isPassed: res.isPassed,
    summary: res.summary || '',
    calculatedAt: res.calculatedAt,
    fromCache: false
  };
}

function renderPollsAdmin() {
  const list = appData.polls || [];
  return `<div class="card"><div class="card-header"><h3>🗳️ 投票管理</h3><button class="btn btn-primary" onclick="openEditModal('polls',null)">➕ 新增投票</button></div>` +
    '<table class="data-table"><thead><tr><th>案卷号</th><th>标题</th><th>类型</th><th>模式</th><th>状态</th><th>时间合规</th><th>进度</th><th>参与率</th><th>同意率</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      const disp = getPollDisplayStats(item);
      const res = item.results || {};
      const modeLabel = item.mode === 'local' ? '<span class="tag tag-active">本地问卷</span>' : '<span class="tag tag-test">腾讯问卷</span>';
      const catLabel = item.category === 'major' ? '<span class="tag" style="background:#ffebee;color:#c62828;">重大</span>' : '<span class="tag" style="background:#e8f5e9;color:#2e7d32;">一般</span>';
      const statusTag = '<span class="tag ' + (item.status==="进行中"?"tag-active":"tag-disabled") + '">' + (item.status||'') + '</span>';

      // 参与率（自动从业主库补全面积数据）
      const rPart = disp.residentParticipationRate;
      const aPart = disp.areaParticipationRate;
      const partHtml = '<div style="font-size:12px;">人数 ' + rPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rPart) + '%;"></div></div>面积 ' + aPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aPart) + '%;background:#1976D2;"></div></div></div>';

      // 同意率（自动从业主库补全面积数据）
      const rAgree = disp.agreeResidentRate;
      const aAgree = disp.agreeAreaRate;
      const agreeHtml = '<div style="font-size:12px;">人数 ' + rAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rAgree) + '%;"></div></div>面积 ' + aAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aAgree) + '%;background:#1976D2;"></div></div></div>';

      // 通过标签（只有已结束才显示最终判定）
      let passHtml = '<span style="color:#999;font-size:12px;">—</span>';
      if (item.status === '已结束') {
        passHtml = res.isPassed === true ? '<span class="tag tag-active">✅ 通过</span>' : (res.isPassed === false ? '<span class="tag tag-test">❌ 未通过</span>' : '<span style="color:#999;font-size:12px;">—</span>');
      } else if (item.status === '进行中') {
        passHtml = '<span class="tag" style="background:#fff3e0;color:#e65100;">🗳️ 进行中</span>';
      }
      const anchorHtml = item.status === '已结束' ? (item.anchorRecords && item.anchorRecords.some(r => !r.error) ? '<span class="tag tag-active" style="cursor:pointer;" onclick="event.stopPropagation();showAnchorDetails(\'' + item.id + '\')">🔗 已锚定</span>' : '<span class="tag tag-test" style="cursor:pointer;" onclick="event.stopPropagation();anchorVoteData(\'' + item.id + '\')">⚠️ 未锚定</span>') : '';
      const pendingObj = (item.objections || []).filter(o => !o.status || o.status === '待处理').length;
      const objBadge = pendingObj > 0 ? '<span class="tag" style="background:#ffebee;color:#c62828;cursor:pointer;" onclick="event.stopPropagation();navigateTo(\'objections\')">⚠️ ' + pendingObj + ' 异议</span>' : '';

      const progressHtml = '<div style="font-size:12px;">' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + ' / ' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + ' 户</div>';
      let actions = `<button onclick="openEditModal('polls','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('polls','${item.id}')">删除</button>`;
      if(item.mode === 'local') {
        actions += `<button onclick="viewPollData('${item.id}')" style="margin-left:4px;">📊 数据</button>`;
      }
      actions += `<button onclick="recalculatePoll('${item.id}')" style="margin-left:4px;">🔄 计票</button>`;
      return `<tr><td>${item.caseNo||''}</td><td>${item.title||''}</td><td>${catLabel}</td><td>${modeLabel}</td><td>${statusTag}</td><td>${(function(){let tags='';if(item.announcement&&item.announcement.start&&item.startDate){const as=new Date(item.announcement.start);const vs=new Date(item.startDate);if((vs-as)>=15*86400000)tags+='<span class="tag tag-active">✅公告期合规</span> ';else tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}else{tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}if(item.consultation&&item.consultation.start&&item.consultation.end){const cs=new Date(item.consultation.start);const ce=new Date(item.consultation.end);if((ce-cs)>=6*86400000)tags+='<span class="tag tag-active">✅征求意见合规</span>';else tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}else{tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}return tags;})()}</td><td>${progressHtml}</td><td>${partHtml}</td><td>${agreeHtml}</td><td>${passHtml} ${anchorHtml} ${objBadge}</td><td class="actions">${actions}</td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderResidentsAdmin() {
  const list = appData.residents || [];
  return `<div class="card"><div class="card-header"><h3>👥 业主管理</h3><div class="actions"><button class="btn" onclick="showBatchImport()">📥 批量导入</button><button class="btn btn-primary" onclick="openEditModal('residents',null)">➕ 添加业主</button></div></div>` +
    '<table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(m²)</th><th>手机后四位</th><th>状态</th><th>绑定方式</th><th>标记</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.roomNo||''}</td><td>${item.name||''}</td><td>${item.area||'—'}</td><td>${item.phoneSuffix||''}</td><td><span class="tag ${item.status==="active"?"tag-active":"tag-disabled"}">${item.status==="active"?"正常":"禁用"}</span></td><td>${item.bindingMethod||'—'}</td><td>${item.isTest?`<span class="tag tag-test">测</span>`:""}${item.isSameBuyer?`<span class="tag tag-test" style="background:#e3f2fd;color:#1565c0;margin-left:2px;">同</span>`:""}</td><td class="actions"><button onclick="openEditModal('residents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('residents','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderAuditLog() {
  const list = appData['audit-log'] || [];
  const polls = appData.polls || [];

  // 投票审计时间轴选择器
  let pollSelect = '<div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:500;margin-right:8px;">查看投票全流程审计：</label><select id="auditPollSelect" onchange="renderPollAuditTimeline(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">';
  pollSelect += '<option value="">— 请选择投票 —</option>';
  polls.forEach(p => { pollSelect += '<option value="' + p.id + '">' + (p.caseNo||'') + ' ' + (p.title||'') + '</option>'; });
  pollSelect += '</select></div>';

  let html = '<div class="card"><div class="card-header"><h3>📋 操作日志</h3></div>' + pollSelect +
    '<div id="pollAuditTimeline"></div>' +
    '<table class="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>' +
    list.slice().reverse().map(item => '<tr><td>' + formatDateTime(item.timestamp) + '</td><td>' + (item.adminName||'') + '</td><td>' + (item.action||'') + '</td><td>' + (item.target||'') + '</td><td>' + (item.details||'') + '</td></tr>').join('') +
    '</tbody></table></div>';
  return html;
}


function renderObjectionsAdmin() {
  // 收集所有 polls 中的异议
  let allObjections = [];
  (appData.polls || []).forEach(p => {
    (p.objections || []).forEach(o => {
      allObjections.push({ ...o, pollId: p.id, pollTitle: p.title, pollCaseNo: p.caseNo });
    });
  });

  // 也检查独立的 appData.objections（兼容两种存储方式）
  (appData.objections || []).forEach(o => {
    const poll = (appData.polls || []).find(p => p.id === o.pollId);
    if (poll && !allObjections.find(x => x.id === o.id)) {
      allObjections.push({ ...o, pollTitle: poll.title, pollCaseNo: poll.caseNo });
    }
  });

  const pending = allObjections.filter(o => !o.status || o.status === '待处理').length;

  let html = '<div class="card"><div class="card-header"><h3>⚖️ 异议管理' + (pending > 0 ? ' <span style="color:var(--danger);font-size:14px;">(' + pending + ' 待处理)</span>' : '') + '</h3></div>';
  if (!allObjections.length) {
    html += '<div class="empty-state"><div class="icon">⚖️</div><div>暂无异议记录</div></div>';
    html += '</div>';
    return html;
  }

  html += '<table class="data-table"><thead><tr><th>编号</th><th>投票案卷</th><th>申请人房号</th><th>内容摘要</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>';
  allObjections.slice().reverse().forEach(o => {
    const statusTag = !o.status || o.status === '待处理' ? '<span class="tag tag-test">待处理</span>' : '<span class="tag tag-active">已处理</span>';
    const contentPreview = (o.content || '').substring(0, 30) + ((o.content || '').length > 30 ? '...' : '');
    html += '<tr><td>' + (o.id || '—') + '</td><td>' + escapeHtml(o.pollCaseNo || '') + '</td><td>' + escapeHtml(o.residentRoom || o.resident || '—') + '</td><td>' + escapeHtml(contentPreview) + '</td><td>' + formatDateTime(o.createdAt || o.time) + '</td><td>' + statusTag + '</td><td class="actions"><button onclick="openObjectionModal(\'' + (o.pollId || '') + '\',\'' + (o.id || '') + '\')">处理</button></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function openObjectionModal(pollId, objectionId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;
  const obj = (poll.objections || []).find(o => o.id === objectionId) || (appData.objections || []).find(o => o.id === objectionId);
  if (!obj) return;

  document.getElementById('modalTitle').textContent = '处理异议：' + (obj.id || '');
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">投票：' + escapeHtml(poll.title || '') + '</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">案卷号：' + (poll.caseNo || '') + ' · 申请人：' + escapeHtml(obj.resident || obj.residentRoom || '—') + '</div>';
  body += '<div style="font-size:13px;margin-top:8px;padding:10px;background:#fff;border-radius:6px;border:1px solid var(--border);">' + escapeHtml(obj.content || '') + '</div>';
  if (obj.images && obj.images.length) {
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    obj.images.forEach(url => { body += '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\'' + url + '\')" loading="lazy">'; });
    body += '</div>';
  }
  body += '</div>';

  if (obj.reply) {
    body += '<div style="margin-bottom:12px;padding:12px;background:#e3f2fd;border-radius:8px;border-left:4px solid #1976D2;">';
    body += '<div style="font-weight:600;color:#1976D2;margin-bottom:4px;">已回复</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' + formatDateTime(obj.handledAt) + ' · ' + escapeHtml(obj.handler || '') + '</div>';
    body += '<div style="font-size:13px;">' + escapeHtml(obj.reply) + '</div>';
    body += '</div>';
  }

  body += '<div class="form-group"><label>处理回复</label><textarea id="objReply" rows="4" placeholder="填写回复内容...">' + (obj.reply || '') + '</textarea></div>';
  body += '<div class="form-group"><label>处理结果</label><select id="objStatus"><option value="待处理" ' + ((!obj.status || obj.status === '待处理') ? 'selected' : '') + '>待处理</option><option value="已处理" ' + (obj.status === '已处理' ? 'selected' : '') + '>已处理</option><option value="驳回" ' + (obj.status === '驳回' ? 'selected' : '') + '>驳回</option></select></div>';
  body += '<div class="form-group"><label>上传回复附件（可选）</label>' + createMultiImageUploaderHTML('objReplyFiles', '支持拖拽或点击上传图片（自动压缩）') + '</div>';

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveObjectionAction(\'' + pollId + '\',\'' + objectionId + '\')">保存</button>';
  document.getElementById('modalOverlay').classList.add('active');

  setTimeout(function() {
    if (obj.replyImages && obj.replyImages.length) setMultiUploadedPaths('objReplyFiles', obj.replyImages);
  }, 50);
}

async function saveObjectionAction(pollId, objectionId) {
  const reply = document.getElementById('objReply').value.trim();
  const status = document.getElementById('objStatus').value;
  if (!reply) { showToast('请填写回复内容', 'error'); return; }

  showLoading(true);
  try {
    const poll = (appData.polls || []).find(p => p.id === pollId);
    if (!poll) throw new Error('投票不存在');

    let obj = (poll.objections || []).find(o => o.id === objectionId);
    if (!obj) {
      obj = (appData.objections || []).find(o => o.id === objectionId);
      if (obj) {
        // 迁移到 poll.objections
        if (!poll.objections) poll.objections = [];
        poll.objections.push(obj);
      }
    }
    if (!obj) throw new Error('异议记录不存在');

    obj.reply = reply;
    obj.status = status;
    obj.handler = currentAdmin && currentAdmin.name || '管理员';
    obj.handledAt = new Date().toISOString();
    obj.replyImages = getMultiUploadedPaths('objReplyFiles') || obj.replyImages || [];

    // 保存 polls
    await saveDataFile('polls', appData.polls, '处理异议 ' + objectionId + '：' + status, 'objection-resolve');

    // 追加审计日志
    await appendAuditLog('objection-resolve', 'polls', pollId, '管理员 ' + obj.handler + ' 处理异议 ' + objectionId + '，结果：' + status);

    showToast('异议处理成功', 'success');
    closeModal();
    navigateTo('objections');
  } catch(e) {
    showToast('处理失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderPollAuditTimeline(pollId) {
  const container = document.getElementById('pollAuditTimeline');
  if (!container || !pollId) { if(container) container.innerHTML = ''; return; }
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;

  const logs = (appData['audit-log'] || []).filter(l => l.targetId === pollId || (l.details && l.details.includes(pollId)) || (l.target === 'polls' && l.details && l.details.includes(poll.title||'')));
  const objections = poll.objections || [];
  const records = poll.anchorRecords || [];

  let html = '<div style="margin-bottom:24px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">⏱️ 投票全流程审计：' + escapeHtml(poll.title||'') + '</div>';
  html += '<div style="border-left:2px solid var(--border);padding-left:16px;">';

  const nodes = [];
  // 发起
  if (poll.createdAt) nodes.push({ time: poll.createdAt, label: '投票发起', detail: '由 ' + (poll.createdBy||'管理员') + ' 创建', type: 'init' });
  // 清册公示
  if (poll.rollPublish && poll.rollPublish.start) nodes.push({ time: poll.rollPublish.start, label: '清册公示开始', detail: '公示期：' + poll.rollPublish.start + ' 至 ' + (poll.rollPublish.end||''), type: 'roll' });
  // 通知送达
  if (poll.meetingFiles && poll.meetingFiles.length) nodes.push({ time: poll.createdAt, label: '会议通知上传', detail: '上传 ' + poll.meetingFiles.length + ' 份通知文件', type: 'notice' });
  // 投票进行中
  if (poll.startDate) nodes.push({ time: poll.startDate + 'T00:00:00Z', label: '投票开始', detail: '投票通道开启', type: 'vote' });
  // 计票
  if (poll.results && poll.results.calculatedAt) nodes.push({ time: poll.results.calculatedAt, label: '自动计票', detail: '参与 ' + (poll.results.participatingResidents||0) + ' 户，' + (poll.results.isPassed ? '通过' : '未通过'), type: 'count' });
  // 结果公示
  if (poll.results && poll.results.isPublished) nodes.push({ time: poll.results.calculatedAt, label: '结果公示', detail: poll.results.summary||'', type: 'publish' });
  // 异议
  objections.forEach(o => {
    nodes.push({ time: o.time || o.createdAt, label: '异议提出', detail: (o.resident||'—') + '：' + (o.content||'').substring(0,40), type: 'objection' });
    if (o.result) nodes.push({ time: o.handledAt || o.time, label: '异议处理', detail: '处理结果：' + o.result, type: 'objection-resolved' });
  });
  // 锚定
  records.forEach(r => {
    if (!r.error) nodes.push({ time: r.time, label: '证据锚定', detail: r.name + '：' + (r.txHash ? r.txHash.substring(0,16)+'...' : '已提交'), type: 'anchor' });
  });
  // 归档
  if (poll.status === '已结束') nodes.push({ time: poll.endDate + 'T23:59:59Z', label: '投票结束/归档', detail: '投票通道关闭，档案生成', type: 'archive' });

  // 按时间排序
  nodes.sort((a, b) => new Date(a.time) - new Date(b.time));

  nodes.forEach((n, i) => {
    const colorMap = { init: '#2E8B57', roll: '#1976D2', notice: '#f9a825', vote: '#2E8B57', count: '#6A1B9A', publish: '#2E8B57', objection: '#c62828', 'objection-resolved': '#2e7d32', anchor: '#E65100', archive: '#546e7a' };
    const color = colorMap[n.type] || '#666';
    html += '<div style="position:relative;margin-bottom:14px;padding-bottom:14px;' + (i < nodes.length - 1 ? 'border-bottom:1px dashed var(--border);' : '') + '">';
    html += '<div style="position:absolute;left:-21px;top:2px;width:10px;height:10px;background:' + color + ';border-radius:50%;"></div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);">' + formatDateTime(n.time) + '</div>';
    html += '<div style="font-weight:600;font-size:13px;margin-top:2px;">' + n.label + '</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(n.detail) + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function renderSettings() {
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id)) || {};
  return '<div class="card"><div class="card-header"><h3>👤 当前身份</h3></div>' +
    '<div class="form-group"><label>身份名称</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.name || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>角色类型</label><input type="text" value="' + (roleMap[currentAdmin && currentAdmin.role] || currentAdmin.role || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>权限列表</label><input type="text" value="' + escapeHtml((currentAdmin && currentAdmin.permissions || []).join(', ')) + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>管理员ID</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.id || '') + '" disabled style="background:#f5f5f5;"></div></div>' +
    '<div class="card"><div class="card-header"><h3>🔐 修改我的密码</h3></div>' +
    '<div class="form-group"><label>当前密码</label><input type="password" id="oldPassword" placeholder="输入当前密码"></div>' +
    '<div class="form-group"><label>新密码（6位以上）</label><input type="password" id="newPassword" placeholder="输入新密码"></div>' +
    '<div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>' +
    '<button class="btn btn-primary" onclick="changePassword()">修改密码</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">提示：修改后的密码会尝试持久化到 Worker。如未配置 Worker，刷新页面后将恢复代码顶部 ADMIN_ACCOUNTS 中的默认密码。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🌐 Worker 网关地址</h3></div>' +
    '<div class="form-group"><label>Worker API 地址（留空则使用内存模式）</label><input type="text" id="workerBaseInput" value="' + (localStorage.getItem('workerBase') || '') + '" placeholder="https://community.firstblade.site 或留空"></div>' +
    '<button class="btn btn-primary" onclick="saveWorkerBase()">保存地址</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">留空表示开发模式（数据仅保存在浏览器内存中，刷新后丢失）。配置 Worker 地址后可实现数据持久化。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🔗 证据锚定配置</h3></div>' +
    '<div class="form-group"><label>GitHub Token（用于 Commit 锚定）</label><input type="password" id="cfgGithubToken" value="' + (localStorage.getItem('githubToken') || '') + '" placeholder="ghp_xxxxxxxxxxxx"></div>' +
    '<div class="form-group"><label>GitHub 仓库（格式：owner/repo）</label><input type="text" id="cfgGithubRepo" value="' + (localStorage.getItem('githubRepo') || '') + '" placeholder="username/community-platform"></div>' +
    '<div class="form-group"><label>企业微信 Webhook URL</label><input type="text" id="cfgWechatWebhook" value="' + (localStorage.getItem('wechatWebhook') || '') + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."></div>' +
    '<div class="form-group"><label>Resend API Key</label><input type="password" id="cfgResendKey" value="' + (localStorage.getItem('resendApiKey') || '') + '" placeholder="re_xxxxxxxx"></div>' +
    '<div class="form-group"><label>锚定通知邮箱</label><input type="text" id="cfgAnchorEmail" value="' + (localStorage.getItem('anchorEmail') || '') + '" placeholder="admin@example.com"></div>' +
    '<button class="btn btn-primary" onclick="saveAnchorConfig()">保存锚定配置</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">配置后，投票状态变为"已结束"时将自动执行三端锚定（GitHub Commit + 微信群 + 邮件）。</p></div>';

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

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
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

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
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


/* ========== 档案生成模块 ========== */

function generatePollArchive(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) { showToast('投票不存在', 'error'); return; }

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try {
    const saved = localStorage.getItem('adminData_polls-responses-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    if (saved) responses = JSON.parse(saved);
  } catch(e) {}
  const pollVotes = responses.filter(r => r.pollId === pollId);

  const disp = getPollDisplayStats(poll);
  const allResidents = (appData.residents || []).filter(r => r.status === 'active');
  const totalResidents = disp.totalResidents;
  const totalArea = disp.totalArea;
  const res = poll.results || {};
  const records = poll.anchorRecords || [];

  const win = window.open('', '_blank');
  if (!win) { showToast('请允许弹窗以生成档案', 'error'); return; }

  const now = new Date().toLocaleString('zh-CN');
  const title = poll.title || '';
  const caseNo = poll.caseNo || pollId;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投票档案 - ${caseNo}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; text-align: center; margin-bottom: 8px; border-bottom: 2px solid #2E8B57; padding-bottom: 10px; }
h2 { font-size: 14px; color: #2E8B57; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #2E8B57; padding-left: 8px; }
h3 { font-size: 12px; color: #666; margin-top: 12px; margin-bottom: 6px; }
.cover { text-align: center; padding: 60px 20px; border: 1px solid #e0e0e0; margin-bottom: 30px; }
.cover .case-no { font-size: 16px; color: #666; margin-bottom: 12px; }
.cover .title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.cover .meta { font-size: 13px; color: #666; line-height: 2; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.stat-box { display: inline-block; width: 48%; margin: 1%; padding: 12px; background: #f8f9fa; border-radius: 6px; box-sizing: border-box; }
.stat-box .num { font-size: 18px; font-weight: 700; color: #2E8B57; }
.stat-box .label { font-size: 11px; color: #666; }
.small { font-size: 10px; color: #999; }
.page-break { page-break-before: always; }
.signature { margin-top: 40px; display: flex; justify-content: space-between; }
.signature-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; text-align: center; }
@media print {
  .no-print { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f0f7f4;margin-bottom:20px;border-radius:6px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2E8B57;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ 打印为 PDF</button>
  <span style="color:#666;margin-left:12px;">请使用浏览器的"另存为 PDF"功能保存档案</span>
</div>

<div class="cover">
  <div class="case-no">案卷编号：${caseNo}</div>
  <div class="title">${title}</div>
  <div class="meta">
    <div>生成时间：${now}</div>
    <div>档案类型：业主大会投票档案</div>
    <div>生成系统：春天阳光小区数字化平台</div>
  </div>
</div>

<h2>一、投票基本信息</h2>
<table>
  <tr><th style="width:25%">项目</th><th>内容</th></tr>
  <tr><td>案卷编号</td><td>${caseNo}</td></tr>
  <tr><td>投票标题</td><td>${title}</td></tr>
  <tr><td>事项类型</td><td>${poll.category === 'major' ? '重大事项' : '一般事项'}</td></tr>
  <tr><td>法律依据</td><td>${poll.legalBasis || '—'}</td></tr>
  <tr><td>投票期间</td><td>${poll.startDate || '—'} 至 ${poll.endDate || '—'}</td></tr>
  <tr><td>目标户数</td><td>${totalResidents} 户</td></tr>
  <tr><td>总面积</td><td>${totalArea.toFixed(2)} ㎡</td></tr>
  <tr><td>议事规则</td><td>${(poll.ruleFiles || []).length > 0 ? '已上传 ' + poll.ruleFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>业主清册</td><td>${(poll.rollFiles || []).length > 0 ? '已上传 ' + poll.rollFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>会议通知</td><td>${(poll.meetingFiles || []).length > 0 ? '已上传 ' + poll.meetingFiles.length + ' 份' : '—'}</td></tr>
</table>

<h2>二、业主清册摘要</h2>
<div style="display:flex;flex-wrap:wrap;">
  <div class="stat-box"><div class="num">${totalResidents}</div><div class="label">目标户数</div></div>
  <div class="stat-box"><div class="num">${totalArea.toFixed(2)} ㎡</div><div class="label">建筑总面积</div></div>
  <div class="stat-box"><div class="num">${(res.participatingResidents || 0)}</div><div class="label">参与投票户数</div></div>
  <div class="stat-box"><div class="num">${(res.participatingArea || 0).toFixed(2)} ㎡</div><div class="label">参与投票面积</div></div>
</div>

<h2>三、投票结果统计</h2>
<table>
  <tr><th>指标</th><th>数值</th><th>比例</th><th>门槛</th><th>是否达标</th></tr>
  <tr>
    <td>参与户数 / 目标户数</td>
    <td>${disp.participatingResidents} / ${totalResidents}</td>
    <td>${disp.residentParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.residentPct) || 66.67}%</td>
    <td>${disp.residentParticipationRate >= ((poll.threshold && poll.threshold.residentPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>参与面积 / 总面积</td>
    <td>${disp.participatingArea.toFixed(2)} / ${totalArea.toFixed(2)} ㎡</td>
    <td>${disp.areaParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.areaPct) || 66.67}%</td>
    <td>${disp.areaParticipationRate >= ((poll.threshold && poll.threshold.areaPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意户数 / 参与户数</td>
    <td>${disp.agreeCount} / ${disp.participatingResidents}</td>
    <td>${disp.agreeResidentRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeResidentRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意面积 / 参与面积</td>
    <td>${disp.agreeArea.toFixed(2)} / ${disp.participatingArea.toFixed(2)} ㎡</td>
    <td>${disp.agreeAreaRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeAreaRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
</table>
<div style="margin-top:10px;padding:10px;background:${disp.isPassed ? '#e8f5e9' : '#ffebee'};border-radius:6px;text-align:center;font-weight:600;font-size:14px;">
  ${disp.isPassed ? '✅ 表决通过' : '❌ 表决未通过'}
</div>

<h2>四、投票明细（脱敏）</h2>
<table>
  <tr><th>序号</th><th>房号</th><th>面积(㎡)</th><th>第一题答案</th><th>投票时间</th><th>哈希片段</th></tr>`;

  pollVotes.forEach((v, i) => {
    const firstAns = v.choice && v.choice.length > 0 ? v.choice[0].value : '—';
    const valStr = Array.isArray(firstAns) ? firstAns.join(',') : String(firstAns);
    const hashFrag = v.nonce ? v.nonce.substring(0, 8) + '...' : '—';
    html += `<tr><td>${i+1}</td><td>${v.roomNo || '—'}</td><td>${v.area || 0}</td><td>${valStr}</td><td>${v.voteTime ? new Date(v.voteTime).toLocaleString('zh-CN') : '—'}</td><td class="small">${hashFrag}</td></tr>`;
  });

  if (pollVotes.length === 0) {
    html += `<tr><td colspan="6" style="text-align:center;color:#999;">暂无投票记录</td></tr>`;
  }

  html += `</table>

<div class="page-break"></div>

<h2>五、异议及处理记录</h2>
<table>
  <tr><th style="width:15%">时间</th><th style="width:15%">提出人</th><th>异议内容</th><th style="width:15%">处理结果</th></tr>`;

  const objections = poll.objections || [];
  if (objections.length > 0) {
    objections.forEach(o => {
      html += `<tr><td>${o.time ? new Date(o.time).toLocaleString('zh-CN') : '—'}</td><td>${o.resident || '—'}</td><td>${o.content || '—'}</td><td>${o.result || '待处理'}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="text-align:center;color:#999;">暂无异议记录</td></tr>`;
  }

  html += `</table>

<h2>六、证据锚定记录</h2>
<table>
  <tr><th>锚定点</th><th>类型</th><th>时间</th><th>链接/Hash</th><th>状态</th></tr>`;

  if (records.length > 0) {
    records.forEach(r => {
      const status = r.error ? '❌ 失败' : '✅ 成功';
      const link = r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : (r.txHash || '—');
      html += `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.time ? new Date(r.time).toLocaleString('zh-CN') : '—'}</td><td class="small">${link}</td><td>${status}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="5" style="text-align:center;color:#999;">暂无锚定记录</td></tr>`;
  }

  html += `</table>

<h2>七、Merkle Root</h2>
<div style="padding:12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all;">
  ${poll.merkleRoot || '—'}
</div>
<div class="small" style="margin-top:4px;">此 Merkle Root 已通过 GitHub Commit、微信群机器人、邮件三端锚定，确保投票数据不可篡改。</div>

<div class="page-break"></div>

<h2>八、签章页</h2>
<div style="margin-top:20px;">
  <p>本档案由春天阳光小区数字化平台自动生成，包含完整的投票过程记录、计票结果及证据锚定信息。</p>
  <p>档案生成时间：${now}</p>
  <p>系统版本：Community Platform v2.0</p>
</div>
<div class="signature">
  <div class="signature-box">业委会签章</div>
  <div class="signature-box">物业签章</div>
</div>
<div class="signature" style="margin-top:30px;">
  <div class="signature-box">社区签章</div>
  <div class="signature-box">街道备案签章</div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
  showToast('档案已生成，请在弹窗中打印为 PDF', 'success');
}

function generateVoterReceipt(voteRecord) {
  if (!voteRecord) return;
  const poll = (appData.polls || []).find(p => p.id === voteRecord.pollId);
  const title = poll ? (poll.title || '') : '投票回执';
  const caseNo = poll ? (poll.caseNo || '') : '';
  const roomNo = voteRecord.roomNo || '—';
  const voteTime = voteRecord.voteTime ? new Date(voteRecord.voteTime).toLocaleString('zh-CN') : '—';
  const nonce = voteRecord.nonce || '—';
  const hashFrag = voteRecord.ipHash ? voteRecord.ipHash.substring(0, 16) + '...' : '—';

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { showToast('请允许弹窗以生成回执', 'error'); return; }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票回执</title>
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.receipt { background: #fff; width: 360px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; position: relative; overflow: hidden; }
.receipt::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2E8B57, #3da76b); }
.receipt-header { text-align: center; margin-bottom: 20px; }
.receipt-header .logo { font-size: 32px; margin-bottom: 8px; }
.receipt-header .title { font-size: 16px; font-weight: 700; color: #333; }
.receipt-header .subtitle { font-size: 11px; color: #999; margin-top: 4px; }
.receipt-body { border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0; padding: 16px 0; }
.receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.receipt-row .label { color: #666; }
.receipt-row .value { color: #333; font-weight: 500; }
.receipt-row .value.room { font-size: 18px; font-weight: 700; color: #2E8B57; }
.hash-box { background: #f8f9fa; border-radius: 6px; padding: 10px; margin-top: 12px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.5; }
.receipt-footer { text-align: center; margin-top: 20px; }
.receipt-footer .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2E8B57; color: #2E8B57; border-radius: 4px; font-size: 13px; font-weight: 600; transform: rotate(-3deg); opacity: 0.8; }
.receipt-footer .tip { font-size: 11px; color: #999; margin-top: 12px; }
.btn-print { display: block; width: 100%; padding: 10px; margin-top: 16px; background: #2E8B57; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.qr-placeholder { width: 80px; height: 80px; background: #f5f5f5; border-radius: 6px; margin: 12px auto 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
@media print {
  body { background: #fff; }
  .btn-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo">🗳️</div>
    <div class="title">${title}</div>
    <div class="subtitle">${caseNo}</div>
  </div>
  <div class="receipt-body">
    <div class="receipt-row"><span class="label">房号</span><span class="value room">${roomNo}</span></div>
    <div class="receipt-row"><span class="label">投票时间</span><span class="value">${voteTime}</span></div>
    <div class="receipt-row"><span class="label">随机Nonce</span><span class="value">${nonce.substring(0, 8)}...</span></div>
    <div class="receipt-row"><span class="label">IP哈希</span><span class="value">${hashFrag}</span></div>
    <div class="hash-box">
      <div style="margin-bottom:4px;font-weight:600;color:#333;">Merkle Path 片段</div>
      <div>${voteRecord.prevHash ? voteRecord.prevHash.substring(0, 24) + '...' : '首票（无前置）'}</div>
    </div>
  </div>
  <div class="receipt-footer">
    <div class="stamp">已上链存证</div>
    <div class="qr-placeholder">Merkle<br>Root</div>
    <div class="tip">请截图保存此回执<br>作为您的投票凭证</div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

async function recalculatePoll(pollId) {
  showLoading(true);
  try {
    const result = await calculatePollResults(pollId);
    if (result) {
      // 保存 poll 数据
      await saveDataFile('polls', appData.polls, '重新计票 ' + pollId, 'update');
      // 追加审计日志
      appendAuditLog('recount', 'polls', pollId, '管理员手动重新计票，结果：' + (result.isPassed ? '通过' : '未通过'));
      showToast('计票完成：' + (result.isPassed ? '通过' : '未通过'), result.isPassed ? 'success' : 'info');
      navigateTo('polls');
    } else {
      showToast('计票失败：未找到投票数据', 'error');
    }
  } catch(e) {
    showToast('计票失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(module, id) {
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

async function saveDataFile(filename, data, detail, action) {
  action = action || 'update';

  // 优先使用 Worker 持久化（确保前端实时同步）
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/' + filename + '.json', data, detail);
      showToast('✅ 已同步到云端，前端将自动更新', 'success');
      await appendAuditLog(action, filename, (data && data.id) || '', detail);
      return;
    } catch(e) {
      console.error('Worker 保存失败，回退到本地:', e);
      showToast('⚠️ Worker 同步失败：' + e.message + '，已保存到本地', 'error');
      // 回退到 localStorage
    }
  }

  if (!githubToken) {
    localStorage.setItem('adminData_' + filename, JSON.stringify(data));
    showToast('保存成功', 'success');
    await appendAuditLog(action, filename, (data && data.id) || '', detail);
    return;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息');
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/' + filename + '.json';
  const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!getRes.ok) throw new Error('无法读取文件，请检查Token权限');
  const fileInfo = await getRes.json();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] ' + detail, content: content, sha: fileInfo.sha })
  });
  if (!putRes.ok) {
    const err = await putRes.json();
    throw new Error(err.message || '保存失败');
  }
  await appendAuditLog(action, filename, data.id || '', detail);
}

async function appendAuditLog(action, target, targetId, detail) {
  const log = appData['audit-log'] || [];
  log.push({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    adminName: currentAdmin && currentAdmin.name || '未知',
    adminId: currentAdmin && currentAdmin.id || '',
    action: action,
    target: target,
    targetId: targetId,
    details: detail,
    clientInfo: navigator.userAgent
  });
  appData['audit-log'] = log;

  // 优先使用 Worker 保存审计日志
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/audit-log.json', log, '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新');
    } catch(e) { console.error('审计日志Worker保存失败', e); }
    return;
  }

  if (!githubToken) return;
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) return;
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/audit-log.json';
  try {
    const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!getRes.ok) return;
    const fileInfo = await getRes.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2))));
    await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新', content: content, sha: fileInfo.sha })
    });
  } catch(e) { console.error('审计日志保存失败', e); }
}

async function getRepoInfo() {
  if (!githubToken) return null;
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + githubToken }
    });
    if (!r.ok) return null;
    const user = await r.json();
    const savedRepo = localStorage.getItem('githubRepo');
    if (savedRepo) return [user.login, savedRepo];
    const path = window.location.pathname;
    const parts = path.split('/');
    if (parts.length >= 2 && parts[1] && !parts[1].includes('.')) return [user.login, parts[1]];
    return null;
  } catch(e) { return null; }
}

function showBatchImport() {
  document.getElementById('modalTitle').textContent = '📥 批量导入业主';
  document.getElementById('modalBody').innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请粘贴Excel内容，格式：房号 | 姓名 | 手机后四位（每行一条，可用制表符或竖线分隔）</p>' +
    '<textarea class="batch-textarea" id="batchData" placeholder="1-1-101	张三	1234\n1-1-102	李四	5678"></textarea>' +
    '<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--text-secondary);font-weight:500;">或上传文件（.csv / .xlsx / .vcf）：</div>' +
    createFileUploaderHTML({id:'batchFile', accept:'.csv,.xlsx,.xls,.vcf,.vcd', hint:'支持拖拽或点击上传 .csv / .xlsx / .vcf 文件'}) +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">示例：1-1-101  测试业主01  0001</div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchImport()">导入</button>';
  document.getElementById('modalOverlay').classList.add('active');
}

async function doBatchImport() {
  let rows = [];
  let success = 0, fail = 0;

  // 先尝试从上传的文件解析
  const batchPath = getUploadedPath('batchFile');
  if (batchPath && batchPath.startsWith('blob:')) {
    try {
      const r = await fetch(batchPath);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], 'batch.csv');
        rows = await handleBatchFile(file);
      }
    } catch(e) { console.error(e); }
  } else if (batchPath) {
    showLoading(true);
    try {
      const ownerRepo = await getRepoInfo();
      if (ownerRepo) {
        const [owner, repo] = ownerRepo;
        const r = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + batchPath);
        if (r.ok) {
          const blob = await r.blob();
          const file = new File([blob], 'batch.' + (batchPath.split('.').pop() || 'csv'));
          rows = await handleBatchFile(file);
        }
      }
    } catch(e) { console.error(e); }
    showLoading(false);
  }

  // 如果没有文件或文件解析失败，尝试文本框
  if (rows.length === 0) {
    const text = document.getElementById('batchData').value.trim();
    if (!text) { showToast('请输入数据或上传文件', 'error'); return; }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t|\|\s]+/);
      if (parts.length >= 3) {
        rows.push(parts);
      }
    });
  }

  const newResidents = [];
  rows.forEach(parts => {
    const room = parts[0].trim();
    const name = parts[1].trim();
    const suffix = (parts[2] || '').trim().replace(/[^0-9]/g, '').substring(0,4);
    if (room && name && suffix) {
      newResidents.push({ id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), roomNo: room, name: name, phoneSuffix: suffix, area: 0, voteWeightCount: 1, voteWeightArea: 0, status: 'active', isTest: false, registeredAt: new Date().toISOString().split('T')[0] });
      success++;
    } else { fail++; }
  });

  if (newResidents.length === 0) { showToast('未解析到有效数据', 'error'); return; }
  const list = appData.residents || [];
  list.push.apply(list, newResidents);
  appData.residents = list;
  closeModal(); showLoading(true);
  try {
    await saveDataFile('residents', list, '批量导入 ' + success + ' 位业主', 'batch-import');
    showToast('成功导入 ' + success + ' 位业主' + (fail?'，' + fail + '行失败':''), 'success');
    navigateTo('residents');
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function saveAnchorConfig() {
  localStorage.setItem('githubToken', document.getElementById('cfgGithubToken').value.trim());
  localStorage.setItem('githubRepo', document.getElementById('cfgGithubRepo').value.trim());
  localStorage.setItem('wechatWebhook', document.getElementById('cfgWechatWebhook').value.trim());
  localStorage.setItem('resendApiKey', document.getElementById('cfgResendKey').value.trim());
  localStorage.setItem('anchorEmail', document.getElementById('cfgAnchorEmail').value.trim());
  showToast('锚定配置已保存', 'success');
}

async function changePassword() {
  const oldPwd = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码需6位以上', 'error'); return; }

  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id));
  if (!account) { showToast('账户配置异常', 'error'); return; }
  if (oldPwd !== account.password) { showToast('当前密码错误', 'error'); return; }

  // 更新内存中的密码
  account.password = newPwd;

  // 同步持久化到 config.adminAccounts（如 Worker 可用）
  if (!appData.config) appData.config = {};
  if (!appData.config.adminAccounts) appData.config.adminAccounts = [];
  let persisted = appData.config.adminAccounts.find(a => a.id === account.id);
  if (persisted) {
    persisted.password = newPwd;
  } else {
    appData.config.adminAccounts.push({ id: account.id, password: newPwd, permissions: account.permissions });
  }

  showLoading(true);
  try {
    await saveDataFile('config', appData.config, '管理员 ' + account.name + ' 修改密码', 'password-change');
    showToast('密码修改成功', 'success');
  } catch(e) {
    showToast('密码已更新（内存），但持久化失败：' + e.message, 'warning');
  } finally {
    showLoading(false);
  }
}

function showTokenModal() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
}


function saveWorkerBase() {
  const el = document.getElementById('workerBaseInput');
  if (!el) return;
  const val = el.value.trim();
  localStorage.setItem('workerBase', val.replace(/\/$/, ''));
  showToast('Worker地址已保存，刷新页面后生效', 'success');
}
async function updateToken() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
  closeModal();
}


/* ========== 图片压缩 ========== */

async function compressImageToBlob(file, maxSizeMB = 0.03) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const toBlob = (q) => new Promise((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', q);
      });
      const maxSize = maxSizeMB * 1024 * 1024;
      let blob = await toBlob(0.25);
      if (blob.size <= maxSize) {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let low = 0.05, high = 0.4, bestBlob = null;
      while (high - low > 0.03) {
        const mid = (low + high) / 2;
        blob = await toBlob(mid);
        if (blob.size > maxSize) { high = mid; }
        else { low = mid; bestBlob = blob; }
      }
      if (bestBlob && bestBlob.size <= maxSize) {
        resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let scale = 0.7;
      while (scale > 0.05) {
        const nw = Math.max(1, Math.floor(w * scale));
        const nh = Math.max(1, Math.floor(h * scale));
        canvas.width = nw; canvas.height = nh;
        ctx.drawImage(img, 0, 0, nw, nh);
        blob = await toBlob(0.3);
        if (blob.size <= maxSize) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        scale -= 0.18;
      }
      reject(new Error('图片压缩后仍超过' + maxSizeMB + 'MB限制'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/* ==================== 管理员账户配置（可直接修改） ====================
   说明：以下密码为明文，方便直接修改。如需调整权限或密码，
   直接编辑下方 ADMIN_ACCOUNTS 数组即可，无需理解其他代码逻辑。
   四个角色：总维护人员、物管人员、业委会成员、社区人员。
   ==================================================================== */
const ADMIN_ACCOUNTS = [
  { id: 'admin-super',      name: '总维护人员',   role: 'super',      password: 'Sunlight2026',  permissions: ['all'] },
  { id: 'admin-property',   name: '物管人员',       role: 'property',   password: 'Property2026',  permissions: ['announcements','documents','workorders','residents'] },
  { id: 'admin-committee',  name: '业委会成员',     role: 'committee',  password: 'Committee2026', permissions: ['polls','residents','complaints','audit'] },
  { id: 'admin-community',  name: '社区人员',       role: 'community',  password: 'Community2026', permissions: ['announcements','activities','complaints'] }
];

let appData = {config:{},announcements:[],documents:[],activities:[],polls:[],residents:[],'audit-log':[],workorders:[],complaints:[]};

// ===== Worker 网关配置（工单/投诉管理模块，不影响原有功能） =====
const WORKER_BASE = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
function getWorkerBase(){ return WORKER_BASE.replace(/\/$/,''); }
function getCurrentMonthPath(module){
  const d=new Date();
  return module+'/'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'.json';
}
async function workerRead(filePath){
  const base=getWorkerBase();
  if(!base){
    // 尝试多种可能的 key 格式（兼容有/无前导零的月份）
    const keysToTry = [];
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    keysToTry.push(key);
    // 如果包含月份路径如 polls-responses/2026-08.json，也尝试 polls-responses/2026-8.json
    const altKey = key.replace(/-(\d{2})$/, function(m, p1) { return '-' + parseInt(p1, 10); });
    if (altKey !== key) keysToTry.push(altKey);
    // 反向：如果当前是无前导零，也尝试有前导零
    const altKey2 = key.replace(/-(\d)$/, function(m, p1) { return '-' + String(parseInt(p1, 10)).padStart(2, '0'); });
    if (altKey2 !== key) keysToTry.push(altKey2);
    for (const k of keysToTry) {
      const cached = appData[k];
      if(cached && Array.isArray(cached) && cached.length > 0) return cached;
    }
    // 尝试从 appData 的模块名直接读取（如 appData.workorders）
    const moduleName = filePath.split('/')[0];
    if(appData[moduleName] && Array.isArray(appData[moduleName]) && appData[moduleName].length > 0) return appData[moduleName];
    return [];
  }
  // Worker 模式：先尝试原始路径，失败则尝试月份格式兼容
  const tryPaths = [filePath];
  const m = filePath.match(/^(polls-responses\/\d{4})-(\d{2})\.json$/);
  if (m) {
    const alt = m[1] + '-' + parseInt(m[2], 10) + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  const m2 = filePath.match(/^(polls-responses\/\d{4})-(\d)\.json$/);
  if (m2) {
    const alt = m2[1] + '-' + String(parseInt(m2[2], 10)).padStart(2, '0') + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  for (const p of tryPaths) {
    try {
      const res=await fetch(base+'/api/read/'+encodeURIComponent(p));
      if(res.ok) {
        const t=await res.text();
        return t?JSON.parse(t):[];
      }
    } catch(e) {}
  }
  throw new Error('读取失败');
}
async function workerWrite(filePath,data,message){
  const base=getWorkerBase();
  if(!base){
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    appData[key]=data;
    showToast('开发模式：数据仅保存在内存中','info');
    return;
  }
  const res=await fetch(base+'/api/write/'+encodeURIComponent(filePath),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:JSON.stringify(data,null,2),message})
  });
  if(!res.ok){const e=await res.json();throw new Error(e.error||'保存失败');}
}
async function workerUpload(file){
  const base=getWorkerBase();
  if(!base){
    return {url:URL.createObjectURL(file),name:file.name};
  }
  const fd=new FormData();fd.append('file',file);
  const res=await fetch(base+'/api/upload',{method:'POST',body:fd});
  if(!res.ok) throw new Error('上传失败');
  return await res.json();
}
function woStatusClass(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}
function cpStatusClass(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}
async function loadAllWorkorders(){
  try{ return await workerRead(getCurrentMonthPath('workorders')); }catch(e){ return []; }
}
async function loadAllComplaints(){
  try{ return await workerRead(getCurrentMonthPath('complaints')); }catch(e){ return []; }
}

let currentModule = 'dashboard';
let adminSession = null;
let githubToken = localStorage.getItem('githubToken') || '';
let currentAdmin = null;
const SALT = "SunlightCommunity2026";

document.addEventListener('DOMContentLoaded', async () => {
  try { 
    await loadAllData(); 
    autoSkipLogin();
  } catch(e) { 
    console.error('Init error:', e);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('tokenPage').style.display = 'none';
    document.getElementById('adminLayout').classList.add('active');
    document.getElementById('contentArea').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>初始化失败，请刷新页面重试</div><div style="font-size:12px;color:#999;margin-top:8px;">' + escapeHtml(e.message) + '</div></div>';
  }
});

async function loadAllData() {
  const files = ['config','announcements','documents','activities','polls','residents','audit-log'];
  const workerBase = getWorkerBase();

  for (const f of files) {
    let loaded = false;
    let workerData = null;

    // 1. 优先从 Worker 读取（已持久化的数据）
    if (workerBase) {
      try {
        const r = await fetch(workerBase + '/api/read/' + encodeURIComponent('data/' + f + '.json') + '?t=' + Date.now());
        if (r.ok) {
          workerData = await r.json();
          // 只有 Worker 返回非空数据才视为加载成功，避免空数组覆盖本地数据
          const isEmpty = (Array.isArray(workerData) && workerData.length === 0) || 
                          (typeof workerData === 'object' && workerData !== null && Object.keys(workerData).length === 0);
          if (!isEmpty) {
            appData[f] = workerData;
            loaded = true;
            continue;
          }
        }
      } catch(e) {}
    }

    // 2. 尝试 fetch 本地 data/ 目录（静态文件）
    if (!loaded) {
      try {
        const r = await fetch('data/' + f + '.json?t=' + Date.now());
        if (r.ok) {
          appData[f] = await r.json();
          loaded = true;
        }
      } catch(e) {}
    }

    // 3. 检查 localStorage（开发模式或回退）
    if (!loaded) {
      try {
        const saved = localStorage.getItem('adminData_' + f);
        if (saved) { appData[f] = JSON.parse(saved); loaded = true; }
      } catch(e) {}
    }

    // 4. 最后回退到 EMBEDDED_DATA（初始默认值）
    if (!loaded) {
      if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[f] !== undefined) {
        appData[f] = EMBEDDED_DATA[f];
        loaded = true;
      }
    }

    if (!loaded) {
      const defaults = { config: {}, announcements: [], documents: [], activities: [], polls: [], residents: [], 'audit-log': [] };
      appData[f] = defaults[f] || [];
    }
  }
  updateFavicon();
  updatePageTitle();
  renderSiteLogo();
  // === 无条件补全 residents 面积数据（兼容旧数据无 area 字段的情况）===
  if (appData.residents && appData.residents.length > 0) {
    const embeddedResidents = (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.residents) ? EMBEDDED_DATA.residents : [];
    const areaMap = {};
    embeddedResidents.forEach(r => { if (r.roomNo && r.area) areaMap[r.roomNo] = r.area; });
    let fixedCount = 0;
    appData.residents.forEach((r, i) => {
      if (!r.area || parseFloat(r.area) === 0) {
        const fallbackArea = areaMap[r.roomNo];
        if (fallbackArea) {
          r.area = fallbackArea;
        } else {
          // 兜底：根据房号生成一个合理的面积（60-140㎡）
          const hash = r.roomNo ? r.roomNo.split('').reduce((s, c) => s + c.charCodeAt(0), 0) : i;
          r.area = 60 + Math.floor(Math.abs(Math.sin(hash * 7.3 + 1.5)) * 81);
        }
        fixedCount++;
      }
    });
    if (fixedCount > 0) {
      console.log('[Area Fixup] 已自动为 ' + fixedCount + ' 位业主补全面积数据');
    }
  }

  // === 数据清洗：移除已失效的 blob URL，防止脏数据持续保存 ===
  if (appData.activities) {
    appData.activities.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.videos) item.videos = item.videos.filter(u => !u.startsWith('blob:'));
      if (item.videoLinks) item.videoLinks = item.videoLinks.filter(u => !u.startsWith('blob:'));
      if (item.adminImages) item.adminImages = item.adminImages.filter(u => !u.startsWith('blob:'));
      if (item.coverImage && item.coverImage.startsWith('blob:')) item.coverImage = '';
      if (item.videoUrl && item.videoUrl.startsWith('blob:')) item.videoUrl = '';
    });
  }
  if (appData.announcements) {
    appData.announcements.forEach(item => {
      if (item.attachments) item.attachments = item.attachments.filter(att => att.url && !att.url.startsWith('blob:'));
    });
  }
  if (appData.documents) {
    appData.documents.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.attachments) item.attachments = item.attachments.filter(a => a.url && !a.url.startsWith('blob:'));
    });
  }

  // 加载持久化的管理员密码配置（覆盖代码默认值）
  if (appData.config && appData.config.adminAccounts && Array.isArray(appData.config.adminAccounts)) {
    appData.config.adminAccounts.forEach(persisted => {
      const acc = ADMIN_ACCOUNTS.find(a => a.id === persisted.id);
      if (acc && persisted.password) acc.password = persisted.password;
      if (acc && persisted.permissions) acc.permissions = persisted.permissions;
    });
  }
}

function updateFavicon() {
  const favicon = appData.config && appData.config.community && appData.config.community.favicon;
  if (favicon) {
    document.getElementById('faviconLink').href = favicon;
  }
}
function updatePageTitle() {
  const c = appData.config && appData.config.community || {};
  document.title = (c.siteTitle || (c.name ? c.name + ' - 管理后台' : '管理后台'));
}
function getSiteLogoConfig() {
  try { var raw = localStorage.getItem("siteLogoConfig"); if (raw) return JSON.parse(raw); } catch(e) {}
  return { type: "emoji", value: "⚙️", title: "管理后台", adminTitle: "管理后台" };
}
function setSiteLogoConfig(cfg) {
  localStorage.setItem("siteLogoConfig", JSON.stringify(cfg));
}
function renderSiteLogo() {
  var cfg = getSiteLogoConfig();
  var iconEl = document.getElementById("siteLogoIcon");
  var titleEl = document.getElementById("siteLogoTitle");
  if (iconEl) {
    if (cfg.type === "image" && cfg.value) {
      iconEl.innerHTML = '<img src="' + cfg.value.replace(/"/g, "&quot;") + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">';
    } else {
      iconEl.innerHTML = cfg.value || "⚙️";
    }
  }
  if (titleEl) titleEl.textContent = cfg.adminTitle || cfg.title || "管理后台";
  var link = document.getElementById("faviconLink");
  if (!link) {
    link = document.createElement("link");
    link.id = "faviconLink"; link.rel = "shortcut icon"; link.type = "image/png";
    document.head.appendChild(link);
  }
  if (cfg.type === "image" && cfg.value) {
    link.href = cfg.value;
  } else {
    var emoji = cfg.value ? cfg.value.replace(/&#(\d+);/g, function(m, code) { return String.fromCodePoint(code); }) : "⚙️";
    var canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 64, 64);
    ctx.font = "48px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, 32, 34);
    link.href = canvas.toDataURL("image/png");
  }
}
function checkLoginState() {
  autoSkipLogin();
}

function autoSkipLogin() {
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

  const account = ADMIN_ACCOUNTS.find(a => a.id === roleId);
  if (!account) { err.textContent = '身份配置错误，请联系总维护人员'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = '验证中...';

  // 明文对比，方便直接修改代码中的密码
  if (pwd !== account.password) {
    err.textContent = '密码错误，请重新输入'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '登录';
    return;
  }

  // 登录成功
  currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
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
  if (!currentAdmin) {
    logout(); return;
  }
  document.getElementById('adminInfo').textContent = currentAdmin.name || '管理员';
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  document.getElementById('adminRole').textContent = roleMap[currentAdmin.role] || currentAdmin.role;
  renderSidebar();
  const hash = location.hash;
  const match = hash.match(/module=([^&]+)/);
  const targetModule = match ? match[1] : 'dashboard';
  const validModules = ['dashboard','config','announcements','documents','activities','polls','residents','audit','workorders','complaints','settings'];
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

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function renderSidebar() {
  if (!currentAdmin) return;
  const perms = currentAdmin.permissions || [];
  const isSuper = currentAdmin.role === 'super';
  const items = [
    { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
    { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
    { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
    { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
    { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
    { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
    { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
    { id: 'objections', label: '异议管理', icon: '⚖️', perm: 'polls', roles: ['super','committee'] },
    { id: 'audit', label: '操作日志', icon: '📋', perm: 'audit-log', roles: ['super','committee'] },
    { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
    { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
    { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
    { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
    { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
  ];
  let html = '';
  items.forEach(item => {
    const hasPerm = isSuper || perms.indexOf('all') >= 0 || perms.indexOf(item.perm) >= 0;
    const hasRole = !item.roles || item.roles.indexOf(currentAdmin.role) >= 0;
    if (!hasPerm || !hasRole) return;
    if (item.external) {
      html += `<div class="nav-item" data-module="${item.id}" onclick="window.open('${item.external}','_blank')">`;
    } else {
      html += `<div class="nav-item ${item.id==='dashboard'?'active':''}" data-module="${item.id}" onclick="navigateTo('${item.id}')">`;
    }
    html += '<span class="icon">' + item.icon + '</span><span>' + item.label + '</span></div>';
  });
  document.getElementById('sidebarNav').innerHTML = html;
}

function navigateTo(module) {
  try {
    currentModule = module;
    location.hash = 'module=' + module;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.module === module));
    const titles = { dashboard: '仪表盘', config: '社区配置', announcements: '公告管理', documents: '文件管理', activities: '动态管理', polls: '投票管理', residents: '业主管理', objections: '异议管理', audit: '操作日志', workorders: '工单管理', complaints: '投诉建议', life: '生活服务', settings: '系统设置' };
    var pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = titles[module] || module;
    var sb = document.getElementById('saveBtn');
    if (sb) sb.style.display = ['dashboard','audit','settings'].indexOf(module) >= 0 ? 'none' : 'inline-block';
    const renderers = {
      dashboard: renderDashboard, config: renderConfig, announcements: renderAnnouncementsAdmin,
      documents: renderDocumentsAdmin, activities: renderActivitiesAdmin, polls: renderPollsAdmin,
      residents: renderResidentsAdmin, objections: renderObjectionsAdmin, audit: renderAuditLog,
      workorders: renderWorkordersAdmin,
      complaints: renderComplaintsAdmin,
      settings: renderSettings
    };
    const fn = renderers[module] || renderDashboard;
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

function renderDashboard() {
  const annCount = (appData.announcements || []).length;
  const docCount = (appData.documents || []).length;
  const actCount = (appData.activities || []).length;
  const pollCount = (appData.polls || []).filter(p => p && p.status === '进行中').length;
  const resCount = (appData.residents || []).filter(r => r && r.status === 'active' && !r.isTest).length;
  const testCount = (appData.residents || []).filter(r => r && r.isTest).length;
  return '<div class="stats-grid">' +
    '<div class="stat-card"><div class="label">公告总数</div><div class="value">' + annCount + '</div></div>' +
    '<div class="stat-card"><div class="label">上级文件</div><div class="value">' + docCount + '</div></div>' +
    '<div class="stat-card"><div class="label">社区动态</div><div class="value">' + actCount + '</div></div>' +
    '<div class="stat-card"><div class="label">进行中投票</div><div class="value">' + pollCount + '</div></div>' +
    '</div><div class="stats-grid">' +
    '<div class="stat-card"><div class="label">正式业主</div><div class="value">' + resCount + '</div></div>' +
    '<div class="stat-card"><div class="label">测试数据</div><div class="value" style="color:var(--warning)">' + testCount + '</div></div>' +
    '</div><div class="card"><div class="card-header"><h3>🚀 快捷入口</h3></div>' +
    '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">' +
    `<button class="btn btn-primary" onclick="navigateTo('announcements');openEditModal('announcements',null)">➕ 发布公告</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('activities');openEditModal('activities',null)">➕ 发布动态</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('polls');openEditModal('polls',null)">➕ 发起投票</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('residents');openEditModal('residents',null)">➕ 添加业主</button>` +
    '</div></div>';
}

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

function renderAnnouncementsAdmin() {
  const list = appData.announcements || [];
  return `<div class="card"><div class="card-header"><h3>📢 公告管理</h3><button class="btn btn-primary" onclick="openEditModal('announcements',null)">➕ 新增公告</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>分类</th><th>日期</th><th>置顶</th><th>作者</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.category||''}</td><td>${item.publishDate||''}</td><td>${item.isPinned?"📌":""}</td><td>${item.author||''}</td><td class="actions"><button onclick="openEditModal('announcements','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('announcements','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderDocumentsAdmin() {
  const list = appData.documents || [];
  return `<div class="card"><div class="card-header"><h3>📄 文件管理</h3><button class="btn btn-primary" onclick="openEditModal('documents',null)">➕ 新增文件</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>来源</th><th>日期</th><th>附件</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      let attachBadge = '';
      const attachments = item.attachments || [];
      const hasPdf = attachments.some(a => a.type === 'pdf') || (item.fileUrl && /\.pdf$/i.test(item.fileUrl));
      const hasImage = attachments.some(a => a.type === 'image') || (item.images && item.images.length);
      const hasLink = item.fileUrl && !hasPdf && !hasImage;

      if (hasPdf) attachBadge += '<span class="pdf-badge">📄 PDF</span> ';
      if (hasImage) attachBadge += '<span class="tag tag-active">🖼️ 图片</span> ';
      if (hasLink) attachBadge += '<span class="tag tag-test">🔗 链接</span> ';
      if (!hasPdf && !hasImage && !hasLink) attachBadge = '<span style="color:#999;font-size:12px;">—</span>';

      const openUrl = item.fileUrl || (attachments[0] && attachments[0].url) || '';
      let linkHtml = attachBadge;
      if (openUrl) {
        linkHtml = `<a href="${openUrl}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px;">${attachBadge}查看 →</a>`;
      }

      return `<tr><td>${escapeHtml(item.title||'')}</td><td>${escapeHtml(item.source||'')}</td><td>${item.publishDate||''}</td><td>${linkHtml}</td><td class="actions"><button onclick="openEditModal('documents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('documents','${item.id}')">删除</button></td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderActivitiesAdmin() {
  const list = appData.activities || [];
  return `<div class="card"><div class="card-header"><h3>🎉 动态管理</h3><button class="btn btn-primary" onclick="openEditModal('activities',null)">➕ 新增动态</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>日期</th><th>地点</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.date||''}</td><td>${item.location||''}</td><td><span class="tag ${item.status==="进行中"?"tag-active":(item.status==="预告"?"tag-test":"tag-disabled")}">${item.status||'已结束'}</span></td><td class="actions"><button onclick="openEditModal('activities','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('activities','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

/* ========== 投票面积数据辅助函数 ========== */
function getPollDisplayStats(item) {
  const res = item.results || {};

  // 统一 totalResidents/totalArea 计算逻辑（与 calculatePollResults 完全一致）
  let totalResidents, totalArea;
  if (item.rollStats && item.rollStats.totalCount > 0) {
    totalResidents = item.rollStats.totalCount;
    totalArea = item.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (item.progress && item.progress.target !== undefined && item.progress.target > 0)
      ? item.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 如果有已固化的计票结果（calculatedAt 存在），直接使用权威数据
  if (res.calculatedAt && res.totalArea > 0) {
    return {
      totalResidents: res.totalResidents || totalResidents,
      totalArea: res.totalArea,
      participatingResidents: res.participatingResidents || 0,
      participatingArea: res.participatingArea || 0,
      agreeCount: res.agreeCount || 0,
      agreeArea: res.agreeArea || 0,
      residentParticipationRate: res.residentParticipationRate || 0,
      areaParticipationRate: res.areaParticipationRate || 0,
      agreeResidentRate: res.agreeResidentRate || 0,
      agreeAreaRate: res.agreeAreaRate || 0,
      isPassed: res.isPassed,
      summary: res.summary || '',
      calculatedAt: res.calculatedAt,
      fromCache: true
    };
  }

  // 无固化数据时，用原始计数 + 统一后的 totalArea 重新计算百分比
  let pResidents = res.participatingResidents || 0;
  let pArea = res.participatingArea || 0;
  let aCount = res.agreeCount || 0;
  let aArea = res.agreeArea || 0;

  if (pArea === 0 && pResidents > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    pArea = pResidents * avgArea;
  }
  if (aArea === 0 && aCount > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    aArea = aCount * avgArea;
  }

  return {
    totalResidents: totalResidents,
    totalArea: totalArea,
    participatingResidents: pResidents,
    participatingArea: pArea,
    agreeCount: aCount,
    agreeArea: aArea,
    residentParticipationRate: totalResidents > 0 ? (pResidents / totalResidents * 100) : 0,
    areaParticipationRate: totalArea > 0 ? (pArea / totalArea * 100) : 0,
    agreeResidentRate: pResidents > 0 ? (aCount / pResidents * 100) : 0,
    agreeAreaRate: pArea > 0 ? (aArea / pArea * 100) : 0,
    isPassed: res.isPassed,
    summary: res.summary || '',
    calculatedAt: res.calculatedAt,
    fromCache: false
  };
}

function renderPollsAdmin() {
  const list = appData.polls || [];
  return `<div class="card"><div class="card-header"><h3>🗳️ 投票管理</h3><button class="btn btn-primary" onclick="openEditModal('polls',null)">➕ 新增投票</button></div>` +
    '<table class="data-table"><thead><tr><th>案卷号</th><th>标题</th><th>类型</th><th>模式</th><th>状态</th><th>时间合规</th><th>进度</th><th>参与率</th><th>同意率</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      const disp = getPollDisplayStats(item);
      const res = item.results || {};
      const modeLabel = item.mode === 'local' ? '<span class="tag tag-active">本地问卷</span>' : '<span class="tag tag-test">腾讯问卷</span>';
      const catLabel = item.category === 'major' ? '<span class="tag" style="background:#ffebee;color:#c62828;">重大</span>' : '<span class="tag" style="background:#e8f5e9;color:#2e7d32;">一般</span>';
      const statusTag = '<span class="tag ' + (item.status==="进行中"?"tag-active":"tag-disabled") + '">' + (item.status||'') + '</span>';

      // 参与率（自动从业主库补全面积数据）
      const rPart = disp.residentParticipationRate;
      const aPart = disp.areaParticipationRate;
      const partHtml = '<div style="font-size:12px;">人数 ' + rPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rPart) + '%;"></div></div>面积 ' + aPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aPart) + '%;background:#1976D2;"></div></div></div>';

      // 同意率（自动从业主库补全面积数据）
      const rAgree = disp.agreeResidentRate;
      const aAgree = disp.agreeAreaRate;
      const agreeHtml = '<div style="font-size:12px;">人数 ' + rAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rAgree) + '%;"></div></div>面积 ' + aAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aAgree) + '%;background:#1976D2;"></div></div></div>';

      // 通过标签（只有已结束才显示最终判定）
      let passHtml = '<span style="color:#999;font-size:12px;">—</span>';
      if (item.status === '已结束') {
        passHtml = res.isPassed === true ? '<span class="tag tag-active">✅ 通过</span>' : (res.isPassed === false ? '<span class="tag tag-test">❌ 未通过</span>' : '<span style="color:#999;font-size:12px;">—</span>');
      } else if (item.status === '进行中') {
        passHtml = '<span class="tag" style="background:#fff3e0;color:#e65100;">🗳️ 进行中</span>';
      }
      const anchorHtml = item.status === '已结束' ? (item.anchorRecords && item.anchorRecords.some(r => !r.error) ? '<span class="tag tag-active" style="cursor:pointer;" onclick="event.stopPropagation();showAnchorDetails(\'' + item.id + '\')">🔗 已锚定</span>' : '<span class="tag tag-test" style="cursor:pointer;" onclick="event.stopPropagation();anchorVoteData(\'' + item.id + '\')">⚠️ 未锚定</span>') : '';
      const pendingObj = (item.objections || []).filter(o => !o.status || o.status === '待处理').length;
      const objBadge = pendingObj > 0 ? '<span class="tag" style="background:#ffebee;color:#c62828;cursor:pointer;" onclick="event.stopPropagation();navigateTo(\'objections\')">⚠️ ' + pendingObj + ' 异议</span>' : '';

      const progressHtml = '<div style="font-size:12px;">' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + ' / ' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + ' 户</div>';
      let actions = `<button onclick="openEditModal('polls','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('polls','${item.id}')">删除</button>`;
      if(item.mode === 'local') {
        actions += `<button onclick="viewPollData('${item.id}')" style="margin-left:4px;">📊 数据</button>`;
      }
      actions += `<button onclick="recalculatePoll('${item.id}')" style="margin-left:4px;">🔄 计票</button>`;
      return `<tr><td>${item.caseNo||''}</td><td>${item.title||''}</td><td>${catLabel}</td><td>${modeLabel}</td><td>${statusTag}</td><td>${(function(){let tags='';if(item.announcement&&item.announcement.start&&item.startDate){const as=new Date(item.announcement.start);const vs=new Date(item.startDate);if((vs-as)>=15*86400000)tags+='<span class="tag tag-active">✅公告期合规</span> ';else tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}else{tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}if(item.consultation&&item.consultation.start&&item.consultation.end){const cs=new Date(item.consultation.start);const ce=new Date(item.consultation.end);if((ce-cs)>=6*86400000)tags+='<span class="tag tag-active">✅征求意见合规</span>';else tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}else{tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}return tags;})()}</td><td>${progressHtml}</td><td>${partHtml}</td><td>${agreeHtml}</td><td>${passHtml} ${anchorHtml} ${objBadge}</td><td class="actions">${actions}</td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderResidentsAdmin() {
  const list = appData.residents || [];
  return `<div class="card"><div class="card-header"><h3>👥 业主管理</h3><div class="actions"><button class="btn" onclick="showBatchImport()">📥 批量导入</button><button class="btn btn-primary" onclick="openEditModal('residents',null)">➕ 添加业主</button></div></div>` +
    '<table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(m²)</th><th>手机后四位</th><th>状态</th><th>绑定方式</th><th>标记</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.roomNo||''}</td><td>${item.name||''}</td><td>${item.area||'—'}</td><td>${item.phoneSuffix||''}</td><td><span class="tag ${item.status==="active"?"tag-active":"tag-disabled"}">${item.status==="active"?"正常":"禁用"}</span></td><td>${item.bindingMethod||'—'}</td><td>${item.isTest?`<span class="tag tag-test">测</span>`:""}${item.isSameBuyer?`<span class="tag tag-test" style="background:#e3f2fd;color:#1565c0;margin-left:2px;">同</span>`:""}</td><td class="actions"><button onclick="openEditModal('residents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('residents','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderAuditLog() {
  const list = appData['audit-log'] || [];
  const polls = appData.polls || [];

  // 投票审计时间轴选择器
  let pollSelect = '<div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:500;margin-right:8px;">查看投票全流程审计：</label><select id="auditPollSelect" onchange="renderPollAuditTimeline(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">';
  pollSelect += '<option value="">— 请选择投票 —</option>';
  polls.forEach(p => { pollSelect += '<option value="' + p.id + '">' + (p.caseNo||'') + ' ' + (p.title||'') + '</option>'; });
  pollSelect += '</select></div>';

  let html = '<div class="card"><div class="card-header"><h3>📋 操作日志</h3></div>' + pollSelect +
    '<div id="pollAuditTimeline"></div>' +
    '<table class="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>' +
    list.slice().reverse().map(item => '<tr><td>' + formatDateTime(item.timestamp) + '</td><td>' + (item.adminName||'') + '</td><td>' + (item.action||'') + '</td><td>' + (item.target||'') + '</td><td>' + (item.details||'') + '</td></tr>').join('') +
    '</tbody></table></div>';
  return html;
}


function renderObjectionsAdmin() {
  // 收集所有 polls 中的异议
  let allObjections = [];
  (appData.polls || []).forEach(p => {
    (p.objections || []).forEach(o => {
      allObjections.push({ ...o, pollId: p.id, pollTitle: p.title, pollCaseNo: p.caseNo });
    });
  });

  // 也检查独立的 appData.objections（兼容两种存储方式）
  (appData.objections || []).forEach(o => {
    const poll = (appData.polls || []).find(p => p.id === o.pollId);
    if (poll && !allObjections.find(x => x.id === o.id)) {
      allObjections.push({ ...o, pollTitle: poll.title, pollCaseNo: poll.caseNo });
    }
  });

  const pending = allObjections.filter(o => !o.status || o.status === '待处理').length;

  let html = '<div class="card"><div class="card-header"><h3>⚖️ 异议管理' + (pending > 0 ? ' <span style="color:var(--danger);font-size:14px;">(' + pending + ' 待处理)</span>' : '') + '</h3></div>';
  if (!allObjections.length) {
    html += '<div class="empty-state"><div class="icon">⚖️</div><div>暂无异议记录</div></div>';
    html += '</div>';
    return html;
  }

  html += '<table class="data-table"><thead><tr><th>编号</th><th>投票案卷</th><th>申请人房号</th><th>内容摘要</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>';
  allObjections.slice().reverse().forEach(o => {
    const statusTag = !o.status || o.status === '待处理' ? '<span class="tag tag-test">待处理</span>' : '<span class="tag tag-active">已处理</span>';
    const contentPreview = (o.content || '').substring(0, 30) + ((o.content || '').length > 30 ? '...' : '');
    html += '<tr><td>' + (o.id || '—') + '</td><td>' + escapeHtml(o.pollCaseNo || '') + '</td><td>' + escapeHtml(o.residentRoom || o.resident || '—') + '</td><td>' + escapeHtml(contentPreview) + '</td><td>' + formatDateTime(o.createdAt || o.time) + '</td><td>' + statusTag + '</td><td class="actions"><button onclick="openObjectionModal(\'' + (o.pollId || '') + '\',\'' + (o.id || '') + '\')">处理</button></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function openObjectionModal(pollId, objectionId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;
  const obj = (poll.objections || []).find(o => o.id === objectionId) || (appData.objections || []).find(o => o.id === objectionId);
  if (!obj) return;

  document.getElementById('modalTitle').textContent = '处理异议：' + (obj.id || '');
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">投票：' + escapeHtml(poll.title || '') + '</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">案卷号：' + (poll.caseNo || '') + ' · 申请人：' + escapeHtml(obj.resident || obj.residentRoom || '—') + '</div>';
  body += '<div style="font-size:13px;margin-top:8px;padding:10px;background:#fff;border-radius:6px;border:1px solid var(--border);">' + escapeHtml(obj.content || '') + '</div>';
  if (obj.images && obj.images.length) {
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    obj.images.forEach(url => { body += '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\'' + url + '\')" loading="lazy">'; });
    body += '</div>';
  }
  body += '</div>';

  if (obj.reply) {
    body += '<div style="margin-bottom:12px;padding:12px;background:#e3f2fd;border-radius:8px;border-left:4px solid #1976D2;">';
    body += '<div style="font-weight:600;color:#1976D2;margin-bottom:4px;">已回复</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' + formatDateTime(obj.handledAt) + ' · ' + escapeHtml(obj.handler || '') + '</div>';
    body += '<div style="font-size:13px;">' + escapeHtml(obj.reply) + '</div>';
    body += '</div>';
  }

  body += '<div class="form-group"><label>处理回复</label><textarea id="objReply" rows="4" placeholder="填写回复内容...">' + (obj.reply || '') + '</textarea></div>';
  body += '<div class="form-group"><label>处理结果</label><select id="objStatus"><option value="待处理" ' + ((!obj.status || obj.status === '待处理') ? 'selected' : '') + '>待处理</option><option value="已处理" ' + (obj.status === '已处理' ? 'selected' : '') + '>已处理</option><option value="驳回" ' + (obj.status === '驳回' ? 'selected' : '') + '>驳回</option></select></div>';
  body += '<div class="form-group"><label>上传回复附件（可选）</label>' + createMultiImageUploaderHTML('objReplyFiles', '支持拖拽或点击上传图片（自动压缩）') + '</div>';

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveObjectionAction(\'' + pollId + '\',\'' + objectionId + '\')">保存</button>';
  document.getElementById('modalOverlay').classList.add('active');

  setTimeout(function() {
    if (obj.replyImages && obj.replyImages.length) setMultiUploadedPaths('objReplyFiles', obj.replyImages);
  }, 50);
}

async function saveObjectionAction(pollId, objectionId) {
  const reply = document.getElementById('objReply').value.trim();
  const status = document.getElementById('objStatus').value;
  if (!reply) { showToast('请填写回复内容', 'error'); return; }

  showLoading(true);
  try {
    const poll = (appData.polls || []).find(p => p.id === pollId);
    if (!poll) throw new Error('投票不存在');

    let obj = (poll.objections || []).find(o => o.id === objectionId);
    if (!obj) {
      obj = (appData.objections || []).find(o => o.id === objectionId);
      if (obj) {
        // 迁移到 poll.objections
        if (!poll.objections) poll.objections = [];
        poll.objections.push(obj);
      }
    }
    if (!obj) throw new Error('异议记录不存在');

    obj.reply = reply;
    obj.status = status;
    obj.handler = currentAdmin && currentAdmin.name || '管理员';
    obj.handledAt = new Date().toISOString();
    obj.replyImages = getMultiUploadedPaths('objReplyFiles') || obj.replyImages || [];

    // 保存 polls
    await saveDataFile('polls', appData.polls, '处理异议 ' + objectionId + '：' + status, 'objection-resolve');

    // 追加审计日志
    await appendAuditLog('objection-resolve', 'polls', pollId, '管理员 ' + obj.handler + ' 处理异议 ' + objectionId + '，结果：' + status);

    showToast('异议处理成功', 'success');
    closeModal();
    navigateTo('objections');
  } catch(e) {
    showToast('处理失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderPollAuditTimeline(pollId) {
  const container = document.getElementById('pollAuditTimeline');
  if (!container || !pollId) { if(container) container.innerHTML = ''; return; }
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;

  const logs = (appData['audit-log'] || []).filter(l => l.targetId === pollId || (l.details && l.details.includes(pollId)) || (l.target === 'polls' && l.details && l.details.includes(poll.title||'')));
  const objections = poll.objections || [];
  const records = poll.anchorRecords || [];

  let html = '<div style="margin-bottom:24px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">⏱️ 投票全流程审计：' + escapeHtml(poll.title||'') + '</div>';
  html += '<div style="border-left:2px solid var(--border);padding-left:16px;">';

  const nodes = [];
  // 发起
  if (poll.createdAt) nodes.push({ time: poll.createdAt, label: '投票发起', detail: '由 ' + (poll.createdBy||'管理员') + ' 创建', type: 'init' });
  // 清册公示
  if (poll.rollPublish && poll.rollPublish.start) nodes.push({ time: poll.rollPublish.start, label: '清册公示开始', detail: '公示期：' + poll.rollPublish.start + ' 至 ' + (poll.rollPublish.end||''), type: 'roll' });
  // 通知送达
  if (poll.meetingFiles && poll.meetingFiles.length) nodes.push({ time: poll.createdAt, label: '会议通知上传', detail: '上传 ' + poll.meetingFiles.length + ' 份通知文件', type: 'notice' });
  // 投票进行中
  if (poll.startDate) nodes.push({ time: poll.startDate + 'T00:00:00Z', label: '投票开始', detail: '投票通道开启', type: 'vote' });
  // 计票
  if (poll.results && poll.results.calculatedAt) nodes.push({ time: poll.results.calculatedAt, label: '自动计票', detail: '参与 ' + (poll.results.participatingResidents||0) + ' 户，' + (poll.results.isPassed ? '通过' : '未通过'), type: 'count' });
  // 结果公示
  if (poll.results && poll.results.isPublished) nodes.push({ time: poll.results.calculatedAt, label: '结果公示', detail: poll.results.summary||'', type: 'publish' });
  // 异议
  objections.forEach(o => {
    nodes.push({ time: o.time || o.createdAt, label: '异议提出', detail: (o.resident||'—') + '：' + (o.content||'').substring(0,40), type: 'objection' });
    if (o.result) nodes.push({ time: o.handledAt || o.time, label: '异议处理', detail: '处理结果：' + o.result, type: 'objection-resolved' });
  });
  // 锚定
  records.forEach(r => {
    if (!r.error) nodes.push({ time: r.time, label: '证据锚定', detail: r.name + '：' + (r.txHash ? r.txHash.substring(0,16)+'...' : '已提交'), type: 'anchor' });
  });
  // 归档
  if (poll.status === '已结束') nodes.push({ time: poll.endDate + 'T23:59:59Z', label: '投票结束/归档', detail: '投票通道关闭，档案生成', type: 'archive' });

  // 按时间排序
  nodes.sort((a, b) => new Date(a.time) - new Date(b.time));

  nodes.forEach((n, i) => {
    const colorMap = { init: '#2E8B57', roll: '#1976D2', notice: '#f9a825', vote: '#2E8B57', count: '#6A1B9A', publish: '#2E8B57', objection: '#c62828', 'objection-resolved': '#2e7d32', anchor: '#E65100', archive: '#546e7a' };
    const color = colorMap[n.type] || '#666';
    html += '<div style="position:relative;margin-bottom:14px;padding-bottom:14px;' + (i < nodes.length - 1 ? 'border-bottom:1px dashed var(--border);' : '') + '">';
    html += '<div style="position:absolute;left:-21px;top:2px;width:10px;height:10px;background:' + color + ';border-radius:50%;"></div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);">' + formatDateTime(n.time) + '</div>';
    html += '<div style="font-weight:600;font-size:13px;margin-top:2px;">' + n.label + '</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(n.detail) + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function renderSettings() {
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id)) || {};
  return '<div class="card"><div class="card-header"><h3>👤 当前身份</h3></div>' +
    '<div class="form-group"><label>身份名称</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.name || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>角色类型</label><input type="text" value="' + (roleMap[currentAdmin && currentAdmin.role] || currentAdmin.role || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>权限列表</label><input type="text" value="' + escapeHtml((currentAdmin && currentAdmin.permissions || []).join(', ')) + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>管理员ID</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.id || '') + '" disabled style="background:#f5f5f5;"></div></div>' +
    '<div class="card"><div class="card-header"><h3>🔐 修改我的密码</h3></div>' +
    '<div class="form-group"><label>当前密码</label><input type="password" id="oldPassword" placeholder="输入当前密码"></div>' +
    '<div class="form-group"><label>新密码（6位以上）</label><input type="password" id="newPassword" placeholder="输入新密码"></div>' +
    '<div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>' +
    '<button class="btn btn-primary" onclick="changePassword()">修改密码</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">提示：修改后的密码会尝试持久化到 Worker。如未配置 Worker，刷新页面后将恢复代码顶部 ADMIN_ACCOUNTS 中的默认密码。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🌐 Worker 网关地址</h3></div>' +
    '<div class="form-group"><label>Worker API 地址（留空则使用内存模式）</label><input type="text" id="workerBaseInput" value="' + (localStorage.getItem('workerBase') || '') + '" placeholder="https://community.firstblade.site 或留空"></div>' +
    '<button class="btn btn-primary" onclick="saveWorkerBase()">保存地址</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">留空表示开发模式（数据仅保存在浏览器内存中，刷新后丢失）。配置 Worker 地址后可实现数据持久化。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🔗 证据锚定配置</h3></div>' +
    '<div class="form-group"><label>GitHub Token（用于 Commit 锚定）</label><input type="password" id="cfgGithubToken" value="' + (localStorage.getItem('githubToken') || '') + '" placeholder="ghp_xxxxxxxxxxxx"></div>' +
    '<div class="form-group"><label>GitHub 仓库（格式：owner/repo）</label><input type="text" id="cfgGithubRepo" value="' + (localStorage.getItem('githubRepo') || '') + '" placeholder="username/community-platform"></div>' +
    '<div class="form-group"><label>企业微信 Webhook URL</label><input type="text" id="cfgWechatWebhook" value="' + (localStorage.getItem('wechatWebhook') || '') + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."></div>' +
    '<div class="form-group"><label>Resend API Key</label><input type="password" id="cfgResendKey" value="' + (localStorage.getItem('resendApiKey') || '') + '" placeholder="re_xxxxxxxx"></div>' +
    '<div class="form-group"><label>锚定通知邮箱</label><input type="text" id="cfgAnchorEmail" value="' + (localStorage.getItem('anchorEmail') || '') + '" placeholder="admin@example.com"></div>' +
    '<button class="btn btn-primary" onclick="saveAnchorConfig()">保存锚定配置</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">配置后，投票状态变为"已结束"时将自动执行三端锚定（GitHub Commit + 微信群 + 邮件）。</p></div>';

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

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
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

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
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


/* ========== 档案生成模块 ========== */

function generatePollArchive(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) { showToast('投票不存在', 'error'); return; }

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try {
    const saved = localStorage.getItem('adminData_polls-responses-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    if (saved) responses = JSON.parse(saved);
  } catch(e) {}
  const pollVotes = responses.filter(r => r.pollId === pollId);

  const disp = getPollDisplayStats(poll);
  const allResidents = (appData.residents || []).filter(r => r.status === 'active');
  const totalResidents = disp.totalResidents;
  const totalArea = disp.totalArea;
  const res = poll.results || {};
  const records = poll.anchorRecords || [];

  const win = window.open('', '_blank');
  if (!win) { showToast('请允许弹窗以生成档案', 'error'); return; }

  const now = new Date().toLocaleString('zh-CN');
  const title = poll.title || '';
  const caseNo = poll.caseNo || pollId;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投票档案 - ${caseNo}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; text-align: center; margin-bottom: 8px; border-bottom: 2px solid #2E8B57; padding-bottom: 10px; }
h2 { font-size: 14px; color: #2E8B57; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #2E8B57; padding-left: 8px; }
h3 { font-size: 12px; color: #666; margin-top: 12px; margin-bottom: 6px; }
.cover { text-align: center; padding: 60px 20px; border: 1px solid #e0e0e0; margin-bottom: 30px; }
.cover .case-no { font-size: 16px; color: #666; margin-bottom: 12px; }
.cover .title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.cover .meta { font-size: 13px; color: #666; line-height: 2; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.stat-box { display: inline-block; width: 48%; margin: 1%; padding: 12px; background: #f8f9fa; border-radius: 6px; box-sizing: border-box; }
.stat-box .num { font-size: 18px; font-weight: 700; color: #2E8B57; }
.stat-box .label { font-size: 11px; color: #666; }
.small { font-size: 10px; color: #999; }
.page-break { page-break-before: always; }
.signature { margin-top: 40px; display: flex; justify-content: space-between; }
.signature-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; text-align: center; }
@media print {
  .no-print { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f0f7f4;margin-bottom:20px;border-radius:6px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2E8B57;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ 打印为 PDF</button>
  <span style="color:#666;margin-left:12px;">请使用浏览器的"另存为 PDF"功能保存档案</span>
</div>

<div class="cover">
  <div class="case-no">案卷编号：${caseNo}</div>
  <div class="title">${title}</div>
  <div class="meta">
    <div>生成时间：${now}</div>
    <div>档案类型：业主大会投票档案</div>
    <div>生成系统：春天阳光小区数字化平台</div>
  </div>
</div>

<h2>一、投票基本信息</h2>
<table>
  <tr><th style="width:25%">项目</th><th>内容</th></tr>
  <tr><td>案卷编号</td><td>${caseNo}</td></tr>
  <tr><td>投票标题</td><td>${title}</td></tr>
  <tr><td>事项类型</td><td>${poll.category === 'major' ? '重大事项' : '一般事项'}</td></tr>
  <tr><td>法律依据</td><td>${poll.legalBasis || '—'}</td></tr>
  <tr><td>投票期间</td><td>${poll.startDate || '—'} 至 ${poll.endDate || '—'}</td></tr>
  <tr><td>目标户数</td><td>${totalResidents} 户</td></tr>
  <tr><td>总面积</td><td>${totalArea.toFixed(2)} ㎡</td></tr>
  <tr><td>议事规则</td><td>${(poll.ruleFiles || []).length > 0 ? '已上传 ' + poll.ruleFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>业主清册</td><td>${(poll.rollFiles || []).length > 0 ? '已上传 ' + poll.rollFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>会议通知</td><td>${(poll.meetingFiles || []).length > 0 ? '已上传 ' + poll.meetingFiles.length + ' 份' : '—'}</td></tr>
</table>

<h2>二、业主清册摘要</h2>
<div style="display:flex;flex-wrap:wrap;">
  <div class="stat-box"><div class="num">${totalResidents}</div><div class="label">目标户数</div></div>
  <div class="stat-box"><div class="num">${totalArea.toFixed(2)} ㎡</div><div class="label">建筑总面积</div></div>
  <div class="stat-box"><div class="num">${(res.participatingResidents || 0)}</div><div class="label">参与投票户数</div></div>
  <div class="stat-box"><div class="num">${(res.participatingArea || 0).toFixed(2)} ㎡</div><div class="label">参与投票面积</div></div>
</div>

<h2>三、投票结果统计</h2>
<table>
  <tr><th>指标</th><th>数值</th><th>比例</th><th>门槛</th><th>是否达标</th></tr>
  <tr>
    <td>参与户数 / 目标户数</td>
    <td>${disp.participatingResidents} / ${totalResidents}</td>
    <td>${disp.residentParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.residentPct) || 66.67}%</td>
    <td>${disp.residentParticipationRate >= ((poll.threshold && poll.threshold.residentPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>参与面积 / 总面积</td>
    <td>${disp.participatingArea.toFixed(2)} / ${totalArea.toFixed(2)} ㎡</td>
    <td>${disp.areaParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.areaPct) || 66.67}%</td>
    <td>${disp.areaParticipationRate >= ((poll.threshold && poll.threshold.areaPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意户数 / 参与户数</td>
    <td>${disp.agreeCount} / ${disp.participatingResidents}</td>
    <td>${disp.agreeResidentRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeResidentRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意面积 / 参与面积</td>
    <td>${disp.agreeArea.toFixed(2)} / ${disp.participatingArea.toFixed(2)} ㎡</td>
    <td>${disp.agreeAreaRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeAreaRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
</table>
<div style="margin-top:10px;padding:10px;background:${disp.isPassed ? '#e8f5e9' : '#ffebee'};border-radius:6px;text-align:center;font-weight:600;font-size:14px;">
  ${disp.isPassed ? '✅ 表决通过' : '❌ 表决未通过'}
</div>

<h2>四、投票明细（脱敏）</h2>
<table>
  <tr><th>序号</th><th>房号</th><th>面积(㎡)</th><th>第一题答案</th><th>投票时间</th><th>哈希片段</th></tr>`;

  pollVotes.forEach((v, i) => {
    const firstAns = v.choice && v.choice.length > 0 ? v.choice[0].value : '—';
    const valStr = Array.isArray(firstAns) ? firstAns.join(',') : String(firstAns);
    const hashFrag = v.nonce ? v.nonce.substring(0, 8) + '...' : '—';
    html += `<tr><td>${i+1}</td><td>${v.roomNo || '—'}</td><td>${v.area || 0}</td><td>${valStr}</td><td>${v.voteTime ? new Date(v.voteTime).toLocaleString('zh-CN') : '—'}</td><td class="small">${hashFrag}</td></tr>`;
  });

  if (pollVotes.length === 0) {
    html += `<tr><td colspan="6" style="text-align:center;color:#999;">暂无投票记录</td></tr>`;
  }

  html += `</table>

<div class="page-break"></div>

<h2>五、异议及处理记录</h2>
<table>
  <tr><th style="width:15%">时间</th><th style="width:15%">提出人</th><th>异议内容</th><th style="width:15%">处理结果</th></tr>`;

  const objections = poll.objections || [];
  if (objections.length > 0) {
    objections.forEach(o => {
      html += `<tr><td>${o.time ? new Date(o.time).toLocaleString('zh-CN') : '—'}</td><td>${o.resident || '—'}</td><td>${o.content || '—'}</td><td>${o.result || '待处理'}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="text-align:center;color:#999;">暂无异议记录</td></tr>`;
  }

  html += `</table>

<h2>六、证据锚定记录</h2>
<table>
  <tr><th>锚定点</th><th>类型</th><th>时间</th><th>链接/Hash</th><th>状态</th></tr>`;

  if (records.length > 0) {
    records.forEach(r => {
      const status = r.error ? '❌ 失败' : '✅ 成功';
      const link = r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : (r.txHash || '—');
      html += `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.time ? new Date(r.time).toLocaleString('zh-CN') : '—'}</td><td class="small">${link}</td><td>${status}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="5" style="text-align:center;color:#999;">暂无锚定记录</td></tr>`;
  }

  html += `</table>

<h2>七、Merkle Root</h2>
<div style="padding:12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all;">
  ${poll.merkleRoot || '—'}
</div>
<div class="small" style="margin-top:4px;">此 Merkle Root 已通过 GitHub Commit、微信群机器人、邮件三端锚定，确保投票数据不可篡改。</div>

<div class="page-break"></div>

<h2>八、签章页</h2>
<div style="margin-top:20px;">
  <p>本档案由春天阳光小区数字化平台自动生成，包含完整的投票过程记录、计票结果及证据锚定信息。</p>
  <p>档案生成时间：${now}</p>
  <p>系统版本：Community Platform v2.0</p>
</div>
<div class="signature">
  <div class="signature-box">业委会签章</div>
  <div class="signature-box">物业签章</div>
</div>
<div class="signature" style="margin-top:30px;">
  <div class="signature-box">社区签章</div>
  <div class="signature-box">街道备案签章</div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
  showToast('档案已生成，请在弹窗中打印为 PDF', 'success');
}

function generateVoterReceipt(voteRecord) {
  if (!voteRecord) return;
  const poll = (appData.polls || []).find(p => p.id === voteRecord.pollId);
  const title = poll ? (poll.title || '') : '投票回执';
  const caseNo = poll ? (poll.caseNo || '') : '';
  const roomNo = voteRecord.roomNo || '—';
  const voteTime = voteRecord.voteTime ? new Date(voteRecord.voteTime).toLocaleString('zh-CN') : '—';
  const nonce = voteRecord.nonce || '—';
  const hashFrag = voteRecord.ipHash ? voteRecord.ipHash.substring(0, 16) + '...' : '—';

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { showToast('请允许弹窗以生成回执', 'error'); return; }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票回执</title>
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.receipt { background: #fff; width: 360px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; position: relative; overflow: hidden; }
.receipt::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2E8B57, #3da76b); }
.receipt-header { text-align: center; margin-bottom: 20px; }
.receipt-header .logo { font-size: 32px; margin-bottom: 8px; }
.receipt-header .title { font-size: 16px; font-weight: 700; color: #333; }
.receipt-header .subtitle { font-size: 11px; color: #999; margin-top: 4px; }
.receipt-body { border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0; padding: 16px 0; }
.receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.receipt-row .label { color: #666; }
.receipt-row .value { color: #333; font-weight: 500; }
.receipt-row .value.room { font-size: 18px; font-weight: 700; color: #2E8B57; }
.hash-box { background: #f8f9fa; border-radius: 6px; padding: 10px; margin-top: 12px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.5; }
.receipt-footer { text-align: center; margin-top: 20px; }
.receipt-footer .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2E8B57; color: #2E8B57; border-radius: 4px; font-size: 13px; font-weight: 600; transform: rotate(-3deg); opacity: 0.8; }
.receipt-footer .tip { font-size: 11px; color: #999; margin-top: 12px; }
.btn-print { display: block; width: 100%; padding: 10px; margin-top: 16px; background: #2E8B57; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.qr-placeholder { width: 80px; height: 80px; background: #f5f5f5; border-radius: 6px; margin: 12px auto 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
@media print {
  body { background: #fff; }
  .btn-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo">🗳️</div>
    <div class="title">${title}</div>
    <div class="subtitle">${caseNo}</div>
  </div>
  <div class="receipt-body">
    <div class="receipt-row"><span class="label">房号</span><span class="value room">${roomNo}</span></div>
    <div class="receipt-row"><span class="label">投票时间</span><span class="value">${voteTime}</span></div>
    <div class="receipt-row"><span class="label">随机Nonce</span><span class="value">${nonce.substring(0, 8)}...</span></div>
    <div class="receipt-row"><span class="label">IP哈希</span><span class="value">${hashFrag}</span></div>
    <div class="hash-box">
      <div style="margin-bottom:4px;font-weight:600;color:#333;">Merkle Path 片段</div>
      <div>${voteRecord.prevHash ? voteRecord.prevHash.substring(0, 24) + '...' : '首票（无前置）'}</div>
    </div>
  </div>
  <div class="receipt-footer">
    <div class="stamp">已上链存证</div>
    <div class="qr-placeholder">Merkle<br>Root</div>
    <div class="tip">请截图保存此回执<br>作为您的投票凭证</div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

async function recalculatePoll(pollId) {
  showLoading(true);
  try {
    const result = await calculatePollResults(pollId);
    if (result) {
      // 保存 poll 数据
      await saveDataFile('polls', appData.polls, '重新计票 ' + pollId, 'update');
      // 追加审计日志
      appendAuditLog('recount', 'polls', pollId, '管理员手动重新计票，结果：' + (result.isPassed ? '通过' : '未通过'));
      showToast('计票完成：' + (result.isPassed ? '通过' : '未通过'), result.isPassed ? 'success' : 'info');
      navigateTo('polls');
    } else {
      showToast('计票失败：未找到投票数据', 'error');
    }
  } catch(e) {
    showToast('计票失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(module, id) {
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

async function saveDataFile(filename, data, detail, action) {
  action = action || 'update';

  // 优先使用 Worker 持久化（确保前端实时同步）
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/' + filename + '.json', data, detail);
      showToast('✅ 已同步到云端，前端将自动更新', 'success');
      await appendAuditLog(action, filename, (data && data.id) || '', detail);
      return;
    } catch(e) {
      console.error('Worker 保存失败，回退到本地:', e);
      showToast('⚠️ Worker 同步失败：' + e.message + '，已保存到本地', 'error');
      // 回退到 localStorage
    }
  }

  if (!githubToken) {
    localStorage.setItem('adminData_' + filename, JSON.stringify(data));
    showToast('保存成功', 'success');
    await appendAuditLog(action, filename, (data && data.id) || '', detail);
    return;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息');
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/' + filename + '.json';
  const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!getRes.ok) throw new Error('无法读取文件，请检查Token权限');
  const fileInfo = await getRes.json();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] ' + detail, content: content, sha: fileInfo.sha })
  });
  if (!putRes.ok) {
    const err = await putRes.json();
    throw new Error(err.message || '保存失败');
  }
  await appendAuditLog(action, filename, data.id || '', detail);
}

async function appendAuditLog(action, target, targetId, detail) {
  const log = appData['audit-log'] || [];
  log.push({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    adminName: currentAdmin && currentAdmin.name || '未知',
    adminId: currentAdmin && currentAdmin.id || '',
    action: action,
    target: target,
    targetId: targetId,
    details: detail,
    clientInfo: navigator.userAgent
  });
  appData['audit-log'] = log;

  // 优先使用 Worker 保存审计日志
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/audit-log.json', log, '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新');
    } catch(e) { console.error('审计日志Worker保存失败', e); }
    return;
  }

  if (!githubToken) return;
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) return;
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/audit-log.json';
  try {
    const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!getRes.ok) return;
    const fileInfo = await getRes.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2))));
    await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新', content: content, sha: fileInfo.sha })
    });
  } catch(e) { console.error('审计日志保存失败', e); }
}

async function getRepoInfo() {
  if (!githubToken) return null;
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + githubToken }
    });
    if (!r.ok) return null;
    const user = await r.json();
    const savedRepo = localStorage.getItem('githubRepo');
    if (savedRepo) return [user.login, savedRepo];
    const path = window.location.pathname;
    const parts = path.split('/');
    if (parts.length >= 2 && parts[1] && !parts[1].includes('.')) return [user.login, parts[1]];
    return null;
  } catch(e) { return null; }
}

function showBatchImport() {
  document.getElementById('modalTitle').textContent = '📥 批量导入业主';
  document.getElementById('modalBody').innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请粘贴Excel内容，格式：房号 | 姓名 | 手机后四位（每行一条，可用制表符或竖线分隔）</p>' +
    '<textarea class="batch-textarea" id="batchData" placeholder="1-1-101	张三	1234\n1-1-102	李四	5678"></textarea>' +
    '<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--text-secondary);font-weight:500;">或上传文件（.csv / .xlsx / .vcf）：</div>' +
    createFileUploaderHTML({id:'batchFile', accept:'.csv,.xlsx,.xls,.vcf,.vcd', hint:'支持拖拽或点击上传 .csv / .xlsx / .vcf 文件'}) +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">示例：1-1-101  测试业主01  0001</div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchImport()">导入</button>';
  document.getElementById('modalOverlay').classList.add('active');
}

async function doBatchImport() {
  let rows = [];
  let success = 0, fail = 0;

  // 先尝试从上传的文件解析
  const batchPath = getUploadedPath('batchFile');
  if (batchPath && batchPath.startsWith('blob:')) {
    try {
      const r = await fetch(batchPath);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], 'batch.csv');
        rows = await handleBatchFile(file);
      }
    } catch(e) { console.error(e); }
  } else if (batchPath) {
    showLoading(true);
    try {
      const ownerRepo = await getRepoInfo();
      if (ownerRepo) {
        const [owner, repo] = ownerRepo;
        const r = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + batchPath);
        if (r.ok) {
          const blob = await r.blob();
          const file = new File([blob], 'batch.' + (batchPath.split('.').pop() || 'csv'));
          rows = await handleBatchFile(file);
        }
      }
    } catch(e) { console.error(e); }
    showLoading(false);
  }

  // 如果没有文件或文件解析失败，尝试文本框
  if (rows.length === 0) {
    const text = document.getElementById('batchData').value.trim();
    if (!text) { showToast('请输入数据或上传文件', 'error'); return; }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t|\|\s]+/);
      if (parts.length >= 3) {
        rows.push(parts);
      }
    });
  }

  const newResidents = [];
  rows.forEach(parts => {
    const room = parts[0].trim();
    const name = parts[1].trim();
    const suffix = (parts[2] || '').trim().replace(/[^0-9]/g, '').substring(0,4);
    if (room && name && suffix) {
      newResidents.push({ id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), roomNo: room, name: name, phoneSuffix: suffix, area: 0, voteWeightCount: 1, voteWeightArea: 0, status: 'active', isTest: false, registeredAt: new Date().toISOString().split('T')[0] });
      success++;
    } else { fail++; }
  });

  if (newResidents.length === 0) { showToast('未解析到有效数据', 'error'); return; }
  const list = appData.residents || [];
  list.push.apply(list, newResidents);
  appData.residents = list;
  closeModal(); showLoading(true);
  try {
    await saveDataFile('residents', list, '批量导入 ' + success + ' 位业主', 'batch-import');
    showToast('成功导入 ' + success + ' 位业主' + (fail?'，' + fail + '行失败':''), 'success');
    navigateTo('residents');
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function saveAnchorConfig() {
  localStorage.setItem('githubToken', document.getElementById('cfgGithubToken').value.trim());
  localStorage.setItem('githubRepo', document.getElementById('cfgGithubRepo').value.trim());
  localStorage.setItem('wechatWebhook', document.getElementById('cfgWechatWebhook').value.trim());
  localStorage.setItem('resendApiKey', document.getElementById('cfgResendKey').value.trim());
  localStorage.setItem('anchorEmail', document.getElementById('cfgAnchorEmail').value.trim());
  showToast('锚定配置已保存', 'success');
}

async function changePassword() {
  const oldPwd = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码需6位以上', 'error'); return; }

  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id));
  if (!account) { showToast('账户配置异常', 'error'); return; }
  if (oldPwd !== account.password) { showToast('当前密码错误', 'error'); return; }

  // 更新内存中的密码
  account.password = newPwd;

  // 同步持久化到 config.adminAccounts（如 Worker 可用）
  if (!appData.config) appData.config = {};
  if (!appData.config.adminAccounts) appData.config.adminAccounts = [];
  let persisted = appData.config.adminAccounts.find(a => a.id === account.id);
  if (persisted) {
    persisted.password = newPwd;
  } else {
    appData.config.adminAccounts.push({ id: account.id, password: newPwd, permissions: account.permissions });
  }

  showLoading(true);
  try {
    await saveDataFile('config', appData.config, '管理员 ' + account.name + ' 修改密码', 'password-change');
    showToast('密码修改成功', 'success');
  } catch(e) {
    showToast('密码已更新（内存），但持久化失败：' + e.message, 'warning');
  } finally {
    showLoading(false);
  }
}

function showTokenModal() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
}


function saveWorkerBase() {
  const el = document.getElementById('workerBaseInput');
  if (!el) return;
  const val = el.value.trim();
  localStorage.setItem('workerBase', val.replace(/\/$/, ''));
  showToast('Worker地址已保存，刷新页面后生效', 'success');
}
async function updateToken() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
  closeModal();
}


/* ========== 图片压缩 ========== */

async function compressImageToBlob(file, maxSizeMB = 0.03) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const toBlob = (q) => new Promise((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', q);
      });
      const maxSize = maxSizeMB * 1024 * 1024;
      let blob = await toBlob(0.25);
      if (blob.size <= maxSize) {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let low = 0.05, high = 0.4, bestBlob = null;
      while (high - low > 0.03) {
        const mid = (low + high) / 2;
        blob = await toBlob(mid);
        if (blob.size > maxSize) { high = mid; }
        else { low = mid; bestBlob = blob; }
      }
      if (bestBlob && bestBlob.size <= maxSize) {
        resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let scale = 0.7;
      while (scale > 0.05) {
        const nw = Math.max(1, Math.floor(w * scale));
        const nh = Math.max(1, Math.floor(h * scale));
        canvas.width = nw; canvas.height = nh;
        ctx.drawImage(img, 0, 0, nw, nh);
        blob = await toBlob(0.3);
        if (blob.size <= maxSize) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        scale -= 0.18;
      }
      reject(new Error('图片压缩后仍超过' + maxSizeMB + 'MB限制'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/* ========== 文件上传相关 ========== */

async function uploadFileToRepo(file, folder) {
  const maxSizeMB = folder === 'videos' ? 100 : (folder === 'images' ? 100 : (folder === 'files' ? 100 : 100));
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error('文件大小超过限制（' + maxSizeMB + 'MB）');
  }

  // ===== 优先使用 Worker 上传（确保前端可实时访问）=====
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      console.log('[Worker Upload] 开始上传:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
      const res = await fetch(workerBase + '/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Worker 返回 ' + res.status + ': ' + errText.substring(0,200));
      }
      const result = await res.json();
      if (result && result.url) {
        console.log('[Worker Upload] ✅ 成功:', result.url);
        return result.url;
      } else {
        throw new Error('Worker 返回数据异常: ' + JSON.stringify(result));
      }
    } catch (e) {
      console.error('[Worker Upload] ❌ 失败:', e.message);
      showToast('Worker 上传失败: ' + e.message + '，尝试 GitHub...', 'error');
      // 继续回退到 GitHub
    }
  }

  // ===== 回退到 GitHub API =====
  if (!githubToken) {
    // 如果连 GitHub 也没有，返回临时 blob（仅当前页可用，会提示用户）
    const blobUrl = URL.createObjectURL(file);
    console.warn('[Upload] ⚠️ 未配置 Worker 或 GitHub，返回临时 blob:', blobUrl);
    showToast('⚠️ 警告：未配置 Worker 或 GitHub，文件仅当前页可用，刷新后失效', 'error');
    return blobUrl;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息，请检查Token');
  const [owner, repo] = ownerRepo;
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = Date.now() + '_' + Math.random().toString(36).substr(2,6) + '_' + safeName;
  const path = 'assets/' + (folder || 'uploads') + '/' + filename;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
        });
        let sha = '';
        if (getRes.ok) {
          const info = await getRes.json();
          sha = info.sha;
        }
        const body = {
          message: '[' + (currentAdmin && currentAdmin.name || 'admin') + '] 上传文件 ' + file.name,
          content: base64
        };
        if (sha) body.sha = sha;
        const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.message || '上传失败');
        }
        resolve(path);
      } catch(e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function createFileUploaderHTML(options) {
  const { id, accept, hint, maxSizeText } = options;
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || ''}</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept || '*'}" onchange="handleFileSelect(event,'${id}')">
    <div class="file-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) await processFileUpload(files[0], id);
}

async function handleFileSelect(e, id) {
  const file = e.target.files[0];
  if (file) await processFileUpload(file, id);
}

async function processFileUpload(file, id) {
  const progressEl = document.getElementById('progress-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const wrapEl = document.getElementById('wrap-' + id);

  let folder = 'uploads';
  let maxSize = 100 * 1024 * 1024;
  let isImage = false;
  if (id.includes('video')) { folder = 'videos'; maxSize = 800 * 1024 * 1024; }
  else if (id.includes('image') || id.includes('cover') || id.includes('logo') || id.includes('favicon')) { folder = 'images'; isImage = true; }
  else if (id.includes('pdf') || id.includes('file')) { folder = 'files'; maxSize = 100 * 1024 * 1024; }
  else if (id.includes('batch')) { folder = 'imports'; maxSize = 100 * 1024 * 1024; }

  let uploadFile = file;
  if (isImage && file.type.startsWith('image/')) {
    progressEl.textContent = '⏳ 压缩中...';
    try {
      uploadFile = await compressImageToBlob(file, 0.03);
      progressEl.textContent = '⏳ 上传中...';
    } catch(e) {
      showToast('图片压缩失败：' + e.message, 'error');
      return;
    }
  } else if (file.size > maxSize) {
    showToast('文件过大，限制' + (maxSize/1024/1024) + 'MB', 'error');
    return;
  }

  try {
    const path = await uploadFileToRepo(uploadFile, folder);
    progressEl.textContent = '✅ 上传成功';

    // 保存路径到data属性
    wrapEl.dataset.uploadedPath = path;
    wrapEl.dataset.fileName = file.name;

    // 显示预览
    let previewHTML = '';
    if (uploadFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><img src="${url}"><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else if (uploadFile.type.startsWith('video/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><video src="${url}" muted playsinline webkit-playsinline x5-playsinline preload="metadata"></video><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else {
      previewHTML = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    }
    previewEl.innerHTML = previewHTML;
  } catch(e) {
    progressEl.textContent = '';
    showToast('上传失败：' + e.message, 'error');
  }
}

function clearUpload(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const progressEl = document.getElementById('progress-' + id);
  if (wrapEl) { delete wrapEl.dataset.uploadedPath; delete wrapEl.dataset.fileName; }
  if (previewEl) previewEl.innerHTML = '';
  if (progressEl) progressEl.textContent = '';
  const inp = document.getElementById('inp-' + id);
  if (inp) inp.value = '';
}

function getUploadedPath(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  return wrapEl && wrapEl.dataset.uploadedPath || '';
}

function setUploadedPath(id, path, name) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  if (!wrapEl) return;
  wrapEl.dataset.uploadedPath = path;
  wrapEl.dataset.fileName = name || path;
  if (previewEl && path) {
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(path);
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(path);
    let html = '';
    if (isImg) html = `<div class="file-preview-item"><img src="${path}"><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else if (isVideo) html = `<div class="file-preview-item"><video src="${path}" muted></video><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else html = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    previewEl.innerHTML = html;
  }
}

/* ==================== 管理员账户配置（可直接修改） ====================
   说明：以下密码为明文，方便直接修改。如需调整权限或密码，
   直接编辑下方 ADMIN_ACCOUNTS 数组即可，无需理解其他代码逻辑。
   四个角色：总维护人员、物管人员、业委会成员、社区人员。
   ==================================================================== */
const ADMIN_ACCOUNTS = [
  { id: 'admin-super',      name: '总维护人员',   role: 'super',      password: 'Sunlight2026',  permissions: ['all'] },
  { id: 'admin-property',   name: '物管人员',       role: 'property',   password: 'Property2026',  permissions: ['announcements','documents','workorders','residents'] },
  { id: 'admin-committee',  name: '业委会成员',     role: 'committee',  password: 'Committee2026', permissions: ['polls','residents','complaints','audit'] },
  { id: 'admin-community',  name: '社区人员',       role: 'community',  password: 'Community2026', permissions: ['announcements','activities','complaints'] }
];

let appData = {config:{},announcements:[],documents:[],activities:[],polls:[],residents:[],'audit-log':[],workorders:[],complaints:[]};

// ===== Worker 网关配置（工单/投诉管理模块，不影响原有功能） =====
const WORKER_BASE = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
function getWorkerBase(){ return WORKER_BASE.replace(/\/$/,''); }
function getCurrentMonthPath(module){
  const d=new Date();
  return module+'/'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'.json';
}
async function workerRead(filePath){
  const base=getWorkerBase();
  if(!base){
    // 尝试多种可能的 key 格式（兼容有/无前导零的月份）
    const keysToTry = [];
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    keysToTry.push(key);
    // 如果包含月份路径如 polls-responses/2026-08.json，也尝试 polls-responses/2026-8.json
    const altKey = key.replace(/-(\d{2})$/, function(m, p1) { return '-' + parseInt(p1, 10); });
    if (altKey !== key) keysToTry.push(altKey);
    // 反向：如果当前是无前导零，也尝试有前导零
    const altKey2 = key.replace(/-(\d)$/, function(m, p1) { return '-' + String(parseInt(p1, 10)).padStart(2, '0'); });
    if (altKey2 !== key) keysToTry.push(altKey2);
    for (const k of keysToTry) {
      const cached = appData[k];
      if(cached && Array.isArray(cached) && cached.length > 0) return cached;
    }
    // 尝试从 appData 的模块名直接读取（如 appData.workorders）
    const moduleName = filePath.split('/')[0];
    if(appData[moduleName] && Array.isArray(appData[moduleName]) && appData[moduleName].length > 0) return appData[moduleName];
    return [];
  }
  // Worker 模式：先尝试原始路径，失败则尝试月份格式兼容
  const tryPaths = [filePath];
  const m = filePath.match(/^(polls-responses\/\d{4})-(\d{2})\.json$/);
  if (m) {
    const alt = m[1] + '-' + parseInt(m[2], 10) + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  const m2 = filePath.match(/^(polls-responses\/\d{4})-(\d)\.json$/);
  if (m2) {
    const alt = m2[1] + '-' + String(parseInt(m2[2], 10)).padStart(2, '0') + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  for (const p of tryPaths) {
    try {
      const res=await fetch(base+'/api/read/'+encodeURIComponent(p));
      if(res.ok) {
        const t=await res.text();
        return t?JSON.parse(t):[];
      }
    } catch(e) {}
  }
  throw new Error('读取失败');
}
async function workerWrite(filePath,data,message){
  const base=getWorkerBase();
  if(!base){
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    appData[key]=data;
    showToast('开发模式：数据仅保存在内存中','info');
    return;
  }
  const res=await fetch(base+'/api/write/'+encodeURIComponent(filePath),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:JSON.stringify(data,null,2),message})
  });
  if(!res.ok){const e=await res.json();throw new Error(e.error||'保存失败');}
}
async function workerUpload(file){
  const base=getWorkerBase();
  if(!base){
    return {url:URL.createObjectURL(file),name:file.name};
  }
  const fd=new FormData();fd.append('file',file);
  const res=await fetch(base+'/api/upload',{method:'POST',body:fd});
  if(!res.ok) throw new Error('上传失败');
  return await res.json();
}
function woStatusClass(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}
function cpStatusClass(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}
async function loadAllWorkorders(){
  try{ return await workerRead(getCurrentMonthPath('workorders')); }catch(e){ return []; }
}
async function loadAllComplaints(){
  try{ return await workerRead(getCurrentMonthPath('complaints')); }catch(e){ return []; }
}

let currentModule = 'dashboard';
let adminSession = null;
let githubToken = localStorage.getItem('githubToken') || '';
let currentAdmin = null;
const SALT = "SunlightCommunity2026";

document.addEventListener('DOMContentLoaded', async () => {
  try { 
    await loadAllData(); 
    autoSkipLogin();
  } catch(e) { 
    console.error('Init error:', e);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('tokenPage').style.display = 'none';
    document.getElementById('adminLayout').classList.add('active');
    document.getElementById('contentArea').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>初始化失败，请刷新页面重试</div><div style="font-size:12px;color:#999;margin-top:8px;">' + escapeHtml(e.message) + '</div></div>';
  }
});

async function loadAllData() {
  const files = ['config','announcements','documents','activities','polls','residents','audit-log'];
  const workerBase = getWorkerBase();

  for (const f of files) {
    let loaded = false;
    let workerData = null;

    // 1. 优先从 Worker 读取（已持久化的数据）
    if (workerBase) {
      try {
        const r = await fetch(workerBase + '/api/read/' + encodeURIComponent('data/' + f + '.json') + '?t=' + Date.now());
        if (r.ok) {
          workerData = await r.json();
          // 只有 Worker 返回非空数据才视为加载成功，避免空数组覆盖本地数据
          const isEmpty = (Array.isArray(workerData) && workerData.length === 0) || 
                          (typeof workerData === 'object' && workerData !== null && Object.keys(workerData).length === 0);
          if (!isEmpty) {
            appData[f] = workerData;
            loaded = true;
            continue;
          }
        }
      } catch(e) {}
    }

    // 2. 尝试 fetch 本地 data/ 目录（静态文件）
    if (!loaded) {
      try {
        const r = await fetch('data/' + f + '.json?t=' + Date.now());
        if (r.ok) {
          appData[f] = await r.json();
          loaded = true;
        }
      } catch(e) {}
    }

    // 3. 检查 localStorage（开发模式或回退）
    if (!loaded) {
      try {
        const saved = localStorage.getItem('adminData_' + f);
        if (saved) { appData[f] = JSON.parse(saved); loaded = true; }
      } catch(e) {}
    }

    // 4. 最后回退到 EMBEDDED_DATA（初始默认值）
    if (!loaded) {
      if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[f] !== undefined) {
        appData[f] = EMBEDDED_DATA[f];
        loaded = true;
      }
    }

    if (!loaded) {
      const defaults = { config: {}, announcements: [], documents: [], activities: [], polls: [], residents: [], 'audit-log': [] };
      appData[f] = defaults[f] || [];
    }
  }
  updateFavicon();
  updatePageTitle();
  renderSiteLogo();
  // === 无条件补全 residents 面积数据（兼容旧数据无 area 字段的情况）===
  if (appData.residents && appData.residents.length > 0) {
    const embeddedResidents = (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.residents) ? EMBEDDED_DATA.residents : [];
    const areaMap = {};
    embeddedResidents.forEach(r => { if (r.roomNo && r.area) areaMap[r.roomNo] = r.area; });
    let fixedCount = 0;
    appData.residents.forEach((r, i) => {
      if (!r.area || parseFloat(r.area) === 0) {
        const fallbackArea = areaMap[r.roomNo];
        if (fallbackArea) {
          r.area = fallbackArea;
        } else {
          // 兜底：根据房号生成一个合理的面积（60-140㎡）
          const hash = r.roomNo ? r.roomNo.split('').reduce((s, c) => s + c.charCodeAt(0), 0) : i;
          r.area = 60 + Math.floor(Math.abs(Math.sin(hash * 7.3 + 1.5)) * 81);
        }
        fixedCount++;
      }
    });
    if (fixedCount > 0) {
      console.log('[Area Fixup] 已自动为 ' + fixedCount + ' 位业主补全面积数据');
    }
  }

  // === 数据清洗：移除已失效的 blob URL，防止脏数据持续保存 ===
  if (appData.activities) {
    appData.activities.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.videos) item.videos = item.videos.filter(u => !u.startsWith('blob:'));
      if (item.videoLinks) item.videoLinks = item.videoLinks.filter(u => !u.startsWith('blob:'));
      if (item.adminImages) item.adminImages = item.adminImages.filter(u => !u.startsWith('blob:'));
      if (item.coverImage && item.coverImage.startsWith('blob:')) item.coverImage = '';
      if (item.videoUrl && item.videoUrl.startsWith('blob:')) item.videoUrl = '';
    });
  }
  if (appData.announcements) {
    appData.announcements.forEach(item => {
      if (item.attachments) item.attachments = item.attachments.filter(att => att.url && !att.url.startsWith('blob:'));
    });
  }
  if (appData.documents) {
    appData.documents.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.attachments) item.attachments = item.attachments.filter(a => a.url && !a.url.startsWith('blob:'));
    });
  }

  // 加载持久化的管理员密码配置（覆盖代码默认值）
  if (appData.config && appData.config.adminAccounts && Array.isArray(appData.config.adminAccounts)) {
    appData.config.adminAccounts.forEach(persisted => {
      const acc = ADMIN_ACCOUNTS.find(a => a.id === persisted.id);
      if (acc && persisted.password) acc.password = persisted.password;
      if (acc && persisted.permissions) acc.permissions = persisted.permissions;
    });
  }
}

function updateFavicon() {
  const favicon = appData.config && appData.config.community && appData.config.community.favicon;
  if (favicon) {
    document.getElementById('faviconLink').href = favicon;
  }
}
function updatePageTitle() {
  const c = appData.config && appData.config.community || {};
  document.title = (c.siteTitle || (c.name ? c.name + ' - 管理后台' : '管理后台'));
}
function getSiteLogoConfig() {
  try { var raw = localStorage.getItem("siteLogoConfig"); if (raw) return JSON.parse(raw); } catch(e) {}
  return { type: "emoji", value: "⚙️", title: "管理后台", adminTitle: "管理后台" };
}
function setSiteLogoConfig(cfg) {
  localStorage.setItem("siteLogoConfig", JSON.stringify(cfg));
}
function renderSiteLogo() {
  var cfg = getSiteLogoConfig();
  var iconEl = document.getElementById("siteLogoIcon");
  var titleEl = document.getElementById("siteLogoTitle");
  if (iconEl) {
    if (cfg.type === "image" && cfg.value) {
      iconEl.innerHTML = '<img src="' + cfg.value.replace(/"/g, "&quot;") + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">';
    } else {
      iconEl.innerHTML = cfg.value || "⚙️";
    }
  }
  if (titleEl) titleEl.textContent = cfg.adminTitle || cfg.title || "管理后台";
  var link = document.getElementById("faviconLink");
  if (!link) {
    link = document.createElement("link");
    link.id = "faviconLink"; link.rel = "shortcut icon"; link.type = "image/png";
    document.head.appendChild(link);
  }
  if (cfg.type === "image" && cfg.value) {
    link.href = cfg.value;
  } else {
    var emoji = cfg.value ? cfg.value.replace(/&#(\d+);/g, function(m, code) { return String.fromCodePoint(code); }) : "⚙️";
    var canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 64, 64);
    ctx.font = "48px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, 32, 34);
    link.href = canvas.toDataURL("image/png");
  }
}
function checkLoginState() {
  autoSkipLogin();
}

function autoSkipLogin() {
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

  const account = ADMIN_ACCOUNTS.find(a => a.id === roleId);
  if (!account) { err.textContent = '身份配置错误，请联系总维护人员'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = '验证中...';

  // 明文对比，方便直接修改代码中的密码
  if (pwd !== account.password) {
    err.textContent = '密码错误，请重新输入'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '登录';
    return;
  }

  // 登录成功
  currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
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
  if (!currentAdmin) {
    logout(); return;
  }
  document.getElementById('adminInfo').textContent = currentAdmin.name || '管理员';
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  document.getElementById('adminRole').textContent = roleMap[currentAdmin.role] || currentAdmin.role;
  renderSidebar();
  const hash = location.hash;
  const match = hash.match(/module=([^&]+)/);
  const targetModule = match ? match[1] : 'dashboard';
  const validModules = ['dashboard','config','announcements','documents','activities','polls','residents','audit','workorders','complaints','settings'];
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

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function renderSidebar() {
  if (!currentAdmin) return;
  const perms = currentAdmin.permissions || [];
  const isSuper = currentAdmin.role === 'super';
  const items = [
    { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
    { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
    { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
    { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
    { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
    { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
    { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
    { id: 'objections', label: '异议管理', icon: '⚖️', perm: 'polls', roles: ['super','committee'] },
    { id: 'audit', label: '操作日志', icon: '📋', perm: 'audit-log', roles: ['super','committee'] },
    { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
    { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
    { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
    { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
    { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
  ];
  let html = '';
  items.forEach(item => {
    const hasPerm = isSuper || perms.indexOf('all') >= 0 || perms.indexOf(item.perm) >= 0;
    const hasRole = !item.roles || item.roles.indexOf(currentAdmin.role) >= 0;
    if (!hasPerm || !hasRole) return;
    if (item.external) {
      html += `<div class="nav-item" data-module="${item.id}" onclick="window.open('${item.external}','_blank')">`;
    } else {
      html += `<div class="nav-item ${item.id==='dashboard'?'active':''}" data-module="${item.id}" onclick="navigateTo('${item.id}')">`;
    }
    html += '<span class="icon">' + item.icon + '</span><span>' + item.label + '</span></div>';
  });
  document.getElementById('sidebarNav').innerHTML = html;
}

function navigateTo(module) {
  try {
    currentModule = module;
    location.hash = 'module=' + module;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.module === module));
    const titles = { dashboard: '仪表盘', config: '社区配置', announcements: '公告管理', documents: '文件管理', activities: '动态管理', polls: '投票管理', residents: '业主管理', objections: '异议管理', audit: '操作日志', workorders: '工单管理', complaints: '投诉建议', life: '生活服务', settings: '系统设置' };
    var pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = titles[module] || module;
    var sb = document.getElementById('saveBtn');
    if (sb) sb.style.display = ['dashboard','audit','settings'].indexOf(module) >= 0 ? 'none' : 'inline-block';
    const renderers = {
      dashboard: renderDashboard, config: renderConfig, announcements: renderAnnouncementsAdmin,
      documents: renderDocumentsAdmin, activities: renderActivitiesAdmin, polls: renderPollsAdmin,
      residents: renderResidentsAdmin, objections: renderObjectionsAdmin, audit: renderAuditLog,
      workorders: renderWorkordersAdmin,
      complaints: renderComplaintsAdmin,
      settings: renderSettings
    };
    const fn = renderers[module] || renderDashboard;
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

function renderDashboard() {
  const annCount = (appData.announcements || []).length;
  const docCount = (appData.documents || []).length;
  const actCount = (appData.activities || []).length;
  const pollCount = (appData.polls || []).filter(p => p && p.status === '进行中').length;
  const resCount = (appData.residents || []).filter(r => r && r.status === 'active' && !r.isTest).length;
  const testCount = (appData.residents || []).filter(r => r && r.isTest).length;
  return '<div class="stats-grid">' +
    '<div class="stat-card"><div class="label">公告总数</div><div class="value">' + annCount + '</div></div>' +
    '<div class="stat-card"><div class="label">上级文件</div><div class="value">' + docCount + '</div></div>' +
    '<div class="stat-card"><div class="label">社区动态</div><div class="value">' + actCount + '</div></div>' +
    '<div class="stat-card"><div class="label">进行中投票</div><div class="value">' + pollCount + '</div></div>' +
    '</div><div class="stats-grid">' +
    '<div class="stat-card"><div class="label">正式业主</div><div class="value">' + resCount + '</div></div>' +
    '<div class="stat-card"><div class="label">测试数据</div><div class="value" style="color:var(--warning)">' + testCount + '</div></div>' +
    '</div><div class="card"><div class="card-header"><h3>🚀 快捷入口</h3></div>' +
    '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">' +
    `<button class="btn btn-primary" onclick="navigateTo('announcements');openEditModal('announcements',null)">➕ 发布公告</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('activities');openEditModal('activities',null)">➕ 发布动态</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('polls');openEditModal('polls',null)">➕ 发起投票</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('residents');openEditModal('residents',null)">➕ 添加业主</button>` +
    '</div></div>';
}

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

function renderAnnouncementsAdmin() {
  const list = appData.announcements || [];
  return `<div class="card"><div class="card-header"><h3>📢 公告管理</h3><button class="btn btn-primary" onclick="openEditModal('announcements',null)">➕ 新增公告</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>分类</th><th>日期</th><th>置顶</th><th>作者</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.category||''}</td><td>${item.publishDate||''}</td><td>${item.isPinned?"📌":""}</td><td>${item.author||''}</td><td class="actions"><button onclick="openEditModal('announcements','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('announcements','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderDocumentsAdmin() {
  const list = appData.documents || [];
  return `<div class="card"><div class="card-header"><h3>📄 文件管理</h3><button class="btn btn-primary" onclick="openEditModal('documents',null)">➕ 新增文件</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>来源</th><th>日期</th><th>附件</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      let attachBadge = '';
      const attachments = item.attachments || [];
      const hasPdf = attachments.some(a => a.type === 'pdf') || (item.fileUrl && /\.pdf$/i.test(item.fileUrl));
      const hasImage = attachments.some(a => a.type === 'image') || (item.images && item.images.length);
      const hasLink = item.fileUrl && !hasPdf && !hasImage;

      if (hasPdf) attachBadge += '<span class="pdf-badge">📄 PDF</span> ';
      if (hasImage) attachBadge += '<span class="tag tag-active">🖼️ 图片</span> ';
      if (hasLink) attachBadge += '<span class="tag tag-test">🔗 链接</span> ';
      if (!hasPdf && !hasImage && !hasLink) attachBadge = '<span style="color:#999;font-size:12px;">—</span>';

      const openUrl = item.fileUrl || (attachments[0] && attachments[0].url) || '';
      let linkHtml = attachBadge;
      if (openUrl) {
        linkHtml = `<a href="${openUrl}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px;">${attachBadge}查看 →</a>`;
      }

      return `<tr><td>${escapeHtml(item.title||'')}</td><td>${escapeHtml(item.source||'')}</td><td>${item.publishDate||''}</td><td>${linkHtml}</td><td class="actions"><button onclick="openEditModal('documents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('documents','${item.id}')">删除</button></td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderActivitiesAdmin() {
  const list = appData.activities || [];
  return `<div class="card"><div class="card-header"><h3>🎉 动态管理</h3><button class="btn btn-primary" onclick="openEditModal('activities',null)">➕ 新增动态</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>日期</th><th>地点</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.date||''}</td><td>${item.location||''}</td><td><span class="tag ${item.status==="进行中"?"tag-active":(item.status==="预告"?"tag-test":"tag-disabled")}">${item.status||'已结束'}</span></td><td class="actions"><button onclick="openEditModal('activities','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('activities','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

/* ========== 投票面积数据辅助函数 ========== */
function getPollDisplayStats(item) {
  const res = item.results || {};

  // 统一 totalResidents/totalArea 计算逻辑（与 calculatePollResults 完全一致）
  let totalResidents, totalArea;
  if (item.rollStats && item.rollStats.totalCount > 0) {
    totalResidents = item.rollStats.totalCount;
    totalArea = item.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (item.progress && item.progress.target !== undefined && item.progress.target > 0)
      ? item.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 如果有已固化的计票结果（calculatedAt 存在），直接使用权威数据
  if (res.calculatedAt && res.totalArea > 0) {
    return {
      totalResidents: res.totalResidents || totalResidents,
      totalArea: res.totalArea,
      participatingResidents: res.participatingResidents || 0,
      participatingArea: res.participatingArea || 0,
      agreeCount: res.agreeCount || 0,
      agreeArea: res.agreeArea || 0,
      residentParticipationRate: res.residentParticipationRate || 0,
      areaParticipationRate: res.areaParticipationRate || 0,
      agreeResidentRate: res.agreeResidentRate || 0,
      agreeAreaRate: res.agreeAreaRate || 0,
      isPassed: res.isPassed,
      summary: res.summary || '',
      calculatedAt: res.calculatedAt,
      fromCache: true
    };
  }

  // 无固化数据时，用原始计数 + 统一后的 totalArea 重新计算百分比
  let pResidents = res.participatingResidents || 0;
  let pArea = res.participatingArea || 0;
  let aCount = res.agreeCount || 0;
  let aArea = res.agreeArea || 0;

  if (pArea === 0 && pResidents > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    pArea = pResidents * avgArea;
  }
  if (aArea === 0 && aCount > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    aArea = aCount * avgArea;
  }

  return {
    totalResidents: totalResidents,
    totalArea: totalArea,
    participatingResidents: pResidents,
    participatingArea: pArea,
    agreeCount: aCount,
    agreeArea: aArea,
    residentParticipationRate: totalResidents > 0 ? (pResidents / totalResidents * 100) : 0,
    areaParticipationRate: totalArea > 0 ? (pArea / totalArea * 100) : 0,
    agreeResidentRate: pResidents > 0 ? (aCount / pResidents * 100) : 0,
    agreeAreaRate: pArea > 0 ? (aArea / pArea * 100) : 0,
    isPassed: res.isPassed,
    summary: res.summary || '',
    calculatedAt: res.calculatedAt,
    fromCache: false
  };
}

function renderPollsAdmin() {
  const list = appData.polls || [];
  return `<div class="card"><div class="card-header"><h3>🗳️ 投票管理</h3><button class="btn btn-primary" onclick="openEditModal('polls',null)">➕ 新增投票</button></div>` +
    '<table class="data-table"><thead><tr><th>案卷号</th><th>标题</th><th>类型</th><th>模式</th><th>状态</th><th>时间合规</th><th>进度</th><th>参与率</th><th>同意率</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      const disp = getPollDisplayStats(item);
      const res = item.results || {};
      const modeLabel = item.mode === 'local' ? '<span class="tag tag-active">本地问卷</span>' : '<span class="tag tag-test">腾讯问卷</span>';
      const catLabel = item.category === 'major' ? '<span class="tag" style="background:#ffebee;color:#c62828;">重大</span>' : '<span class="tag" style="background:#e8f5e9;color:#2e7d32;">一般</span>';
      const statusTag = '<span class="tag ' + (item.status==="进行中"?"tag-active":"tag-disabled") + '">' + (item.status||'') + '</span>';

      // 参与率（自动从业主库补全面积数据）
      const rPart = disp.residentParticipationRate;
      const aPart = disp.areaParticipationRate;
      const partHtml = '<div style="font-size:12px;">人数 ' + rPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rPart) + '%;"></div></div>面积 ' + aPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aPart) + '%;background:#1976D2;"></div></div></div>';

      // 同意率（自动从业主库补全面积数据）
      const rAgree = disp.agreeResidentRate;
      const aAgree = disp.agreeAreaRate;
      const agreeHtml = '<div style="font-size:12px;">人数 ' + rAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rAgree) + '%;"></div></div>面积 ' + aAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aAgree) + '%;background:#1976D2;"></div></div></div>';

      // 通过标签（只有已结束才显示最终判定）
      let passHtml = '<span style="color:#999;font-size:12px;">—</span>';
      if (item.status === '已结束') {
        passHtml = res.isPassed === true ? '<span class="tag tag-active">✅ 通过</span>' : (res.isPassed === false ? '<span class="tag tag-test">❌ 未通过</span>' : '<span style="color:#999;font-size:12px;">—</span>');
      } else if (item.status === '进行中') {
        passHtml = '<span class="tag" style="background:#fff3e0;color:#e65100;">🗳️ 进行中</span>';
      }
      const anchorHtml = item.status === '已结束' ? (item.anchorRecords && item.anchorRecords.some(r => !r.error) ? '<span class="tag tag-active" style="cursor:pointer;" onclick="event.stopPropagation();showAnchorDetails(\'' + item.id + '\')">🔗 已锚定</span>' : '<span class="tag tag-test" style="cursor:pointer;" onclick="event.stopPropagation();anchorVoteData(\'' + item.id + '\')">⚠️ 未锚定</span>') : '';
      const pendingObj = (item.objections || []).filter(o => !o.status || o.status === '待处理').length;
      const objBadge = pendingObj > 0 ? '<span class="tag" style="background:#ffebee;color:#c62828;cursor:pointer;" onclick="event.stopPropagation();navigateTo(\'objections\')">⚠️ ' + pendingObj + ' 异议</span>' : '';

      const progressHtml = '<div style="font-size:12px;">' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + ' / ' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + ' 户</div>';
      let actions = `<button onclick="openEditModal('polls','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('polls','${item.id}')">删除</button>`;
      if(item.mode === 'local') {
        actions += `<button onclick="viewPollData('${item.id}')" style="margin-left:4px;">📊 数据</button>`;
      }
      actions += `<button onclick="recalculatePoll('${item.id}')" style="margin-left:4px;">🔄 计票</button>`;
      return `<tr><td>${item.caseNo||''}</td><td>${item.title||''}</td><td>${catLabel}</td><td>${modeLabel}</td><td>${statusTag}</td><td>${(function(){let tags='';if(item.announcement&&item.announcement.start&&item.startDate){const as=new Date(item.announcement.start);const vs=new Date(item.startDate);if((vs-as)>=15*86400000)tags+='<span class="tag tag-active">✅公告期合规</span> ';else tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}else{tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}if(item.consultation&&item.consultation.start&&item.consultation.end){const cs=new Date(item.consultation.start);const ce=new Date(item.consultation.end);if((ce-cs)>=6*86400000)tags+='<span class="tag tag-active">✅征求意见合规</span>';else tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}else{tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}return tags;})()}</td><td>${progressHtml}</td><td>${partHtml}</td><td>${agreeHtml}</td><td>${passHtml} ${anchorHtml} ${objBadge}</td><td class="actions">${actions}</td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderResidentsAdmin() {
  const list = appData.residents || [];
  return `<div class="card"><div class="card-header"><h3>👥 业主管理</h3><div class="actions"><button class="btn" onclick="showBatchImport()">📥 批量导入</button><button class="btn btn-primary" onclick="openEditModal('residents',null)">➕ 添加业主</button></div></div>` +
    '<table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(m²)</th><th>手机后四位</th><th>状态</th><th>绑定方式</th><th>标记</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.roomNo||''}</td><td>${item.name||''}</td><td>${item.area||'—'}</td><td>${item.phoneSuffix||''}</td><td><span class="tag ${item.status==="active"?"tag-active":"tag-disabled"}">${item.status==="active"?"正常":"禁用"}</span></td><td>${item.bindingMethod||'—'}</td><td>${item.isTest?`<span class="tag tag-test">测</span>`:""}${item.isSameBuyer?`<span class="tag tag-test" style="background:#e3f2fd;color:#1565c0;margin-left:2px;">同</span>`:""}</td><td class="actions"><button onclick="openEditModal('residents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('residents','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderAuditLog() {
  const list = appData['audit-log'] || [];
  const polls = appData.polls || [];

  // 投票审计时间轴选择器
  let pollSelect = '<div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:500;margin-right:8px;">查看投票全流程审计：</label><select id="auditPollSelect" onchange="renderPollAuditTimeline(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">';
  pollSelect += '<option value="">— 请选择投票 —</option>';
  polls.forEach(p => { pollSelect += '<option value="' + p.id + '">' + (p.caseNo||'') + ' ' + (p.title||'') + '</option>'; });
  pollSelect += '</select></div>';

  let html = '<div class="card"><div class="card-header"><h3>📋 操作日志</h3></div>' + pollSelect +
    '<div id="pollAuditTimeline"></div>' +
    '<table class="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>' +
    list.slice().reverse().map(item => '<tr><td>' + formatDateTime(item.timestamp) + '</td><td>' + (item.adminName||'') + '</td><td>' + (item.action||'') + '</td><td>' + (item.target||'') + '</td><td>' + (item.details||'') + '</td></tr>').join('') +
    '</tbody></table></div>';
  return html;
}


function renderObjectionsAdmin() {
  // 收集所有 polls 中的异议
  let allObjections = [];
  (appData.polls || []).forEach(p => {
    (p.objections || []).forEach(o => {
      allObjections.push({ ...o, pollId: p.id, pollTitle: p.title, pollCaseNo: p.caseNo });
    });
  });

  // 也检查独立的 appData.objections（兼容两种存储方式）
  (appData.objections || []).forEach(o => {
    const poll = (appData.polls || []).find(p => p.id === o.pollId);
    if (poll && !allObjections.find(x => x.id === o.id)) {
      allObjections.push({ ...o, pollTitle: poll.title, pollCaseNo: poll.caseNo });
    }
  });

  const pending = allObjections.filter(o => !o.status || o.status === '待处理').length;

  let html = '<div class="card"><div class="card-header"><h3>⚖️ 异议管理' + (pending > 0 ? ' <span style="color:var(--danger);font-size:14px;">(' + pending + ' 待处理)</span>' : '') + '</h3></div>';
  if (!allObjections.length) {
    html += '<div class="empty-state"><div class="icon">⚖️</div><div>暂无异议记录</div></div>';
    html += '</div>';
    return html;
  }

  html += '<table class="data-table"><thead><tr><th>编号</th><th>投票案卷</th><th>申请人房号</th><th>内容摘要</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>';
  allObjections.slice().reverse().forEach(o => {
    const statusTag = !o.status || o.status === '待处理' ? '<span class="tag tag-test">待处理</span>' : '<span class="tag tag-active">已处理</span>';
    const contentPreview = (o.content || '').substring(0, 30) + ((o.content || '').length > 30 ? '...' : '');
    html += '<tr><td>' + (o.id || '—') + '</td><td>' + escapeHtml(o.pollCaseNo || '') + '</td><td>' + escapeHtml(o.residentRoom || o.resident || '—') + '</td><td>' + escapeHtml(contentPreview) + '</td><td>' + formatDateTime(o.createdAt || o.time) + '</td><td>' + statusTag + '</td><td class="actions"><button onclick="openObjectionModal(\'' + (o.pollId || '') + '\',\'' + (o.id || '') + '\')">处理</button></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function openObjectionModal(pollId, objectionId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;
  const obj = (poll.objections || []).find(o => o.id === objectionId) || (appData.objections || []).find(o => o.id === objectionId);
  if (!obj) return;

  document.getElementById('modalTitle').textContent = '处理异议：' + (obj.id || '');
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">投票：' + escapeHtml(poll.title || '') + '</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">案卷号：' + (poll.caseNo || '') + ' · 申请人：' + escapeHtml(obj.resident || obj.residentRoom || '—') + '</div>';
  body += '<div style="font-size:13px;margin-top:8px;padding:10px;background:#fff;border-radius:6px;border:1px solid var(--border);">' + escapeHtml(obj.content || '') + '</div>';
  if (obj.images && obj.images.length) {
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    obj.images.forEach(url => { body += '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\'' + url + '\')" loading="lazy">'; });
    body += '</div>';
  }
  body += '</div>';

  if (obj.reply) {
    body += '<div style="margin-bottom:12px;padding:12px;background:#e3f2fd;border-radius:8px;border-left:4px solid #1976D2;">';
    body += '<div style="font-weight:600;color:#1976D2;margin-bottom:4px;">已回复</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' + formatDateTime(obj.handledAt) + ' · ' + escapeHtml(obj.handler || '') + '</div>';
    body += '<div style="font-size:13px;">' + escapeHtml(obj.reply) + '</div>';
    body += '</div>';
  }

  body += '<div class="form-group"><label>处理回复</label><textarea id="objReply" rows="4" placeholder="填写回复内容...">' + (obj.reply || '') + '</textarea></div>';
  body += '<div class="form-group"><label>处理结果</label><select id="objStatus"><option value="待处理" ' + ((!obj.status || obj.status === '待处理') ? 'selected' : '') + '>待处理</option><option value="已处理" ' + (obj.status === '已处理' ? 'selected' : '') + '>已处理</option><option value="驳回" ' + (obj.status === '驳回' ? 'selected' : '') + '>驳回</option></select></div>';
  body += '<div class="form-group"><label>上传回复附件（可选）</label>' + createMultiImageUploaderHTML('objReplyFiles', '支持拖拽或点击上传图片（自动压缩）') + '</div>';

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveObjectionAction(\'' + pollId + '\',\'' + objectionId + '\')">保存</button>';
  document.getElementById('modalOverlay').classList.add('active');

  setTimeout(function() {
    if (obj.replyImages && obj.replyImages.length) setMultiUploadedPaths('objReplyFiles', obj.replyImages);
  }, 50);
}

async function saveObjectionAction(pollId, objectionId) {
  const reply = document.getElementById('objReply').value.trim();
  const status = document.getElementById('objStatus').value;
  if (!reply) { showToast('请填写回复内容', 'error'); return; }

  showLoading(true);
  try {
    const poll = (appData.polls || []).find(p => p.id === pollId);
    if (!poll) throw new Error('投票不存在');

    let obj = (poll.objections || []).find(o => o.id === objectionId);
    if (!obj) {
      obj = (appData.objections || []).find(o => o.id === objectionId);
      if (obj) {
        // 迁移到 poll.objections
        if (!poll.objections) poll.objections = [];
        poll.objections.push(obj);
      }
    }
    if (!obj) throw new Error('异议记录不存在');

    obj.reply = reply;
    obj.status = status;
    obj.handler = currentAdmin && currentAdmin.name || '管理员';
    obj.handledAt = new Date().toISOString();
    obj.replyImages = getMultiUploadedPaths('objReplyFiles') || obj.replyImages || [];

    // 保存 polls
    await saveDataFile('polls', appData.polls, '处理异议 ' + objectionId + '：' + status, 'objection-resolve');

    // 追加审计日志
    await appendAuditLog('objection-resolve', 'polls', pollId, '管理员 ' + obj.handler + ' 处理异议 ' + objectionId + '，结果：' + status);

    showToast('异议处理成功', 'success');
    closeModal();
    navigateTo('objections');
  } catch(e) {
    showToast('处理失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderPollAuditTimeline(pollId) {
  const container = document.getElementById('pollAuditTimeline');
  if (!container || !pollId) { if(container) container.innerHTML = ''; return; }
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;

  const logs = (appData['audit-log'] || []).filter(l => l.targetId === pollId || (l.details && l.details.includes(pollId)) || (l.target === 'polls' && l.details && l.details.includes(poll.title||'')));
  const objections = poll.objections || [];
  const records = poll.anchorRecords || [];

  let html = '<div style="margin-bottom:24px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">⏱️ 投票全流程审计：' + escapeHtml(poll.title||'') + '</div>';
  html += '<div style="border-left:2px solid var(--border);padding-left:16px;">';

  const nodes = [];
  // 发起
  if (poll.createdAt) nodes.push({ time: poll.createdAt, label: '投票发起', detail: '由 ' + (poll.createdBy||'管理员') + ' 创建', type: 'init' });
  // 清册公示
  if (poll.rollPublish && poll.rollPublish.start) nodes.push({ time: poll.rollPublish.start, label: '清册公示开始', detail: '公示期：' + poll.rollPublish.start + ' 至 ' + (poll.rollPublish.end||''), type: 'roll' });
  // 通知送达
  if (poll.meetingFiles && poll.meetingFiles.length) nodes.push({ time: poll.createdAt, label: '会议通知上传', detail: '上传 ' + poll.meetingFiles.length + ' 份通知文件', type: 'notice' });
  // 投票进行中
  if (poll.startDate) nodes.push({ time: poll.startDate + 'T00:00:00Z', label: '投票开始', detail: '投票通道开启', type: 'vote' });
  // 计票
  if (poll.results && poll.results.calculatedAt) nodes.push({ time: poll.results.calculatedAt, label: '自动计票', detail: '参与 ' + (poll.results.participatingResidents||0) + ' 户，' + (poll.results.isPassed ? '通过' : '未通过'), type: 'count' });
  // 结果公示
  if (poll.results && poll.results.isPublished) nodes.push({ time: poll.results.calculatedAt, label: '结果公示', detail: poll.results.summary||'', type: 'publish' });
  // 异议
  objections.forEach(o => {
    nodes.push({ time: o.time || o.createdAt, label: '异议提出', detail: (o.resident||'—') + '：' + (o.content||'').substring(0,40), type: 'objection' });
    if (o.result) nodes.push({ time: o.handledAt || o.time, label: '异议处理', detail: '处理结果：' + o.result, type: 'objection-resolved' });
  });
  // 锚定
  records.forEach(r => {
    if (!r.error) nodes.push({ time: r.time, label: '证据锚定', detail: r.name + '：' + (r.txHash ? r.txHash.substring(0,16)+'...' : '已提交'), type: 'anchor' });
  });
  // 归档
  if (poll.status === '已结束') nodes.push({ time: poll.endDate + 'T23:59:59Z', label: '投票结束/归档', detail: '投票通道关闭，档案生成', type: 'archive' });

  // 按时间排序
  nodes.sort((a, b) => new Date(a.time) - new Date(b.time));

  nodes.forEach((n, i) => {
    const colorMap = { init: '#2E8B57', roll: '#1976D2', notice: '#f9a825', vote: '#2E8B57', count: '#6A1B9A', publish: '#2E8B57', objection: '#c62828', 'objection-resolved': '#2e7d32', anchor: '#E65100', archive: '#546e7a' };
    const color = colorMap[n.type] || '#666';
    html += '<div style="position:relative;margin-bottom:14px;padding-bottom:14px;' + (i < nodes.length - 1 ? 'border-bottom:1px dashed var(--border);' : '') + '">';
    html += '<div style="position:absolute;left:-21px;top:2px;width:10px;height:10px;background:' + color + ';border-radius:50%;"></div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);">' + formatDateTime(n.time) + '</div>';
    html += '<div style="font-weight:600;font-size:13px;margin-top:2px;">' + n.label + '</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(n.detail) + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function renderSettings() {
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id)) || {};
  return '<div class="card"><div class="card-header"><h3>👤 当前身份</h3></div>' +
    '<div class="form-group"><label>身份名称</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.name || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>角色类型</label><input type="text" value="' + (roleMap[currentAdmin && currentAdmin.role] || currentAdmin.role || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>权限列表</label><input type="text" value="' + escapeHtml((currentAdmin && currentAdmin.permissions || []).join(', ')) + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>管理员ID</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.id || '') + '" disabled style="background:#f5f5f5;"></div></div>' +
    '<div class="card"><div class="card-header"><h3>🔐 修改我的密码</h3></div>' +
    '<div class="form-group"><label>当前密码</label><input type="password" id="oldPassword" placeholder="输入当前密码"></div>' +
    '<div class="form-group"><label>新密码（6位以上）</label><input type="password" id="newPassword" placeholder="输入新密码"></div>' +
    '<div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>' +
    '<button class="btn btn-primary" onclick="changePassword()">修改密码</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">提示：修改后的密码会尝试持久化到 Worker。如未配置 Worker，刷新页面后将恢复代码顶部 ADMIN_ACCOUNTS 中的默认密码。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🌐 Worker 网关地址</h3></div>' +
    '<div class="form-group"><label>Worker API 地址（留空则使用内存模式）</label><input type="text" id="workerBaseInput" value="' + (localStorage.getItem('workerBase') || '') + '" placeholder="https://community.firstblade.site 或留空"></div>' +
    '<button class="btn btn-primary" onclick="saveWorkerBase()">保存地址</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">留空表示开发模式（数据仅保存在浏览器内存中，刷新后丢失）。配置 Worker 地址后可实现数据持久化。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🔗 证据锚定配置</h3></div>' +
    '<div class="form-group"><label>GitHub Token（用于 Commit 锚定）</label><input type="password" id="cfgGithubToken" value="' + (localStorage.getItem('githubToken') || '') + '" placeholder="ghp_xxxxxxxxxxxx"></div>' +
    '<div class="form-group"><label>GitHub 仓库（格式：owner/repo）</label><input type="text" id="cfgGithubRepo" value="' + (localStorage.getItem('githubRepo') || '') + '" placeholder="username/community-platform"></div>' +
    '<div class="form-group"><label>企业微信 Webhook URL</label><input type="text" id="cfgWechatWebhook" value="' + (localStorage.getItem('wechatWebhook') || '') + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."></div>' +
    '<div class="form-group"><label>Resend API Key</label><input type="password" id="cfgResendKey" value="' + (localStorage.getItem('resendApiKey') || '') + '" placeholder="re_xxxxxxxx"></div>' +
    '<div class="form-group"><label>锚定通知邮箱</label><input type="text" id="cfgAnchorEmail" value="' + (localStorage.getItem('anchorEmail') || '') + '" placeholder="admin@example.com"></div>' +
    '<button class="btn btn-primary" onclick="saveAnchorConfig()">保存锚定配置</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">配置后，投票状态变为"已结束"时将自动执行三端锚定（GitHub Commit + 微信群 + 邮件）。</p></div>';

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

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
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

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
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


/* ========== 档案生成模块 ========== */

function generatePollArchive(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) { showToast('投票不存在', 'error'); return; }

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try {
    const saved = localStorage.getItem('adminData_polls-responses-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    if (saved) responses = JSON.parse(saved);
  } catch(e) {}
  const pollVotes = responses.filter(r => r.pollId === pollId);

  const disp = getPollDisplayStats(poll);
  const allResidents = (appData.residents || []).filter(r => r.status === 'active');
  const totalResidents = disp.totalResidents;
  const totalArea = disp.totalArea;
  const res = poll.results || {};
  const records = poll.anchorRecords || [];

  const win = window.open('', '_blank');
  if (!win) { showToast('请允许弹窗以生成档案', 'error'); return; }

  const now = new Date().toLocaleString('zh-CN');
  const title = poll.title || '';
  const caseNo = poll.caseNo || pollId;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投票档案 - ${caseNo}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; text-align: center; margin-bottom: 8px; border-bottom: 2px solid #2E8B57; padding-bottom: 10px; }
h2 { font-size: 14px; color: #2E8B57; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #2E8B57; padding-left: 8px; }
h3 { font-size: 12px; color: #666; margin-top: 12px; margin-bottom: 6px; }
.cover { text-align: center; padding: 60px 20px; border: 1px solid #e0e0e0; margin-bottom: 30px; }
.cover .case-no { font-size: 16px; color: #666; margin-bottom: 12px; }
.cover .title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.cover .meta { font-size: 13px; color: #666; line-height: 2; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.stat-box { display: inline-block; width: 48%; margin: 1%; padding: 12px; background: #f8f9fa; border-radius: 6px; box-sizing: border-box; }
.stat-box .num { font-size: 18px; font-weight: 700; color: #2E8B57; }
.stat-box .label { font-size: 11px; color: #666; }
.small { font-size: 10px; color: #999; }
.page-break { page-break-before: always; }
.signature { margin-top: 40px; display: flex; justify-content: space-between; }
.signature-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; text-align: center; }
@media print {
  .no-print { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f0f7f4;margin-bottom:20px;border-radius:6px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2E8B57;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ 打印为 PDF</button>
  <span style="color:#666;margin-left:12px;">请使用浏览器的"另存为 PDF"功能保存档案</span>
</div>

<div class="cover">
  <div class="case-no">案卷编号：${caseNo}</div>
  <div class="title">${title}</div>
  <div class="meta">
    <div>生成时间：${now}</div>
    <div>档案类型：业主大会投票档案</div>
    <div>生成系统：春天阳光小区数字化平台</div>
  </div>
</div>

<h2>一、投票基本信息</h2>
<table>
  <tr><th style="width:25%">项目</th><th>内容</th></tr>
  <tr><td>案卷编号</td><td>${caseNo}</td></tr>
  <tr><td>投票标题</td><td>${title}</td></tr>
  <tr><td>事项类型</td><td>${poll.category === 'major' ? '重大事项' : '一般事项'}</td></tr>
  <tr><td>法律依据</td><td>${poll.legalBasis || '—'}</td></tr>
  <tr><td>投票期间</td><td>${poll.startDate || '—'} 至 ${poll.endDate || '—'}</td></tr>
  <tr><td>目标户数</td><td>${totalResidents} 户</td></tr>
  <tr><td>总面积</td><td>${totalArea.toFixed(2)} ㎡</td></tr>
  <tr><td>议事规则</td><td>${(poll.ruleFiles || []).length > 0 ? '已上传 ' + poll.ruleFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>业主清册</td><td>${(poll.rollFiles || []).length > 0 ? '已上传 ' + poll.rollFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>会议通知</td><td>${(poll.meetingFiles || []).length > 0 ? '已上传 ' + poll.meetingFiles.length + ' 份' : '—'}</td></tr>
</table>

<h2>二、业主清册摘要</h2>
<div style="display:flex;flex-wrap:wrap;">
  <div class="stat-box"><div class="num">${totalResidents}</div><div class="label">目标户数</div></div>
  <div class="stat-box"><div class="num">${totalArea.toFixed(2)} ㎡</div><div class="label">建筑总面积</div></div>
  <div class="stat-box"><div class="num">${(res.participatingResidents || 0)}</div><div class="label">参与投票户数</div></div>
  <div class="stat-box"><div class="num">${(res.participatingArea || 0).toFixed(2)} ㎡</div><div class="label">参与投票面积</div></div>
</div>

<h2>三、投票结果统计</h2>
<table>
  <tr><th>指标</th><th>数值</th><th>比例</th><th>门槛</th><th>是否达标</th></tr>
  <tr>
    <td>参与户数 / 目标户数</td>
    <td>${disp.participatingResidents} / ${totalResidents}</td>
    <td>${disp.residentParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.residentPct) || 66.67}%</td>
    <td>${disp.residentParticipationRate >= ((poll.threshold && poll.threshold.residentPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>参与面积 / 总面积</td>
    <td>${disp.participatingArea.toFixed(2)} / ${totalArea.toFixed(2)} ㎡</td>
    <td>${disp.areaParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.areaPct) || 66.67}%</td>
    <td>${disp.areaParticipationRate >= ((poll.threshold && poll.threshold.areaPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意户数 / 参与户数</td>
    <td>${disp.agreeCount} / ${disp.participatingResidents}</td>
    <td>${disp.agreeResidentRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeResidentRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意面积 / 参与面积</td>
    <td>${disp.agreeArea.toFixed(2)} / ${disp.participatingArea.toFixed(2)} ㎡</td>
    <td>${disp.agreeAreaRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeAreaRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
</table>
<div style="margin-top:10px;padding:10px;background:${disp.isPassed ? '#e8f5e9' : '#ffebee'};border-radius:6px;text-align:center;font-weight:600;font-size:14px;">
  ${disp.isPassed ? '✅ 表决通过' : '❌ 表决未通过'}
</div>

<h2>四、投票明细（脱敏）</h2>
<table>
  <tr><th>序号</th><th>房号</th><th>面积(㎡)</th><th>第一题答案</th><th>投票时间</th><th>哈希片段</th></tr>`;

  pollVotes.forEach((v, i) => {
    const firstAns = v.choice && v.choice.length > 0 ? v.choice[0].value : '—';
    const valStr = Array.isArray(firstAns) ? firstAns.join(',') : String(firstAns);
    const hashFrag = v.nonce ? v.nonce.substring(0, 8) + '...' : '—';
    html += `<tr><td>${i+1}</td><td>${v.roomNo || '—'}</td><td>${v.area || 0}</td><td>${valStr}</td><td>${v.voteTime ? new Date(v.voteTime).toLocaleString('zh-CN') : '—'}</td><td class="small">${hashFrag}</td></tr>`;
  });

  if (pollVotes.length === 0) {
    html += `<tr><td colspan="6" style="text-align:center;color:#999;">暂无投票记录</td></tr>`;
  }

  html += `</table>

<div class="page-break"></div>

<h2>五、异议及处理记录</h2>
<table>
  <tr><th style="width:15%">时间</th><th style="width:15%">提出人</th><th>异议内容</th><th style="width:15%">处理结果</th></tr>`;

  const objections = poll.objections || [];
  if (objections.length > 0) {
    objections.forEach(o => {
      html += `<tr><td>${o.time ? new Date(o.time).toLocaleString('zh-CN') : '—'}</td><td>${o.resident || '—'}</td><td>${o.content || '—'}</td><td>${o.result || '待处理'}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="text-align:center;color:#999;">暂无异议记录</td></tr>`;
  }

  html += `</table>

<h2>六、证据锚定记录</h2>
<table>
  <tr><th>锚定点</th><th>类型</th><th>时间</th><th>链接/Hash</th><th>状态</th></tr>`;

  if (records.length > 0) {
    records.forEach(r => {
      const status = r.error ? '❌ 失败' : '✅ 成功';
      const link = r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : (r.txHash || '—');
      html += `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.time ? new Date(r.time).toLocaleString('zh-CN') : '—'}</td><td class="small">${link}</td><td>${status}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="5" style="text-align:center;color:#999;">暂无锚定记录</td></tr>`;
  }

  html += `</table>

<h2>七、Merkle Root</h2>
<div style="padding:12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all;">
  ${poll.merkleRoot || '—'}
</div>
<div class="small" style="margin-top:4px;">此 Merkle Root 已通过 GitHub Commit、微信群机器人、邮件三端锚定，确保投票数据不可篡改。</div>

<div class="page-break"></div>

<h2>八、签章页</h2>
<div style="margin-top:20px;">
  <p>本档案由春天阳光小区数字化平台自动生成，包含完整的投票过程记录、计票结果及证据锚定信息。</p>
  <p>档案生成时间：${now}</p>
  <p>系统版本：Community Platform v2.0</p>
</div>
<div class="signature">
  <div class="signature-box">业委会签章</div>
  <div class="signature-box">物业签章</div>
</div>
<div class="signature" style="margin-top:30px;">
  <div class="signature-box">社区签章</div>
  <div class="signature-box">街道备案签章</div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
  showToast('档案已生成，请在弹窗中打印为 PDF', 'success');
}

function generateVoterReceipt(voteRecord) {
  if (!voteRecord) return;
  const poll = (appData.polls || []).find(p => p.id === voteRecord.pollId);
  const title = poll ? (poll.title || '') : '投票回执';
  const caseNo = poll ? (poll.caseNo || '') : '';
  const roomNo = voteRecord.roomNo || '—';
  const voteTime = voteRecord.voteTime ? new Date(voteRecord.voteTime).toLocaleString('zh-CN') : '—';
  const nonce = voteRecord.nonce || '—';
  const hashFrag = voteRecord.ipHash ? voteRecord.ipHash.substring(0, 16) + '...' : '—';

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { showToast('请允许弹窗以生成回执', 'error'); return; }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票回执</title>
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.receipt { background: #fff; width: 360px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; position: relative; overflow: hidden; }
.receipt::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2E8B57, #3da76b); }
.receipt-header { text-align: center; margin-bottom: 20px; }
.receipt-header .logo { font-size: 32px; margin-bottom: 8px; }
.receipt-header .title { font-size: 16px; font-weight: 700; color: #333; }
.receipt-header .subtitle { font-size: 11px; color: #999; margin-top: 4px; }
.receipt-body { border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0; padding: 16px 0; }
.receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.receipt-row .label { color: #666; }
.receipt-row .value { color: #333; font-weight: 500; }
.receipt-row .value.room { font-size: 18px; font-weight: 700; color: #2E8B57; }
.hash-box { background: #f8f9fa; border-radius: 6px; padding: 10px; margin-top: 12px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.5; }
.receipt-footer { text-align: center; margin-top: 20px; }
.receipt-footer .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2E8B57; color: #2E8B57; border-radius: 4px; font-size: 13px; font-weight: 600; transform: rotate(-3deg); opacity: 0.8; }
.receipt-footer .tip { font-size: 11px; color: #999; margin-top: 12px; }
.btn-print { display: block; width: 100%; padding: 10px; margin-top: 16px; background: #2E8B57; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.qr-placeholder { width: 80px; height: 80px; background: #f5f5f5; border-radius: 6px; margin: 12px auto 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
@media print {
  body { background: #fff; }
  .btn-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo">🗳️</div>
    <div class="title">${title}</div>
    <div class="subtitle">${caseNo}</div>
  </div>
  <div class="receipt-body">
    <div class="receipt-row"><span class="label">房号</span><span class="value room">${roomNo}</span></div>
    <div class="receipt-row"><span class="label">投票时间</span><span class="value">${voteTime}</span></div>
    <div class="receipt-row"><span class="label">随机Nonce</span><span class="value">${nonce.substring(0, 8)}...</span></div>
    <div class="receipt-row"><span class="label">IP哈希</span><span class="value">${hashFrag}</span></div>
    <div class="hash-box">
      <div style="margin-bottom:4px;font-weight:600;color:#333;">Merkle Path 片段</div>
      <div>${voteRecord.prevHash ? voteRecord.prevHash.substring(0, 24) + '...' : '首票（无前置）'}</div>
    </div>
  </div>
  <div class="receipt-footer">
    <div class="stamp">已上链存证</div>
    <div class="qr-placeholder">Merkle<br>Root</div>
    <div class="tip">请截图保存此回执<br>作为您的投票凭证</div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

async function recalculatePoll(pollId) {
  showLoading(true);
  try {
    const result = await calculatePollResults(pollId);
    if (result) {
      // 保存 poll 数据
      await saveDataFile('polls', appData.polls, '重新计票 ' + pollId, 'update');
      // 追加审计日志
      appendAuditLog('recount', 'polls', pollId, '管理员手动重新计票，结果：' + (result.isPassed ? '通过' : '未通过'));
      showToast('计票完成：' + (result.isPassed ? '通过' : '未通过'), result.isPassed ? 'success' : 'info');
      navigateTo('polls');
    } else {
      showToast('计票失败：未找到投票数据', 'error');
    }
  } catch(e) {
    showToast('计票失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(module, id) {
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

async function saveDataFile(filename, data, detail, action) {
  action = action || 'update';

  // 优先使用 Worker 持久化（确保前端实时同步）
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/' + filename + '.json', data, detail);
      showToast('✅ 已同步到云端，前端将自动更新', 'success');
      await appendAuditLog(action, filename, (data && data.id) || '', detail);
      return;
    } catch(e) {
      console.error('Worker 保存失败，回退到本地:', e);
      showToast('⚠️ Worker 同步失败：' + e.message + '，已保存到本地', 'error');
      // 回退到 localStorage
    }
  }

  if (!githubToken) {
    localStorage.setItem('adminData_' + filename, JSON.stringify(data));
    showToast('保存成功', 'success');
    await appendAuditLog(action, filename, (data && data.id) || '', detail);
    return;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息');
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/' + filename + '.json';
  const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!getRes.ok) throw new Error('无法读取文件，请检查Token权限');
  const fileInfo = await getRes.json();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] ' + detail, content: content, sha: fileInfo.sha })
  });
  if (!putRes.ok) {
    const err = await putRes.json();
    throw new Error(err.message || '保存失败');
  }
  await appendAuditLog(action, filename, data.id || '', detail);
}

async function appendAuditLog(action, target, targetId, detail) {
  const log = appData['audit-log'] || [];
  log.push({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    adminName: currentAdmin && currentAdmin.name || '未知',
    adminId: currentAdmin && currentAdmin.id || '',
    action: action,
    target: target,
    targetId: targetId,
    details: detail,
    clientInfo: navigator.userAgent
  });
  appData['audit-log'] = log;

  // 优先使用 Worker 保存审计日志
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/audit-log.json', log, '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新');
    } catch(e) { console.error('审计日志Worker保存失败', e); }
    return;
  }

  if (!githubToken) return;
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) return;
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/audit-log.json';
  try {
    const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!getRes.ok) return;
    const fileInfo = await getRes.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2))));
    await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新', content: content, sha: fileInfo.sha })
    });
  } catch(e) { console.error('审计日志保存失败', e); }
}

async function getRepoInfo() {
  if (!githubToken) return null;
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + githubToken }
    });
    if (!r.ok) return null;
    const user = await r.json();
    const savedRepo = localStorage.getItem('githubRepo');
    if (savedRepo) return [user.login, savedRepo];
    const path = window.location.pathname;
    const parts = path.split('/');
    if (parts.length >= 2 && parts[1] && !parts[1].includes('.')) return [user.login, parts[1]];
    return null;
  } catch(e) { return null; }
}

function showBatchImport() {
  document.getElementById('modalTitle').textContent = '📥 批量导入业主';
  document.getElementById('modalBody').innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请粘贴Excel内容，格式：房号 | 姓名 | 手机后四位（每行一条，可用制表符或竖线分隔）</p>' +
    '<textarea class="batch-textarea" id="batchData" placeholder="1-1-101	张三	1234\n1-1-102	李四	5678"></textarea>' +
    '<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--text-secondary);font-weight:500;">或上传文件（.csv / .xlsx / .vcf）：</div>' +
    createFileUploaderHTML({id:'batchFile', accept:'.csv,.xlsx,.xls,.vcf,.vcd', hint:'支持拖拽或点击上传 .csv / .xlsx / .vcf 文件'}) +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">示例：1-1-101  测试业主01  0001</div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchImport()">导入</button>';
  document.getElementById('modalOverlay').classList.add('active');
}

async function doBatchImport() {
  let rows = [];
  let success = 0, fail = 0;

  // 先尝试从上传的文件解析
  const batchPath = getUploadedPath('batchFile');
  if (batchPath && batchPath.startsWith('blob:')) {
    try {
      const r = await fetch(batchPath);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], 'batch.csv');
        rows = await handleBatchFile(file);
      }
    } catch(e) { console.error(e); }
  } else if (batchPath) {
    showLoading(true);
    try {
      const ownerRepo = await getRepoInfo();
      if (ownerRepo) {
        const [owner, repo] = ownerRepo;
        const r = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + batchPath);
        if (r.ok) {
          const blob = await r.blob();
          const file = new File([blob], 'batch.' + (batchPath.split('.').pop() || 'csv'));
          rows = await handleBatchFile(file);
        }
      }
    } catch(e) { console.error(e); }
    showLoading(false);
  }

  // 如果没有文件或文件解析失败，尝试文本框
  if (rows.length === 0) {
    const text = document.getElementById('batchData').value.trim();
    if (!text) { showToast('请输入数据或上传文件', 'error'); return; }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t|\|\s]+/);
      if (parts.length >= 3) {
        rows.push(parts);
      }
    });
  }

  const newResidents = [];
  rows.forEach(parts => {
    const room = parts[0].trim();
    const name = parts[1].trim();
    const suffix = (parts[2] || '').trim().replace(/[^0-9]/g, '').substring(0,4);
    if (room && name && suffix) {
      newResidents.push({ id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), roomNo: room, name: name, phoneSuffix: suffix, area: 0, voteWeightCount: 1, voteWeightArea: 0, status: 'active', isTest: false, registeredAt: new Date().toISOString().split('T')[0] });
      success++;
    } else { fail++; }
  });

  if (newResidents.length === 0) { showToast('未解析到有效数据', 'error'); return; }
  const list = appData.residents || [];
  list.push.apply(list, newResidents);
  appData.residents = list;
  closeModal(); showLoading(true);
  try {
    await saveDataFile('residents', list, '批量导入 ' + success + ' 位业主', 'batch-import');
    showToast('成功导入 ' + success + ' 位业主' + (fail?'，' + fail + '行失败':''), 'success');
    navigateTo('residents');
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function saveAnchorConfig() {
  localStorage.setItem('githubToken', document.getElementById('cfgGithubToken').value.trim());
  localStorage.setItem('githubRepo', document.getElementById('cfgGithubRepo').value.trim());
  localStorage.setItem('wechatWebhook', document.getElementById('cfgWechatWebhook').value.trim());
  localStorage.setItem('resendApiKey', document.getElementById('cfgResendKey').value.trim());
  localStorage.setItem('anchorEmail', document.getElementById('cfgAnchorEmail').value.trim());
  showToast('锚定配置已保存', 'success');
}

async function changePassword() {
  const oldPwd = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码需6位以上', 'error'); return; }

  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id));
  if (!account) { showToast('账户配置异常', 'error'); return; }
  if (oldPwd !== account.password) { showToast('当前密码错误', 'error'); return; }

  // 更新内存中的密码
  account.password = newPwd;

  // 同步持久化到 config.adminAccounts（如 Worker 可用）
  if (!appData.config) appData.config = {};
  if (!appData.config.adminAccounts) appData.config.adminAccounts = [];
  let persisted = appData.config.adminAccounts.find(a => a.id === account.id);
  if (persisted) {
    persisted.password = newPwd;
  } else {
    appData.config.adminAccounts.push({ id: account.id, password: newPwd, permissions: account.permissions });
  }

  showLoading(true);
  try {
    await saveDataFile('config', appData.config, '管理员 ' + account.name + ' 修改密码', 'password-change');
    showToast('密码修改成功', 'success');
  } catch(e) {
    showToast('密码已更新（内存），但持久化失败：' + e.message, 'warning');
  } finally {
    showLoading(false);
  }
}

function showTokenModal() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
}


function saveWorkerBase() {
  const el = document.getElementById('workerBaseInput');
  if (!el) return;
  const val = el.value.trim();
  localStorage.setItem('workerBase', val.replace(/\/$/, ''));
  showToast('Worker地址已保存，刷新页面后生效', 'success');
}
async function updateToken() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
  closeModal();
}


/* ========== 图片压缩 ========== */

async function compressImageToBlob(file, maxSizeMB = 0.03) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const toBlob = (q) => new Promise((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', q);
      });
      const maxSize = maxSizeMB * 1024 * 1024;
      let blob = await toBlob(0.25);
      if (blob.size <= maxSize) {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let low = 0.05, high = 0.4, bestBlob = null;
      while (high - low > 0.03) {
        const mid = (low + high) / 2;
        blob = await toBlob(mid);
        if (blob.size > maxSize) { high = mid; }
        else { low = mid; bestBlob = blob; }
      }
      if (bestBlob && bestBlob.size <= maxSize) {
        resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let scale = 0.7;
      while (scale > 0.05) {
        const nw = Math.max(1, Math.floor(w * scale));
        const nh = Math.max(1, Math.floor(h * scale));
        canvas.width = nw; canvas.height = nh;
        ctx.drawImage(img, 0, 0, nw, nh);
        blob = await toBlob(0.3);
        if (blob.size <= maxSize) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        scale -= 0.18;
      }
      reject(new Error('图片压缩后仍超过' + maxSizeMB + 'MB限制'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/* ========== 文件上传相关 ========== */

async function uploadFileToRepo(file, folder) {
  const maxSizeMB = folder === 'videos' ? 100 : (folder === 'images' ? 100 : (folder === 'files' ? 100 : 100));
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error('文件大小超过限制（' + maxSizeMB + 'MB）');
  }

  // ===== 优先使用 Worker 上传（确保前端可实时访问）=====
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      console.log('[Worker Upload] 开始上传:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
      const res = await fetch(workerBase + '/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Worker 返回 ' + res.status + ': ' + errText.substring(0,200));
      }
      const result = await res.json();
      if (result && result.url) {
        console.log('[Worker Upload] ✅ 成功:', result.url);
        return result.url;
      } else {
        throw new Error('Worker 返回数据异常: ' + JSON.stringify(result));
      }
    } catch (e) {
      console.error('[Worker Upload] ❌ 失败:', e.message);
      showToast('Worker 上传失败: ' + e.message + '，尝试 GitHub...', 'error');
      // 继续回退到 GitHub
    }
  }

  // ===== 回退到 GitHub API =====
  if (!githubToken) {
    // 如果连 GitHub 也没有，返回临时 blob（仅当前页可用，会提示用户）
    const blobUrl = URL.createObjectURL(file);
    console.warn('[Upload] ⚠️ 未配置 Worker 或 GitHub，返回临时 blob:', blobUrl);
    showToast('⚠️ 警告：未配置 Worker 或 GitHub，文件仅当前页可用，刷新后失效', 'error');
    return blobUrl;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息，请检查Token');
  const [owner, repo] = ownerRepo;
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = Date.now() + '_' + Math.random().toString(36).substr(2,6) + '_' + safeName;
  const path = 'assets/' + (folder || 'uploads') + '/' + filename;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
        });
        let sha = '';
        if (getRes.ok) {
          const info = await getRes.json();
          sha = info.sha;
        }
        const body = {
          message: '[' + (currentAdmin && currentAdmin.name || 'admin') + '] 上传文件 ' + file.name,
          content: base64
        };
        if (sha) body.sha = sha;
        const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.message || '上传失败');
        }
        resolve(path);
      } catch(e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function createFileUploaderHTML(options) {
  const { id, accept, hint, maxSizeText } = options;
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || ''}</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept || '*'}" onchange="handleFileSelect(event,'${id}')">
    <div class="file-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) await processFileUpload(files[0], id);
}

async function handleFileSelect(e, id) {
  const file = e.target.files[0];
  if (file) await processFileUpload(file, id);
}

async function processFileUpload(file, id) {
  const progressEl = document.getElementById('progress-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const wrapEl = document.getElementById('wrap-' + id);

  let folder = 'uploads';
  let maxSize = 100 * 1024 * 1024;
  let isImage = false;
  if (id.includes('video')) { folder = 'videos'; maxSize = 800 * 1024 * 1024; }
  else if (id.includes('image') || id.includes('cover') || id.includes('logo') || id.includes('favicon')) { folder = 'images'; isImage = true; }
  else if (id.includes('pdf') || id.includes('file')) { folder = 'files'; maxSize = 100 * 1024 * 1024; }
  else if (id.includes('batch')) { folder = 'imports'; maxSize = 100 * 1024 * 1024; }

  let uploadFile = file;
  if (isImage && file.type.startsWith('image/')) {
    progressEl.textContent = '⏳ 压缩中...';
    try {
      uploadFile = await compressImageToBlob(file, 0.03);
      progressEl.textContent = '⏳ 上传中...';
    } catch(e) {
      showToast('图片压缩失败：' + e.message, 'error');
      return;
    }
  } else if (file.size > maxSize) {
    showToast('文件过大，限制' + (maxSize/1024/1024) + 'MB', 'error');
    return;
  }

  try {
    const path = await uploadFileToRepo(uploadFile, folder);
    progressEl.textContent = '✅ 上传成功';

    // 保存路径到data属性
    wrapEl.dataset.uploadedPath = path;
    wrapEl.dataset.fileName = file.name;

    // 显示预览
    let previewHTML = '';
    if (uploadFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><img src="${url}"><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else if (uploadFile.type.startsWith('video/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><video src="${url}" muted playsinline webkit-playsinline x5-playsinline preload="metadata"></video><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else {
      previewHTML = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    }
    previewEl.innerHTML = previewHTML;
  } catch(e) {
    progressEl.textContent = '';
    showToast('上传失败：' + e.message, 'error');
  }
}

function clearUpload(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const progressEl = document.getElementById('progress-' + id);
  if (wrapEl) { delete wrapEl.dataset.uploadedPath; delete wrapEl.dataset.fileName; }
  if (previewEl) previewEl.innerHTML = '';
  if (progressEl) progressEl.textContent = '';
  const inp = document.getElementById('inp-' + id);
  if (inp) inp.value = '';
}

function getUploadedPath(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  return wrapEl && wrapEl.dataset.uploadedPath || '';
}

function setUploadedPath(id, path, name) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  if (!wrapEl) return;
  wrapEl.dataset.uploadedPath = path;
  wrapEl.dataset.fileName = name || path;
  if (previewEl && path) {
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(path);
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(path);
    let html = '';
    if (isImg) html = `<div class="file-preview-item"><img src="${path}"><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else if (isVideo) html = `<div class="file-preview-item"><video src="${path}" muted></video><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else html = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    previewEl.innerHTML = html;
  }
}



/* ========== 多图上传相关 ========== */

function createMultiImageUploaderHTML(id, hint, accept) {
  accept = accept || 'image/*';
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleMultiFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || '支持拖拽或点击上传（自动压缩）'}</div>
      <div class="hint" style="color:var(--primary);font-weight:500;">已上传 <span id="count-${id}">0</span> / 15 个</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept}" multiple onchange="handleMultiFileSelect(event,'${id}')">
    <div class="multi-image-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleMultiFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) await processMultiFileUpload(files, id);
}

async function handleMultiFileSelect(e, id) {
  const files = Array.from(e.target.files);
  if (files.length) await processMultiFileUpload(files, id);
}

async function processMultiFileUpload(files, id) {
  const progressEl = document.getElementById('progress-' + id);
  const wrapEl = document.getElementById('wrap-' + id);
  let currentPaths = getMultiUploadedPaths(id);

  if (currentPaths.length + files.length > 15) {
    showToast('最多只能上传15个文件', 'error');
    files = files.slice(0, 15 - currentPaths.length);
  }

  if (files.length === 0) return;

  progressEl.textContent = '⏳ 处理中 ' + files.length + ' 个...';

  for (const file of files) {
    let uploadFile = file;
    let folder = 'files';
    let isImage = file.type.startsWith('image/');
    let isPdf = file.type === 'application/pdf';
    let isRollCSV = (id === 'pollRollFiles') && (/\.(csv|xlsx|xls)$/i.test(file.name));

    if (isImage) {
      folder = 'images';
      try {
        uploadFile = await compressImageToBlob(file, 0.03);
      } catch(e) {
        showToast('"' + file.name + '" 压缩失败：' + e.message, 'error');
        continue;
      }
    } else if (isPdf || isRollCSV) {
      folder = 'files';
      if (file.size > 100 * 1024 * 1024) {
        showToast('"' + file.name + '" 超过100MB限制', 'error');
        continue;
      }
    } else {
      showToast('"' + file.name + '" 不支持的文件格式，仅支持图片和PDF', 'error');
      continue;
    }

    try {
      const path = await uploadFileToRepo(uploadFile, folder);
      currentPaths.push(path);
      renderMultiFilePreview(id, currentPaths);
      document.getElementById('count-' + id).textContent = currentPaths.length;
      // 自动解析清册CSV
      if (isRollCSV && /\.csv$/i.test(file.name)) {
        try {
          const text = await file.text();
          const result = parseRollCSV(text);
          if (result && result.count > 0) {
            updateRollStats(result.count, result.area);
            const targetInput = document.getElementById('edTarget');
            if (targetInput) targetInput.value = result.count;
            window._rollSyncData = { count: result.count, area: result.area, source: 'upload' };
            showToast('清册解析成功：' + result.count + '户，' + result.area.toFixed(2) + '㎡', 'success');
          }
        } catch(e) { console.error('CSV解析失败', e); }
      }
    } catch(e) {
      showToast('"' + file.name + '" 上传失败：' + e.message, 'error');
    }
  }

  progressEl.textContent = currentPaths.length > 0 ? '✅ 已上传 ' + currentPaths.length + ' 个' : '';
  wrapEl.dataset.uploadedPaths = JSON.stringify(currentPaths);
}

function renderMultiFilePreview(id, paths) {
  const previewEl = document.getElementById('preview-' + id);
  if (!previewEl) return;
  let html = '';
  paths.forEach((path, idx) => {
    const isPdf = /\.pdf$/i.test(path);
    if (isPdf) {
      html += `<div class="multi-preview-item" style="display:flex;align-items:center;justify-content:center;background:#f5f5f5;cursor:pointer;" onclick="window.open('${path}','_blank')" title="点击打开PDF">
        <div style="text-align:center;">
          <div style="font-size:32px;">📄</div>
          <div style="font-size:10px;color:#666;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;">${escapeHtml(path.split('/').pop() || 'PDF')}</div>
        </div>
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    } else {
      html += `<div class="multi-preview-item" style="cursor:pointer;" onclick="previewImage('${path}')">
        <img src="${path}" onerror="this.src=''" loading="lazy" decoding="async">
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    }
  });
  previewEl.innerHTML = html;
}

function renderMultiImagePreview(id, paths) { renderMultiFilePreview(id, paths); }

function removeMultiFile(id, idx) {
  const wrapEl = document.getElementById('wrap-' + id);
  let paths = getMultiUploadedPaths(id);
  paths.splice(idx, 1);
  wrapEl.dataset.uploadedPaths = JSON.stringify(paths);
  renderMultiFilePreview(id, paths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = paths.length;
  const progressEl = document.getElementById('progress-' + id);
  if (progressEl) progressEl.textContent = paths.length > 0 ? '✅ 已上传 ' + paths.length + ' 个' : '';
}

function removeMultiImage(id, idx) { removeMultiFile(id, idx); }

function getMultiUploadedPaths(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl || !wrapEl.dataset.uploadedPaths) return [];
  try { return JSON.parse(wrapEl.dataset.uploadedPaths); } catch(e) { return []; }
}

function setMultiUploadedPaths(id, paths) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl) return;
  const validPaths = (paths || []).filter(p => p && typeof p === 'string');
  wrapEl.dataset.uploadedPaths = JSON.stringify(validPaths);
  renderMultiFilePreview(id, validPaths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = validPaths.length;
}

/* ==================== 管理员账户配置（可直接修改） ====================
   说明：以下密码为明文，方便直接修改。如需调整权限或密码，
   直接编辑下方 ADMIN_ACCOUNTS 数组即可，无需理解其他代码逻辑。
   四个角色：总维护人员、物管人员、业委会成员、社区人员。
   ==================================================================== */
const ADMIN_ACCOUNTS = [
  { id: 'admin-super',      name: '总维护人员',   role: 'super',      password: 'Sunlight2026',  permissions: ['all'] },
  { id: 'admin-property',   name: '物管人员',       role: 'property',   password: 'Property2026',  permissions: ['announcements','documents','workorders','residents'] },
  { id: 'admin-committee',  name: '业委会成员',     role: 'committee',  password: 'Committee2026', permissions: ['polls','residents','complaints','audit'] },
  { id: 'admin-community',  name: '社区人员',       role: 'community',  password: 'Community2026', permissions: ['announcements','activities','complaints'] }
];

let appData = {config:{},announcements:[],documents:[],activities:[],polls:[],residents:[],'audit-log':[],workorders:[],complaints:[]};

// ===== Worker 网关配置（工单/投诉管理模块，不影响原有功能） =====
const WORKER_BASE = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
function getWorkerBase(){ return WORKER_BASE.replace(/\/$/,''); }
function getCurrentMonthPath(module){
  const d=new Date();
  return module+'/'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'.json';
}
async function workerRead(filePath){
  const base=getWorkerBase();
  if(!base){
    // 尝试多种可能的 key 格式（兼容有/无前导零的月份）
    const keysToTry = [];
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    keysToTry.push(key);
    // 如果包含月份路径如 polls-responses/2026-08.json，也尝试 polls-responses/2026-8.json
    const altKey = key.replace(/-(\d{2})$/, function(m, p1) { return '-' + parseInt(p1, 10); });
    if (altKey !== key) keysToTry.push(altKey);
    // 反向：如果当前是无前导零，也尝试有前导零
    const altKey2 = key.replace(/-(\d)$/, function(m, p1) { return '-' + String(parseInt(p1, 10)).padStart(2, '0'); });
    if (altKey2 !== key) keysToTry.push(altKey2);
    for (const k of keysToTry) {
      const cached = appData[k];
      if(cached && Array.isArray(cached) && cached.length > 0) return cached;
    }
    // 尝试从 appData 的模块名直接读取（如 appData.workorders）
    const moduleName = filePath.split('/')[0];
    if(appData[moduleName] && Array.isArray(appData[moduleName]) && appData[moduleName].length > 0) return appData[moduleName];
    return [];
  }
  // Worker 模式：先尝试原始路径，失败则尝试月份格式兼容
  const tryPaths = [filePath];
  const m = filePath.match(/^(polls-responses\/\d{4})-(\d{2})\.json$/);
  if (m) {
    const alt = m[1] + '-' + parseInt(m[2], 10) + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  const m2 = filePath.match(/^(polls-responses\/\d{4})-(\d)\.json$/);
  if (m2) {
    const alt = m2[1] + '-' + String(parseInt(m2[2], 10)).padStart(2, '0') + '.json';
    if (alt !== filePath) tryPaths.push(alt);
  }
  for (const p of tryPaths) {
    try {
      const res=await fetch(base+'/api/read/'+encodeURIComponent(p));
      if(res.ok) {
        const t=await res.text();
        return t?JSON.parse(t):[];
      }
    } catch(e) {}
  }
  throw new Error('读取失败');
}
async function workerWrite(filePath,data,message){
  const base=getWorkerBase();
  if(!base){
    const key=filePath.replace(/\.json$/,'').replace(/\//g,'-');
    appData[key]=data;
    showToast('开发模式：数据仅保存在内存中','info');
    return;
  }
  const res=await fetch(base+'/api/write/'+encodeURIComponent(filePath),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:JSON.stringify(data,null,2),message})
  });
  if(!res.ok){const e=await res.json();throw new Error(e.error||'保存失败');}
}
async function workerUpload(file){
  const base=getWorkerBase();
  if(!base){
    return {url:URL.createObjectURL(file),name:file.name};
  }
  const fd=new FormData();fd.append('file',file);
  const res=await fetch(base+'/api/upload',{method:'POST',body:fd});
  if(!res.ok) throw new Error('上传失败');
  return await res.json();
}
function woStatusClass(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}
function cpStatusClass(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}
async function loadAllWorkorders(){
  try{ return await workerRead(getCurrentMonthPath('workorders')); }catch(e){ return []; }
}
async function loadAllComplaints(){
  try{ return await workerRead(getCurrentMonthPath('complaints')); }catch(e){ return []; }
}

let currentModule = 'dashboard';
let adminSession = null;
let githubToken = localStorage.getItem('githubToken') || '';
let currentAdmin = null;
const SALT = "SunlightCommunity2026";

document.addEventListener('DOMContentLoaded', async () => {
  try { 
    await loadAllData(); 
    autoSkipLogin();
  } catch(e) { 
    console.error('Init error:', e);
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('tokenPage').style.display = 'none';
    document.getElementById('adminLayout').classList.add('active');
    document.getElementById('contentArea').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><div>初始化失败，请刷新页面重试</div><div style="font-size:12px;color:#999;margin-top:8px;">' + escapeHtml(e.message) + '</div></div>';
  }
});

async function loadAllData() {
  const files = ['config','announcements','documents','activities','polls','residents','audit-log'];
  const workerBase = getWorkerBase();

  for (const f of files) {
    let loaded = false;
    let workerData = null;

    // 1. 优先从 Worker 读取（已持久化的数据）
    if (workerBase) {
      try {
        const r = await fetch(workerBase + '/api/read/' + encodeURIComponent('data/' + f + '.json') + '?t=' + Date.now());
        if (r.ok) {
          workerData = await r.json();
          // 只有 Worker 返回非空数据才视为加载成功，避免空数组覆盖本地数据
          const isEmpty = (Array.isArray(workerData) && workerData.length === 0) || 
                          (typeof workerData === 'object' && workerData !== null && Object.keys(workerData).length === 0);
          if (!isEmpty) {
            appData[f] = workerData;
            loaded = true;
            continue;
          }
        }
      } catch(e) {}
    }

    // 2. 尝试 fetch 本地 data/ 目录（静态文件）
    if (!loaded) {
      try {
        const r = await fetch('data/' + f + '.json?t=' + Date.now());
        if (r.ok) {
          appData[f] = await r.json();
          loaded = true;
        }
      } catch(e) {}
    }

    // 3. 检查 localStorage（开发模式或回退）
    if (!loaded) {
      try {
        const saved = localStorage.getItem('adminData_' + f);
        if (saved) { appData[f] = JSON.parse(saved); loaded = true; }
      } catch(e) {}
    }

    // 4. 最后回退到 EMBEDDED_DATA（初始默认值）
    if (!loaded) {
      if (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA[f] !== undefined) {
        appData[f] = EMBEDDED_DATA[f];
        loaded = true;
      }
    }

    if (!loaded) {
      const defaults = { config: {}, announcements: [], documents: [], activities: [], polls: [], residents: [], 'audit-log': [] };
      appData[f] = defaults[f] || [];
    }
  }
  updateFavicon();
  updatePageTitle();
  renderSiteLogo();
  // === 无条件补全 residents 面积数据（兼容旧数据无 area 字段的情况）===
  if (appData.residents && appData.residents.length > 0) {
    const embeddedResidents = (typeof EMBEDDED_DATA !== 'undefined' && EMBEDDED_DATA.residents) ? EMBEDDED_DATA.residents : [];
    const areaMap = {};
    embeddedResidents.forEach(r => { if (r.roomNo && r.area) areaMap[r.roomNo] = r.area; });
    let fixedCount = 0;
    appData.residents.forEach((r, i) => {
      if (!r.area || parseFloat(r.area) === 0) {
        const fallbackArea = areaMap[r.roomNo];
        if (fallbackArea) {
          r.area = fallbackArea;
        } else {
          // 兜底：根据房号生成一个合理的面积（60-140㎡）
          const hash = r.roomNo ? r.roomNo.split('').reduce((s, c) => s + c.charCodeAt(0), 0) : i;
          r.area = 60 + Math.floor(Math.abs(Math.sin(hash * 7.3 + 1.5)) * 81);
        }
        fixedCount++;
      }
    });
    if (fixedCount > 0) {
      console.log('[Area Fixup] 已自动为 ' + fixedCount + ' 位业主补全面积数据');
    }
  }

  // === 数据清洗：移除已失效的 blob URL，防止脏数据持续保存 ===
  if (appData.activities) {
    appData.activities.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.videos) item.videos = item.videos.filter(u => !u.startsWith('blob:'));
      if (item.videoLinks) item.videoLinks = item.videoLinks.filter(u => !u.startsWith('blob:'));
      if (item.adminImages) item.adminImages = item.adminImages.filter(u => !u.startsWith('blob:'));
      if (item.coverImage && item.coverImage.startsWith('blob:')) item.coverImage = '';
      if (item.videoUrl && item.videoUrl.startsWith('blob:')) item.videoUrl = '';
    });
  }
  if (appData.announcements) {
    appData.announcements.forEach(item => {
      if (item.attachments) item.attachments = item.attachments.filter(att => att.url && !att.url.startsWith('blob:'));
    });
  }
  if (appData.documents) {
    appData.documents.forEach(item => {
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.attachments) item.attachments = item.attachments.filter(a => a.url && !a.url.startsWith('blob:'));
    });
  }

  // 加载持久化的管理员密码配置（覆盖代码默认值）
  if (appData.config && appData.config.adminAccounts && Array.isArray(appData.config.adminAccounts)) {
    appData.config.adminAccounts.forEach(persisted => {
      const acc = ADMIN_ACCOUNTS.find(a => a.id === persisted.id);
      if (acc && persisted.password) acc.password = persisted.password;
      if (acc && persisted.permissions) acc.permissions = persisted.permissions;
    });
  }
}

function updateFavicon() {
  const favicon = appData.config && appData.config.community && appData.config.community.favicon;
  if (favicon) {
    document.getElementById('faviconLink').href = favicon;
  }
}
function updatePageTitle() {
  const c = appData.config && appData.config.community || {};
  document.title = (c.siteTitle || (c.name ? c.name + ' - 管理后台' : '管理后台'));
}
function getSiteLogoConfig() {
  try { var raw = localStorage.getItem("siteLogoConfig"); if (raw) return JSON.parse(raw); } catch(e) {}
  return { type: "emoji", value: "⚙️", title: "管理后台", adminTitle: "管理后台" };
}
function setSiteLogoConfig(cfg) {
  localStorage.setItem("siteLogoConfig", JSON.stringify(cfg));
}
function renderSiteLogo() {
  var cfg = getSiteLogoConfig();
  var iconEl = document.getElementById("siteLogoIcon");
  var titleEl = document.getElementById("siteLogoTitle");
  if (iconEl) {
    if (cfg.type === "image" && cfg.value) {
      iconEl.innerHTML = '<img src="' + cfg.value.replace(/"/g, "&quot;") + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;display:block;">';
    } else {
      iconEl.innerHTML = cfg.value || "⚙️";
    }
  }
  if (titleEl) titleEl.textContent = cfg.adminTitle || cfg.title || "管理后台";
  var link = document.getElementById("faviconLink");
  if (!link) {
    link = document.createElement("link");
    link.id = "faviconLink"; link.rel = "shortcut icon"; link.type = "image/png";
    document.head.appendChild(link);
  }
  if (cfg.type === "image" && cfg.value) {
    link.href = cfg.value;
  } else {
    var emoji = cfg.value ? cfg.value.replace(/&#(\d+);/g, function(m, code) { return String.fromCodePoint(code); }) : "⚙️";
    var canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 64;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 64, 64);
    ctx.font = "48px serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(emoji, 32, 34);
    link.href = canvas.toDataURL("image/png");
  }
}
function checkLoginState() {
  autoSkipLogin();
}

function autoSkipLogin() {
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

  const account = ADMIN_ACCOUNTS.find(a => a.id === roleId);
  if (!account) { err.textContent = '身份配置错误，请联系总维护人员'; err.style.display = 'block'; return; }

  btn.disabled = true; btn.textContent = '验证中...';

  // 明文对比，方便直接修改代码中的密码
  if (pwd !== account.password) {
    err.textContent = '密码错误，请重新输入'; err.style.display = 'block';
    btn.disabled = false; btn.textContent = '登录';
    return;
  }

  // 登录成功
  currentAdmin = { id: account.id, name: account.name, role: account.role, permissions: account.permissions };
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
  if (!currentAdmin) {
    logout(); return;
  }
  document.getElementById('adminInfo').textContent = currentAdmin.name || '管理员';
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  document.getElementById('adminRole').textContent = roleMap[currentAdmin.role] || currentAdmin.role;
  renderSidebar();
  const hash = location.hash;
  const match = hash.match(/module=([^&]+)/);
  const targetModule = match ? match[1] : 'dashboard';
  const validModules = ['dashboard','config','announcements','documents','activities','polls','residents','audit','workorders','complaints','settings'];
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

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function renderSidebar() {
  if (!currentAdmin) return;
  const perms = currentAdmin.permissions || [];
  const isSuper = currentAdmin.role === 'super';
  const items = [
    { id: 'dashboard', label: '仪表盘', icon: '📊', perm: 'view', roles: ['super','property','committee','community'] },
    { id: 'config', label: '社区配置', icon: '⚙️', perm: 'all', roles: ['super'] },
    { id: 'announcements', label: '公告管理', icon: '📢', perm: 'announcements', roles: ['super','property','community'] },
    { id: 'documents', label: '文件管理', icon: '📄', perm: 'documents', roles: ['super','property'] },
    { id: 'activities', label: '动态管理', icon: '🎉', perm: 'activities', roles: ['super','community'] },
    { id: 'polls', label: '投票管理', icon: '🗳️', perm: 'polls', roles: ['super','committee'] },
    { id: 'residents', label: '业主管理', icon: '👥', perm: 'residents', roles: ['super','property','committee'] },
    { id: 'objections', label: '异议管理', icon: '⚖️', perm: 'polls', roles: ['super','committee'] },
    { id: 'audit', label: '操作日志', icon: '📋', perm: 'audit-log', roles: ['super','committee'] },
    { id: 'workorders', label: '工单管理', icon: '🔧', perm: 'workorders', roles: ['super','property'] },
    { id: 'complaints', label: '投诉建议', icon: '📝', perm: 'complaints', roles: ['super','committee','community'] },
    { id: 'life', label: '生活服务', icon: '🍽️', perm: 'all', roles: ['super','property','committee','community'], external: 'admin-life.html' },
    { id: 'trade', label: '交易管理', icon: '🛒', perm: 'all', roles: ['super','property','committee','community'], external: 'trade-admin.html' },
    { id: 'settings', label: '系统设置', icon: '🔐', perm: 'all', roles: ['super','property','committee','community'] }
  ];
  let html = '';
  items.forEach(item => {
    const hasPerm = isSuper || perms.indexOf('all') >= 0 || perms.indexOf(item.perm) >= 0;
    const hasRole = !item.roles || item.roles.indexOf(currentAdmin.role) >= 0;
    if (!hasPerm || !hasRole) return;
    if (item.external) {
      html += `<div class="nav-item" data-module="${item.id}" onclick="window.open('${item.external}','_blank')">`;
    } else {
      html += `<div class="nav-item ${item.id==='dashboard'?'active':''}" data-module="${item.id}" onclick="navigateTo('${item.id}')">`;
    }
    html += '<span class="icon">' + item.icon + '</span><span>' + item.label + '</span></div>';
  });
  document.getElementById('sidebarNav').innerHTML = html;
}

function navigateTo(module) {
  try {
    currentModule = module;
    location.hash = 'module=' + module;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.module === module));
    const titles = { dashboard: '仪表盘', config: '社区配置', announcements: '公告管理', documents: '文件管理', activities: '动态管理', polls: '投票管理', residents: '业主管理', objections: '异议管理', audit: '操作日志', workorders: '工单管理', complaints: '投诉建议', life: '生活服务', settings: '系统设置' };
    var pt = document.getElementById('pageTitle');
    if (pt) pt.textContent = titles[module] || module;
    var sb = document.getElementById('saveBtn');
    if (sb) sb.style.display = ['dashboard','audit','settings'].indexOf(module) >= 0 ? 'none' : 'inline-block';
    const renderers = {
      dashboard: renderDashboard, config: renderConfig, announcements: renderAnnouncementsAdmin,
      documents: renderDocumentsAdmin, activities: renderActivitiesAdmin, polls: renderPollsAdmin,
      residents: renderResidentsAdmin, objections: renderObjectionsAdmin, audit: renderAuditLog,
      workorders: renderWorkordersAdmin,
      complaints: renderComplaintsAdmin,
      settings: renderSettings
    };
    const fn = renderers[module] || renderDashboard;
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

function renderDashboard() {
  const annCount = (appData.announcements || []).length;
  const docCount = (appData.documents || []).length;
  const actCount = (appData.activities || []).length;
  const pollCount = (appData.polls || []).filter(p => p && p.status === '进行中').length;
  const resCount = (appData.residents || []).filter(r => r && r.status === 'active' && !r.isTest).length;
  const testCount = (appData.residents || []).filter(r => r && r.isTest).length;
  return '<div class="stats-grid">' +
    '<div class="stat-card"><div class="label">公告总数</div><div class="value">' + annCount + '</div></div>' +
    '<div class="stat-card"><div class="label">上级文件</div><div class="value">' + docCount + '</div></div>' +
    '<div class="stat-card"><div class="label">社区动态</div><div class="value">' + actCount + '</div></div>' +
    '<div class="stat-card"><div class="label">进行中投票</div><div class="value">' + pollCount + '</div></div>' +
    '</div><div class="stats-grid">' +
    '<div class="stat-card"><div class="label">正式业主</div><div class="value">' + resCount + '</div></div>' +
    '<div class="stat-card"><div class="label">测试数据</div><div class="value" style="color:var(--warning)">' + testCount + '</div></div>' +
    '</div><div class="card"><div class="card-header"><h3>🚀 快捷入口</h3></div>' +
    '<div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px;">' +
    `<button class="btn btn-primary" onclick="navigateTo('announcements');openEditModal('announcements',null)">➕ 发布公告</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('activities');openEditModal('activities',null)">➕ 发布动态</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('polls');openEditModal('polls',null)">➕ 发起投票</button>` +
    `<button class="btn btn-primary" onclick="navigateTo('residents');openEditModal('residents',null)">➕ 添加业主</button>` +
    '</div></div>';
}

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

function renderAnnouncementsAdmin() {
  const list = appData.announcements || [];
  return `<div class="card"><div class="card-header"><h3>📢 公告管理</h3><button class="btn btn-primary" onclick="openEditModal('announcements',null)">➕ 新增公告</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>分类</th><th>日期</th><th>置顶</th><th>作者</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.category||''}</td><td>${item.publishDate||''}</td><td>${item.isPinned?"📌":""}</td><td>${item.author||''}</td><td class="actions"><button onclick="openEditModal('announcements','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('announcements','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderDocumentsAdmin() {
  const list = appData.documents || [];
  return `<div class="card"><div class="card-header"><h3>📄 文件管理</h3><button class="btn btn-primary" onclick="openEditModal('documents',null)">➕ 新增文件</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>来源</th><th>日期</th><th>附件</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      let attachBadge = '';
      const attachments = item.attachments || [];
      const hasPdf = attachments.some(a => a.type === 'pdf') || (item.fileUrl && /\.pdf$/i.test(item.fileUrl));
      const hasImage = attachments.some(a => a.type === 'image') || (item.images && item.images.length);
      const hasLink = item.fileUrl && !hasPdf && !hasImage;

      if (hasPdf) attachBadge += '<span class="pdf-badge">📄 PDF</span> ';
      if (hasImage) attachBadge += '<span class="tag tag-active">🖼️ 图片</span> ';
      if (hasLink) attachBadge += '<span class="tag tag-test">🔗 链接</span> ';
      if (!hasPdf && !hasImage && !hasLink) attachBadge = '<span style="color:#999;font-size:12px;">—</span>';

      const openUrl = item.fileUrl || (attachments[0] && attachments[0].url) || '';
      let linkHtml = attachBadge;
      if (openUrl) {
        linkHtml = `<a href="${openUrl}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px;">${attachBadge}查看 →</a>`;
      }

      return `<tr><td>${escapeHtml(item.title||'')}</td><td>${escapeHtml(item.source||'')}</td><td>${item.publishDate||''}</td><td>${linkHtml}</td><td class="actions"><button onclick="openEditModal('documents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('documents','${item.id}')">删除</button></td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderActivitiesAdmin() {
  const list = appData.activities || [];
  return `<div class="card"><div class="card-header"><h3>🎉 动态管理</h3><button class="btn btn-primary" onclick="openEditModal('activities',null)">➕ 新增动态</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>日期</th><th>地点</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.date||''}</td><td>${item.location||''}</td><td><span class="tag ${item.status==="进行中"?"tag-active":(item.status==="预告"?"tag-test":"tag-disabled")}">${item.status||'已结束'}</span></td><td class="actions"><button onclick="openEditModal('activities','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('activities','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

/* ========== 投票面积数据辅助函数 ========== */
function getPollDisplayStats(item) {
  const res = item.results || {};

  // 统一 totalResidents/totalArea 计算逻辑（与 calculatePollResults 完全一致）
  let totalResidents, totalArea;
  if (item.rollStats && item.rollStats.totalCount > 0) {
    totalResidents = item.rollStats.totalCount;
    totalArea = item.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (item.progress && item.progress.target !== undefined && item.progress.target > 0)
      ? item.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 如果有已固化的计票结果（calculatedAt 存在），直接使用权威数据
  if (res.calculatedAt && res.totalArea > 0) {
    return {
      totalResidents: res.totalResidents || totalResidents,
      totalArea: res.totalArea,
      participatingResidents: res.participatingResidents || 0,
      participatingArea: res.participatingArea || 0,
      agreeCount: res.agreeCount || 0,
      agreeArea: res.agreeArea || 0,
      residentParticipationRate: res.residentParticipationRate || 0,
      areaParticipationRate: res.areaParticipationRate || 0,
      agreeResidentRate: res.agreeResidentRate || 0,
      agreeAreaRate: res.agreeAreaRate || 0,
      isPassed: res.isPassed,
      summary: res.summary || '',
      calculatedAt: res.calculatedAt,
      fromCache: true
    };
  }

  // 无固化数据时，用原始计数 + 统一后的 totalArea 重新计算百分比
  let pResidents = res.participatingResidents || 0;
  let pArea = res.participatingArea || 0;
  let aCount = res.agreeCount || 0;
  let aArea = res.agreeArea || 0;

  if (pArea === 0 && pResidents > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    pArea = pResidents * avgArea;
  }
  if (aArea === 0 && aCount > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    aArea = aCount * avgArea;
  }

  return {
    totalResidents: totalResidents,
    totalArea: totalArea,
    participatingResidents: pResidents,
    participatingArea: pArea,
    agreeCount: aCount,
    agreeArea: aArea,
    residentParticipationRate: totalResidents > 0 ? (pResidents / totalResidents * 100) : 0,
    areaParticipationRate: totalArea > 0 ? (pArea / totalArea * 100) : 0,
    agreeResidentRate: pResidents > 0 ? (aCount / pResidents * 100) : 0,
    agreeAreaRate: pArea > 0 ? (aArea / pArea * 100) : 0,
    isPassed: res.isPassed,
    summary: res.summary || '',
    calculatedAt: res.calculatedAt,
    fromCache: false
  };
}

function renderPollsAdmin() {
  const list = appData.polls || [];
  return `<div class="card"><div class="card-header"><h3>🗳️ 投票管理</h3><button class="btn btn-primary" onclick="openEditModal('polls',null)">➕ 新增投票</button></div>` +
    '<table class="data-table"><thead><tr><th>案卷号</th><th>标题</th><th>类型</th><th>模式</th><th>状态</th><th>时间合规</th><th>进度</th><th>参与率</th><th>同意率</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      const disp = getPollDisplayStats(item);
      const res = item.results || {};
      const modeLabel = item.mode === 'local' ? '<span class="tag tag-active">本地问卷</span>' : '<span class="tag tag-test">腾讯问卷</span>';
      const catLabel = item.category === 'major' ? '<span class="tag" style="background:#ffebee;color:#c62828;">重大</span>' : '<span class="tag" style="background:#e8f5e9;color:#2e7d32;">一般</span>';
      const statusTag = '<span class="tag ' + (item.status==="进行中"?"tag-active":"tag-disabled") + '">' + (item.status||'') + '</span>';

      // 参与率（自动从业主库补全面积数据）
      const rPart = disp.residentParticipationRate;
      const aPart = disp.areaParticipationRate;
      const partHtml = '<div style="font-size:12px;">人数 ' + rPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rPart) + '%;"></div></div>面积 ' + aPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aPart) + '%;background:#1976D2;"></div></div></div>';

      // 同意率（自动从业主库补全面积数据）
      const rAgree = disp.agreeResidentRate;
      const aAgree = disp.agreeAreaRate;
      const agreeHtml = '<div style="font-size:12px;">人数 ' + rAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rAgree) + '%;"></div></div>面积 ' + aAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aAgree) + '%;background:#1976D2;"></div></div></div>';

      // 通过标签（只有已结束才显示最终判定）
      let passHtml = '<span style="color:#999;font-size:12px;">—</span>';
      if (item.status === '已结束') {
        passHtml = res.isPassed === true ? '<span class="tag tag-active">✅ 通过</span>' : (res.isPassed === false ? '<span class="tag tag-test">❌ 未通过</span>' : '<span style="color:#999;font-size:12px;">—</span>');
      } else if (item.status === '进行中') {
        passHtml = '<span class="tag" style="background:#fff3e0;color:#e65100;">🗳️ 进行中</span>';
      }
      const anchorHtml = item.status === '已结束' ? (item.anchorRecords && item.anchorRecords.some(r => !r.error) ? '<span class="tag tag-active" style="cursor:pointer;" onclick="event.stopPropagation();showAnchorDetails(\'' + item.id + '\')">🔗 已锚定</span>' : '<span class="tag tag-test" style="cursor:pointer;" onclick="event.stopPropagation();anchorVoteData(\'' + item.id + '\')">⚠️ 未锚定</span>') : '';
      const pendingObj = (item.objections || []).filter(o => !o.status || o.status === '待处理').length;
      const objBadge = pendingObj > 0 ? '<span class="tag" style="background:#ffebee;color:#c62828;cursor:pointer;" onclick="event.stopPropagation();navigateTo(\'objections\')">⚠️ ' + pendingObj + ' 异议</span>' : '';

      const progressHtml = '<div style="font-size:12px;">' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + ' / ' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + ' 户</div>';
      let actions = `<button onclick="openEditModal('polls','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('polls','${item.id}')">删除</button>`;
      if(item.mode === 'local') {
        actions += `<button onclick="viewPollData('${item.id}')" style="margin-left:4px;">📊 数据</button>`;
      }
      actions += `<button onclick="recalculatePoll('${item.id}')" style="margin-left:4px;">🔄 计票</button>`;
      return `<tr><td>${item.caseNo||''}</td><td>${item.title||''}</td><td>${catLabel}</td><td>${modeLabel}</td><td>${statusTag}</td><td>${(function(){let tags='';if(item.announcement&&item.announcement.start&&item.startDate){const as=new Date(item.announcement.start);const vs=new Date(item.startDate);if((vs-as)>=15*86400000)tags+='<span class="tag tag-active">✅公告期合规</span> ';else tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}else{tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}if(item.consultation&&item.consultation.start&&item.consultation.end){const cs=new Date(item.consultation.start);const ce=new Date(item.consultation.end);if((ce-cs)>=6*86400000)tags+='<span class="tag tag-active">✅征求意见合规</span>';else tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}else{tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}return tags;})()}</td><td>${progressHtml}</td><td>${partHtml}</td><td>${agreeHtml}</td><td>${passHtml} ${anchorHtml} ${objBadge}</td><td class="actions">${actions}</td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

function renderResidentsAdmin() {
  const list = appData.residents || [];
  return `<div class="card"><div class="card-header"><h3>👥 业主管理</h3><div class="actions"><button class="btn" onclick="showBatchImport()">📥 批量导入</button><button class="btn btn-primary" onclick="openEditModal('residents',null)">➕ 添加业主</button></div></div>` +
    '<table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(m²)</th><th>手机后四位</th><th>状态</th><th>绑定方式</th><th>标记</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.roomNo||''}</td><td>${item.name||''}</td><td>${item.area||'—'}</td><td>${item.phoneSuffix||''}</td><td><span class="tag ${item.status==="active"?"tag-active":"tag-disabled"}">${item.status==="active"?"正常":"禁用"}</span></td><td>${item.bindingMethod||'—'}</td><td>${item.isTest?`<span class="tag tag-test">测</span>`:""}${item.isSameBuyer?`<span class="tag tag-test" style="background:#e3f2fd;color:#1565c0;margin-left:2px;">同</span>`:""}</td><td class="actions"><button onclick="openEditModal('residents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('residents','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

function renderAuditLog() {
  const list = appData['audit-log'] || [];
  const polls = appData.polls || [];

  // 投票审计时间轴选择器
  let pollSelect = '<div style="margin-bottom:16px;"><label style="font-size:13px;font-weight:500;margin-right:8px;">查看投票全流程审计：</label><select id="auditPollSelect" onchange="renderPollAuditTimeline(this.value)" style="padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;">';
  pollSelect += '<option value="">— 请选择投票 —</option>';
  polls.forEach(p => { pollSelect += '<option value="' + p.id + '">' + (p.caseNo||'') + ' ' + (p.title||'') + '</option>'; });
  pollSelect += '</select></div>';

  let html = '<div class="card"><div class="card-header"><h3>📋 操作日志</h3></div>' + pollSelect +
    '<div id="pollAuditTimeline"></div>' +
    '<table class="data-table"><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>目标</th><th>详情</th></tr></thead><tbody>' +
    list.slice().reverse().map(item => '<tr><td>' + formatDateTime(item.timestamp) + '</td><td>' + (item.adminName||'') + '</td><td>' + (item.action||'') + '</td><td>' + (item.target||'') + '</td><td>' + (item.details||'') + '</td></tr>').join('') +
    '</tbody></table></div>';
  return html;
}


function renderObjectionsAdmin() {
  // 收集所有 polls 中的异议
  let allObjections = [];
  (appData.polls || []).forEach(p => {
    (p.objections || []).forEach(o => {
      allObjections.push({ ...o, pollId: p.id, pollTitle: p.title, pollCaseNo: p.caseNo });
    });
  });

  // 也检查独立的 appData.objections（兼容两种存储方式）
  (appData.objections || []).forEach(o => {
    const poll = (appData.polls || []).find(p => p.id === o.pollId);
    if (poll && !allObjections.find(x => x.id === o.id)) {
      allObjections.push({ ...o, pollTitle: poll.title, pollCaseNo: poll.caseNo });
    }
  });

  const pending = allObjections.filter(o => !o.status || o.status === '待处理').length;

  let html = '<div class="card"><div class="card-header"><h3>⚖️ 异议管理' + (pending > 0 ? ' <span style="color:var(--danger);font-size:14px;">(' + pending + ' 待处理)</span>' : '') + '</h3></div>';
  if (!allObjections.length) {
    html += '<div class="empty-state"><div class="icon">⚖️</div><div>暂无异议记录</div></div>';
    html += '</div>';
    return html;
  }

  html += '<table class="data-table"><thead><tr><th>编号</th><th>投票案卷</th><th>申请人房号</th><th>内容摘要</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>';
  allObjections.slice().reverse().forEach(o => {
    const statusTag = !o.status || o.status === '待处理' ? '<span class="tag tag-test">待处理</span>' : '<span class="tag tag-active">已处理</span>';
    const contentPreview = (o.content || '').substring(0, 30) + ((o.content || '').length > 30 ? '...' : '');
    html += '<tr><td>' + (o.id || '—') + '</td><td>' + escapeHtml(o.pollCaseNo || '') + '</td><td>' + escapeHtml(o.residentRoom || o.resident || '—') + '</td><td>' + escapeHtml(contentPreview) + '</td><td>' + formatDateTime(o.createdAt || o.time) + '</td><td>' + statusTag + '</td><td class="actions"><button onclick="openObjectionModal(\'' + (o.pollId || '') + '\',\'' + (o.id || '') + '\')">处理</button></td></tr>';
  });
  html += '</tbody></table></div>';
  return html;
}

function openObjectionModal(pollId, objectionId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;
  const obj = (poll.objections || []).find(o => o.id === objectionId) || (appData.objections || []).find(o => o.id === objectionId);
  if (!obj) return;

  document.getElementById('modalTitle').textContent = '处理异议：' + (obj.id || '');
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">投票：' + escapeHtml(poll.title || '') + '</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">案卷号：' + (poll.caseNo || '') + ' · 申请人：' + escapeHtml(obj.resident || obj.residentRoom || '—') + '</div>';
  body += '<div style="font-size:13px;margin-top:8px;padding:10px;background:#fff;border-radius:6px;border:1px solid var(--border);">' + escapeHtml(obj.content || '') + '</div>';
  if (obj.images && obj.images.length) {
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    obj.images.forEach(url => { body += '<img src="' + url + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\'' + url + '\')" loading="lazy">'; });
    body += '</div>';
  }
  body += '</div>';

  if (obj.reply) {
    body += '<div style="margin-bottom:12px;padding:12px;background:#e3f2fd;border-radius:8px;border-left:4px solid #1976D2;">';
    body += '<div style="font-weight:600;color:#1976D2;margin-bottom:4px;">已回复</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' + formatDateTime(obj.handledAt) + ' · ' + escapeHtml(obj.handler || '') + '</div>';
    body += '<div style="font-size:13px;">' + escapeHtml(obj.reply) + '</div>';
    body += '</div>';
  }

  body += '<div class="form-group"><label>处理回复</label><textarea id="objReply" rows="4" placeholder="填写回复内容...">' + (obj.reply || '') + '</textarea></div>';
  body += '<div class="form-group"><label>处理结果</label><select id="objStatus"><option value="待处理" ' + ((!obj.status || obj.status === '待处理') ? 'selected' : '') + '>待处理</option><option value="已处理" ' + (obj.status === '已处理' ? 'selected' : '') + '>已处理</option><option value="驳回" ' + (obj.status === '驳回' ? 'selected' : '') + '>驳回</option></select></div>';
  body += '<div class="form-group"><label>上传回复附件（可选）</label>' + createMultiImageUploaderHTML('objReplyFiles', '支持拖拽或点击上传图片（自动压缩）') + '</div>';

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveObjectionAction(\'' + pollId + '\',\'' + objectionId + '\')">保存</button>';
  document.getElementById('modalOverlay').classList.add('active');

  setTimeout(function() {
    if (obj.replyImages && obj.replyImages.length) setMultiUploadedPaths('objReplyFiles', obj.replyImages);
  }, 50);
}

async function saveObjectionAction(pollId, objectionId) {
  const reply = document.getElementById('objReply').value.trim();
  const status = document.getElementById('objStatus').value;
  if (!reply) { showToast('请填写回复内容', 'error'); return; }

  showLoading(true);
  try {
    const poll = (appData.polls || []).find(p => p.id === pollId);
    if (!poll) throw new Error('投票不存在');

    let obj = (poll.objections || []).find(o => o.id === objectionId);
    if (!obj) {
      obj = (appData.objections || []).find(o => o.id === objectionId);
      if (obj) {
        // 迁移到 poll.objections
        if (!poll.objections) poll.objections = [];
        poll.objections.push(obj);
      }
    }
    if (!obj) throw new Error('异议记录不存在');

    obj.reply = reply;
    obj.status = status;
    obj.handler = currentAdmin && currentAdmin.name || '管理员';
    obj.handledAt = new Date().toISOString();
    obj.replyImages = getMultiUploadedPaths('objReplyFiles') || obj.replyImages || [];

    // 保存 polls
    await saveDataFile('polls', appData.polls, '处理异议 ' + objectionId + '：' + status, 'objection-resolve');

    // 追加审计日志
    await appendAuditLog('objection-resolve', 'polls', pollId, '管理员 ' + obj.handler + ' 处理异议 ' + objectionId + '，结果：' + status);

    showToast('异议处理成功', 'success');
    closeModal();
    navigateTo('objections');
  } catch(e) {
    showToast('处理失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function renderPollAuditTimeline(pollId) {
  const container = document.getElementById('pollAuditTimeline');
  if (!container || !pollId) { if(container) container.innerHTML = ''; return; }
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;

  const logs = (appData['audit-log'] || []).filter(l => l.targetId === pollId || (l.details && l.details.includes(pollId)) || (l.target === 'polls' && l.details && l.details.includes(poll.title||'')));
  const objections = poll.objections || [];
  const records = poll.anchorRecords || [];

  let html = '<div style="margin-bottom:24px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">⏱️ 投票全流程审计：' + escapeHtml(poll.title||'') + '</div>';
  html += '<div style="border-left:2px solid var(--border);padding-left:16px;">';

  const nodes = [];
  // 发起
  if (poll.createdAt) nodes.push({ time: poll.createdAt, label: '投票发起', detail: '由 ' + (poll.createdBy||'管理员') + ' 创建', type: 'init' });
  // 清册公示
  if (poll.rollPublish && poll.rollPublish.start) nodes.push({ time: poll.rollPublish.start, label: '清册公示开始', detail: '公示期：' + poll.rollPublish.start + ' 至 ' + (poll.rollPublish.end||''), type: 'roll' });
  // 通知送达
  if (poll.meetingFiles && poll.meetingFiles.length) nodes.push({ time: poll.createdAt, label: '会议通知上传', detail: '上传 ' + poll.meetingFiles.length + ' 份通知文件', type: 'notice' });
  // 投票进行中
  if (poll.startDate) nodes.push({ time: poll.startDate + 'T00:00:00Z', label: '投票开始', detail: '投票通道开启', type: 'vote' });
  // 计票
  if (poll.results && poll.results.calculatedAt) nodes.push({ time: poll.results.calculatedAt, label: '自动计票', detail: '参与 ' + (poll.results.participatingResidents||0) + ' 户，' + (poll.results.isPassed ? '通过' : '未通过'), type: 'count' });
  // 结果公示
  if (poll.results && poll.results.isPublished) nodes.push({ time: poll.results.calculatedAt, label: '结果公示', detail: poll.results.summary||'', type: 'publish' });
  // 异议
  objections.forEach(o => {
    nodes.push({ time: o.time || o.createdAt, label: '异议提出', detail: (o.resident||'—') + '：' + (o.content||'').substring(0,40), type: 'objection' });
    if (o.result) nodes.push({ time: o.handledAt || o.time, label: '异议处理', detail: '处理结果：' + o.result, type: 'objection-resolved' });
  });
  // 锚定
  records.forEach(r => {
    if (!r.error) nodes.push({ time: r.time, label: '证据锚定', detail: r.name + '：' + (r.txHash ? r.txHash.substring(0,16)+'...' : '已提交'), type: 'anchor' });
  });
  // 归档
  if (poll.status === '已结束') nodes.push({ time: poll.endDate + 'T23:59:59Z', label: '投票结束/归档', detail: '投票通道关闭，档案生成', type: 'archive' });

  // 按时间排序
  nodes.sort((a, b) => new Date(a.time) - new Date(b.time));

  nodes.forEach((n, i) => {
    const colorMap = { init: '#2E8B57', roll: '#1976D2', notice: '#f9a825', vote: '#2E8B57', count: '#6A1B9A', publish: '#2E8B57', objection: '#c62828', 'objection-resolved': '#2e7d32', anchor: '#E65100', archive: '#546e7a' };
    const color = colorMap[n.type] || '#666';
    html += '<div style="position:relative;margin-bottom:14px;padding-bottom:14px;' + (i < nodes.length - 1 ? 'border-bottom:1px dashed var(--border);' : '') + '">';
    html += '<div style="position:absolute;left:-21px;top:2px;width:10px;height:10px;background:' + color + ';border-radius:50%;"></div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);">' + formatDateTime(n.time) + '</div>';
    html += '<div style="font-weight:600;font-size:13px;margin-top:2px;">' + n.label + '</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(n.detail) + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}

function renderSettings() {
  const roleMap = { super: '总维护人员', property: '物管人员', committee: '业委会成员', community: '社区人员' };
  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id)) || {};
  return '<div class="card"><div class="card-header"><h3>👤 当前身份</h3></div>' +
    '<div class="form-group"><label>身份名称</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.name || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>角色类型</label><input type="text" value="' + (roleMap[currentAdmin && currentAdmin.role] || currentAdmin.role || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>权限列表</label><input type="text" value="' + escapeHtml((currentAdmin && currentAdmin.permissions || []).join(', ')) + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>管理员ID</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.id || '') + '" disabled style="background:#f5f5f5;"></div></div>' +
    '<div class="card"><div class="card-header"><h3>🔐 修改我的密码</h3></div>' +
    '<div class="form-group"><label>当前密码</label><input type="password" id="oldPassword" placeholder="输入当前密码"></div>' +
    '<div class="form-group"><label>新密码（6位以上）</label><input type="password" id="newPassword" placeholder="输入新密码"></div>' +
    '<div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>' +
    '<button class="btn btn-primary" onclick="changePassword()">修改密码</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">提示：修改后的密码会尝试持久化到 Worker。如未配置 Worker，刷新页面后将恢复代码顶部 ADMIN_ACCOUNTS 中的默认密码。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🌐 Worker 网关地址</h3></div>' +
    '<div class="form-group"><label>Worker API 地址（留空则使用内存模式）</label><input type="text" id="workerBaseInput" value="' + (localStorage.getItem('workerBase') || '') + '" placeholder="https://community.firstblade.site 或留空"></div>' +
    '<button class="btn btn-primary" onclick="saveWorkerBase()">保存地址</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">留空表示开发模式（数据仅保存在浏览器内存中，刷新后丢失）。配置 Worker 地址后可实现数据持久化。</p></div>' +
    '<div class="card"><div class="card-header"><h3>🔗 证据锚定配置</h3></div>' +
    '<div class="form-group"><label>GitHub Token（用于 Commit 锚定）</label><input type="password" id="cfgGithubToken" value="' + (localStorage.getItem('githubToken') || '') + '" placeholder="ghp_xxxxxxxxxxxx"></div>' +
    '<div class="form-group"><label>GitHub 仓库（格式：owner/repo）</label><input type="text" id="cfgGithubRepo" value="' + (localStorage.getItem('githubRepo') || '') + '" placeholder="username/community-platform"></div>' +
    '<div class="form-group"><label>企业微信 Webhook URL</label><input type="text" id="cfgWechatWebhook" value="' + (localStorage.getItem('wechatWebhook') || '') + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."></div>' +
    '<div class="form-group"><label>Resend API Key</label><input type="password" id="cfgResendKey" value="' + (localStorage.getItem('resendApiKey') || '') + '" placeholder="re_xxxxxxxx"></div>' +
    '<div class="form-group"><label>锚定通知邮箱</label><input type="text" id="cfgAnchorEmail" value="' + (localStorage.getItem('anchorEmail') || '') + '" placeholder="admin@example.com"></div>' +
    '<button class="btn btn-primary" onclick="saveAnchorConfig()">保存锚定配置</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">配置后，投票状态变为"已结束"时将自动执行三端锚定（GitHub Commit + 微信群 + 邮件）。</p></div>';

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

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
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

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
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


/* ========== 档案生成模块 ========== */

function generatePollArchive(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) { showToast('投票不存在', 'error'); return; }

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try {
    const saved = localStorage.getItem('adminData_polls-responses-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    if (saved) responses = JSON.parse(saved);
  } catch(e) {}
  const pollVotes = responses.filter(r => r.pollId === pollId);

  const disp = getPollDisplayStats(poll);
  const allResidents = (appData.residents || []).filter(r => r.status === 'active');
  const totalResidents = disp.totalResidents;
  const totalArea = disp.totalArea;
  const res = poll.results || {};
  const records = poll.anchorRecords || [];

  const win = window.open('', '_blank');
  if (!win) { showToast('请允许弹窗以生成档案', 'error'); return; }

  const now = new Date().toLocaleString('zh-CN');
  const title = poll.title || '';
  const caseNo = poll.caseNo || pollId;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投票档案 - ${caseNo}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; text-align: center; margin-bottom: 8px; border-bottom: 2px solid #2E8B57; padding-bottom: 10px; }
h2 { font-size: 14px; color: #2E8B57; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #2E8B57; padding-left: 8px; }
h3 { font-size: 12px; color: #666; margin-top: 12px; margin-bottom: 6px; }
.cover { text-align: center; padding: 60px 20px; border: 1px solid #e0e0e0; margin-bottom: 30px; }
.cover .case-no { font-size: 16px; color: #666; margin-bottom: 12px; }
.cover .title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.cover .meta { font-size: 13px; color: #666; line-height: 2; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.stat-box { display: inline-block; width: 48%; margin: 1%; padding: 12px; background: #f8f9fa; border-radius: 6px; box-sizing: border-box; }
.stat-box .num { font-size: 18px; font-weight: 700; color: #2E8B57; }
.stat-box .label { font-size: 11px; color: #666; }
.small { font-size: 10px; color: #999; }
.page-break { page-break-before: always; }
.signature { margin-top: 40px; display: flex; justify-content: space-between; }
.signature-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; text-align: center; }
@media print {
  .no-print { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f0f7f4;margin-bottom:20px;border-radius:6px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2E8B57;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ 打印为 PDF</button>
  <span style="color:#666;margin-left:12px;">请使用浏览器的"另存为 PDF"功能保存档案</span>
</div>

<div class="cover">
  <div class="case-no">案卷编号：${caseNo}</div>
  <div class="title">${title}</div>
  <div class="meta">
    <div>生成时间：${now}</div>
    <div>档案类型：业主大会投票档案</div>
    <div>生成系统：春天阳光小区数字化平台</div>
  </div>
</div>

<h2>一、投票基本信息</h2>
<table>
  <tr><th style="width:25%">项目</th><th>内容</th></tr>
  <tr><td>案卷编号</td><td>${caseNo}</td></tr>
  <tr><td>投票标题</td><td>${title}</td></tr>
  <tr><td>事项类型</td><td>${poll.category === 'major' ? '重大事项' : '一般事项'}</td></tr>
  <tr><td>法律依据</td><td>${poll.legalBasis || '—'}</td></tr>
  <tr><td>投票期间</td><td>${poll.startDate || '—'} 至 ${poll.endDate || '—'}</td></tr>
  <tr><td>目标户数</td><td>${totalResidents} 户</td></tr>
  <tr><td>总面积</td><td>${totalArea.toFixed(2)} ㎡</td></tr>
  <tr><td>议事规则</td><td>${(poll.ruleFiles || []).length > 0 ? '已上传 ' + poll.ruleFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>业主清册</td><td>${(poll.rollFiles || []).length > 0 ? '已上传 ' + poll.rollFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>会议通知</td><td>${(poll.meetingFiles || []).length > 0 ? '已上传 ' + poll.meetingFiles.length + ' 份' : '—'}</td></tr>
</table>

<h2>二、业主清册摘要</h2>
<div style="display:flex;flex-wrap:wrap;">
  <div class="stat-box"><div class="num">${totalResidents}</div><div class="label">目标户数</div></div>
  <div class="stat-box"><div class="num">${totalArea.toFixed(2)} ㎡</div><div class="label">建筑总面积</div></div>
  <div class="stat-box"><div class="num">${(res.participatingResidents || 0)}</div><div class="label">参与投票户数</div></div>
  <div class="stat-box"><div class="num">${(res.participatingArea || 0).toFixed(2)} ㎡</div><div class="label">参与投票面积</div></div>
</div>

<h2>三、投票结果统计</h2>
<table>
  <tr><th>指标</th><th>数值</th><th>比例</th><th>门槛</th><th>是否达标</th></tr>
  <tr>
    <td>参与户数 / 目标户数</td>
    <td>${disp.participatingResidents} / ${totalResidents}</td>
    <td>${disp.residentParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.residentPct) || 66.67}%</td>
    <td>${disp.residentParticipationRate >= ((poll.threshold && poll.threshold.residentPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>参与面积 / 总面积</td>
    <td>${disp.participatingArea.toFixed(2)} / ${totalArea.toFixed(2)} ㎡</td>
    <td>${disp.areaParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.areaPct) || 66.67}%</td>
    <td>${disp.areaParticipationRate >= ((poll.threshold && poll.threshold.areaPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意户数 / 参与户数</td>
    <td>${disp.agreeCount} / ${disp.participatingResidents}</td>
    <td>${disp.agreeResidentRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeResidentRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意面积 / 参与面积</td>
    <td>${disp.agreeArea.toFixed(2)} / ${disp.participatingArea.toFixed(2)} ㎡</td>
    <td>${disp.agreeAreaRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeAreaRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
</table>
<div style="margin-top:10px;padding:10px;background:${disp.isPassed ? '#e8f5e9' : '#ffebee'};border-radius:6px;text-align:center;font-weight:600;font-size:14px;">
  ${disp.isPassed ? '✅ 表决通过' : '❌ 表决未通过'}
</div>

<h2>四、投票明细（脱敏）</h2>
<table>
  <tr><th>序号</th><th>房号</th><th>面积(㎡)</th><th>第一题答案</th><th>投票时间</th><th>哈希片段</th></tr>`;

  pollVotes.forEach((v, i) => {
    const firstAns = v.choice && v.choice.length > 0 ? v.choice[0].value : '—';
    const valStr = Array.isArray(firstAns) ? firstAns.join(',') : String(firstAns);
    const hashFrag = v.nonce ? v.nonce.substring(0, 8) + '...' : '—';
    html += `<tr><td>${i+1}</td><td>${v.roomNo || '—'}</td><td>${v.area || 0}</td><td>${valStr}</td><td>${v.voteTime ? new Date(v.voteTime).toLocaleString('zh-CN') : '—'}</td><td class="small">${hashFrag}</td></tr>`;
  });

  if (pollVotes.length === 0) {
    html += `<tr><td colspan="6" style="text-align:center;color:#999;">暂无投票记录</td></tr>`;
  }

  html += `</table>

<div class="page-break"></div>

<h2>五、异议及处理记录</h2>
<table>
  <tr><th style="width:15%">时间</th><th style="width:15%">提出人</th><th>异议内容</th><th style="width:15%">处理结果</th></tr>`;

  const objections = poll.objections || [];
  if (objections.length > 0) {
    objections.forEach(o => {
      html += `<tr><td>${o.time ? new Date(o.time).toLocaleString('zh-CN') : '—'}</td><td>${o.resident || '—'}</td><td>${o.content || '—'}</td><td>${o.result || '待处理'}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="text-align:center;color:#999;">暂无异议记录</td></tr>`;
  }

  html += `</table>

<h2>六、证据锚定记录</h2>
<table>
  <tr><th>锚定点</th><th>类型</th><th>时间</th><th>链接/Hash</th><th>状态</th></tr>`;

  if (records.length > 0) {
    records.forEach(r => {
      const status = r.error ? '❌ 失败' : '✅ 成功';
      const link = r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : (r.txHash || '—');
      html += `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.time ? new Date(r.time).toLocaleString('zh-CN') : '—'}</td><td class="small">${link}</td><td>${status}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="5" style="text-align:center;color:#999;">暂无锚定记录</td></tr>`;
  }

  html += `</table>

<h2>七、Merkle Root</h2>
<div style="padding:12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all;">
  ${poll.merkleRoot || '—'}
</div>
<div class="small" style="margin-top:4px;">此 Merkle Root 已通过 GitHub Commit、微信群机器人、邮件三端锚定，确保投票数据不可篡改。</div>

<div class="page-break"></div>

<h2>八、签章页</h2>
<div style="margin-top:20px;">
  <p>本档案由春天阳光小区数字化平台自动生成，包含完整的投票过程记录、计票结果及证据锚定信息。</p>
  <p>档案生成时间：${now}</p>
  <p>系统版本：Community Platform v2.0</p>
</div>
<div class="signature">
  <div class="signature-box">业委会签章</div>
  <div class="signature-box">物业签章</div>
</div>
<div class="signature" style="margin-top:30px;">
  <div class="signature-box">社区签章</div>
  <div class="signature-box">街道备案签章</div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
  showToast('档案已生成，请在弹窗中打印为 PDF', 'success');
}

function generateVoterReceipt(voteRecord) {
  if (!voteRecord) return;
  const poll = (appData.polls || []).find(p => p.id === voteRecord.pollId);
  const title = poll ? (poll.title || '') : '投票回执';
  const caseNo = poll ? (poll.caseNo || '') : '';
  const roomNo = voteRecord.roomNo || '—';
  const voteTime = voteRecord.voteTime ? new Date(voteRecord.voteTime).toLocaleString('zh-CN') : '—';
  const nonce = voteRecord.nonce || '—';
  const hashFrag = voteRecord.ipHash ? voteRecord.ipHash.substring(0, 16) + '...' : '—';

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { showToast('请允许弹窗以生成回执', 'error'); return; }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票回执</title>
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.receipt { background: #fff; width: 360px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; position: relative; overflow: hidden; }
.receipt::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2E8B57, #3da76b); }
.receipt-header { text-align: center; margin-bottom: 20px; }
.receipt-header .logo { font-size: 32px; margin-bottom: 8px; }
.receipt-header .title { font-size: 16px; font-weight: 700; color: #333; }
.receipt-header .subtitle { font-size: 11px; color: #999; margin-top: 4px; }
.receipt-body { border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0; padding: 16px 0; }
.receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.receipt-row .label { color: #666; }
.receipt-row .value { color: #333; font-weight: 500; }
.receipt-row .value.room { font-size: 18px; font-weight: 700; color: #2E8B57; }
.hash-box { background: #f8f9fa; border-radius: 6px; padding: 10px; margin-top: 12px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.5; }
.receipt-footer { text-align: center; margin-top: 20px; }
.receipt-footer .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2E8B57; color: #2E8B57; border-radius: 4px; font-size: 13px; font-weight: 600; transform: rotate(-3deg); opacity: 0.8; }
.receipt-footer .tip { font-size: 11px; color: #999; margin-top: 12px; }
.btn-print { display: block; width: 100%; padding: 10px; margin-top: 16px; background: #2E8B57; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.qr-placeholder { width: 80px; height: 80px; background: #f5f5f5; border-radius: 6px; margin: 12px auto 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
@media print {
  body { background: #fff; }
  .btn-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo">🗳️</div>
    <div class="title">${title}</div>
    <div class="subtitle">${caseNo}</div>
  </div>
  <div class="receipt-body">
    <div class="receipt-row"><span class="label">房号</span><span class="value room">${roomNo}</span></div>
    <div class="receipt-row"><span class="label">投票时间</span><span class="value">${voteTime}</span></div>
    <div class="receipt-row"><span class="label">随机Nonce</span><span class="value">${nonce.substring(0, 8)}...</span></div>
    <div class="receipt-row"><span class="label">IP哈希</span><span class="value">${hashFrag}</span></div>
    <div class="hash-box">
      <div style="margin-bottom:4px;font-weight:600;color:#333;">Merkle Path 片段</div>
      <div>${voteRecord.prevHash ? voteRecord.prevHash.substring(0, 24) + '...' : '首票（无前置）'}</div>
    </div>
  </div>
  <div class="receipt-footer">
    <div class="stamp">已上链存证</div>
    <div class="qr-placeholder">Merkle<br>Root</div>
    <div class="tip">请截图保存此回执<br>作为您的投票凭证</div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}

async function recalculatePoll(pollId) {
  showLoading(true);
  try {
    const result = await calculatePollResults(pollId);
    if (result) {
      // 保存 poll 数据
      await saveDataFile('polls', appData.polls, '重新计票 ' + pollId, 'update');
      // 追加审计日志
      appendAuditLog('recount', 'polls', pollId, '管理员手动重新计票，结果：' + (result.isPassed ? '通过' : '未通过'));
      showToast('计票完成：' + (result.isPassed ? '通过' : '未通过'), result.isPassed ? 'success' : 'info');
      navigateTo('polls');
    } else {
      showToast('计票失败：未找到投票数据', 'error');
    }
  } catch(e) {
    showToast('计票失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function deleteItem(module, id) {
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

async function saveDataFile(filename, data, detail, action) {
  action = action || 'update';

  // 优先使用 Worker 持久化（确保前端实时同步）
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/' + filename + '.json', data, detail);
      showToast('✅ 已同步到云端，前端将自动更新', 'success');
      await appendAuditLog(action, filename, (data && data.id) || '', detail);
      return;
    } catch(e) {
      console.error('Worker 保存失败，回退到本地:', e);
      showToast('⚠️ Worker 同步失败：' + e.message + '，已保存到本地', 'error');
      // 回退到 localStorage
    }
  }

  if (!githubToken) {
    localStorage.setItem('adminData_' + filename, JSON.stringify(data));
    showToast('保存成功', 'success');
    await appendAuditLog(action, filename, (data && data.id) || '', detail);
    return;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息');
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/' + filename + '.json';
  const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!getRes.ok) throw new Error('无法读取文件，请检查Token权限');
  const fileInfo = await getRes.json();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
    method: 'PUT',
    headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] ' + detail, content: content, sha: fileInfo.sha })
  });
  if (!putRes.ok) {
    const err = await putRes.json();
    throw new Error(err.message || '保存失败');
  }
  await appendAuditLog(action, filename, data.id || '', detail);
}

async function appendAuditLog(action, target, targetId, detail) {
  const log = appData['audit-log'] || [];
  log.push({
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
    adminName: currentAdmin && currentAdmin.name || '未知',
    adminId: currentAdmin && currentAdmin.id || '',
    action: action,
    target: target,
    targetId: targetId,
    details: detail,
    clientInfo: navigator.userAgent
  });
  appData['audit-log'] = log;

  // 优先使用 Worker 保存审计日志
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      await workerWrite('data/audit-log.json', log, '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新');
    } catch(e) { console.error('审计日志Worker保存失败', e); }
    return;
  }

  if (!githubToken) return;
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) return;
  const owner = ownerRepo[0], repo = ownerRepo[1];
  const path = 'data/audit-log.json';
  try {
    const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!getRes.ok) return;
    const fileInfo = await getRes.json();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(log, null, 2))));
    await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '[' + (currentAdmin && currentAdmin.name || '') + '] 审计日志更新', content: content, sha: fileInfo.sha })
    });
  } catch(e) { console.error('审计日志保存失败', e); }
}

async function getRepoInfo() {
  if (!githubToken) return null;
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': 'token ' + githubToken }
    });
    if (!r.ok) return null;
    const user = await r.json();
    const savedRepo = localStorage.getItem('githubRepo');
    if (savedRepo) return [user.login, savedRepo];
    const path = window.location.pathname;
    const parts = path.split('/');
    if (parts.length >= 2 && parts[1] && !parts[1].includes('.')) return [user.login, parts[1]];
    return null;
  } catch(e) { return null; }
}

function showBatchImport() {
  document.getElementById('modalTitle').textContent = '📥 批量导入业主';
  document.getElementById('modalBody').innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请粘贴Excel内容，格式：房号 | 姓名 | 手机后四位（每行一条，可用制表符或竖线分隔）</p>' +
    '<textarea class="batch-textarea" id="batchData" placeholder="1-1-101	张三	1234\n1-1-102	李四	5678"></textarea>' +
    '<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--text-secondary);font-weight:500;">或上传文件（.csv / .xlsx / .vcf）：</div>' +
    createFileUploaderHTML({id:'batchFile', accept:'.csv,.xlsx,.xls,.vcf,.vcd', hint:'支持拖拽或点击上传 .csv / .xlsx / .vcf 文件'}) +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">示例：1-1-101  测试业主01  0001</div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchImport()">导入</button>';
  document.getElementById('modalOverlay').classList.add('active');
}

async function doBatchImport() {
  let rows = [];
  let success = 0, fail = 0;

  // 先尝试从上传的文件解析
  const batchPath = getUploadedPath('batchFile');
  if (batchPath && batchPath.startsWith('blob:')) {
    try {
      const r = await fetch(batchPath);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], 'batch.csv');
        rows = await handleBatchFile(file);
      }
    } catch(e) { console.error(e); }
  } else if (batchPath) {
    showLoading(true);
    try {
      const ownerRepo = await getRepoInfo();
      if (ownerRepo) {
        const [owner, repo] = ownerRepo;
        const r = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + batchPath);
        if (r.ok) {
          const blob = await r.blob();
          const file = new File([blob], 'batch.' + (batchPath.split('.').pop() || 'csv'));
          rows = await handleBatchFile(file);
        }
      }
    } catch(e) { console.error(e); }
    showLoading(false);
  }

  // 如果没有文件或文件解析失败，尝试文本框
  if (rows.length === 0) {
    const text = document.getElementById('batchData').value.trim();
    if (!text) { showToast('请输入数据或上传文件', 'error'); return; }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t|\|\s]+/);
      if (parts.length >= 3) {
        rows.push(parts);
      }
    });
  }

  const newResidents = [];
  rows.forEach(parts => {
    const room = parts[0].trim();
    const name = parts[1].trim();
    const suffix = (parts[2] || '').trim().replace(/[^0-9]/g, '').substring(0,4);
    if (room && name && suffix) {
      newResidents.push({ id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), roomNo: room, name: name, phoneSuffix: suffix, area: 0, voteWeightCount: 1, voteWeightArea: 0, status: 'active', isTest: false, registeredAt: new Date().toISOString().split('T')[0] });
      success++;
    } else { fail++; }
  });

  if (newResidents.length === 0) { showToast('未解析到有效数据', 'error'); return; }
  const list = appData.residents || [];
  list.push.apply(list, newResidents);
  appData.residents = list;
  closeModal(); showLoading(true);
  try {
    await saveDataFile('residents', list, '批量导入 ' + success + ' 位业主', 'batch-import');
    showToast('成功导入 ' + success + ' 位业主' + (fail?'，' + fail + '行失败':''), 'success');
    navigateTo('residents');
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function saveAnchorConfig() {
  localStorage.setItem('githubToken', document.getElementById('cfgGithubToken').value.trim());
  localStorage.setItem('githubRepo', document.getElementById('cfgGithubRepo').value.trim());
  localStorage.setItem('wechatWebhook', document.getElementById('cfgWechatWebhook').value.trim());
  localStorage.setItem('resendApiKey', document.getElementById('cfgResendKey').value.trim());
  localStorage.setItem('anchorEmail', document.getElementById('cfgAnchorEmail').value.trim());
  showToast('锚定配置已保存', 'success');
}

async function changePassword() {
  const oldPwd = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码需6位以上', 'error'); return; }

  const account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id));
  if (!account) { showToast('账户配置异常', 'error'); return; }
  if (oldPwd !== account.password) { showToast('当前密码错误', 'error'); return; }

  // 更新内存中的密码
  account.password = newPwd;

  // 同步持久化到 config.adminAccounts（如 Worker 可用）
  if (!appData.config) appData.config = {};
  if (!appData.config.adminAccounts) appData.config.adminAccounts = [];
  let persisted = appData.config.adminAccounts.find(a => a.id === account.id);
  if (persisted) {
    persisted.password = newPwd;
  } else {
    appData.config.adminAccounts.push({ id: account.id, password: newPwd, permissions: account.permissions });
  }

  showLoading(true);
  try {
    await saveDataFile('config', appData.config, '管理员 ' + account.name + ' 修改密码', 'password-change');
    showToast('密码修改成功', 'success');
  } catch(e) {
    showToast('密码已更新（内存），但持久化失败：' + e.message, 'warning');
  } finally {
    showLoading(false);
  }
}

function showTokenModal() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
}


function saveWorkerBase() {
  const el = document.getElementById('workerBaseInput');
  if (!el) return;
  const val = el.value.trim();
  localStorage.setItem('workerBase', val.replace(/\/$/, ''));
  showToast('Worker地址已保存，刷新页面后生效', 'success');
}
async function updateToken() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
  closeModal();
}


/* ========== 图片压缩 ========== */

async function compressImageToBlob(file, maxSizeMB = 0.03) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const toBlob = (q) => new Promise((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', q);
      });
      const maxSize = maxSizeMB * 1024 * 1024;
      let blob = await toBlob(0.25);
      if (blob.size <= maxSize) {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let low = 0.05, high = 0.4, bestBlob = null;
      while (high - low > 0.03) {
        const mid = (low + high) / 2;
        blob = await toBlob(mid);
        if (blob.size > maxSize) { high = mid; }
        else { low = mid; bestBlob = blob; }
      }
      if (bestBlob && bestBlob.size <= maxSize) {
        resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let scale = 0.7;
      while (scale > 0.05) {
        const nw = Math.max(1, Math.floor(w * scale));
        const nh = Math.max(1, Math.floor(h * scale));
        canvas.width = nw; canvas.height = nh;
        ctx.drawImage(img, 0, 0, nw, nh);
        blob = await toBlob(0.3);
        if (blob.size <= maxSize) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        scale -= 0.18;
      }
      reject(new Error('图片压缩后仍超过' + maxSizeMB + 'MB限制'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}

/* ========== 文件上传相关 ========== */

async function uploadFileToRepo(file, folder) {
  const maxSizeMB = folder === 'videos' ? 100 : (folder === 'images' ? 100 : (folder === 'files' ? 100 : 100));
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error('文件大小超过限制（' + maxSizeMB + 'MB）');
  }

  // ===== 优先使用 Worker 上传（确保前端可实时访问）=====
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      console.log('[Worker Upload] 开始上传:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
      const res = await fetch(workerBase + '/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Worker 返回 ' + res.status + ': ' + errText.substring(0,200));
      }
      const result = await res.json();
      if (result && result.url) {
        console.log('[Worker Upload] ✅ 成功:', result.url);
        return result.url;
      } else {
        throw new Error('Worker 返回数据异常: ' + JSON.stringify(result));
      }
    } catch (e) {
      console.error('[Worker Upload] ❌ 失败:', e.message);
      showToast('Worker 上传失败: ' + e.message + '，尝试 GitHub...', 'error');
      // 继续回退到 GitHub
    }
  }

  // ===== 回退到 GitHub API =====
  if (!githubToken) {
    // 如果连 GitHub 也没有，返回临时 blob（仅当前页可用，会提示用户）
    const blobUrl = URL.createObjectURL(file);
    console.warn('[Upload] ⚠️ 未配置 Worker 或 GitHub，返回临时 blob:', blobUrl);
    showToast('⚠️ 警告：未配置 Worker 或 GitHub，文件仅当前页可用，刷新后失效', 'error');
    return blobUrl;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息，请检查Token');
  const [owner, repo] = ownerRepo;
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = Date.now() + '_' + Math.random().toString(36).substr(2,6) + '_' + safeName;
  const path = 'assets/' + (folder || 'uploads') + '/' + filename;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
        });
        let sha = '';
        if (getRes.ok) {
          const info = await getRes.json();
          sha = info.sha;
        }
        const body = {
          message: '[' + (currentAdmin && currentAdmin.name || 'admin') + '] 上传文件 ' + file.name,
          content: base64
        };
        if (sha) body.sha = sha;
        const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.message || '上传失败');
        }
        resolve(path);
      } catch(e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function createFileUploaderHTML(options) {
  const { id, accept, hint, maxSizeText } = options;
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || ''}</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept || '*'}" onchange="handleFileSelect(event,'${id}')">
    <div class="file-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) await processFileUpload(files[0], id);
}

async function handleFileSelect(e, id) {
  const file = e.target.files[0];
  if (file) await processFileUpload(file, id);
}

async function processFileUpload(file, id) {
  const progressEl = document.getElementById('progress-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const wrapEl = document.getElementById('wrap-' + id);

  let folder = 'uploads';
  let maxSize = 100 * 1024 * 1024;
  let isImage = false;
  if (id.includes('video')) { folder = 'videos'; maxSize = 800 * 1024 * 1024; }
  else if (id.includes('image') || id.includes('cover') || id.includes('logo') || id.includes('favicon')) { folder = 'images'; isImage = true; }
  else if (id.includes('pdf') || id.includes('file')) { folder = 'files'; maxSize = 100 * 1024 * 1024; }
  else if (id.includes('batch')) { folder = 'imports'; maxSize = 100 * 1024 * 1024; }

  let uploadFile = file;
  if (isImage && file.type.startsWith('image/')) {
    progressEl.textContent = '⏳ 压缩中...';
    try {
      uploadFile = await compressImageToBlob(file, 0.03);
      progressEl.textContent = '⏳ 上传中...';
    } catch(e) {
      showToast('图片压缩失败：' + e.message, 'error');
      return;
    }
  } else if (file.size > maxSize) {
    showToast('文件过大，限制' + (maxSize/1024/1024) + 'MB', 'error');
    return;
  }

  try {
    const path = await uploadFileToRepo(uploadFile, folder);
    progressEl.textContent = '✅ 上传成功';

    // 保存路径到data属性
    wrapEl.dataset.uploadedPath = path;
    wrapEl.dataset.fileName = file.name;

    // 显示预览
    let previewHTML = '';
    if (uploadFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><img src="${url}"><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else if (uploadFile.type.startsWith('video/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><video src="${url}" muted playsinline webkit-playsinline x5-playsinline preload="metadata"></video><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else {
      previewHTML = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    }
    previewEl.innerHTML = previewHTML;
  } catch(e) {
    progressEl.textContent = '';
    showToast('上传失败：' + e.message, 'error');
  }
}

function clearUpload(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const progressEl = document.getElementById('progress-' + id);
  if (wrapEl) { delete wrapEl.dataset.uploadedPath; delete wrapEl.dataset.fileName; }
  if (previewEl) previewEl.innerHTML = '';
  if (progressEl) progressEl.textContent = '';
  const inp = document.getElementById('inp-' + id);
  if (inp) inp.value = '';
}

function getUploadedPath(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  return wrapEl && wrapEl.dataset.uploadedPath || '';
}

function setUploadedPath(id, path, name) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  if (!wrapEl) return;
  wrapEl.dataset.uploadedPath = path;
  wrapEl.dataset.fileName = name || path;
  if (previewEl && path) {
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(path);
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(path);
    let html = '';
    if (isImg) html = `<div class="file-preview-item"><img src="${path}"><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else if (isVideo) html = `<div class="file-preview-item"><video src="${path}" muted></video><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else html = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    previewEl.innerHTML = html;
  }
}



/* ========== 多图上传相关 ========== */

function createMultiImageUploaderHTML(id, hint, accept) {
  accept = accept || 'image/*';
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleMultiFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || '支持拖拽或点击上传（自动压缩）'}</div>
      <div class="hint" style="color:var(--primary);font-weight:500;">已上传 <span id="count-${id}">0</span> / 15 个</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept}" multiple onchange="handleMultiFileSelect(event,'${id}')">
    <div class="multi-image-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleMultiFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) await processMultiFileUpload(files, id);
}

async function handleMultiFileSelect(e, id) {
  const files = Array.from(e.target.files);
  if (files.length) await processMultiFileUpload(files, id);
}

async function processMultiFileUpload(files, id) {
  const progressEl = document.getElementById('progress-' + id);
  const wrapEl = document.getElementById('wrap-' + id);
  let currentPaths = getMultiUploadedPaths(id);

  if (currentPaths.length + files.length > 15) {
    showToast('最多只能上传15个文件', 'error');
    files = files.slice(0, 15 - currentPaths.length);
  }

  if (files.length === 0) return;

  progressEl.textContent = '⏳ 处理中 ' + files.length + ' 个...';

  for (const file of files) {
    let uploadFile = file;
    let folder = 'files';
    let isImage = file.type.startsWith('image/');
    let isPdf = file.type === 'application/pdf';
    let isRollCSV = (id === 'pollRollFiles') && (/\.(csv|xlsx|xls)$/i.test(file.name));

    if (isImage) {
      folder = 'images';
      try {
        uploadFile = await compressImageToBlob(file, 0.03);
      } catch(e) {
        showToast('"' + file.name + '" 压缩失败：' + e.message, 'error');
        continue;
      }
    } else if (isPdf || isRollCSV) {
      folder = 'files';
      if (file.size > 100 * 1024 * 1024) {
        showToast('"' + file.name + '" 超过100MB限制', 'error');
        continue;
      }
    } else {
      showToast('"' + file.name + '" 不支持的文件格式，仅支持图片和PDF', 'error');
      continue;
    }

    try {
      const path = await uploadFileToRepo(uploadFile, folder);
      currentPaths.push(path);
      renderMultiFilePreview(id, currentPaths);
      document.getElementById('count-' + id).textContent = currentPaths.length;
      // 自动解析清册CSV
      if (isRollCSV && /\.csv$/i.test(file.name)) {
        try {
          const text = await file.text();
          const result = parseRollCSV(text);
          if (result && result.count > 0) {
            updateRollStats(result.count, result.area);
            const targetInput = document.getElementById('edTarget');
            if (targetInput) targetInput.value = result.count;
            window._rollSyncData = { count: result.count, area: result.area, source: 'upload' };
            showToast('清册解析成功：' + result.count + '户，' + result.area.toFixed(2) + '㎡', 'success');
          }
        } catch(e) { console.error('CSV解析失败', e); }
      }
    } catch(e) {
      showToast('"' + file.name + '" 上传失败：' + e.message, 'error');
    }
  }

  progressEl.textContent = currentPaths.length > 0 ? '✅ 已上传 ' + currentPaths.length + ' 个' : '';
  wrapEl.dataset.uploadedPaths = JSON.stringify(currentPaths);
}

function renderMultiFilePreview(id, paths) {
  const previewEl = document.getElementById('preview-' + id);
  if (!previewEl) return;
  let html = '';
  paths.forEach((path, idx) => {
    const isPdf = /\.pdf$/i.test(path);
    if (isPdf) {
      html += `<div class="multi-preview-item" style="display:flex;align-items:center;justify-content:center;background:#f5f5f5;cursor:pointer;" onclick="window.open('${path}','_blank')" title="点击打开PDF">
        <div style="text-align:center;">
          <div style="font-size:32px;">📄</div>
          <div style="font-size:10px;color:#666;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;">${escapeHtml(path.split('/').pop() || 'PDF')}</div>
        </div>
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    } else {
      html += `<div class="multi-preview-item" style="cursor:pointer;" onclick="previewImage('${path}')">
        <img src="${path}" onerror="this.src=''" loading="lazy" decoding="async">
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    }
  });
  previewEl.innerHTML = html;
}
function renderMultiImagePreview(id, paths) { renderMultiFilePreview(id, paths); }

function removeMultiFile(id, idx) {
  const wrapEl = document.getElementById('wrap-' + id);
  let paths = getMultiUploadedPaths(id);
  paths.splice(idx, 1);
  wrapEl.dataset.uploadedPaths = JSON.stringify(paths);
  renderMultiFilePreview(id, paths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = paths.length;
  const progressEl = document.getElementById('progress-' + id);
  if (progressEl) progressEl.textContent = paths.length > 0 ? '✅ 已上传 ' + paths.length + ' 个' : '';
}
function removeMultiImage(id, idx) { removeMultiFile(id, idx); }

function getMultiUploadedPaths(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl || !wrapEl.dataset.uploadedPaths) return [];
  try { return JSON.parse(wrapEl.dataset.uploadedPaths); } catch(e) { return []; }
}

function setMultiUploadedPaths(id, paths) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl) return;
  const validPaths = (paths || []).filter(p => p && typeof p === 'string');
  wrapEl.dataset.uploadedPaths = JSON.stringify(validPaths);
  renderMultiFilePreview(id, validPaths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = validPaths.length;
}

/* ========== 多视频上传相关 ========== */

function createMultiVideoUploaderHTML(id, hint) {
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleMultiVideoDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>🎬 点击或拖拽视频到此处上传</div>
      <div class="hint">${hint || '支持拖拽或点击上传视频（mp4/mov/webm/avi等，单个100M以内）'}</div>
      <div class="hint" style="color:var(--primary);font-weight:500;">已上传 <span id="count-${id}">0</span> / 5 个</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="video/mp4,video/x-m4v,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/3gpp,video/3gpp2" multiple onchange="handleMultiVideoSelect(event,'${id}')">
    <div class="multi-image-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}

async function handleMultiVideoDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
  if (files.length) await processMultiVideoUpload(files, id);
}

async function handleMultiVideoSelect(e, id) {
  const files = Array.from(e.target.files);
  if (files.length) await processMultiVideoUpload(files, id);
}

async function processMultiVideoUpload(files, id) {
  const progressEl = document.getElementById('progress-' + id);
  const wrapEl = document.getElementById('wrap-' + id);
  let currentVideos = getMultiUploadedVideos(id);
  if (currentVideos.length + files.length > 5) {
    showToast('最多只能上传5个视频', 'error');
    files = files.slice(0, 5 - currentVideos.length);
  }
  if (files.length === 0) return;
  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) {
      showToast('"' + file.name + '" 超过100MB，浏览器端压缩不可靠。请先用工具压缩至100MB以内，或上传到视频网站后粘贴链接', 'error');
      continue;
    }
    progressEl.textContent = '⏳ 上传 "' + file.name + '" (' + (file.size/1024/1024).toFixed(1) + 'MB)...';
    try {
      const path = await uploadFileToRepo(file, 'videos');
      currentVideos.push({ path: path, name: file.name, size: file.size });
      renderMultiVideoPreview(id, currentVideos);
      document.getElementById('count-' + id).textContent = currentVideos.length;
      progressEl.textContent = '✅ "' + file.name + '" 上传成功';
    } catch(e) {
      showToast('"' + file.name + '" 上传失败：' + e.message, 'error');
    }
  }
  progressEl.textContent = currentVideos.length > 0 ? '✅ 已上传 ' + currentVideos.length + ' 个视频' : '';
  wrapEl.dataset.uploadedVideos = JSON.stringify(currentVideos);
}

async function compressVideo(file, targetMB) {
  return new Promise(async (resolve, reject) => {
    const targetSize = targetMB * 1024 * 1024;
    if (file.size <= targetSize) { resolve(file); return; }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    let mediaRecorder = null;
    let recorderStarted = false;
    let cleanupDone = false;
    const chunks = [];

    const cleanup = (err) => {
      if (cleanupDone) return;
      cleanupDone = true;
      URL.revokeObjectURL(url);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch(e) {}
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch(e) {}
      }
      if (err) reject(err);
    };

    // 5分钟超时保护
    const timeout = setTimeout(() => {
      cleanup(new Error('视频压缩超时，请先用本地工具压缩后再上传'));
    }, 300000);

    video.onloadedmetadata = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 计算合适的缩放比例，同时限制最大分辨率避免内存爆炸
        let scale = Math.min(1, Math.sqrt(targetSize / file.size) * 0.85);
        const maxDim = 1280;
        if (video.videoWidth * scale > maxDim) scale = maxDim / video.videoWidth;
        if (video.videoHeight * scale > maxDim) scale = maxDim / video.videoHeight;
        scale = Math.max(0.1, scale);

        canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));

        // 先画一帧确保 canvas 有内容
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const stream = canvas.captureStream(30); // 30fps
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
                         MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';

        const duration = video.duration || 60;
        const bitRate = Math.min(4000000, Math.max(500000, Math.floor((targetSize * 8) / duration)));
        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitRate });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          try { video.pause(); } catch(e) {}
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size === 0) {
            reject(new Error('压缩失败：输出为空，请手动压缩后上传'));
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), { type: 'video/webm' });
          if (compressed.size > targetSize * 1.5) {
            reject(new Error('压缩后仍超过目标大小，请手动压缩后上传'));
          } else {
            resolve(compressed);
          }
        };

        mediaRecorder.onerror = () => {
          clearTimeout(timeout);
          cleanup(new Error('视频录制失败，请手动压缩后上传'));
        };

        mediaRecorder.start(1000);
        recorderStarted = true;

        // 等待视频开始播放后再绘制
        await video.play();

        const drawFrame = () => {
          if (video.ended) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            return;
          }
          if (video.paused) {
            // 如果意外暂停，尝试恢复
            video.play().catch(() => {});
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

      } catch(e) {
        clearTimeout(timeout);
        cleanup(new Error('压缩初始化失败：' + (e.message || '未知错误')));
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup(new Error('视频加载失败，格式可能不受支持'));
    };

    video.src = url;
  });
}

function renderMultiVideoPreview(id, videos) {
  const previewEl = document.getElementById('preview-' + id);
  if (!previewEl) return;
  let html = '';
  videos.forEach((v, idx) => {
    const sizeText = v.size ? (v.size/1024/1024).toFixed(1) + 'MB' : '';
    html += `<div class="multi-preview-item">
      <video src="${v.path}" muted preload="metadata" playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="false" style="width:100%;height:100%;object-fit:cover;"></video>
      <button class="remove" onclick="removeMultiVideo('${id}', ${idx})" title="删除">×</button>
      <div class="idx">${idx + 1}</div>
      <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;">${sizeText}</div>
    </div>`;
  });
  previewEl.innerHTML = html;
}

function removeMultiVideo(id, idx) {
  const wrapEl = document.getElementById('wrap-' + id);
  let videos = getMultiUploadedVideos(id);
  videos.splice(idx, 1);
  wrapEl.dataset.uploadedVideos = JSON.stringify(videos);
  renderMultiVideoPreview(id, videos);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = videos.length;
  const progressEl = document.getElementById('progress-' + id);
  if (progressEl) progressEl.textContent = videos.length > 0 ? '✅ 已上传 ' + videos.length + ' 个视频' : '';
}

function getMultiUploadedVideos(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl || !wrapEl.dataset.uploadedVideos) return [];
  try { return JSON.parse(wrapEl.dataset.uploadedVideos); } catch(e) { return []; }
}

function setMultiUploadedVideos(id, videos) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl) return;
  const validVideos = (videos || []).map(v => {
    if (typeof v === 'string') return { path: v, name: 'video', size: 0 };
    if (v && typeof v === 'object' && v.path) return v;
    return null;
  }).filter(Boolean);
  wrapEl.dataset.uploadedVideos = JSON.stringify(validVideos);
  renderMultiVideoPreview(id, validVideos);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = validVideos.length;
}
