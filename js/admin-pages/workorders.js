/* js/admin-pages/workorders.js - 工单管理 */

/* ========== 工单 & 投诉 管理端渲染函数（新增，不影响原有功能） ========== */



function renderWorkordersAdmin(){
  setTimeout(() => refreshWorkorders(), 50);
  return '<div id="woCard"><div class="empty-state"><div class="icon">🔧</div><div>正在加载工单数据...</div></div></div>';
}



function renderWOList(list){
  if(!list || !list.length) return '<div class="empty-state"><div class="icon">🔧</div><div>暂无工单数据</div></div>';
  let h = '<table class="data-table"><thead><tr><th>工单号</th><th>类型</th><th>标题</th><th>房号</th><th>状态</th><th>提交时间</th><th>操作</th></tr></thead><tbody>';
  list.slice().reverse().forEach(item=>{
    if(!item) return;
    const isLocked = item.status === '已完成' && !item.isTest;
    h += '<tr><td>'+(item.id||'')+'</td><td>'+(item.type||'')+'</td><td>'+escapeHtml(item.title||'')+'</td><td>'+(item.residentRoom||'')+'</td>';
    h += '<td><span class="tag '+woStatusClass(item.status)+'">'+item.status+'</span></td>';
    h += '<td>'+formatDateTime(item.createdAt)+'</td>';
    if(isLocked){
      h += '<td class="actions"><button onclick="openWorkorderModal(\''+item.id+'\')">🔒 查看</button></td></tr>';
    } else {
      h += '<td class="actions"><button onclick="openWorkorderModal(\''+item.id+'\')">处理</button></td></tr>';
    }
  });
  h += '</tbody></table>';
  return h;
}



let _woFilterStatus = '';



function renderWorkordersContent(){
  const list = appData.workorders || [];
  const counts = { '待受理':0, '已派单':0, '处理中':0, '待评价':0, '已完成':0 };
  list.forEach(x => { if(x && x.status && counts[x.status]!==undefined) counts[x.status]++; });
  let h = '<div class="card"><div class="card-header"><h3>🔧 工单管理</h3>';
  h += '<div class="actions"><button class="btn" onclick="refreshWorkorders()">🔄 刷新</button></div></div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">';
  Object.entries(counts).forEach(([k,v])=>{
    const active = _woFilterStatus===k ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : '';
    h += '<button class="btn btn-sm" onclick="filterWOStatus(\''+k+'\')" style="'+active+(v>0?'font-weight:600;':'')+'">'+k+' ('+v+')</button>';
  });
  const allActive = _woFilterStatus==='' ? 'background:var(--primary);color:#fff;border-color:var(--primary);' : '';
  h += '<button class="btn btn-sm" onclick="filterWOStatus(\'\')" style="'+allActive+'">全部 ('+list.length+')</button></div>';
  h += '<div id="woList">' + renderWOList(_woFilterStatus ? list.filter(x=>x.status===_woFilterStatus) : list) + '</div></div>';
  const el = document.getElementById('woCard');
  if(el) el.innerHTML = h;
}



function filterWOStatus(status){
  _woFilterStatus = status;
  renderWorkordersContent();
}



async function refreshWorkorders(){
  showLoading(true);
  try{
    appData.workorders = await loadAllWorkorders();
    // 5-year retention: filter out completed non-test workorders older than 5 years from display
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear()-5, now.getMonth(), now.getDate());
    appData.workorders = (appData.workorders || []).filter(item => {
      if(!item) return false;
      // Keep all non-completed, all test data, and completed within 5 years
      if(item.status !== '已完成') return true;
      if(item.isTest) return true;
      const created = item.createdAt ? new Date(item.createdAt) : new Date();
      return created >= fiveYearsAgo;
    });
    renderWorkordersContent();
  }catch(e){ showToast('加载失败：'+e.message, 'error'); }
  finally{ showLoading(false); }
}



