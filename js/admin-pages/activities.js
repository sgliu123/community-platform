/* js/admin-pages/activities.js - 动态管理 */

function renderActivitiesAdmin() {
  const list = appData.activities || [];
  return `<div class="card"><div class="card-header"><h3>🎉 动态管理</h3><button class="btn btn-primary" onclick="openEditModal('activities',null)">➕ 新增动态</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>日期</th><th>地点</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.title||''}</td><td>${item.date||''}</td><td>${item.location||''}</td><td><span class="tag ${item.status==="进行中"?"tag-active":(item.status==="预告"?"tag-test":"tag-disabled")}">${item.status||'已结束'}</span></td><td class="actions"><button onclick="openEditModal('activities','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('activities','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}

