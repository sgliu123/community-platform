/* js/admin-pages/audit.js - 操作日志 */

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


