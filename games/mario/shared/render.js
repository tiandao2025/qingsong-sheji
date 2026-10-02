var R = (function () {
  var API = {};
  var cv = null, ctx = null;
  var cvBuf = null, ctxBuf = null;
  var VW = 256, VH = 240;   // VH is fixed by the 15-row tilemap; VW adapts to aspect ratio
  var SCALE = 2;
  var fontCache = {};

  function hex2rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function rgbStr(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  function sprite(name) { return ART.sprites[name]; }

  function makeSurface(w, h) {
    var mk = API.createCanvas;
    var c = mk(w, h);
    return { canvas: c, ctx: c.getContext('2d') };
  }

  function blit(sp, x, y, flip, tint, alpha) {
    if (!sp) return;
    var c = ctxBuf;
    c.save();
    if (alpha != null) c.globalAlpha = alpha;
    if (tint) {
      var t = tintCache[tint] || (tintCache[tint] = tintCanvas(sp, tint));
      if (flip) {
        c.translate(x + sp.w, y);
        c.scale(-1, 1);
        c.drawImage(t, 0, 0);
      } else {
        c.drawImage(t, x, y);
      }
    } else {
      if (flip) {
        c.translate(x + sp.w, y);
        c.scale(-1, 1);
        c.drawImage(sp.canvas, 0, 0);
      } else {
        c.drawImage(sp.canvas, x, y);
      }
    }
    c.restore();
  }

  var tintCache = {};
  function tintCanvas(sp, key) {
    var parts = key.split('|');
    var body = parts[0];
    var flash = parts.length > 1 ? parts[1] : null;
    var c = API.createCanvas(sp.w, sp.h);
    var g = c.getContext('2d');
    g.drawImage(sp.canvas, 0, 0);
    if (body === 'white') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, sp.w, sp.h);
    } else if (body === 'palette') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = flash || '#fcd000';
      g.fillRect(0, 0, sp.w, sp.h);
    }
    return c;
  }

  function drawText(str, x, y, colorKey, align, scale, shadow) {
    scale = scale || 1;
    var glyphs = ART.fonts[colorKey] || ART.fonts.W;
    str = ('' + str).toUpperCase();
    var gw = 5, gh = 7, sp = 1;
    var total = 0, i;
    for (i = 0; i < str.length; i++) {
      var g = glyphs[str.charAt(i)] || glyphs['?'];
      total += (g.w + sp) * scale;
    }
    total -= sp * scale;
    var cx = x;
    if (align === 'center') cx = x - Math.floor(total / 2);
    else if (align === 'right') cx = x - total;
    if (shadow) {
      drawTextRaw(str, cx + scale, y + scale, 'K', scale);
    }
    drawTextRaw(str, cx, y, colorKey, scale);
    return total;
  }
  function drawTextRaw(str, x, y, colorKey, scale) {
    var glyphs = ART.fonts[colorKey] || ART.fonts.W;
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var g = glyphs[ch] || glyphs[' '];
      if (ch !== ' ') {
        ctxBuf.drawImage(g.canvas, cx, y, g.w * scale, g.h * scale);
      }
      cx += (g.w + 1) * scale;
    }
  }
  function textWidth(str, scale) {
    var glyphs = ART.fonts.W;
    var s = ('' + str).length;
    return s * 6 * (scale || 1) - (scale || 1);
  }

  var THEME = {
    overworld: { sky: ['#5c94fc', '#a8e0fc'], cloud: 'cloud_tl', sun: null },
    underground: { sky: ['#0c1030', '#1c2450'], cloud: null },
    castle: { sky: ['#100c1c', '#2a1c30'], cloud: null }
  };

  function drawSky(theme) {
    var t = THEME[theme] || THEME.overworld;
    var g = ctxBuf.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(1, t.sky[1]);
    ctxBuf.fillStyle = g;
    ctxBuf.fillRect(0, 0, VW, VH);
    if (theme === 'overworld') {
      var g2 = ctxBuf.createLinearGradient(0, 0, 0, 96);
      g2.addColorStop(0, 'rgba(255,255,255,0)');
      g2.addColorStop(1, 'rgba(255,255,255,0.10)');
      ctxBuf.fillStyle = g2;
      ctxBuf.fillRect(0, 0, VW, 96);
    }
  }

  function drawCloudPair(x, y) {
    blit(sprite('cloud_tl'), x, y);
    blit(sprite('cloud_tm'), x + 14, y);
    blit(sprite('cloud_tr'), x + 28, y);
  }

  function drawBushPair(x, y) {
    blit(sprite('bush_l'), x, y - 8);
    blit(sprite('bush_m'), x + 14, y - 8);
    blit(sprite('bush_r'), x + 28, y - 8);
  }

  function drawHillPair(x, y) {
    blit(sprite('hill_l'), x, y - 16);
    blit(sprite('hill_m'), x + 14, y - 16);
    blit(sprite('hill_r'), x + 28, y - 16);
  }

  function drawCastle(x, y) {
    // x,y = left edge / ground line. Castle is 80px wide (5 tiles), 96px tall.
    var col, row;
    // rows: 0 = top ... 5 = ground line
    for (row = 0; row < 5; row++) {
      var yy = y - 16 - row * 16;
      for (col = 0; col < 5; col++) {
        var xx = x + col * 16;
        // battlements (crenellations) on the top row
        if (row === 0 && (col === 0 || col === 2 || col === 4)) continue;
        blit(sprite('castle_brick'), xx, yy);
      }
    }
    // side tower windows
    blit(sprite('castle_win'), x, y - 16 - 3 * 16);
    blit(sprite('castle_win'), x + 64, y - 16 - 3 * 16);
    // keep (raised center block, 2 tiles wide)
    blit(sprite('castle_brick'), x + 16, y - 16 - 5 * 16);
    blit(sprite('castle_brick'), x + 32, y - 16 - 5 * 16);
    blit(sprite('castle_brick'), x + 16, y - 16 - 4 * 16);
    blit(sprite('castle_brick'), x + 32, y - 16 - 4 * 16);
    // keep window
    blit(sprite('castle_win'), x + 16, y - 16 - 5 * 16);
    // battlements on the keep
    blit(sprite('castle_brick'), x + 32, y - 16 - 6 * 16);
    // ground line
    blit(sprite('castle_brick'), x, y);
    blit(sprite('castle_brick'), x + 16, y);
    blit(sprite('castle_brick'), x + 32, y);
    blit(sprite('castle_brick'), x + 48, y);
    blit(sprite('castle_brick'), x + 64, y);
    // arched door (2 tiles wide)
    blit(sprite('castle_door'), x + 16, y - 16);
    blit(sprite('castle_door'), x + 32, y - 16);
    blit(sprite('castle_door'), x + 16, y);
    blit(sprite('castle_door'), x + 32, y);
  }



  function hud(g) {
    var y = 5, w = VW;
    drawText(g.score, 8, y, 'W', 'left', 1, true);
    drawText('@' + g.coins, Math.round(w * 0.26), y, 'Y', 'left', 1, true);
    drawText('x' + g.lives, Math.round(w * 0.44), y, 'W', 'left', 1, true);
    drawText(g.world, Math.round(w * 0.66), y, 'W', 'left', 1, true);
    drawText(U.pad(g.time, 3), Math.round(w * 0.84), y, 'W', 'left', 1, true);
    if (g.mute) drawText('M', Math.round(w * 0.93), y, 'Y', 'left', 1, true);
  }


  function present() {
    var el = API.display;
    if (el && el.tagName === 'CANVAS') {
      var bw = Math.max(1, Math.round(el.clientWidth || VW * SCALE));
      var bh = Math.max(1, Math.round(el.clientHeight || VH * SCALE));
      if (el.width !== bw || el.height !== bh) { el.width = bw; el.height = bh; }
      var dctx = el.getContext('2d');
      dctx.imageSmoothingEnabled = false;
      dctx.clearRect(0, 0, bw, bh);

      var BW = cvBuf.width, BH = cvBuf.height;
      var bufAspect = BW / BH, dispAspect = bw / bh;
      var k;
      // Display wider than the buffer -> match heights (width crops/pads).
      // Display taller (portrait) -> match widths (height pads) = classic letterbox.
      if (dispAspect >= bufAspect) k = bh / BH;
      else k = bw / BW;

      var dw = BW * k, dh = BH * k;
      var dx = (bw - dw) / 2, dy = (bh - dh) / 2;
      dctx.drawImage(cvBuf, 0, 0, BW, BH, dx, dy, dw, dh);
    }
    if (API.onPresent) API.onPresent(cvBuf, VW * SCALE, VH * SCALE);
  }

  function beginFrame() {
    ctxBuf.setTransform(1, 0, 0, 1, 0, 0);
    ctxBuf.clearRect(0, 0, VW * SCALE, VH * SCALE);
    ctxBuf.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  }
  function endFrame() { ctxBuf.restore(); }

  function clip(x, y, w, h) {
    ctxBuf.save();
    ctxBuf.beginPath();
    ctxBuf.rect(x, y, w, h);
    ctxBuf.clip();
  }
  function unclip() { ctxBuf.restore(); }

  function fillRect(x, y, w, h, color) {
    ctxBuf.fillStyle = color;
    ctxBuf.fillRect(x, y, w, h);
  }
  function fillScreen(color) {
    ctxBuf.fillStyle = color;
    ctxBuf.fillRect(0, 0, VW, VH);
  }
  function translate(x, y) {
    ctxBuf.save();
    ctxBuf.translate(x, y);
  }
  function identity() {
    ctxBuf.restore();
    // back to scale-space (beginFrame applied SCALE)
    ctxBuf.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  }

  function setScale(s) {
    s = Math.max(1, Math.min(6, s | 0));
    if (s === SCALE) return;
    SCALE = s;
    rebuild();
  }

  // Change the virtual viewport, then rebuild the frame buffer.
  function setViewport(w, h) {
    w = Math.max(200, Math.round(w));
    h = Math.max(160, Math.round(h));
    if (w === VW && h === VH) return;
    VW = w; VH = h;
    rebuild();
  }

  function rebuild() {
    if (!API.createCanvas) return;
    cvBuf = API.createCanvas(VW * SCALE, VH * SCALE);
    ctxBuf = cvBuf.getContext('2d');
    ctxBuf.imageSmoothingEnabled = false;
    if (API.display && API.display.tagName === 'CANVAS') {
      API.display.width = VW * SCALE;
      API.display.height = VH * SCALE;
    }
  }
  function getScale() { return SCALE; }
  function width() { return VW; }
  function height() { return VH; }

  API.init = function (createCanvas, display) {
    API.createCanvas = createCanvas;
    API.display = display;
    cvBuf = createCanvas(VW * SCALE, VH * SCALE);
    ctxBuf = cvBuf.getContext('2d');
    ctxBuf.imageSmoothingEnabled = false;
    // pre-render all sprites + fonts
    bakeAll();
    if (display && display.tagName === 'CANVAS') {
      display.width = VW * SCALE;
      display.height = VH * SCALE;
    }
  };
  function bakeAll() {
    for (var name in ART.sprites) {
      var sp = ART.sprites[name];
      sp.canvas = API.createCanvas(sp.w, sp.h);
      var g = sp.canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      for (var y = 0; y < sp.h; y++) {
        for (var x = 0; x < sp.w; x++) {
          var c = sp.data[y * sp.w + x];
          if (!c) continue;
          g.fillStyle = c;
          g.fillRect(x, y, 1, 1);
        }
      }
    }
    for (var f in ART.fonts) {
      var glyphs = ART.fonts[f];
      for (var ch in glyphs) {
        var gl = glyphs[ch];
        gl.canvas = API.createCanvas(gl.w, gl.h);
        var gg = gl.canvas.getContext('2d');
        for (var gy = 0; gy < gl.h; gy++) {
          for (var gx = 0; gx < gl.w; gx++) {
            var gc = gl.data[gy * gl.w + gx];
            if (!gc) continue;
            gg.fillStyle = gc;
            gg.fillRect(gx, gy, 1, 1);
          }
        }
      }
    }
  }

  API.getVW = function () { return VW; };
  API.getVH = function () { return VH; };
  API.blit = blit;
  API.sprite = sprite;
  API.drawText = drawText;
  API.textWidth = textWidth;
  API.drawSky = drawSky;
  API.drawCloudPair = drawCloudPair;
  API.drawBushPair = drawBushPair;
  API.drawHillPair = drawHillPair;
  API.drawCastle = drawCastle;
  API.hud = hud;
  API.present = present;
  API.beginFrame = beginFrame;
  API.endFrame = endFrame;
  API.clip = clip;
  API.unclip = unclip;
  API.fillRect = fillRect;
  API.fillScreen = fillScreen;
  API.translate = translate;
  API.identity = identity;
  API.setScale = setScale;
  API.setViewport = setViewport;
  API.getScale = getScale;
  API.w = width;
  API.h = height;
  API.reset = function () { tintCache = {}; };
  API.buffer = function () { return cvBuf; };
  API.scale = function () { return SCALE; };
  return API;
})();
