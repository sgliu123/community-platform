/* js/admin-pages/documents.js - 文件管理 */

function renderDocumentsAdmin() {
  const list = appData.documents || [];
  return `<div class="card"><div class="card-header"><h3>📄 文件管理</h3><button class="btn btn-primary" onclick="openEditModal('documents',null)">➕ 新增文件</button></div>` +
    '<table class="data-table"><thead><tr><th>标题</th><th>来源</th><th>日期</th><th>附件</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      let attachBadge = '';
      const attachments = item.attachments || [];
      const hasPdf = attachments.some(a => a.type === 'pdf') || (item.fileUrl && /\.pdf$/i.test(item.fileUrl));
      const hasImage = attachments.some(a => a.type === 'image') || (item.images && item.images.length);
      const hasLink = item.fileUrl && !hasPdf && !hasImage;

      if (hasPdf) attachBadge += '<span class="pdf-badge">📄 PDF</span> ';
      if (hasImage) attachBadge += '<span class="tag tag-active">🖼️ 图片</span> ';
      if (hasLink) attachBadge += '<span class="tag tag-test">🔗 链接</span> ';
      if (!hasPdf && !hasImage && !hasLink) attachBadge = '<span style="color:#999;font-size:12px;">—</span>';

      const openUrl = item.fileUrl || (attachments[0] && attachments[0].url) || '';
      let linkHtml = attachBadge;
      if (openUrl) {
        linkHtml = `<a href="${openUrl}" target="_blank" style="color:var(--primary);text-decoration:none;font-size:12px;">${attachBadge}查看 →</a>`;
      }

      return `<tr><td>${escapeHtml(item.title||'')}</td><td>${escapeHtml(item.source||'')}</td><td>${item.publishDate||''}</td><td>${linkHtml}</td><td class="actions"><button onclick="openEditModal('documents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('documents','${item.id}')">删除</button></td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}

