/* js/admin-pages/residents.js - 业主管理 */

function renderResidentsAdmin() {
  const list = appData.residents || [];
  return `<div class="card"><div class="card-header"><h3>👥 业主管理</h3><div class="actions"><button class="btn" onclick="showBatchImport()">📥 批量导入</button><button class="btn btn-primary" onclick="openEditModal('residents',null)">➕ 添加业主</button></div></div>` +
    '<table class="data-table"><thead><tr><th>房号</th><th>姓名</th><th>面积(m²)</th><th>手机后四位</th><th>状态</th><th>绑定方式</th><th>标记</th><th>操作</th></tr></thead><tbody>' +
    list.map(item => `<tr><td>${item.roomNo||''}</td><td>${item.name||''}</td><td>${item.area||'—'}</td><td>${item.phoneSuffix||''}</td><td><span class="tag ${item.status==="active"?"tag-active":"tag-disabled"}">${item.status==="active"?"正常":"禁用"}</span></td><td>${item.bindingMethod||'—'}</td><td>${item.isTest?`<span class="tag tag-test">测</span>`:""}${item.isSameBuyer?`<span class="tag tag-test" style="background:#e3f2fd;color:#1565c0;margin-left:2px;">同</span>`:""}</td><td class="actions"><button onclick="openEditModal('residents','${item.id}')">编辑</button><button class="danger" onclick="deleteItem('residents','${item.id}')">删除</button></td></tr>`).join('') +
    '</tbody></table></div>';
}



function showBatchImport() {
  document.getElementById('modalTitle').textContent = '📥 批量导入业主';
  document.getElementById('modalBody').innerHTML = '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">请粘贴Excel内容，格式：房号 | 姓名 | 手机后四位（每行一条，可用制表符或竖线分隔）</p>' +
    '<textarea class="batch-textarea" id="batchData" placeholder="1-1-101	张三	1234\n1-1-102	李四	5678"></textarea>' +
    '<div style="margin-top:16px;margin-bottom:8px;font-size:13px;color:var(--text-secondary);font-weight:500;">或上传文件（.csv / .xlsx / .vcf）：</div>' +
    createFileUploaderHTML({id:'batchFile', accept:'.csv,.xlsx,.xls,.vcf,.vcd', hint:'支持拖拽或点击上传 .csv / .xlsx / .vcf 文件'}) +
    '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">示例：1-1-101  测试业主01  0001</div>';
  document.getElementById('modalFooter').innerHTML = '<button class="btn" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="doBatchImport()">导入</button>';
  document.getElementById('modalOverlay').classList.add('active');
}



