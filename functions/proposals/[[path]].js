// proposals/[[path]].js — 方案汇报「网页文件夹」托管 + 访问密码校验
// 路由: /proposals/<slug>/...        （slug 为方案条目的目录标识）
//
// 逻辑:
//   1. 读取 R2 索引 proposals-index.json，找到 slug 对应的方案条目
//   2. 条目未设置密码 → 直接返回 R2 中 proposals/<slug>/<相对路径> 的内容
//   3. 条目已设置密码 → 校验 cookie qs_pp_<slug>
//        未通过: GET 返回密码输入页；POST 校验通过后写 cookie 并 302 回原地址
//   4. 目录根路径（/proposals/<slug>/ 或空路径）自动取条目 entry（默认 index.html）
//
// 依赖: R2 bucket binding = IMAGES，索引键 proposals-index.json

const INDEX_KEY = 'proposals-index.json';

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript; charset=utf-8', mjs: 'application/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  pdf: 'application/pdf', zip: 'application/zip', wasm: 'application/wasm'
};

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);

  const segs = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const slug = (segs[0] || '').trim();
  const rest = segs.slice(1).join('/');

  if (!slug) {
    // /proposals 本身：直接回列表页静态文件。
    // 注意不能 302 到 /proposals.html —— 站点开启 clean URL，/proposals.html 会 308 回 /proposals，形成重定向环。
    try {
      if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        const assetUrl = new URL('/proposals.html', url.origin);
        return await env.ASSETS.fetch(new Request(assetUrl.toString(), { headers: request.headers }));
      }
    } catch (e) {
      // 落到下方提示页
    }
    return htmlResponse(notFoundPage('方案汇报', '请从 <a href="/proposals.html">方案汇报列表</a> 进入'), 200);
  }

  const index = await readIndex(env);
  const item = (index.items || []).find((it) => (it.slug || '').trim() === slug);

  if (!item) {
    return htmlResponse(notFoundPage('未找到该方案汇报', '方案不存在或已被删除'), 404);
  }

  // 图文型方案（无网页目录）→ 交回详情页
  if (!hasPageDir(item)) {
    return Response.redirect(url.origin + '/proposal.html?id=' + encodeURIComponent(item.id), 302);
  }

  const password = String(item.password || '');
  const cookieName = 'qs_pp_' + slug;
  const relPath = sanitizeRel(rest) || String(item.entry || 'index.html').replace(/^\/+/, '') || 'index.html';

  // ---------- 密码校验 ----------
  if (password) {
    const expect = await makeToken(slug, password);
    // 兼容详情页解锁接口（/api/proposals POST）写入的 cookie：qs_pp_<id>，令牌基于条目 id
    const expectById = await makeToken(item.id, password);
    const got = readCookie(request, cookieName);
    const gotById = readCookie(request, 'qs_pp_' + item.id);
    let unlocked = (got && got === expect) || (gotById && gotById === expectById);

    // 小程序 web-view 免密直达：URL 携带 ?pp=<token>（基于条目 id 的解锁令牌，与小程序 storage 一致）
    // 校验通过后 302 回原路径并种下 qs_pp_<slug> cookie，web-view 内后续同源页面（含内页/资源）自动免密
    const pp = (url.searchParams.get('pp') || '').trim();
    if (!unlocked && pp && pp === expectById) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': url.origin + url.pathname,
          'Set-Cookie': cookieName + '=' + expect + '; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax',
          'Cache-Control': 'no-store'
        }
      });
    }

    if (!unlocked && request.method === 'POST') {
      let submitted = '';
      try {
        const form = await request.formData();
        submitted = String(form.get('password') || '');
      } catch (e) {
        submitted = '';
      }
      if (submitted && (await makeToken(slug, submitted)) === expect) {
        const target = url.origin + url.pathname;
        return new Response(null, {
          status: 302,
          headers: {
            'Location': target,
            'Set-Cookie': cookieName + '=' + expect + '; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax',
            'Cache-Control': 'no-store'
          }
        });
      }
      return htmlResponse(gatePage(item, slug, true), 401);
    }

    if (!unlocked) {
      return htmlResponse(gatePage(item, slug, false), 200);
    }
  }

  // ---------- 返回文件 ----------
  const key = 'proposals/' + slug + '/' + relPath;
  const obj = await env.IMAGES.get(key);
  if (!obj) {
    return htmlResponse(notFoundPage('文件不存在', '该方案目录下没有找到 ' + escapeHtml(relPath)), 404);
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Content-Type', mimeOf(relPath));
  headers.set('etag', obj.httpEtag);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', password ? 'private, max-age=0, must-revalidate' : 'public, max-age=300');
  headers.set('X-Robots-Tag', 'noindex');

  // HTML 文件统一注入移动端适配（网页文件夹为桌面版 HTML，小程序 web-view 打开时自动优化排版）
  if (/\.html?$/i.test(relPath)) {
    const text = await obj.text();
    const injected = injectMobileCss(text);
    return new Response(injected, { headers });
  }
  return new Response(obj.body, { headers });
}

