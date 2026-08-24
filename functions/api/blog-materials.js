// /api/blog-materials - 博客常用素材管理（需认证）
// GET    /api/blog-materials?type=link|content|image - 查询 D1 素材列表
// GET    /api/blog-materials/images                  - 查询 R2 历史上传图片列表
// POST   /api/blog-materials                         - 新增素材（需认证）
// DELETE /api/blog-materials?id=xxx                  - 删除素材（需认证）

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']);

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    if (url.pathname.endsWith('/images')) {
      return handleListImages(request, env);
    }
    return handleGet(request, env);
  }

  const auth = await verifyAuth(request, env);
  if (!auth) {
    return json({ error: '未授权' }, 401);
  }

  if (request.method === 'POST') {
    return handlePost(request, env);
  }
  if (request.method === 'DELETE') {
    return handleDelete(request, env);
  }

  return json({ error: 'Method Not Allowed' }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  });
}

// 查询 D1 素材列表，支持 type 过滤
async function handleGet(request, env) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  try {
    if (type) {
      const { results } = await env.DB.prepare(
        'SELECT id, type, title, content, image_url, created_at FROM blog_materials WHERE type = ? ORDER BY id DESC'
      ).bind(type).all();
      return json({ materials: results });
    }
    const { results } = await env.DB.prepare(
      'SELECT id, type, title, content, image_url, created_at FROM blog_materials ORDER BY id DESC'
    ).all();
    return json({ materials: results });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// 查询 R2 历史上传的图片列表（uploads/ 前缀 + 图片扩展名过滤）
async function handleListImages(request, env) {
  try {
    const objs = await env.IMAGES.list({ prefix: 'uploads/' });
    const images = (objs.objects || [])
      .filter(o => {
        const ext = (o.key.split('.').pop() || '').toLowerCase();
        return IMAGE_EXT.has(ext);
      })
      .sort((a, b) => (b.uploaded || 0) - (a.uploaded || 0))
      .map(o => ({
        key: o.key,
        url: `https://qingsong.ggff.net/cdn/${o.key}`,
        size: o.size,
        uploaded: o.uploaded || null
      }));
    return json({ images });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// 新增素材
async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: '无效的 JSON' }, 400);
  }

  const type = String(body.type || '').trim();
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const image_url = String(body.image_url || '').trim();

  if (!['image', 'link', 'content'].includes(type)) {
    return json({ error: 'type 必须是 image / link / content' }, 400);
  }
  if (!title) {
    return json({ error: '标题不能为空' }, 400);
  }
  if (type === 'link' && !content) {
    return json({ error: '链接 URL 不能为空' }, 400);
  }
  if (type === 'content' && !content) {
    return json({ error: '内容不能为空' }, 400);
  }

  try {
    const res = await env.DB.prepare(
      'INSERT INTO blog_materials (type, title, content, image_url) VALUES (?, ?, ?, ?)'
    ).bind(type, title, content, image_url).run();
    return json({ success: true, id: res.meta.last_row_id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// 删除素材
async function handleDelete(request, env) {
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') || '0', 10);
  if (!id) {
    return json({ error: '缺少 id 参数' }, 400);
  }
  try {
    await env.DB.prepare('DELETE FROM blog_materials WHERE id = ?').bind(id).run();
    return json({ success: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

async function verifyAuth(request, env) {
  // 兼容旧版后台 admin.html 的 x-admin-key 认证
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;
  if (adminKey && adminKey === env.ADMIN_TOKEN) return true;
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  // 兼容新版后台登录返回的明文 token（非 JWT）
  if (token === 'qs-admin-2024') return true;
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
  } catch {
    return false;
  }
}
