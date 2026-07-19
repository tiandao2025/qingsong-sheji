// Cloudflare Pages Function: /api/blog
// Blog CRUD with R2 storage

const ADMIN_KEY = 'qingsong2024';
const BLOG_BUCKET = 'qingsong-images';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key',
    'Access-Control-Max-Age': '86400',
  };
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');

  try {
    if (request.method === 'GET') {
      if (slug) return await getArticle(slug, env);
      return await listArticles(page, limit, env);
    }

    const adminKey = request.headers.get('x-admin-key') || '';
    if (adminKey !== ADMIN_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401, headers: corsHeaders(),
      });
    }

    if (request.method === 'POST') return await createArticle(request, env);
    if (request.method === 'PUT') return await updateArticle(request, env);
    if (request.method === 'DELETE') return await deleteArticle(slug, env);

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders(),
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
}

async function getIndex(env) {
  try {
    const obj = await env[BLOG_BUCKET].get('blog-index.json');
    if (!obj) return [];
    return JSON.parse(await obj.text());
  } catch (e) { return []; }
}

async function saveIndex(index, env) {
  await env[BLOG_BUCKET].put('blog-index.json', JSON.stringify(index, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });
}

async function listArticles(page, limit, env) {
  const index = await getIndex(env);
  index.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const total = index.length;
  const start = (page - 1) * limit;
  const articles = index.slice(start, start + limit);
  return new Response(JSON.stringify({
    success: true, articles, total, page, limit,
    totalPages: Math.ceil(total / limit),
  }), { headers: corsHeaders() });
}

async function getArticle(slug, env) {
  try {
    const obj = await env[BLOG_BUCKET].get(`blog/${slug}.json`);
    if (obj) {
      const text = await obj.text();
      return new Response(text, { headers: corsHeaders() });
    }
  } catch (e) {}
  return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
    status: 404, headers: corsHeaders(),
  });
}

async function createArticle(request, env) {
  const body = await request.json();
  const now = new Date().toISOString();
  let slug = body.slug || slugify(body.title || 'article');
  const index = await getIndex(env);
  let baseSlug = slug, counter = 1;
  while (index.find(a => a.slug === slug)) { slug = baseSlug + '-' + (counter++); }

  const article = {
    slug, title: body.title || '', summary: body.summary || '',
    content: body.content || '', cover: body.cover || '',
    tags: body.tags || [], hasAudio: body.hasAudio || false,
    audioUrl: body.audioUrl || '', hasVideo: body.hasVideo || false,
    videoUrl: body.videoUrl || '', createdAt: now, updatedAt: now,
  };

  await env[BLOG_BUCKET].put(`blog/${slug}.json`, JSON.stringify(article, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });

  const indexEntry = { ...article };
  delete indexEntry.content;
  index.push(indexEntry);
  index.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  await saveIndex(index, env);

  return new Response(JSON.stringify({ success: true, article }), { headers: corsHeaders() });
}

async function updateArticle(request, env) {
  const body = await request.json();
  const oldSlug = body.oldSlug;
  if (!oldSlug) {
    return new Response(JSON.stringify({ success: false, error: 'Missing oldSlug' }), {
      status: 400, headers: corsHeaders(),
    });
  }

  const index = await getIndex(env);
  const idx = index.findIndex(a => a.slug === oldSlug);
  if (idx === -1) {
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      status: 404, headers: corsHeaders(),
    });
  }

  const now = new Date().toISOString();
  const newSlug = body.slug || oldSlug;
  let existing = index[idx];
  try {
    const obj = await env[BLOG_BUCKET].get(`blog/${oldSlug}.json`);
    if (obj) existing = JSON.parse(await obj.text());
  } catch (e) {}

  const article = {
    slug: newSlug,
    title: body.title !== undefined ? body.title : (existing.title || ''),
    summary: body.summary !== undefined ? body.summary : (existing.summary || ''),
    content: body.content !== undefined ? body.content : (existing.content || ''),
    cover: body.cover !== undefined ? body.cover : (existing.cover || ''),
    tags: body.tags !== undefined ? body.tags : (existing.tags || []),
    hasAudio: body.hasAudio !== undefined ? body.hasAudio : (existing.hasAudio || false),
    audioUrl: body.audioUrl !== undefined ? body.audioUrl : (existing.audioUrl || ''),
    hasVideo: body.hasVideo !== undefined ? body.hasVideo : (existing.hasVideo || false),
    videoUrl: body.videoUrl !== undefined ? body.videoUrl : (existing.videoUrl || ''),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  await env[BLOG_BUCKET].put(`blog/${newSlug}.json`, JSON.stringify(article, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });

  if (newSlug !== oldSlug) {
    try { await env[BLOG_BUCKET].delete(`blog/${oldSlug}.json`); } catch (e) {}
  }

  const indexEntry = { ...article };
  delete indexEntry.content;
  index[idx] = indexEntry;
  index.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  await saveIndex(index, env);

  return new Response(JSON.stringify({ success: true, article }), { headers: corsHeaders() });
}

async function deleteArticle(slug, env) {
  if (!slug) {
    return new Response(JSON.stringify({ success: false, error: 'Missing slug' }), {
      status: 400, headers: corsHeaders(),
    });
  }

  const index = await getIndex(env);
  const newIndex = index.filter(a => a.slug !== slug);
  if (newIndex.length === index.length) {
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      status: 404, headers: corsHeaders(),
    });
  }

  await saveIndex(newIndex, env);
  try { await env[BLOG_BUCKET].delete(`blog/${slug}.json`); } catch (e) {}

  return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
}
