/* js/pages/activities.js - 社区动态 */

function renderActivities() {
  const list = appData.activities || [];
  return '<div class="card"><div class="card-title"><span class="icon">🎉</span>社区动态</div>' + (list.length ? list.map(a => renderListItem(a, "activity")).join("") : '<div class="empty">暂无动态</div>') + '</div>';
}

function renderActivityDetail(id) {
  const a = (appData.activities||[]).find(x => x.id === id);
  if (!a) return '<div class="empty">动态不存在</div>';
  const cleanArr = (arr) => (arr || []).filter(u => u && typeof u === 'string' && !u.startsWith('blob:'));
  a.images = cleanArr(a.images);
  a.videos = cleanArr(a.videos);
  a.videoLinks = cleanArr(a.videoLinks);
  a.adminImages = cleanArr(a.adminImages);
  if (a.coverImage && a.coverImage.startsWith('blob:')) a.coverImage = '';
  if (a.videoUrl && a.videoUrl.startsWith('blob:')) a.videoUrl = '';

  let h = '<div class="card" style="padding:0;overflow:hidden;">';
  h += '<div style="padding:24px 24px 0;">';
  h += '<div class="detail-header" style="margin-bottom:0;"><h1>' + escapeHtml(a.title||'') + '</h1></div>';
  h += '</div>';

  h += '<div class="activity-meta-bar">';
  h += '<div class="meta-item">📅 ' + (a.date||"--") + '</div>';
  h += '<div class="meta-item">📍 ' + (a.location||"--") + '</div>';
  if (a.status) h += '<div class="meta-item">🏷️ ' + a.status + '</div>';
  h += '</div>';

  h += '<div style="padding:0 24px 24px;">';
  var contentHtml = (a.content || "").trim();
  if (!contentHtml || contentHtml === '<p></p>' || contentHtml === '<div></div>') {
    contentHtml = '<p style="color:var(--text-secondary);text-align:center;padding:20px 0;">📝 该动态暂无文字描述</p>';
  }
  h += '<div class="activity-content-box"><div class="detail-content">' + contentHtml + '</div></div>';

  // Videos: deduplicate, local files use native <video>, platforms use iframe embed
  const allVideos = [];
  const seenUrls = new Set();
  function addVideo(url, isLocal) {
    if (!url || !url.trim()) return;
    var u = url.trim();
    var lowerU = u.toLowerCase();
    if (seenUrls.has(lowerU)) return;
    seenUrls.add(lowerU);
    allVideos.push({url: u, isLocal: isLocal});
  }
  if (a.videos && a.videos.length) {
    a.videos.forEach(function(v) { addVideo(v, true); });
  }
  if (a.videoUrl && a.videoUrl.trim()) {
    addVideo(a.videoUrl, false);
  }
  if (a.videoLinks && a.videoLinks.length) {
    a.videoLinks.forEach(function(v) { addVideo(v, false); });
  }
  if (allVideos.length > 0) {
    h += '<div style="margin-top:20px;">';
    h += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">🎬 活动视频 (' + allVideos.length + '个)</div>';
    allVideos.forEach(function(video, idx) {
      var vidId = 'act-vid-' + a.id + '-' + idx;
      h += '<div style="margin:16px 0;">';
      h += renderSingleVideoPlayer(video, vidId, a.coverImage);
      h += '</div>';
    });
    h += '</div>';
  }

  // Images - direct img tags, instant display like announcements
  if (a.images && a.images.length > 0) {
    h += '<div style="margin-top:20px;">';
    h += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">📷 活动图集 (' + a.images.length + '张)</div>';
    if (a.images.length === 1) {
      h += '<img src="' + a.images[0] + '" style="max-width:100%;border-radius:8px;display:block;border:1px solid var(--border);cursor:pointer;" onclick="window.open(this.src)" loading="lazy">';
    } else {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';
      a.images.forEach(function(img) {
        h += '<img src="' + img + '" style="width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open(this.src)" loading="lazy" onerror="this.style.display=\'none\'">';
      });
      h += '</div>';
    }
    h += '</div>';
  }

  // Admin images
  if (a.adminImages && a.adminImages.length > 0) {
    h += '<div style="margin-top:20px;">';
    h += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">📷 补充图集 (' + a.adminImages.length + '张)</div>';
    if (a.adminImages.length === 1) {
      h += '<img src="' + a.adminImages[0] + '" style="max-width:100%;border-radius:8px;display:block;border:1px solid var(--border);cursor:pointer;" onclick="window.open(this.src)" loading="lazy">';
    } else {
      h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">';
      a.adminImages.forEach(function(img) {
        h += '<img src="' + img + '" style="width:100%;height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;" onclick="window.open(this.src)" loading="lazy" onerror="this.style.display=\'none\'">';
      });
      h += '</div>';
    }
    h += '</div>';
  }

  // External links
  const allExternals = [];
  if (a.externalLinks && a.externalLinks.length) allExternals.push(...a.externalLinks);
  if (!allExternals.length && a.externalLink) allExternals.push(a.externalLink);
  if (allExternals.length > 0) {
    h += '<div style="margin-top:20px;">';
    h += '<div style="font-size:14px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--border);">🔗 相关链接</div>';
    allExternals.forEach(function(link) {
      var url = typeof link === 'string' ? link : (link.url || '');
      var title = typeof link === 'string' ? '外部链接' : (link.title || '外部链接');
      if (!url) return;
      h += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f8f9fa;border-radius:8px;margin-bottom:8px;text-decoration:none;color:var(--text);border:1px solid var(--border);">';
      h += '<span style="font-size:20px;">🔗</span>';
      h += '<div style="flex:1;min-width:0;"><div style="font-size:14px;font-weight:500;">' + escapeHtml(title) + '</div>';
      h += '<div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + url + '</div></div>';
      h += '<span style="font-size:18px;color:var(--text-secondary);">→</span>';
      h += '</a>';
    });
    h += '</div>';
  }

  h += '<div class="action-buttons">';
  h += '<button class="action-btn primary" onclick="history.back()">← 返回列表</button>';
  h += '</div>';
  h += '</div></div>';
  return h;
}

