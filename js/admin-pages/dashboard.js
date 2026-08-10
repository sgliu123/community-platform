/* js/admin-pages/dashboard.js - 仪表盘 */

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
