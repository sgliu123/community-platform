/* js/admin-app.js - 应用入口与全局事件 */

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