function renderSingleVideoPlayer(video, vidId, coverImage) {
  var url = (video && video.url) || '';
  url = url.trim();
  if (!url) return '';

  // Step 1: 强制优先检测平台链接，避免被扩展名/本地文件逻辑误判
  var isPlatformUrl = /bilibili\.com|b23\.tv|youtube\.com|youtu\.be|douyin\.com|iesdouyin\.com|ixigua\.com|weibo\.com|weibo\.cn|v\.qq\.com|youku\.com|iqiyi\.com|channels\.weixin\.qq\.com|weixin\.qq\.com\/sph|finder\.video\.qq\.com|mp\.weixin\.qq\.com/i.test(url);

  if (isPlatformUrl) {
    const embedUrl = getEmbedUrl(url);
    const platform = detectVideoPlatform(url);
    if (embedUrl === null) {
      return renderPlatformRedirectCard(url, platform, coverImage);
    }
    return '<div class="video-wrapper" id="' + vidId + '">' +
      '<div class="video-placeholder" onclick="showVideoPlayer(' + "'" + vidId + "'" + ')">' +
      (coverImage ? '<img src="' + coverImage + '" alt="cover">' :
        '<div style="position:absolute;inset:0;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;">' +
        '<div style="text-align:center;color:#fff;"><div style="font-size:48px;margin-bottom:8px;">' + platform.icon + '</div><div style="font-size:14px;opacity:0.9;">' + platform.name + '</div></div>' +
        '</div>') +
      '<div class="play-btn"></div>' +
      '</div>' +
      '<div class="video-player" id="' + vidId + '-player">' +
      '<button class="video-close" onclick="hideVideoPlayer(' + "'" + vidId + "'" + ')">✕</button>' +
      '<iframe data-src="' + embedUrl + '" src="' + embedUrl + '" allowfullscreen allow="autoplay; fullscreen" style="z-index:1;position:relative;"></iframe>' +
      '</div></div>';
  }

  // Step 2: Detect direct video files by extension, blob, data, or relative path
  var hasVideoExt = /\.(mp4|webm|ogg|ogv|mov|qt|m3u8|mkv|avi|flv|wmv|3gp)(\?.*)?$/i.test(url);
  var isBlobOrData = /^blob:/i.test(url) || /^data:video\//i.test(url);
  var isRelativePath = url.length > 0 && !/^https?:\/\//i.test(url);

  // Step 3: Backend-uploaded files (videos[] array) that are NOT known platforms → native player
  var isBackendFile = video.isLocal && !isPlatformUrl;

  var isDirectVideo = hasVideoExt || isBlobOrData || isRelativePath || isBackendFile;

  if (isDirectVideo) {
    // Native player for direct video files — adaptive aspect ratio, all formats
    var ext = '';
    try { ext = url.split('?')[0].split('.').pop().toLowerCase(); } catch(e) {}
    var mimeMap = {mp4:'video/mp4',webm:'video/webm',ogg:'video/ogg',ogv:'video/ogg',mov:'video/quicktime',qt:'video/quicktime',m3u8:'application/x-mpegURL',mkv:'video/x-matroska',avi:'video/x-msvideo',flv:'video/x-flv',wmv:'video/x-ms-wmv','3gp':'video/3gpp'};
    var mimeType = mimeMap[ext] || 'video/mp4';
    return '<div style="border-radius:12px;overflow:hidden;background:#0a0a0a;box-shadow:0 2px 12px rgba(0,0,0,0.08);">' +
      '<video controls preload="metadata" playsinline webkit-playsinline x5-video-player-type="h5"' +
      (coverImage ? ' poster="' + coverImage + '" ' : '') +
      'style="width:100%;max-height:80vh;display:block;border-radius:12px;background:#0a0a0a;min-height:200px;object-fit:contain;">' +
      '<source src="' + url + '" type="' + mimeType + '">' +
      '您的浏览器不支持视频播放' +
      '</video></div>';
  }

  // Online platform video (Bilibili, YouTube, etc.)
  const embedUrl = getEmbedUrl(url);
  const platform = detectVideoPlatform(url);

  if (embedUrl === null) {
    // Platform that cannot be embedded (Douyin, WeChat video pages, etc.)
    return renderPlatformRedirectCard(url, platform, coverImage);
  }

  // Embed with 16:9 iframe
  return '<div class="video-wrapper" id="' + vidId + '">' +
    '<div class="video-placeholder" onclick="showVideoPlayer(' + "'" + vidId + "'" + ')">' +
    (coverImage ? '<img src="' + coverImage + '" alt="cover">' : 
      '<div style="position:absolute;inset:0;background:linear-gradient(135deg,var(--primary),var(--primary-dark));display:flex;align-items:center;justify-content:center;">' +
      '<div style="text-align:center;color:#fff;"><div style="font-size:48px;margin-bottom:8px;">' + platform.icon + '</div><div style="font-size:14px;opacity:0.9;">' + platform.name + '</div></div>' +
      '</div>') +
    '<div class="play-btn"></div>' +
    '</div>' +
    '<div class="video-player" id="' + vidId + '-player">' +
    '<button class="video-close" onclick="hideVideoPlayer(' + "'" + vidId + "'" + ')">✕</button>' +
    '<iframe data-src="' + embedUrl + '" src="' + embedUrl + '" allowfullscreen allow="autoplay; fullscreen" style="z-index:1;position:relative;"></iframe>' +
    '</div></div>';
}