// ---------- 工具 ----------
// 为网页文件夹 HTML 注入移动端适配：缺失 viewport 时补 viewport，并追加窄屏 CSS + 兜底 JS。
// 网页文件夹是桌面宽屏"幻灯片 deck"（html-ppt 运行时：.deck 100vh + .slide 绝对定位 + 键盘翻页 +
// 多栏 grid + 固定大字号 + 绝对定位页脚），移动端必须整体改写布局才能阅读。
// 仅响应时注入，不修改 R2 原文件；CSS/JS 均以 820px 断点隔离，桌面端不受影响。
function injectMobileCss(html) {
  let out = String(html || '');

  // 1) viewport（原 HTML 缺失时补上，避免按 980px 缩放渲染）
  if (!/<meta[^>]+name=["']viewport["']/i.test(out)) {
    const vp = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">';
    if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, vp + '\n</head>');
    } else {
      out = vp + '\n' + out;
    }
  }

  // 2) 窄屏样式：覆盖 html-ppt 幻灯片布局根因（全部 !important 压过页面内联样式）
  const css = '<style id="qs-mobile-adapt">\n' +
    '@media (max-width: 820px) {\n' +
    '  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }\n' +
    '  html { -webkit-text-size-adjust: 100%; }\n' +
    '  html, body { width: auto !important; max-width: 100% !important; overflow-x: hidden !important; }\n' +
    '  body { padding: 0 14px 30px !important; font-size: 15px !important; line-height: 1.65 !important; }\n' +
    // --- 幻灯片 deck 展开为流式长页（根因 1：.slide 绝对定位 100vh + opacity 切换 + overflow hidden）---
    '  .deck { position: static !important; width: auto !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }\n' +
    '  .slide {\n' +
    '    position: relative !important; top: auto !important; left: auto !important; right: auto !important; bottom: auto !important;\n' +
    '    width: auto !important; height: auto !important; min-height: 0 !important;\n' +
    '    display: flex !important; flex-direction: column !important; justify-content: flex-start !important;\n' +
    '    opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;\n' +
    '    transform: none !important;\n' +
    '    overflow: visible !important;\n' +
    '    padding: 46px 2px 34px !important; margin: 0 0 12px !important;\n' +
    '    border-bottom: 1px solid rgba(0,0,0,.08);\n' +
    '  }\n' +
    '  .deck-header, .progress-bar, .overview, .notes-overlay { display: none !important; }\n' +
    // --- 多栏 grid / flex 转单列（根因 2：g2/g3/g4/gg/steps/tl 多栏在窄屏挤压竖排）---
    '  .grid, .g2, .g3, .g4, .gg, .steps, .tl, .tl .row { grid-template-columns: 1fr !important; grid-template-rows: none !important; }\n' +
    '  .grid > *, .gg > *, .steps > *, .tl .item { grid-column: auto !important; grid-row: auto !important; }\n' +
    '  .row { flex-wrap: wrap !important; }\n' +
    '  .row > * { flex: 1 1 auto !important; min-width: 0 !important; }\n' +
    '  .tl::before { display: none !important; }\n' +
    // --- 大字号缩放（根因 3：内联 font-size 96/104px 放不下逐字竖排）---
    '  h1, .h1 { font-size: 30px !important; line-height: 1.18 !important; }\n' +
    '  h2, .h2 { font-size: 24px !important; line-height: 1.22 !important; }\n' +
    '  h3, .h3 { font-size: 20px !important; line-height: 1.25 !important; }\n' +
    '  h4, .h4 { font-size: 17px !important; line-height: 1.35 !important; }\n' +
    '  .lede { font-size: 16px !important; line-height: 1.6 !important; max-width: none !important; }\n' +
    '  .big-num { font-size: 34px !important; }\n' +
    '  .eyebrow, .kicker { font-size: 12px !important; letter-spacing: .08em !important; }\n' +
    // --- 页脚绝对定位改静态（根因 4：.foot bottom:24px 依赖 84px 边距，窄屏被裁）---
    '  .foot { position: static !important; bottom: auto !important; left: auto !important; right: auto !important; margin-top: 24px !important; padding-top: 10px !important; }\n' +
    // --- 图片容器取消固定高宽（根因 5：.ph/.gg 固定尺寸 + object-fit + min-height:0 致白块）---
    '  img, video, iframe, canvas, svg { max-width: 100% !important; height: auto !important; }\n' +
    '  .ph, .gg .cell { height: auto !important; min-height: 0 !important; overflow: visible !important; box-shadow: none !important; }\n' +
    '  .ph img, .gg .cell img { width: 100% !important; height: auto !important; object-fit: contain !important; position: static !important; }\n' +
    '  .ph.contain { background: #fff !important; }\n' +
    // --- 表格横向滚动（根因 7：table 强制 width:100% 会压缩列宽致多栏挤压/竖排/数字裁切；
    //    改 width:max-content + min-width:100%，表格按内容自然宽度展开，超出部分横滑阅读）---
    '  table { display: block !important; width: max-content !important; max-width: none !important; min-width: 100% !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; }\n' +
    '  td, th { white-space: nowrap !important; }\n' +
    '  .t td, .t th { padding: 9px 12px !important; }\n' +
    // --- 动画静态化（防止入场动画初始 opacity:0 导致内容不可见）---
    '  [data-anim], [class*="anim-"] { animation: none !important; opacity: 1 !important; transform: none !important; filter: none !important; }\n' +
    // --- 悬浮返回导航改静态（根因 6：#qs-return-nav fixed 遮挡首屏）---
    '  #qs-return-nav { position: static !important; top: auto !important; right: auto !important; display: flex !important; flex-wrap: wrap !important; gap: 6px !important; padding: 10px 0 0 !important; }\n' +
    '  #qs-return-nav a { font-size: 12px !important; padding: 6px 10px !important; }\n' +
    // --- 其他可读性 ---
    '  pre { white-space: pre-wrap !important; word-break: break-word !important; }\n' +
    '}\n' +
    '</style>';

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, css + '\n</head>');
  } else if (/<body([^>]*)>/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, css + '\n<body$1>');
  } else {
    out = css + '\n' + out;
  }

  // 3) 窄屏兜底 JS：压过内联 style 字号并强制展开绝对定位 slide（CSS !important 之外的双保险）
  const fix = '<script id="qs-mobile-fix">\n' +
    '(function () {\n' +
    '  try {\n' +
    '    if (window.innerWidth > 820) return;\n' +
    '    var els = document.querySelectorAll("h1,h2,h3,h4,.big-num,.lede");\n' +
    '    var fs = { H1: "30px", H2: "24px", H3: "20px", H4: "17px" };\n' +
    '    var lh = { H1: "1.18", H2: "1.22", H3: "1.25", H4: "1.35" };\n' +
    '    for (var i = 0; i < els.length; i++) {\n' +
    '      var el = els[i], tag = el.tagName, s = el.style;\n' +
    '      if (!s || !s.fontSize) continue;\n' +
    '      if (fs[tag]) { s.setProperty("font-size", fs[tag], "important"); if (s.lineHeight) s.setProperty("line-height", lh[tag], "important"); }\n' +
    '      else if (el.className && String(el.className).indexOf("big-num") >= 0) s.setProperty("font-size", "34px", "important");\n' +
    '      else if (el.className && String(el.className).indexOf("lede") >= 0) s.setProperty("font-size", "16px", "important");\n' +
    '    }\n' +
    '    var tbs = document.querySelectorAll("table");\n' +
    '    for (var j = 0; j < tbs.length; j++) {\n' +
    '      var tb = tbs[j], p = tb.parentNode;\n' +
    '      if (!p || p.nodeName === "BODY") continue;\n' +
    '      if (p.className && String(p.className).indexOf("qs-tbl-wrap") >= 0) continue;\n' +
    '      var w = document.createElement("div");\n' +
    '      w.className = "qs-tbl-wrap";\n' +
    '      w.style.cssText = "overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%;max-width:100%;";\n' +
    '      p.insertBefore(w, tb);\n' +
    '      w.appendChild(tb);\n' +
    '    }\n' +
    '  } catch (e) {}\n' +
    '})();\n' +
    '</script>';

  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, fix + '\n</body>');
  } else {
    out = out + '\n' + fix;
  }
  return out;
}

