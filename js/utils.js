/* js/utils.js - 通用工具函数与组件 */

function genWOId(){
  const d=new Date();
  const ds=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return 'WO-'+ds+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
}


function genCPId(){
  const d=new Date();
  const ds=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
  return 'CP-'+ds+'-'+Math.random().toString(36).substr(2,4).toUpperCase();
}


function woStatusBadge(s){
  const map={'待受理':'tag-test','已派单':'badge-announcement','处理中':'badge-poll','待评价':'badge-activity','已完成':'tag-active'};
  return map[s]||'tag-test';
}


function cpStatusBadge(s){
  const map={'待处理':'tag-test','处理中':'badge-poll','已回复':'badge-announcement','已办结':'tag-active'};
  return map[s]||'tag-test';
}


function renderAuthRequired(action){
  return '<div class="card" style="text-align:center;padding:40px;"><div style="font-size:48px;margin-bottom:16px;">🔒</div><div style="font-size:16px;margin-bottom:20px;">请登录后'+action+'</div><button class="poll-btn" onclick="showLogin()">业主登录</button></div>';
}


function showPageLoading(show){
  let el=document.getElementById('pageLoading');
  if(!el){el=document.createElement('div');el.id='pageLoading';el.style.cssText='position:fixed;inset:0;background:rgba(255,255,255,0.85);z-index:3000;display:none;align-items:center;justify-content:center;';el.innerHTML='<div style="width:40px;height:40px;border:3px solid #e0e0e0;border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>';document.body.appendChild(el);}
  el.style.display=show?'flex':'none';
}



function getEmbedUrl(url) {
  if (!url) return url;
  const bvMatch = url.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  if (bvMatch) {
    return 'https://player.bilibili.com/player.html?bvid=' + bvMatch[1] + '&page=1&high_quality=1&danmaku=0&autoplay=0';
  }
  const b23Match = url.match(/b23\.tv\/(\w+)/i);
  if (b23Match) {
    var bvid = b23Match[1];
    if (!bvid.toUpperCase().startsWith('BV')) {
      bvid = 'BV' + bvid;
    }
    return 'https://player.bilibili.com/player.html?bvid=' + bvid + '&page=1&high_quality=1&danmaku=0&autoplay=0';
  }
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (ytMatch) {
    return 'https://www.youtube.com/embed/' + ytMatch[1] + '?rel=0&modestbranding=1&autoplay=0';
  }
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return null;
  if (/channels\.weixin\.qq\.com|weixin\.qq\.com\/sph|finder\.video\.qq\.com|mp\.weixin\.qq\.com/i.test(url)) return null;
  if (/weibo\.com|weibo\.cn/i.test(url)) return null;
  const xgMatch = url.match(/ixigua\.com\/(\d+)/i);
  if (xgMatch) {
    return 'https://www.ixigua.com/embed?autoplay=0&id=' + xgMatch[1];
  }
  const txMatch = url.match(/v\.qq\.com\/x\/cover\/[\w]+\/([\w]+)\.html/i) || url.match(/v\.qq\.com\/x\/page\/([\w]+)\.html/i);
  if (txMatch) {
    return 'https://v.qq.com/txp/iframe/player.html?vid=' + txMatch[1] + '&autoplay=0';
  }
  return url;
}



function showVideoPlayer(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  const player = wrapper.querySelector('.video-player');
  const placeholder = wrapper.querySelector('.video-placeholder');
  const iframe = player ? player.querySelector('iframe') : null;
  if (iframe) {
    const ds = iframe.getAttribute('data-src');
    if (ds && iframe.src !== ds) iframe.src = ds;
  }
  if (player && placeholder) {
    placeholder.style.display = 'none';
    player.style.display = 'block';
    player.classList.add('active');
  }
}



function hideVideoPlayer(wrapperId) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;
  const player = wrapper.querySelector('.video-player');
  const placeholder = wrapper.querySelector('.video-placeholder');
  if (player && placeholder) {
    player.style.display = 'none';
    player.classList.remove('active');
    placeholder.style.display = 'flex';
    // Stop iframe by resetting src to about:blank (preserves data-src for next play)
    const iframe = player.querySelector('iframe');
    if (iframe) {
      iframe.src = 'about:blank';
    }
    const video = player.querySelector('video');
    if (video) { video.pause(); video.currentTime = 0; }
  }
}


