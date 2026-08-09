/* js/pages/home.js - 首页 */

function renderHome() {
  const pinned = (appData.announcements || []).filter(a => a.isPinned).slice(0, 3);
  const c = appData.config?.community || {};
  let h = "";
  if (pinned.length > 0) {
    h += '<div class="card" style="padding:0;overflow:hidden;"><div class="carousel" id="carousel">';
    pinned.forEach((a,i) => {
      h += '<div class="carousel-item ' + (i===0?"active":"") + '"><div><h3>📌 ' + a.title + '</h3><p>' + stripHtml(a.content).substring(0,60) + '...</p></div></div>';
    });
    h += '<div class="carousel-dots">' + pinned.map((_,i) => '<span class="' + (i===0?"active":"") + '" onclick="goCarousel(' + i + ')"></span>').join("") + '</div></div></div>';
    setTimeout(initCarousel, 50);
  }
  h += '<div class="quick-links">';
  h += `<div class="quick-link" onclick="navigate('announcements')"><div class="icon">📢</div><div class="label">公告栏</div></div>`;
  h += `<div class="quick-link" onclick="navigate('documents')"><div class="icon">📄</div><div class="label">上级文件</div></div>`;
  h += `<div class="quick-link" onclick="navigate('activities')"><div class="icon">🎉</div><div class="label">社区动态</div></div>`;
  h += `<div class="quick-link" onclick="navigate('polls')"><div class="icon">🗳️</div><div class="label">投票征集</div></div>`;
  h += `<div class="quick-link" onclick="location.href='life.html'"><div class="icon">🍽️</div><div class="label">生活服务</div></div>`;
  h += `<div class="quick-link" onclick="location.href='trade.html'"><div class="icon">🛒</div><div class="label">房屋租售和物品交易</div></div>`;
  h += `<div class="quick-link" onclick="navigate('submit-workorder')"><div class="icon">🔧</div><div class="label">我要报修</div></div>`;
  h += `<div class="quick-link" onclick="navigate('submit-complaint')"><div class="icon">📝</div><div class="label">投诉建议</div></div>`;
  if (residentAuth) {
    h += `<div class="quick-link" onclick="navigate('workorders')"><div class="icon">📋</div><div class="label">我的报修</div></div>`;
    h += `<div class="quick-link" onclick="navigate('complaints')"><div class="icon">📋</div><div class="label">我的反馈</div></div>`;
  }
  h += '</div>';
  h += '<div class="card"><div class="card-title"><span class="icon">🏘️</span>社区概况</div>';
  h += '<div class="info-grid">';
  h += '<div class="info-item"><div class="label">总户数</div><div class="value">' + (c.totalUnits||"-") + ' 户</div></div>';
  h += '<div class="info-item"><div class="label">建成年份</div><div class="value">' + (c.builtYear||"-") + '</div></div>';
  h += '<div class="info-item"><div class="label">占地面积</div><div class="value">' + (c.area||"-") + '</div></div>';
  h += '<div class="info-item"><div class="label">物业公司</div><div class="value">' + (c.propertyCompany||"-") + '</div></div>';
  h += '</div><div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><div style="font-size:13px;color:var(--text-secondary);">📍 ' + (c.address||"") + '<br>📞 居委会：' + (c.committeePhone||"") + '<br>📞 物业：' + (c.propertyPhone||"") + '</div></div></div>';
  const latest = (appData.announcements||[]).slice(0,3);
  if (latest.length) {
    h += '<div class="card"><div class="card-title"><span class="icon">📢</span>最新公告<a href="#/announcements" style="margin-left:auto;font-size:13px;">查看全部 →</a></div>';
    latest.forEach(a => h += renderListItem(a, "announcement"));
    h += '</div>';
  }
  setTimeout(async () => {
    try {
      const complaints = await loadComplaintsFromWorker();
      const previewContainer = document.getElementById('homeComplaintsPreview');
      if (previewContainer) {
        if (!complaints || !complaints.length) {
          previewContainer.innerHTML = '<div style="text-align:center;padding:20px;color:#999;font-size:13px;">暂无投诉建议</div>';
        } else {
          let html = '<div style="display:flex;flex-direction:column;gap:12px;">';
          complaints.slice().reverse().slice(0, 3).forEach(item => {
            if (!item) return;
            const title = item.isAnonymous ? '匿名' + item.type : escapeHtml(item.title || '');
            const statusColor = item.status === '已办结' ? '#2e7d32' : (item.status === '已回复' ? '#1976d2' : '#e65100');
            const statusBg = item.status === '已办结' ? '#e8f5e9' : (item.status === '已回复' ? '#e3f2fd' : '#fff3e0');
            html += '<div style="padding:12px;background:#fafbfc;border-radius:8px;border:1px solid #eef0f2;cursor:pointer;" onclick="navigate(&#39;public-complaints&#39;)">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
            html += '<div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">' + title + '</div>';
            html += '<span style="font-size:11px;padding:2px 8px;border-radius:12px;background:' + statusBg + ';color:' + statusColor + ';margin-left:8px;flex-shrink:0;">' + item.status + '</span>';
            html += '</div>';
            html += '<div style="font-size:12px;color:#999;">' + (item.type || '') + ' &middot; ' + (item.residentRoom || '') + ' &middot; ' + formatDate(item.createdAt) + '</div>';
            html += '</div>';
          });
          html += '</div>';
          previewContainer.innerHTML = html;
        }
      }
    } catch (e) { console.error('加载首页反馈预览失败', e); }
  }, 100);

  h += '<div class="card" style="margin-top:16px;"><div class="card-title"><span class="icon">📝</span>最新反馈</div><div id="homeComplaintsPreview"><div style="text-align:center;padding:20px;color:#999;font-size:13px;">加载中...</div></div></div>';

  return h;
}