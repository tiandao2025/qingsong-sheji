// proposals.js — 方案汇报 公开读取 API (Cloudflare Pages Functions)
// 路由: /api/proposals
// GET /api/proposals?limit=50&category=xxx   方案汇报列表（不含正文，按排序号倒序）→ { items: [...] }
// GET /api/proposals?id=xxx                  单条详情 → { item: {...} }
// 存储: R2 bucket (binding=IMAGES) 根索引 proposals-index.json  { items: [...] }
// 说明: 与 site-content.js / materials.js 同一套 R2 读写模式，不涉及 D1 表结构变更

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

const INDEX_KEY = 'proposals-index.json';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...CORS_HEADERS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest({ request, env }) {
  if (request.method === 'POST') {
    return handleUnlock(request, env);
  }
  if (request.method !== 'GET') {
    return json({ error: '不支持的请求方法' }, 405);
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') || '').trim();
  const category = (url.searchParams.get('category') || '').trim();
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  try {
    const index = await readIndex(env);
    let items = (index.items || []).slice().sort(compareOrder);

    if (id) {
      const item = items.find((it) => it.id === id);
      if (!item) return json({ error: '未找到该方案汇报' }, 404);

      const password = String(item.password || '');
      if (password) {
        const expect = await makeToken(id, password);
        const got = readCookie(request, 'qs_pp_' + id);
        if (got !== expect) {
          // 未解锁：只返回基础信息，不泄露正文与附件
          return json({ item: lockedItem(item), locked: true });
        }
      }
      return json({ item: Object.assign({}, item, { has_password: !!password, locked: false }) });
    }

    if (category) {
      items = items.filter((it) => (it.category || '').trim() === category);
    }
    if (Number.isFinite(limit) && limit > 0) {
      items = items.slice(0, limit);
    }

    // 列表不返回正文，减小传输体积；详情用 ?id= 单独取
    const list = items.map((it) => publicItem(it));

    return json({ items: list });
  } catch (e) {
    return json({ error: '服务器错误: ' + e.message }, 500);
  }
}

// ---------- 解锁接口：POST { id, password } ----------
async function handleUnlock(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '无效的 JSON' }, 400);
  }

  const id = String(body.id || '').trim();
  const password = String(body.password || '');
  if (!id) return json({ error: '缺少 id' }, 400);

  const index = await readIndex(env);
  const item = (index.items || []).find((it) => it.id === id);
  if (!item) return json({ error: '未找到该方案汇报' }, 404);

  const real = String(item.password || '');
  if (!real) return json({ success: true, item: Object.assign({}, item, { has_password: false, locked: false }) });

  const expect = await makeToken(id, real);
  if ((await makeToken(id, password)) !== expect) {
    return json({ error: '密码不正确' }, 401);
  }

  const res = json({ success: true, item: Object.assign({}, item, { has_password: true, locked: false }) });
  res.headers.set('Set-Cookie', 'qs_pp_' + id + '=' + expect + '; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax');
  return res;
}

// 列表项：剔除密码与正文
function publicItem(it) {
  const copy = Object.assign({}, it);
  delete copy.content;
  delete copy.password;
  copy.has_password = !!(it.password && String(it.password));
  copy.has_page = !!(it.slug && (it.type === 'page' || Number(it.file_count || 0) > 0));
  copy.page_url = copy.has_page ? ('/proposals/' + it.slug + '/') : '';
  return copy;
}

// 未解锁的详情项：只保留展示用基础信息
function lockedItem(it) {
  return {
    id: it.id,
    title: it.title || '',
    category: it.category || '',
    description: it.description || '',
    cover_image: it.cover_image || '',
    tags: it.tags || '',
    sort_order: it.sort_order || 0,
    created_at: it.created_at || '',
    slug: it.slug || '',
    type: it.type || '',
    has_password: true,
    has_page: !!(it.slug && (it.type === 'page' || Number(it.file_count || 0) > 0)),
    page_url: (it.slug && (it.type === 'page' || Number(it.file_count || 0) > 0)) ? ('/proposals/' + it.slug + '/') : '',
    locked: true
  };
}

// cookie 令牌 = sha256('qs-prop|' + id + '|' + 密码)
async function makeToken(id, password) {
  const data = new TextEncoder().encode('qs-prop|' + id + '|' + password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const p of raw.split(';')) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    if (p.slice(0, i).trim() === name) return p.slice(i + 1).trim();
  }
  return '';
}

// 读 R2 索引；数据损坏时按空库处理，避免前台整页报错
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

// 排序号大的在前；同序号按创建时间新的在前
function compareOrder(a, b) {
  const sa = Number(a.sort_order || 0);
  const sb = Number(b.sort_order || 0);
  if (sb !== sa) return sb - sa;
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}