function mimeOf(path) {
  const m = path.match(/\.([A-Za-z0-9]+)$/);
  if (!m) return 'application/octet-stream';
  return MIME[m[1].toLowerCase()] || 'application/octet-stream';
}

function hasPageDir(item) {
  if (!item) return false;
  if (item.type === 'page') return true;
  if (String(item.slug || '').trim() && Number(item.file_count || 0) > 0) return true;
  return false;
}

function sanitizeRel(raw) {
  let p = String(raw || '').replace(/\\/g, '/').trim();
  if (!p) return '';
  const segs = p.split('/').filter((s) => s && s !== '.');
  if (!segs.length) return '';
  if (segs.some((s) => s === '..')) return '';
  return segs.join('/');
}

async function readIndex(env) {
  try {
    const obj = await env.IMAGES.get(INDEX_KEY);
    if (!obj) return { items: [] };
    const parsed = JSON.parse(await obj.text());
    if (parsed && Array.isArray(parsed.items)) return parsed;
    return { items: [] };
  } catch (e) {
    return { items: [] };
  }
}

async function makeToken(slug, password) {
  const data = new TextEncoder().encode('qs-prop|' + slug + '|' + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const parts = raw.split(';');
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    if (p.slice(0, i).trim() === name) return p.slice(i + 1).trim();
  }
  return '';
}

