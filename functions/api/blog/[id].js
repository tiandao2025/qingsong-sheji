// GET /api/blog/:id - 获取单篇文章
// PUT /api/blog/:id - 更新文章（需认证）
// DELETE /api/blog/:id - 删除文章（需认证）
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(id).first();
    if (!result) {
      return new Response(JSON.stringify({ error: '文章不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }

  if (request.method === 'PUT') {
    const auth = await verifyAuth(request, env);
    if (!auth) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    const existing = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(id).first();
    if (!existing) {
      return new Response(JSON.stringify({ error: '文章不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let slug = existing.slug;
    if (data.title && data.title !== existing.title) {
      slug = data.title.toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!slug) slug = 'post';
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    await env.DB.prepare(
      `UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, cover_image=?, tags=?, category=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      data.title || existing.title,
      slug,
      data.excerpt !== undefined ? data.excerpt : existing.excerpt,
      data.content !== undefined ? data.content : existing.content,
      data.cover_image !== undefined ? data.cover_image : existing.cover_image,
      data.tags !== undefined ? data.tags : existing.tags,
      data.category !== undefined ? data.category : existing.category,
      id
    ).run();

    const result = await env.DB.prepare('SELECT * FROM blog_posts WHERE id = ?').bind(id).first();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'DELETE') {
    const auth = await verifyAuth(request, env);
    if (!auth) {
      return new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
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
