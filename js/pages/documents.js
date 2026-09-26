/* js/pages/documents.js - 上级文件系统 */

function renderDocuments() {
  const list = appData.documents || [];
  return '<div class="card"><div class="card-title"><span class="icon">📄</span>上级文件</div>' + (list.length ? list.map(d => renderListItem(d, "document")).join("") : '<div class="empty">暂无文件</div>') + '</div>';
}

function renderDocumentDetail(id) {
  const d = (appData.documents||[]).find(x => x.id === id);
  if (!d) return '<div class="empty">文件不存在</div>';
  let h = '<div class="card"><div class="detail-header"><h1>' + escapeHtml(d.title || '') + '</h1><div class="detail-meta">';
  h += '<span>来源：' + escapeHtml(d.source || '') + '</span><span>发布日期：' + (d.publishDate || '') + '</span><span>' + escapeHtml(d.category || '') + '</span></div></div>';
  h += '<div class="detail-content">' + renderInlineMedia(d.description || '') + '</div>';
  // 多图显示（后台 images 数组）
  const allImages = d.images || [];
  if (allImages.length > 0) {
    h += renderPhotoGallery(allImages, '文件图片', 'var(--primary)');
  }
  // 附件处理：attachments 数组与 fileUrl 可能指向同一文件，按 URL 去重，避免同一附件渲染两遍
  let allAttachments = [];
  const seenAttUrls = new Set();
  function pushAtt(att) {
    if (!att || !att.url || typeof att.url !== 'string') return;
    if (seenAttUrls.has(att.url)) return;
    seenAttUrls.add(att.url);
    allAttachments.push(att);
  }
  if (d.attachments && Array.isArray(d.attachments)) {
    d.attachments.forEach(pushAtt);
  }
  if (d.fileUrl) {
    pushAtt({ name: d.fileName || d.title || '附件文件', url: d.fileUrl });
  }
  if (allAttachments.length > 0) {
    h += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">📎 附件</div>';
    allAttachments.forEach(att => {
      const url = att.url || '';
      // 显示名兜底：后台上传时 name 可能是 URL 编码的存储 key，解码并只取文件名
      let name = att.name || '附件';
      try { name = decodeURIComponent(String(name)); } catch(e) {}
      name = name.split('/').pop() || '附件';
      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
      const isPdf = /\.pdf$/i.test(url);
      if (isPdf) {
        h += '<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;">';
        h += '<iframe src="' + url + '" style="width:100%;height:600px;border:none;display:block;" title="' + escapeHtml(name) + '" loading="lazy"></iframe>';
        h += '</div>';
      } else if (isImg) {
        h += '<div style="margin-bottom:12px;"><img src="' + url + '" style="max-width:100%;border-radius:8px;border:1px solid var(--border);display:block;" loading="lazy" onerror="this.style.display=\'none\'"></div>';
      }
      h += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:8px;padding:12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;font-size:14px;text-decoration:none;color:var(--text);border:1px solid var(--border);transition:all .2s;" onmouseover="this.style.borderColor=\'var(--primary)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
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