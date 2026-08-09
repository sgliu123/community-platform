/* js/pages/workorders.js - 报修系统 */

var _woImages = [];
var _woRatingValue = 0;

async function loadMyWorkorders(){
  if(!residentAuth) return [];
  try{ const all=await workerRead(getCurrentMonthPath('workorders')); return all.filter(x=>x.residentRoom===residentAuth.roomNo); }
  catch(e){ console.error(e); return []; }
}

function renderWorkorders(){
  if(!residentAuth) return renderAuthRequired('查看我的报修');
  loadMyWorkorders().then(list=>{
    appData._workorders=list;
    if(getRoute().page==='workorders'){
      document.getElementById('main').innerHTML='<div class="page-content">'+renderWorkordersHTML(list)+'</div>';
    }
  }).catch(e=>{
    console.error(e);
    appData._workorders=[];
    if(getRoute().page==='workorders'){
      document.getElementById('main').innerHTML='<div class="page-content">'+renderWorkordersHTML([])+'</div>';
    }
  });
  return '<div class="loading">加载中...</div>';
}

function renderWorkordersHTML(list){
  let h='<div class="card"><div class="card-title"><span class="icon">🔧</span>我的报修</div>';
  if(!list.length){ h+='<div class="empty">暂无报修记录</div>'; }
  else{
    list.slice().reverse().forEach(item=>{
      h+='<div class="list-item" onclick="navigate(\'workorder-detail\',\''+item.id+'\')">';
      h+='<span class="list-badge '+woStatusBadge(item.status)+'">'+item.status+'</span>';
      h+='<div class="list-content"><div class="list-title">'+escapeHtml(item.title)+'</div>';
      h+='<div class="list-meta">'+item.type+' · '+formatDate(item.createdAt)+'</div></div>';
      h+='<div class="list-arrow">›</div></div>';
    });
  }
  h+='<div style="margin-top:16px;text-align:center;"><button class="poll-btn" onclick="navigate(\'submit-workorder\')">➕ 新建报修</button></div>';
  h+='</div>'; return h;
}

function renderSubmitWorkorder(){
  let h='<div class="card"><div class="card-title"><span class="icon">🔧</span>我要报修</div>';
  h+='<div class="form-group"><label>报修类型</label><select id="woType" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"><option>水电</option><option>门窗</option><option>电梯</option><option>保洁</option><option>其他</option></select></div>';
  h+='<div class="form-group"><label>标题</label><input type="text" id="woTitle" placeholder="简要描述问题，如：卫生间水龙头漏水" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;"></div>';
  h+='<div class="form-group"><label>详细描述</label><textarea id="woDesc" rows="4" placeholder="请详细描述故障情况、具体位置等" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;"></textarea></div>';
  h+='<div class="form-group"><label>故障图片（可选，最多3张）</label><div id="woImagesPreview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"></div>';
  h+='<input type="file" id="woImages" accept="image/*" multiple style="display:none" onchange="handleWOImages(this)">';
  h+='<button type="button" class="btn" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:13px;" onclick="document.getElementById(\'woImages\').click()">📎 选择图片</button></div>';
  h+='<div style="margin-top:20px;"><button class="poll-btn" onclick="doSubmitWorkorder()">提交报修</button>';
  h+='<button class="poll-btn" style="background:#888;margin-left:8px;" onclick="history.back()">取消</button></div></div>';
  return h;
}

async function handleWOImages(input) {
  var files = Array.from(input.files).slice(0, 3);
  var preview = document.getElementById('woImagesPreview');
  preview.innerHTML = '<div style="width:100%;text-align:center;padding:12px;color:var(--text-secondary);font-size:13px;" id="woCompressStatus">正在处理图片，请稍候...</div>';
  _woImages = [];
  var processed = 0;
  for (var i = 0; i < files.length; i++) {
    try {
      var f = files[i];
      var compressed = await compressImage(f, { maxWidth: 800, maxHeight: 800, quality: 0.4, maxSize: 50 * 1024 });
      _woImages.push(compressed);
      var url = URL.createObjectURL(compressed);
      var sizeHtml = '<div style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;backdrop-filter:blur(2px);">' + formatFileSize(compressed.size) + '</div>';
      var badgeHtml = compressed.size < f.size 
        ? '<div style="position:absolute;top:2px;right:2px;background:var(--primary);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">已压缩</div>' 
        : '';
      preview.innerHTML += '<div style="width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);position:relative;flex-shrink:0;"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">' + sizeHtml + badgeHtml + '</div>';
      processed++;
    } catch (e) {
      _woImages.push(files[i]);
      var url = URL.createObjectURL(files[i]);
      preview.innerHTML += '<div style="width:80px;height:80px;border-radius:6px;overflow:hidden;border:1px solid var(--border);position:relative;flex-shrink:0;"><img src="' + url + '" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy"><div style="position:absolute;bottom:2px;left:2px;background:rgba(200,0,0,0.7);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;">原图</div></div>';
      processed++;
    }
  }
  var statusEl = document.getElementById('woCompressStatus');
  if (statusEl) statusEl.style.display = 'none';
  if (processed === 0) preview.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">未选择图片</div>';
}

