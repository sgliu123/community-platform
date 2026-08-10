/* js/admin-upload.js - 文件上传、图片压缩、视频处理 */

/* ========== 图片压缩 ========== */



async function compressImageToBlob(file, maxSizeMB = 0.03) {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const toBlob = (q) => new Promise((res) => {
        canvas.toBlob((b) => res(b), 'image/jpeg', q);
      });
      const maxSize = maxSizeMB * 1024 * 1024;
      let blob = await toBlob(0.25);
      if (blob.size <= maxSize) {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let low = 0.05, high = 0.4, bestBlob = null;
      while (high - low > 0.03) {
        const mid = (low + high) / 2;
        blob = await toBlob(mid);
        if (blob.size > maxSize) { high = mid; }
        else { low = mid; bestBlob = blob; }
      }
      if (bestBlob && bestBlob.size <= maxSize) {
        resolve(new File([bestBlob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        return;
      }
      let scale = 0.7;
      while (scale > 0.05) {
        const nw = Math.max(1, Math.floor(w * scale));
        const nh = Math.max(1, Math.floor(h * scale));
        canvas.width = nw; canvas.height = nh;
        ctx.drawImage(img, 0, 0, nw, nh);
        blob = await toBlob(0.3);
        if (blob.size <= maxSize) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          return;
        }
        scale -= 0.18;
      }
      reject(new Error('图片压缩后仍超过' + maxSizeMB + 'MB限制'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')); };
    img.src = url;
  });
}



/* ========== 文件上传相关 ========== */



async function uploadFileToRepo(file, folder) {
  const maxSizeMB = folder === 'videos' ? 100 : (folder === 'images' ? 100 : (folder === 'files' ? 100 : 100));
  if (file.size > maxSizeMB * 1024 * 1024) {
    throw new Error('文件大小超过限制（' + maxSizeMB + 'MB）');
  }

  // ===== 优先使用 Worker 上传（确保前端可实时访问）=====
  const workerBase = getWorkerBase();
  if (workerBase) {
    try {
      const fd = new FormData();
      fd.append('file', file);
      console.log('[Worker Upload] 开始上传:', file.name, '大小:', (file.size/1024).toFixed(1), 'KB');
      const res = await fetch(workerBase + '/api/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error('Worker 返回 ' + res.status + ': ' + errText.substring(0,200));
      }
      const result = await res.json();
      if (result && result.url) {
        console.log('[Worker Upload] ✅ 成功:', result.url);
        return result.url;
      } else {
        throw new Error('Worker 返回数据异常: ' + JSON.stringify(result));
      }
    } catch (e) {
      console.error('[Worker Upload] ❌ 失败:', e.message);
      showToast('Worker 上传失败: ' + e.message + '，尝试 GitHub...', 'error');
      // 继续回退到 GitHub
    }
  }

  // ===== 回退到 GitHub API =====
  if (!githubToken) {
    // 如果连 GitHub 也没有，返回临时 blob（仅当前页可用，会提示用户）
    const blobUrl = URL.createObjectURL(file);
    console.warn('[Upload] ⚠️ 未配置 Worker 或 GitHub，返回临时 blob:', blobUrl);
    showToast('⚠️ 警告：未配置 Worker 或 GitHub，文件仅当前页可用，刷新后失效', 'error');
    return blobUrl;
  }
  const ownerRepo = await getRepoInfo();
  if (!ownerRepo) throw new Error('无法获取仓库信息，请检查Token');
  const [owner, repo] = ownerRepo;
  const ext = file.name.split('.').pop().toLowerCase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filename = Date.now() + '_' + Math.random().toString(36).substr(2,6) + '_' + safeName;
  const path = 'assets/' + (folder || 'uploads') + '/' + filename;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const getRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json' }
        });
        let sha = '';
        if (getRes.ok) {
          const info = await getRes.json();
          sha = info.sha;
        }
        const body = {
          message: '[' + (currentAdmin && currentAdmin.name || 'admin') + '] 上传文件 ' + file.name,
          content: base64
        };
        if (sha) body.sha = sha;
        const putRes = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
          method: 'PUT',
          headers: { 'Authorization': 'token ' + githubToken, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!putRes.ok) {
          const err = await putRes.json();
          throw new Error(err.message || '上传失败');
        }
        resolve(path);
      } catch(e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}



function createFileUploaderHTML(options) {
  const { id, accept, hint, maxSizeText } = options;
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || ''}</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept || '*'}" onchange="handleFileSelect(event,'${id}')">
    <div class="file-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}



