// admin-proposals.js — 方案汇报 后台管理 API (Cloudflare Pages Functions)
// 路由: /api/admin-proposals
// GET    /api/admin-proposals            方案汇报列表（含全部字段）→ { data: [...] }
// GET    /api/admin-proposals?id=xxx     单条 → { data: {...} }
// POST   /api/admin-proposals            新增 → { success: true, id }
// PUT    /api/admin-proposals            更新（body 需含 id）→ { success: true }
// DELETE /api/admin-proposals?id=xxx     删除 → { success: true }
// 认证: x-admin-key / Bearer 明文 token / JWT（与 admin-cases.js 完全一致）
// 存储: R2 bucket (binding=IMAGES) 根索引 proposals-index.json  { items: [...] }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

const INDEX_KEY = 'proposals-index.json';

// 允许写入的字段白名单
const FIELDS = [
  'title', 'category', 'description', 'cover_image', 'images', 'content',
  'video_url', 'file_url', 'file_name', 'tags', 'sort_order', 'featured',
  // 网页文件夹型方案相关字段
  'password', 'type', 'slug', 'entry', 'file_count', 'total_size'
];

// 数值型字段
const NUMERIC_FIELDS = ['file_count', 'total_size'];

// 目录标识合法格式
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function sanitizeSlug(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return SLUG_RE.test(s) ? s : '';
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const auth = await verifyAuth(request, env);
  if (!auth) {
    return json({ error: '未授权' }, 401);
  }

  try {
    if (request.method === 'GET') return handleGet(request, env);
    if (request.method === 'POST') return handlePost(request, env);
    if (request.method === 'PUT') return handlePut(request, env);
    if (request.method === 'DELETE') return handleDelete(request, env);
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

// ---------- 读 / 写 R2 索引 ----------
async function readIndex(env) {
  try {
    const obj = await env.IMAGES.get(INDEX_KEY);
    if (!obj) return { items: [] };
    const text = await obj.text();
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.items)) return parsed;
    if (Array.isArray(parsed)) return { items: parsed };
    return { items: [] };
  } catch (e) {
    return { items: [] };
  }
}

async function writeIndex(env, data) {
  await env.IMAGES.put(INDEX_KEY, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

function compareOrder(a, b) {
  const sa = Number(a.sort_order || 0);
  const sb = Number(b.sort_order || 0);
  if (sb !== sa) return sb - sa;
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

// ---------- GET ----------
async function handleGet(request, env) {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  const index = await readIndex(env);
  const items = (index.items || []).slice().sort(compareOrder);

  if (id) {
    const item = items.find((it) => it.id === id);
    if (!item) return json({ error: '未找到该方案汇报' }, 404);
    return json({ data: item });
  }
  return json({ data: items });
}

// ---------- POST（新增） ----------
async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '无效的 JSON' }, 400);
  }

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '方案标题不能为空' }, 400);

  const index = await readIndex(env);
  const items = index.items || [];

  // 排序号兜底：未提供时取当前最大值 +1（与案例模块一致）
  let maxOrder = 0;
  items.forEach((it) => {
    const v = Number(it.sort_order || 0);
    if (v > maxOrder) maxOrder = v;
  });

  const now = new Date().toISOString();
  const item = {
    id: 'pr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    created_at: now,
    updated_at: now
  };
  applyFields(item, body, items, true, maxOrder);

  items.push(item);
  await writeIndex(env, { items });
  return json({ success: true, id: item.id, data: item });
}

// 字段写入（含排序号、布尔、数组、数值、slug 归一化）
function applyFields(target, body, items, isCreate, maxOrder) {
  FIELDS.forEach((f) => {
    if (f === 'sort_order') {
      if (isCreate && (body.sort_order === undefined || body.sort_order === null || body.sort_order === '')) {
        target.sort_order = (maxOrder || 0) + 1;
      } else if (body.sort_order !== undefined) {
        target.sort_order = parseInt(body.sort_order, 10) || 0;
      }
      return;
    }
    if (f === 'featured') {
      if (body.featured !== undefined) target.featured = !!body.featured;
      else if (isCreate) target.featured = false;
      return;
    }
    if (f === 'images') {
      if (body.images !== undefined) {
        target.images = Array.isArray(body.images) ? body.images.filter((u) => String(u || '').trim()) : [];
      } else if (isCreate) {
        target.images = [];
      }
      return;
    }
    if (NUMERIC_FIELDS.indexOf(f) !== -1) {
      if (body[f] !== undefined) target[f] = parseInt(body[f], 10) || 0;
      else if (isCreate) target[f] = 0;
      return;
    }
    if (f === 'slug') {
      const s = sanitizeSlug(body.slug);
      if (body.slug !== undefined) target.slug = s;
      else if (isCreate) target.slug = '';
      return;
    }
    if (body[f] === undefined) {
      if (isCreate) target[f] = '';
      return;
    }
    target[f] = body[f] === null ? '' : String(body[f]);
  });

  // slug 唯一性：同 slug 已被其它条目占用时清空，避免目录互相覆盖
  if (target.slug) {
    const clash = (items || []).some((it) => it.id !== target.id && (it.slug || '') === target.slug);
    if (clash) target.slug = '';
  }
}

// ---------- PUT（更新） ----------
async function handlePut(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '无效的 JSON' }, 400);
  }

  const id = String(body.id || '').trim();
  if (!id) return json({ error: '缺少 id' }, 400);

  const index = await readIndex(env);
  const items = index.items || [];
  const target = items.find((it) => it.id === id);
  if (!target) return json({ error: '未找到该方案汇报' }, 404);

  const title = String(body.title || '').trim();
  if (!title) return json({ error: '方案标题不能为空' }, 400);

  applyFields(target, body, items, false, 0);
  target.updated_at = new Date().toISOString();

  await writeIndex(env, { items });
  return json({ success: true, data: target });
}

// ---------- DELETE ----------
async function handleDelete(request, env) {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  if (!id) return json({ error: '缺少 id 参数' }, 400);

  const index = await readIndex(env);
  const items = index.items || [];
  const target = items.find((it) => it.id === id);
  if (!target) {
    return json({ error: '未找到该方案汇报' }, 404);
  }

  const next = items.filter((it) => it.id !== id);
  await writeIndex(env, { items: next });

  // 同步清理该方案上传的网页目录（proposals/<slug>/）
  let removedFiles = 0;
  const slug = sanitizeSlug(target.slug);
  if (slug && url.searchParams.get('keepFiles') !== '1') {
    try {
      removedFiles = await clearProposalDir(env, slug);
    } catch (e) {
      removedFiles = -1;
    }
  }

  return json({ success: true, removedFiles: removedFiles });
}

// 清空 proposals/<slug>/ 前缀下的全部对象
async function clearProposalDir(env, slug) {
  const prefix = 'proposals/' + slug + '/';
  const keys = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const res = await env.IMAGES.list({ prefix: prefix, limit: 1000, cursor: cursor });
    if (res.objects) res.objects.forEach((o) => keys.push(o.key));
    if (!res.truncated) break;
    cursor = res.cursor;
  }
  for (let i = 0; i < keys.length; i += 1000) {
    await env.IMAGES.delete(keys.slice(i, i + 1000));
  }
  return keys.length;
}

// 鉴权写法与 admin-cases.js / upload.js 保持一致
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
