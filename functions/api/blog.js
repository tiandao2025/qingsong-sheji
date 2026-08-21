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
    'INSERT INTO blog_posts (title, slug, excerpt, content, cover_image, tags, category, bilibili) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(title, slug, excerpt || '', content || '', cover_image || '', tags || '', category || '', bilibili || '').run();

  const result = await env.DB.prepare('SELECT * FROM blog_posts WHERE slug = ?').bind(slug).first();
  return new Response(JSON.stringify(result), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
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