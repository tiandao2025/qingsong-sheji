/* ============================================================
 * inpaint.js — 前端轻量擦除（去人物）
 * 原理：对被 mask 覆盖的区域做"从边界向内扩散"的均值填补
 * （简化 BFS/Telea 迭代扩散），纯 JS，无需后端。
 * 效果边界：纯色/简单背景效果好；复杂背景边缘可能残留。
 * ============================================================ */
(function (global) {
  'use strict';

  /**
   * 对 ImageData 中 mask 覆盖区域做扩散擦除。
   * @param {ImageData} imgData 原地修改的像素缓冲
   * @param {Uint8Array|Float32Array} mask 与 imgData 同尺寸，>0.5 视为待擦除区域
   * @returns {Promise<number>} 完成轮数
   */
  function diffuseInpaint(imgData, mask) {
    return new Promise((resolve, reject) => {
      try {
        const w = imgData.width, h = imgData.height;
        const n = w * h;
        const data = imgData.data; // RGBA
        const pixels = new Float32Array(n * 3); // 工作缓冲 RGB
        const known = new Uint8Array(n);         // 1=已确定值
        for (let i = 0; i < n; i++) {
          pixels[i * 3] = data[i * 4];
          pixels[i * 3 + 1] = data[i * 4 + 1];
          pixels[i * 3 + 2] = data[i * 4 + 2];
          known[i] = (mask[i] > 0.5) ? 0 : 1;
        }

        // 队列：待填像素。初始为"未知但邻域已知"的边界像素
        let queue = [];
        const queued = new Uint8Array(n);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!known[idx] && hasKnownNeighbor(idx, x, y, w, h, known)) {
              queue.push(idx);
              queued[idx] = 1;
            }
          }
        }

        // 保护：mask 覆盖全部区域（无已知邻居）时直接返回
        if (!queue.length) { resolve(0); return; }

        // 8 邻域偏移
        const NX = [-1, 0, 1, -1, 1, -1, 0, 1];
        const NY = [-1, -1, -1, 0, 0, 1, 1, 1];

        let rounds = 0;
        while (queue.length) {
          rounds++;
          const next = [];
          for (let qi = 0; qi < queue.length; qi++) {
            const idx = queue[qi];
            const x = idx % w, y = (idx / w) | 0;
            // 收集已知邻域均值与计数
            let r = 0, g = 0, b = 0, cnt = 0;
            for (let k = 0; k < 8; k++) {
              const nx = x + NX[k], ny = y + NY[k];
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx;
              if (known[ni]) {
                r += pixels[ni * 3]; g += pixels[ni * 3 + 1]; b += pixels[ni * 3 + 2];
                cnt++;
              }
            }
            if (cnt > 0) {
              pixels[idx * 3] = r / cnt;
              pixels[idx * 3 + 1] = g / cnt;
              pixels[idx * 3 + 2] = b / cnt;
              known[idx] = 1;
              // 把相邻未知像素压入下一轮
              for (let k = 0; k < 8; k++) {
                const nx = x + NX[k], ny = y + NY[k];
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const ni = ny * w + nx;
                if (!known[ni] && !queued[ni]) {
                  queued[ni] = 1;
                  next.push(ni);
                }
              }
            } else {
              next.push(idx); // 暂无已知邻域，下轮重试
            }
          }
          queue = next;
          if (rounds > 4000000) break; // 安全上限
        }

        // 写回
        for (let i = 0; i < n; i++) {
          data[i * 4] = Math.round(pixels[i * 3]);
          data[i * 4 + 1] = Math.round(pixels[i * 3 + 1]);
          data[i * 4 + 2] = Math.round(pixels[i * 3 + 2]);
        }
        resolve(rounds);
      } catch (e) { reject(e); }
    });
  }

  function hasKnownNeighbor(idx, x, y, w, h, known) {
    if (x > 0     && known[idx - 1]) return true;
    if (x < w - 1 && known[idx + 1]) return true;
    if (y > 0     && known[idx - w]) return true;
    if (y < h - 1 && known[idx + w]) return true;
    return false;
  }

  global.diffuseInpaint = diffuseInpaint;
})(window);
