/* js/admin-pages/complaints.js - 投诉建议管理 */

function renderComplaintsAdmin(){
  setTimeout(() => refreshComplaints(), 50);
  return '<div id="cpCard"><div class="empty-state"><div class="icon">📝</div><div>正在加载投诉建议数据...</div></div></div>';
}



function renderCPList(list){
  if(!list || !list.length) return '<div class="empty-state"><div class="icon">📝</div><div>暂无投诉建议数据</div></div>';
  let h = '<table class="data-table"><thead><tr><th>编号</th><th>类型</th><th>标题</th><th>房号</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>';
  list.slice().reverse().forEach(item=>{
    if(!item) return;
    h += '<tr><td>'+(item.id||'')+'</td><td>'+(item.type||'')+'</td>';
    h += '<td>'+(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title||'')) + (item.images && item.images.length ? ' <span style="color:var(--primary);font-size:12px;">📷'+item.images.length+'</span>' : '') + '</td><td>'+(item.residentRoom||'')+'</td>';
    h += '<td><span class="tag '+cpStatusClass(item.status)+'">'+item.status+'</span></td>';
    h += '<td>'+formatDateTime(item.createdAt)+'</td>';
    h += '<td class="actions"><button onclick="openComplaintModal(\''+item.id+'\')">处理</button></td></tr>';
  });
  h += '</tbody></table>';
  return h;
}



let _cpFilterStatus = '';



function renderComplaintsContent(){
  const list = appData.complaints || [];
  const counts = { '待处理':0, '处理中':0, '已回复':0, '已办结':0 };
  list.forEach(x => { if(x && x.status && counts[x.status]!==undefined) counts[x.status]++; });
  let h = '<div class="card"><div class="card-header"><h3>📝 投诉建议</h3>';
  h += '<div class="actions"><button class="btn" onclick="refreshComplaints()">🔄 刷新</button></div></div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  Object.entries(counts).forEach(([k,v])=>{
    const active = _cpFilterStatus===k ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : '';
    h += '<button class="btn btn-sm" onclick="filterCPStatus(\''+k+'\')" style="'+active+(v>0?'font-weight:600;':'')+'">'+k+' ('+v+')</button>';
  });
  const allActive = _cpFilterStatus==='' ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : '';
  h += '<button class="btn btn-sm" onclick="filterCPStatus(\'\')" style="'+allActive+'">全部 ('+list.length+')</button></div>';
  h += '<div id="cpList">' + renderCPList(_cpFilterStatus ? list.filter(x=>x.status===_cpFilterStatus) : list) + '</div></div>';
  const el = document.getElementById('cpCard');
  if(el) el.innerHTML = h;
}



function filterCPStatus(status){
  _cpFilterStatus = status;
  renderComplaintsContent();
}



async function refreshComplaints(){
  showLoading(true);
  try{
    appData.complaints = await loadAllComplaints();
    renderComplaintsContent();
  }catch(e){ showToast('加载失败：'+e.message, 'error'); }
  finally{ showLoading(false); }
}



let _cpReplyImages = [];


async function handleCPReplyImages(input){
  const files = Array.from(input.files);
  const preview = document.getElementById('cpReplyImagesPreview');
  const countEl = document.getElementById('cpReplyImgCount');
  for(const f of files){
    if(!f.type.startsWith('image/')) continue;
    let file = f;
    try{ file = await compressImageToBlob(f, 0.03); }
    catch(e){ showToast('"'+f.name+'" 压缩失败：'+e.message, 'error'); continue; }
    const url = URL.createObjectURL(file);
    const div = document.createElement('div');
    div.style.cssText = 'position:relative;width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border);';
    div.dataset.fname = file.name;
    div.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover;"><button type="button" onclick="removeCPReplyImage(this)" style="position:absolute;top:2px;right:2px;width:16px;height:16px;background:rgba(0,0,0,0.6);color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>';
    preview.appendChild(div);
    _cpReplyImages.push(file);
  }
  if(countEl) countEl.textContent = _cpReplyImages.length;
  input.value = '';
}


function removeCPReplyImage(btn){
  const div = btn.parentElement;
  const fname = div.dataset.fname;
  _cpReplyImages = _cpReplyImages.filter(f => f.name !== fname);
  div.remove();
  const countEl = document.getElementById('cpReplyImgCount');
  if(countEl) countEl.textContent = _cpReplyImages.length;
}