function escapeHtml(str) {
  return String(str === undefined || str === null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status: status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex'
    }
  });
}

// ---------- 页面模板 ----------
function baseStyle() {
  return `
* { margin:0; padding:0; box-sizing:border-box; }
body {
  font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  min-height:100vh; display:flex; align-items:center; justify-content:center;
  background:#F7F7F8; color:#1D1D1F; padding:24px;
  -webkit-font-smoothing:antialiased;
}
.box { width:100%; max-width:400px; background:#fff; border-radius:16px; padding:40px 32px;
  box-shadow:0 10px 40px rgba(0,0,0,0.08); text-align:center; }
.logo { width:52px; height:52px; border-radius:50%; border:2px solid #C9A96E; object-fit:cover; margin-bottom:18px; }
h1 { font-size:20px; font-weight:600; letter-spacing:0.5px; }
.sub { color:#86868B; font-size:13px; margin-top:8px; line-height:1.7; }
.line { width:36px; height:3px; background:#C9A96E; border-radius:2px; margin:18px auto; }
input[type=password] { width:100%; height:46px; border:1px solid #E5E5E7; border-radius:10px;
  padding:0 14px; font-size:15px; font-family:inherit; outline:none; transition:border-color .2s; }
input[type=password]:focus { border-color:#C9A96E; }
button { width:100%; height:46px; margin-top:14px; border:none; border-radius:10px;
  background:#C9A96E; color:#fff; font-size:15px; font-weight:500; font-family:inherit; cursor:pointer;
  transition:background .2s; }
button:hover { background:#B8995E; }
.err { color:#E74C3C; font-size:13px; margin-top:12px; }
a { color:#C9A96E; text-decoration:none; font-size:13px; }
.foot { margin-top:24px; color:#C7C7CC; font-size:12px; }
`;
}

function gatePage(item, slug, failed) {
  const title = escapeHtml(item && item.title ? item.title : '方案汇报');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${title} | 青松设计</title>
<style>${baseStyle()}</style>
</head>
<body>
<div class="box">
  <img class="logo" src="/cdn/logo.jpg" alt="青松设计">
  <h1>${title}</h1>
  <div class="line"></div>
  <div class="sub">该方案汇报已加密<br>请输入访问密码查看</div>
  <form method="POST" style="margin-top:22px;">
    <input type="password" name="password" placeholder="请输入访问密码" autocomplete="current-password" autofocus required>
    <button type="submit">进 入</button>
  </form>
  ${failed ? '<div class="err">密码不正确，请重新输入</div>' : ''}
  <div class="foot">青松设计 · QINGSONG DESIGN</div>
</div>
</body>
</html>`;
}

function notFoundPage(title, message) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} | 青松设计</title>
<style>${baseStyle()}</style>
</head>
<body>
<div class="box">
  <img class="logo" src="/cdn/logo.jpg" alt="青松设计">
  <h1>${escapeHtml(title)}</h1>
  <div class="line"></div>
  <div class="sub">${message}</div>
  <div style="margin-top:22px;"><a href="/proposals.html">&larr; 返回方案汇报列表</a></div>
</div>
</body>
</html>`;
}
