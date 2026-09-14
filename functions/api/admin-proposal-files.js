// admin-proposal-files.js — 方案汇报「网页文件夹」上传与管理 API (Cloudflare Pages Functions)
// 路由: /api/admin-proposal-files
//
// POST   /api/admin-proposal-files            上传一批文件（multipart/form-data）
//          字段: slug   必填，目录标识（字母数字 . _ -）
//                mode   append（默认）| replace（先清空该目录再写入）
//                paths[] 相对路径数组，与 files[] 一一对应（顺序必须一致）
//                files[] 文件数组
//          → { success, uploaded, failed:[{path,error}], count, size }
//
// GET    /api/admin-proposal-files?slug=xxx   列出该方案目录下已上传文件
//          → { success, count, size, files:[{path,size}] }
//
// DELETE /api/admin-proposal-files?slug=xxx   清空该方案目录
//          → { success, deleted }
//
// 认证: x-admin-key / Bearer token（与 admin-proposals.js 完全一致）
// 存储: R2 bucket (binding=IMAGES)，键前缀 proposals/<slug>/<相对路径>

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

// 单次请求体积上限（Cloudflare 请求体上限 100MB，留出余量）
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;
// 单个文件上限
const MAX_FILE_BYTES = 30 * 1024 * 1024;

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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = await verifyAuth(request, env);
  if (!auth) return json({ error: '未授权' }, 401);

  try {
    if (request.method === 'POST') return handleUpload(request, env);
    if (request.method === 'GET') return handleList(request, env);
    if (request.method === 'DELETE') return handleClear(request, env);
  } catch (e) {
    return json({ error: '服务器错误: ' + e.message }, 500);
  }
  return json({ error: '不支持的请求方法' }, 405);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...CORS_HEADERS }
  });
}

function normalizeSlug(raw) {
  const slug = String(raw || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(slug)) return null;
  return slug;
}

// 归一化相对路径：统一 / 分隔、剔除空段与 . 、拒绝 .. 与绝对路径
function normalizeRelPath(raw) {
  let p = String(raw || '').replace(/\\/g, '/').trim();
  if (!p) return null;
  if (/^[A-Za-z]:/.test(p)) return null;
  const segs = p.split('/').filter((s) => s && s !== '.');
  if (!segs.length) return null;
  if (segs.some((s) => s === '..')) return null;
  p = segs.join('/');
  if (p.length > 300) return null;
  return p;
}

function mimeOf(path) {
  const m = path.match(/\.([A-Za-z0-9]+)$/);
  if (!m) return 'application/octet-stream';
  return MIME[m[1].toLowerCase()] || 'application/octet-stream';
}

function ensureHtmlEntry(files) {
  // 目录中缺少 index.html 时给出提醒（不阻断上传）
  return files.some((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));
}

// ---------- POST 上传 ----------
async function handleUpload(request, env) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) {
    return json({ error: '请使用 multipart/form-data 上传' }, 400);
  }

  const len = parseInt(request.headers.get('content-length') || '0', 10);
  if (len && len > MAX_REQUEST_BYTES) {
    return json({ error: '单次上传体积过大，请减少批量文件数量后重试' }, 413);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return json({ error: '表单解析失败: ' + e.message }, 400);
  }

  const slug = normalizeSlug(form.get('slug'));
  if (!slug) return json({ error: '目录标识（slug）不合法，仅允许字母、数字、点、下划线、短横线' }, 400);

  const mode = String(form.get('mode') || 'append').trim() === 'replace' ? 'replace' : 'append';

  const rawPaths = form.getAll('paths').map((v) => String(v || ''));
  const rawFiles = form.getAll('files').filter((f) => f && typeof f === 'object' && typeof f.stream === 'function');

  if (!rawFiles.length) return json({ error: '没有收到文件' }, 400);

  // 以 paths 为准；缺失时回退用 file.name
  const pairs = rawFiles.map((file, i) => {
    const rel = normalizeRelPath(rawPaths[i] || (file.name || ''));
    return { file, path: rel };
  });

  const valid = pairs.filter((p) => p.path);
  if (!valid.length) return json({ error: '所有文件路径均不合法' }, 400);

  if (mode === 'replace') {
    await clearPrefix(env, slug);
  }

  const prefix = 'proposals/' + slug + '/';
  const failed = [];
  let uploaded = 0;
  let size = 0;

  for (const item of valid) {
    if (item.file.size > MAX_FILE_BYTES) {
      failed.push({ path: item.path, error: '文件超过 30MB 上限' });
      continue;
    }
    try {
      await env.IMAGES.put(prefix + item.path, item.file.stream(), {
        httpMetadata: {
          contentType: mimeOf(item.path),
          cacheControl: 'public, max-age=3600'
        }
      });
      uploaded++;
      size += item.file.size || 0;
    } catch (e) {
      failed.push({ path: item.path, error: e.message || '写入失败' });
    }
  }

  return json({
    success: uploaded > 0,
    slug: slug,
    mode: mode,
    uploaded: uploaded,
    count: valid.length,
    size: size,
    hasIndex: ensureHtmlEntry(valid),
    failed: failed
  });
}

// ---------- GET 列表 ----------
async function handleList(request, env) {
  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get('slug'));
  if (!slug) return json({ error: '缺少或非法的 slug 参数' }, 400);

  const listed = await listPrefix(env, slug);
  const files = listed.objects.map((o) => ({
    path: o.key.slice(('proposals/' + slug + '/').length),
    size: o.size
  }));
  const size = files.reduce((s, f) => s + (f.size || 0), 0);
  return json({ success: true, slug: slug, count: files.length, size: size, files: files });
}

// ---------- DELETE 清空 ----------
async function handleClear(request, env) {
  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get('slug'));
  if (!slug) return json({ error: '缺少或非法的 slug 参数' }, 400);

  const deleted = await clearPrefix(env, slug);
  return json({ success: true, slug: slug, deleted: deleted });
}

// ---------- R2 工具 ----------
async function listPrefix(env, slug) {
  const prefix = 'proposals/' + slug + '/';
  const objects = [];
  let cursor;
  for (let i = 0; i < 20; i++) { // 最多 20000 个对象
    const res = await env.IMAGES.list({ prefix: prefix, limit: 1000, cursor: cursor });
    if (res.objects) objects.push(...res.objects);
    if (!res.truncated) break;
    cursor = res.cursor;
  }
  return { objects: objects };
}

async function clearPrefix(env, slug) {
  const listed = await listPrefix(env, slug);
  if (!listed.objects.length) return 0;
  const keys = listed.objects.map((o) => o.key);
  // R2 单次 delete 支持最多 1000 个 key
  for (let i = 0; i < keys.length; i += 1000) {
    await env.IMAGES.delete(keys.slice(i, i + 1000));
  }
  return keys.length;
}

// 鉴权写法与 admin-proposals.js 保持一致
async function verifyAuth(request, env) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;
  if (adminKey && env.ADMIN_TOKEN && adminKey === env.ADMIN_TOKEN) return true;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  if (token === 'qs-admin-2024') return true;
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) return true;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const fromBase64Url = (str) => {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      return atob(str);
    };
    const payload = JSON.parse(fromBase64Url(parts[1]));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch (e) {
    return false;
  }
}
