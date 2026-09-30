// GET /api/blog - 获取博客列表
// POST /api/blog - 创建博客文章（需认证）
export async function onRequest({ request, env }) {
  if (request.method === 'GET') {
    return handleGet(request, env);
  }
  if (request.method === 'POST') {
    return handlePost(request, env);
  }
  return new Response('Method Not Allowed', { status: 405 });
}

async function handleGet(request, env) {
  const url = new URL(request.url);

  // 往期热播：/api/blog?hot=1&limit=5&exclude=<当前文章ID>&days=90
  const hot = url.searchParams.get('hot');
  if (hot === '1' || hot === 'true') {
    return handleHot(url, env);
  }

  const category = url.searchParams.get('category');
  const tag = url.searchParams.get('tag');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const excludeContent = url.searchParams.get('exclude_content') === 'true';

  let conditions = [];
  let params = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (tag) {
    conditions.push('tags LIKE ?');
    params.push('%' + tag + '%');
  }

  let where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  let query = 'SELECT * FROM blog_posts' + where + ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  let countQuery = 'SELECT COUNT(*) as total FROM blog_posts' + where;
  const countParams = [...params];
  params.push(limit, offset);

  try {
    const stmt = env.DB.prepare(query);
    const { results } = await stmt.bind(...params).all();
    const { total } = await env.DB.prepare(countQuery).bind(...countParams).first();

    function proxyImage(url) {
      if (!url) return '';
      if (url.startsWith('/')) return url;
      const m = url.match(/images\/(.+)$/);
      if (m) return '/cdn/' + m[1];
      return url;
    }

    const posts = results.map(r => {
      let tags = r.tags || [];
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch(e) { tags = [tags]; }
      }
      let category = r.category || '';
      if (category === 'sketchup教程') category = 'SketchUp教程';
      const post = {
        id: r.id,
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt || '',
        cover_image: proxyImage(r.cover_image),
        tags: tags,
        category: category,
        bilibili: r.bilibili || '',
        video_url: r.video_url || '',
        views: r.views || 0,
        created_at: r.created_at,
        updated_at: r.updated_at
      };
      // 管理后台列表不需要正文，前端需要时传 exclude_content=false（默认包含）
      if (!excludeContent) {
        post.content = r.content || '';
      }
      return post;
    });
    return new Response(JSON.stringify({ posts, total }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, query: query, params: params }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// GET /api/blog?hot=1 - 往期热播文章（文章页"往期热播内容"模块数据源）
// 规则：优先取最近 days 天（默认 90）内上传的文章，按播放量 views 降序；
// 不足 limit 条时用全站历史热门补齐（同一篇只取一次，排除当前正在阅读的文章）
async function handleHot(url, env) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '5', 10) || 5, 1), 20);
  const days = parseInt(url.searchParams.get('days') || '90', 10) || 0;
  const excludeId = parseInt(url.searchParams.get('exclude') || '0', 10) || 0;
  const cols = 'SELECT id, title, views, created_at, category, cover_image FROM blog_posts';
  const orderLimit = ' ORDER BY views DESC, created_at DESC LIMIT ?';
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  };

  try {
    const posts = [];
    const seen = {};
    if (days > 0) {
      const recent = await env.DB.prepare(
        cols + " WHERE id != ? AND created_at >= datetime('now', ?)" + orderLimit
      ).bind(excludeId, '-' + days + ' days', limit).all();
      (recent.results || []).forEach(function(r) {
        if (posts.length < limit && !seen[r.id]) { seen[r.id] = true; posts.push(r); }
      });
    }
    if (posts.length < limit) {
      const all = await env.DB.prepare(
        cols + ' WHERE id != ?' + orderLimit
      ).bind(excludeId, limit).all();
      (all.results || []).forEach(function(r) {
        if (posts.length < limit && !seen[r.id]) { seen[r.id] = true; posts.push(r); }
      });
    }
    return new Response(JSON.stringify({ posts: posts, days: days }), { headers: headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: headers });
  }
}

async function handlePost(request, env) {
  const auth = await verifyAuth(request, env);
  if (!auth) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = await request.json();
  const { title, excerpt, content, cover_image, tags, category, bilibili } = data;
  const video_url = data.video_url || '';
  const downloads = Array.isArray(data.downloads) ? data.downloads : [];

  if (!title) {
    return new Response(JSON.stringify({ error: '标题不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let slug = title.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'post';
  slug = slug + '-' + Date.now().toString(36);

  await env.DB.prepare(
    'INSERT INTO blog_posts (title, slug, excerpt, content, cover_image, tags, category, bilibili, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(title, slug, excerpt || '', content || '', cover_image || '', tags || '', category || '', bilibili || '', video_url).run();

  const result = await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();

  // 创建下载项（方案A：扫码+自助领取，一篇文章多个下载项）
  if (downloads.length > 0) {
    const ins = env.DB.prepare(
      'INSERT INTO blog_downloads (blog_id, name, price, qr_image, file_url, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (let i = 0; i < downloads.length; i++) {
      const d = downloads[i] || {};
      await ins.bind(
        result.id,
        String(d.name || '').slice(0, 500),
        Number(d.price) || 0,
        d.qr_image || '',
        d.file_url || '',
        d.description || '',
        parseInt(d.sort_order, 10) || i
      ).run();
    }
  }

  return new Response(JSON.stringify(result), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
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
    const fromBase64Url = function(str) {
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