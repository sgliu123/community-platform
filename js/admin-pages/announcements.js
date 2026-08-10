/* js/admin-pages/announcements.js - 公告管理 */

function renderAnnouncementsAdmin() {
  const list = appData.announcements || [];
  return `<div class="card"><div class="card-header"><h3>📢 公告管理</h3><button class="btn btn-primary" onclick="openEditModal('announcements',null)">➕ 新增公告</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>分类</th><th>日期</th><th>置顶</th><th>作者</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.category||''}</td><td>${item.publishDate||''}</td><td>${item.isPinned?"📌":""}</td><td>${item.author||''}</td><td class="actions"><button onclick="openEditModal('announcements','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('announcements','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

