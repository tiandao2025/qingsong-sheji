// GET /api/cases - 获取案例列表
// POST /api/cases - 创建案例（需认证）
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
  const tag = url.searchParams.get('tag');
  const featured = url.searchParams.get('featured');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let where = [];
  let params = [];

  if (tag) {
    where.push('tags LIKE ?');
    params.push(`%${tag}%`);
  }
  if (featured === 'true' || featured === '1') {
    where.push('featured = 1');
  }

  let query = 'SELECT * FROM cases';
  if (where.length > 0) {
    query += ' WHERE ' + where.join(' AND ');
  }
  query += ' ORDER BY sort_order ASC, id ASC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  });
}

async function handlePost(request, env) {
  // 验证认证
  const auth = await verifyAuth(request, env);
  if (!auth) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const data = await request.json();
  const { title, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials, type, location, sort_order, featured } = data;

  if (!title) {
    return new Response(JSON.stringify({ error: '标题不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 生成 slug
  const slug = generateSlug(title);

  // 序列化 JSON 字段
  const projectInfo = project_info ? JSON.stringify(project_info) : '{}';
  const designConcept = design_concept ? JSON.stringify(design_concept) : '{}';
  const floorPlan = floor_plan ? JSON.stringify(floor_plan) : '{}';
  const spacesJson = spaces ? JSON.stringify(spaces) : '[]';
  const materialsJson = materials ? JSON.stringify(materials) : '[]';

  // 排序号: 未提供时取当前最大 sort_order + 1
  let order = 0;
  if (typeof sort_order === 'number') {
    order = sort_order;
  } else {
    const maxRow = await env.DB.prepare('SELECT MAX(sort_order) AS mx FROM cases').first();
    order = (maxRow && maxRow.mx ? maxRow.mx : 0) + 1;
  }

  const insertResult = await env.DB.prepare(
    `INSERT INTO cases (title, slug, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials, type, location, sort_order, featured)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, slug, description || '', content || '', cover_image || '', video_url || '', file_url || '', file_name || '', tags || '', projectInfo, designConcept, floorPlan, spacesJson, materialsJson, type || '', location || '', order, featured ? 1 : 0).run();

  if (!insertResult.success || insertResult.changes === 0) {
    return new Response(JSON.stringify({ error: '创建失败，数据库写入未生效' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const result = await env.DB.prepare('SELECT * FROM cases WHERE slug = ?').bind(slug).first();
  return new Response(JSON.stringify(result), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
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

function generateSlug(title) {
  let slug = title.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = 'case';
  const ts = Date.now().toString(36);
  return `${slug}-${ts}`;
}