async function doSubmitWorkorder(){
  if(!residentAuth){ showLogin(); return; }
  const type=document.getElementById('woType').value;
  const title=document.getElementById('woTitle').value.trim();
  const desc=document.getElementById('woDesc').value.trim();
  if(!title){ alert('请填写标题'); return; }
  showPageLoading(true);
  try{
    let images=[];
    let uploadErrors=[];
    for(const f of _woImages){
      try{
        const r=await workerUpload(f);
        if(r && r.url) images.push(r.url);
        else uploadErrors.push(f.name || '图片' + (uploadErrors.length+1) + ': 返回数据异常');
      }catch(e){
        uploadErrors.push((f.name || '图片' + (uploadErrors.length+1)) + ': ' + e.message);
      }
    }
    if(uploadErrors.length > 0){
      const msg = '以下图片上传失败（服务器暂时不可用）：\n' + uploadErrors.join('\n') + '\n\n是否继续提交报修？\n- 点「确定」：提交报修（不含失败的图片）\n- 点「取消」：返回修改';
      if(!confirm(msg)){ showPageLoading(false); return; }
    }
    const list=await workerRead(getCurrentMonthPath('workorders'));
    const item={
      id:genWOId(), type, title, description:desc, images,
      residentRoom:residentAuth.roomNo, residentName:residentAuth.name,
      status:'待受理', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
      timeline:[{time:new Date().toISOString(), action:'提交工单', operator:residentAuth.name}],
      rating:null, comment:'', assignedTo:'', workerPhone:''
    };
    list.push(item);
    await workerWrite(getCurrentMonthPath('workorders'), list, '业主提交报修 '+title);
    _woImages=[];
    alert('✅ 提交成功！工单号：'+item.id);
    navigate('workorders');
  }catch(e){ alert('提交失败：'+e.message); }
  finally{ showPageLoading(false); }
}

