/* js/admin-pages/settings.js - 系统设置 */

function renderSettings() {
  const isSuper = currentAdmin && currentAdmin.role === 'super';
  const roleLabel = isSuper ? '总维护人员' : '管理员';

  let html = '<div class="card"><div class="card-header"><h3>👤 当前身份</h3></div>' +
    '<div class="form-group"><label>身份名称</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.name || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>角色类型</label><input type="text" value="' + roleLabel + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>管理员ID</label><input type="text" value="' + escapeHtml(currentAdmin && currentAdmin.id || '') + '" disabled style="background:#f5f5f5;"></div>' +
    '<div class="form-group"><label>删除权限</label><input type="text" value="' + (currentAdmin && currentAdmin.canDelete !== false ? '✅ 已开启' : '❌ 已关闭') + '" disabled style="background:#f5f5f5;"></div></div>';

  // 修改密码（所有管理员）
  html += '<div class="card"><div class="card-header"><h3>🔐 修改我的密码</h3></div>' +
    '<div class="form-group"><label>当前密码</label><input type="password" id="oldPassword" placeholder="输入当前密码"></div>' +
    '<div class="form-group"><label>新密码（6位以上）</label><input type="password" id="newPassword" placeholder="输入新密码"></div>' +
    '<div class="form-group"><label>确认新密码</label><input type="password" id="confirmPassword" placeholder="再次输入新密码"></div>' +
    '<button class="btn btn-primary" onclick="changePassword()">修改密码</button></div>';

  // 管理员注册（非super可见）
  if (!isSuper) {
    html += '<div class="card"><div class="card-header"><h3>📝 管理员注册</h3></div>' +
      '<div id="regError" style="color:var(--danger);font-size:13px;margin-bottom:10px;display:none;"></div>' +
      '<div class="form-group"><label>显示名称</label><input type="text" id="regName" placeholder="如：张三"></div>' +
      '<div class="form-group"><label>登录账号ID</label><input type="text" id="regId" placeholder="如：admin-zhangsan"></div>' +
      '<div class="form-group"><label>密码（6位以上）</label><input type="password" id="regPassword" placeholder="设置登录密码"></div>' +
      '<div class="form-group"><label>确认密码</label><input type="password" id="regConfirmPassword" placeholder="再次输入密码"></div>' +
      '<button class="btn btn-primary" onclick="submitAdminRegister()">提交注册申请</button>' +
      '<p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">提交后需总维护人员审批通过方可登录。</p></div>';
  }

  // Worker配置
  html += '<div class="card"><div class="card-header"><h3>🌐 Worker 网关地址</h3></div>' +
    '<div class="form-group"><label>Worker API 地址（留空则使用内存模式）</label><input type="text" id="workerBaseInput" value="' + (localStorage.getItem('workerBase') || '') + '" placeholder="https://api.firstblade.site 或留空"></div>' +
    '<button class="btn btn-primary" onclick="saveWorkerBase()">保存地址</button>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px;">留空表示开发模式（数据仅保存在浏览器内存中，刷新后丢失）。</p></div>';

  // 锚定配置
  html += '<div class="card"><div class="card-header"><h3>🔗 证据锚定配置</h3></div>' +
    '<div class="form-group"><label>GitHub Token（用于 Commit 锚定）</label><input type="password" id="cfgGithubToken" value="' + (localStorage.getItem('githubToken') || '') + '" placeholder="ghp_xxxxxxxxxxxx"></div>' +
    '<div class="form-group"><label>GitHub 仓库（格式：owner/repo）</label><input type="text" id="cfgGithubRepo" value="' + (localStorage.getItem('githubRepo') || '') + '" placeholder="username/community-platform"></div>' +
    '<div class="form-group"><label>企业微信 Webhook URL</label><input type="text" id="cfgWechatWebhook" value="' + (localStorage.getItem('wechatWebhook') || '') + '" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."></div>' +
    '<div class="form-group"><label>Resend API Key</label><input type="password" id="cfgResendKey" value="' + (localStorage.getItem('resendApiKey') || '') + '" placeholder="re_xxxxxxxx"></div>' +
    '<div class="form-group"><label>锚定通知邮箱</label><input type="text" id="cfgAnchorEmail" value="' + (localStorage.getItem('anchorEmail') || '') + '" placeholder="admin@example.com"></div>' +
    '<button class="btn btn-primary" onclick="saveAnchorConfig()">保存锚定配置</button></div>';

  return html;
}

function saveAnchorConfig() {
  localStorage.setItem('githubToken', document.getElementById('cfgGithubToken').value.trim());
  localStorage.setItem('githubRepo', document.getElementById('cfgGithubRepo').value.trim());
  localStorage.setItem('wechatWebhook', document.getElementById('cfgWechatWebhook').value.trim());
  localStorage.setItem('resendApiKey', document.getElementById('cfgResendKey').value.trim());
  localStorage.setItem('anchorEmail', document.getElementById('cfgAnchorEmail').value.trim());
  showToast('锚定配置已保存', 'success');
}

async function changePassword() {
  const oldPwd = document.getElementById('oldPassword').value;
  const newPwd = document.getElementById('newPassword').value;
  const confirmPwd = document.getElementById('confirmPassword').value;
  if (!oldPwd || !newPwd || !confirmPwd) { showToast('请填写所有字段', 'error'); return; }
  if (newPwd !== confirmPwd) { showToast('两次输入的新密码不一致', 'error'); return; }
  if (newPwd.length < 6) { showToast('新密码需6位以上', 'error'); return; }

  let account = ADMIN_ACCOUNTS.find(a => a.id === (currentAdmin && currentAdmin.id));
  if (!account && currentAdmin && currentAdmin.isRegistered) {
    account = ((appData.config && appData.config.adminUsers) || []).find(a => a.id === currentAdmin.id);
  }
  if (!account) { showToast('账户配置异常', 'error'); return; }
  if (oldPwd !== account.password) { showToast('当前密码错误', 'error'); return; }

  account.password = newPwd;

  if (currentAdmin && currentAdmin.isRegistered) {
    showLoading(true);
    try {
      await saveDataFile('config', appData.config, '管理员 ' + account.name + ' 修改密码', 'password-change');
      showToast('密码修改成功', 'success');
    } catch(e) {
      showToast('保存失败：' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  } else {
    showToast('密码已更新（代码中），请手动修改 admin-data.js 中的默认密码以永久保存', 'warning');
  }
}

function saveWorkerBase() {
  const el = document.getElementById('workerBaseInput');
  if (!el) return;
  const val = el.value.trim();
  localStorage.setItem('workerBase', val.replace(/\/$/, ''));
  showToast('Worker地址已保存，刷新页面后生效', 'success');
}

async function updateToken() {
  showToast('当前使用 Cloudflare Worker 模式，无需配置 GitHub Token', 'info');
  closeModal();
}