function hideVideoLoading(elId) {
  const el = document.getElementById(elId);
  if (el) el.classList.add('hidden');
}



function showVideoError(vidId) {
  const loading = document.getElementById(vidId + '-loading');
  if (loading) loading.classList.add('hidden');
  const error = document.getElementById(vidId + '-error');
  if (error) error.classList.add('active');
}



function initVideoPlayers() {
  document.querySelectorAll('.video-player-native').forEach(function(wrapper) {
    var video = wrapper.querySelector('video');
    var loading = wrapper.querySelector('.video-loading-state');
    var error = wrapper.querySelector('.video-error-state');
    if (!video || !loading) return;
    if (wrapper.dataset.videoInit === '1') return;
    wrapper.dataset.videoInit = '1';

    var hasError = false;
    var hideLoading = function() {
      if (loading) loading.classList.add('hidden');
    };
    var showErr = function(msg) {
      hasError = true;
      if (loading) loading.classList.add('hidden');
      if (error) {
        var txt = error.querySelector('.error-text');
        if (txt && msg) txt.textContent = msg;
        error.classList.add('active');
      }
    };

    // If metadata is already loaded (readyState >= 1), hide loading immediately.
    // This allows the poster image to show right away.
    if (video.readyState >= 1) {
      hideLoading();
      if (video.readyState >= 2) return;
    }

    // Hide loading as soon as any playable data or metadata arrives.
    var onReady = function() { hideLoading(); };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('canplaythrough', onReady);
    video.addEventListener('playing', onReady);

    // Only re-show loading when video is actually playing and stalls.
    video.addEventListener('waiting', function() {
      if (loading && !hasError && !video.paused && !video.ended) {
        var txt = loading.querySelector('.load-text');
        if (txt) txt.textContent = '缓冲中...';
        loading.classList.remove('hidden');
      }
    });

    video.addEventListener('error', function() {
      var msg = '视频加载失败';
      if (video.error) {
        switch(video.error.code) {
          case 1: msg = '视频加载被中断'; break;
          case 2: msg = '网络错误，请检查网络'; break;
          case 3: msg = '视频解码失败（格式可能不支持）'; break;
          case 4: msg = '视频格式不支持或文件损坏'; break;
        }
      }
      showErr(msg);
    });
    video.addEventListener('abort', function() { showErr('视频加载被中断'); });

    // Fast fallback: hide loading after 2s so users can see the native controls
    // and click play even if the video is still fetching metadata.
    setTimeout(function() {
      if (loading && !loading.classList.contains('hidden') && !hasError) {
        hideLoading();
      }
    }, 2000);
  });
}




function showVideoBuffering(vidId) {
  const loading = document.getElementById(vidId + '-loading');
  if (loading) {
    const txt = loading.querySelector('.load-text');
    if (txt) txt.textContent = '缓冲中，请稍候...';
    loading.classList.remove('hidden');
  }
}



function retryVideo(vidId) {
  const wrapper = document.getElementById(vidId);
  if (!wrapper) return;
  const error = document.getElementById(vidId + '-error');
  if (error) error.classList.remove('active');
  const loading = document.getElementById(vidId + '-loading');
  if (loading) {
    const txt = loading.querySelector('.load-text');
    if (txt) txt.textContent = '视频加载中...';
    loading.classList.remove('hidden');
  }
  const video = wrapper.querySelector('video');
  if (video) {
    // Clear init flag so initVideoPlayers will re-bind events after reload
    wrapper.dataset.videoInit = '';
    video.load();
    video.play().catch(function(){});
  }
  // Re-init event bindings after reload
  setTimeout(function() { initVideoPlayers(); }, 100);
}



