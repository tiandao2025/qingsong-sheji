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
    return Response.redirect(url.origin + '/proposals.html', 302);
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
    const got = readCookie(request, cookieName);
    let unlocked = got && got === expect;

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
  return new Response(obj.body, { headers });
}

// ---------- 工具 ----------
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
