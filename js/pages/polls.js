/* js/pages/polls.js - 投票与意见征集 */

// ===== 面积工具函数 =====
function getResidentArea(r) {
  if (!r || typeof r !== 'object') return 0;
  var fields = ['area', 'houseArea', 'propertyArea', 'square', 'size', 'houseSize', 'property_area', 'house_area', 'house_size', '建筑面积', '套内面积', '房屋面积', '面积', 'propertySize', 'buildingArea', 'building_area', 'sqm', 'sqft'];
  for (var i = 0; i < fields.length; i++) {
    var raw = r[fields[i]];
    if (raw == null) continue;
    var v = parseFloat(raw);
    if (!isNaN(v) && v > 0) return v;
    if (typeof raw === 'string') {
      var m = raw.match(/(\d+(?:\.\d+)?)/);
      if (m) {
        v = parseFloat(m[1]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
  }
  if (r.house && typeof r.house === 'object') {
    var nested = getResidentArea(r.house);
    if (nested > 0) return nested;
  }
  if (r.property && typeof r.property === 'object') {
    var nested2 = getResidentArea(r.property);
    if (nested2 > 0) return nested2;
  }
  return 0;
}

// 获取业主房间号（兼容多种字段名）
function getResidentRoomNo(r) {
  if (!r || typeof r !== 'object') return '';
  var fields = ['roomNo', 'room', 'houseNo', 'house', 'roomNumber', 'unitNo', '房号', '房间号', '房屋编号', 'name', 'residentRoom'];
  for (var i = 0; i < fields.length; i++) {
    var v = r[fields[i]];
    if (v != null) {
      var s = String(v).trim();
      if (s) return s;
    }
  }
  if (r.house && typeof r.house === 'object') {
    var nested = getResidentRoomNo(r.house);
    if (nested) return nested;
  }
  if (r.property && typeof r.property === 'object') {
    var nested2 = getResidentRoomNo(r.property);
    if (nested2) return nested2;
  }
  return '';
}

function getPollResidents(p) {
  // 优先从投票对象自身的清册数据读取
  var sources = ['residents', 'ownerList', 'voterList', 'register', 'owner_list', 'voter_list', 'residentList', 'resident_list'];
  for (var i = 0; i < sources.length; i++) {
    var list = p[sources[i]];
    if (list && Array.isArray(list) && list.length > 0) return list;
  }
  // 其次从全局 appData.residents 读取
  if (appData.residents && Array.isArray(appData.residents) && appData.residents.length > 0) {
    return appData.residents;
  }
  return [];
}

function getCommunityTotalArea(p) {
  var residents = getPollResidents(p);
  if (!residents.length) {
    if (p.rollStats && typeof p.rollStats.totalArea === 'number' && p.rollStats.totalArea > 0) return p.rollStats.totalArea;
    if (p.voteResult && typeof p.voteResult.totalArea === 'number' && p.voteResult.totalArea > 0) return p.voteResult.totalArea;
    if (p.results && typeof p.results.totalArea === 'number' && p.results.totalArea > 0) return p.results.totalArea;
    if (p.stats && typeof p.stats.totalArea === 'number' && p.stats.totalArea > 0) return p.stats.totalArea;
    return 0;
  }
  var total = residents.reduce(function(sum, r) {
    return sum + getResidentArea(r);
  }, 0);
  if (total > 0) return total;
  if (p.rollStats && typeof p.rollStats.totalArea === 'number' && p.rollStats.totalArea > 0) return p.rollStats.totalArea;
  if (p.voteResult && typeof p.voteResult.totalArea === 'number' && p.voteResult.totalArea > 0) return p.voteResult.totalArea;
  if (p.results && typeof p.results.totalArea === 'number' && p.results.totalArea > 0) return p.results.totalArea;
  if (p.stats && typeof p.stats.totalArea === 'number' && p.stats.totalArea > 0) return p.stats.totalArea;
  return 0;
}

function getPollAreaTarget(p) {
  // 优先使用 admin 同步的清册统计数据
  if (p.rollStats && typeof p.rollStats.totalArea === 'number' && p.rollStats.totalArea > 0) {
    return p.rollStats.totalArea;
  }
  var v;
  if (p.progress) {
    v = parseFloat(p.progress.areaTarget);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.progress.targetArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.progress.totalArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.voteResult) {
    v = parseFloat(p.voteResult.totalArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.voteResult.areaTarget);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.voteResult.targetArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.results) {
    v = parseFloat(p.results.totalArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.areaTarget);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.targetArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.stats) {
    v = parseFloat(p.stats.totalArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.stats.areaTarget);
    if (!isNaN(v) && v > 0) return v;
  }
  v = parseFloat(p.targetArea);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.areaTarget);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.totalArea);
  if (!isNaN(v) && v > 0) return v;
  // 从清册自动计算
  var total = getCommunityTotalArea(p);
  if (total > 0) return total;
  return 0;
}

function getPollAreaCurrent(p) {
  var v;
  if (p.progress) {
    v = parseFloat(p.progress.areaCurrent);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.progress.currentArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.progress.participationArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.rollStats) {
    v = parseFloat(p.rollStats.areaCurrent);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.rollStats.currentArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.rollStats.participationArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.voteResult) {
    v = parseFloat(p.voteResult.areaCurrent);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.voteResult.currentArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.voteResult.participationArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.voteResult.votedArea);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.results) {
    v = parseFloat(p.results.areaCurrent);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.currentArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.participationArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.votedArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.participatingArea);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.agreeArea);
    if (!isNaN(v) && v > 0) return v;
    // 从 results.summary 字符串提取面积，如 "面积 140.00 ㎡ (2.49%)"
    if (p.results.summary && typeof p.results.summary === 'string') {
      var m = p.results.summary.match(/面积\s*(\d+(?:\.\d+)?)\s*㎡/);
      if (m) {
        v = parseFloat(m[1]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
  }
  if (p.stats) {
    v = parseFloat(p.stats.areaCurrent);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.stats.participationArea);
    if (!isNaN(v) && v > 0) return v;
  }
  v = parseFloat(p.currentArea);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.areaCurrent);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.participationArea);
  if (!isNaN(v) && v > 0) return v;
  return 0;
}

function getPollPeopleTarget(p) {
  // 优先使用 admin 同步的清册统计数据
  if (p.rollStats && typeof p.rollStats.totalCount === 'number' && p.rollStats.totalCount > 0) {
    return p.rollStats.totalCount;
  }
  var v;
  if (p.progress) {
    v = parseFloat(p.progress.target);
    if (!isNaN(v) && v > 0) return v;
  }
  v = parseFloat(p.targetUnits);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.target);
  if (!isNaN(v) && v > 0) return v;
  var residents = getPollResidents(p);
  if (residents.length > 0) return residents.length;
  return 0;
}

function getPollPeopleCurrent(p) {
  var v;
  if (p.progress) {
    v = parseFloat(p.progress.current);
    if (!isNaN(v) && v > 0) return v;
  }
  if (p.results) {
    v = parseFloat(p.results.participatingResidents);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.current);
    if (!isNaN(v) && v > 0) return v;
    v = parseFloat(p.results.participants);
    if (!isNaN(v) && v > 0) return v;
    // 从 summary 提取人数，如 "参与 1 户"
    if (p.results.summary && typeof p.results.summary === 'string') {
      var m = p.results.summary.match(/参与\s*(\d+)\s*户/);
      if (m) {
        v = parseFloat(m[1]);
        if (!isNaN(v) && v > 0) return v;
      }
    }
  }
  v = parseFloat(p.currentParticipants);
  if (!isNaN(v) && v > 0) return v;
  v = parseFloat(p.current);
  if (!isNaN(v) && v > 0) return v;
  return 0;
}

// ===== 时间字段提取（超宽兼容） =====
function getTimeField(p, keywords) {
  var keys = Object.keys(p);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i].toLowerCase();
    for (var j = 0; j < keywords.length; j++) {
      if (k.indexOf(keywords[j]) !== -1) {
        var val = p[keys[i]];
        if (val && typeof val === 'string' && /^\d{4}[-/]/.test(val)) return val;
        if (val && typeof val === 'object') {
          if (val.start && typeof val.start === 'string' && /^\d{4}[-/]/.test(val.start)) return val.start;
          if (val.end && typeof val.end === 'string' && /^\d{4}[-/]/.test(val.end)) return val.end;
        }
      }
    }
  }
  return '';
}

