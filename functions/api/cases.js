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
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let query = 'SELECT * FROM cases ORDER BY created_at DESC LIMIT ?';
  let params = [limit];

  if (tag) {
    query = 'SELECT * FROM cases WHERE tags LIKE ? ORDER BY created_at DESC LIMIT ?';
    params = [`%${tag}%`, limit];
  }

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
  const { title, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials } = data;

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

  const insertResult = await env.DB.prepare(
    `INSERT INTO cases (title, slug, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, slug, description || '', content || '', cover_image || '', video_url || '', file_url || '', file_name || '', tags || '', projectInfo, designConcept, floorPlan, spacesJson, materialsJson).run();

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
