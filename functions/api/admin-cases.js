// admin-cases.js — 案例CRUD API (Cloudflare Pages Functions)
// 认证: x-admin-key: qs-admin-2024
// 存储: D1 数据库 cases 表 (与新版 /api/cases 统一)
// 兼容: 同时输出新旧两套字段 ——
//   旧字段(name/desc/type/location/images/video/order/featured): 供旧版后台 admin.html 列表 loadCases 使用
//   新字段(title/slug/description/content/cover_image/video_url/file_url/file_name/tags/
//          project_info/design_concept/floor_plan/spaces/materials/type/location/sort_order/featured):
//         供前端 case.html / cases.html 使用

function normalizeImagePath(p) {
  if (!p) return '';
  p = String(p).trim();
  if (p.startsWith('http')) return p;
  if (p.startsWith('/cdn/')) return p;
  if (p.startsWith('/images/')) return p.replace(/^\/images\//, '/cdn/');
  if (p.startsWith('images/')) return '/cdn/' + p.slice('images/'.length);
  return '/cdn/' + p;
}

// 将 DB 行映射为 API 响应对象：旧字段 + 新字段双输出
function toApi(row) {
  const images = (row.images || '').split(',').filter(Boolean);
  return {
    // ===== 旧字段（旧版后台 admin.html 列表/弹窗）=====
    id: 'case_' + row.id,
    name: row.title || '',
    desc: row.description || '',
    type: row.type || '家装',
    location: row.location || '',
    images: images,
    video: row.video_url || '',
    order: row.sort_order || 0,
    featured: !!row.featured,
    // ===== 新字段（前端 case.html / cases.html / 新版后台 admin/cases.html）=====
    title: row.title || '',
    slug: row.slug || '',
    description: row.description || '',
    content: row.content || '',
    cover_image: row.cover_image || (images.length ? images[0] : ''),
    video_url: row.video_url || '',
    file_url: row.file_url || '',
    file_name: row.file_name || '',
    tags: row.tags || '',
    project_info: row.project_info || '{}',
    design_concept: row.design_concept || '{}',
    floor_plan: row.floor_plan || '{}',
    spaces: row.spaces || '[]',
    materials: row.materials || '[]',
    sort_order: row.sort_order || 0
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

// 按优先级从 body 中取第一个非空字符串字段（支持新旧字段名混用）
function pickStr(obj, keys, fallback) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return String(obj[k]);
  }
  return fallback === undefined ? '' : fallback;
}

// JSON 字段：接受对象或字符串，统一序列化为字符串存储（与新版 cases.js 一致）
function pickJson(obj, keys, fallback) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) {
      const v = obj[k];
      if (typeof v === 'string') return v;
      return JSON.stringify(v);
    }
  }
  return fallback;
}