async function doBatchImport() {
  let rows = [];
  let success = 0, fail = 0;

  // 先尝试从上传的文件解析
  const batchPath = getUploadedPath('batchFile');
  if (batchPath && batchPath.startsWith('blob:')) {
    try {
      const r = await fetch(batchPath);
      if (r.ok) {
        const blob = await r.blob();
        const file = new File([blob], 'batch.csv');
        rows = await handleBatchFile(file);
      }
    } catch(e) { console.error(e); }
  } else if (batchPath) {
    showLoading(true);
    try {
      const ownerRepo = await getRepoInfo();
      if (ownerRepo) {
        const [owner, repo] = ownerRepo;
        const r = await fetch('https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/' + batchPath);
        if (r.ok) {
          const blob = await r.blob();
          const file = new File([blob], 'batch.' + (batchPath.split('.').pop() || 'csv'));
          rows = await handleBatchFile(file);
        }
      }
    } catch(e) { console.error(e); }
    showLoading(false);
  }

  // 如果没有文件或文件解析失败，尝试文本框
  if (rows.length === 0) {
    const text = document.getElementById('batchData').value.trim();
    if (!text) { showToast('请输入数据或上传文件', 'error'); return; }
    const lines = text.split('\n');
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      const parts = line.split(/[\t|\|\s]+/);
      if (parts.length >= 3) {
        rows.push(parts);
      }
    });
  }

  const newResidents = [];
  rows.forEach(parts => {
    const room = parts[0].trim();
    const name = parts[1].trim();
    const suffix = (parts[2] || '').trim().replace(/[^0-9]/g, '').substring(0,4);
    if (room && name && suffix) {
      newResidents.push({ id: 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2,4), roomNo: room, name: name, phoneSuffix: suffix, area: 0, voteWeightCount: 1, voteWeightArea: 0, status: 'active', isTest: false, registeredAt: new Date().toISOString().split('T')[0] });
      success++;
    } else { fail++; }
  });

  if (newResidents.length === 0) { showToast('未解析到有效数据', 'error'); return; }
  const list = appData.residents || [];
  list.push.apply(list, newResidents);
  appData.residents = list;
  closeModal(); showLoading(true);
  try {
    await saveDataFile('residents', list, '批量导入 ' + success + ' 位业主', 'batch-import');
    showToast('成功导入 ' + success + ' 位业主' + (fail?'，' + fail + '行失败':''), 'success');
    navigateTo('residents');
  } catch(e) {
    showToast('导入失败：' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}



/* ========== Excel / VCF 解析 ========== */



function parseExcelSimple(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  let csv = '';
  const len = data.length;
  let i = 0;
  // 简单解析：寻找PK头（xlsx）或纯文本（csv/xls）
  // 这里做一个简化版：如果是CSV直接解析，如果是xlsx做简单文本提取
  const text = new TextDecoder('utf-8').decode(data);
  if (text.includes('\t') || text.includes(',')) {
    return text.split('\n').map(line => line.split(/[\t,]/).map(s => s.trim())).filter(r => r.length >= 3 && r[0]);
  }
  // 对于真正的xlsx，这里简化处理：尝试提取所有文本中的数字和中文行
  const lines = text.replace(/[^\x20-\x7E\u4e00-\u9fa5\n\t]/g, '\n').split('\n').filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    const parts = line.split(/[\t,|\s]+/).filter(s => s.trim());
    if (parts.length >= 3 && /^[\d-]+$/.test(parts[0])) results.push(parts);
  }
  return results;
}



function parseVCF(vcfText) {
  const lines = vcfText.split('\n');
  const contacts = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('BEGIN:VCARD')) current = { name: '', phone: '', room: '' };
    else if (trimmed.startsWith('END:VCARD')) {
      if (current && current.name) contacts.push(current);
      current = null;
    } else if (current && trimmed.startsWith('FN:')) {
      current.name = trimmed.substring(3);
    } else if (current && trimmed.startsWith('TEL')) {
      const idx = trimmed.indexOf(':');
      if (idx > 0) current.phone = trimmed.substring(idx + 1).replace(/\D/g, '');
    } else if (current && trimmed.startsWith('ADR') || trimmed.startsWith('NOTE')) {
      const idx = trimmed.indexOf(':');
      if (idx > 0) {
        const val = trimmed.substring(idx + 1);
        const match = val.match(/([\d]+-[\d]+-[\d]+)/);
        if (match) current.room = match[1];
      }
    }
  }
  return contacts;
}



async function handleBatchFile(file) {
  const name = file.name.toLowerCase();
  let rows = [];
  if (name.endsWith('.vcf') || name.endsWith('.vcd')) {
    const text = await file.text();
    const contacts = parseVCF(text);
    rows = contacts.map(c => [c.room || '', c.name, c.phone.slice(-4)]).filter(r => r[1]);
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    rows = text.split('\n').map(line => line.split(/[\t,|]/).map(s => s.trim())).filter(r => r.length >= 3 && r[0]);
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    rows = parseExcelSimple(buf);
  } else {
    showToast('不支持的文件格式，请使用 .csv / .xlsx / .vcf', 'error');
    return [];
  }
  return rows;
}

