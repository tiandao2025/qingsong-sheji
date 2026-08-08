// GET /api/cases/:id - 获取单个案例
// PUT /api/cases/:id - 更新案例（需认证）
// DELETE /api/cases/:id - 删除案例（需认证）
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
    if (!result) {
      return new Response(JSON.stringify({ error: '案例不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store, must-revalidate' }
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
    const { title, description, content, cover_image, video_url, file_url, file_name, tags, project_info, design_concept, floor_plan, spaces, materials } = data;

    // 获取现有记录
    const existing = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
    if (!existing) {
      return new Response(JSON.stringify({ error: '案例不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let slug = existing.slug;
    if (title && title !== existing.title) {
      slug = generateSlug(title);
    }

    // 序列化 JSON 字段
    const projectInfo = project_info !== undefined ? JSON.stringify(project_info) : existing.project_info;
    const designConcept = design_concept !== undefined ? JSON.stringify(design_concept) : existing.design_concept;
    const floorPlan = floor_plan !== undefined ? JSON.stringify(floor_plan) : existing.floor_plan;
    const spacesJson = spaces !== undefined ? JSON.stringify(spaces) : existing.spaces;
    const materialsJson = materials !== undefined ? JSON.stringify(materials) : existing.materials;

    const updateResult = await env.DB.prepare(
      `UPDATE cases SET title=?, slug=?, description=?, content=?, cover_image=?, video_url=?, file_url=?, file_name=?, tags=?, project_info=?, design_concept=?, floor_plan=?, spaces=?, materials=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      title || existing.title,
      slug,
      description !== undefined ? description : existing.description,
      content !== undefined ? content : existing.content,
      cover_image !== undefined ? cover_image : existing.cover_image,
      video_url !== undefined ? video_url : existing.video_url,
      file_url !== undefined ? file_url : existing.file_url,
      file_name !== undefined ? file_name : existing.file_name,
      tags !== undefined ? tags : existing.tags,
      projectInfo,
      designConcept,
      floorPlan,
      spacesJson,
      materialsJson,
      id
    ).run();

    if (!updateResult.success || updateResult.changes === 0) {
      return new Response(JSON.stringify({ error: '更新失败，数据库写入未生效' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await env.DB.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
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

    await env.DB.prepare('DELETE FROM cases WHERE id = ?').bind(id).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
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
