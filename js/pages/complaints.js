/* js/pages/complaints.js - 投诉建议与反馈 */

var _cpImages = [];

function renderComplaintsFrontEnd(list, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!list || !list.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无投诉建议</div>';
    return;
  }
  let html = '<div style="max-width:800px;margin:0 auto;">';
  list.slice().reverse().forEach(item => {
    if (!item) return;
    html += '<div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">';
    html += '<div style="font-size:16px;font-weight:600;">' + (item.isAnonymous ? '匿名' + item.type : escapeHtml(item.title || '')) + '</div>';
    html += '<span style="font-size:12px;padding:4px 10px;border-radius:20px;background:' + (item.status === '已办结' ? '#e8f5e9;color:#2e7d32' : (item.status === '已回复' ? '#e3f2fd;color:#1976d2' : '#fff3e0;color:#e65100')) + ';">' + item.status + '</span>';
    html += '</div>';
    html += '<div style="font-size:13px;color:#666;margin-bottom:12px;">' + (item.type || '') + ' &middot; ' + (item.residentRoom || '') + ' &middot; ' + formatDate(item.createdAt) + '</div>';
    html += '<div style="font-size:14px;line-height:1.6;margin-bottom:16px;color:#333;">' + escapeHtml(item.content || '') + '</div>';
    if (item.images && item.images.length) {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;">';
      item.images.forEach(url => {
        html += '<div style="position:relative;border-radius:8px;overflow:hidden;background:#f5f5f5;">';
        html += '<img src="' + url + '" style="width:100%;aspect-ratio:1;object-fit:cover;display:block;opacity:0;transition:opacity 0.2s;" loading="lazy" decoding="async" onload="this.style.opacity=1">';
        html += '</div>';
      });
      html += '</div>';
    }
    if (item.reply) {
      html += '<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-top:12px;">';
      html += '<div style="font-weight:600;color:#1976d2;margin-bottom:8px;font-size:14px;">&#128172; 管理员回复</div>';
      html += '<div style="font-size:12px;color:#666;margin-bottom:8px;">' + formatDate(item.replyAt) + ' &middot; ' + (item.handler || '管理员') + '</div>';
      html += '<div style="font-size:14px;line-height:1.6;color:#333;">' + escapeHtml(item.reply) + '</div>';
      if (item.replyImages && item.replyImages.length) {
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:12px;">';
        item.replyImages.forEach(url => {
          html += '<img src="' + url + '" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;" loading="lazy" decoding="async">';
        });
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
}

async function loadMyComplaints(){
  if(!residentAuth) return [];
  try{ const all=await workerRead(getCurrentMonthPath('complaints')); return all.filter(x=>x.residentRoom===residentAuth.roomNo); }
  catch(e){ console.error(e); return []; }
}

function renderComplaints(){
  if(!residentAuth) return renderAuthRequired('查看我的反馈');
  Promise.all([loadMyComplaints(), loadComplaintsFromWorker()]).then(([myList, allList])=>{
    appData._complaints = myList;
    appData._allComplaints = allList;
    if(getRoute().page==='complaints'){
      document.getElementById('main').innerHTML='<div class="page-content">'+renderComplaintsHTML(myList)+'</div>';
    }
  }).catch(e=>{
    console.error(e);
    appData._complaints=[];
    appData._allComplaints=[];
    if(getRoute().page==='complaints'){
      document.getElementById('main').innerHTML='<div class="page-content">'+renderComplaintsHTML([])+'</div>';
    }
  });
  return '<div class="loading">加载中...</div>';
}

function renderComplaintsHTML(list){
  let h='<div class="card"><div class="card-title"><span class="icon">📝</span>我的反馈</div>';
  if(!list.length){ h+='<div class="empty">暂无反馈记录</div>'; }
  else{
    list.slice().reverse().forEach(item=>{
      h+='<div class="list-item" onclick="navigate(\'complaint-detail\',\''+item.id+'\')">';
      h+='<span class="list-badge '+cpStatusBadge(item.status)+'">'+item.status+'</span>';
      h+='<div class="list-content"><div class="list-title">'+(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title))+'</div>';
      h+='<div class="list-meta">'+item.type+' · '+formatDate(item.createdAt)+'</div></div>';
      h+='<div class="list-arrow">›</div></div>';
    });
  }
  h+='<div style="margin-top:16px;text-align:center;"><button class="poll-btn" onclick="navigate(\'submit-complaint\')">➕ 提交反馈</button></div>';
  h+='</div>'; return h;
}

async function handleCPImages(input) {
  var files = Array.from(input.files);
  if (!files.length) return;
  var preview = document.getElementById('cpImagesPreview');
  var statusEl = document.getElementById('cpCompressStatus');
  if (statusEl) statusEl.style.display = 'block';
  for (var i = 0; i < files.length; i++) {
    try {
      var f = files[i];
      var compressed = await compressImage(f, { maxWidth: 640, maxHeight: 640, quality: 0.25, maxSize: 30 * 1024 });
      _cpImages.push(compressed);
      var url = URL.createObjectURL(compressed);
      var sizeHtml = '<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;backdrop-filter:blur(2px);">' + formatFileSize(compressed.size) + '</div>';
      var badgeHtml = compressed.size < f.size ? '<div style="position:absolute;top:2px;right:2px;background:var(--primary);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">已压缩</div>' : '';
      var idx = _cpImages.length - 1;
      var itemHtml = '<div id="cp-img-' + idx + '" style="width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);position:relative;flex-shrink:0;"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">' + sizeHtml + badgeHtml + '<button onclick="removeCPImage(' + idx + ')" style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:rgba(200,0,0,0.75);color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button></div>';
      preview.insertAdjacentHTML('beforeend', itemHtml);
    } catch (e) {
      _cpImages.push(files[i]);
      var url = URL.createObjectURL(files[i]);
      var idx = _cpImages.length - 1;
      var itemHtml = '<div id="cp-img-' + idx + '" style="width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);position:relative;flex-shrink:0;"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy"><div style="position:absolute;bottom:2px;left:2px;background:rgba(200,0,0,0.7);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">原图</div><button onclick="removeCPImage(' + idx + ')" style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:rgba(200,0,0,0.75);color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button></div>';
      preview.insertAdjacentHTML('beforeend', itemHtml);
    }
  }
  if (statusEl) statusEl.style.display = 'none';
  input.value = '';
}

function removeCPImage(idx) {
  if (_cpImages[idx]) {
    _cpImages.splice(idx, 1);
    var el = document.getElementById('cpImagesPreview');
    if (el) {
      el.innerHTML = '';
      _cpImages.forEach(function(f, i) {
        var url = URL.createObjectURL(f);
        var sizeHtml = '<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;backdrop-filter:blur(2px);">' + formatFileSize(f.size) + '</div>';
        var itemHtml = '<div id="cp-img-' + i + '" style="width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);position:relative;flex-shrink:0;"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">' + sizeHtml + '<button onclick="removeCPImage(' + i + ')" style="position:absolute;top:2px;left:2px;width:18px;height:18px;background:rgba(200,0,0,0.75);color:#fff;border:none;border-radius:50%;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button></div>';
        el.insertAdjacentHTML('beforeend', itemHtml);
      });
    }
  }
}

function renderSubmitComplaint(){
  let h='<div class="card"><div class="card-title"><span class="icon">📝</span>投诉建议</div>';
  h+='<div class="form-group"><label>类型</label><select id="cpType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>投诉</option><option>建议</option><option>咨询</option><option>表扬</option></select></div>';
  h+='<div class="form-group"><label>标题</label><input type="text" id="cpTitle" placeholder="简要描述问题" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>';
  h+='<div class="form-group"><label>内容</label><textarea id="cpContent" rows="5" placeholder="请详细描述情况，便于物业及时处理..." style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;"></textarea></div>';
  h+='<div class="form-group"><label>相关图片（可选，不限制数量）</label>';
  h+='<div id="cpImagesPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;min-height:0;"></div>';
  h+='<div style="display:none;width:100%;text-align:center;padding:12px;color:var(--text-secondary);font-size:13px;" id="cpCompressStatus">正在压缩处理图片，请稍候...</div>';
  h+='<input type="file" id="cpImages" accept="image/*" multiple style="display:none" onchange="handleCPImages(this)">';
  h+='<button type="button" class="btn" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:13px;" onclick="document.getElementById(\'cpImages\').click()">📎 选择图片</button>';
  h+='<span style="font-size:12px;color:var(--text-secondary);margin-left:8px;">支持多张，自动压缩加速上传</span></div>';
  h+='<div class="form-group" style="display:flex;align-items:center;gap:8px;"><input type="checkbox" id="cpAnonymous" style="width:auto;"><label for="cpAnonymous" style="margin-bottom:0;">匿名提交</label></div>';
  h+='<div style="margin-top:20px;"><button class="poll-btn" onclick="doSubmitComplaint()">提交</button>';
  h+='<button class="poll-btn" style="background:#888;margin-left:8px;" onclick="history.back()">取消</button></div></div>';
  return h;
}

async function doSubmitComplaint(){
  if(!residentAuth){ showLogin(); return; }
  const type=document.getElementById('cpType').value;
  const title=document.getElementById('cpTitle').value.trim();
  const content=document.getElementById('cpContent').value.trim();
  const isAnonymous=document.getElementById('cpAnonymous').checked;
  if(!title||!content){ alert('请填写完整'); return; }
  showPageLoading(true);
  try{
    let images=[];
    let uploadErrors=[];
    for(const f of _cpImages){
      try{
        const r=await workerUpload(f);
        if(r && r.url) images.push(r.url);
        else uploadErrors.push(f.name || '图片' + (uploadErrors.length+1) + ': 返回数据异常');
      }catch(e){
        uploadErrors.push((f.name || '图片' + (uploadErrors.length+1)) + ': ' + e.message);
      }
    }
    if(uploadErrors.length > 0){
      const msg = '以下图片上传失败（服务器暂时不可用）：\n' + uploadErrors.join('\n') + '\n\n是否继续提交？\n- 点「确定」：提交（不含失败的图片）\n- 点「取消」：返回修改';
      if(!confirm(msg)){ showPageLoading(false); return; }
    }
    const list=await workerRead(getCurrentMonthPath('complaints'));
    const item={
      id:genCPId(), type, title, content, isAnonymous, images,
      residentRoom:residentAuth.roomNo, residentName:residentAuth.name,
      status:'待处理', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
      reply:'', replyAt:'', satisfaction:null, handler:''
    };
    list.push(item);
    await workerWrite(getCurrentMonthPath('complaints'), list, '业主提交'+type+' '+title);
    _cpImages=[];
    alert('✅ 提交成功！');
    navigate('complaints');
  }catch(e){ alert('提交失败：'+e.message); }
  finally{ showPageLoading(false); }
}

function renderComplaintDetail(id){
  const list=appData._complaints||[];
  const item=list.find(x=>x.id===id);
  if(!item){
    if(residentAuth && !appData._cpLoading){
      appData._cpLoading=true;
      loadMyComplaints().then(function(loaded){
        appData._complaints=loaded;
        appData._cpLoading=false;
        var r=getRoute();
        if(r.page==='complaint-detail' && r.params===id){
          document.getElementById('main').innerHTML='<div class="page-content">'+renderComplaintDetail(id)+'</div>';
        }
      }).catch(function(e){
        appData._cpLoading=false;
        var r=getRoute();
        if(r.page==='complaint-detail' && r.params===id){
          document.getElementById('main').innerHTML='<div class="page-content"><div class="empty">加载失败，请刷新重试</div></div>';
        }
      });
      return '<div class="loading">正在加载反馈数据...</div>';
    }
    return '<div class="empty">记录不存在</div>';
  }
  let h='<div class="card"><div class="detail-header"><h1>'+(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title))+'</h1>';
  h+='<div class="detail-meta"><span class="list-badge '+cpStatusBadge(item.status)+'">'+item.status+'</span>';
  h+='<span>类型：'+item.type+'</span><span>编号：'+item.id+'</span><span>提交：'+formatDate(item.createdAt)+'</span></div></div>';
  h+='<div class="detail-content"><p>'+escapeHtml(item.content)+'</p></div>';
  h += renderPhotoGallery(item.images, '相关图片（业主上传）', '#e65100');
  var replyImages = item.replyImages || item.adminImages || [];
  if (replyImages.length > 0) {
    h += renderPhotoGallery(replyImages, '已上传回复图片', 'var(--primary)');
  }
  h+='<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"><div style="font-weight:600;margin-bottom:12px;">📋 处理节点记录</div>';
  var timeline = item.timeline || [];
  if (!timeline.length && item.reply) {
    timeline = [{
      time: item.replyAt || item.updatedAt,
      action: '物业回复',
      operator: item.handler || '管理员',
      content: item.reply
    }];
  }
  if(!timeline.length){h+='<div style="font-size:13px;color:var(--text-secondary);padding:8px 0;">暂无处理记录</div>';}
  else{
    timeline.forEach(function(t,idx){
      var isLast=idx===timeline.length-1;
      h+='<div style="position:relative;padding-left:28px;margin-bottom:16px;">';
      if(!isLast) h+='<div style="position:absolute;left:8px;top:14px;bottom:-16px;width:2px;background:#e0e0e0;"></div>';
      h+='<div style="position:absolute;left:2px;top:6px;width:12px;height:12px;background:var(--primary);border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px var(--primary);z-index:1;"></div>';
      h+='<div style="background:#f8f9fa;border-radius:8px;padding:12px 14px;border:1px solid #eef0f2;">';
      h+='<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
      h+='<span>🕐 '+formatDateTime(t.time)+'</span>';
      h+='<span>👤 '+escapeHtml(t.operator || item.handler || '管理员')+'</span>';
      h+='</div>';
      if (t.action) {
        h+='<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">'+escapeHtml(t.action)+'</div>';
      }
      var contentText = t.content || t.reply || '';
      if (contentText) {
        h+='<div style="font-size:14px;color:var(--text);line-height:1.6;">'+escapeHtml(contentText)+'</div>';
      }
      h+='</div></div>';
    });
  }
  h+='</div>';
  if(item.reply){
    h+='<div style="margin-top:16px;padding:16px;background:#e3f2fd;border-radius:8px;border-left:4px solid var(--primary);">';
    h+='<div style="font-weight:600;margin-bottom:6px;">📢 物业回复</div><div>'+escapeHtml(item.reply)+'</div>';
    h+='<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;">'+formatDateTime(item.replyAt)+'</div></div>';
    if(item.status==='已回复'){
      h+='<div style="margin-top:12px;"><div style="font-weight:600;margin-bottom:8px;">您对处理结果是否满意？</div>';
      h+='<button class="action-btn primary" onclick="doCPSatisfaction(\''+item.id+'\',true)">👍 满意</button>';
      h+='<button class="action-btn secondary" style="margin-left:8px;" onclick="doCPSatisfaction(\''+item.id+'\',false)">👎 不满意</button></div>';
    }
  }
  if(item.satisfaction!==null){
    h+='<div style="margin-top:16px;padding:14px;background:#e8f5e9;border-radius:8px;font-size:14px;font-weight:500;">';
    h+='💬 您的满意度反馈：'+(item.satisfaction?'👍 满意':'👎 不满意');
    h+='</div>';
  }
  h+='<div style="margin-top:20px;"><button class="poll-btn" onclick="history.back()">← 返回</button></div></div>';
  return h;
}

async function doCPSatisfaction(id,sat){
  showPageLoading(true);
  try{
    const path=getCurrentMonthPath('complaints');
    const list=await workerRead(path);
    const item=list.find(x=>x.id===id);
    if(item){ item.satisfaction=sat; item.status='已办结'; item.updatedAt=new Date().toISOString(); }
    await workerWrite(path, list, '业主反馈满意度 '+id);
    alert('感谢您的反馈'); navigate('complaint-detail', id);
  }catch(e){ alert('操作失败：'+e.message); }
  finally{ showPageLoading(false); }
}
