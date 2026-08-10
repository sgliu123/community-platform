/* js/admin-utils.js - 通用工具函数 */

function escapeHtml(text){
  if(!text) return '';
  const div=document.createElement('div');
  div.textContent=text;
  return div.innerHTML;
}


function woStatusClass(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}


function cpStatusClass(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}


async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}



function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}



function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}



function generateId(module, type) {
  const year = new Date().getFullYear();
  const list = appData[module] || [];
  if (module === 'polls' && type === 'caseNo') {
    const maxNum = list.reduce((max, p) => {
      const match = p.caseNo && p.caseNo.match(/YJ-(\d+)/);
      return match ? Math.max(max, parseInt(match[1])) : max;
    }, 0);
    return year + '-YJ-' + String(maxNum + 1).padStart(3, '0');
  }
  const prefix = { announcements: 'ann', documents: 'doc', activities: 'act', polls: 'poll', residents: 'r' };
  const maxNum = list.reduce((max, item) => {
    const match = item.id && item.id.match(/\d+/);
    return match ? Math.max(max, parseInt(match[0])) : max;
  }, 0);
  return (prefix[module] || 'item') + '-' + String(maxNum + 1).padStart(3, '0');
}




function getModuleName(module) {
  const names = { announcements: '公告', documents: '文件', activities: '动态', polls: '投票', residents: '业主', config: '配置' };
  return names[module] || module;
}



function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('active', show);
}



function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 3000);
}



function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}




function previewImage(url){
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;opacity:0;transition:opacity .2s;';
  ov.innerHTML = '<img src="'+url+'" style="max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.4);transform:scale(0.95);transition:transform .2s;">';
  document.body.appendChild(ov);
  requestAnimationFrame(()=>{ ov.style.opacity='1'; ov.querySelector('img').style.transform='scale(1)'; });
  ov.onclick = ()=>{ ov.style.opacity='0'; ov.querySelector('img').style.transform='scale(0.95)'; setTimeout(()=>ov.remove(),200); };
}