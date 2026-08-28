/* ============================================================
 * main.js — AI 图片工具页交互逻辑
 * 功能：抠图 / 换背景·换纯色 / 去人物 / 老照片修复(收费·占位)
 * 抠图、换背景、去人物均为纯前端（WASM 推理 + JS 擦除），零后端成本
 * ============================================================ */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const MAX_SIZE = 1400;        // 换背景/抠图最大边长
  const INPAINT_MAX = 1000;     // 去人物最大边长（控制扩散耗时）

  const seg = new Segmenter();
  seg.onStatus = (m) => setStatus(m);
  seg.onProgress = (p) => setBar(p);

  /* ---------- 公共状态 ---------- */
  let currentSrc = null;      // { canvas, width, height, name, url }
  let currentTab = 'matte';

  const tabEls = {
    matte:  { root: $('#tab-matte'),  handle: $('#t-matte') },
    bg:     { root: $('#tab-bg'),     handle: $('#t-bg') },
    remove: { root: $('#tab-remove'), handle: $('#t-remove') },
    restore:{ root: $('#tab-restore'),handle: $('#t-restore') }
  };

  /* ---------- 上传区逻辑（每个 tab 独立的 file input + drop） ---------- */
  $$('.dropzone').forEach((dz) => {
    const input = dz.querySelector('input[type=file]');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragging'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('dragging');
      if (e.dataTransfer.files && e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0], dz);
    });
    input.addEventListener('change', () => { if (input.files.length) loadFile(input.files[0], dz); });
  });

  function loadFile(file, dz) {
    if (!/^image\//.test(file.type)) { setStatus('请选择图片文件'); return; }
    const root = dz.closest('.tab-panel') || dz.closest('.panel');
    setStatus('正在加载图片…');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setStatus('图片已加载');
      paintPreview(root, img, file.name);
    };
    img.onerror = () => setStatus('图片加载失败');
    img.src = url;
  }

  /* 画到对应面板的原图预览区，并缓存 currentSrc */
  function paintPreview(root, img, name) {
    const srcCanv = root.querySelector('.src-canvas');
    const max = (root.id === 'tab-remove') ? INPAINT_MAX : MAX_SIZE;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    srcCanv.width = w; srcCanv.height = h;
    srcCanv.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
    currentSrc = { canvas: srcCanv, width: w, height: h, name: name || 'image' };
    root.querySelector('.res-out').style.display = 'none';
    root.querySelector('.res-canvas').width = w;
    root.querySelector('.res-canvas').height = h;
    root.querySelector('.src-wrap').style.display = 'block';
    hideHint(root);
  }

  function hideHint(root) {
    const hint = root.querySelector('.panel-hint');
    if (hint) hint.style.display = 'none';
  }
  function showHint(root, text) {
    const hint = root.querySelector('.panel-hint');
    if (hint) { hint.textContent = text; hint.style.display = 'block'; }
  }

  /* ---------- 状态栏 / 进度条 ---------- */
  function setStatus(msg) {
    const el = $('#status');
    if (el) el.textContent = msg;
  }
  function setBar(p) {
    const bar = $('#progress-fill'), wrap = $('#progress-wrap');
    if (!bar) return;
    wrap.style.display = 'block';
    bar.style.width = Math.round(p * 100) + '%';
    if (p >= 1) setTimeout(() => { wrap.style.display = 'none'; }, 500);
  }
  function busy(on, btn) {
    const b = btn || $('#busy-btn');
    if (b) { b.disabled = on; b.textContent = on ? '处理中…' : b.dataset.label; }
  }

  /* ---------- Tab 切换 ---------- */
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn) return;
    currentTab = btn.dataset.tab;
    $$('#tabs button').forEach((x) => x.classList.toggle('active', x === btn));
    $$('.tab-panel').forEach((p) => {
      p.style.display = p.id === 'tab-' + currentTab ? 'block' : 'none';
    });
    setStatus('');
  });

  /* ==========================================================
   * Tab 1 · 抠图：分割 → 预览 mask → 下载透明 PNG
   * ========================================================== */
  $('#btn-matte-run').addEventListener('click', async () => {
    if (!requireSrc()) return;
    const btn = $('#btn-matte-run'); busy(true, btn);
    try {
      const { mask } = await seg.segment(currentSrc.canvas);
      const resCanv = $('#tab-matte .res-canvas');
      const ctx = resCanv.getContext('2d');
      ctx.clearRect(0, 0, resCanv.width, resCanv.height);
      ctx.drawImage(currentSrc.canvas, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      const mc = document.createElement('canvas');
      mc.width = resCanv.width; mc.height = resCanv.height;
      const mx = mc.getContext('2d');
      const id = mx.createImageData(resCanv.width, resCanv.height);
      const d = id.data;
      for (let i = 0; i < resCanv.width * resCanv.height; i++) {
        d[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, mask[i])));
      }
      mx.putImageData(id, 0, 0);
      ctx.drawImage(mc, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      showResult('tab-matte', '抠图完成');
    } catch (err) {
      setStatus('抠图失败：' + err.message);
    } finally { busy(false, btn); }
  });

  /* ==========================================================
   * Tab 2 · 换背景 / 换纯色：分割 + 背景合成
   * ========================================================== */
  let bgImageUrl = null;   // 用户上传的背景图
  $('#bg-file-input').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    bgImageUrl = URL.createObjectURL(f);
    setStatus('背景图已选择：' + f.name);
    const preview = $('#bg-img-preview');
    const img = new Image();
    img.onload = () => { preview.src = img.src; preview.style.display = 'block'; };
    img.src = bgImageUrl;
  });
  $$('#bg-solid-preset button').forEach((b) => {
    b.addEventListener('click', () => {
      bgImageUrl = null;
      $('#bg-img-preview').style.display = 'none';
      const c = b.dataset.color || b.style.backgroundColor;
      if (c) $('#bg-custom').value = c;
      setStatus('背景纯色：' + c);
    });
  });

  $('#btn-bg-run').addEventListener('click', async () => {
    if (!requireSrc()) return;
    const btn = $('#btn-bg-run'); busy(true, btn);
    try {
      const { mask } = await seg.segment(currentSrc.canvas);
      const color = $('#bg-custom').value || '#ffffff';
      // 先抠出主体（透明图）
      const fg = document.createElement('canvas');
      fg.width = currentSrc.width; fg.height = currentSrc.height;
      const fctx = fg.getContext('2d');
      fctx.drawImage(currentSrc.canvas, 0, 0);
      fctx.globalCompositeOperation = 'destination-in';
      const mc = document.createElement('canvas');
      mc.width = currentSrc.width; mc.height = currentSrc.height;
      const mx = mc.getContext('2d');
      const id = mx.createImageData(currentSrc.width, currentSrc.height);
      const d = id.data;
      for (let i = 0; i < currentSrc.width * currentSrc.height; i++) d[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, mask[i])));
      mx.putImageData(id, 0, 0);
      fctx.drawImage(mc, 0, 0);
      fctx.globalCompositeOperation = 'source-over';

      const resCanv = $('#tab-bg .res-canvas');
      const rctx = resCanv.getContext('2d');
      rctx.clearRect(0, 0, resCanv.width, resCanv.height);
      if (bgImageUrl) {
        const bg = new Image();
        await new Promise((res, rej) => { bg.onload = res; bg.onerror = rej; bg.src = bgImageUrl; });
        // background-size: cover
        const bw = resCanv.width, bh = resCanv.height;
        const s = Math.max(bw / bg.width, bh / bg.height);
        const dw = bg.width * s, dh = bg.height * s;
        rctx.drawImage(bg, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
      } else {
        rctx.fillStyle = color;
        rctx.fillRect(0, 0, resCanv.width, resCanv.height);
      }
      rctx.drawImage(fg, 0, 0);
      // AI 光线融合（可选）：让主体与背景光线氛围统一
      const fusion = $('#bg-ai-fusion');
      if (fusion && fusion.checked) {
        setStatus('正在 AI 融合光线氛围…');
        try {
          const fused = await cloudInpaint({
            canvas: resCanv,
            model: 'sdxl-lightning',
            prompt: 'same subject and background, harmonized natural lighting, soft seamless blend, photorealistic, consistent light direction',
            negative_prompt: 'blurry, artifacts, distorted, changed identity, wrong lighting',
            strength: 0.35, maxSide: 768,
          });
          const fEl = $('#tab-bg .res-canvas');
          fEl.width = fused.width; fEl.height = fused.height;
          fEl.getContext('2d').drawImage(fused, 0, 0);
        } catch (e) {
          setStatus('AI 融合失败，已保留普通合成结果：' + e.message);
        }
      }
      showResult('tab-bg', '换背景完成');
    } catch (err) {
      setStatus('换背景失败：' + err.message);
    } finally { busy(false, btn); }
  });

  /* ==========================================================
   * Tab 3 · 去人物：分割 → 擦除 → 预览 → 下载
   * ========================================================== */
  $('#btn-remove-run').addEventListener('click', async () => {
    if (!requireSrc()) return;
    const btn = $('#btn-remove-run'); busy(true, btn);
    try {
      setStatus('正在识别人物区域…');
      const { mask } = await seg.segment(currentSrc.canvas);
      // 硬阈值得到擦除区域（保留软边外 1px 余量）
      const n = currentSrc.width * currentSrc.height;
      const bin = new Uint8Array(n);
      for (let i = 0; i < n; i++) bin[i] = mask[i] > 128 ? 255 : 0;
      setStatus('正在擦除人物…');
      const srcCanv = currentSrc.canvas;
      const imgData = srcCanv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, srcCanv.width, srcCanv.height);
      await diffuseInpaint(imgData, bin);
      const resCanv = $('#tab-remove .res-canvas');
      resCanv.getContext('2d').putImageData(imgData, 0, 0);
      showResult('tab-remove', '去人物完成');
    } catch (err) {
      setStatus('去人物失败：' + err.message);
    } finally { busy(false, btn); }
  });

  /* 云端 AI 去人物（复杂背景用） */
  $('#btn-remove-cloud').addEventListener('click', async () => {
    if (!requireSrc()) return;
    const btn = $('#btn-remove-cloud'); busy(true, btn);
    try {
      setStatus('正在识别人物区域…');
      const { mask } = await seg.segment(currentSrc.canvas);
      const out = await cloudInpaint({
        canvas: currentSrc.canvas, mask,
        model: 'sd15-inpaint',
        prompt: 'clean empty background, remove person, seamless natural background continuation, photorealistic',
        negative_prompt: 'person, human, people, face, blurry, low quality, artifacts, distorted',
        strength: 0.85, maxSide: 768,
      });
      const resEl = $('#tab-remove .res-canvas');
      resEl.width = out.width; resEl.height = out.height;
      resEl.getContext('2d').drawImage(out, 0, 0);
      showResult('tab-remove', '云端AI去人物完成');
    } catch (err) {
      setStatus(err.message + '；可退回「本地擦除」');
    } finally { busy(false, btn); }
  });

  /* ==========================================================
   * Tab 4 · 老照片修复（免费·云端 AI）
   * ========================================================== */
  $('#btn-restore-run').addEventListener('click', async () => {
    if (!requireSrc()) return;
    const btn = $('#btn-restore-run'); busy(true, btn);
    try {
      const out = await cloudInpaint({
        canvas: currentSrc.canvas,
        model: 'sdxl-lightning',
        prompt: 'restore old damaged photo, sharp clear face, natural skin tone, realistic details, vivid color photo',
        negative_prompt: 'blurry, noise, scratches, cracks, low quality, deformed, distorted, faded',
        strength: 0.45, maxSide: 768,
      });
      const resEl = $('#tab-restore .res-canvas');
      resEl.width = out.width; resEl.height = out.height;
      resEl.getContext('2d').drawImage(out, 0, 0);
      showResult('tab-restore', '老照片修复完成（免费）');
    } catch (err) {
      setStatus(err.message);
    } finally { busy(false, btn); }
  });

  /* ---------- 通用下载 ---------- */
  $$('.res-download').forEach((btn) => {
    btn.addEventListener('click', () => {
      const root = btn.closest('.tab-panel');
      const canv = root.querySelector('.res-canvas');
      const type = (root.id === 'tab-matte' || root.id === 'tab-bg') ? 'image/png' : 'image/jpeg';
      const ext = (root.id === 'tab-matte' || root.id === 'tab-bg') ? 'png' : 'jpg';
      canv.toBlob((blob) => {
        if (!blob) { setStatus('导出失败'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const base = currentTab;
        a.download = 'tools-' + base + '-' + Date.now() + '.' + ext;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      }, type, 0.92);
      setStatus('已开始下载');
    });
  });

  /* ==========================================================
   * 云端 AI 处理（Workers AI 免费模型，经 /api/inpaint）
   * ========================================================== */
  async function canvasToRGB(canvas, maxSide) {
    let c = canvas;
    const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
    if (scale < 1) {
      c = document.createElement('canvas');
      c.width = Math.round(canvas.width * scale);
      c.height = Math.round(canvas.height * scale);
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    }
    const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
    const rgb = new Array(c.width * c.height * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2];
    }
    return { rgb, width: c.width, height: c.height };
  }

  async function cloudInpaint(opts) {
    const { canvas, mask, model, prompt, negative_prompt, strength, maxSide } = opts;
    const { rgb, width, height } = await canvasToRGB(canvas, maxSide || 768);
    const body = { image: rgb, width, height, model, prompt, strength };
    if (negative_prompt) body.negative_prompt = negative_prompt;
    if (mask) {
      const m = new Array(width * height);
      const sc = document.createElement('canvas');
      sc.width = width; sc.height = height;
      const sctx = sc.getContext('2d');
      const id = sctx.createImageData(width, height);
      for (let i = 0; i < width * height; i++) {
        const v = mask[i] > 128 ? 255 : 0;
        id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255;
      }
      sctx.putImageData(id, 0, 0);
      const md = sctx.getImageData(0, 0, width, height).data;
      for (let i = 0; i < width * height; i++) m[i] = md[i * 4];
      body.mask = m;
    }
    setStatus('云端 AI 处理中，约 5~20 秒…');
    const resp = await fetch('/api/inpaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const e = await resp.json(); if (e.error) msg = e.error; } catch (_) {}
      throw new Error('云端处理失败：' + msg);
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return c;
  }

  function showResult(tabId, msg) {
    const root = $('#' + tabId);
    root.querySelector('.res-out').style.display = 'block';
    setStatus(msg);
  }

  function requireSrc() {
    if (!currentSrc || !currentSrc.canvas.width) {
      setStatus('请先上传一张图片');
      return false;
    }
    return true;
  }

  setStatus('请上传图片开始使用');
})();
