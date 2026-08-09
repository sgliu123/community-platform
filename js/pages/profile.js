/* js/pages/profile.js - 个人中心 */

function renderProfile() {
  if (!residentAuth) return '<div class="card" style="text-align:center;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">🔒</div><div style="font-size:16px;margin-bottom:20px;">您尚未登录</div><button class="poll-btn" onclick="showLogin()">业主登录</button></div>';
  let h = '<div class="card"><div class="card-title"><span class="icon">👤</span>我的信息</div>';
  h += '<div style="text-align:center;padding:20px 0;"><div style="width:80px;height:80px;background:var(--primary);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px;">👤</div>';
  h += '<div style="font-size:18px;font-weight:600;">' + residentAuth.name + '</div>';
  h += '<div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">房号：' + residentAuth.roomNo + '</div>';
  h += '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">登录时间：' + formatDate(residentAuth.loginTime) + '</div></div>';
  h += '<div style="border-top:1px solid var(--border);padding-top:16px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;"><button class="poll-btn" onclick="navigate(&#39;workorders&#39;)" style="background:var(--primary);font-size:13px;">🔧 我的报修</button><button class="poll-btn" onclick="navigate(&#39;complaints&#39;)" style="background:var(--primary);font-size:13px;">📝 我的反馈</button></div><button class="poll-btn" onclick="doLogout()" style="background:#c62828;">退出登录</button></div></div>';
  h += '<div id="profileWOArea" style="margin-top:16px;"></div>';
  h += '<div id="profileCPArea" style="margin-top:16px;"></div>';
  setTimeout(function(){
    loadMyWorkorders().then(function(list){
      var el=document.getElementById('profileWOArea');
      if(el) el.innerHTML=renderProfileMiniList(list.slice().reverse().slice(0,3),'workorders','🔧 最近报修','暂无报修记录','navigate(\'workorders\')');
    }).catch(function(e){
      var el=document.getElementById('profileWOArea');
      if(el) el.innerHTML=renderProfileMiniList([],'workorders','🔧 最近报修','暂无报修记录','navigate(\'workorders\')');
    });
    loadMyComplaints().then(function(list){
      var el=document.getElementById('profileCPArea');
      if(el) el.innerHTML=renderProfileMiniList(list.slice().reverse().slice(0,3),'complaints','📝 最近反馈','暂无反馈记录','navigate(\'complaints\')');
    }).catch(function(e){
      var el=document.getElementById('profileCPArea');
      if(el) el.innerHTML=renderProfileMiniList([],'complaints','📝 最近反馈','暂无反馈记录','navigate(\'complaints\')');
    });
  },50);
  return h;
}

function renderProfileMiniList(list,module,title,emptyTip,navAction){
  var h='<div class="card"><div class="card-title"><span class="icon">'+title.split(' ')[0]+'</span>'+title+'<a href="javascript:void(0)" onclick="'+navAction+'" style="margin-left:auto;font-size:13px;">查看全部 →</a></div>';
  if(!list||!list.length){h+='<div class="empty">'+emptyTip+'</div>';}
  else{
    list.forEach(function(item){
      var badgeCls=module==='workorders'?woStatusBadge(item.status):cpStatusBadge(item.status);
      var badgeText=item.status;
      var sub=module==='workorders'?(item.type+' · '+formatDate(item.createdAt)):(item.type+' · '+formatDate(item.createdAt));
      var itemTitle=module==='workorders'?escapeHtml(item.title):(item.isAnonymous?'匿名'+item.type:escapeHtml(item.title));
      var detailPage=module==='workorders'?'workorder-detail':'complaint-detail';
      h+='<div class="list-item" onclick="navigate(\''+detailPage+'\',\''+item.id+'\')"><span class="list-badge '+badgeCls+'">'+badgeText+'</span>';
      h+='<div class="list-content"><div class="list-title">'+itemTitle+'</div><div class="list-meta">'+sub+'</div></div>';
      h+='<div class="list-arrow">›</div></div>';
    });
  }
  h+='</div>';return h;
}