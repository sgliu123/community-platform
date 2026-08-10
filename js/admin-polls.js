/* js/admin-polls.js - 投票系统：问卷、计票、锚定、清册、异议、档案 */

/* ========== 投票面积数据辅助函数 ========== */


function getPollDisplayStats(item) {
  const res = item.results || {};

  // 统一 totalResidents/totalArea 计算逻辑（与 calculatePollResults 完全一致）
  let totalResidents, totalArea;
  if (item.rollStats && item.rollStats.totalCount > 0) {
    totalResidents = item.rollStats.totalCount;
    totalArea = item.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (item.progress && item.progress.target !== undefined && item.progress.target > 0)
      ? item.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 如果有已固化的计票结果（calculatedAt 存在），直接使用权威数据
  if (res.calculatedAt && res.totalArea > 0) {
    return {
      totalResidents: res.totalResidents || totalResidents,
      totalArea: res.totalArea,
      participatingResidents: res.participatingResidents || 0,
      participatingArea: res.participatingArea || 0,
      agreeCount: res.agreeCount || 0,
      agreeArea: res.agreeArea || 0,
      residentParticipationRate: res.residentParticipationRate || 0,
      areaParticipationRate: res.areaParticipationRate || 0,
      agreeResidentRate: res.agreeResidentRate || 0,
      agreeAreaRate: res.agreeAreaRate || 0,
      isPassed: res.isPassed,
      summary: res.summary || '',
      calculatedAt: res.calculatedAt,
      fromCache: true
    };
  }

  // 无固化数据时，用原始计数 + 统一后的 totalArea 重新计算百分比
  let pResidents = res.participatingResidents || 0;
  let pArea = res.participatingArea || 0;
  let aCount = res.agreeCount || 0;
  let aArea = res.agreeArea || 0;

  if (pArea === 0 && pResidents > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    pArea = pResidents * avgArea;
  }
  if (aArea === 0 && aCount > 0 && totalArea > 0 && totalResidents > 0) {
    const avgArea = totalArea / totalResidents;
    aArea = aCount * avgArea;
  }

  return {
    totalResidents: totalResidents,
    totalArea: totalArea,
    participatingResidents: pResidents,
    participatingArea: pArea,
    agreeCount: aCount,
    agreeArea: aArea,
    residentParticipationRate: totalResidents > 0 ? (pResidents / totalResidents * 100) : 0,
    areaParticipationRate: totalArea > 0 ? (pArea / totalArea * 100) : 0,
    agreeResidentRate: pResidents > 0 ? (aCount / pResidents * 100) : 0,
    agreeAreaRate: pArea > 0 ? (aArea / pArea * 100) : 0,
    isPassed: res.isPassed,
    summary: res.summary || '',
    calculatedAt: res.calculatedAt,
    fromCache: false
  };
}



function renderPollsAdmin() {
  const list = appData.polls || [];
  return `<div class="card"><div class="card-header"><h3>🗳️ 投票管理</h3><button class="btn btn-primary" onclick="openEditModal('polls',null)">➕ 新增投票</button></div>` +
    '<table class="data-table"><thead><tr><th>案卷号</th><th>标题</th><th>类型</th><th>模式</th><th>状态</th><th>时间合规</th><th>进度</th><th>参与率</th><th>同意率</th><th>结果</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => {
      const disp = getPollDisplayStats(item);
      const res = item.results || {};
      const modeLabel = item.mode === 'local' ? '<span class="tag tag-active">本地问卷</span>' : '<span class="tag tag-test">腾讯问卷</span>';
      const catLabel = item.category === 'major' ? '<span class="tag" style="background:#ffebee;color:#c62828;">重大</span>' : '<span class="tag" style="background:#e8f5e9;color:#2e7d32;">一般</span>';
      const statusTag = '<span class="tag ' + (item.status==="进行中"?"tag-active":"tag-disabled") + '">' + (item.status||'') + '</span>';

      // 参与率（自动从业主库补全面积数据）
      const rPart = disp.residentParticipationRate;
      const aPart = disp.areaParticipationRate;
      const partHtml = '<div style="font-size:12px;">人数 ' + rPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rPart) + '%;"></div></div>面积 ' + aPart.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aPart) + '%;background:#1976D2;"></div></div></div>';

      // 同意率（自动从业主库补全面积数据）
      const rAgree = disp.agreeResidentRate;
      const aAgree = disp.agreeAreaRate;
      const agreeHtml = '<div style="font-size:12px;">人数 ' + rAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, rAgree) + '%;"></div></div>面积 ' + aAgree.toFixed(1) + '%<div class="progress-bar" style="height:6px;margin:2px 0;"><div class="progress-bar-fill" style="width:' + Math.min(100, aAgree) + '%;background:#1976D2;"></div></div></div>';

      // 通过标签（只有已结束才显示最终判定）
      let passHtml = '<span style="color:#999;font-size:12px;">—</span>';
      if (item.status === '已结束') {
        passHtml = res.isPassed === true ? '<span class="tag tag-active">✅ 通过</span>' : (res.isPassed === false ? '<span class="tag tag-test">❌ 未通过</span>' : '<span style="color:#999;font-size:12px;">—</span>');
      } else if (item.status === '进行中') {
        passHtml = '<span class="tag" style="background:#fff3e0;color:#e65100;">🗳️ 进行中</span>';
      }
      const anchorHtml = item.status === '已结束' ? (item.anchorRecords && item.anchorRecords.some(r => !r.error) ? '<span class="tag tag-active" style="cursor:pointer;" onclick="event.stopPropagation();showAnchorDetails(\'' + item.id + '\')">🔗 已锚定</span>' : '<span class="tag tag-test" style="cursor:pointer;" onclick="event.stopPropagation();anchorVoteData(\'' + item.id + '\')">⚠️ 未锚定</span>') : '';
      const pendingObj = (item.objections || []).filter(o => !o.status || o.status === '待处理').length;
      const objBadge = pendingObj > 0 ? '<span class="tag" style="background:#ffebee;color:#c62828;cursor:pointer;" onclick="event.stopPropagation();navigateTo(\'objections\')">⚠️ ' + pendingObj + ' 异议</span>' : '';

      const progressHtml = '<div style="font-size:12px;">' + (item.progress && item.progress.current !== undefined ? item.progress.current : 0) + ' / ' + (item.progress && item.progress.target !== undefined ? item.progress.target : 300) + ' 户</div>';
      let actions = `<button onclick="openEditModal('polls','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('polls','${item.id}')">删除</button>`;
      if(item.mode === 'local') {
        actions += `<button onclick="viewPollData('${item.id}')" style="margin-left:4px;">📊 数据</button>`;
      }
      actions += `<button onclick="recalculatePoll('${item.id}')" style="margin-left:4px;">🔄 计票</button>`;
      return `<tr><td>${item.caseNo||''}</td><td>${item.title||''}</td><td>${catLabel}</td><td>${modeLabel}</td><td>${statusTag}</td><td>${(function(){let tags='';if(item.announcement&&item.announcement.start&&item.startDate){const as=new Date(item.announcement.start);const vs=new Date(item.startDate);if((vs-as)>=15*86400000)tags+='<span class="tag tag-active">✅公告期合规</span> ';else tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}else{tags+='<span class="tag tag-test">❌公告期不足15天</span> ';}if(item.consultation&&item.consultation.start&&item.consultation.end){const cs=new Date(item.consultation.start);const ce=new Date(item.consultation.end);if((ce-cs)>=6*86400000)tags+='<span class="tag tag-active">✅征求意见合规</span>';else tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}else{tags+='<span class="tag tag-test">❌征求意见不足7天</span>';}return tags;})()}</td><td>${progressHtml}</td><td>${partHtml}</td><td>${agreeHtml}</td><td>${passHtml} ${anchorHtml} ${objBadge}</td><td class="actions">${actions}</td></tr>`;
    }).join('') +
    '</tbody></table></div>';
}