async function handleFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) await processFileUpload(files[0], id);
}



async function handleFileSelect(e, id) {
  const file = e.target.files[0];
  if (file) await processFileUpload(file, id);
}



async function processFileUpload(file, id) {
  const progressEl = document.getElementById('progress-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const wrapEl = document.getElementById('wrap-' + id);

  let folder = 'uploads';
  let maxSize = 100 * 1024 * 1024;
  let isImage = false;
  if (id.includes('video')) { folder = 'videos'; maxSize = 800 * 1024 * 1024; }
  else if (id.includes('image') || id.includes('cover') || id.includes('logo') || id.includes('favicon')) { folder = 'images'; isImage = true; }
  else if (id.includes('pdf') || id.includes('file')) { folder = 'files'; maxSize = 100 * 1024 * 1024; }
  else if (id.includes('batch')) { folder = 'imports'; maxSize = 100 * 1024 * 1024; }

  let uploadFile = file;
  if (isImage && file.type.startsWith('image/')) {
    progressEl.textContent = '⏳ 压缩中...';
    try {
      uploadFile = await compressImageToBlob(file, 0.03);
      progressEl.textContent = '⏳ 上传中...';
    } catch(e) {
      showToast('图片压缩失败：' + e.message, 'error');
      return;
    }
  } else if (file.size > maxSize) {
    showToast('文件过大，限制' + (maxSize/1024/1024) + 'MB', 'error');
    return;
  }

  try {
    const path = await uploadFileToRepo(uploadFile, folder);
    progressEl.textContent = '✅ 上传成功';

    // 保存路径到data属性
    wrapEl.dataset.uploadedPath = path;
    wrapEl.dataset.fileName = file.name;

    // 显示预览
    let previewHTML = '';
    if (uploadFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><img src="${url}"><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else if (uploadFile.type.startsWith('video/')) {
      const url = URL.createObjectURL(uploadFile);
      previewHTML = `<div class="file-preview-item"><video src="${url}" muted playsinline webkit-playsinline x5-playsinline preload="metadata"></video><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    } else {
      previewHTML = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button><div class="file-name">${uploadFile.name}</div></div>`;
    }
    previewEl.innerHTML = previewHTML;
  } catch(e) {
    progressEl.textContent = '';
    showToast('上传失败：' + e.message, 'error');
  }
}



function clearUpload(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  const progressEl = document.getElementById('progress-' + id);
  if (wrapEl) { delete wrapEl.dataset.uploadedPath; delete wrapEl.dataset.fileName; }
  if (previewEl) previewEl.innerHTML = '';
  if (progressEl) progressEl.textContent = '';
  const inp = document.getElementById('inp-' + id);
  if (inp) inp.value = '';
}



function getUploadedPath(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  return wrapEl && wrapEl.dataset.uploadedPath || '';
}



function setUploadedPath(id, path, name) {
  const wrapEl = document.getElementById('wrap-' + id);
  const previewEl = document.getElementById('preview-' + id);
  if (!wrapEl) return;
  wrapEl.dataset.uploadedPath = path;
  wrapEl.dataset.fileName = name || path;
  if (previewEl && path) {
    const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(path);
    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(path);
    let html = '';
    if (isImg) html = `<div class="file-preview-item"><img src="${path}"><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else if (isVideo) html = `<div class="file-preview-item"><video src="${path}" muted></video><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    else html = `<div class="file-preview-item"><div class="file-icon">📄</div><button class="remove" onclick="clearUpload('${id}')">×</button></div>`;
    previewEl.innerHTML = html;
  }
}





/* ========== 多图上传相关 ========== */



function createMultiImageUploaderHTML(id, hint, accept) {
  accept = accept || 'image/*';
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleMultiFileDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>📎 点击或拖拽文件到此处上传</div>
      <div class="hint">${hint || '支持拖拽或点击上传（自动压缩）'}</div>
      <div class="hint" style="color:var(--primary);font-weight:500;">已上传 <span id="count-${id}">0</span> / 15 个</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="${accept}" multiple onchange="handleMultiFileSelect(event,'${id}')">
    <div class="multi-image-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}



async function handleMultiFileDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files);
  if (files.length) await processMultiFileUpload(files, id);
}



async function handleMultiFileSelect(e, id) {
  const files = Array.from(e.target.files);
  if (files.length) await processMultiFileUpload(files, id);
}



async function processMultiFileUpload(files, id) {
  const progressEl = document.getElementById('progress-' + id);
  const wrapEl = document.getElementById('wrap-' + id);
  let currentPaths = getMultiUploadedPaths(id);

  if (currentPaths.length + files.length > 15) {
    showToast('最多只能上传15个文件', 'error');
    files = files.slice(0, 15 - currentPaths.length);
  }

  if (files.length === 0) return;

  progressEl.textContent = '⏳ 处理中 ' + files.length + ' 个...';

  for (const file of files) {
    let uploadFile = file;
    let folder = 'files';
    let isImage = file.type.startsWith('image/');
    let isPdf = file.type === 'application/pdf';
    let isRollCSV = (id === 'pollRollFiles') && (/\.(csv|xlsx|xls)$/i.test(file.name));

    if (isImage) {
      folder = 'images';
      try {
        uploadFile = await compressImageToBlob(file, 0.03);
      } catch(e) {
        showToast('"' + file.name + '" 压缩失败：' + e.message, 'error');
        continue;
      }
    } else if (isPdf || isRollCSV) {
      folder = 'files';
      if (file.size > 100 * 1024 * 1024) {
        showToast('"' + file.name + '" 超过100MB限制', 'error');
        continue;
      }
    } else {
      showToast('"' + file.name + '" 不支持的文件格式，仅支持图片和PDF', 'error');
      continue;
    }

    try {
      const path = await uploadFileToRepo(uploadFile, folder);
      currentPaths.push(path);
      renderMultiFilePreview(id, currentPaths);
      document.getElementById('count-' + id).textContent = currentPaths.length;
      // 自动解析清册CSV
      if (isRollCSV && /\.csv$/i.test(file.name)) {
        try {
          const text = await file.text();
          const result = parseRollCSV(text);
          if (result && result.count > 0) {
            updateRollStats(result.count, result.area);
            const targetInput = document.getElementById('edTarget');
            if (targetInput) targetInput.value = result.count;
            window._rollSyncData = { count: result.count, area: result.area, source: 'upload' };
            showToast('清册解析成功：' + result.count + '户，' + result.area.toFixed(2) + '㎡', 'success');
          }
        } catch(e) { console.error('CSV解析失败', e); }
      }
    } catch(e) {
      showToast('"' + file.name + '" 上传失败：' + e.message, 'error');
    }
  }

  progressEl.textContent = currentPaths.length > 0 ? '✅ 已上传 ' + currentPaths.length + ' 个' : '';
  wrapEl.dataset.uploadedPaths = JSON.stringify(currentPaths);
}



function renderMultiFilePreview(id, paths) {
  const previewEl = document.getElementById('preview-' + id);
  if (!previewEl) return;
  let html = '';
  paths.forEach((path, idx) => {
    const isPdf = /\.pdf$/i.test(path);
    if (isPdf) {
      html += `<div class="multi-preview-item" style="display:flex;align-items:center;justify-content:center;background:#f5f5f5;cursor:pointer;" onclick="window.open('${path}','_blank')" title="点击打开PDF">
        <div style="text-align:center;">
          <div style="font-size:32px;">📄</div>
          <div style="font-size:10px;color:#666;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px;">${escapeHtml(path.split('/').pop() || 'PDF')}</div>
        </div>
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    } else {
      html += `<div class="multi-preview-item" style="cursor:pointer;" onclick="previewImage('${path}')">
        <img src="${path}" onerror="this.src=''" loading="lazy" decoding="async">
        <button class="remove" onclick="event.stopPropagation();removeMultiFile('${id}', ${idx})" title="删除">×</button>
        <div class="idx">${idx + 1}</div>
      </div>`;
    }
  });
  previewEl.innerHTML = html;
}


function renderMultiImagePreview(id, paths) { renderMultiFilePreview(id, paths); }



function removeMultiFile(id, idx) {
  const wrapEl = document.getElementById('wrap-' + id);
  let paths = getMultiUploadedPaths(id);
  paths.splice(idx, 1);
  wrapEl.dataset.uploadedPaths = JSON.stringify(paths);
  renderMultiFilePreview(id, paths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = paths.length;
  const progressEl = document.getElementById('progress-' + id);
  if (progressEl) progressEl.textContent = paths.length > 0 ? '✅ 已上传 ' + paths.length + ' 个' : '';
}


function removeMultiImage(id, idx) { removeMultiFile(id, idx); }



function getMultiUploadedPaths(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl || !wrapEl.dataset.uploadedPaths) return [];
  try { return JSON.parse(wrapEl.dataset.uploadedPaths); } catch(e) { return []; }
}



function setMultiUploadedPaths(id, paths) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl) return;
  const validPaths = (paths || []).filter(p => p && typeof p === 'string');
  wrapEl.dataset.uploadedPaths = JSON.stringify(validPaths);
  renderMultiFilePreview(id, validPaths);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = validPaths.length;
}



/* ========== 多视频上传相关 ========== */



function createMultiVideoUploaderHTML(id, hint) {
  return `<div class="file-upload-wrap" id="wrap-${id}">
    <div class="file-dropzone" id="drop-${id}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleMultiVideoDrop(event,'${id}')" onclick="document.getElementById('inp-${id}').click()">
      <div>🎬 点击或拖拽视频到此处上传</div>
      <div class="hint">${hint || '支持拖拽或点击上传视频（mp4/mov/webm/avi等，单个100M以内）'}</div>
      <div class="hint" style="color:var(--primary);font-weight:500;">已上传 <span id="count-${id}">0</span> / 5 个</div>
    </div>
    <input type="file" id="inp-${id}" style="display:none" accept="video/mp4,video/x-m4v,video/webm,video/quicktime,video/x-msvideo,video/x-matroska,video/3gpp,video/3gpp2" multiple onchange="handleMultiVideoSelect(event,'${id}')">
    <div class="multi-image-preview" id="preview-${id}"></div>
    <div class="upload-progress" id="progress-${id}"></div>
  </div>`;
}



async function handleMultiVideoDrop(e, id) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
  if (files.length) await processMultiVideoUpload(files, id);
}



async function handleMultiVideoSelect(e, id) {
  const files = Array.from(e.target.files);
  if (files.length) await processMultiVideoUpload(files, id);
}



async function processMultiVideoUpload(files, id) {
  const progressEl = document.getElementById('progress-' + id);
  const wrapEl = document.getElementById('wrap-' + id);
  let currentVideos = getMultiUploadedVideos(id);
  if (currentVideos.length + files.length > 5) {
    showToast('最多只能上传5个视频', 'error');
    files = files.slice(0, 5 - currentVideos.length);
  }
  if (files.length === 0) return;
  for (const file of files) {
    if (file.size > 100 * 1024 * 1024) {
      showToast('"' + file.name + '" 超过100MB，浏览器端压缩不可靠。请先用工具压缩至100MB以内，或上传到视频网站后粘贴链接', 'error');
      continue;
    }
    progressEl.textContent = '⏳ 上传 "' + file.name + '" (' + (file.size/1024/1024).toFixed(1) + 'MB)...';
    try {
      const path = await uploadFileToRepo(file, 'videos');
      currentVideos.push({ path: path, name: file.name, size: file.size });
      renderMultiVideoPreview(id, currentVideos);
      document.getElementById('count-' + id).textContent = currentVideos.length;
      progressEl.textContent = '✅ "' + file.name + '" 上传成功';
    } catch(e) {
      showToast('"' + file.name + '" 上传失败：' + e.message, 'error');
    }
  }
  progressEl.textContent = currentVideos.length > 0 ? '✅ 已上传 ' + currentVideos.length + ' 个视频' : '';
  wrapEl.dataset.uploadedVideos = JSON.stringify(currentVideos);
}



async function compressVideo(file, targetMB) {
  return new Promise(async (resolve, reject) => {
    const targetSize = targetMB * 1024 * 1024;
    if (file.size <= targetSize) { resolve(file); return; }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(file);
    let mediaRecorder = null;
    let recorderStarted = false;
    let cleanupDone = false;
    const chunks = [];

    const cleanup = (err) => {
      if (cleanupDone) return;
      cleanupDone = true;
      URL.revokeObjectURL(url);
      try { video.pause(); video.removeAttribute('src'); video.load(); } catch(e) {}
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        try { mediaRecorder.stop(); } catch(e) {}
      }
      if (err) reject(err);
    };

    // 5分钟超时保护
    const timeout = setTimeout(() => {
      cleanup(new Error('视频压缩超时，请先用本地工具压缩后再上传'));
    }, 300000);

    video.onloadedmetadata = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // 计算合适的缩放比例，同时限制最大分辨率避免内存爆炸
        let scale = Math.min(1, Math.sqrt(targetSize / file.size) * 0.85);
        const maxDim = 1280;
        if (video.videoWidth * scale > maxDim) scale = maxDim / video.videoWidth;
        if (video.videoHeight * scale > maxDim) scale = maxDim / video.videoHeight;
        scale = Math.max(0.1, scale);

        canvas.width = Math.max(1, Math.floor(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.floor(video.videoHeight * scale));

        // 先画一帧确保 canvas 有内容
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const stream = canvas.captureStream(30); // 30fps
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
                         MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';

        const duration = video.duration || 60;
        const bitRate = Math.min(4000000, Math.max(500000, Math.floor((targetSize * 8) / duration)));
        mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitRate });

        mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          try { video.pause(); } catch(e) {}
          const blob = new Blob(chunks, { type: 'video/webm' });
          if (blob.size === 0) {
            reject(new Error('压缩失败：输出为空，请手动压缩后上传'));
            return;
          }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), { type: 'video/webm' });
          if (compressed.size > targetSize * 1.5) {
            reject(new Error('压缩后仍超过目标大小，请手动压缩后上传'));
          } else {
            resolve(compressed);
          }
        };

        mediaRecorder.onerror = () => {
          clearTimeout(timeout);
          cleanup(new Error('视频录制失败，请手动压缩后上传'));
        };

        mediaRecorder.start(1000);
        recorderStarted = true;

        // 等待视频开始播放后再绘制
        await video.play();

        const drawFrame = () => {
          if (video.ended) {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            return;
          }
          if (video.paused) {
            // 如果意外暂停，尝试恢复
            video.play().catch(() => {});
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          requestAnimationFrame(drawFrame);
        };
        requestAnimationFrame(drawFrame);

      } catch(e) {
        clearTimeout(timeout);
        cleanup(new Error('压缩初始化失败：' + (e.message || '未知错误')));
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup(new Error('视频加载失败，格式可能不受支持'));
    };

    video.src = url;
  });
}



function renderMultiVideoPreview(id, videos) {
  const previewEl = document.getElementById('preview-' + id);
  if (!previewEl) return;
  let html = '';
  videos.forEach((v, idx) => {
    const sizeText = v.size ? (v.size/1024/1024).toFixed(1) + 'MB' : '';
    html += `<div class="multi-preview-item">
      <video src="${v.path}" muted preload="metadata" playsinline webkit-playsinline x5-playsinline x5-video-player-type="h5" x5-video-player-fullscreen="false" style="width:100%;height:100%;object-fit:cover;"></video>
      <button class="remove" onclick="removeMultiVideo('${id}', ${idx})" title="删除">×</button>
      <div class="idx">${idx + 1}</div>
      <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;">${sizeText}</div>
    </div>`;
  });
  previewEl.innerHTML = html;
}



function removeMultiVideo(id, idx) {
  const wrapEl = document.getElementById('wrap-' + id);
  let videos = getMultiUploadedVideos(id);
  videos.splice(idx, 1);
  wrapEl.dataset.uploadedVideos = JSON.stringify(videos);
  renderMultiVideoPreview(id, videos);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = videos.length;
  const progressEl = document.getElementById('progress-' + id);
  if (progressEl) progressEl.textContent = videos.length > 0 ? '✅ 已上传 ' + videos.length + ' 个视频' : '';
}



function getMultiUploadedVideos(id) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl || !wrapEl.dataset.uploadedVideos) return [];
  try { return JSON.parse(wrapEl.dataset.uploadedVideos); } catch(e) { return []; }
}



function setMultiUploadedVideos(id, videos) {
  const wrapEl = document.getElementById('wrap-' + id);
  if (!wrapEl) return;
  const validVideos = (videos || []).map(v => {
    if (typeof v === 'string') return { path: v, name: 'video', size: 0 };
    if (v && typeof v === 'object' && v.path) return v;
    return null;
  }).filter(Boolean);
  wrapEl.dataset.uploadedVideos = JSON.stringify(validVideos);
  renderMultiVideoPreview(id, validVideos);
  const countEl = document.getElementById('count-' + id);
  if (countEl) countEl.textContent = validVideos.length;
}

