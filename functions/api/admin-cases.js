// admin-cases.js — 案例CRUD API (Cloudflare Pages Functions)
// 认证: x-admin-key: qs-admin-2024
// 存储: D1 数据库 cases 表 (与新版 /api/cases 统一)
// 兼容: 返回字段映射回旧版后台弹窗字段 (name/desc/type/location/images/video/order/featured)

function normalizeImagePath(p) {
  if (!p) return '';
  p = String(p).trim();
  if (p.startsWith('http')) return p;
  if (p.startsWith('/cdn/')) return p;
  if (p.startsWith('/images/')) return p.replace(/^\/images\//, '/cdn/');
  if (p.startsWith('images/')) return '/cdn/' + p.slice('images/'.length);
  return '/cdn/' + p;
}

function toLegacy(row) {
  const images = (row.images || '').split(',').filter(Boolean);
  return {
    id: 'case_' + row.id,
    name: row.title || '',
    desc: row.description || '',
    type: row.type || '家装',
    location: row.location || '',
    images: images,
    video: row.video_url || '',
    order: row.sort_order || 0,
    featured: !!row.featured
  };
}

function generateSlug(title) {
  let slug = title.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'case';
  const ts = Date.now().toString(36);
  return `${slug}-${ts}`;
}

function parseCaseId(idStr) {
  // 兼容 'case_123' 与纯数字
  const m = String(idStr).match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : NaN;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  // 认证
  const adminKey = request.headers.get('x-admin-key') || '';
  if (adminKey !== 'qs-admin-2024') {
    return new Response(JSON.stringify({ error: '未授权访问' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // GET
    if (method === 'GET') {
      const caseId = url.searchParams.get('id');
      if (caseId) {
        const id = parseCaseId(caseId);
        if (isNaN(id)) {
          return new Response(JSON.stringify({ error: '案例不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
        if (!row) {
          return new Response(JSON.stringify({ error: '案例不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ data: toLegacy(row) }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const { results } = await env.DB.prepare(
        'SELECT * FROM cases ORDER BY sort_order ASC, id ASC'
      ).all();
      return new Response(JSON.stringify({ data: results.map(toLegacy) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST
    if (method === 'POST') {
      const body = await request.json();
      if (!body.name || !body.name.trim()) {
        return new Response(JSON.stringify({ error: '案例名称不能为空' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const title = body.name.trim();
      const slug = generateSlug(title);
      const images = Array.isArray(body.images) ? body.images.map(normalizeImagePath).filter(Boolean) : [];
      const coverImage = images.length > 0 ? images[0] : '';
      const featured = body.featured ? 1 : 0;
      const sortOrder = typeof body.order === 'number' ? body.order : 0;

      const insertResult = await env.DB.prepare(
        `INSERT INTO cases (title, slug, description, cover_image, video_url, images, type, location, sort_order, featured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        title,
        slug,
        body.desc || '',
        coverImage,
        body.video || '',
        images.join(','),
        body.type || '家装',
        body.location || '',
        sortOrder,
        featured
      ).run();

      if (!insertResult.success || insertResult.changes === 0) {
        return new Response(JSON.stringify({ error: '创建失败，数据库写入未生效' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const row = await env.DB.prepare('SELECT * FROM cases WHERE slug = ?').bind(slug).first();
      return new Response(JSON.stringify({ success: true, data: toLegacy(row) }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PUT
    if (method === 'PUT') {
      const body = await request.json();
      const caseId = body.id || url.searchParams.get('id');
      const id = parseCaseId(caseId);
      if (!caseId || isNaN(id)) {
        return new Response(JSON.stringify({ error: '缺少案例ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const existing = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      if (!existing) {
        return new Response(JSON.stringify({ error: '案例不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const title = body.name !== undefined ? body.name.trim() : existing.title;
      let slug = existing.slug;
      if (body.name !== undefined && title !== existing.title) {
        slug = generateSlug(title);
      }
      const images = body.images !== undefined
        ? (Array.isArray(body.images) ? body.images.map(normalizeImagePath).filter(Boolean) : [])
        : (existing.images || '').split(',').filter(Boolean);
      const coverImage = (body.images !== undefined && images.length > 0)
        ? images[0]
        : (existing.cover_image || (images.length > 0 ? images[0] : ''));

      const updateResult = await env.DB.prepare(
        `UPDATE cases SET title=?, slug=?, description=?, cover_image=?, video_url=?, images=?, type=?, location=?, sort_order=?, featured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(
        title,
        slug,
        body.desc !== undefined ? body.desc : existing.description,
        coverImage,
        body.video !== undefined ? body.video : (existing.video_url || ''),
        images.join(','),
        body.type !== undefined ? body.type : (existing.type || '家装'),
        body.location !== undefined ? body.location : (existing.location || ''),
        body.order !== undefined ? body.order : (existing.sort_order || 0),
        body.featured !== undefined ? (body.featured ? 1 : 0) : (existing.featured || 0),
        id
      ).run();

      if (!updateResult.success || updateResult.changes === 0) {
        return new Response(JSON.stringify({ error: '更新失败，数据库写入未生效' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      return new Response(JSON.stringify({ success: true, data: toLegacy(row) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE
    if (method === 'DELETE') {
      const caseId = url.searchParams.get('id');
      const id = parseCaseId(caseId);
      if (!caseId || isNaN(id)) {
        return new Response(JSON.stringify({ error: '缺少案例ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      await env.DB.prepare('DELETE FROM cases WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
