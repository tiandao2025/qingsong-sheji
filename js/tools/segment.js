/* ============================================================
 * segment.js — 前端人像分割（抠图/去人物/换背景共用）
 * 模型：u2netp.onnx (320x320)，onnxruntime-web WASM 浏览器内推理
 * 对齐本地 app.py segment_person_mask()：
 *   RGB /255 → CHW [1,3,320,320] → 输出[0,0]概率图 → 阈值0.5
 *   → 最大连通域 → 高斯羽化 σ2（用 box blur 近似）
 * ============================================================ */
(function (global) {
  'use strict';

  const MODEL_URL = './tools/model/u2netp.onnx';

  class Segmenter {
    constructor(modelUrl) {
      this.modelUrl = modelUrl || MODEL_URL;
      this.session = null;
      this._loading = null;
      this.onProgress = null;   // f(0~1)
      this.onStatus = null;     // f(string)
    }

    _log(msg) {
      if (this.onStatus) this.onStatus(msg);
    }

    load() {
      if (this.session) return Promise.resolve(this.session);
      if (this._loading) return this._loading;
      this._loading = (async () => {
        this._log('正在下载分割模型 (~4.4MB)…');
        const resp = await fetch(this.modelUrl, { cache: 'force-cache' });
        if (!resp.ok) throw new Error('模型下载失败 HTTP ' + resp.status);
        let arrayBuffer;
        const total = +(resp.headers.get('content-length') || 0);
        if (resp.body && total) {
          const reader = resp.body.getReader();
          const chunks = [];
          let got = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            got += value.length;
            if (this.onProgress) this.onProgress(got / total);
          }
          const buf = new Uint8Array(got);
          let off = 0;
          for (const c of chunks) { buf.set(c, off); off += c.length; }
          arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
        } else {
          arrayBuffer = await resp.arrayBuffer();
        }
        const opts = {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all'
        };
        if (global.ort?.env?.wasm) {
          // safetensors 之外不需要额外 wasm 设置；顶层 wasm 由 CDN 提供
        }
        this.session = await ort.InferenceSession.create(arrayBuffer, opts);
        this._log('模型就绪，开始分割');
        return this.session;
      })();
      return this._loading;
    }

    /**
     * 对图像源做分割，返回与原图同尺寸的软 mask（0~255 Float32Array）
     * @param {CanvasImageSource} src  HTMLImageElement / Canvas / Video
     * @param {{threshold?:number, feather?:number, inputHW?:number}} opt
     */
    async segment(src, opt) {
      const opts = opt || {};
      const threshold = opts.threshold === undefined ? 0.5 : opts.threshold;
      const feather = opts.feather === undefined ? 2.0 : opts.feather;
      const INPUT_HW = opts.inputHW || 320;

      const sess = await this.load();
      const W = INPUT_HW, H = INPUT_HW;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, W, H);
      const imgData = ctx.getImageData(0, 0, W, H);
      const d = imgData.data;
      const n = W * H;
      const inArr = new Float32Array(3 * n);
      for (let i = 0; i < n; i++) {
        inArr[i]     = d[i * 4] / 255;
        inArr[n + i] = d[i * 4 + 1] / 255;
        inArr[2*n+i] = d[i * 4 + 2] / 255;
      }
      const feeds = {};
      feeds[sess.inputNames[0]] = new ort.Tensor('float32', inArr, [1, 3, H, W]);
      const out = await sess.run(feeds);
      const name = sess.outputNames[0];
      const tensor = out[name];
      const dims = tensor.dims;                 // 期望 [1,1,H,W]
      const ow = dims[dims.length - 1];
      const oh = dims[dims.length - 2];
      const raw = tensor.data;                  // Float32Array
      if (ow !== W || oh !== H) throw new Error('模型输出尺寸异常 ' + ow + 'x' + oh);

      // 原图实际尺寸
      const srcW = (typeof src.naturalWidth === 'number') ? src.naturalWidth : src.width;
      const srcH = (typeof src.naturalHeight === 'number') ? src.naturalHeight : src.height;

      // 1) 阈值二值化（0/255）
      const bin = new Uint8Array(n);
      for (let i = 0; i < n; i++) bin[i] = raw[i] >= threshold ? 255 : 0;

      // 2) 最大连通域（4 邻域 BFS）
      const largest = largestComponent(bin, W, H);

      // 3) 双线性上采样回原尺寸 (0~255 浮点)
      const high = scaleBilinear(largest, W, H, srcW, srcH);

      // 4) 轻柔羽化：box blur 近似高斯 σ≈feather，保持软边
      let soft = high;
      const radius = Math.max(1, Math.round(feather));
      soft = boxBlur(soft, srcW, srcH, radius);

      return { mask: soft, width: srcW, height: srcH, mask320: largest, mw: W, mh: H };
    }

    /** 在 canvas 上叠加 mask（红色半透明）用于预览 */
    drawMaskOverlay(ctx, mask, w, h) {
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < w * h; i++) {
        const a = mask[i] / 255;
        if (a > 0.02) {
          d[i * 4] = Math.min(255, d[i * 4] + 120 * a);   // 红
          d[i * 4 + 1] = d[i * 4 + 1] * (1 - 0.5 * a);
          d[i * 4 + 2] = d[i * 4 + 2] * (1 - 0.5 * a);
        }
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  /* ---------- 工具函数（局部） ---------- */

  function largestComponent(bin, w, h) {
    const visited = new Uint8Array(w * h);
    const label = new Uint32Array(w * h);
    const areas = [];
    let cur = 0;
    const stack = new Int32Array(1 << 16);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (bin[idx] === 255 && !visited[idx]) {
          cur++;
          let area = 0;
          let sp = 0;
          stack[sp++] = idx;
          visited[idx] = 1;
          while (sp > 0) {
            const p = stack[--sp];
            label[p] = cur;
            area++;
            const px = p % w, py = (p / w) | 0;
            // 4 邻域
            if (px > 0     && bin[p - 1] === 255 && !visited[p - 1]) { visited[p - 1] = 1; stack[sp++] = p - 1; }
            if (px < w - 1 && bin[p + 1] === 255 && !visited[p + 1]) { visited[p + 1] = 1; stack[sp++] = p + 1; }
            if (py > 0     && bin[p - w] === 255 && !visited[p - w]) { visited[p - w] = 1; stack[sp++] = p - w; }
            if (py < h - 1 && bin[p + w] === 255 && !visited[p + w]) { visited[p + w] = 1; stack[sp++] = p + w; }
          }
          areas.push(area);
        }
      }
    }
    if (!areas.length) return new Uint8Array(w * h);
    let best = 0;
    for (let i = 1; i < areas.length; i++) if (areas[i] > areas[best]) best = i;
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (label[i] === best + 1) out[i] = 255;
    return out;
  }

  function scaleBilinear(src, sw, sh, dw, dh) {
    const out = new Float32Array(dw * dh);
    if (dw === sw && dh === sh) {
      for (let i = 0; i < dw * dh; i++) out[i] = src[i];
      return out;
    }
    const xr = sw / dw, yr = sh / dh;
    for (let dy = 0; dy < dh; dy++) {
      const sy = dy * yr;
      const y0 = Math.floor(sy);
      const y1 = Math.min(sh - 1, y0 + 1);
      const wy = sy - y0;
      for (let dx = 0; dx < dw; dx++) {
        const sx = dx * xr;
        const x0 = Math.floor(sx);
        const x1 = Math.min(sw - 1, x0 + 1);
        const wx = sx - x0;
        const v00 = src[y0 * sw + x0], v01 = src[y0 * sw + x1];
        const v10 = src[y1 * sw + x0], v11 = src[y1 * sw + x1];
        const top = v00 + (v01 - v00) * wx;
        const bot = v10 + (v11 - v10) * wx;
        out[dy * dw + dx] = top + (bot - top) * wy;
      }
    }
    return out;
  }

  function blurPass(src, w, h, radius) {
    const r = Math.max(1, radius);
    const win = r * 2 + 1;
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    // 水平滑动窗口（边界 clamp 复制）
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[y * w + (x < 0 ? 0 : (x > w - 1 ? w - 1 : x))];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = sum / win;
        sum -= src[y * w + (x - r < 0 ? 0 : x - r)];
        sum += src[y * w + (x + r + 1 > w - 1 ? w - 1 : x + r + 1)];
      }
    }
    // 垂直滑动窗口（边界 clamp 复制）
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[(y < 0 ? 0 : (y > h - 1 ? h - 1 : y)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / win;
        sum -= tmp[(y - r < 0 ? 0 : y - r) * w + x];
        sum += tmp[(y + r + 1 > h - 1 ? h - 1 : y + r + 1) * w + x];
      }
    }
    return out;
  }

  function boxBlur(src, w, h, radius) {
    // 两次 box blur 提升近似度（σ≈r/0.82），输出保持 0~255
    return blurPass(blurPass(src, w, h, radius), w, h, radius);
  }

  global.Segmenter = Segmenter;
})(window);
