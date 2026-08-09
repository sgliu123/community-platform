/* js/pages/announcements.js - 公告系统 */

function renderAnnouncements() {
  const all = appData.announcements || [];
  const cats = [...new Set(all.map(a => a.category))];
  let h = '<div class="card"><div class="card-title"><span class="icon">📢</span>社区公告</div>';
  h += '<div class="search-bar"><input type="text" id="annSearch" placeholder="搜索公告..." oninput="filterAnnouncements()"><select id="annCategory" onchange="filterAnnouncements()"><option value="">全部分类</option>';
  cats.forEach(c => h += '<option value="' + c + '">' + c + '</option>');
  h += '</select></div><div id="annList">' + renderAnnouncementList(all) + '</div></div>';
  return h;
}

function renderAnnouncementList(list) {
  if (!list.length) return '<div class="empty">暂无公告</div>';
  const sorted = [...list].sort((a,b) => (b.isPinned?1:0)-(a.isPinned?1:0));
  return sorted.map(a => renderListItem(a, "announcement")).join("");
}

function filterAnnouncements() {
  const s = document.getElementById("annSearch").value.toLowerCase();
  const c = document.getElementById("annCategory").value;
  const filtered = (appData.announcements||[]).filter(a => {
    const ms = !s || a.title.toLowerCase().includes(s) || stripHtml(a.content).toLowerCase().includes(s);
    const mc = !c || a.category === c;
    return ms && mc;
  });
  document.getElementById("annList").innerHTML = renderAnnouncementList(filtered);
}

function renderAnnouncementDetail(id) {
  const a = (appData.announcements||[]).find(x => x.id === id);
  if (!a) return '<div class="empty">公告不存在</div>';
  let h = '<div class="card"><div class="detail-header"><h1>' + escapeHtml(a.title || '') + '</h1><div class="detail-meta">';
  h += '<span>' + escapeHtml(a.category || '') + '</span><span>' + (a.publishDate || '') + '</span><span>作者：' + escapeHtml(a.author || '') + '</span><span>阅读：' + (a.views||0) + '</span>';
  if (a.isPinned) h += '<span style="color:#c62828;">📌 置顶</span>';
  h += '</div></div><div class="detail-content">' + renderInlineMedia(a.content || '') + '</div>';
  if (a.attachments && a.attachments.length) {
    h += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">📎 附件</div>';
    a.attachments.forEach(att => {
      const url = att.url || '';
      const name = att.name || '附件';
      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
      const isPdf = /\.pdf$/i.test(url);
      if (isImg) {
        h += '<div style="margin-bottom:12px;"><img src="' + url + '" style="max-width:100%;border-radius:8px;border:1px solid var(--border);display:block;" loading="lazy" onerror="this.style.display=\'none\'"></div>';
      } else if (isPdf) {
        h += '<div style="margin-bottom:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden;"><iframe src="' + url + '" style="width:100%;height:500px;border:none;display:block;" title="' + escapeHtml(name) + '" loading="lazy"></iframe></div>';
      }
      h += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:8px;padding:12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;font-size:14px;text-decoration:none;color:var(--text);border:1px solid var(--border);">';
      h += '<span style="font-size:20px;">' + (isPdf ? '📄' : isImg ? '🖼️' : '📎') + '</span>';
      h += '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</span>';
      h += '<span style="font-size:12px;color:var(--text-secondary);flex-shrink:0;">下载 ↓</span>';
      h += '</a>';
    });
    h += '</div>';
  }
  h += '<div style="margin-top:24px;"><button class="poll-btn" onclick="history.back()">← 返回</button></div></div>';
  return h;
}