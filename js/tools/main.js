/* ============================================================
 * main.js — AI 图片工具页交互逻辑
 * 功能：抠图 / 换背景·换纯色 / 去人物 / 老照片修复(收费·占位)
 * 抠图 / 换背景 / 去人物的本地部分为纯前端（WASM 推理 + JS 擦除），零后端成本
 * 云端 AI 能力走 /api/inpaint（Cloudflare Workers AI · Flux.2 klein 4B，免费额度）
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
  /* 状态写入页面顶部全局状态条 + 当前面板内的提示位
     （修复：原先只写第一个 id=status 的节点，切到其它 tab 完全看不到任何提示） */
  function setStatus(msg) {
    if (!msg) return;
    const g = $('#global-status');
    if (g) g.textContent = msg;
    const panel = $('#tab-' + currentTab);
    if (panel) {
      const l = panel.querySelector('.status-local');
      if (l) l.textContent = msg;
    }
  }
  function setBar(p) {
    const bar = $('#progress-fill'), wrap = $('#progress-wrap');
    if (!bar || !wrap) return;
    wrap.style.display = 'inline-block';
    bar.style.width = Math.round(p * 100) + '%';
    if (p >= 1) setTimeout(() => { wrap.style.display = 'none'; }, 600);
  }
  function busy(on, btn) {
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? '处理中…' : (btn.dataset.label || btn.textContent);
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
    setStatus('请上传图片开始使用');
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
          const fused = await cloudEdit({
            canvas: resCanv,
            prompt: 'keep the same person, same pose and same framing; keep the replaced backdrop; blend subject and background with harmonized natural lighting, soft clean edges, photorealistic, do not change the identity',
            maxSide: 448,
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
      // 先本地擦除得到底图，再交给云端 AI 修复背景纹理（复杂背景效果更好）
      setStatus('正在擦除人物…');
      const n = currentSrc.width * currentSrc.height;
      const bin = new Uint8Array(n);
      for (let i = 0; i < n; i++) bin[i] = mask[i] > 128 ? 255 : 0;
      const srcCanv = currentSrc.canvas;
      const imgData = srcCanv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, srcCanv.width, srcCanv.height);
      await diffuseInpaint(imgData, bin);
      const cleared = document.createElement('canvas');
      cleared.width = srcCanv.width; cleared.height = srcCanv.height;
      cleared.getContext('2d').putImageData(imgData, 0, 0);
      setStatus('云端 AI 修复背景纹理中，约 10~60 秒…');
      const out = await cloudEdit({
        canvas: cleared,
        prompt: 'remove every person from the scene and rebuild the background naturally and seamlessly: continue the floor, walls, furniture and lighting of the surroundings, clean photorealistic result, keep everything else unchanged, absolutely no human figure',
        maxSide: 448,
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
      const out = await cloudEdit({
        canvas: currentSrc.canvas,
        prompt: 'restore this old photograph: repair scratches, cracks, stains and torn areas, remove dust and noise, sharpen and clarify details, restore natural skin tone and true colors, keep the original composition and the identity of the people unchanged, high quality photo restoration',
        maxSide: 448,
      });
      const resEl = $('#tab-restore .res-canvas');
      resEl.width = out.width; resEl.height = out.height;
      resEl.getContext('2d').drawImage(out, 0, 0);
      showResult('tab-restore', '老照片修复完成（免费）');
    } catch (err) {
      setStatus(err.message);
    } finally { busy(false, btn); }
  });

  /* ==========================================================
   * Tab 5 · SU 效果图提示词（智谱 GLM-4V-Flash 生成 / 润色）
   * 前端压缩为 JPEG base64 直传 /api/su-prompt，不走 R2
   * ========================================================== */
  const SU_MAX_SIDE = 1024;                 // 长边上限
  const SU_MAX_BYTES = 2 * 1024 * 1024;     // 2MB 上限，超出降质

  /** 压缩为 JPEG base64（长边 ≤1024，控制在 2MB 内） */
  function suPrepareB64(canvas) {
    const ow = canvas.width, oh = canvas.height;
    const scale = Math.min(1, SU_MAX_SIDE / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale));
    const h = Math.max(1, Math.round(oh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    let q = 0.85;
    let url = c.toDataURL('image/jpeg', q);
    while (url.length * 0.75 > SU_MAX_BYTES && q > 0.4) {
      q -= 0.1;
      url = c.toDataURL('image/jpeg', q);
    }
    return url.split(',')[1];
  }

  function suBusy(on, btn) {
    ['#btn-su-run', '#btn-su-polish'].forEach((sel) => {
      const b = $(sel);
      if (b) b.disabled = on;
    });
    if (btn) btn.textContent = on ? '处理中…' : btn.dataset.label;
  }

  async function suRun(mode, btn) {
    const textEl = $('#su-input');
    const text = textEl ? textEl.value.trim() : '';
    const hasImg = !!(currentSrc && currentSrc.canvas && currentSrc.canvas.width);
    if (mode === 'polish' && !text) {
      setStatus('请先在左侧填写需要润色的提示词');
      return;
    }
    if (!hasImg && !text) {
      setStatus('请上传 SU / 3ds Max 模型截图，或先填写设计意图关键词');
      return;
    }
    let imageB64;
    if (hasImg) {
      try {
        imageB64 = suPrepareB64(currentSrc.canvas);
      } catch (e) {
        setStatus('图片压缩失败：' + e.message);
        return;
      }
    }
    suBusy(true, btn);
    setStatus('AI 正在' + (mode === 'polish' ? '润色' : '生成') + '提示词，约 5~20 秒…');
    try {
      const resp = await fetch('/api/su-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ img: imageB64, text: text || undefined, mode })
      });
      let data = null;
      try { data = await resp.json(); } catch (_) {}
      if (!resp.ok || !data || !data.success) {
        throw new Error((data && data.error) || ('服务暂时不可用（HTTP ' + resp.status + '），请稍后重试'));
      }
      const posEl = $('#su-result-pos');
      const negEl = $('#su-result-neg');
      if (posEl) posEl.value = data.text || '';
      if (negEl) negEl.value = data.negative || '';
      showResult('tab-su', mode === 'polish' ? '提示词润色完成' : '提示词生成完成');
    } catch (err) {
      setStatus('失败：' + err.message);
    } finally {
      suBusy(false, btn);
    }
  }

  function suCopy(sel, label) {
    const el = $(sel);
    if (!el || !el.value.trim()) { setStatus('暂无内容可复制'); return; }
    const done = () => setStatus(label + '已复制到剪贴板');
    const fallback = () => { el.select(); try { document.execCommand('copy'); } catch (_) {} done(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(el.value).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  const btnSuRun = $('#btn-su-run');
  if (btnSuRun) btnSuRun.addEventListener('click', () => suRun('generate', btnSuRun));
  const btnSuPolish = $('#btn-su-polish');
  if (btnSuPolish) btnSuPolish.addEventListener('click', () => suRun('polish', btnSuPolish));
  const btnSuCopyPos = $('#btn-su-copy-pos');
  if (btnSuCopyPos) btnSuCopyPos.addEventListener('click', () => suCopy('#su-result-pos', '正向提示词'));
  const btnSuCopyNeg = $('#btn-su-copy-neg');
  if (btnSuCopyNeg) btnSuCopyNeg.addEventListener('click', () => suCopy('#su-result-neg', '负向提示词'));

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
  /**
   * 等比缩放（不补边）——补边会让模型把填充区当成画面内容，在输出里画出白块
   * Flux.2 klein 要求参考图小于 512x512；并按原图比例推出输出尺寸（长边 768）
   * @returns {object} { b64, w, h, ow, oh, outW, outH }
   */
  async function prepareResize(canvas, maxSide) {
    const ow = canvas.width, oh = canvas.height;
    const scale = Math.min(1, (maxSide || 448) / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale));
    const h = Math.max(1, Math.round(oh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(canvas, 0, 0, ow, oh, 0, 0, w, h);
    const b64 = c.toDataURL('image/png').split(',')[1];
    const ratio = 768 / Math.max(w, h);
    const q16 = (v) => Math.max(256, Math.min(1920, Math.round(v * ratio / 16) * 16));
    return { b64, w, h, ow, oh, outW: q16(w), outH: q16(h) };
  }


  /**
   * 云端 AI 图像编辑（Flux.2 klein，免费）：整图送入模型，按 prompt 重绘 / 修复
   * 等比缩放 → POST /api/inpaint → 结果校验 → 缩放回原尺寸
   * @param {object} opts { canvas, prompt, maxSide? }
   */
  async function cloudEdit(opts) {
    const { canvas, prompt, maxSide } = opts;
    const prep = await prepareResize(canvas, maxSide || 448);
    const { b64, outW, outH, ow, oh } = prep;
    const body = { image_b64: b64, width: outW, height: outH, model: 'flux-edit', prompt };
    setStatus('云端 AI 处理中，约 10~60 秒，请耐心等待…');
    // 网络抖动 / 5xx / 超时 自动重试一次（历史踩坑：首跳偶发 Failed to fetch）
    let resp = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt) {
        setStatus('云端响应异常，正在自动重试…');
        await new Promise((r) => setTimeout(r, 1200));
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 90000);
      try {
        resp = await fetch('/api/inpaint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
      } catch (e) {
        resp = null;
        if (attempt === 1) {
          throw new Error(e && e.name === 'AbortError'
            ? '云端处理超时（超过 90 秒），请换小一点的图重试'
            : '云端请求失败，请检查网络后重试');
        }
      } finally {
        clearTimeout(timer);
      }
      if (resp && resp.status < 500) break;
      resp = null;
    }
    if (!resp) throw new Error('云端请求失败，请稍后重试');
    if (!resp.ok) {
      let msg = 'HTTP ' + resp.status;
      try { const e = await resp.json(); if (e.error) msg = e.error; } catch (_) {}
      throw new Error('云端处理失败：' + msg);
    }
    const blob = await resp.blob();
    if (!blob || !blob.size) throw new Error('云端返回空结果，请重试');
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('云端返回的图像无法解析'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    // 校验：黑图/空图视为失败（历史踩坑：模型输入格式错会返回全黑）
    const px = cctx.getImageData(0, 0, Math.min(64, c.width), Math.min(64, c.height)).data;
    let sum = 0, maxv = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
      sum += v; if (v > maxv) maxv = v;
    }
    const avg = sum / (px.length / 4);
    if (avg < 3 && maxv < 16) throw new Error('云端模型返回异常结果，请重试或换图');
    // 按原始长宽比缩放回原尺寸（输入未补边，无需裁切）
    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    out.getContext('2d').drawImage(c, 0, 0, c.width, c.height, 0, 0, ow, oh);
    return out;
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