function renderPlatformRedirectCard(url, platform, coverImage) {
  let h = '<div class="video-wrapper" style="padding-bottom:56.25%;background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);position:relative;cursor:pointer;">';
  h += '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-decoration:none;color:#fff;padding:24px;z-index:10;">';
  if (coverImage) {
    h += '<img src="' + coverImage + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.35;z-index:0;transition:opacity 0.3s;pointer-events:none;" onmouseover="this.style.opacity=0.5" onmouseout="this.style.opacity=0.35">';
  }
  h += '<div style="position:relative;z-index:1;text-align:center;pointer-events:none;">';
  h += '<div style="font-size:52px;margin-bottom:14px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.3));">' + platform.icon + '</div>';
  h += '<div style="font-size:17px;font-weight:600;margin-bottom:6px;">' + platform.name + '</div>';
  h += '<div style="font-size:12px;opacity:0.65;margin-bottom:20px;max-width:260px;line-height:1.5;">该平台的视频受播放策略限制<br>暂不支持站内直接播放</div>';
  h += '<div style="display:inline-flex;align-items:center;gap:6px;padding:11px 26px;background:var(--primary);color:#fff;border-radius:24px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:all 0.2s;pointer-events:none;">';
  h += '前往 ' + platform.name + ' 观看 <span style="font-size:16px;">→</span></div>';
  h += '</div></a></div>';
  return h;
}





function initGallery(gid) {
  const gallery = document.getElementById(gid);
  if (!gallery) return;
  const auto = gallery.dataset.auto === 'true';
  if (!auto) return;
  // Auto advance every 5s
  gallery._timer = setInterval(function() {
    if (gallery.matches(':hover')) return;
    nextSlide(gid);
  }, 5000);
}



function updateGallery(gid) {
  const gallery = document.getElementById(gid);
  if (!gallery) return;
  const container = gallery.querySelector('.gallery-container');
  const dots = gallery.querySelectorAll('.gallery-dots span');
  const counter = gallery.querySelector('.gallery-counter');
  const idx = parseInt(gallery.dataset.index || '0');
  const total = parseInt(gallery.dataset.total || '1');
  if (container) container.style.transform = 'translateX(-' + (idx * 100) + '%)';
  dots.forEach(function(d, i) { d.classList.toggle('active', i === idx); });
  if (counter) counter.textContent = (idx + 1) + ' / ' + total;
}



function nextSlide(gid, event) {
  if (event) event.stopPropagation();
  const gallery = document.getElementById(gid);
  if (!gallery) return;
  const total = parseInt(gallery.dataset.total || '1');
  let idx = parseInt(gallery.dataset.index || '0');
  idx = (idx + 1) % total;
  gallery.dataset.index = idx;
  updateGallery(gid);
}



function prevSlide(gid, event) {
  if (event) event.stopPropagation();
  const gallery = document.getElementById(gid);
  if (!gallery) return;
  const total = parseInt(gallery.dataset.total || '1');
  let idx = parseInt(gallery.dataset.index || '0');
  idx = (idx - 1 + total) % total;
  gallery.dataset.index = idx;
  updateGallery(gid);
}



function goToSlide(gid, index, event) {
  if (event) event.stopPropagation();
  const gallery = document.getElementById(gid);
  if (!gallery) return;
  gallery.dataset.index = index;
  updateGallery(gid);
}



function detectVideoPlatform(url) {
  if (!url) return { name: '未知', icon: '📹' };
  if (/bilibili\.com|b23\.tv/i.test(url)) return { name: '哔哩哔哩', icon: '📺' };
  if (/youtube\.com|youtu\.be/i.test(url)) return { name: 'YouTube', icon: '▶️' };
  if (/douyin\.com|iesdouyin\.com/i.test(url)) return { name: '抖音', icon: '🎵' };
  if (/ixigua\.com/i.test(url)) return { name: '西瓜视频', icon: '🍉' };
  if (/weibo\.com|weibo\.cn/i.test(url)) return { name: '微博', icon: '📱' };
  if (/qq\.com\/x\/cover|v\.qq\.com/i.test(url)) return { name: '腾讯视频', icon: '📺' };
  if (/youku\.com/i.test(url)) return { name: '优酷', icon: '👁️' };
  if (/iqiyi\.com/i.test(url)) return { name: '爱奇艺', icon: '▶️' };
  if (/channels\.weixin\.qq\.com|weixin\.qq\.com\/sph|finder\.video\.qq\.com|mp\.weixin\.qq\.com/i.test(url)) return { name: '微信视频', icon: '💬' };
  return { name: '外部视频', icon: '📹' };
}