function openWorkorderModal(id){
  _woAdminImages = [];
  const list = appData.workorders || [];
  const item = list.find(x=>x.id===id);
  if(!item) return;
  const isLocked = item.status === '已完成' && !item.isTest;
  document.getElementById('modalTitle').textContent = '处理工单：'+item.id;
  let body = '<div style="margin-bottom:12px;padding:12px;background:#f8f9fa;border-radius:8px;">';
  body += '<div style="font-weight:600;margin-bottom:4px;">'+escapeHtml(item.title)+'</div>';
  body += '<div style="font-size:13px;color:var(--text-secondary);">'+(item.type||'')+' · '+(item.residentRoom||'')+' · '+(item.residentName||'')+'</div>';
  body += '<div style="font-size:13px;margin-top:8px;">'+escapeHtml(item.description||'')+'</div>';
  if(item.images && item.images.length){
    body += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">';
    item.images.forEach(url=>{
      body += '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
    });
    body += '</div>';
  }
  body += '</div>';

  if(item.rating !== undefined && item.rating !== null){
    body += '<div style="margin-bottom:12px;padding:12px;background:#e8f5e9;border-radius:8px;border-left:4px solid var(--success);">';
    body += '<div style="font-weight:600;color:var(--success);margin-bottom:4px;">⭐ 业主评价</div>';
    body += '<div style="font-size:20px;color:#f9a825;margin-bottom:4px;">' + '★'.repeat(item.rating) + '☆'.repeat(5-item.rating) + ' <span style="font-size:14px;color:var(--text-secondary);">'+item.rating+'/5</span></div>';
    if(item.ratingComment) body += '<div style="font-size:13px;">'+escapeHtml(item.ratingComment)+'</div>';
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

  if(item.adminImages && item.adminImages.length){
    body += '<div style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:8px;">📷 已上传处理图片</div>';
    body += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    item.adminImages.forEach(url=>{
      body += '<img src="'+url+'" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer;" onclick="previewImage(\''+url+'\')" loading="lazy" decoding="async">';
    });
    body += '</div></div>';
  }

  if(isLocked){
    body += '<div style="margin-bottom:16px;padding:12px;background:#fff3e0;border-radius:8px;border-left:4px solid var(--warning);text-align:center;">';
    body += '<div style="font-weight:600;color:var(--warning);font-size:15px;">🔒 该工单已完成并锁定</div>';
    body += '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">系统归档保存，不可修改（测试数据除外）</div>';
    body += '</div>';
  }

  body += '<div class="form-group"><label>当前状态</label><select id="woNewStatus" '+(isLocked?'disabled style="background:#f5f5f5;"':'')+'>';
  ['待受理','已派单','处理中','待评价','已完成'].forEach(s=>{
    body += '<option value="'+s+'" '+(item.status===s?'selected':'')+'>'+s+'</option>';
  });
  body += '</select></div>';
  body += '<div class="form-group"><label>指派维修工</label><input type="text" id="woAssignee" value="'+escapeHtml(item.assignedTo||'')+'" placeholder="维修工姓名" '+(isLocked?'readonly style="background:#f5f5f5;"':'')+'></div>';
  body += '<div class="form-group"><label>维修工电话</label><input type="text" id="woWorkerPhone" value="'+escapeHtml(item.workerPhone||'')+'" placeholder="联系电话" '+(isLocked?'readonly style="background:#f5f5f5;"':'')+'></div>';
  body += '<div class="form-group"><label>处理说明</label><textarea id="woReply" rows="3" placeholder="填写处理进度、结果等" '+(isLocked?'readonly style="background:#f5f5f5;"':'')+'></textarea></div>';
  body += '<div class="form-group"><label>处理图片（可选）</label><div id="woAdminImagesPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"></div>';
  if(!isLocked){
    body += '<input type="file" id="woAdminImages" accept="image/*" multiple style="display:none" onchange="handleWOAdminImages(this)">';
    body += '<button type="button" class="btn" onclick="document.getElementById(\'woAdminImages\').click()">📎 上传图片（自动压缩至30KB内）</button>';
  }
  body += '</div>';
  body += '<div style="text-align:right;margin-top:8px;"><button class="btn" onclick="downloadWorkorderSummary(\''+id+'\')">📥 下载处理总结</button></div>';
  document.getElementById('modalBody').innerHTML = body;
  if(isLocked){
    document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>';
  } else {
    document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="saveWorkorderAction(\''+id+'\')">保存</button>';
  }
  document.getElementById('modalOverlay').classList.add('active');
}



let _woAdminImages = [];


async function handleWOAdminImages(input){
  const files=Array.from(input.files).slice(0,3);
  const preview=document.getElementById('woAdminImagesPreview');
  preview.innerHTML=''; _woAdminImages=[];
  for(const f of files){
    let file=f;
    if(f.type.startsWith('image/')){
      try{ file=await compressImageToBlob(f,0.03); }catch(e){ showToast('图片压缩失败：'+e.message,'error'); continue; }
    }
    const url=URL.createObjectURL(file);
    preview.innerHTML+='<div style="width:60px;height:60px;border-radius:4px;overflow:hidden;border:1px solid var(--border);"><img src="'+url+'" style="width:100%;height:100%;object-fit:cover;"></div>';
    _woAdminImages.push(file);
  }
}



async function saveWorkorderAction(id){
  const list = appData.workorders || [];
  const checkItem = list.find(x=>x.id===id);
  if(checkItem && checkItem.status === '已完成' && !checkItem.isTest){
    showToast('该工单已完成并锁定，不可修改', 'error');
    return;
  }
  const status = document.getElementById('woNewStatus').value;
  const assignee = document.getElementById('woAssignee').value.trim();
  const workerPhone = document.getElementById('woWorkerPhone').value.trim();
  const reply = document.getElementById('woReply').value.trim();
  showLoading(true);
  try{
    // 优先从内存中获取记录，避免跨月份或数据不同步导致找不到
    let woList = appData.workorders || [];
    let item = woList.find(x=>x.id===id);

    // 如果内存中没有，尝试从当前月份文件读取（兼容旧逻辑）
    if(!item){
      const path = getCurrentMonthPath('workorders');
      woList = await workerRead(path);
      item = woList.find(x=>x.id===id);
    }

    if(!item) throw new Error('工单不存在或已过期，请刷新页面后重试');
    if(item.status === '已完成' && !item.isTest){
      throw new Error('该工单已完成并锁定，不可修改');
    }
    const oldStatus = item.status;
    item.status = status;
    item.assignedTo = assignee;
    item.workerPhone = workerPhone;
    if(reply){
      item.timeline = item.timeline || [];
      item.timeline.push({time:new Date().toISOString(), action:reply, operator:(currentAdmin&&currentAdmin.name)||'管理员', status: status});
    }
    if(assignee && oldStatus==='待受理' && status==='待受理') item.status='已派单';
    if(reply && (status==='已派单'||status==='处理中')) item.status='处理中';
    if(status==='已完成' && (item.rating===undefined || item.rating===null)) item.status='待评价';
    item.updatedAt = new Date().toISOString();
    for(const f of _woAdminImages){
      const r = await workerUpload(f);
      item.adminImages = item.adminImages || [];
      item.adminImages.push(r.url || r);
    }
    _woAdminImages = [];
    const path = getCurrentMonthPath('workorders');
    await workerWrite(path, woList, '管理员处理工单 '+id);
    appData.workorders = woList;
    // 追加审计日志
    appendAuditLog('workorder-update', 'workorders', id, '管理员处理工单 ' + id + '，状态：' + item.status);
    closeModal();
    showToast('处理成功', 'success');
    navigateTo('workorders');
  }catch(e){ showToast('处理失败：'+e.message, 'error'); }
  finally{ showLoading(false); }
}



function downloadWorkorderSummary(id){
  const item = (appData.workorders||[]).find(x=>x.id===id);
  if(!item) return;
  let text = '工单处理总结\n';
  text += '============================\n';
  text += '工单号：'+item.id+'\n';
  text += '标题：'+(item.title||'')+'\n';
  text += '类型：'+(item.type||'')+'\n';
  text += '房号：'+(item.residentRoom||'')+'\n';
  text += '业主：'+(item.residentName||'')+'\n';
  text += '当前状态：'+item.status+'\n';
  text += '提交时间：'+formatDateTime(item.createdAt)+'\n';
  text += '问题描述：'+(item.description||'')+'\n\n';
  if(item.assignedTo){
    text += '指派维修工：'+item.assignedTo+'\n';
    text += '维修工电话：'+(item.workerPhone||'')+'\n\n';
  }
  if(item.timeline && item.timeline.length){
    text += '【处理节点记录】\n';
    item.timeline.forEach(t => {
      text += formatDateTime(t.time) + ' | ' + (t.operator||'系统') + ' | ' + t.action + '\n';
    });
    text += '\n';
  }
  if(item.rating !== undefined && item.rating !== null){
    text += '【业主评价】\n';
    text += '评分：' + item.rating + '/5\n';
    text += '评价内容：' + (item.ratingComment||'') + '\n';
  }
  const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '工单总结_'+item.id+'.txt';
  a.click();
  URL.revokeObjectURL(url);
}