// 解析 body 中的图片列表（数组），并规范化路径
function parseImages(body) {
  if (Array.isArray(body.images)) {
    return body.images.map(normalizeImagePath).filter(Boolean);
  }
  if (typeof body.images === 'string' && body.images.trim()) {
    return body.images.split(/[\n,]+/).map(normalizeImagePath).filter(Boolean);
  }
  if (body.cover_image) {
    return [normalizeImagePath(body.cover_image)].filter(Boolean);
  }
  return [];
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
        return new Response(JSON.stringify({ data: toApi(row) }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const { results } = await env.DB.prepare(
        'SELECT * FROM cases ORDER BY sort_order ASC, id ASC'
      ).all();
      return new Response(JSON.stringify({ data: results.map(toApi) }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // POST
    if (method === 'POST') {
      const body = await request.json();
      const title = pickStr(body, ['title', 'name'], '').trim();
      if (!title) {
        return new Response(JSON.stringify({ error: '案例名称不能为空' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const slug = generateSlug(title);
      const images = parseImages(body);
      const coverImage = pickStr(body, ['cover_image'], '') || (images.length ? images[0] : '');
      let sortOrder;
      if (typeof body.sort_order === 'number') {
        sortOrder = body.sort_order;
      } else if (typeof body.order === 'number') {
        sortOrder = body.order;
      } else {
        // 排序号未提供时：取当前最大 sort_order + 1（与 /api/cases 行为一致）
        const maxRow = await env.DB.prepare('SELECT MAX(sort_order) AS mx FROM cases').first();
        sortOrder = (maxRow && maxRow.mx ? maxRow.mx : 0) + 1;
      }

      const insertResult = await env.DB.prepare(
        `INSERT INTO cases (title, slug, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials, images, type, location, sort_order, featured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        title,
        slug,
        pickStr(body, ['description', 'desc'], ''),
        pickStr(body, ['content'], ''),
        coverImage,
        pickStr(body, ['video_url', 'video'], ''),
        pickStr(body, ['file_url'], ''),
        pickStr(body, ['file_name'], ''),
        pickStr(body, ['tags'], ''),
        pickJson(body, ['project_info'], '{}'),
        pickJson(body, ['design_concept'], '{}'),
        pickJson(body, ['floor_plan'], '{}'),
        pickJson(body, ['spaces'], '[]'),
        pickJson(body, ['materials'], '[]'),
        images.join(','),
        pickStr(body, ['type'], '家装'),
        pickStr(body, ['location'], ''),
        sortOrder,
        body.featured ? 1 : 0
      ).run();

      if (!insertResult.success || insertResult.changes === 0) {
        return new Response(JSON.stringify({ error: '创建失败，数据库写入未生效' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const row = await env.DB.prepare('SELECT * FROM cases WHERE slug = ?').bind(slug).first();
      return new Response(JSON.stringify({ success: true, data: toApi(row) }), {
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

      const title = pickStr(body, ['title', 'name'], existing.title).trim();
      let slug = existing.slug;
      if (title !== existing.title) {
        slug = generateSlug(title);
      }

      // 图片画廊：body 显式传 images 则覆盖；否则保留现有，若显式传了 cover_image 且现有为空则补充
      let images;
      if (body.images !== undefined) {
        images = parseImages(body);
      } else {
        images = (existing.images || '').split(',').filter(Boolean);
        if (body.cover_image && !images.length) images.push(normalizeImagePath(body.cover_image));
      }
      const coverImage = pickStr(body, ['cover_image'], existing.cover_image || (images.length ? images[0] : ''));

      const sortOrder = typeof body.sort_order === 'number'
        ? body.sort_order
        : (typeof body.order === 'number' ? body.order : (existing.sort_order || 0));
      const featured = body.featured !== undefined
        ? (body.featured ? 1 : 0)
        : (existing.featured || 0);

      const updateResult = await env.DB.prepare(
        `UPDATE cases SET title=?, slug=?, description=?, content=?, cover_image=?, video_url=?, file_url=?, file_name=?, tags=?, project_info=?, design_concept=?, floor_plan=?, spaces=?, materials=?, images=?, type=?, location=?, sort_order=?, featured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).bind(
        title,
        slug,
        pickStr(body, ['description', 'desc'], existing.description),
        pickStr(body, ['content'], existing.content),
        coverImage,
        pickStr(body, ['video_url', 'video'], existing.video_url || ''),
        pickStr(body, ['file_url'], existing.file_url || ''),
        pickStr(body, ['file_name'], existing.file_name || ''),
        pickStr(body, ['tags'], existing.tags || ''),
        pickJson(body, ['project_info'], existing.project_info || '{}'),
        pickJson(body, ['design_concept'], existing.design_concept || '{}'),
        pickJson(body, ['floor_plan'], existing.floor_plan || '{}'),
        pickJson(body, ['spaces'], existing.spaces || '[]'),
        pickJson(body, ['materials'], existing.materials || '[]'),
        images.join(','),
        pickStr(body, ['type'], existing.type || '家装'),
        pickStr(body, ['location'], existing.location || ''),
        sortOrder,
        featured,
        id
      ).run();

      if (!updateResult.success || updateResult.changes === 0) {
        return new Response(JSON.stringify({ error: '更新失败，数据库写入未生效' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const row = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
      return new Response(JSON.stringify({ success: true, data: toApi(row) }), {
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