function getPollTimeStages(p) {
  var stages = [];

  // 公告方案征求意见期
  var cs = p.consultationStartDate || p.consultationStart || p.consultStartDate || p.consultStart || 
           p.feedbackStartDate || p.feedbackStart || p.proposalStartDate || p.proposalStart ||
           p.consultation_start || p.consult_start || p.feedback_start || p.proposal_start ||
           p.consultationStart || p.consultStart || p.feedbackStart || p.proposalStart ||
           (p.consultationPeriod && p.consultationPeriod.start) ||
           (p.proposalPeriod && p.proposalPeriod.start) ||
           (p.feedbackPeriod && p.feedbackPeriod.start) ||
           (p.consultPeriod && p.consultPeriod.start) ||
           (p.consultation && p.consultation.start) ||
           getTimeField(p, ['consultstart', 'consultationstart', 'feedbackstart', 'proposalstart', '征求意见', '意见征集', '方案公示']);
  var ce = p.consultationEndDate || p.consultationEnd || p.consultEndDate || p.consultEnd || 
           p.feedbackEndDate || p.feedbackEnd || p.proposalEndDate || p.proposalEnd ||
           p.consultation_end || p.consult_end || p.feedback_end || p.proposal_end ||
           p.consultationEnd || p.consultEnd || p.feedbackEnd || p.proposalEnd ||
           (p.consultationPeriod && p.consultationPeriod.end) ||
           (p.proposalPeriod && p.proposalPeriod.end) ||
           (p.feedbackPeriod && p.feedbackPeriod.end) ||
           (p.consultPeriod && p.consultPeriod.end) ||
           (p.consultation && p.consultation.end) ||
           getTimeField(p, ['consultend', 'consultationend', 'feedbackend', 'proposalend', '征求意见', '意见征集', '方案公示']);
  if (cs || ce) {
    stages.push({ name: '公告方案征求意见期', start: cs, end: ce, color: '#2e7d32', icon: '\uD83D\uDCE2', 
      note: p.consultationNote || p.consultNote || p.feedbackNote || p.proposalNote || '' });
  }

  // 正式公告发布期
  var as = p.announcementStartDate || p.announcementStart || p.officialStartDate || p.officialStart || 
           p.noticeStartDate || p.noticeStart || p.publicNoticeStartDate || p.publicNoticeStart ||
           p.announcement_start || p.official_start || p.notice_start || p.public_notice_start ||
           p.announcementStart || p.officialStart || p.noticeStart || p.publicNoticeStart ||
           (p.announcementPeriod && p.announcementPeriod.start) ||
           (p.officialPeriod && p.officialPeriod.start) ||
           (p.noticePeriod && p.noticePeriod.start) ||
           (p.publicNoticePeriod && p.publicNoticePeriod.start) ||
           (p.announcement && p.announcement.start) ||
           getTimeField(p, ['announcementstart', 'officialstart', 'noticestart', 'publicnoticestart', '公告发布', '正式公告']);
  var ae = p.announcementEndDate || p.announcementEnd || p.officialEndDate || p.officialEnd || 
           p.noticeEndDate || p.noticeEnd || p.publicNoticeEndDate || p.publicNoticeEnd ||
           p.announcement_end || p.official_end || p.notice_end || p.public_notice_end ||
           p.announcementEnd || p.officialEnd || p.noticeEnd || p.publicNoticeEnd ||
           (p.announcementPeriod && p.announcementPeriod.end) ||
           (p.officialPeriod && p.officialPeriod.end) ||
           (p.noticePeriod && p.noticePeriod.end) ||
           (p.publicNoticePeriod && p.publicNoticePeriod.end) ||
           (p.announcement && p.announcement.end) ||
           getTimeField(p, ['announcementend', 'officialend', 'noticeend', 'publicnoticeend', '公告发布', '正式公告']);
  if (as || ae) {
    stages.push({ name: '正式公告发布期', start: as, end: ae, color: '#6a1b9a', icon: '\uD83D\uDCCB', 
      note: p.announcementNote || p.officialNote || p.noticeNote || '' });
  }

  // 业主清册公示期
  var ps = p.publicityStartDate || p.publicityStart || p.publicStartDate || p.publicStart || 
           p.registerStartDate || p.registerStart || p.ownerListStartDate || p.ownerListStart ||
           p.publicity_start || p.public_start || p.register_start || p.owner_list_start ||
           p.publicityStart || p.publicStart || p.registerStart || p.ownerListStart ||
           (p.publicityPeriod && p.publicityPeriod.start) ||
           (p.publicPeriod && p.publicPeriod.start) ||
           (p.registerPeriod && p.registerPeriod.start) ||
           (p.ownerListPeriod && p.ownerListPeriod.start) ||
           (p.rollPublish && p.rollPublish.start) ||
           getTimeField(p, ['publicitystart', 'publicstart', 'registerstart', 'ownerliststart', '清册公示', '业主清册', '公示']);
  var pe = p.publicityEndDate || p.publicityEnd || p.publicEndDate || p.publicEnd || 
           p.registerEndDate || p.registerEnd || p.ownerListEndDate || p.ownerListEnd ||
           p.publicity_end || p.public_end || p.register_end || p.owner_list_end ||
           p.publicityEnd || p.publicEnd || p.registerEnd || p.ownerListEnd ||
           (p.publicityPeriod && p.publicityPeriod.end) ||
           (p.publicPeriod && p.publicPeriod.end) ||
           (p.registerPeriod && p.registerPeriod.end) ||
           (p.ownerListPeriod && p.ownerListPeriod.end) ||
           (p.rollPublish && p.rollPublish.end) ||
           getTimeField(p, ['publicityend', 'publicend', 'registerend', 'ownerlistend', '清册公示', '业主清册', '公示']);
  if (ps || pe) {
    stages.push({ name: '业主清册公示期', start: ps, end: pe, color: '#e65100', icon: '\uD83D\uDCCB', 
      note: p.publicityNote || p.publicNote || p.registerNote || '' });
  }

  // 投票期
  var vs = p.startDate || p.voteStartDate || p.votingStartDate || p.vote_start || p.voting_start ||
           (p.votePeriod && p.votePeriod.start) || (p.votingPeriod && p.votingPeriod.start) ||
           getTimeField(p, ['votestart', 'votingstart', '投票开始']);
  var ve = p.endDate || p.voteEndDate || p.votingEndDate || p.vote_end || p.voting_end ||
           (p.votePeriod && p.votePeriod.end) || (p.votingPeriod && p.votingPeriod.end) ||
           getTimeField(p, ['voteend', 'votingend', '投票结束']);
  if (vs || ve) {
    stages.push({ name: '投票期', start: vs, end: ve, color: 'var(--primary)', icon: '\uD83D\uDDF3\uFE0F', 
      active: p.status === '进行中', note: '' });
  }

  return stages;
}

// ===== 列表页 =====
function renderPolls() {
  const list = appData.polls || [];
  let h = '<div class="card"><div class="card-title"><span class="icon">\uD83D\uDDF3\uFE0F</span>投票与意见征集</div>';
  if (!list.length) { h += '<div class="empty">暂无投票或征集</div>'; }
  else {
    list.forEach(function(p) {
      var peopleTarget = getPollPeopleTarget(p);
      var peopleCurrent = getPollPeopleCurrent(p);
      var peoplePct = peopleTarget > 0 ? Math.round(peopleCurrent / peopleTarget * 100) : 0;

      var areaTarget = getPollAreaTarget(p);
      var areaCurrent = getPollAreaCurrent(p);
      var areaPct = areaTarget > 0 ? Math.round(areaCurrent / areaTarget * 100) : 0;

      var unit = (p.progress && p.progress.unit) ? p.progress.unit : (p.unit || '户');
      var sc = p.status === "进行中" ? "status-ongoing" : (p.status === "预告" ? "status-upcoming" : "status-ended");

      var stages = getPollTimeStages(p);

      h += '<div class="list-item" onclick="navigate(\'poll-detail\',\'' + p.id + '\')" style="flex-direction:column;align-items:stretch;gap:8px;">';
      h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
      h += '<span class="status-tag ' + sc + '">' + p.status + '</span>';
      h += '<span style="font-size:12px;color:var(--text-secondary);">案卷号：' + (p.caseNo || '-') + '</span>';
      if (p.mode === 'local') h += '<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:#e8f5e9;color:#2e7d32;">本地问卷</span>';
      h += '</div>';
      h += '<div style="font-size:15px;font-weight:500;">' + escapeHtml(p.title || '') + '</div>';

      // 时间阶段标签
      if (stages.length) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;">';
        stages.forEach(function(st) {
          var label = st.icon + ' ' + st.name.replace('期', '') + ' ' + (st.start || '--') + '~' + (st.end || '--');
          h += '<span style="font-size:11px;padding:3px 8px;border-radius:10px;background:' + (st.active ? st.color : '#f5f5f5') + ';color:' + (st.active ? '#fff' : st.color) + ';">' + label + '</span>';
        });
        h += '</div>';
      }

      h += '<div class="poll-progress" style="margin-top:6px;"><div class="poll-progress-bar" style="width:' + peoplePct + '%">' + peoplePct + '%</div></div>';
      h += '<div class="poll-stats"><span>\uD83D\uDC65 ' + peopleCurrent + ' / ' + peopleTarget + ' ' + unit + '</span><span>参与率 ' + peoplePct + '%</span></div>';

      if (areaTarget > 0) {
        h += '<div class="poll-stats" style="margin-top:4px;font-size:12px;">';
        h += '<span>\uD83D\uDCD0 面积：' + areaCurrent + ' / ' + areaTarget + ' ㎡</span>';
        h += '<span style="color:#1976d2;font-weight:600;">面积参与率 ' + areaPct + '%</span>';
        h += '</div>';
      }

      if (p.status === "进行中") {
        if (residentAuth) {
          var btnText = p.mode === 'local' ? '\uD83D\uDCDD 立即参与' : '我要参与';
          h += '<div style="margin-top:4px;"><button class="poll-btn" onclick="joinPoll(\'' + p.id + '\',event)" style="padding:8px 20px;font-size:13px;">' + btnText + '</button></div>';
        } else {
          h += '<div style="margin-top:4px;"><button class="poll-btn" onclick="showLogin();event.stopPropagation();" style="padding:8px 20px;font-size:13px;background:#888;">\uD83D\uDD12 请登录后参与</button></div>';
        }
      } else {
        h += '<div style="margin-top:4px;"><button class="poll-btn" disabled style="padding:8px 20px;font-size:13px;background:#ccc;cursor:not-allowed;">' + (p.status === "预告" ? "尚未开始" : "已结束") + '</button></div>';
      }
      h += '</div>';
    });
  }
  h += '</div>';
  return h;
}