function renderWorkorderDetail(id){
  const list=appData._workorders||[];
  const item=list.find(x=>x.id===id);
  if(!item){
    if(residentAuth && !appData._woLoading){
      appData._woLoading=true;
      loadMyWorkorders().then(function(loaded){
        appData._workorders=loaded;
        appData._woLoading=false;
        var r=getRoute();
        if(r.page==='workorder-detail' && r.params===id){
          document.getElementById('main').innerHTML='<div class="page-content">'+renderWorkorderDetail(id)+'</div>';
        }
      }).catch(function(e){
        appData._woLoading=false;
        var r=getRoute();
        if(r.page==='workorder-detail' && r.params===id){
          document.getElementById('main').innerHTML='<div class="page-content"><div class="empty">加载失败，请刷新重试</div></div>';
        }
      });
      return '<div class="loading">正在加载工单数据...</div>';
    }
    return '<div class="empty">工单不存在</div>';
  }
  let h='<div class="card"><div class="detail-header"><h1>'+escapeHtml(item.title)+'</h1>';
  h+='<div class="detail-meta"><span class="list-badge '+woStatusBadge(item.status)+'">'+item.status+'</span>';
  h+='<span>类型：'+item.type+'</span><span>工单号：'+item.id+'</span><span>提交：'+formatDate(item.createdAt)+'</span></div></div>';
  h+='<div class="detail-content"><p>'+escapeHtml(item.description||'暂无描述')+'</p></div>';
  h += renderPhotoGallery(item.images, '故障图片（业主上传）', '#e65100');
  var replyImages = item.replyImages || item.adminImages || [];
  if (replyImages.length > 0) {
    h += renderPhotoGallery(replyImages, '已上传回复图片', 'var(--primary)');
  }
  h+='<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);"><div style="font-weight:600;margin-bottom:12px;">📋 处理进度</div>';
  var timeline=item.timeline||[];
  if(!timeline.length){h+='<div style="font-size:13px;color:var(--text-secondary);padding:8px 0;">暂无处理记录</div>';}
  else{
    timeline.forEach(function(t,idx){
      var level=Math.min(idx,4);
      var indent=level*20;
      var isLast=idx===timeline.length-1;
      h+='<div style="position:relative;padding-left:'+(24+indent)+'px;margin-bottom:16px;">';
      if(!isLast) h+='<div style="position:absolute;left:'+(8+indent)+'px;top:10px;bottom:-20px;width:2px;background:#e0e0e0;"></div>';
      h+='<div style="position:absolute;left:'+(2+indent)+'px;top:6px;width:12px;height:12px;background:var(--primary);border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px var(--primary);z-index:1;"></div>';
      h+='<div style="background:#f8f9fa;border-radius:8px;padding:12px 14px;border:1px solid #eef0f2;">';
      h+='<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:4px;">'+escapeHtml(t.action)+'</div>';
      h+='<div style="font-size:12px;color:var(--text-secondary);display:flex;gap:8px;flex-wrap:wrap;">';
      h+='<span>👤 '+escapeHtml(t.operator)+'</span><span>🕐 '+formatDateTime(t.time)+'</span>';
      h+='</div></div></div>';
    });
  }
  h+='</div>';
  if(item.status==='待评价'){
    h+='<div style="margin-top:20px;padding:16px;background:#f8f9fa;border-radius:8px;">';
    h+='<div style="font-weight:600;margin-bottom:12px;">⭐ 请对本次服务进行评价</div>';
    h+='<div style="display:flex;gap:4px;margin-bottom:12px;" id="woRating"><span style="font-size:28px;cursor:pointer;" onclick="setWORating(1)">☆</span><span style="font-size:28px;cursor:pointer;" onclick="setWORating(2)">☆</span><span style="font-size:28px;cursor:pointer;" onclick="setWORating(3)">☆</span><span style="font-size:28px;cursor:pointer;" onclick="setWORating(4)">☆</span><span style="font-size:28px;cursor:pointer;" onclick="setWORating(5)">☆</span></div>';
    h+='<textarea id="woRatingComment" rows="2" placeholder="评价留言（可选）" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:14px;"></textarea>';
    h+='<button class="poll-btn" style="margin-top:12px;" onclick="doWORating(\''+item.id+'\')">提交评价</button></div>';
  }else if(item.rating != null && item.rating > 0){
    h+='<div style="margin-top:20px;padding:16px;background:#e8f5e9;border-radius:8px;">';
    h+='<div style="font-weight:600;margin-bottom:8px;">⭐ 业主评价</div>';
    h+='<div style="font-size:20px;letter-spacing:2px;margin-bottom:8px;">'+'⭐'.repeat(item.rating)+'</div>';
    if(item.comment){
      h+='<div style="padding:12px;background:#fff;border-radius:6px;font-size:14px;color:var(--text);border-left:3px solid var(--primary);line-height:1.6;">'+escapeHtml(item.comment)+'</div>';
    }else{
      h+='<div style="font-size:13px;color:var(--text-secondary);">未填写文字评价</div>';
    }
    h+='</div>';
  }
  h+='<div style="margin-top:20px;"><button class="poll-btn" onclick="history.back()">← 返回</button></div></div>';
  return h;
}

function setWORating(n){
  _woRatingValue=n;
  const el=document.getElementById('woRating');
  if(el){ const stars=el.querySelectorAll('span'); stars.forEach((s,i)=>s.textContent=i<n?'⭐':'☆'); }
}

async function doWORating(id){
  if(!_woRatingValue){ alert('请选择星级'); return; }
  const comment=document.getElementById('woRatingComment').value.trim();
  showPageLoading(true);
  try{
    const path=getCurrentMonthPath('workorders');
    const list=await workerRead(path);
    const item=list.find(x=>x.id===id);
    if(item){ item.rating=_woRatingValue; item.comment=comment; item.status='已完成'; item.updatedAt=new Date().toISOString(); item.timeline.push({time:new Date().toISOString(),action:'业主评价',operator:residentAuth.name}); }
    await workerWrite(path, list, '业主评价工单 '+id);
    alert('评价成功'); navigate('workorder-detail', id);
  }catch(e){ alert('评价失败：'+e.message); }
  finally{ showPageLoading(false); }
}
