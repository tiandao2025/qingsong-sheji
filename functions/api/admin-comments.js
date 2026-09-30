// GET    /api/admin-comments?blog_id=&limit=  评论列表（需认证，带文章标题）
// DELETE /api/admin-comments?id=xx            删除指定评论（需认证）
export async function onRequest({ request, env }) {
  const auth = await verifyAuth(request, env);
  if (!auth) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const blogId = url.searchParams.get('blog_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500);
    const where = blogId ? ' WHERE c.blog_id = ?' : '';
    const sql =
      'SELECT c.id, c.blog_id, c.nickname, c.content, c.created_at, p.title AS post_title ' +
      'FROM blog_comments c LEFT JOIN blog_posts p ON p.id = c.blog_id' + where +
      ' ORDER BY c.created_at DESC, c.id DESC LIMIT ?';
    const stmt = env.DB.prepare(sql);
    const { results } = blogId
      ? await stmt.bind(blogId, limit).all()
      : await stmt.bind(limit).all();
    return json({ comments: results || [] });
  }

  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id') || (await safeJson(request)).id;
    if (!id) return json({ error: '缺少评论 id' }, 400);
    await env.DB.prepare('DELETE FROM blog_comments WHERE id = ?').bind(id).run();
    return json({ success: true, id: id });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function safeJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

async function verifyAuth(request, env) {
  // 兼容旧版后台 admin.html 的 x-admin-key 认证
  const adminKey = request.headers.get('x-admin-key');
  if (env.ADMIN_TOKEN && adminKey === env.ADMIN_TOKEN) return true;
  if (adminKey && adminKey === env.ADMIN_TOKEN) return true;
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
  } catch (e) {
    return false;
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