/* ===== 公开反馈公示（无需登录） ===== */
async function loadComplaintsFromWorker() {
  const workerBase = localStorage.getItem('workerBase') || 'https://community.firstblade.site';
  try {
    const d = new Date();
    const path = 'complaints/' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '.json';
    const r = await fetch(workerBase + '/api/read/' + encodeURIComponent(path) + '?t=' + Date.now());
    if (!r.ok) throw new Error('读取失败');
    return await r.json();
  } catch (e) {
    console.error('加载投诉建议失败', e);
    return [];
  }
}

function renderComplaintsFrontEnd(list, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!list || !list.length) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999;">暂无投诉建议</div>';
    return;
  }
  let html = '<div style="max-width:800px;margin:0 auto;">';
  list.slice().reverse().forEach(function(item) {
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
      item.images.forEach(function(url) {
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
        item.replyImages.forEach(function(url) {
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

function collectPollAttachments(p) {
  var attachments = [];
  var seenUrls = new Set();
  function addAtt(url, name, category) {
    if (!url || typeof url !== 'string') return;
    if (seenUrls.has(url)) return;
    seenUrls.add(url);
    attachments.push({ url: url, name: name || '附件', category: category || '附件' });
  }
  var knownFields = [
    { keys: ['rulePdfs','rulePdf','meetingRulePdfs','meetingRulePdf','rulePdfUrl','rulePdfUrls','meetingRules'], label: '议事规则PDF' },
    { keys: ['registerPdfs','registerPdf','residentRegisterPdfs','residentRegisterPdf','registerPdfUrl','registerPdfUrls','residentListPdf','ownerRegisterPdf'], label: '业主清册PDF' },
    { keys: ['noticePdfs','noticePdf','meetingNoticePdfs','meetingNoticePdf','noticePdfUrl','noticePdfUrls','meetingNotice'], label: '会议通知PDF' },
    { keys: ['attachments','files','docs','documents'], label: null }
  ];
  knownFields.forEach(function(g) {
    g.keys.forEach(function(k) {
      var val = p[k];
      if (!val) return;
      if (Array.isArray(val)) {
        val.forEach(function(item) {
          if (typeof item === 'string') {
            addAtt(item, g.label || '附件', g.label);
          } else if (item && typeof item === 'object') {
            addAtt(item.url || item.fileUrl || item.src || item.link || '', item.name || item.fileName || item.title || g.label || '附件', g.label || item.category || item.type);
          }
        });
      } else if (typeof val === 'string') {
        addAtt(val, g.label || '附件', g.label);
      } else if (val && typeof val === 'object') {
        addAtt(val.url || val.fileUrl || val.src || val.link || '', val.name || val.fileName || val.title || g.label || '附件', g.label || val.category || val.type);
      }
    });
  });
  Object.keys(p).forEach(function(k) {
    var val = p[k];
    if (!val) return;
    if (typeof val === 'string' && /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(val)) {
      var isPdf = /\.pdf$/i.test(val);
      var label = isPdf ? (k.includes('rule') ? '议事规则PDF' : k.includes('register') || k.includes('resident') ? '业主清册PDF' : k.includes('notice') || k.includes('meeting') ? '会议通知PDF' : 'PDF附件') : '图片附件';
      addAtt(val, label, label);
    } else if (Array.isArray(val)) {
      val.forEach(function(item) {
        if (typeof item === 'string' && /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(item)) {
          var isPdf2 = /\.pdf$/i.test(item);
          var label2 = isPdf2 ? (k.includes('rule') ? '议事规则PDF' : k.includes('register') || k.includes('resident') ? '业主清册PDF' : k.includes('notice') || k.includes('meeting') ? '会议通知PDF' : 'PDF附件') : '图片附件';
          addAtt(item, label2, label2);
        } else if (item && typeof item === 'object') {
          var u = item.url || item.fileUrl || item.src || item.link || '';
          if (u && /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(u)) {
            var isPdf3 = /\.pdf$/i.test(u);
            var label3 = isPdf3 ? (item.name || item.fileName || item.title || k.includes('rule') ? '议事规则PDF' : k.includes('register') || k.includes('resident') ? '业主清册PDF' : k.includes('notice') || k.includes('meeting') ? '会议通知PDF' : 'PDF附件') : '图片附件';
            addAtt(u, label3, label3);
          }
        }
      });
    }
  });
  return attachments;
}

function renderPollCommonInfo(p) {
  var h = '';
  var sc = p.status === "进行中" ? "status-ongoing" : (p.status === "预告" ? "status-upcoming" : "status-ended");

  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
  h += '<span class="status-tag ' + sc + '">' + p.status + '</span>';
  h += '<span style="font-size:13px;color:var(--text-secondary);">案卷号：' + (p.caseNo || '-') + '</span>';
  if (p.type || p.matterType) h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:#e3f2fd;color:#1565c0;font-weight:600;">' + (p.type || p.matterType) + '</span>';
  if (p.mode === 'local') h += '<span style="font-size:12px;padding:2px 8px;border-radius:4px;background:#e8f5e9;color:#2e7d32;font-weight:600;">本地问卷</span>';
  h += '</div>';

  h += '<h1>' + escapeHtml(p.title || '') + '</h1>';

  h += '<div class="detail-meta" style="margin-bottom:16px;">';
  h += '<span>\uD83D\uDDF3\uFE0F 投票开始：' + (p.startDate || '--') + '</span>';
  h += '<span>\uD83D\uDDF3\uFE0F 投票截止：' + (p.endDate || '--') + '</span>';
  h += '<span>发起：' + escapeHtml(p.createdBy || '') + '</span>';
  h += '</div>';

  var legalBasis = p.legalBasis || p.legal || p.lawBasis || '';
  var threshold = p.threshold || p.voteThreshold || p.quota || '';
  var thresholdText = '';
  if (threshold) {
    if (typeof threshold === 'string') {
      thresholdText = threshold;
    } else if (typeof threshold === 'object') {
      var parts = [];
      if (threshold.participation) parts.push(threshold.participation);
      if (threshold.agreement) parts.push(threshold.agreement);
      if (threshold.desc) parts.push(threshold.desc);
      if (threshold.text) parts.push(threshold.text);
      if (!parts.length) {
        try { thresholdText = JSON.stringify(threshold); } catch(e) { thresholdText = ''; }
      } else {
        thresholdText = parts.join(' + ');
      }
    }
  }
  if (legalBasis || thresholdText) {
    h += '<div style="margin:16px 0;padding:14px;background:#f0f7ff;border-radius:8px;border-left:4px solid #1976d2;">';
    if (legalBasis) h += '<div style="font-size:13px;margin-bottom:6px;"><strong>法律依据：</strong>' + escapeHtml(legalBasis) + '</div>';
    if (thresholdText) h += '<div style="font-size:13px;"><strong>表决门槛：</strong>' + escapeHtml(thresholdText) + '</div>';
    h += '</div>';
  }

  if (p.description) {
    h += '<div class="detail-content" style="margin-bottom:16px;">' + renderInlineMedia(p.description) + '</div>';
  }

  var attachments = collectPollAttachments(p);
  var extraAttachFields = [
    {k:'rulePdf',l:'议事规则PDF'},{k:'registerPdf',l:'业主清册PDF'},{k:'noticePdf',l:'会议通知PDF'},
    {k:'meetingRulePdf',l:'议事规则PDF'},{k:'residentRegisterPdf',l:'业主清册PDF'},{k:'meetingNoticePdf',l:'会议通知PDF'}
  ];
  extraAttachFields.forEach(function(f){
    var v = p[f.k];
    if (v && typeof v === 'string') {
      var exists = attachments.some(function(a){return a.url===v;});
      if (!exists) attachments.push({url:v,name:f.l,category:f.l});
    }
  });
  if (attachments.length) {
    h += '<div style="margin:20px 0;padding-top:16px;border-top:1px solid var(--border);">';
    h += '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">\uD83D\uDCCE 相关附件</div>';
    attachments.forEach(function(att) {
      var url = att.url || '';
      var name = att.name || '附件';
      var isPdf = /\.pdf$/i.test(url);
      var isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
      h += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:12px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;text-decoration:none;color:var(--text);border:1px solid var(--border);transition:all .2s;" onmouseover="this.style.borderColor=\'var(--primary)\'" onmouseout="this.style.borderColor=\'var(--border)\'">';
      h += '<span style="font-size:20px;">' + (isPdf ? '\uD83D\uDCC4' : isImg ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCCE') + '</span>';
      h += '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(name) + '</div>';
      if (att.category) h += '<div style="font-size:11px;color:var(--text-secondary);">' + att.category + '</div>';
      h += '</div>';
      h += '<span style="font-size:12px;color:var(--text-secondary);flex-shrink:0;">' + (isPdf ? '预览 ↓' : '查看 ↓') + '</span>';
      h += '</a>';
      if (isPdf) {
        h += '<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">';
        h += '<iframe src="' + url + '" style="width:100%;height:400px;border:none;display:block;" title="' + escapeHtml(name) + '" loading="lazy"></iframe>';
        h += '</div>';
      } else if (isImg) {
        h += '<div style="margin-bottom:12px;"><img src="' + url + '" style="max-width:100%;border-radius:8px;border:1px solid var(--border);display:block;" loading="lazy" onerror="this.style.display=\'none\'"></div>';
      }
    });
    h += '</div>';
  }

  // ===== 项目时间流程 =====
  var timeStages = getPollTimeStages(p);
  if (timeStages.length > 0) {
    h += '<div style="margin:20px 0;padding:20px;background:#fafbfc;border-radius:12px;border:1px solid #eef0f3;">';
    h += '<div style="font-weight:600;margin-bottom:16px;font-size:15px;">\uD83D\uDCC5 项目时间流程</div>';
    h += '<div style="position:relative;padding-left:24px;">';
    h += '<div style="position:absolute;left:7px;top:8px;bottom:8px;width:2px;background:#e0e0e0;"></div>';
    timeStages.forEach(function(stage, idx) {
      var isLast = idx === timeStages.length - 1;
      h += '<div style="position:relative;margin-bottom:' + (isLast ? '0' : '16px') + ';padding-left:16px;">';
      h += '<div style="position:absolute;left:-17px;top:2px;width:12px;height:12px;border-radius:50%;background:' + (stage.active ? stage.color : '#bdbdbd') + ';border:2px solid #fff;box-shadow:0 0 0 2px ' + (stage.active ? stage.color : '#e0e0e0') + ';z-index:1;"></div>';
      h += '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px;">' + stage.icon + ' ' + stage.name + (stage.active ? ' <span style="font-size:11px;color:#fff;background:' + stage.color + ';padding:1px 6px;border-radius:10px;">进行中</span>' : '') + '</div>';
      h += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--text-secondary);">';
      h += '<span>开始：<strong style="color:' + stage.color + ';">' + (stage.start || '--') + '</strong></span>';
      h += '<span>结束：<strong style="color:' + stage.color + ';">' + (stage.end || '--') + '</strong></span>';
      h += '</div>';
      if (stage.note) {
        h += '<div style="font-size:12px;color:var(--text-secondary);margin-top:6px;padding:8px;background:#fff;border-radius:6px;border-left:3px solid ' + stage.color + ';">' + escapeHtml(stage.note) + '</div>';
      }
      h += '</div>';
    });
    h += '</div></div>';
  }

  var streetNo = p.streetRecordNo || p.streetRecordNumber || p.recordNo || '';
  var streetSkipped = p.streetRecordSkipped || p.streetSkipped || p.noStreetRecord || false;
  if (streetNo || streetSkipped) {
    h += '<div style="margin:12px 0;font-size:13px;color:var(--text-secondary);">';
    if (streetNo) h += '\uD83C\uDFDB\uFE0F 街道备案号：<strong>' + escapeHtml(streetNo) + '</strong>';
    if (streetSkipped) h += '\uD83C\uDFDB\uFE0F 街道备案：<span style="color:var(--primary);">当地无街道备案要求，已确认跳过</span>';
    h += '</div>';
  }

  if (p.questions && p.questions.length) {
    h += '<div style="margin:20px 0;padding-top:16px;border-top:1px solid var(--border);">';
    h += '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:12px;">\uD83D\uDCDD 问卷题目预览</div>';
    h += '<div style="background:#fafbfc;border-radius:8px;padding:16px;border:1px solid #eef0f2;">';
    p.questions.forEach(function(q, idx) {
      h += '<div style="margin-bottom:14px;' + (idx < p.questions.length - 1 ? 'padding-bottom:14px;border-bottom:1px dashed #e0e0e0;' : '') + '">';
      h += '<div style="font-weight:600;margin-bottom:8px;">' + (idx+1) + '. ' + escapeHtml(q.title) + (q.required ? '<span style="color:#c62828;margin-left:4px;">*</span>' : '') + '</div>';
      if (q.type === 'single' || q.type === 'multiple') {
        h += '<div style="display:flex;flex-direction:column;gap:6px;">';
        (q.options || []).forEach(function(opt) {
          h += '<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);padding:4px 8px;background:#fff;border-radius:4px;">';
          h += '<span style="width:14px;height:14px;border:1px solid #ccc;border-radius:' + (q.type==='single'?'50%':'3px') + ';display:inline-block;flex-shrink:0;"></span>';
          h += escapeHtml(opt);
          h += '</div>';
        });
        h += '</div>';
      } else if (q.type === 'text') {
        h += '<div style="font-size:13px;color:var(--text-secondary);padding:8px;background:#fff;border-radius:4px;border:1px solid #e0e0e0;">简答题</div>';
      }
      h += '</div>';
    });
    h += '</div></div>';
  }

  // ===== 参与统计（人数 + 面积） =====
  var target = getPollPeopleTarget(p);
  var current = getPollPeopleCurrent(p);
  var unit = (p.progress && p.progress.unit) ? p.progress.unit : (p.unit || '户');
  var pct = target > 0 ? Math.round(current / target * 100) : 0;

  var areaTarget = getPollAreaTarget(p);
  var areaCurrent = getPollAreaCurrent(p);
  var areaUnit = p.areaUnit || (p.progress && p.progress.areaUnit) || '㎡';
  var areaPct = areaTarget > 0 ? Math.round(areaCurrent / areaTarget * 100) : 0;
  var residents = getPollResidents(p);
  var showArea = areaTarget > 0 || areaCurrent > 0 || (residents.length > 0);

  h += '<div style="margin:20px 0;padding:20px;background:#f8f9fa;border-radius:12px;border:1px solid #eef0f3;">';
  h += '<div style="font-weight:600;margin-bottom:16px;font-size:15px;">\uD83D\uDCCA 参与统计</div>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;">';

  h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e8eaf6;">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  h += '<span style="font-size:14px;font-weight:600;color:#333;">\uD83D\uDC65 人数参与</span>';
  h += '<span style="font-size:15px;font-weight:700;color:var(--primary);">' + pct + '%</span>';
  h += '</div>';
  h += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">' + current + ' / ' + target + ' ' + unit + '</div>';
  h += '<div class="poll-progress" style="height:16px;"><div class="poll-progress-bar" style="width:' + pct + '%;font-size:10px;">' + (pct > 8 ? pct + '%' : '') + '</div></div>';
  h += '</div>';

  if (showArea) {
    h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e3f2fd;">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    h += '<span style="font-size:14px;font-weight:600;color:#333;">\uD83D\uDCD0 面积参与</span>';
    h += '<span style="font-size:15px;font-weight:700;color:#1976d2;">' + areaPct + '%</span>';
    h += '</div>';
    h += '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">' + areaCurrent + ' / ' + areaTarget + ' ' + areaUnit + '</div>';
    h += '<div class="poll-progress" style="height:16px;background:#e3f2fd;"><div class="poll-progress-bar" style="width:' + areaPct + '%;background:linear-gradient(90deg,#1976d2,#42a5f5);font-size:10px;">' + (areaPct > 8 ? areaPct + '%' : '') + '</div></div>';
    h += '</div>';
  }

  h += '</div>';

  var pr = p.participationRate || '';
  if (pr || showArea) {
    h += '<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #ddd;font-size:13px;color:var(--text-secondary);">';
    if (pr) h += '<div>\uD83D\uDC65 人数参与率：<strong style="color:var(--primary);">' + pr + '</strong></div>';
    if (showArea) {
      h += '<div style="margin-top:4px;">\uD83D\uDCD0 面积参与率：<strong style="color:#1976d2;">' + areaPct + '%</strong>（' + areaCurrent + ' / ' + areaTarget + ' ' + areaUnit + '）</div>';
    }
    h += '</div>';
  } else if (residents.length === 0) {
    h += '<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #ddd;font-size:13px;color:#999;">';
    h += '\uD83D\uDCA1 提示：如需显示面积统计，请在业主数据中完善「房屋面积」字段（支持 area / houseArea / propertyArea / square / size / houseSize）';
    h += '</div>';
  }
  h += '</div>';

  // ===== 计票结果（人数 + 面积） =====
  var vr = p.voteResult || p.results || p.tallyResult || null;
  if (vr) {
    h += '<div style="margin:20px 0;padding:20px;background:#e8f5e9;border-radius:12px;border:1px solid #c8e6c9;">';
    h += '<div style="font-weight:600;margin-bottom:16px;font-size:15px;">\uD83D\uDCCB 计票结果</div>';
    var now = new Date();
    var voteStart = p.startDate ? new Date(p.startDate.replace(/-/g, '/')) : null;
    var voteEnd = p.endDate ? new Date(p.endDate.replace(/-/g, '/')) : null;
    if (voteEnd) voteEnd.setHours(23, 59, 59, 999);

    if (voteStart && now < voteStart) {
      h += '<div style="font-size:13px;color:var(--text-secondary);text-align:center;padding:20px;background:#fff3e0;border-radius:8px;">';
      h += '<div style="font-size:24px;margin-bottom:8px;">&#9200;</div>';
      h += '<div style="font-weight:600;color:#e65100;margin-bottom:4px;">投票尚未开始</div>';
      h += '<div>开始时间：' + p.startDate + '</div>';
      h += '</div>';
    } else if (voteEnd && now > voteEnd) {
      var agreeCount = vr.agreeCount;
      if (agreeCount == null) agreeCount = vr.agree;
      if (agreeCount == null) agreeCount = vr.yesCount;
      if (agreeCount == null) agreeCount = vr.赞成Count;
      if (agreeCount == null) agreeCount = vr.supportCount;
      if (agreeCount == null) agreeCount = vr.赞同Count;
      if (agreeCount == null) agreeCount = vr.认可Count;
      if (agreeCount == null) agreeCount = vr.passCount;
      if (agreeCount == null) agreeCount = vr.通过Count;
      if (agreeCount == null) agreeCount = vr.赞成;
      if (agreeCount == null) agreeCount = vr.赞同;
      if (agreeCount == null) agreeCount = 0;

      var totalCount = vr.totalCount;
      if (totalCount == null) totalCount = vr.total;
      if (totalCount == null || totalCount === 0) totalCount = target || current || 1;
      var agreePct = totalCount > 0 ? Math.round(agreeCount / totalCount * 100) : 0;

      h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">';

      h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e8f5e9;">';
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#2e7d32;">\uD83D\uDC65 人数统计</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>同意：' + agreeCount + ' / ' + totalCount + ' ' + unit + '</span><span style="color:#2e7d32;font-weight:700;font-size:15px;">同意率 ' + agreePct + '%</span></div>';
      h += '<div style="background:#e8f5e9;border-radius:6px;height:16px;overflow:hidden;">';
      h += '<div style="height:100%;background:linear-gradient(90deg,#2e7d32,#66bb6a);border-radius:6px;width:' + agreePct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:10px;font-weight:600;">' + (agreePct > 8 ? agreePct + '%' : '') + '</div>';
      h += '</div></div>';

      var agreeArea = vr.agreeArea;
      if (agreeArea == null) agreeArea = vr.yesArea;
      if (agreeArea == null) agreeArea = vr.赞成Area;
      if (agreeArea == null) agreeArea = vr.supportArea;
      if (agreeArea == null) agreeArea = vr.赞同Area;
      if (agreeArea == null) agreeArea = vr.认可Area;
      if (agreeArea == null) agreeArea = vr.passArea;
      if (agreeArea == null) agreeArea = vr.通过Area;
      if (agreeArea == null) agreeArea = 0;

      var totalArea = vr.totalArea;
      if (totalArea == null || totalArea === 0) totalArea = areaTarget;
      if (totalArea == null || totalArea === 0) totalArea = getCommunityTotalArea(p);
      if (totalArea == null || totalArea === 0) totalArea = 1;
      var agreeAreaPct = totalArea > 0 ? Math.round(agreeArea / totalArea * 100) : 0;

      h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e3f2fd;">';
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#1976d2;">\uD83D\uDCD0 面积统计</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>同意面积：' + agreeArea + ' / ' + totalArea + ' ' + areaUnit + '</span><span style="color:#1976d2;font-weight:700;font-size:15px;">同意率 ' + agreeAreaPct + '%</span></div>';
      h += '<div style="background:#e3f2fd;border-radius:6px;height:16px;overflow:hidden;">';
      h += '<div style="height:100%;background:linear-gradient(90deg,#1976d2,#42a5f5);border-radius:6px;width:' + agreeAreaPct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:10px;font-weight:600;">' + (agreeAreaPct > 8 ? agreeAreaPct + '%' : '') + '</div>';
      h += '</div></div>';

      h += '</div>';

      if (vr.summary) h += '<div style="font-size:14px;line-height:1.6;margin-top:8px;padding:12px;background:#fff;border-radius:8px;">' + escapeHtml(vr.summary) + '</div>';
      if (vr.detailUrl) h += '<a href="' + vr.detailUrl + '" target="_blank" style="font-size:13px;color:var(--primary);text-decoration:underline;display:inline-block;margin-top:8px;">查看详细结果 →</a>';
      if (vr.calculatedAt) h += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">计算时间：' + vr.calculatedAt + '</div>';
    } else {
      h += '<div style="font-size:13px;color:var(--primary);text-align:center;padding:12px;background:#e3f2fd;border-radius:8px;margin-bottom:12px;font-weight:600;">';
      h += '&#128499;&#65039; 投票进行中，以下为实时统计数据';
      h += '</div>';
      var agreeCount = vr.agreeCount;
      if (agreeCount == null) agreeCount = vr.agree;
      if (agreeCount == null) agreeCount = vr.yesCount;
      if (agreeCount == null) agreeCount = vr.赞成Count;
      if (agreeCount == null) agreeCount = vr.supportCount;
      if (agreeCount == null) agreeCount = vr.赞同Count;
      if (agreeCount == null) agreeCount = vr.认可Count;
      if (agreeCount == null) agreeCount = vr.passCount;
      if (agreeCount == null) agreeCount = vr.通过Count;
      if (agreeCount == null) agreeCount = vr.赞成;
      if (agreeCount == null) agreeCount = vr.赞同;
      if (agreeCount == null) agreeCount = 0;

      var totalCount = vr.totalCount;
      if (totalCount == null) totalCount = vr.total;
      if (totalCount == null || totalCount === 0) totalCount = target || current || 1;
      var agreePct = totalCount > 0 ? Math.round(agreeCount / totalCount * 100) : 0;

      h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;">';

      h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e8f5e9;">';
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#2e7d32;">\uD83D\uDC65 人数统计</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>同意：' + agreeCount + ' / ' + totalCount + ' ' + unit + '</span><span style="color:#2e7d32;font-weight:700;font-size:15px;">同意率 ' + agreePct + '%</span></div>';
      h += '<div style="background:#e8f5e9;border-radius:6px;height:16px;overflow:hidden;">';
      h += '<div style="height:100%;background:linear-gradient(90deg,#2e7d32,#66bb6a);border-radius:6px;width:' + agreePct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:10px;font-weight:600;">' + (agreePct > 8 ? agreePct + '%' : '') + '</div>';
      h += '</div></div>';

      var agreeArea = vr.agreeArea;
      if (agreeArea == null) agreeArea = vr.yesArea;
      if (agreeArea == null) agreeArea = vr.赞成Area;
      if (agreeArea == null) agreeArea = vr.supportArea;
      if (agreeArea == null) agreeArea = vr.赞同Area;
      if (agreeArea == null) agreeArea = vr.认可Area;
      if (agreeArea == null) agreeArea = vr.passArea;
      if (agreeArea == null) agreeArea = vr.通过Area;
      if (agreeArea == null) agreeArea = 0;

      var totalArea = vr.totalArea;
      if (totalArea == null || totalArea === 0) totalArea = areaTarget;
      if (totalArea == null || totalArea === 0) totalArea = getCommunityTotalArea(p);
      if (totalArea == null || totalArea === 0) totalArea = 1;
      var agreeAreaPct = totalArea > 0 ? Math.round(agreeArea / totalArea * 100) : 0;

      h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e3f2fd;">';
      h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;color:#1976d2;">\uD83D\uDCD0 面积统计</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span>同意面积：' + agreeArea + ' / ' + totalArea + ' ' + areaUnit + '</span><span style="color:#1976d2;font-weight:700;font-size:15px;">同意率 ' + agreeAreaPct + '%</span></div>';
      h += '<div style="background:#e3f2fd;border-radius:6px;height:16px;overflow:hidden;">';
      h += '<div style="height:100%;background:linear-gradient(90deg,#1976d2,#42a5f5);border-radius:6px;width:' + agreeAreaPct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:10px;font-weight:600;">' + (agreeAreaPct > 8 ? agreeAreaPct + '%' : '') + '</div>';
      h += '</div></div>';

      h += '</div>';

      if (vr.summary) h += '<div style="font-size:14px;line-height:1.6;margin-top:8px;padding:12px;background:#fff;border-radius:8px;">' + escapeHtml(vr.summary) + '</div>';
      if (vr.calculatedAt) h += '<div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">计算时间：' + vr.calculatedAt + '</div>';
    }
    h += '</div>';
  }

  return h;
}

function renderPollDetail(id) {
  const p = (appData.polls||[]).find(function(x) { return x.id === id; });
  if (!p) return '<div class="empty">投票不存在</div>';
  if (p.mode === 'local') {
    return renderLocalPollDetail(p);
  }
  let h = '<div class="card"><div class="detail-header">';
  h += renderPollCommonInfo(p);
  h += '</div>';

  const canJoin = p.status === "进行中";
  if (canJoin) {
    if (residentAuth) h += '<button onclick="joinPoll(\'' + p.id + '\')" class="poll-btn">我要参与</button>';
    else h += '<button onclick="showLogin()" class="poll-btn" style="background:#888;">\uD83D\uDD12 请登录后参与</button>';
  }

  h += '<div style="margin-top:20px;"><button class="poll-btn" onclick="history.back()">← 返回</button></div></div>';
  return h;
}

function renderLocalPollDetail(p) {
  let h = '<div class="card"><div class="detail-header">';
  h += renderPollCommonInfo(p);
  h += '</div>';
  h += '<div id="localPollContainer"><div class="loading">加载问卷中...</div></div>';
  h += '<div style="margin-top:20px;"><button class="poll-btn" onclick="history.back()">← 返回</button></div></div>';
  setTimeout(function() { initLocalPoll(p); }, 50);
  return h;
}

async function loadPollResponses(pollId) {
  const d = new Date();
  const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
  try {
    const all = await workerRead(path);
    return all.filter(function(x) { return x.pollId === pollId; });
  } catch(e) { return []; }
}

async function initLocalPoll(p) {
  const container = document.getElementById('localPollContainer');
  if (!container) return;
  if (!residentAuth) {
    container.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:12px;">\uD83D\uDD12</div><div style="font-size:15px;margin-bottom:16px;">请登录后参与问卷</div><button class="poll-btn" onclick="showLogin()">业主登录</button></div>';
    return;
  }

  var timeCheck = isPollActive(p);
  if (!timeCheck.ok) {
    container.innerHTML = '<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:12px;">\u23F0</div><div style="font-size:15px;margin-bottom:8px;">' + timeCheck.reason + '</div><div style="font-size:13px;color:var(--text-secondary);">投票时间：' + (p.startDate||'--') + ' 至 ' + (p.endDate||'--') + '</div></div>';
    return;
  }

  try {
    const responses = await loadPollResponses(p.id);
    const hasVoted = responses.some(function(r) { return r.residentRoom === residentAuth.roomNo; });
    if (hasVoted) {
      container.innerHTML = renderLocalPollResults(p, responses, true);
    } else {
      container.innerHTML = renderLocalPollForm(p);
    }
  } catch(e) {
    console.error('initLocalPoll error', e);
    container.innerHTML = renderLocalPollForm(p);
  }
}

function renderLocalPollForm(p) {
  let h = '<form id="localPollForm" onsubmit="event.preventDefault();">';
  (p.questions || []).forEach(function(q, idx) {
    h += '<div style="margin-bottom:20px;padding:16px;background:#fafbfc;border-radius:8px;border:1px solid #eef0f2;">';
    h += '<div style="font-weight:600;margin-bottom:10px;">' + (idx+1) + '. ' + escapeHtml(q.title) + (q.required ? '<span style="color:#c62828;margin-left:4px;">*</span>' : '') + '</div>';
    if (q.type === 'single') {
      (q.options || []).forEach(function(opt) {
        h += '<label style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;cursor:pointer;transition:background .2s;" onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">';
        h += '<input type="radio" name="q_' + q.id + '" value="' + escapeHtml(opt) + '" style="width:auto;" ' + (q.required ? 'required' : '') + '>';
        h += '<span style="font-size:14px;">' + escapeHtml(opt) + '</span></label>';
      });
    } else if (q.type === 'multiple') {
      (q.options || []).forEach(function(opt) {
        h += '<label style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:6px;cursor:pointer;transition:background .2s;" onmouseover="this.style.background=\'#f0f2f5\'" onmouseout="this.style.background=\'transparent\'">';
        h += '<input type="checkbox" name="q_' + q.id + '" value="' + escapeHtml(opt) + '" style="width:auto;">';
        h += '<span style="font-size:14px;">' + escapeHtml(opt) + '</span></label>';
      });
    } else if (q.type === 'text') {
      h += '<textarea name="q_' + q.id + '" rows="3" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:14px;" placeholder="请输入您的回答"></textarea>';
    }
    h += '</div>';
  });
  h += '<button type="button" class="poll-btn" onclick="submitLocalPoll(\'' + p.id + '\')">提交问卷</button>';
  h += '</form>';
  return h;
}

function renderLocalPollResults(p, responses, hasVoted) {
  var residents = getPollResidents(p);
  var roomAreaMap = {};
  var totalCommunityArea = 0;

  // 辅助：安全存储面积到 roomAreaMap（多种key格式）
  function addToRoomMap(r, area) {
    if (area <= 0) return;
    var roomNo = getResidentRoomNo(r);
    if (roomNo) {
      roomAreaMap[roomNo] = area;
      roomAreaMap[roomNo.replace(/\s/g, '')] = area; // 去空格版本
    }
    // 同时用 name / residentName 作为备选key（应对 residentAuth.roomNo 存的是姓名的情况）
    if (r.name) {
      var n = String(r.name).trim();
      if (n) roomAreaMap[n] = area;
    }
    if (r.residentName) {
      var rn = String(r.residentName).trim();
      if (rn) roomAreaMap[rn] = area;
    }
  }

  residents.forEach(function(r) {
    addToRoomMap(r, getResidentArea(r));
    totalCommunityArea += getResidentArea(r);
  });
  // 从 appData.residents 补充缺失的面积数据
  if (typeof appData !== 'undefined' && appData.residents && Array.isArray(appData.residents)) {
    appData.residents.forEach(function(r) {
      var roomNo = getResidentRoomNo(r);
      if (roomNo && roomAreaMap[roomNo] > 0) return; // 已有正面积，跳过
      var area = getResidentArea(r);
      if (area > 0) {
        addToRoomMap(r, area);
        totalCommunityArea += area;
      }
    });
  }
  // 若清册未加载或面积解析失败，使用后台同步数据
  if (totalCommunityArea <= 0) {
    if (p.rollStats && p.rollStats.totalArea > 0) totalCommunityArea = p.rollStats.totalArea;
    else if (p.voteResult && p.voteResult.totalArea > 0) totalCommunityArea = p.voteResult.totalArea;
    else if (p.results && p.results.totalArea > 0) totalCommunityArea = p.results.totalArea;
    else if (p.results && p.results.summary && typeof p.results.summary === 'string') {
      var m3 = p.results.summary.match(/总面积\s*(\d+(?:\.\d+)?)/);
      if (m3) totalCommunityArea = parseFloat(m3[1]);
    }
    else if (p.stats && p.stats.totalArea > 0) totalCommunityArea = p.stats.totalArea;
    else { var fa = getPollAreaTarget(p); if (fa > 0) totalCommunityArea = fa; }
  }
  // 辅助：根据 response 查找面积（支持 roomNo / name 多种匹配）
  function getResponseArea(response) {
    // 1. 优先使用记录自带的面积字段
    if (response.area != null) {
      var pa = parseFloat(response.area);
      if (!isNaN(pa) && pa > 0) return pa;
    }
    var room = String(response.residentRoom || response.roomNo || '').trim();
    var name = String(response.residentName || response.name || '').trim();
    // 2. 从 roomAreaMap 查找
    if (room) {
      if (roomAreaMap[room] > 0) return roomAreaMap[room];
      if (roomAreaMap[room.replace(/\s/g, '')] > 0) return roomAreaMap[room.replace(/\s/g, '')];
    }
    if (name && roomAreaMap[name] > 0) return roomAreaMap[name];
    // 3. 从所有可用 resident 数据源遍历匹配
    var sources = [];
    if (typeof residents !== 'undefined' && Array.isArray(residents)) sources.push(residents);
    if (typeof appData !== 'undefined' && appData.residents && Array.isArray(appData.residents)) sources.push(appData.residents);
    for (var s = 0; s < sources.length; s++) {
      var list = sources[s];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var rRoom = getResidentRoomNo(r);
        var rName = String(r.name || r.residentName || '').trim();
        var matchRoom = room && rRoom && (rRoom === room || rRoom.replace(/\s/g, '') === room.replace(/\s/g, ''));
        var matchName = name && rName && rName === name;
        if (matchRoom || matchName) {
          var area = getResidentArea(r);
          if (area > 0) {
            if (room) roomAreaMap[room] = area;
            if (name) roomAreaMap[name] = area;
            return area;
          }
        }
      }
    }
    return 0;
  }

  var votedArea = 0;
  responses.forEach(function(r) {
    votedArea += getResponseArea(r);
  });
  // ===== 同步后端权威面积数据（解决前端 residents 数据缺失导致的面积不一致）=====
  var vr = p.voteResult || p.results || null;
  var backendAgreeArea = 0;
  var backendVotedArea = 0;
  if (vr) {
    var aa = vr.agreeArea;
    if (aa == null) aa = vr.yesArea;
    if (aa == null) aa = vr.赞成Area;
    if (aa == null) aa = vr.supportArea;
    if (aa == null) aa = vr.赞同Area;
    if (aa == null) aa = vr.认可Area;
    if (aa == null) aa = vr.passArea;
    if (aa == null) aa = vr.通过Area;
    if (aa != null) backendAgreeArea = parseFloat(aa) || 0;

    var va = vr.areaCurrent || vr.currentArea || vr.participationArea || vr.votedArea || vr.participatingArea;
    if (va == null && vr.summary && typeof vr.summary === 'string') {
      var mBackend = vr.summary.match(/面积\s*(\d+(?:\.\d+)?)\s*㎡/);
      if (mBackend) va = parseFloat(mBackend[1]);
    }
    if (va != null) backendVotedArea = parseFloat(va) || 0;
  }
  if (backendVotedArea <= 0) backendVotedArea = getPollAreaCurrent(p);

  // 如果后端提供了参与面积，且与前端计算的不一致（差异>1㎡），以后端为准
  if (backendVotedArea > 0 && Math.abs(backendVotedArea - votedArea) > 1) {
    votedArea = backendVotedArea;
  }
  if (votedArea <= 0) {
    if (p.rollStats && p.rollStats.currentArea > 0) votedArea = p.rollStats.currentArea;
    else if (p.voteResult && p.voteResult.areaCurrent > 0) votedArea = p.voteResult.areaCurrent;
    else if (p.voteResult && p.voteResult.participationArea > 0) votedArea = p.voteResult.participationArea;
    else if (p.results && p.results.areaCurrent > 0) votedArea = p.results.areaCurrent;
    else if (p.results && p.results.participationArea > 0) votedArea = p.results.participationArea;
    else if (p.results && p.results.participatingArea > 0) votedArea = p.results.participatingArea;
    else if (p.results && p.results.summary && typeof p.results.summary === 'string') {
      var m2 = p.results.summary.match(/面积\s*(\d+(?:\.\d+)?)\s*㎡/);
      if (m2) votedArea = parseFloat(m2[1]);
    }
    else if (p.stats && p.stats.areaCurrent > 0) votedArea = p.stats.areaCurrent;
    else { var fc = getPollAreaCurrent(p); if (fc > 0) votedArea = fc; }
  }

  let h = '<div style="margin-top:8px;">';
  if (hasVoted && p.status === '进行中') {
    h += '<div style="margin-bottom:16px;padding:12px;background:#e8f5e9;border-radius:8px;border-left:4px solid var(--success);font-weight:500;">\u2705 您已完成问卷，以下是当前统计结果</div>';
  }
  h += '<div style="font-weight:600;margin-bottom:16px;font-size:16px;">\uD83D\uDCCA 投票结果</div>';

  var peopleTarget = getPollPeopleTarget(p);
  if (peopleTarget === 0) peopleTarget = 1;
  var peoplePct = peopleTarget > 0 ? Math.round(responses.length / peopleTarget * 100) : 0;
  var areaParticipationRate = totalCommunityArea > 0 ? Math.round(votedArea / totalCommunityArea * 100) : 0;

  h += '<div style="margin-bottom:16px;display:flex;gap:12px;flex-wrap:wrap;">';
  h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e8eaf6;">';
  h += '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">\uD83D\uDC65 人数参与</div>';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  h += '<span style="font-size:12px;color:var(--text-secondary);">' + responses.length + ' / ' + peopleTarget + ' 户</span>';
  h += '<span style="font-size:15px;font-weight:700;color:var(--primary);">' + peoplePct + '%</span>';
  h += '</div>';
  h += '<div class="poll-progress" style="height:14px;"><div class="poll-progress-bar" style="width:' + peoplePct + '%;font-size:9px;">' + (peoplePct > 8 ? peoplePct + '%' : '') + '</div></div>';
  h += '</div>';

  if (totalCommunityArea > 0) {
    h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e3f2fd;">';
    h += '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">\uD83D\uDCD0 面积参与</div>';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    h += '<span style="font-size:12px;color:var(--text-secondary);">' + votedArea + ' / ' + totalCommunityArea + ' ㎡</span>';
    h += '<span style="font-size:15px;font-weight:700;color:#1976d2;">' + areaParticipationRate + '%</span>';
    h += '</div>';
    h += '<div class="poll-progress" style="height:14px;background:#e3f2fd;"><div class="poll-progress-bar" style="width:' + areaParticipationRate + '%;background:linear-gradient(90deg,#1976d2,#42a5f5);font-size:9px;">' + (areaParticipationRate > 8 ? areaParticipationRate + '%' : '') + '</div></div>';
    h += '</div>';
  } else {
    h += '<div style="flex:1;min-width:240px;background:#fff;border-radius:8px;padding:14px;border:1px solid #e3f2fd;">';
    h += '<div style="font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">\uD83D\uDCD0 面积参与</div>';
    h += '<div style="font-size:12px;color:#999;text-align:center;padding:10px 0;">未配置业主房屋面积数据</div>';
    h += '</div>';
  }
  h += '</div>';

  (p.questions || []).forEach(function(q, idx) {
    h += '<div style="margin-bottom:24px;padding:16px;background:#fafbfc;border-radius:8px;border:1px solid #eef0f2;">';
    h += '<div style="font-weight:600;margin-bottom:12px;">' + (idx+1) + '. ' + escapeHtml(q.title) + '</div>';
    if (q.type === 'text') {
      const texts = responses.map(function(r) {
        const a = r.answers.find(function(x) { return x.questionId === q.id; });
        return a ? a.value : '';
      }).filter(function(v) { return v; });
      h += '<div style="max-height:200px;overflow-y:auto;">';
      texts.forEach(function(t) {
        h += '<div style="padding:8px 12px;background:#fff;border-radius:6px;margin-bottom:6px;font-size:13px;border-left:3px solid var(--primary);">' + escapeHtml(t) + '</div>';
      });
      h += '</div>';
    } else {
      const counts = {};
      (q.options || []).forEach(function(opt) { counts[opt] = 0; });
      responses.forEach(function(r) {
        const a = r.answers.find(function(x) { return x.questionId === q.id; });
        if (!a || !a.value) return;
        if (Array.isArray(a.value)) {
          a.value.forEach(function(v) { if (counts[v] !== undefined) counts[v]++; });
        } else {
          if (counts[a.value] !== undefined) counts[a.value]++;
        }
      });
      const total = responses.length || 1;

      var optionAreaCounts = {};
      var totalQuestionArea = 0;
      if (totalCommunityArea > 0) {
        responses.forEach(function(r) {
          var a = r.answers.find(function(x) { return x.questionId === q.id; });
          if (!a || !a.value) return;
          var area = getResponseArea(r);
          totalQuestionArea += area;
          if (Array.isArray(a.value)) {
            a.value.forEach(function(v) {
              if (optionAreaCounts[v] === undefined) optionAreaCounts[v] = 0;
              optionAreaCounts[v] += area;
            });
          } else {
            if (optionAreaCounts[a.value] === undefined) optionAreaCounts[a.value] = 0;
            optionAreaCounts[a.value] += area;
          }
        });
      }

      // 若选项面积计算失败但 votedArea 正确，按票数比例分配面积
      if (totalQuestionArea <= 0 && votedArea > 0) {
        totalQuestionArea = votedArea;
        (q.options || []).forEach(function(opt) {
          if (counts[opt] > 0) {
            optionAreaCounts[opt] = Math.round(votedArea * (counts[opt] / total));
          }
        });
      }
      // 若后端提供了 agreeArea，同步到对应选项，确保与上方计票结果一致
      if (backendAgreeArea > 0 && votedArea > 0) {
        var agreeOpt = null, opposeOpt = null, otherOpts = [];
        (q.options || []).forEach(function(opt) {
          var lower = String(opt).toLowerCase();
          if (lower.indexOf('同意') !== -1 || lower.indexOf('赞成') !== -1 || lower.indexOf('支持') !== -1 || lower.indexOf('通过') !== -1) {
            agreeOpt = opt;
          } else if (lower.indexOf('反对') !== -1 || lower.indexOf('否决') !== -1 || lower.indexOf('不同意') !== -1 || lower.indexOf('不赞成') !== -1) {
            opposeOpt = opt;
          } else {
            otherOpts.push(opt);
          }
        });
        if (agreeOpt) {
          optionAreaCounts[agreeOpt] = backendAgreeArea;
          var remaining = Math.max(0, votedArea - backendAgreeArea);
          if (opposeOpt && otherOpts.length === 0) {
            // 仅同意/反对两选项
            optionAreaCounts[opposeOpt] = remaining;
          } else if (opposeOpt) {
            optionAreaCounts[opposeOpt] = remaining;
            otherOpts.forEach(function(opt) { optionAreaCounts[opt] = 0; });
          } else if (otherOpts.length > 0) {
            // 无明确反对项，剩余面积按票数比例分配给其他选项
            var otherTotalCount = otherOpts.reduce(function(s, o) { return s + (counts[o] || 0); }, 0);
            otherOpts.forEach(function(opt) {
              optionAreaCounts[opt] = otherTotalCount > 0 ? Math.round(remaining * ((counts[opt] || 0) / otherTotalCount)) : 0;
            });
          }
          totalQuestionArea = votedArea;
        }
      }

      (q.options || []).forEach(function(opt) {
        const c = counts[opt] || 0;
        const pct = Math.round(c / total * 100);
        const optArea = optionAreaCounts[opt] || 0;
        const areaPct = votedArea > 0 ? Math.round(optArea / votedArea * 100) : 0;

        h += '<div style="margin-bottom:14px;padding:12px;background:#fff;border-radius:8px;border:1px solid #f0f0f0;">';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        h += '<span style="font-size:14px;font-weight:500;">' + escapeHtml(opt) + '</span>';
        h += '<span style="font-size:13px;color:var(--text-secondary);">' + c + '票 (' + pct + '%)</span>';
        h += '</div>';
        h += '<div style="background:#f5f5f5;border-radius:6px;height:18px;overflow:hidden;margin-bottom:6px;">';
        h += '<div style="height:100%;background:linear-gradient(90deg,var(--primary),var(--primary-light));border-radius:6px;width:' + pct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:6px;color:#fff;font-size:10px;font-weight:600;">' + (pct > 8 ? pct + '%' : '') + '</div>';
        h += '</div>';

        if (totalCommunityArea > 0) {
          h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">';
          h += '<span style="font-size:12px;color:var(--text-secondary);">\uD83D\uDCD0 面积：' + optArea + '㎡ (' + areaPct + '%)</span>';
          h += '</div>';
          h += '<div style="background:#e3f2fd;border-radius:6px;height:12px;overflow:hidden;">';
          h += '<div style="height:100%;background:linear-gradient(90deg,#1976d2,#42a5f5);border-radius:6px;width:' + areaPct + '%;display:flex;align-items:center;justify-content:flex-end;padding-right:4px;color:#fff;font-size:9px;font-weight:600;">' + (areaPct > 15 ? areaPct + '%' : '') + '</div>';
          h += '</div>';
        }
        h += '</div>';
      });
    }
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function isPollActive(p) {
  var now = new Date();
  var start = p.startDate ? new Date(p.startDate.replace(/-/g, '/')) : null;
  var end = p.endDate ? new Date(p.endDate.replace(/-/g, '/')) : null;
  if (end) { end.setHours(23, 59, 59, 999); }
  if (start && now < start) return { ok: false, reason: '投票尚未开始，开始时间为 ' + p.startDate };
  if (end && now > end) return { ok: false, reason: '投票已结束，截止时间为 ' + p.endDate };
  return { ok: true };
}

async function submitLocalPoll(pollId) {
  if (!residentAuth) { showLogin(); return; }
  const p = (appData.polls||[]).find(function(x) { return x.id === pollId; });
  if (!p) { alert('投票不存在'); return; }

  var timeCheck = isPollActive(p);
  if (!timeCheck.ok) { alert('\u23F0 ' + timeCheck.reason); return; }

  showPageLoading(true);
  try {
    const responses = await loadPollResponses(pollId);
    const hasVoted = responses.some(function(r) { return r.residentRoom === residentAuth.roomNo; });
    if (hasVoted) {
      alert('\u2705 您已参与过该投票，无需重复提交。');
      navigate('poll-detail', pollId);
      return;
    }
  } catch(e) {
    // 读取失败继续
  }

  const answers = [];
  let valid = true;
  (p.questions || []).forEach(function(q) {
    if (q.type === 'single') {
      const el = document.querySelector('input[name="q_' + q.id + '"]:checked');
      if (q.required && !el) { valid = false; }
      answers.push({ questionId: q.id, value: el ? el.value : '' });
    } else if (q.type === 'multiple') {
      const els = Array.from(document.querySelectorAll('input[name="q_' + q.id + '"]:checked'));
      if (q.required && !els.length) { valid = false; }
      answers.push({ questionId: q.id, value: els.map(function(e) { return e.value; }) });
    } else if (q.type === 'text') {
      const el = document.querySelector('textarea[name="q_' + q.id + '"]');
      if (q.required && !el.value.trim()) { valid = false; }
      answers.push({ questionId: q.id, value: el ? el.value.trim() : '' });
    }
  });
  if (!valid) { alert('请填写所有必填项'); showPageLoading(false); return; }

  try {
    const d = new Date();
    const path = 'polls-responses/' + d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '.json';
    let list = [];
    try { list = await workerRead(path); } catch(e) { list = []; }
    var alreadyVoted = list.some(function(r) { return r.pollId === pollId && r.residentRoom === residentAuth.roomNo; });
    if (alreadyVoted) {
      alert('\u2705 您已参与过该投票，无需重复提交。');
      navigate('poll-detail', pollId);
      return;
    }
    list.push({
      id: 'pr-' + Date.now() + '-' + Math.random().toString(36).substr(2,4),
      pollId: pollId,
      residentRoom: residentAuth.roomNo,
      residentName: residentAuth.name,
      answers: answers,
      createdAt: new Date().toISOString()
    });
    await workerWrite(path, list, '业主提交问卷 ' + pollId);
    // 同步更新 polls.json 中的进度
    try {
      const pollsList = appData.polls || [];
      const pIdx = pollsList.findIndex(function(x) { return x.id === pollId; });
      if (pIdx >= 0 && pollsList[pIdx].progress) {
        pollsList[pIdx].progress.current = (pollsList[pIdx].progress.current || 0) + 1;
        // 更新面积进度：从投票自身的 residents 或全局 residents 查找
        var voterArea = 0;
        var allResidents = getPollResidents(pollsList[pIdx]);
        if (allResidents.length) {
          var voter = allResidents.find(function(r) { return r.roomNo === residentAuth.roomNo; });
          if (voter) {
            voterArea = getResidentArea(voter);
          }
        }
        pollsList[pIdx].progress.areaCurrent = (pollsList[pIdx].progress.areaCurrent || 0) + voterArea;
        // 如果没有设置面积目标，自动计算
        var totalArea = getCommunityTotalArea(pollsList[pIdx]);
        if (!(pollsList[pIdx].progress.areaTarget > 0) && totalArea > 0) {
          pollsList[pIdx].progress.areaTarget = totalArea;
        }
        await workerWrite('data/polls.json', pollsList, '更新投票进度 ' + pollId);
        appData.polls = pollsList;
      }
    } catch(e2) { console.error('更新进度失败', e2); }
    alert('\u2705 提交成功！');
    navigate('poll-detail', pollId);
  } catch(e) {
    alert('提交失败：' + e.message);
  } finally {
    showPageLoading(false);
  }
}
