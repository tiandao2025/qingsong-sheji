/*!
 * water-ripple.js — 青松设计官网首页水波纹交互
 * 效果：
 *   1) 鼠标在页面上划过时，在光标轨迹处产生细微水波纹；
 *   2) 鼠标点击时，以点击点为中心产生由内向外扩散并逐渐消散的水波。
 * 约束：
 *   - 全屏 canvas 覆盖层 pointer-events:none，不影响页面原有交互与布局；
 *   - requestAnimationFrame 驱动，波纹消散后立即清理，空闲时自动停止循环；
 *   - 兼容触屏（触控滑动 / 点按）；
 *   - 依据点击位置的背景明暗自适应波纹颜色（适配深浅色背景）。
 */
(function () {
  'use strict';

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.__waterRipple) return;                 // 防重复注入
  window.__waterRipple = { version: '1.0.0', active: false };

  /* ---------- 无障碍：尊重系统「减少动态效果」 ---------- */
  var prefersReduce = false;
  try {
    prefersReduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { prefersReduce = false; }
  if (prefersReduce) return;

  /* ---------- 配置 ---------- */
  var CFG = {
    trail: {                    // 划过轨迹：细微波纹
      minDist: 15,              // 相邻波纹最小间距(px)
      minInterval: 26,          // 最小生成间隔(ms)
      r0: 1,
      r1: 26,
      dur: 920,
      alpha: 0.32,
      lineWidth: 1.4
    },
    click: {                    // 点击：由内向外扩散并消散
      r0: 2,
      rings: [
        { delay: 0,   r1: 72,  dur: 1000, alpha: 0.55, lineWidth: 2.0 },
        { delay: 110, r1: 108, dur: 1160, alpha: 0.42, lineWidth: 1.7 },
        { delay: 240, r1: 148, dur: 1320, alpha: 0.30, lineWidth: 1.3 }
      ]
    },
    rgbLight: { r: 96,  g: 150, b: 210 },   // 浅色背景：柔和水蓝
    rgbDark:  { r: 170, g: 205, b: 255 },   // 深色背景：淡蓝白
    maxWaves: 240,                          // 同屏波纹上限（防极端情况卡顿）
    zIndex: 9998                            // 低于客服浮窗/面板(9999)
  };

  /* ---------- 波纹数据（需在 resize() 之前声明） ---------- */
  var waves = [];        // {x,y,t0,delay,dur,r0,r1,a0,lw,c:{r,g,b}}
  var rafId = 0;
  var lastPt = { x: -999, y: -999, t: 0 };

  /* ---------- 创建覆盖层 canvas ---------- */
  var canvas = document.createElement('canvas');
  canvas.id = 'water-ripple-layer';
  canvas.setAttribute('aria-hidden', 'true');
  var st = canvas.style;
  st.position = 'fixed';
  st.left = '0';
  st.top = '0';
  st.width = '100%';
  st.height = '100%';
  st.pointerEvents = 'none';   // 关键：鼠标事件透明
  st.zIndex = String(CFG.zIndex);
  st.display = 'block';
  st.margin = '0';
  st.padding = '0';
  st.border = '0';
  st.background = 'transparent';
  st.opacity = '1';

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  function mount() {
    if (!canvas.parentNode && document.body) document.body.appendChild(canvas);
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', function () { mount(); resize(); });

  /* ---------- 尺寸自适应（含 DPR） ---------- */
  var W = 0, H = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);   // 限制 2 倍，兼顾清晰与性能
    W = window.innerWidth || document.documentElement.clientWidth || 0;
    H = window.innerHeight || document.documentElement.clientHeight || 0;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!waves.length) ctx.clearRect(0, 0, W, H);
  }
  resize();

  /* ---------- 背景明暗自适应 ---------- */
  var styleCache = (typeof WeakMap === 'function') ? new WeakMap() : null;

  function parseRGB(str) {
    if (!str) return null;
    var m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(str);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  function bgOf(el) {
    if (styleCache && styleCache.has(el)) return styleCache.get(el);
    var bg = null;
    try { bg = window.getComputedStyle(el).backgroundColor; } catch (e) { bg = null; }
    var rgb = parseRGB(bg);
    if (styleCache) styleCache.set(el, rgb);
    return rgb;
  }

  var sysDark = false;
  try { sysDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (e) { sysDark = false; }

  // 从落点逐级向上找第一个不透明背景，按相对亮度判定明暗
  function isDarkAt(x, y) {
    var el = null;
    try { el = document.elementFromPoint(x, y); } catch (e) { el = null; }
    var depth = 0;
    while (el && el.nodeType === 1 && depth < 10) {
      if (el === canvas) { el = el.parentElement; depth++; continue; }
      var rgb = bgOf(el);
      if (rgb && rgb.a > 0.15) {
        var lum = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
        return lum < 0.5;
      }
      el = el.parentElement;
      depth++;
    }
    return sysDark;
  }

  /* ---------- 波纹渲染 ---------- */
  function pushWave(w) {
    if (waves.length >= CFG.maxWaves) waves.shift();
    waves.push(w);
    start();
  }

  function spawnTrail(x, y) {
    var now = performance.now();
    var dx = x - lastPt.x, dy = y - lastPt.y;
    if ((now - lastPt.t) < CFG.trail.minInterval) return;
    if ((dx * dx + dy * dy) < CFG.trail.minDist * CFG.trail.minDist) return;
    lastPt = { x: x, y: y, t: now };

    var t = CFG.trail;
    pushWave({
      x: x, y: y, t0: now, delay: 0, dur: t.dur,
      r0: t.r0, r1: t.r1, a0: t.alpha, lw: t.lineWidth,
      c: isDarkAt(x, y) ? CFG.rgbDark : CFG.rgbLight
    });
  }

  function spawnClick(x, y) {
    var now = performance.now();
    var c = isDarkAt(x, y) ? CFG.rgbDark : CFG.rgbLight;
    for (var i = 0; i < CFG.click.rings.length; i++) {
      var rg = CFG.click.rings[i];
      pushWave({
        x: x, y: y, t0: now, delay: rg.delay, dur: rg.dur,
        r0: CFG.click.r0, r1: rg.r1, a0: rg.alpha, lw: rg.lineWidth, c: c
      });
    }
  }

  function easeOut(p) { return 1 - Math.pow(1 - p, 1.7); }  // 先快后慢，接近水波扩散手感

  function frame(now) {
    rafId = 0;
    if (!waves.length) { ctx.clearRect(0, 0, W, H); return; }

    ctx.clearRect(0, 0, W, H);

    for (var i = waves.length - 1; i >= 0; i--) {
      var w = waves[i];
      var p = (now - w.t0 - w.delay) / w.dur;
      if (p >= 1) { waves.splice(i, 1); continue; }     // 消散后立即清理
      if (p <= 0) continue;

      var r = w.r0 + (w.r1 - w.r0) * easeOut(p);
      var a = w.a0 * Math.pow(1 - p, 1.5);
      if (a <= 0.002 || r <= 0) continue;

      var lw = Math.max(0.4, w.lw * (1 - 0.55 * p));
      var base = 'rgba(' + w.c.r + ',' + w.c.g + ',' + w.c.b + ',';

      // 外圈柔光：更宽的淡色描边，增强水体质感与可见度
      ctx.beginPath();
      ctx.arc(w.x, w.y, r + lw * 0.9, 0, Math.PI * 2);
      ctx.lineWidth = lw * 2.8;
      ctx.strokeStyle = base + (a * 0.28).toFixed(3) + ')';
      ctx.stroke();

      // 主环：清晰的细水波线
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx.lineWidth = lw;
      ctx.strokeStyle = base + a.toFixed(3) + ')';
      ctx.stroke();
    }

    if (waves.length) start();
  }

  function start() {
    if (rafId) return;
    if (document.hidden) return;                        // 页面不可见时不耗电
    rafId = window.requestAnimationFrame(frame);
  }

  /* ---------- 事件绑定（全部 passive / 不拦截默认行为） ---------- */
  function move(e) { spawnTrail(e.clientX, e.clientY); }
  function down(e) {
    // 仅响应主键（鼠标左键 / 触控点按）
    if (typeof e.button === 'number' && e.button !== 0) return;
    spawnClick(e.clientX, e.clientY);
  }

  var usePointer = !!window.PointerEvent;
  // capture:true —— 在捕获阶段监听，即使页面内部对事件调用了 stopPropagation 也能生成波纹
  var opts = { passive: true, capture: true };

  if (usePointer) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;            // 触摸拖动不生成轨迹波纹，避免与页面滚动互相干扰
      move(e);
    }, opts);
    window.addEventListener('pointerdown', function (e) {
      // 触摸设备由 pointerdown 统一处理（不 preventDefault，不影响滚动与点击）
      down(e);
    }, opts);
  } else {
    window.addEventListener('mousemove', move, opts);
    window.addEventListener('mousedown', down, opts);
    window.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches.length) down({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, button: 0 });
    }, opts);
    window.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length) move({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, opts);
  }

  var rzTimer = 0;
  window.addEventListener('resize', function () {
    if (rzTimer) window.clearTimeout(rzTimer);
    rzTimer = window.setTimeout(function () { rzTimer = 0; resize(); }, 150);
  }, opts);

  window.addEventListener('orientationchange', function () {
    window.setTimeout(resize, 260);
  }, opts);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { resize(); start(); }
  });

  window.__waterRipple.active = true;
  window.__waterRipple.spawnClick = spawnClick;   // 便于调试/自动化验证
  window.__waterRipple.resize = resize;
})();
