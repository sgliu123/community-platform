/* js/admin-data.js - 数据加载、Worker通信、全局状态 */

const EMBEDDED_DATA = {"config":{"community":{"name":"春天阳光小区","siteTitle":"春天阳光小区 - 社区数字化平台","address":"阳光大道 100 号","totalUnits":1200,"builtYear":"2018","area":"5.2万平方米","propertyCompany":"阳光物业服务有限公司","committeePhone":"0571-88888888","propertyPhone":"0571-88888889","logo":"assets/logo.png","slogan":"共建和谐社区，共享美好生活","favicon":"assets/logo.png"},"settings":{"maxAnnouncements":200,"itemsPerPage":10,"allowGuestView":true,"defaultTheme":"T1","themeOptions":[{"id":"T1","name":"春晓绿","color":"#2E8B57","desc":"清新自然"},{"id":"T2","name":"天空蓝","color":"#1976D2","desc":"稳重专业"},{"id":"T3","name":"暖阳橙","color":"#E65100","desc":"温馨活力"},{"id":"T4","name":"中国红","color":"#C62828","desc":"庄重喜庆"},{"id":"T5","name":"优雅紫","color":"#6A1B9A","desc":"高端典雅"}]},"auth":{"passwordHash":"","salt":"SunlightCommunity2026","maxAttempts":5,"lockoutMinutes":30,"lastChanged":"2026-07-25","note":"已废弃，请使用代码顶部 ADMIN_ACCOUNTS 配置密码"},"admins":[
  {"id":"admin-super","name":"总维护人员","role":"super","permissions":["all"]},
  {"id":"admin-property","name":"物管人员","role":"property","permissions":["announcements","documents","workorders","residents"]},
  {"id":"admin-committee","name":"业委会成员","role":"committee","permissions":["polls","residents","complaints","audit"]},
  {"id":"admin-community","name":"社区人员","role":"community","permissions":["announcements","activities","complaints"]}
]},"announcements":[{"id":"ann-001","title":"【测试】关于小区电梯年度维保的通知","category":"物业通知","content":"<p>【测试数据】各位业主，为确保电梯安全运行，物业将于本月进行年度维保，具体安排如下...</p>","isPinned":true,"publishDate":"2026-07-20","author":"管理员A","views":156,"attachments":[]},{"id":"ann-002","title":"【测试】端午节放假及值班安排","category":"节日通知","content":"<p>【测试数据】端午节期间物业服务中心值班时间为：6月22日-24日 9:00-17:00...</p>","isPinned":false,"publishDate":"2026-07-15","author":"管理员B","views":89,"attachments":[]},{"id":"ann-003","title":"【测试】垃圾分类投放点调整说明","category":"社区公告","content":"<p>【测试数据】根据上级要求，小区垃圾分类投放点将做如下调整：1号楼北侧...</p>","isPinned":false,"publishDate":"2026-07-18","author":"管理员C","views":120,"attachments":[]},{"id":"ann-004","title":"【测试】停车场管理系统升级通知","category":"物业通知","content":"<p>【测试数据】为提升停车体验，停车场系统将于本周末升级，期间可能短暂影响...</p>","isPinned":false,"publishDate":"2026-07-19","author":"管理员B","views":76,"attachments":[]},{"id":"ann-005","title":"【测试】关于成立业主委员会筹备组的公告","category":"重要公告","content":"<p>【测试数据】根据《物业管理条例》，现成立业主委员会筹备组，欢迎热心业主报名...</p>","isPinned":true,"publishDate":"2026-07-10","author":"管理员A","views":234,"attachments":[]},{"id":"ann-006","title":"【测试】夏季绿化养护计划","category":"环境通知","content":"<p>【测试数据】为保持小区绿化景观，夏季养护计划如下：修剪草坪、病虫害防治...</p>","isPinned":false,"publishDate":"2026-07-12","author":"管理员C","views":45,"attachments":[]},{"id":"ann-007","title":"【测试】消防演练活动通知","category":"安全通知","content":"<p>【测试数据】定于本周六上午9:00开展消防演练，请业主配合，听到警报请勿惊慌...</p>","isPinned":false,"publishDate":"2026-07-22","author":"管理员D","views":98,"attachments":[]},{"id":"ann-008","title":"【测试】物业费收缴温馨提示","category":"物业通知","content":"<p>【测试数据】请各位业主及时缴纳本年度物业费，可通过微信/支付宝/银行转账...</p>","isPinned":false,"publishDate":"2026-07-23","author":"管理员B","views":67,"attachments":[]}],"documents":[{"id":"doc-001","title":"【测试】关于进一步加强社区治理工作的指导意见","source":"xx街道办事处","publishDate":"2026-07-15","fileUrl":"","description":"【测试数据】根据市城管局要求，各社区需加强治理工作，落实网格化管理...","category":"上级文件"},{"id":"doc-002","title":"【测试】2026年度老旧小区改造实施方案","source":"市住建局","publishDate":"2026-07-10","fileUrl":"","description":"【测试数据】本年度改造重点包括外墙翻新、管道更换、加装电梯等...","category":"上级文件"},{"id":"doc-003","title":"【测试】社区消防安全检查标准及要求","source":"区消防大队","publishDate":"2026-07-05","fileUrl":"","description":"【测试数据】各社区需按照以下标准开展消防安全自查，确保消防设施完好...","category":"上级文件"}],"activities":[{"id":"act-001","title":"【测试】端午节包粽子活动圆满结束","date":"2026-05-30","location":"小区中心广场","content":"<p>【测试数据】活动现场热闹非凡，共有80余位业主参与，大家亲手包粽子、做香囊...</p>","coverImage":"","images":[],"videoUrl":"","externalLink":"","status":"已结束"},{"id":"act-002","title":"【测试】暑期少儿绘画培训班开班啦","date":"2026-07-20","location":"社区活动室","content":"<p>【测试数据】暑期绘画班即日起接受报名，限20人，由专业美术老师授课...</p>","coverImage":"","images":[],"videoUrl":"","externalLink":"","status":"进行中"},{"id":"act-003","title":"【测试】社区健康义诊活动预告","date":"2026-08-05","location":"小区中心广场","content":"<p>【测试数据】特邀市三甲医院医生来小区开展义诊，提供免费血压血糖检测...</p>","coverImage":"","images":[],"videoUrl":"","externalLink":"","status":"预告"},{"id":"act-004","title":"【测试】业主羽毛球友谊赛精彩回顾","date":"2026-06-15","location":"小区羽毛球馆","content":"<p>【测试数据】本次比赛共有16支队伍参加，经过激烈角逐，最终A栋代表队夺冠...</p>","coverImage":"","images":[],"videoUrl":"","externalLink":"","status":"已结束"}],"polls":[{"id":"poll-001","caseNo":"2026-YJ-001","title":"【测试】关于增设儿童游乐设施的意见征集","type":"opinion","description":"【测试数据】为丰富小区儿童活动空间，拟在中心花园增设游乐设施，现征集业主意见...","tencentUrl":"https://wj.qq.com/s2/xxxx/xxxx","startDate":"2026-07-20","endDate":"2026-08-20","status":"进行中","progress":{"target":300,"current":156,"unit":"户"},"results":{"isPublished":false,"summary":"","detailUrl":""},"createdBy":"管理员A","createdAt":"2026-07-20T09:00:00Z"},{"id":"poll-002","caseNo":"2026-YJ-002","title":"【测试】小区停车位管理方案投票","type":"vote","description":"【测试数据】针对小区停车位紧张问题，现提供三种管理方案供业主投票选择...","tencentUrl":"https://wj.qq.com/s2/xxxx/xxxx2","startDate":"2026-06-01","endDate":"2026-06-15","status":"已结束","progress":{"target":300,"current":278,"unit":"户"},"results":{"isPublished":true,"summary":"方案A获得68%支持率（189户），方案B获得22%（61户），方案C获得10%（28户）","detailUrl":""},"createdBy":"管理员D","createdAt":"2026-06-01T09:00:00Z"}],"residents":[{"id":"r-001","roomNo":"1-1-101","name":"测试业主01","phoneSuffix":"0001","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-002","roomNo":"1-1-102","name":"测试业主02","phoneSuffix":"0002","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-003","roomNo":"1-1-103","name":"测试业主03","phoneSuffix":"0003","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-004","roomNo":"1-1-104","name":"测试业主04","phoneSuffix":"0004","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-005","roomNo":"1-1-105","name":"测试业主05","phoneSuffix":"0005","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-006","roomNo":"1-1-106","name":"测试业主06","phoneSuffix":"0006","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-007","roomNo":"1-1-107","name":"测试业主07","phoneSuffix":"0007","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-008","roomNo":"1-1-108","name":"测试业主08","phoneSuffix":"0008","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-009","roomNo":"1-1-109","name":"测试业主09","phoneSuffix":"0009","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-010","roomNo":"1-1-110","name":"测试业主10","phoneSuffix":"0010","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-011","roomNo":"1-2-101","name":"测试业主11","phoneSuffix":"0011","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-012","roomNo":"1-2-102","name":"测试业主12","phoneSuffix":"0012","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-013","roomNo":"1-2-103","name":"测试业主13","phoneSuffix":"0013","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-014","roomNo":"1-2-104","name":"测试业主14","phoneSuffix":"0014","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-015","roomNo":"1-2-105","name":"测试业主15","phoneSuffix":"0015","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-016","roomNo":"1-2-106","name":"测试业主16","phoneSuffix":"0016","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-017","roomNo":"1-2-107","name":"测试业主17","phoneSuffix":"0017","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-018","roomNo":"1-2-108","name":"测试业主18","phoneSuffix":"0018","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-019","roomNo":"1-2-109","name":"测试业主19","phoneSuffix":"0019","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-020","roomNo":"1-2-110","name":"测试业主20","phoneSuffix":"0020","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-021","roomNo":"1-3-101","name":"测试业主21","phoneSuffix":"0021","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-022","roomNo":"1-3-102","name":"测试业主22","phoneSuffix":"0022","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-023","roomNo":"1-3-103","name":"测试业主23","phoneSuffix":"0023","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-024","roomNo":"1-3-104","name":"测试业主24","phoneSuffix":"0024","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-025","roomNo":"1-3-105","name":"测试业主25","phoneSuffix":"0025","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-026","roomNo":"1-3-106","name":"测试业主26","phoneSuffix":"0026","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-027","roomNo":"1-3-107","name":"测试业主27","phoneSuffix":"0027","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-028","roomNo":"1-3-108","name":"测试业主28","phoneSuffix":"0028","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-029","roomNo":"1-3-109","name":"测试业主29","phoneSuffix":"0029","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-030","roomNo":"1-3-110","name":"测试业主30","phoneSuffix":"0030","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-031","roomNo":"1-4-101","name":"测试业主31","phoneSuffix":"0031","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-032","roomNo":"1-4-102","name":"测试业主32","phoneSuffix":"0032","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-033","roomNo":"1-4-103","name":"测试业主33","phoneSuffix":"0033","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-034","roomNo":"1-4-104","name":"测试业主34","phoneSuffix":"0034","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-035","roomNo":"1-4-105","name":"测试业主35","phoneSuffix":"0035","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-036","roomNo":"1-4-106","name":"测试业主36","phoneSuffix":"0036","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-037","roomNo":"1-4-107","name":"测试业主37","phoneSuffix":"0037","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-038","roomNo":"1-4-108","name":"测试业主38","phoneSuffix":"0038","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-039","roomNo":"1-4-109","name":"测试业主39","phoneSuffix":"0039","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-040","roomNo":"1-4-110","name":"测试业主40","phoneSuffix":"0040","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-041","roomNo":"1-5-101","name":"测试业主41","phoneSuffix":"0041","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-042","roomNo":"1-5-102","name":"测试业主42","phoneSuffix":"0042","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-043","roomNo":"1-5-103","name":"测试业主43","phoneSuffix":"0043","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-044","roomNo":"1-5-104","name":"测试业主44","phoneSuffix":"0044","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-045","roomNo":"1-5-105","name":"测试业主45","phoneSuffix":"0045","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-046","roomNo":"1-5-106","name":"测试业主46","phoneSuffix":"0046","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-047","roomNo":"1-5-107","name":"测试业主47","phoneSuffix":"0047","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-048","roomNo":"1-5-108","name":"测试业主48","phoneSuffix":"0048","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-049","roomNo":"1-5-109","name":"测试业主49","phoneSuffix":"0049","status":"active","isTest":true,"registeredAt":"2026-07-01"},{"id":"r-050","roomNo":"1-5-110","name":"测试业主50","phoneSuffix":"0050","status":"active","isTest":true,"registeredAt":"2026-07-01"}],"audit-log":[{"id":"log-001","timestamp":"2026-07-25T10:00:00Z","adminName":"系统初始化","adminId":"system","action":"init","target":"all","targetId":"","details":"系统预设数据初始化完成，认证方式：预设密码+SHA-256哈希","clientInfo":"System"}]};
// 扩展 residents 测试数据：增加 area 字段（随机 60-140）
if (EMBEDDED_DATA.residents) {
  EMBEDDED_DATA.residents.forEach((r, i) => {
    if (!r.area) r.area = 60 + Math.floor(Math.abs(Math.sin(i * 7.3 + 1.5)) * 81);
  });
}
// Global error handlers to prevent blank pages
window.onerror = function(msg, url, line, col, error) {
  console.error('Global error:', msg, 'at line', line);
  return false;
};
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});



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


const WORKER_BASE = localStorage.getItem('workerBase') || 'https://api.firstblade.site';


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

