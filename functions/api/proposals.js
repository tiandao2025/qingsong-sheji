// proposals.js — 方案汇报 公开读取 API (Cloudflare Pages Functions)
// 路由: /api/proposals
// GET /api/proposals?limit=50&category=xxx   方案汇报列表（不含正文，按排序号倒序）→ { items: [...] }
// GET /api/proposals?id=xxx                  单条详情 → { item: {...} }
// 存储: R2 bucket (binding=IMAGES) 根索引 proposals-index.json  { items: [...] }
// 说明: 与 site-content.js / materials.js 同一套 R2 读写模式，不涉及 D1 表结构变更

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
      return json({ item });
    }

    if (category) {
      items = items.filter((it) => (it.category || '').trim() === category);
    }
    if (Number.isFinite(limit) && limit > 0) {
      items = items.slice(0, limit);
    }

    // 列表不返回正文，减小传输体积；详情用 ?id= 单独取
    const list = items.map((it) => {
      const copy = Object.assign({}, it);
      delete copy.content;
      return copy;
    });

    return json({ items: list });
  } catch (e) {
    return json({ error: '服务器错误: ' + e.message }, 500);
  }
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
