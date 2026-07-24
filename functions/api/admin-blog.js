// ==================== 博客管理 API ====================
// GET     /api/admin-blog       — 获取博客列表（支持 ?id=xxx 单篇查询）
// POST    /api/admin-blog       — 创建新文章
// PUT     /api/admin-blog       — 更新文章（需传 id）
// DELETE  /api/admin-blog       — 删除文章（需传 id）

const BLOG_INDEX_KEY = 'blog-index.json';

// 简单 token 验证（从环境变量或默认值）
function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const validToken = env.ADMIN_TOKEN || 'qs-admin-2024';
  // 也支持 x-admin-key 头
  const adminKey = request.headers.get('x-admin-key') || '';
  return token === validToken || adminKey === validToken;
}

async function getBlogIndex(env) {
  try {
    const obj = await env.IMAGES.get(BLOG_INDEX_KEY);
    if (!obj) return [];
    const text = await obj.text();
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
}

async function saveBlogIndex(env, data) {
  await env.IMAGES.put(BLOG_INDEX_KEY, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

async function logAction(env, action, detail) {
  const key = 'admin-logs.json';
  try {
    const obj = await env.IMAGES.get(key);
    let logs = obj ? JSON.parse(await obj.text()) : [];
    logs.unshift({
      time: new Date().toISOString(),
      action,
      detail,
      ip: ''
    });
    if (logs.length > 500) logs = logs.slice(0, 500);
    await env.IMAGES.put(key, JSON.stringify(logs, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
  } catch (e) { /* 日志失败不影响主流程 */ }
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // 非 GET 请求需要验证
  if (request.method !== 'GET' && !verifyAuth(request, env)) {
    return new Response(JSON.stringify({ error: '未授权访问' }), { status: 401, headers });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  try {
    if (request.method === 'GET') {
      let blogs = await getBlogIndex(env);
      if (id) {
        const blog = blogs.find(b => b.id === id);
        if (!blog) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });
        return new Response(JSON.stringify({ success: true, data: blog }), { headers });
      }
      // 按时间倒序
      blogs.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      return new Response(JSON.stringify({ success: true, data: blogs, total: blogs.length }), { headers });
    }

    // === 写操作需要验证 ===
    if (!verifyAuth(request, env)) {
      return new Response(JSON.stringify({ error: '需要管理员权限' }), { status: 403, headers });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      let blogs = await getBlogIndex(env);

      const newPost = {
        id: 'blog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        title: body.title || '无标题',
        slug: body.slug || '',
        excerpt: body.excerpt || '',
        content: body.content || '',
        cover: body.cover || '',
        category: body.category || '未分类',
        tags: body.tags || [],
        author: body.author || '青松设计',
        published: body.published !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      blogs.push(newPost);
      await saveBlogIndex(env, blogs);
      await logAction(env, 'blog-create', `创建文章: ${newPost.title}`);

      return new Response(JSON.stringify({ success: true, data: newPost }), { status: 201, headers });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      if (!body.id) return new Response(JSON.stringify({ error: '缺少文章 id' }), { status: 400, headers });

      let blogs = await getBlogIndex(env);
      const idx = blogs.findIndex(b => b.id === body.id);
      if (idx === -1) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });

      blogs[idx] = {
        ...blogs[idx],
        title: body.title ?? blogs[idx].title,
        slug: body.slug ?? blogs[idx].slug,
        excerpt: body.excerpt ?? blogs[idx].excerpt,
        content: body.content ?? blogs[idx].content,
        cover: body.cover ?? blogs[idx].cover,
        category: body.category ?? blogs[idx].category,
        tags: body.tags ?? blogs[idx].tags,
        author: body.author ?? blogs[idx].author,
        published: body.published ?? blogs[idx].published,
        updatedAt: new Date().toISOString()
      };

      await saveBlogIndex(env, blogs);
      await logAction(env, 'blog-update', `更新文章: ${blogs[idx].title}`);

      return new Response(JSON.stringify({ success: true, data: blogs[idx] }), { headers });
    }

    if (request.method === 'DELETE') {
      if (!id) return new Response(JSON.stringify({ error: '缺少文章 id' }), { status: 400, headers });

      let blogs = await getBlogIndex(env);
      const idx = blogs.findIndex(b => b.id === id);
      if (idx === -1) return new Response(JSON.stringify({ error: '文章不存在' }), { status: 404, headers });

      const deleted = blogs[idx];
      blogs.splice(idx, 1);
      await saveBlogIndex(env, blogs);
      await logAction(env, 'blog-delete', `删除文章: ${deleted.title}`);

      return new Response(JSON.stringify({ success: true, data: deleted }), { headers });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), { status: 500, headers });
  }
}
