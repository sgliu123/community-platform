/* js/data.js - 数据加载与 Worker 通信 */

let appData = {};

// ===== 实时数据加载：优先从 Worker 读取，回退静态 JSON =====
async function loadModuleFromWorker(paths, moduleName) {
  const workerBase = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
  if (!workerBase) {
    console.log('[Worker] 未配置 Worker 地址，跳过实时读取');
    return null;
  }
  const base = workerBase.replace(/\/$/, '');
  if (!Array.isArray(paths)) paths = [paths];
  for (const path of paths) {
    try {
      // 用URL时间戳防缓存，避免添加自定义header触发CORS预检
      const url = base + '/api/read/' + encodeURIComponent(path) + '?_=' + Date.now() + '&r=' + Math.random().toString(36).substr(2,5);
      console.log('[Worker] 尝试读取:', moduleName || path);
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        console.log('[Worker] 读取失败:', path, '状态码:', res.status);
        continue;
      }
      const text = await res.text();
      if (!text || text.trim() === '') {
        console.log('[Worker] 返回空内容:', path);
        continue;
      }
      const data = JSON.parse(text);
      // 空数组 [] 和空对象 {} 都是合法数据（表示用户已清空该模块）
      // 只有 null/undefined 才视为无效
      if (data === null || data === undefined) {
        console.log('[Worker] 返回 null/undefined:', path, '继续尝试其他路径');
        continue;
      }
      console.log('[Worker] ✅ 成功读取:', moduleName || path, '数据量:', Array.isArray(data) ? data.length : Object.keys(data).length);
      return data;
    } catch (e) {
      console.log('[Worker] 读取异常:', path, e.message);
      continue;
    }
  }
  console.log('[Worker] ⚠️ 所有路径均无效:', moduleName, 'paths:', paths);
  return null;
}

function isRealtimePage(page) {
  // 只有列表页和首页需要自动刷新重渲染
  // 详情页（activity-detail 等）不自动重渲染，否则会打断视频播放、重置滚动位置
  return ['home','announcements','documents','activities','polls'].includes(page);
}


// ===== Worker 网关配置（工单/投诉模块，不影响原有功能） =====
const WORKER_BASE = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
function getWorkerBase(){ return WORKER_BASE.replace(/\/$/,''); }
function getCurrentMonthPath(module){
  const d=new Date();
  return module+'/'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'.json';
}
async function workerRead(filePath){
  const base=getWorkerBase();
  if(!base) throw new Error('Worker地址未配置，请联系管理员');
  const res=await fetch(base+'/api/read/'+encodeURIComponent(filePath));
  if(!res.ok) throw new Error('读取失败');
  const t=await res.text();
  return t?JSON.parse(t):[];
}
async function workerWrite(filePath,data,message){
  const base=getWorkerBase();
  if(!base) throw new Error('Worker地址未配置');
  const res=await fetch(base+'/api/write/'+encodeURIComponent(filePath),{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({content:JSON.stringify(data,null,2),message})
  });
  if(!res.ok){const e=await res.json();throw new Error(e.error||'保存失败');}
}
async function workerUpload(file, retries=2){
  const base=getWorkerBase();
  if(!base) throw new Error('Worker地址未配置，请联系管理员');
  const fd=new FormData(); fd.append('file',file);
  let lastErr;
  for(let i=0;i<=retries;i++){
    try{
      const res=await fetch(base+'/api/upload',{method:'POST',body:fd});
      if(!res.ok){
        let detail='';
        try{ detail=await res.text(); }catch(e){}
        throw new Error('服务器返回 '+res.status+' '+res.statusText+(detail?': '+detail.substring(0,200):''));
      }
      return await res.json();
    }catch(e){
      lastErr=e;
      if(i<retries) await new Promise(r=>setTimeout(r,800*(i+1)));
    }
  }
  throw lastErr;
}
function genWOId(){
  const d=new Date();
  const ds=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return 'WO-'+ds+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
}
function genCPId(){
  const d=new Date();
  const ds=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return 'CP-'+ds+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
}
function woStatusBadge(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}
function cpStatusBadge(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}
function renderAuthRequired(action){
  return '<div class="card" style="text-align:center;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">🔒</div><div style="font-size:16px;margin-bottom:20px;">请登录后'+action+'</div><button class="poll-btn" onclick="showLogin()">业主登录</button></div>';
}
function showPageLoading(show){
  let el=document.getElementById('pageLoading');
  if(!el){el=document.createElement('div');el.id='pageLoading';el.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,0.85);z-index:3000;display:none;align-items:center;justify-content:center;';el.innerHTML='<div style="width:40px;height:40px;border:3px solid #e0e0e0;border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>';document.body.appendChild(el);}
  el.style.display=show?'flex':'none';
}

let currentTheme = localStorage.getItem("communityTheme") || "T1";
let residentAuth = null;
try { residentAuth = JSON.parse(localStorage.getItem("residentAuth")); } catch(e){}

const themes = {
  T1: { name: "春晓绿", color: "#2E8B57", cls: "" },
  T2: { name: "天空蓝", color: "#1976D2", cls: "theme-t2" },
  T3: { name: "暖阳橙", color: "#E65100", cls: "theme-t3" },
  T4: { name: "中国红", color: "#C62828", cls: "theme-t4" },
  T5: { name: "优雅紫", color: "#6A1B9A", cls: "theme-t5" }
};

