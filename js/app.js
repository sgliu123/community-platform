/* js/app.js - 应用入口与全局事件 */

document.addEventListener("DOMContentLoaded", async () => {
  // ESC key to close image preview
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeImagePreview();
      var extModal = document.querySelector('.external-modal.active');
      if (extModal) closeExternalModal(extModal.id);
    }
  });
  applyTheme(currentTheme); renderThemePanel();
  try { await loadData(); } catch(e) { console.error('loadData failed', e); }
  render();

  // ===== 实时刷新机制：实现"秒显示"效果 =====

  // 1) 页面从后台切回前台时自动刷新数据
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      loadData().then(() => {
        const r = getRoute();
        // 只有列表页/首页切回前台时才重新渲染
        if (isRealtimePage(r.page)) {
          render();
        }
        // 详情页保持当前视图，数据已在内存中静默更新
      }).catch(e => console.error('Visibility refresh failed', e));
    }
  });

  // 2) 每10秒自动刷新一次关键数据
  setInterval(() => {
    if (document.hidden) return;
    const r = getRoute();
    if (isRealtimePage(r.page)) {
      // 列表页/首页：加载数据后重新渲染，确保用户看到最新内容
      loadData().then(() => render()).catch(() => {});
    } else if (['announcement-detail','document-detail','activity-detail','poll-detail'].includes(r.page)) {
      // 详情页：静默加载数据到内存，不重新渲染 DOM（避免打断视频播放、重置滚动位置）
      loadData().catch(() => {});
    }
  }, 10000);
});