function openComplaintModal(id){
  _cpReplyImages = [];
  const list = appData.complaints || [];
  const item = list.find(x=>x.id===id);
  if(!item) return;
  document.getElementById('modalTitle').textContent = '处理反馈：'+item.id;
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">'+(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title))+'</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">'+(item.type||'')+' · '+(item.residentRoom||'')+' · '+(item.isAnonymous?'匿名':(item.residentName||''))+'</div>';
  body += '<div style="font-size:13px;margin-top:8px;">'+escapeHtml(item.content||'')+'</div>';
  if(item.images && item.images.length){
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    item.images.forEach(url=>{
      body += '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
    });
    body += '</div>';
  }
  body += '</div>';

  if(item.replyImages && item.replyImages.length){
    body += '<div style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:8px;font-size:13px;color:#1976D2;">📷 已上传回复图片</div>';
    body += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    item.replyImages.forEach(url=>{
      body += '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
    });
    body += '</div></div>';
  }

  if(item.reply){
    body += '<div style="margin-bottom:12px;padding:12px;background:#e3f2fd;border-radius:8px;border-left:4px solid #1976D2;">';
    body += '<div style="font-weight:600;color:#1976D2;margin-bottom:4px;">💬 已回复</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">'+formatDateTime(item.replyAt)+' · '+(item.handler||'管理员')+'</div>';
    body += '<div style="font-size:13px;">'+escapeHtml(item.reply)+'</div>';
    body += '</div>';
  }

  if(item.timeline && item.timeline.length){
    body += '<div style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:8px;">📋 处理节点记录</div>';
    body += '<div style="border-left:2px solid var(--border);padding-left:12px;">';
    item.timeline.forEach((t, i) => {
      body += '<div style="position:relative;margin-bottom:12px;padding-bottom:12px;'+(i<item.timeline.length-1?'border-bottom:1px dashed var(--border);':'')+'">';
      body += '<div style="position:absolute;left:-17px;top:2px;width:10px;height:10px;background:var(--primary);border-radius:50%;"></div>';
      body += '<div style="font-size:12px;color:var(--text-secondary);">'+formatDateTime(t.time)+' · '+(t.operator||'系统')+'</div>';
      body += '<div style="font-size:13px;margin-top:4px;">'+escapeHtml(t.action)+'</div>';
      body += '</div>';
    });
    body += '</div></div>';
  }

  body += '<div class="form-group"><label>回复内容</label><textarea id="cpReply" rows="4" placeholder="填写回复内容...">'+(item.reply||'')+'</textarea></div>';
  body += '<div class="form-group"><label>回复图片（不限制数量，自动高强度压缩至50KB以内）</label>';
  body += '<div id="cpReplyImagesPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"></div>';
  body += '<input type="file" id="cpReplyImages" accept="image/*" multiple style="display:none" onchange="handleCPReplyImages(this)">';
  body += '<button type="button" class="btn" onclick="document.getElementById(\'cpReplyImages\').click()">📎 选择图片（自动压缩至30KB内）</button>';
  body += '<span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">支持多选，已选 <span id="cpReplyImgCount">0</span> 张</span>';
  body += '</div>';
  body += '<div class="form-group"><label>操作</label><select id="cpAction"><option value="reply">回复业主</option><option value="close">直接办结</option></select></div>';
  body += '<div style="text-align:right;margin-top:8px;"><button class="btn" onclick="downloadComplaintSummary(\''+id+'\')">📥 下载处理总结</button></div>';
  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn" onclick="previewComplaintFrontEnd(\''+id+'\')">👁️ 预览前端效果</button><button class="btn btn-primary" onclick="saveComplaintAction(\''+id+'\')">保存</button>';
  document.getElementById('modalOverlay').classList.add('active');
}



function previewComplaintFrontEnd(id){
  const list = appData.complaints || [];
  const item = list.find(x=>x.id===id);
  if(!item) return;
  let html = '<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;">';
  html += '<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">';
  html += '<div style="font-size:18px;font-weight:600;margin-bottom:12px;">'+(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title))+'</div>';
  html += '<div style="font-size:13px;color:#666;margin-bottom:16px;">'+(item.type||'')+' · '+(item.residentRoom||'')+' · '+formatDateTime(item.createdAt)+'</div>';
  html += '<div style="font-size:14px;line-height:1.6;margin-bottom:16px;">'+escapeHtml(item.content||'')+'</div>';
  if(item.images && item.images.length){
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:16px;">';
    item.images.forEach(url=>{
      html += '<img src="'+url+'" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
    });
    html += '</div>';
  }
  if(item.reply){
    html += '<div style="background:#e3f2fd;border-radius:8px;padding:16px;margin-bottom:16px;border-left:4px solid #1976D2;">';
    html += '<div style="font-weight:600;color:#1976D2;margin-bottom:8px;">💬 管理员回复</div>';
    html += '<div style="font-size:13px;color:#666;margin-bottom:8px;">'+formatDateTime(item.replyAt)+' · '+(item.handler||'管理员')+'</div>';
    html += '<div style="font-size:14px;line-height:1.6;">'+escapeHtml(item.reply)+'</div>';
    if(item.replyImages && item.replyImages.length){
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;margin-top:12px;">';
      item.replyImages.forEach(url=>{
        html += '<img src="'+url+'" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
      });
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div></div>';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
  overlay.innerHTML = '<div style="position:relative;max-width:640px;width:100%;"><button onclick="this.closest(\'.preview-overlay\').remove()" style="position:absolute;top:-40px;right:0;background:rgba(255,255,255,0.9);border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:14px;">✕ 关闭预览</button>'+html+'</div>';
  overlay.className = 'preview-overlay';
  document.body.appendChild(overlay);
}



async function saveComplaintAction(id){
  const reply = document.getElementById('cpReply').value.trim();
  const action = document.getElementById('cpAction').value;
  if(action==='reply' && !reply){ alert('请填写回复内容'); return; }
  showLoading(true);
  try{
    // 优先从内存中获取记录，避免跨月份或数据不同步导致找不到
    let cpList = appData.complaints || [];
    let item = cpList.find(x=>x.id===id);

    // 如果内存中没有，尝试从当前月份文件读取（兼容旧逻辑）
    if(!item){
      const path = getCurrentMonthPath('complaints');
      cpList = await workerRead(path);
      item = cpList.find(x=>x.id===id);
    }

    if(!item) throw new Error('记录不存在或已过期，请刷新页面后重试');
    if(reply){ item.reply = reply; item.replyAt = new Date().toISOString(); }
    item.status = action==='close' ? '已办结' : '已回复';
    item.handler = currentAdmin && currentAdmin.name || '管理员';
    item.updatedAt = new Date().toISOString();
    item.timeline = item.timeline || [];
    item.timeline.push({time:new Date().toISOString(), action: action==='close'?'直接办结':('回复：'+reply), operator: item.handler, status: item.status});
    // 上传回复图片（不限制数量，逐个上传，高强度压缩）
    item.replyImages = item.replyImages || [];
    for(const f of _cpReplyImages){
      try{
        const r = await workerUpload(f);
        item.replyImages.push(r.url || r);
      }catch(e){
        showToast('图片上传失败：'+e.message, 'error');
      }
    }
    _cpReplyImages = [];
    const path = getCurrentMonthPath('complaints');
    await workerWrite(path, cpList, '管理员处理反馈 '+id);
    appData.complaints = cpList;
    // 追加审计日志
    appendAuditLog('complaint-update', 'complaints', id, '管理员处理反馈 ' + id + '，状态：' + item.status);
    closeModal();
    showToast('处理成功', 'success');
    navigateTo('complaints');
  }catch(e){ showToast('处理失败：'+e.message, 'error'); }
  finally{ showLoading(false); }
}



function downloadComplaintSummary(id){
  const item = (appData.complaints||[]).find(x=>x.id===id);
  if(!item) return;
  let text = '投诉建议处理总结\n';
  text += '================================\n';
  text += '编号：'+item.id+'\n';
  text += '类型：'+(item.type||'')+'\n';
  text += '标题：'+(item.isAnonymous?'匿名'+item.type:(item.title||''))+'\n';
  text += '房号：'+(item.residentRoom||'')+'\n';
  text += '业主：'+(item.isAnonymous?'匿名':(item.residentName||''))+'\n';
  text += '当前状态：'+item.status+'\n';
  text += '提交时间：'+formatDateTime(item.createdAt)+'\n';
  text += '内容：'+(item.content||'')+'\n\n';
  if(item.reply){
    text += '【回复记录】\n';
    text += '回复时间：'+formatDateTime(item.replyAt)+'\n';
    text += '处理人：'+(item.handler||'')+'\n';
    text += '回复内容：'+item.reply+'\n\n';
  }
  if(item.timeline && item.timeline.length){
    text += '【处理节点记录】\n';
    item.timeline.forEach(t => {
      text += formatDateTime(t.time) + ' | ' + (t.operator||'系统') + ' | ' + t.action + '\n';
    });
  }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '投诉建议总结_'+item.id+'.txt';
  a.click();
  URL.revokeObjectURL(url);
}