function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch(e) {
    return url.substring(0, 30) + '...';
  }
}



function switchVideoTab(tabId, idx) {
  const tab = document.getElementById(tabId);
  if (!tab) return;
  // Stop all videos in inactive tabs before switching
  tab.querySelectorAll('.video-tab-content').forEach(function(c, i) {
    if (i !== idx) {
      c.querySelectorAll('video').forEach(function(v) { v.pause(); v.currentTime = 0; });
      c.querySelectorAll('iframe').forEach(function(f) {
        var src = f.getAttribute('data-src') || f.src;
        if (src && src !== 'about:blank') { f.src = 'about:blank'; }
      });
      // Also hide any active video players and show placeholders
      c.querySelectorAll('.video-player').forEach(function(p) {
        p.style.display = 'none'; p.classList.remove('active');
      });
      c.querySelectorAll('.video-placeholder').forEach(function(p) {
        p.style.display = 'flex';
      });
    }
  });
  tab.querySelectorAll('.video-tab-header').forEach((h, i) => h.classList.toggle('active', i === idx));
  tab.querySelectorAll('.video-tab-content').forEach((c, i) => c.classList.toggle('active', i === idx));
}



function openExternalModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}



function closeExternalModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    const iframe = modal.querySelector('iframe');
    if (iframe) {
      const src = iframe.src;
      iframe.src = '';
      setTimeout(() => { iframe.src = src; }, 100);
    }
  }
}



function renderInlineMedia(htmlStr) {
  if (!htmlStr) return htmlStr;
  htmlStr = htmlStr.replace(/(https?:\/\/[^\s"<>]+\.(jpg|jpeg|png|gif|webp|bmp))/gi, function(url) {
    if (htmlStr.includes('src="' + url + '"') || htmlStr.includes("src='" + url + "'")) return url;
    return '<img src="' + url + '" style="max-width:100%;border-radius:8px;margin:8px 0;display:block;border:1px solid var(--border);" loading="lazy" onerror="this.style.display=\'none\'">';
  });
  htmlStr = htmlStr.replace(/(https?:\/\/[^\s"<>]+\.pdf)/gi, function(url) {
    if (htmlStr.includes('src="' + url + '"') || htmlStr.includes("src='" + url + "'")) return url;
    return '<iframe src="' + url + '" style="width:100%;height:500px;border:none;border-radius:8px;margin:8px 0;border:1px solid var(--border);" title="PDF预览" loading="lazy"></iframe>';
  });
  return htmlStr;
}




function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}


function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}


function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0") + " " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}



function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}