function renderPollAuditTimeline(pollId) {
  const container = document.getElementById('pollAuditTimeline');
  if (!container || !pollId) { if(container) container.innerHTML = ''; return; }
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;

  const logs = (appData['audit-log'] || []).filter(l => l.targetId === pollId || (l.details && l.details.includes(pollId)) || (l.target === 'polls' && l.details && l.details.includes(poll.title||'')));
  const objections = poll.objections || [];
  const records = poll.anchorRecords || [];

  let html = '<div style="margin-bottom:24px;padding:16px;background:#fafafa;border-radius:8px;border:1px solid var(--border);">';
  html += '<div style="font-weight:600;margin-bottom:12px;font-size:15px;">⏱️ 投票全流程审计：' + escapeHtml(poll.title||'') + '</div>';
  html += '<div style="border-left:2px solid var(--border);padding-left:16px;">';

  const nodes = [];
  // 发起
  if (poll.createdAt) nodes.push({ time: poll.createdAt, label: '投票发起', detail: '由 ' + (poll.createdBy||'管理员') + ' 创建', type: 'init' });
  // 清册公示
  if (poll.rollPublish && poll.rollPublish.start) nodes.push({ time: poll.rollPublish.start, label: '清册公示开始', detail: '公示期：' + poll.rollPublish.start + ' 至 ' + (poll.rollPublish.end||''), type: 'roll' });
  // 通知送达
  if (poll.meetingFiles && poll.meetingFiles.length) nodes.push({ time: poll.createdAt, label: '会议通知上传', detail: '上传 ' + poll.meetingFiles.length + ' 份通知文件', type: 'notice' });
  // 投票进行中
  if (poll.startDate) nodes.push({ time: poll.startDate + 'T00:00:00Z', label: '投票开始', detail: '投票通道开启', type: 'vote' });
  // 计票
  if (poll.results && poll.results.calculatedAt) nodes.push({ time: poll.results.calculatedAt, label: '自动计票', detail: '参与 ' + (poll.results.participatingResidents||0) + ' 户，' + (poll.results.isPassed ? '通过' : '未通过'), type: 'count' });
  // 结果公示
  if (poll.results && poll.results.isPublished) nodes.push({ time: poll.results.calculatedAt, label: '结果公示', detail: poll.results.summary||'', type: 'publish' });
  // 异议
  objections.forEach(o => {
    nodes.push({ time: o.time || o.createdAt, label: '异议提出', detail: (o.resident||'—') + '：' + (o.content||'').substring(0,40), type: 'objection' });
    if (o.result) nodes.push({ time: o.handledAt || o.time, label: '异议处理', detail: '处理结果：' + o.result, type: 'objection-resolved' });
  });
  // 锚定
  records.forEach(r => {
    if (!r.error) nodes.push({ time: r.time, label: '证据锚定', detail: r.name + '：' + (r.txHash ? r.txHash.substring(0,16)+'...' : '已提交'), type: 'anchor' });
  });
  // 归档
  if (poll.status === '已结束') nodes.push({ time: poll.endDate + 'T23:59:59Z', label: '投票结束/归档', detail: '投票通道关闭，档案生成', type: 'archive' });

  // 按时间排序
  nodes.sort((a, b) => new Date(a.time) - new Date(b.time));

  nodes.forEach((n, i) => {
    const colorMap = { init: '#2E8B57', roll: '#1976D2', notice: '#f9a825', vote: '#2E8B57', count: '#6A1B9A', publish: '#2E8B57', objection: '#c62828', 'objection-resolved': '#2e7d32', anchor: '#E65100', archive: '#546e7a' };
    const color = colorMap[n.type] || '#666';
    html += '<div style="position:relative;margin-bottom:14px;padding-bottom:14px;' + (i < nodes.length - 1 ? 'border-bottom:1px dashed var(--border);' : '') + '">';
    html += '<div style="position:absolute;left:-21px;top:2px;width:10px;height:10px;background:' + color + ';border-radius:50%;"></div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);">' + formatDateTime(n.time) + '</div>';
    html += '<div style="font-weight:600;font-size:13px;margin-top:2px;">' + n.label + '</div>';
    html += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escapeHtml(n.detail) + '</div>';
    html += '</div>';
  });

  html += '</div></div>';
  container.innerHTML = html;
}



/* ========== 档案生成模块 ========== */



function generatePollArchive(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) { showToast('投票不存在', 'error'); return; }

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try {
    const saved = localStorage.getItem('adminData_polls-responses-' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'));
    if (saved) responses = JSON.parse(saved);
  } catch(e) {}
  const pollVotes = responses.filter(r => r.pollId === pollId);

  const disp = getPollDisplayStats(poll);
  const allResidents = (appData.residents || []).filter(r => r.status === 'active');
  const totalResidents = disp.totalResidents;
  const totalArea = disp.totalArea;
  const res = poll.results || {};
  const records = poll.anchorRecords || [];

  const win = window.open('', '_blank');
  if (!win) { showToast('请允许弹窗以生成档案', 'error'); return; }

  const now = new Date().toLocaleString('zh-CN');
  const title = poll.title || '';
  const caseNo = poll.caseNo || pollId;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>投票档案 - ${caseNo}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 20px; }
