/* js/core.js - 核心路由、主题、登录、全局搜索 */

function navigate(page, params) {
  window.location.hash = params ? "#/" + page + "/" + params : "#/" + page;
  setTimeout(render, 0);
}

function getRoute() {
  const h = window.location.hash.replace("#/", "").replace("#", "");
  const p = h.split("/");
  return { page: p[0] || "home", params: p[1] };
}

let _lastRenderedRoute = '';
function render() {
  const r = getRoute();
  const routeKey = r.page + (r.params ? '/' + r.params : '');
  if (routeKey === _lastRenderedRoute) return;
  _lastRenderedRoute = routeKey;

  const main = document.getElementById("main");
  document.querySelectorAll(".header-nav a").forEach(a => a.classList.toggle("active", a.dataset.page === r.page));
  const pages = {
    home: renderHome, announcements: renderAnnouncements, documents: renderDocuments,
    activities: renderActivities, polls: renderPolls, profile: renderProfile,
    "announcement-detail": () => renderAnnouncementDetail(r.params),
    "document-detail": () => renderDocumentDetail(r.params),
    "activity-detail": () => renderActivityDetail(r.params),
    "poll-detail": () => renderPollDetail(r.params),
    "workorder-detail": () => renderWorkorderDetail(r.params),
    "complaint-detail": () => renderComplaintDetail(r.params),
    workorders: renderWorkorders,
    complaints: renderComplaints,
    "submit-workorder": renderSubmitWorkorder,
    "submit-complaint": renderSubmitComplaint
  };
  const fn = pages[r.page] || renderHome;

  const existing = main.querySelector('.page-content');
  if (existing) {
    existing.style.opacity = '0';
    setTimeout(() => {
      main.innerHTML = '<div class="page-content" style="opacity:0">' + fn() + '</div>';
      requestAnimationFrame(() => {
        const el = main.querySelector('.page-content');
        if (el) el.style.opacity = '1';
      });
      if (!r.page.includes('detail')) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 120);
  } else {
    main.innerHTML = '<div class="page-content">' + fn() + '</div>';
    if (!r.page.includes('detail')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

function renderListItem(item, type) {
  let badge = "";
  if (type === "announcement") badge = item.isPinned ? '<span class="list-badge badge-pinned">置顶</span>' : '<span class="list-badge badge-normal">公告</span>';
  else if (type === "document") badge = '<span class="list-badge badge-document">文件</span>';
  else if (type === "activity") badge = '<span class="list-badge badge-activity">' + item.status + '</span>';
  else if (type === "poll") badge = '<span class="list-badge badge-poll">' + item.status + '</span>';
  const detailPages = { announcement: "announcement-detail", document: "document-detail", activity: "activity-detail", poll: "poll-detail" };
  const dateFields = { announcement: "publishDate", document: "publishDate", activity: "date", poll: "endDate" };
  const meta = item.author || item.source || item.location || "";
  return `<div class="list-item" onclick="navigate('${detailPages[type]}','${item.id}')">${badge}<div class="list-content"><div class="list-title">${item.title}</div><div class="list-meta">${item[dateFields[type]]||""} · ${meta}</div></div><div class="list-arrow">›</div></div>`;
}

function showLogin() {
  document.getElementById("loginModal").classList.add("active");
  document.getElementById("loginError").style.display = "none";
}
function hideLogin() {
  document.getElementById("loginModal").classList.remove("active");
}
document.getElementById("loginModal").addEventListener("click", function(e) {
  if (e.target === this) hideLogin();
});

function doLogin() {
  const room = document.getElementById("loginRoom").value.trim();
  const name = document.getElementById("loginName").value.trim();
  const phone = document.getElementById("loginPhone").value.trim();
  const err = document.getElementById("loginError");
  if (!room || !name || !phone) { err.textContent = "请填写完整信息"; err.style.display = "block"; return; }
  const match = (appData.residents||[]).find(r => r.roomNo === room && r.name === name && phone.endsWith(r.phoneSuffix) && r.status === "active");
  if (!match) { err.textContent = "信息不匹配，请联系物业核实"; err.style.display = "block"; return; }
  residentAuth = { isLoggedIn: true, roomNo: match.roomNo, name: match.name, loginTime: new Date().toISOString(), token: Math.random().toString(36).substring(2,18) };
  localStorage.setItem("residentAuth", JSON.stringify(residentAuth));
  hideLogin(); updateUserUI(); render(); alert("✅ 登录成功！");
  if (window._pendingPollId) {
    const p = (appData.polls||[]).find(x => x.id === window._pendingPollId);
    if (p && p.tencentUrl) { setTimeout(() => window.open(p.tencentUrl, '_blank'), 300); }
    window._pendingPollId = null;
  }
}

function doLogout() {
  if (confirm("确定要退出登录吗？")) {
    localStorage.removeItem("residentAuth"); residentAuth = null;
    updateUserUI(); navigate("home");
  }
}

function updateUserUI() {
  const btn = document.getElementById("loginBtn");
  const span = document.getElementById("userName");
  if (residentAuth) { btn.textContent = "退出"; btn.onclick = doLogout; span.textContent = residentAuth.name; span.style.cursor="pointer"; span.style.textDecoration="underline"; span.onclick=function(){navigate('profile');}; span.title="点击打开个人中心"; }
  else { btn.textContent = "业主登录"; btn.onclick = showLogin; span.textContent = ""; span.style.cursor=""; span.style.textDecoration=""; span.onclick=null; span.title=""; }
}

let carouselTimer = null;
function initCarousel() {
  if (carouselTimer) clearInterval(carouselTimer);
  const items = document.querySelectorAll(".carousel-item");
  const dots = document.querySelectorAll(".carousel-dots span");
  if (items.length <= 1) return;
  let cur = 0;
  carouselTimer = setInterval(() => {
    items[cur].classList.remove("active"); if (dots[cur]) dots[cur].classList.remove("active");
    cur = (cur + 1) % items.length;
    items[cur].classList.add("active"); if (dots[cur]) dots[cur].classList.add("active");
  }, 4000);
}
function goCarousel(index) {
  const items = document.querySelectorAll(".carousel-item");
  const dots = document.querySelectorAll(".carousel-dots span");
  items.forEach((item,i) => item.classList.toggle("active", i === index));
  dots.forEach((dot,i) => dot.classList.toggle("active", i === index));
}

function doGlobalSearch(keyword) {
  var dropdown = document.getElementById('globalSearchDropdown');
  if (!dropdown) return;
  if (!keyword || keyword.length < 1) { dropdown.classList.remove('active'); return; }
  var kw = keyword.toLowerCase();
  var results = [];
  (appData.announcements || []).forEach(function(a) {
    if (a.title && a.title.toLowerCase().indexOf(kw) !== -1) {
      results.push({ type: '公告', title: a.title, page: 'announcement-detail', id: a.id, meta: (a.publishDate || '') + ' · ' + (a.author || '') });
    }
  });
  (appData.activities || []).forEach(function(a) {
    if (a.title && a.title.toLowerCase().indexOf(kw) !== -1) {
      results.push({ type: '活动', title: a.title, page: 'activity-detail', id: a.id, meta: (a.date || '') + ' · ' + (a.location || '') });
    }
  });
  (appData.documents || []).forEach(function(d) {
    if (d.title && d.title.toLowerCase().indexOf(kw) !== -1) {
      results.push({ type: '文件', title: d.title, page: 'document-detail', id: d.id, meta: (d.publishDate || '') + ' · ' + (d.source || '') });
    }
  });
  (appData.polls || []).forEach(function(p) {
    if (p.title && p.title.toLowerCase().indexOf(kw) !== -1) {
      results.push({ type: '投票', title: p.title, page: 'poll-detail', id: p.id, meta: p.status + ' · ' + (p.endDate || '') });
    }
  });
  if (!results.length) {
    dropdown.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px;">未找到相关内容</div>';
  } else {
    var h = '';
    var types = ['公告', '活动', '文件', '投票'];
    types.forEach(function(t) {
      var items = results.filter(function(r) { return r.type === t; });
      if (items.length) {
        h += '<div class="search-section">' + t + '</div>';
        items.slice(0, 4).forEach(function(item) {
          h += '<div class="search-item" onclick="navigate(\'' + item.page + '\',\'' + item.id + '\');closeSearchDropdown();">';
          h += '<div class="search-item-title">' + escapeHtml(item.title) + '</div>';
          h += '<div class="search-item-meta">' + item.meta + '</div></div>';
        });
      }
    });
    dropdown.innerHTML = h;
  }
  dropdown.classList.add('active');
}
function closeSearchDropdown() {
  var d = document.getElementById('globalSearchDropdown');
  var inp = document.getElementById('globalSearchInput');
  if (d) d.classList.remove('active');
  if (inp) inp.value = '';
}

window.addEventListener("hashchange", () => {
  const r = getRoute();
  if (isRealtimePage(r.page)) {
    loadData().then(() => render()).catch(() => render());
  } else {
    render();
  }
});
