/**
 * admin-pages/dev-modules.js
 * 开发者工具 - 模块开关管理页面
 * 
 * 功能：
 *   - 显示所有后台模块的开关状态
 *   - 开启/关闭模块的显示
 *   - 保存配置到 Worker（R2）
 *   - 仅 admin-super 和 admin-dev 可见
 */

(function() {
  'use strict';

  const MODULES = [
    { id: 'dashboard',     name: '📊 仪表盘',     desc: '数据概览与统计',        sensitive: false },
    { id: 'config',        name: '⚙️ 站点配置',    desc: '网站基础信息设置',       sensitive: false },
    { id: 'announcements', name: '📢 公告管理',    desc: '发布小区公告通知',       sensitive: false },
    { id: 'documents',     name: '📄 文档管理',    desc: '文件资料上传管理',       sensitive: false },
    { id: 'activities',    name: '🎉 活动管理',    desc: '社区活动发布管理',       sensitive: false },
    { id: 'residents',     name: '👥 居民管理',    desc: '业主信息档案管理',       sensitive: true  },
    { id: 'audit',         name: '📋 审计日志',    desc: '操作记录与审计追踪',      sensitive: true  },
    { id: 'workorders',    name: '🔧 工单管理',    desc: '维修工单处理跟踪',       sensitive: false },
    { id: 'complaints',    name: '💬 投诉管理',    desc: '投诉建议收集处理',       sensitive: false },
    { id: 'polls',         name: '🗳️ 投票管理',    desc: '民意调查与投票',         sensitive: false },
    { id: 'settings',      name: '🔒 系统设置',    desc: '高级系统选项',           sensitive: true  }
  ];

  // 内联样式（避免依赖外部 CSS）
  const STYLES = `
    .dev-modules-panel { max-width: 800px; margin: 0 auto; padding: 20px; }
    .dev-modules-header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb; }
    .dev-modules-header h3 { margin: 0 0 8px 0; font-size: 20px; color: #1f2937; }
    .dev-modules-header .desc { margin: 0; color: #6b7280; font-size: 14px; }
    .dev-modules-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .dev-module-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; background: #fff; border: 1px solid #e5e7eb;
      border-radius: 10px; transition: all 0.2s;
    }
    .dev-module-item:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .dev-module-item.disabled { opacity: 0.6; background: #f9fafb; }
    .dev-module-info { flex: 1; }
    .dev-module-name { font-size: 15px; font-weight: 500; color: #1f2937; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .dev-module-desc { font-size: 13px; color: #6b7280; }
    .tag {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
    }
    .tag.sensitive { background: #fef3c7; color: #92400e; }
    .tag.readonly { background: #e0e7ff; color: #3730a3; }
    .dev-module-switch { position: relative; display: inline-block; width: 48px; height: 26px; }
    .dev-module-switch input { opacity: 0; width: 0; height: 0; }
    .dev-module-switch .slider {
      position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
      background-color: #d1d5db; border-radius: 26px; transition: .3s;
    }
    .dev-module-switch .slider:before {
      position: absolute; content: ""; height: 20px; width: 20px;
      left: 3px; bottom: 3px; background-color: white; border-radius: 50%; transition: .3s;
    }
    .dev-module-switch input:checked + .slider { background-color: #10b981; }
    .dev-module-switch input:checked + .slider:before { transform: translateX(22px); }
    .dev-modules-actions { display: flex; gap: 12px; margin-bottom: 20px; }
    .dev-modules-actions button {
      padding: 10px 24px; border-radius: 8px; font-size: 14px; cursor: pointer;
      border: none; font-weight: 500; transition: all 0.2s;
    }
    .dev-modules-actions .btn-primary { background: #10b981; color: white; }
    .dev-modules-actions .btn-primary:hover { background: #059669; }
    .dev-modules-actions .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .dev-modules-actions .btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
    .dev-modules-actions .btn-secondary:hover { background: #e5e7eb; }
    .dev-modules-tip { padding: 12px 16px; background: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6; }
    .dev-modules-tip p { margin: 0; font-size: 13px; color: #1e40af; }
    .dev-modules-loading { text-align: center; padding: 60px; color: #6b7280; }
    .dev-modules-error { text-align: center; padding: 40px; color: #dc2626; }
  `;

  // 注入样式
  function injectStyles() {
    if (document.getElementById('dev-modules-styles')) return;
    const style = document.createElement('style');
    style.id = 'dev-modules-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  // ==================== 主渲染入口 ====================

  window.renderDevModulesPage = function(container) {
    if (!container) container = document.getElementById('contentArea');
    if (!container) return;

    injectStyles();

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) pageTitle.textContent = '🔧 开发者工具 - 模块开关';

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.style.display = 'none';

    container.innerHTML = '<div class="dev-modules-loading">加载配置中...</div>';
    loadAndRender(container);
  };

  async function loadAndRender(container) {
    try {
      const res = await fetch('/api/data/module-config', { method: 'GET' });
      const result = await res.json();
      const config = (result.success && result.data && result.data.modules)
        ? result.data
        : getDefaultConfig();
      renderUI(container, config);
    } catch (err) {
      console.error('[DevModules] Load failed:', err);
      container.innerHTML = '<div class="dev-modules-error">加载失败，使用默认配置</div>';
      setTimeout(() => renderUI(container, getDefaultConfig()), 800);
    }
  }

  function getDefaultConfig() {
    const modules = {};
    MODULES.forEach(m => {
      modules[m.id] = { visible: true, editable: !m.sensitive };
    });
    return { modules };
  }

  function renderUI(container, config) {
    let html = `
      <div class="dev-modules-panel">
        <div class="dev-modules-header">
          <h3>模块开关控制</h3>
          <p class="desc">开启或关闭后台各功能模块的显示。关闭后该模块将从导航中隐藏，但数据不会删除。</p>
        </div>
        <div class="dev-modules-list">
    `;

    MODULES.forEach(mod => {
      const cfg = config.modules[mod.id] || { visible: true, editable: true };
      const checked = cfg.visible !== false ? 'checked' : '';
      const disabled = cfg.editable === false ? 'disabled' : '';
      const itemClass = cfg.visible === false ? 'dev-module-item disabled' : 'dev-module-item';
      const sensitiveTag = mod.sensitive ? '<span class="tag sensitive">敏感</span>' : '';
      const readonlyTag = cfg.editable === false ? '<span class="tag readonly">只读</span>' : '';

      html += `
        <div class="${itemClass}" data-module="${mod.id}">
          <div class="dev-module-info">
            <div class="dev-module-name">${mod.name} ${sensitiveTag} ${readonlyTag}</div>
            <div class="dev-module-desc">${mod.desc}</div>
          </div>
          <label class="dev-module-switch" title="${cfg.editable === false ? '该模块为只读，不可关闭' : '点击切换'}">
            <input type="checkbox" ${checked} ${disabled} onchange="toggleModuleState('${mod.id}', this.checked)">
            <span class="slider"></span>
          </label>
        </div>
      `;
    });

    html += `
        </div>
        <div class="dev-modules-actions">
          <button class="btn-primary" onclick="saveModuleConfig()">💾 保存配置</button>
          <button class="btn-secondary" onclick="resetModuleConfig()">↩️ 恢复默认</button>
        </div>
        <div class="dev-modules-tip">
          <p>💡 提示：修改保存后立即生效。敏感模块（居民管理、审计日志）建议保持开启。开发者角色可开关模块，但不可修改敏感数据。</p>
        </div>
      </div>
    `;

    container.innerHTML = html;
    window._currentModuleConfig = JSON.parse(JSON.stringify(config));
  }

  // ==================== 交互操作 ====================

  window.toggleModuleState = function(moduleId, visible) {
    if (!window._currentModuleConfig) return;
    if (!window._currentModuleConfig.modules[moduleId]) {
      window._currentModuleConfig.modules[moduleId] = {};
    }
    window._currentModuleConfig.modules[moduleId].visible = visible;

    // 实时更新当前项的样式
    const item = document.querySelector(`.dev-module-item[data-module="${moduleId}"]`);
    if (item) {
      item.classList.toggle('disabled', !visible);
    }
  };

  window.saveModuleConfig = async function() {
    if (!window._currentModuleConfig) return;

    const btn = document.querySelector('.dev-modules-actions .btn-primary');
    const originalText = btn ? btn.textContent : '保存配置';
    if (btn) { btn.textContent = '保存中...'; btn.disabled = true; }

    try {
      const res = await fetch('/api/data/module-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: window._currentModuleConfig })
      });
      const result = await res.json();

      if (result.success) {
        // 同步到 sessionStorage
        if (typeof window.setModuleConfig === 'function') {
          window.setModuleConfig(window._currentModuleConfig);
        }
        // 立即应用过滤
        if (typeof window.applyModuleFilters === 'function') {
          window.applyModuleFilters();
        }
        showToast('✅ 配置已保存并生效', 'success');
      } else {
        showToast('❌ 保存失败：' + (result.error || '未知错误'), 'error');
      }
    } catch (err) {
      showToast('❌ 保存失败：' + err.message, 'error');
    } finally {
      if (btn) { btn.textContent = originalText; btn.disabled = false; }
    }
  };

  window.resetModuleConfig = async function() {
    if (!confirm('确定恢复默认配置吗？所有模块将重新显示。')) return;
    window._currentModuleConfig = getDefaultConfig();
    await window.saveModuleConfig();
    const container = document.getElementById('contentArea');
    if (container) renderUI(container, window._currentModuleConfig);
  };

  // ==================== 辅助函数 ====================

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type);
    } else {
      alert(msg);
    }
  }

})();
