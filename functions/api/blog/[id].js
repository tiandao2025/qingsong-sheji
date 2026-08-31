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
    // 图片路径转换：/images/ 或完整 URL 中的 images/ 统一转为 /cdn/
    function proxyImage(url) {
      if (!url) return '';
      if (url.startsWith('/cdn/')) return url;
      if (url.startsWith('/api/image?key=')) return '/cdn/' + decodeURIComponent(url.split('key=')[1].split('&')[0]);
      const m = url.match(/images\/(.+)$/);
      if (m) return '/cdn/' + m[1];
      return url;
    }
    result.cover_image = proxyImage(result.cover_image);
    if (result.content) {
      result.content = result.content.replace(/\/api\/image\?key=([^"&\s]+)/g, function(_, key) {
        return '/cdn/' + decodeURIComponent(key);
      });
    }
    // 附带下载项（方案A：扫码+自助领取）
    const { results: downloads } = await env.DB.prepare(
      'SELECT id, name, price, qr_image, file_url, description, sort_order FROM blog_downloads WHERE blog_id = ? ORDER BY sort_order ASC, id ASC'
    ).bind(id).all();
    result.downloads = downloads || [];
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
      `UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, cover_image=?, tags=?, category=?, bilibili=?, video_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      data.title || existing.title,
      slug,
      data.excerpt !== undefined ? data.excerpt : existing.excerpt,
      data.content !== undefined ? data.content : existing.content,
      data.cover_image !== undefined ? data.cover_image : existing.cover_image,
      data.tags !== undefined ? data.tags : existing.tags,
      data.category !== undefined ? data.category : existing.category,
      data.bilibili !== undefined ? data.bilibili : existing.bilibili,
      data.video_url !== undefined ? data.video_url : existing.video_url,
      id
    ).run();

    // 保存下载项（全量替换：先删旧再插新）
    const downloads = Array.isArray(data.downloads) ? data.downloads : [];
    await env.DB.prepare('DELETE FROM blog_downloads WHERE blog_id = ?').bind(id).run();
    if (downloads.length > 0) {
      const ins = env.DB.prepare(
        'INSERT INTO blog_downloads (blog_id, name, price, qr_image, file_url, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (let i = 0; i < downloads.length; i++) {
        const d = downloads[i] || {};
        await ins.bind(
          id,
          String(d.name || '').slice(0, 500),
          Number(d.price) || 0,
          d.qr_image || '',
          d.file_url || '',
          d.description || '',
          parseInt(d.sort_order, 10) || i
        ).run();
      }
    }

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

    await env.DB.prepare('DELETE FROM blog_downloads WHERE blog_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
}

async function verifyAuth(request, env) {
  // 兼容旧版后台 admin.html 的 x-admin-key 认证
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;
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
  } catch {
    return false;
  }
}