function updateFavicon() {
  const favicon = appData.config && appData.config.community && appData.config.community.favicon;
  if (favicon) {
    document.getElementById('faviconLink').href = favicon + (favicon.includes('?') ? '&' : '?') + '_t=' + Date.now();
  }
}
function applyTheme(id) {
  currentTheme = id;
  document.body.className = themes[id].cls;
  localStorage.setItem("communityTheme", id);
  renderThemePanel();
}

function renderThemePanel() {
  const el = document.getElementById("themeOptions");
  el.innerHTML = Object.entries(themes).map(([k,v]) => {
    const active = k === currentTheme ? "active" : "";
    return `<div class="theme-option ${active}" onclick="applyTheme('${k}')"><div class="color-dot" style="background:${v.color}"></div><span class="name">${v.name}</span><span class="check">✓</span></div>`;
  }).join("");
}

function toggleThemePanel() {
  document.getElementById("themePanel").classList.toggle("active");
}

async function loadData() {
  const files = ["config","announcements","documents","activities","polls","residents"];

  // Worker 路径映射（支持多种可能的后台存储路径）
  const workerPaths = {
    "config": ["config.json", "data/config.json", "community/config.json"],
    "announcements": ["announcements.json", "data/announcements.json", "community/announcements.json"],
    "documents": ["documents.json", "data/documents.json", "community/documents.json"],
    "activities": ["activities.json", "data/activities.json", "community/activities.json"],
    "polls": ["polls.json", "data/polls.json", "community/polls.json"],
    "residents": ["residents.json", "data/residents.json", "community/residents.json"]
  };

  // 并行加载所有模块
  const results = await Promise.all(files.map(async (f) => {
    // 1) 优先从 Worker 实时读取
    if (workerPaths[f]) {
      const wd = await loadModuleFromWorker(workerPaths[f], f);
      if (wd !== null) {
        console.log('[Worker] 已加载模块:', f);
        return { key: f, data: wd, ok: true, source: 'worker' };
      }
    }
    // 2) 回退到静态 JSON（强制无缓存）
    try {
      const r = await fetch("./data/" + f + ".json?_=" + Date.now() + "&r=" + Math.random().toString(36).substr(2,5), {
        cache: 'no-store'
      });
      if (!r.ok) throw new Error("fetch failed");
      return { key: f, data: await r.json(), ok: true, source: 'static' };
    } catch(e) {
      return { key: f, data: null, ok: false, source: 'none' };
    }
  }));

  let ok = true;
  results.forEach(r => {
    if (r.ok) {
      appData[r.key] = r.data;
    } else {
      ok = false;
    }
  });

  if (!ok) {
    try {
      const b64 = document.getElementById("embedded-b64").textContent.trim();
      const ed = JSON.parse(decodeURIComponent(escape(atob(b64))));
      files.forEach(function(f){
        // 只有该模块完全未加载（undefined）时才使用 embedded 数据
        // 已加载的空数组 [] 或空对象 {} 不应被覆盖
        if (!(f in appData)) {
          appData[f] = ed[f] || (f === 'config' ? {} : []);
        }
      });
    } catch(e2) {
      files.forEach(function(f){
        if (!appData[f]) appData[f] = (f === 'config' ? {} : []);
      });
    }
  }

  if (appData.config && appData.config.community) {
    document.getElementById("headerTitle").textContent = appData.config.community.name;
    const c = appData.config.community;
    document.getElementById("footerInfo").textContent = c.name + " | " + c.address + " | 物业电话：" + c.propertyPhone;
    document.title = (c.siteTitle || (c.name + " - 社区数字化平台"));
    const dt = appData.config?.settings?.defaultTheme || "T1";
    if (!localStorage.getItem("communityTheme")) applyTheme(dt);
    if (c.logo) {
      const img = document.getElementById("headerLogoImg");
      img.src = c.logo + (c.logo.includes('?') ? '&' : '?') + '_t=' + Date.now();
      img.style.display = "block";
      document.getElementById("headerLogoFallback").style.display = "none";
    }
  }
  updateUserUI();
  updateFavicon();
  appData._lastLoadTime = Date.now();
  // === 数据清洗：移除失效 blob URL 并对 activities 做 ID 去重 ===
  if (appData.activities) {
    const seen = new Set();
    appData.activities = appData.activities.filter(item => {
      if (!item || !item.id) return false;
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      if (item.images) item.images = item.images.filter(u => !u.startsWith('blob:'));
      if (item.videos) item.videos = item.videos.filter(u => !u.startsWith('blob:'));
      if (item.videoLinks) item.videoLinks = item.videoLinks.filter(u => !u.startsWith('blob:'));
      if (item.adminImages) item.adminImages = item.adminImages.filter(u => !u.startsWith('blob:'));
      if (item.coverImage && item.coverImage.startsWith('blob:')) item.coverImage = '';
      if (item.videoUrl && item.videoUrl.startsWith('blob:')) item.videoUrl = '';
      return true;
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
    });
  }
}