function compressImage(file, options) {
  options = options || {};
  var maxWidth = options.maxWidth || 800;
  var maxHeight = options.maxHeight || 800;
  var quality = options.quality || 0.4;
  var maxSize = options.maxSize || 50 * 1024;
  return new Promise(function(resolve, reject) {
    if (!file || !file.type.match(/image.*/)) { resolve(file); return; }
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function() {
      URL.revokeObjectURL(url);
      var width = img.width, height = img.height;
      if (width > maxWidth || height > maxHeight) {
        var ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      function toBlob(q, cb) {
        canvas.toBlob(function(blob) { cb(blob); }, 'image/jpeg', q);
      }
      function tryCompress(q) {
        toBlob(q, function(blob) {
          if (!blob) { reject(new Error('压缩失败')); return; }
          if (blob.size > maxSize && q > 0.3) {
            tryCompress(Math.max(q - 0.15, 0.3));
          } else {
            var newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
            var newFile = new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() });
            resolve(newFile);
          }
        });
      }
      tryCompress(quality);
    };
    img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}



function renderPhotoGallery(images, title, color) {
  if (!images || !images.length) return '';
  color = color || 'var(--primary)';
  var gid = 'pg-' + Math.random().toString(36).substr(2, 6);
  var h = '<div style="margin-top:16px;" id="' + gid + '">';
  h += '<div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:10px;display:flex;align-items:center;gap:6px;">';
  h += '<span style="display:inline-block;width:4px;height:14px;background:' + color + ';border-radius:2px;"></span>';
  h += escapeHtml(title) + ' <span style="font-weight:400;color:#999;">(' + images.length + '张)</span></div>';
  h += '<div class="photo-grid">';
  images.forEach(function(url, idx) {
    var safeUrl = url.replace(/'/g, "\'");
    var thumbUrl = url;
    var fallbackUrl = '';
    var ghMatch = url.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (ghMatch) {
      fallbackUrl = 'https://cdn.jsdelivr.net/gh/' + ghMatch[1] + '/' + ghMatch[2] + '@' + ghMatch[3] + '/' + ghMatch[4];
    }
    h += '<div class="photo-item" data-src="' + thumbUrl + '" data-fallback="' + fallbackUrl + '" data-preview="' + safeUrl + '" onclick="openImagePreview(this.dataset.preview)">';
    h += '<div class="photo-skeleton"></div>';
    h += '<img data-src="' + thumbUrl + '" data-fallback="' + fallbackUrl + '" alt="图片' + (idx+1) + '" onload="this.classList.add(\'loaded\');var sk=this.parentElement.querySelector(\'.photo-skeleton\');if(sk)sk.style.display=\'none\'" onerror="retryPhotoLoad(this)">';
    h += '<div class="photo-overlay"><span>🔍 查看大图</span></div>';
    h += '</div>';
  });
  h += '</div></div>';
  setTimeout(function() { initPhotoLazyLoad(gid); }, 50);
  return h;
}



function retryPhotoLoad(img) {
  var retries = parseInt(img.dataset.retries || '0');
  var src = img.dataset.src;
  var fallback = img.dataset.fallback;
  if (retries < 2) {
    img.dataset.retries = (retries + 1).toString();
    setTimeout(function() {
      img.src = src + (src.indexOf('?') > -1 ? '&' : '?') + '_retry=' + retries;
    }, 300 * (retries + 1));
  } else if (fallback && retries < 4) {
    img.dataset.retries = (retries + 1).toString();
    setTimeout(function() {
      img.src = fallback;
    }, 500);
  } else {
    img.parentElement.classList.add('error');
    img.style.display = 'none';
  }
}



function initPhotoLazyLoad(gid) {
  var container = document.getElementById(gid);
  if (!container) return;
  var imgs = container.querySelectorAll('img[data-src]');
  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (!img.src && img.dataset.src) {
            img.src = img.dataset.src;
          }
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '200px', threshold: 0.01 });
    imgs.forEach(function(img) { observer.observe(img); });
  } else {
    imgs.forEach(function(img) {
      if (img.dataset.src) img.src = img.dataset.src;
    });
  }
}


function openImagePreview(url) {
  var modal = document.getElementById('imagePreviewModal');
  var img = document.getElementById('imagePreviewImg');
  var loader = document.getElementById('imagePreviewLoader');
  if (!modal || !img) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  img.style.opacity = '0';
  if (loader) loader.style.display = 'block';
  img.onload = function() {
    img.style.opacity = '1';
    if (loader) loader.style.display = 'none';
  };
  img.onerror = function() {
    if (loader) { loader.style.display = 'none'; loader.innerHTML = '<div style="color:#fff;font-size:16px;">⚠️ 图片加载失败</div>'; loader.style.display = 'block'; }
  };
  img.src = url;
}



function closeImagePreview() {
  var modal = document.getElementById('imagePreviewModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
  var img = document.getElementById('imagePreviewImg');
  if (img) { img.src = ''; img.onload = null; img.onerror = null; }
}



function escapeHtml(text){
  if(!text) return '';
  const div=document.createElement('div');
  div.textContent=text;
  return div.innerHTML;
}




function closeSearchDropdown() {
  var d = document.getElementById('globalSearchDropdown');
  var inp = document.getElementById('globalSearchInput');
  if (d) d.classList.remove('active');
  if (inp) inp.value = '';
}



function initBackToTop() {
  var btn = document.getElementById('backToTop');
  if (!btn) return;
  window.addEventListener('scroll', function() {
    btn.classList.toggle('visible', window.scrollY > 300);
  });
}



function initHeaderThemeSelect() {
  var sel = document.getElementById('headerThemeSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(themes).map(function(kv) {
    return '<option value="' + kv[0] + '">' + kv[1].name + '</option>';
  }).join('');
  sel.value = currentTheme;
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