h1 { font-size: 20px; text-align: center; margin-bottom: 8px; border-bottom: 2px solid #2E8B57; padding-bottom: 10px; }
h2 { font-size: 14px; color: #2E8B57; margin-top: 20px; margin-bottom: 8px; border-left: 4px solid #2E8B57; padding-left: 8px; }
h3 { font-size: 12px; color: #666; margin-top: 12px; margin-bottom: 6px; }
.cover { text-align: center; padding: 60px 20px; border: 1px solid #e0e0e0; margin-bottom: 30px; }
.cover .case-no { font-size: 16px; color: #666; margin-bottom: 12px; }
.cover .title { font-size: 22px; font-weight: 700; margin-bottom: 20px; }
.cover .meta { font-size: 13px; color: #666; line-height: 2; }
table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
th { background: #f5f5f5; font-weight: 600; }
.stat-box { display: inline-block; width: 48%; margin: 1%; padding: 12px; background: #f8f9fa; border-radius: 6px; box-sizing: border-box; }
.stat-box .num { font-size: 18px; font-weight: 700; color: #2E8B57; }
.stat-box .label { font-size: 11px; color: #666; }
.small { font-size: 10px; color: #999; }
.page-break { page-break-before: always; }
.signature { margin-top: 40px; display: flex; justify-content: space-between; }
.signature-box { width: 45%; border-top: 1px solid #333; padding-top: 8px; text-align: center; }
@media print {
  .no-print { display: none; }
  body { padding: 0; }
}
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f0f7f4;margin-bottom:20px;border-radius:6px;">
  <button onclick="window.print()" style="padding:10px 24px;background:#2E8B57;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">🖨️ 打印为 PDF</button>
  <span style="color:#666;margin-left:12px;">请使用浏览器的"另存为 PDF"功能保存档案</span>
</div>

<div class="cover">
  <div class="case-no">案卷编号：${caseNo}</div>
  <div class="title">${title}</div>
  <div class="meta">
    <div>生成时间：${now}</div>
    <div>档案类型：业主大会投票档案</div>
    <div>生成系统：春天阳光小区数字化平台</div>
  </div>
</div>

<h2>一、投票基本信息</h2>
<table>
  <tr><th style="width:25%">项目</th><th>内容</th></tr>
  <tr><td>案卷编号</td><td>${caseNo}</td></tr>
  <tr><td>投票标题</td><td>${title}</td></tr>
  <tr><td>事项类型</td><td>${poll.category === 'major' ? '重大事项' : '一般事项'}</td></tr>
  <tr><td>法律依据</td><td>${poll.legalBasis || '—'}</td></tr>
  <tr><td>投票期间</td><td>${poll.startDate || '—'} 至 ${poll.endDate || '—'}</td></tr>
  <tr><td>目标户数</td><td>${totalResidents} 户</td></tr>
  <tr><td>总面积</td><td>${totalArea.toFixed(2)} ㎡</td></tr>
  <tr><td>议事规则</td><td>${(poll.ruleFiles || []).length > 0 ? '已上传 ' + poll.ruleFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>业主清册</td><td>${(poll.rollFiles || []).length > 0 ? '已上传 ' + poll.rollFiles.length + ' 份' : '—'}</td></tr>
  <tr><td>会议通知</td><td>${(poll.meetingFiles || []).length > 0 ? '已上传 ' + poll.meetingFiles.length + ' 份' : '—'}</td></tr>
</table>

<h2>二、业主清册摘要</h2>
<div style="display:flex;flex-wrap:wrap;">
  <div class="stat-box"><div class="num">${totalResidents}</div><div class="label">目标户数</div></div>
  <div class="stat-box"><div class="num">${totalArea.toFixed(2)} ㎡</div><div class="label">建筑总面积</div></div>
  <div class="stat-box"><div class="num">${(res.participatingResidents || 0)}</div><div class="label">参与投票户数</div></div>
  <div class="stat-box"><div class="num">${(res.participatingArea || 0).toFixed(2)} ㎡</div><div class="label">参与投票面积</div></div>
</div>

<h2>三、投票结果统计</h2>
<table>
  <tr><th>指标</th><th>数值</th><th>比例</th><th>门槛</th><th>是否达标</th></tr>
  <tr>
    <td>参与户数 / 目标户数</td>
    <td>${disp.participatingResidents} / ${totalResidents}</td>
    <td>${disp.residentParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.residentPct) || 66.67}%</td>
    <td>${disp.residentParticipationRate >= ((poll.threshold && poll.threshold.residentPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>参与面积 / 总面积</td>
    <td>${disp.participatingArea.toFixed(2)} / ${totalArea.toFixed(2)} ㎡</td>
    <td>${disp.areaParticipationRate.toFixed(2)}%</td>
    <td>${(poll.threshold && poll.threshold.areaPct) || 66.67}%</td>
    <td>${disp.areaParticipationRate >= ((poll.threshold && poll.threshold.areaPct) || 66.67) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意户数 / 参与户数</td>
    <td>${disp.agreeCount} / ${disp.participatingResidents}</td>
    <td>${disp.agreeResidentRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeResidentRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
  <tr>
    <td>同意面积 / 参与面积</td>
    <td>${disp.agreeArea.toFixed(2)} / ${disp.participatingArea.toFixed(2)} ㎡</td>
    <td>${disp.agreeAreaRate.toFixed(2)}%</td>
    <td>${poll.category === 'major' ? '75%' : '50%'}</td>
    <td>${disp.agreeAreaRate >= (poll.category === 'major' ? 75 : 50) ? '✅ 达标' : '❌ 未达标'}</td>
  </tr>
</table>
<div style="margin-top:10px;padding:10px;background:${disp.isPassed ? '#e8f5e9' : '#ffebee'};border-radius:6px;text-align:center;font-weight:600;font-size:14px;">
  ${disp.isPassed ? '✅ 表决通过' : '❌ 表决未通过'}
</div>

<h2>四、投票明细（脱敏）</h2>
<table>
  <tr><th>序号</th><th>房号</th><th>面积(㎡)</th><th>第一题答案</th><th>投票时间</th><th>哈希片段</th></tr>`;

  pollVotes.forEach((v, i) => {
    const firstAns = v.choice && v.choice.length > 0 ? v.choice[0].value : '—';
    const valStr = Array.isArray(firstAns) ? firstAns.join(',') : String(firstAns);
    const hashFrag = v.nonce ? v.nonce.substring(0, 8) + '...' : '—';
    html += `<tr><td>${i+1}</td><td>${v.roomNo || '—'}</td><td>${v.area || 0}</td><td>${valStr}</td><td>${v.voteTime ? new Date(v.voteTime).toLocaleString('zh-CN') : '—'}</td><td class="small">${hashFrag}</td></tr>`;
  });

  if (pollVotes.length === 0) {
    html += `<tr><td colspan="6" style="text-align:center;color:#999;">暂无投票记录</td></tr>`;
  }

  html += `</table>

<div class="page-break"></div>

<h2>五、异议及处理记录</h2>
<table>
  <tr><th style="width:15%">时间</th><th style="width:15%">提出人</th><th>异议内容</th><th style="width:15%">处理结果</th></tr>`;

  const objections = poll.objections || [];
  if (objections.length > 0) {
    objections.forEach(o => {
      html += `<tr><td>${o.time ? new Date(o.time).toLocaleString('zh-CN') : '—'}</td><td>${o.resident || '—'}</td><td>${o.content || '—'}</td><td>${o.result || '待处理'}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="4" style="text-align:center;color:#999;">暂无异议记录</td></tr>`;
  }

  html += `</table>

<h2>六、证据锚定记录</h2>
<table>
  <tr><th>锚定点</th><th>类型</th><th>时间</th><th>链接/Hash</th><th>状态</th></tr>`;

  if (records.length > 0) {
    records.forEach(r => {
      const status = r.error ? '❌ 失败' : '✅ 成功';
      const link = r.url ? `<a href="${r.url}" target="_blank">${r.url}</a>` : (r.txHash || '—');
      html += `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.time ? new Date(r.time).toLocaleString('zh-CN') : '—'}</td><td class="small">${link}</td><td>${status}</td></tr>`;
    });
  } else {
    html += `<tr><td colspan="5" style="text-align:center;color:#999;">暂无锚定记录</td></tr>`;
  }

  html += `</table>

<h2>七、Merkle Root</h2>
<div style="padding:12px;background:#f8f9fa;border-radius:6px;font-family:monospace;font-size:12px;word-break:break-all;">
  ${poll.merkleRoot || '—'}
</div>
<div class="small" style="margin-top:4px;">此 Merkle Root 已通过 GitHub Commit、微信群机器人、邮件三端锚定，确保投票数据不可篡改。</div>

<div class="page-break"></div>

<h2>八、签章页</h2>
<div style="margin-top:20px;">
  <p>本档案由春天阳光小区数字化平台自动生成，包含完整的投票过程记录、计票结果及证据锚定信息。</p>
  <p>档案生成时间：${now}</p>
  <p>系统版本：Community Platform v2.0</p>
</div>
<div class="signature">
  <div class="signature-box">业委会签章</div>
  <div class="signature-box">物业签章</div>
</div>
<div class="signature" style="margin-top:30px;">
  <div class="signature-box">社区签章</div>
  <div class="signature-box">街道备案签章</div>
</div>

</body>
</html>`;

  win.document.write(html);
  win.document.close();
  showToast('档案已生成，请在弹窗中打印为 PDF', 'success');
}



function generateVoterReceipt(voteRecord) {
  if (!voteRecord) return;
  const poll = (appData.polls || []).find(p => p.id === voteRecord.pollId);
  const title = poll ? (poll.title || '') : '投票回执';
  const caseNo = poll ? (poll.caseNo || '') : '';
  const roomNo = voteRecord.roomNo || '—';
  const voteTime = voteRecord.voteTime ? new Date(voteRecord.voteTime).toLocaleString('zh-CN') : '—';
  const nonce = voteRecord.nonce || '—';
  const hashFrag = voteRecord.ipHash ? voteRecord.ipHash.substring(0, 16) + '...' : '—';

  const win = window.open('', '_blank', 'width=420,height=600');
  if (!win) { showToast('请允许弹窗以生成回执', 'error'); return; }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>投票回执</title>
<style>
body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; background: #f0f2f5; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.receipt { background: #fff; width: 360px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 28px; position: relative; overflow: hidden; }
.receipt::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #2E8B57, #3da76b); }
.receipt-header { text-align: center; margin-bottom: 20px; }
.receipt-header .logo { font-size: 32px; margin-bottom: 8px; }
.receipt-header .title { font-size: 16px; font-weight: 700; color: #333; }
.receipt-header .subtitle { font-size: 11px; color: #999; margin-top: 4px; }
.receipt-body { border-top: 1px dashed #e0e0e0; border-bottom: 1px dashed #e0e0e0; padding: 16px 0; }
.receipt-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
.receipt-row .label { color: #666; }
.receipt-row .value { color: #333; font-weight: 500; }
.receipt-row .value.room { font-size: 18px; font-weight: 700; color: #2E8B57; }
.hash-box { background: #f8f9fa; border-radius: 6px; padding: 10px; margin-top: 12px; font-family: monospace; font-size: 11px; color: #666; word-break: break-all; line-height: 1.5; }
.receipt-footer { text-align: center; margin-top: 20px; }
.receipt-footer .stamp { display: inline-block; padding: 6px 16px; border: 2px solid #2E8B57; color: #2E8B57; border-radius: 4px; font-size: 13px; font-weight: 600; transform: rotate(-3deg); opacity: 0.8; }
.receipt-footer .tip { font-size: 11px; color: #999; margin-top: 12px; }
.btn-print { display: block; width: 100%; padding: 10px; margin-top: 16px; background: #2E8B57; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
.qr-placeholder { width: 80px; height: 80px; background: #f5f5f5; border-radius: 6px; margin: 12px auto 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
@media print {
  body { background: #fff; }
  .btn-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo">🗳️</div>
    <div class="title">${title}</div>
    <div class="subtitle">${caseNo}</div>
  </div>
  <div class="receipt-body">
    <div class="receipt-row"><span class="label">房号</span><span class="value room">${roomNo}</span></div>
    <div class="receipt-row"><span class="label">投票时间</span><span class="value">${voteTime}</span></div>
    <div class="receipt-row"><span class="label">随机Nonce</span><span class="value">${nonce.substring(0, 8)}...</span></div>
    <div class="receipt-row"><span class="label">IP哈希</span><span class="value">${hashFrag}</span></div>
    <div class="hash-box">
      <div style="margin-bottom:4px;font-weight:600;color:#333;">Merkle Path 片段</div>
      <div>${voteRecord.prevHash ? voteRecord.prevHash.substring(0, 24) + '...' : '首票（无前置）'}</div>
    </div>
  </div>
  <div class="receipt-footer">
    <div class="stamp">已上链存证</div>
    <div class="qr-placeholder">Merkle<br>Root</div>
    <div class="tip">请截图保存此回执<br>作为您的投票凭证</div>
  </div>
  <button class="btn-print" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
</div>
</body>
</html>`;

  win.document.write(html);
  win.document.close();
}



async function recalculatePoll(pollId) {
  showLoading(true);
  try {
    const result = await calculatePollResults(pollId);
    if (result) {
      // 保存 poll 数据
      await saveDataFile('polls', appData.polls, '重新计票 ' + pollId, 'update');
      // 追加审计日志
      appendAuditLog('recount', 'polls', pollId, '管理员手动重新计票，结果：' + (result.isPassed ? '通过' : '未通过'));
      showToast('计票完成：' + (result.isPassed ? '通过' : '未通过'), result.isPassed ? 'success' : 'info');
      navigateTo('polls');
    } else {
      showToast('计票失败：未找到投票数据', 'error');
    }
  } catch(e) {
    showToast('计票失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}



async function calculatePollResults(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return null;

  // 读取投票记录
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  let responses = [];
  try { responses = await workerRead(path); } catch(e) { responses = []; }
  if (!Array.isArray(responses)) responses = [];

  const pollVotes = responses.filter(r => r.pollId === pollId);

  // ========== 先计算 totalResidents / totalArea（与 getPollDisplayStats 完全一致）==========
  let totalResidents, totalArea;
  if (poll.rollStats && poll.rollStats.totalCount > 0) {
    totalResidents = poll.rollStats.totalCount;
    totalArea = poll.rollStats.totalArea;
  } else {
    const allResidents = (appData.residents || []).filter(r => r.status === 'active');
    totalResidents = (poll.progress && poll.progress.target !== undefined && poll.progress.target > 0)
      ? poll.progress.target
      : allResidents.length;
    totalArea = allResidents.reduce((sum, r) => sum + (parseFloat(r.area) || 0), 0);
  }

  // 建立房号→面积映射，用于投票记录中缺失面积时自动补全
  const residentAreaMap = {};
  (appData.residents || []).forEach(r => {
    if (r.roomNo) residentAreaMap[r.roomNo] = parseFloat(r.area) || 0;
  });

  // 去重统计（同一业主只算一次，兼容 residentId / roomNo / name+phoneSuffix）
  const seen = new Set();
  let participatingResidents = 0;
  let participatingArea = 0;
  let agreeCount = 0;
  let agreeArea = 0;

  pollVotes.forEach(v => {
    let dedupKey = v.residentId;
    if (!dedupKey && v.roomNo) dedupKey = 'room:' + v.roomNo;
    if (!dedupKey && v.residentRoom) dedupKey = 'room:' + v.residentRoom;
    if (!dedupKey && v.name) dedupKey = 'name:' + v.name;
    if (!dedupKey) dedupKey = 'idx:' + (v._idx || Math.random());
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);

    let area = parseFloat(v.area) || 0;
    if (!area && v.roomNo) area = residentAreaMap[v.roomNo] || 0;
    if (!area && v.residentRoom) area = residentAreaMap[v.residentRoom] || 0;
    if (!area && totalResidents > 0 && totalArea > 0) {
      area = totalArea / totalResidents;
    }

    participatingResidents++;
    participatingArea += area;

    let val = null;
    if (v.choice && v.choice.length > 0) {
      val = v.choice[0].value;
    } else if (v.answers && v.answers.length > 0 && poll.questions && poll.questions.length > 0) {
      const firstQ = poll.questions[0];
      const firstAns = v.answers.find(a => a.questionId === firstQ.id);
      if (firstAns) val = firstAns.value;
    }
    if (val) {
      const valStr = Array.isArray(val) ? val.join(',') : String(val);
      // 匹配"同意"但排除"不同意"等否定形式（允许"不"与"同意"间有空格）
      var isAgree = /同意/.test(valStr) && !/不\s*同意/.test(valStr);
      if (isAgree) {
        agreeCount++;
        agreeArea += area;
      }
    }
  });

  const residentParticipationRate = totalResidents > 0 ? (participatingResidents / totalResidents * 100) : 0;
  const areaParticipationRate = totalArea > 0 ? (participatingArea / totalArea * 100) : 0;
  const agreeResidentRate = participatingResidents > 0 ? (agreeCount / participatingResidents * 100) : 0;
  const agreeAreaRate = participatingArea > 0 ? (agreeArea / participatingArea * 100) : 0;

  const th = poll.threshold || { residentPct: 66.67, areaPct: 66.67 };
  const isMajor = poll.category === 'major';
  const agreeThreshold = isMajor ? 75 : 50;

  const passResidentPart = residentParticipationRate >= (th.residentPct || 66.67);
  const passAreaPart = areaParticipationRate >= (th.areaPct || 66.67);
  const passAgreeResident = agreeResidentRate >= agreeThreshold;
  const passAgreeArea = agreeAreaRate >= agreeThreshold;
  const isPassed = passResidentPart && passAreaPart && passAgreeResident && passAgreeArea;

  poll.results = {
    isPublished: poll.results && poll.results.isPublished || false,
    summary: '参与 ' + participatingResidents + ' 户（' + residentParticipationRate.toFixed(2) + '%），面积 ' + participatingArea.toFixed(2) + ' ㎡（' + areaParticipationRate.toFixed(2) + '%）；同意 ' + agreeCount + ' 户（' + agreeResidentRate.toFixed(2) + '%），面积 ' + agreeArea.toFixed(2) + ' ㎡（' + agreeAreaRate.toFixed(2) + '%）',
    detailUrl: '',
    participatingResidents: participatingResidents,
    participatingArea: participatingArea,
    agreeCount: agreeCount,
    agreeArea: agreeArea,
    totalResidents: totalResidents,
    totalArea: totalArea,
    residentParticipationRate: residentParticipationRate,
    areaParticipationRate: areaParticipationRate,
    agreeResidentRate: agreeResidentRate,
    agreeAreaRate: agreeAreaRate,
    isPassed: poll.status === '已结束' ? isPassed : null,
    calculatedAt: new Date().toISOString()
  };

  poll.progress = poll.progress || {};
  if (poll.progress.target === undefined || poll.progress.target === null || Number.isNaN(poll.progress.target)) {
    poll.progress.target = 300;
  }
  poll.progress.current = participatingResidents;
  poll.progress.unit = '户';

  appendAuditLog('count', 'polls', pollId, '自动计票完成：' + (poll.results.isPassed ? '通过' : '未通过') + '，参与 ' + participatingResidents + ' 户');

  return poll.results;
}





/* ========== Merkle Tree & Evidence Anchoring ========== */



async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}



async function buildMerkleTree(leaves) {
  if (!leaves || leaves.length === 0) return { root: '', levels: [[]] };
  let current = leaves.slice();
  const levels = [current.slice()];
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] || left;
      const combined = await sha256Hex(left + right);
      next.push(combined);
    }
    levels.push(next.slice());
    current = next;
  }
  return { root: current[0], levels: levels };
}



async function getMerklePath(leafHash, levels) {
  let idx = levels[0].indexOf(leafHash);
  if (idx < 0) return null;
  const path = [];
  for (let i = 0; i < levels.length - 1; i++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = levels[i][siblingIdx] || levels[i][idx];
    path.push({ hash: sibling, isRight: !isRight });
    idx = Math.floor(idx / 2);
  }
  return path;
}



async function verifyMerklePath(leafHash, path, root) {
  let current = leafHash;
  for (const node of path) {
    if (node.isRight) {
      current = await sha256Hex(current + node.hash);
    } else {
      current = await sha256Hex(node.hash + current);
    }
  }
  return current === root;
}



async function anchorVoteData(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return null;

  showLoading(true);
  const records = [];

  try {
    // 1. 读取投票记录
    const d = new Date();
    const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
    let responses = [];
    try { responses = await workerRead(path); } catch(e) { responses = []; }
    if (!Array.isArray(responses)) responses = [];
    const pollVotes = responses.filter(r => r.pollId === pollId);

    // 2. 计算 Merkle Tree
    const leaves = [];
    for (const v of pollVotes) {
      const leaf = await sha256Hex(JSON.stringify(v));
      leaves.push(leaf);
    }
    const merkle = await buildMerkleTree(leaves);
    const root = merkle.root;
    const anchorTime = new Date().toISOString();
    const anchorContent = 'Merkle Root: ' + root + '\nPoll: ' + (poll.caseNo || pollId) + '\nTime: ' + anchorTime + '\nVotes: ' + pollVotes.length;

    // 3a. GitHub Commit 锚定
    const githubToken = localStorage.getItem('githubToken') || '';
    const githubRepo = localStorage.getItem('githubRepo') || '';
    if (githubToken && githubRepo) {
      try {
        const [owner, repo] = githubRepo.includes('/') ? githubRepo.split('/') : [githubRepo, githubRepo];
        const filePath = 'anchors/' + pollId + '.txt';
        const content = btoa(unescape(encodeURIComponent(anchorContent)));
        // 先获取 sha
        const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
        });
        let sha = '';
        if (getRes.ok) { const info = await getRes.json(); sha = info.sha; }
        const body = { message: '[Anchor] ' + (poll.caseNo || pollId) + ' at ' + anchorTime, content: content };
        if (sha) body.sha = sha;
        const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (putRes.ok) {
          const putData = await putRes.json();
          records.push({
            type: 'github',
            name: 'GitHub Commit',
            url: putData.content.html_url || ('https://github.com/' + owner + '/' + repo + '/blob/main/' + filePath),
            time: anchorTime,
            txHash: putData.commit.sha || ''
          });
        } else {
          records.push({ type: 'github', name: 'GitHub Commit', url: '', time: anchorTime, txHash: '', error: '提交失败' });
        }
      } catch(e) {
        records.push({ type: 'github', name: 'GitHub Commit', url: '', time: anchorTime, txHash: '', error: e.message });
      }
    } else {
      records.push({ type: 'github', name: 'GitHub Commit', url: '', time: anchorTime, txHash: '', error: '未配置 GITHUB_TOKEN 或仓库' });
    }

    // 3b. 微信群机器人锚定
    const wechatWebhook = localStorage.getItem('wechatWebhook') || '';
    if (wechatWebhook) {
      try {
        const msg = {
          msgtype: 'text',
          text: {
            content: '【投票锚定】' + (poll.caseNo || pollId) + '\nMerkle Root: ' + root + '\n投票数: ' + pollVotes.length + '\n时间: ' + anchorTime + '\n请截图保存此消息作为证据。'
          }
        };
        const wxRes = await fetch(wechatWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg)
        });
        if (wxRes.ok) {
          records.push({ type: 'wechat', name: '微信群机器人', url: wechatWebhook, time: anchorTime, txHash: '' });
        } else {
          records.push({ type: 'wechat', name: '微信群机器人', url: wechatWebhook, time: anchorTime, txHash: '', error: '发送失败 ' + wxRes.status });
        }
      } catch(e) {
        records.push({ type: 'wechat', name: '微信群机器人', url: wechatWebhook, time: anchorTime, txHash: '', error: e.message });
      }
    } else {
      records.push({ type: 'wechat', name: '微信群机器人', url: '', time: anchorTime, txHash: '', error: '未配置 Webhook URL' });
    }

    // 3c. Resend 邮件锚定
    const resendKey = localStorage.getItem('resendApiKey') || '';
    const anchorEmail = localStorage.getItem('anchorEmail') || '';
    if (resendKey && anchorEmail) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'anchor@community.firstblade.site',
            to: anchorEmail,
            subject: '【投票锚定】' + (poll.caseNo || pollId),
            text: anchorContent + '\n\n此邮件作为投票结果的不可篡改证据锚定。'
          })
        });
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          records.push({ type: 'email', name: 'Resend 邮件', url: '', time: anchorTime, txHash: emailData.id || '' });
        } else {
          const errText = await emailRes.text();
          records.push({ type: 'email', name: 'Resend 邮件', url: '', time: anchorTime, txHash: '', error: errText.substring(0, 100) });
        }
      } catch(e) {
        records.push({ type: 'email', name: 'Resend 邮件', url: '', time: anchorTime, txHash: '', error: e.message });
      }
    } else {
      records.push({ type: 'email', name: 'Resend 邮件', url: '', time: anchorTime, txHash: '', error: '未配置 Resend API Key 或邮箱' });
    }

    // 保存锚定记录到 poll
    poll.anchorRecords = records;
    poll.merkleRoot = root;
    poll.merkleLeavesCount = leaves.length;
    poll.anchoredAt = anchorTime;

    // 持久化 polls 数据
    await saveDataFile('polls', appData.polls, '锚定投票 ' + (poll.caseNo || pollId), 'anchor');

    // 追加审计日志
    appendAuditLog('anchor', 'polls', pollId, '证据锚定完成：' + records.filter(r => !r.error).length + '/3 成功，Merkle Root: ' + root.substring(0,16) + '...');

    showToast('锚定完成：' + records.filter(r => !r.error).length + '/3 成功', 'success');
    return records;
  } catch(e) {
    showToast('锚定失败：' + e.message, 'error');
    return null;
  } finally {
    showLoading(false);
  }
}



function showAnchorDetails(pollId) {
  const poll = (appData.polls || []).find(p => p.id === pollId);
  if (!poll) return;
  const records = poll.anchorRecords || [];
  const root = poll.merkleRoot || '';

  document.getElementById('modalTitle').textContent = '🔗 锚定详情：' + (poll.caseNo || pollId);
  let body = '<div style="margin-bottom:16px;padding:12px;background:#f0f7f4;border-radius:8px;border-left:4px solid var(--primary);">';
  body += '<div style="font-weight:600;margin-bottom:4px;">Merkle Root</div>';
  body += '<div style="font-family:monospace;font-size:13px;word-break:break-all;">' + (root || '—') + '</div>';
  body += '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">投票数：' + (poll.merkleLeavesCount || 0) + ' · 锚定时间：' + (poll.anchoredAt ? formatDateTime(poll.anchoredAt) : '—') + '</div>';
  body += '</div>';

  if (!records.length) {
    body += '<div class="empty-state" style="padding:30px 20px;"><div class="icon">🔗</div><div>暂无锚定记录</div></div>';
  } else {
    body += '<div style="font-weight:600;margin-bottom:12px;">锚定记录</div>';
    records.forEach((r, i) => {
      const statusColor = r.error ? '#c62828' : '#2e7d32';
      const statusText = r.error ? '❌ 失败' : '✅ 成功';
      body += '<div style="background:#fafafa;border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;">';
      body += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
      body += '<div style="font-weight:600;">' + (i+1) + '. ' + escapeHtml(r.name) + '</div>';
      body += '<span style="font-size:12px;font-weight:600;color:' + statusColor + ';">' + statusText + '</span>';
      body += '</div>';
      if (r.url) {
        body += '<div style="font-size:12px;margin-bottom:4px;"><a href="' + r.url + '" target="_blank" style="color:var(--primary);text-decoration:none;">🔗 ' + escapeHtml(r.url) + '</a></div>';
      }
      if (r.txHash) {
        body += '<div style="font-size:12px;color:var(--text-secondary);font-family:monospace;">Hash: ' + escapeHtml(r.txHash) + '</div>';
      }
      if (r.error) {
        body += '<div style="font-size:12px;color:var(--danger);margin-top:4px;">错误：' + escapeHtml(r.error) + '</div>';
      }
      body += '<div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">时间：' + formatDateTime(r.time) + '</div>';
      body += '</div>';
    });
  }

  body += '<div style="margin-top:16px;text-align:center;display:flex;gap:10px;justify-content:center;">';
  body += '<button class="btn btn-primary" onclick="anchorVoteData(\'' + pollId + '\')">🔄 重新锚定</button>';
  body += '<button class="btn" onclick="generatePollArchive(\'' + pollId + '\')">📄 下载档案 PDF</button>';
  body += '</div>';

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>';
  document.getElementById('modalOverlay').classList.add('active');
}




/* ========== 本地问卷后台管理功能 ========== */



function onPollModeChange() {
  const mode = document.getElementById('edPollMode').value;
  const tencentSec = document.getElementById('tencentSection');
  const localSec = document.getElementById('localSection');
  if(tencentSec) tencentSec.style.display = mode === 'tencent' ? 'block' : 'none';
  if(localSec) localSec.style.display = mode === 'local' ? 'block' : 'none';
}



let _pollQuestions = [];



function onPollCategoryChange() {
  const cat = document.getElementById('edCategory').value;
  const thInput = document.getElementById('edThresholdDisplay');
  if (!thInput) return;
  if (cat === 'major') {
    thInput.value = '参与双三分之二(66.67%) + 同意双四分之三(75%)';
  } else if (cat === 'general') {
    thInput.value = '参与双三分之二(66.67%) + 同意双过半(50%)';
  } else {
    thInput.value = '— 请先选择事项类型 —';
  }
}



/* ========== 业主清册模板与自动抓取 ========== */



function generateRollTemplateCSV() {
  const residents = (appData.residents || []).filter(r => r.status === 'active');
  let csv = '\uFEFF序号,房号,姓名（脱敏）,专有部分面积(m²),人数权重,面积权重,状态,备注\n';
  let totalArea = 0;
  residents.forEach((r, i) => {
    const name = r.name || '';
    const maskedName = name.length > 1 ? name[0] + '**' : (name || '**');
    const area = parseFloat(r.area) || 0;
    totalArea += area;
    const weightCount = r.voteWeightCount || 1;
    const weightArea = r.voteWeightArea || area;
    csv += (i + 1) + ',' + (r.roomNo || '') + ',"' + maskedName + '",' + area.toFixed(2) + ',' + weightCount + ',' + weightArea.toFixed(2) + ',正常,""\n';
  });
  csv += '合计,—,—,' + totalArea.toFixed(2) + ',—,—,—,"总户数:' + residents.length + '"\n';
  return { csv: csv, count: residents.length, area: totalArea };
}



function downloadRollTemplate() {
  const result = generateRollTemplateCSV();
  const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const communityName = (appData.config && appData.config.community && appData.config.community.name) || '小区';
  a.href = url;
  a.download = '业主清册模板_' + communityName + '_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('脱敏清册模板已下载（共' + result.count + '户）', 'success');
}



function syncRollFromResidents() {
  const residents = (appData.residents || []).filter(r => r.status === 'active');
  const totalCount = residents.length;
  const totalArea = residents.reduce(function(sum, r) { return sum + (parseFloat(r.area) || 0); }, 0);
  const targetInput = document.getElementById('edTarget');
  if (targetInput) targetInput.value = totalCount;
  updateRollStats(totalCount, totalArea);
  window._rollSyncData = { count: totalCount, area: totalArea, source: 'residents' };
  if (totalArea <= 0 && totalCount > 0) {
    showToast('⚠️ 业主库中面积数据为空，请先在「业主管理」中补录各户面积，或上传带面积的CSV清册', 'warning');
  } else {
    showToast('已从业主库同步：' + totalCount + '户，' + totalArea.toFixed(2) + '㎡', 'success');
  }
}



function updateRollStats(count, area) {
  const countEl = document.getElementById('rollStatCount');
  const areaEl = document.getElementById('rollStatArea');
  if (countEl) countEl.textContent = (count !== undefined && count !== null) ? count + ' 户' : '—';
  if (areaEl) areaEl.textContent = (area !== undefined && area !== null) ? area.toFixed(2) + ' ㎡' : '—';
}



function parseRollCSV(text) {
  // 去除 BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
  const lines = text.split(/\r?\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) return null;
  const parseLine = function(line) {
    const result = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  // 增强面积列匹配：支持 m²、m^2、平米、㎡ 等多种写法
  const areaIndex = headers.findIndex(function(h) {
    return /面积|area|㎡|m\^?2|平米|square|建筑.*面积|专有.*面积/i.test(h);
  });
  const isTotalRow = function(parts) {
    return parts.some(function(p) { return /合计|总户数|总计|total|summary/i.test(p); });
  };
  let count = 0;
  let area = 0;
  let totalAreaFromSummary = 0;
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    if (parts.length < 3) continue;
    if (isTotalRow(parts)) {
      if (areaIndex >= 0) {
        const val = parseFloat(parts[areaIndex]);
        if (!isNaN(val) && val > 0) totalAreaFromSummary = val;
      }
      continue;
    }
    count++;
    if (areaIndex >= 0) {
      const val = parseFloat(parts[areaIndex]);
      if (!isNaN(val)) area += val;
    }
  }
  // 如果合计行提供了总面积且与累加值接近，以合计行为准（处理四舍五入差异）
  if (totalAreaFromSummary > 0 && Math.abs(totalAreaFromSummary - area) < count * 0.5) {
    area = totalAreaFromSummary;
  }
  return { count: count, area: area };
}



function validatePollCompliance() {
  const errors = [];
  const category = document.getElementById('edCategory').value;
  if (!category) errors.push('必须选择事项类型（一般/重大）');

  const ruleFiles = getMultiUploadedPaths('pollRuleFiles');
  if (!ruleFiles || ruleFiles.length === 0) errors.push('必须上传议事规则PDF');

  const rollFiles = getMultiUploadedPaths('pollRollFiles');
  if (!rollFiles || rollFiles.length === 0) errors.push('必须上传业主清册PDF');

  const rollStart = document.getElementById('edRollStart').value;
  const rollEnd = document.getElementById('edRollEnd').value;
  const startDate = document.getElementById('edStart').value;
  if (!rollStart || !rollEnd) {
    errors.push('必须填写业主清册公示起止日期');
  }
  if (!startDate) {
    errors.push('必须填写投票开始日期');
  }

  const meetingFiles = getMultiUploadedPaths('pollMeetingFiles');
  if (!meetingFiles || meetingFiles.length === 0) errors.push('必须上传会议通知PDF');

  const streetRecord = document.getElementById('edStreetRecord').value.trim();
  const streetConfirm = document.getElementById('edStreetConfirm').checked;
  if (!streetRecord && !streetConfirm) errors.push('必须填写街道备案号，或勾选"当地无街道备案要求"确认跳过');

  // a) consultation 必填且满7天
  const consultStart = document.getElementById('edConsultStart').value;
  const consultEnd = document.getElementById('edConsultEnd').value;
  if (!consultStart || !consultEnd) {
    errors.push('必须填写公告方案征求意见期的起止日期');
  } else {
    const cs = new Date(consultStart);
    const ce = new Date(consultEnd);
    if ((ce - cs) < 6 * 86400000) {
      errors.push('公告方案征求意见期必须不少于7天（含首尾）');
    }
  }

  // b) announcement 提前期 >= 15天
  const announceStart = document.getElementById('edAnnounceStart').value;
  const announceEnd = document.getElementById('edAnnounceEnd').value;
  const voteStart = document.getElementById('edStart').value;
  if (!announceStart || !announceEnd) {
    errors.push('必须填写正式公告发布期的起止日期');
  } else if (voteStart) {
    const as = new Date(announceStart);
    const vs = new Date(voteStart);
    if ((vs - as) < 15 * 86400000) {
      errors.push('正式公告发布期到投票开始日必须不少于15天');
    }
  }

  // c) 时间顺序约束
  if (consultStart && consultEnd && announceStart) {
    const cs = new Date(consultStart);
    const ce = new Date(consultEnd);
    const as = new Date(announceStart);
    const ae = new Date(announceEnd || announceStart);
    if (cs > ce) errors.push('征求意见开始日期不能晚于结束日期');
    if (ce >= as) errors.push('征求意见结束日期必须早于正式公告开始日期');
    if (as > ae) errors.push('正式公告开始日期不能晚于结束日期');
  }
  const rollStartVal = document.getElementById('edRollStart').value;
  const rollEndVal = document.getElementById('edRollEnd').value;
  const voteEnd = document.getElementById('edEnd').value;
  if (rollStartVal && rollEndVal && voteStart) {
    const rs = new Date(rollStartVal);
    const re = new Date(rollEndVal);
    const vs = new Date(voteStart);
    if (rs > re) errors.push('清册公示开始日期不能晚于结束日期');
    if (re >= vs) errors.push('清册公示结束日期必须早于投票开始日期');
  }
  if (voteStart && voteEnd) {
    const vs = new Date(voteStart);
    const ve = new Date(voteEnd);
    if (vs > ve) errors.push('投票开始日期不能晚于结束日期');
  }
  if (announceStart && voteStart) {
    const as = new Date(announceStart);
    const vs = new Date(voteStart);
    if (as >= vs) errors.push('正式公告开始日期必须早于投票开始日期');
  }

  return { valid: errors.length === 0, errors };
}



function renderPollQuestionsEditor(questions) {
  _pollQuestions = JSON.parse(JSON.stringify(questions || []));
  const container = document.getElementById('pollQuestionsEditor');
  if(!container) return;
  if(!_pollQuestions.length) {
    container.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;padding:8px 0;">暂无题目，请点击下方按钮添加</div>';
    return;
  }
  let html = '';
  _pollQuestions.forEach((q, idx) => {
    html += '<div class="poll-q-item" style="background:#fff;border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:10px;">';
    html += '<div style="display:flex;gap:8px;margin-bottom:8px;">';
    html += '<span style="font-weight:600;font-size:13px;">题目 ' + (idx+1) + '</span>';
    html += '<button type="button" class="btn btn-sm btn-danger" onclick="removePollQuestion(' + idx + ')" style="margin-left:auto;">删除</button>';
    html += '</div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-size:12px;">题目标题</label><input type="text" id="qTitle-' + idx + '" value="' + escapeHtml(q.title||'') + '" placeholder="请输入题目标题"></div>';
    html += '<div class="form-row" style="grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:10px;">';
    html += '<div class="form-group" style="margin-bottom:0;"><label style="font-size:12px;">类型</label><select id="qType-' + idx + '" onchange="onQuestionTypeChange(' + idx + ')"><option value="single" ' + (q.type==='single'?'selected':'') + '>单选</option><option value="multiple" ' + (q.type==='multiple'?'selected':'') + '>多选</option><option value="text" ' + (q.type==='text'?'selected':'') + '>文本</option></select></div>';
    html += '<div class="form-group form-check" style="margin-bottom:0;align-self:flex-end;padding-bottom:8px;"><input type="checkbox" id="qReq-' + idx + '" ' + (q.required?'checked':'') + '><label for="qReq-' + idx + '">必填</label></div>';
    html += '</div>';
    html += '<div id="qOptionsWrap-' + idx + '" style="' + (q.type==='text'?'display:none;':'') + '">';
    html += '<label style="font-size:12px;display:block;margin-bottom:6px;">选项（每行一个）</label>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<button type="button" class="btn btn-sm" onclick="fillQuestionOptions(' + idx + ', [\'同意\',\'不同意\'])" style="font-size:11px;padding:3px 10px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;border-radius:4px;cursor:pointer;">同意/不同意</button>';
    html += '<button type="button" class="btn btn-sm" onclick="fillQuestionOptions(' + idx + ', [\'同意\',\'反对\'])" style="font-size:11px;padding:3px 10px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;border-radius:4px;cursor:pointer;">同意/反对</button>';
    html += '<button type="button" class="btn btn-sm" onclick="fillQuestionOptions(' + idx + ', [\'赞成\',\'反对\'])" style="font-size:11px;padding:3px 10px;background:#e3f2fd;color:#1976d2;border:1px solid #bbdefb;border-radius:4px;cursor:pointer;">赞成/反对</button>';
    html += '<button type="button" class="btn btn-sm" onclick="fillQuestionOptions(' + idx + ', [\'是\',\'否\'])" style="font-size:11px;padding:3px 10px;background:#fff3e0;color:#e65100;border:1px solid #ffe0b2;border-radius:4px;cursor:pointer;">是/否</button>';
    html += '</div>';
    html += '<textarea id="qOpts-' + idx + '" rows="3" placeholder="选项1&#10;选项2&#10;选项3" style="font-family:inherit;">' + escapeHtml((q.options||[]).join('\n')) + '</textarea>';
    html += '</div>';
    html += '</div>';
  });
  container.innerHTML = html;
}



function onQuestionTypeChange(idx) {
  const type = document.getElementById('qType-' + idx).value;
  const wrap = document.getElementById('qOptionsWrap-' + idx);
  if(wrap) wrap.style.display = type === 'text' ? 'none' : 'block';
}



function fillQuestionOptions(idx, opts) {
  const el = document.getElementById('qOpts-' + idx);
  if (el) {
    el.value = opts.join('\n');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function addPollQuestion() {
  _pollQuestions.push({ id: 'q-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), title: '', type: 'single', options: ['选项1','选项2'], required: true });
  renderPollQuestionsEditor(_pollQuestions);
}



function removePollQuestion(idx) {
  _pollQuestions.splice(idx, 1);
  renderPollQuestionsEditor(_pollQuestions);
}



function collectPollQuestions() {
  const questions = [];
  _pollQuestions.forEach((q, idx) => {
    const title = document.getElementById('qTitle-' + idx).value.trim();
    if(!title) return;
    const type = document.getElementById('qType-' + idx).value;
    const required = document.getElementById('qReq-' + idx).checked;
    let options = [];
    if(type !== 'text') {
      const optsText = document.getElementById('qOpts-' + idx).value;
      options = optsText.split('\n').map(s => s.trim()).filter(s => s);
    }
    questions.push({ id: q.id || ('q-' + Date.now() + '-' + idx), title, type, options, required });
  });
  return questions;
}



async function viewPollData(pollId) {
  const p = (appData.polls||[]).find(x => x.id === pollId);
  if(!p) return;
  showLoading(true);
  let responses = [];
  try {
    const d = new Date();
    const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
    responses = await workerRead(path);
    responses = responses.filter(x => x.pollId === pollId);
  } catch(e) { responses = []; }
  showLoading(false);

  // 建立房号→面积映射，用于数据展示时自动补全面积
  const residentAreaMap = {};
  (appData.residents || []).forEach(r => {
    if (r.roomNo) residentAreaMap[r.roomNo] = parseFloat(r.area) || 0;
  });

  document.getElementById('modalTitle').textContent = '📊 问卷数据：' + p.title;
  let body = '<div style="margin-bottom:12px;"><span style="font-size:13px;color:var(--text-secondary);">共 ' + responses.length + ' 人参与</span>';
  body += '<button class="btn btn-sm" onclick="downloadPollData(\'' + pollId + '\')" style="margin-left:12px;">📥 下载CSV</button></div>';

  if(!responses.length) {
    body += '<div class="empty-state"><div class="icon">📊</div><div>暂无数据</div></div>';
  } else {
    body += '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(㎡)</th><th>提交时间</th>';
    (p.questions||[]).forEach(q => {
      body += '<th>' + escapeHtml(q.title) + '</th>';
    });
    body += '</tr></thead><tbody>';
    responses.forEach(r => {
      // 同时兼容 roomNo（投票记录字段）和 residentRoom（旧字段）
      const roomKey = r.roomNo || r.residentRoom || '';
      let rArea = 0;
      if (r.area !== undefined && r.area !== null && r.area !== '') {
        const parsed = parseFloat(r.area);
        if (!isNaN(parsed)) rArea = parsed;
      }
      if (rArea === 0 && roomKey) rArea = residentAreaMap[roomKey] || 0;
      body += '<tr><td>' + (roomKey) + '</td><td>' + (r.residentName || r.name || '') + '</td><td>' + (rArea > 0 ? rArea.toFixed(2) : '—') + '</td><td>' + formatDateTime(r.createdAt || r.voteTime) + '</td>';
      body += '<tr><td>' + (r.residentRoom||'') + '</td><td>' + (r.residentName||'') + '</td><td>' + (rArea > 0 ? rArea.toFixed(2) : '—') + '</td><td>' + formatDateTime(r.createdAt) + '</td>';
      (p.questions||[]).forEach(q => {
        const ans = r.answers.find(a => a.questionId === q.id);
        let val = '';
        if(ans) {
          if(Array.isArray(ans.value)) val = ans.value.join(', ');
          else val = ans.value;
        }
        body += '<td>' + escapeHtml(val) + '</td>';
      });
      body += '</tr>';
    });
    body += '</tbody></table></div>';

    body += '<div style="margin-top:20px;"><div style="font-weight:600;margin-bottom:12px;">📈 选项统计</div>';
    (p.questions||[]).forEach(q => {
      if(q.type === 'text') return;
      body += '<div style="background:#fafafa;border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:10px;">';
      body += '<div style="font-weight:600;margin-bottom:8px;">' + escapeHtml(q.title) + '</div>';
      const counts = {};
      (q.options||[]).forEach(opt => counts[opt] = 0);
      responses.forEach(r => {
        const ans = r.answers.find(a => a.questionId === q.id);
        if(!ans || !ans.value) return;
        if(Array.isArray(ans.value)) {
          ans.value.forEach(v => { if(counts[v] !== undefined) counts[v]++; });
        } else {
          if(counts[ans.value] !== undefined) counts[ans.value]++;
        }
      });
      const total = responses.length || 1;
      (q.options||[]).forEach(opt => {
        const c = counts[opt] || 0;
        const pct = Math.round(c / total * 100);
        body += '<div style="margin-bottom:6px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;"><span>' + escapeHtml(opt) + '</span><span>' + c + ' (' + pct + '%)</span></div>';
        body += '<div style="background:#e0e0e0;border-radius:4px;height:16px;overflow:hidden;"><div style="height:100%;background:var(--primary);width:' + pct + '%;"></div></div></div>';
      });
      body += '</div>';
    });
    body += '</div>';
  }

  document.getElementById('modalBody').innerHTML = body;
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">关闭</button>';
  document.getElementById('modalOverlay').classList.add('active');
}



async function downloadPollData(pollId) {
  const p = (appData.polls||[]).find(x => x.id === pollId);
  if(!p) return;
  showLoading(true);
  let responses = [];
  try {
    const d = new Date();
    const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
    responses = await workerRead(path);
    responses = responses.filter(x => x.pollId === pollId);
  } catch(e) { responses = []; }
  showLoading(false);

  // 建立房号→面积映射，用于CSV导出时自动补全面积
  const residentAreaMap = {};
  (appData.residents || []).forEach(r => {
    if (r.roomNo) residentAreaMap[r.roomNo] = parseFloat(r.area) || 0;
  });

  let csv = '\uFEFF';
  csv += '房号,姓名,面积(㎡),提交时间';
  (p.questions||[]).forEach(q => {
    csv += ',"' + (q.title||'').replace(/"/g, '""') + '"';
  });
  csv += '\n';

  responses.forEach(r => {
    // 同时兼容 roomNo（投票记录字段）和 residentRoom（旧字段）
    const roomKey = r.roomNo || r.residentRoom || '';
    let dArea = 0;
    if (r.area !== undefined && r.area !== null && r.area !== '') {
      const parsed = parseFloat(r.area);
      if (!isNaN(parsed)) dArea = parsed;
    }
    if (dArea === 0 && roomKey) dArea = residentAreaMap[roomKey] || 0;
    csv += (roomKey) + ',' + (r.residentName || r.name || '') + ',' + (dArea > 0 ? dArea.toFixed(2) : '') + ',"' + (r.createdAt || r.voteTime || '') + '"';
    csv += (r.residentRoom||'') + ',' + (r.residentName||'') + ',' + (dArea > 0 ? dArea.toFixed(2) : '') + ',"' + (r.createdAt||'') + '"';
    (p.questions||[]).forEach(q => {
      const ans = r.answers.find(a => a.questionId === q.id);
      let val = '';
      if(ans) {
        if(Array.isArray(ans.value)) val = ans.value.join(', ');
        else val = ans.value;
      }
      csv += ',"' + val.replace(/"/g, '""') + '"';
    });
    csv += '\n';
  });

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '问卷数据_' + (p.caseNo||pollId) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

