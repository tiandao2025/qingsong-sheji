/**
 * 网站访问统计埋点脚本
 * - 页面加载时生成 sessionId（sessionStorage，浏览器关闭即失效）
 * - 每次加载时 POST 到 /api/analytics
 * - 每 30 秒心跳上报，用于计算访问时长
 * - beforeunload 时发送最后一次心跳
 */
(function () {
  'use strict';

  const HEARTBEAT_INTERVAL = 30000; // 30 秒
  const API_URL = '/api/analytics';

  // 生成或复用 sessionId
  let sessionId = sessionStorage.getItem('_analytics_sid');
  if (!sessionId) {
    sessionId = 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('_analytics_sid', sessionId);
  }

  // 发送埋点数据
  function send(data) {
    const payload = {
      page: location.pathname,
      referrer: document.referrer || '',
      sessionId: sessionId,
      timestamp: Date.now(),
      ...data
    };

    // 使用 sendBeacon 作为首选（页面卸载时更可靠），失败则降级到 fetch
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(API_URL, blob);
    } else {
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function () { /* 静默失败，不影响用户体验 */ });
    }
  }

  // 初始上报（页面加载）
  send({});

  // 心跳定时器
  let heartbeatTimer = setInterval(function () {
    send({ heartbeat: true });
  }, HEARTBEAT_INTERVAL);

  // 页面关闭前最后一次心跳
  window.addEventListener('beforeunload', function () {
    clearInterval(heartbeatTimer);
    send({ heartbeat: true });
  });

})();
