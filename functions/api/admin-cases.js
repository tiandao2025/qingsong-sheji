// admin-cases.js — 案例CRUD API (Cloudflare Pages Functions)
// 认证: x-admin-key: qs-admin-2024
// 存储: R2 bucket qingsong-images, 文件 cases-data.json

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

  const bucket = env.IMAGES;
  const key = 'cases-data.json';

  async function readData() {
    try {
      const obj = await bucket.get(key);
      if (!obj) return { cases: [] };
      const text = await obj.text();
      return JSON.parse(text);
    } catch (e) {
      return { cases: [] };
    }
  }

  async function writeData(data) {
    await bucket.put(key, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  try {
    // GET
    if (method === 'GET') {
      const data = await readData();
      const caseId = url.searchParams.get('id');
      if (caseId) {
        const item = data.cases.find(c => c.id === caseId);
        if (!item) {
          return new Response(JSON.stringify({ error: '案例不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ data: item }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ data: data.cases }), {
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
      const data = await readData();
      const newCase = {
        id: 'case_' + Date.now(),
        name: body.name.trim(),
        desc: body.desc || '',
        type: body.type || '家装',
        location: body.location || '',
        images: body.images || [],
        video: body.video || '',
        order: typeof body.order === 'number' ? body.order : data.cases.length,
        featured: !!body.featured
      };
      data.cases.push(newCase);
      await writeData(data);
      return new Response(JSON.stringify({ success: true, data: newCase }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PUT
    if (method === 'PUT') {
      const body = await request.json();
      const caseId = body.id || url.searchParams.get('id');
      if (!caseId) {
        return new Response(JSON.stringify({ error: '缺少案例ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const data = await readData();
      const idx = data.cases.findIndex(c => c.id === caseId);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: '案例不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const existing = data.cases[idx];
      data.cases[idx] = {
        id: existing.id,
        name: body.name !== undefined ? body.name.trim() : existing.name,
        desc: body.desc !== undefined ? body.desc : existing.desc,
        type: body.type !== undefined ? body.type : existing.type,
        location: body.location !== undefined ? body.location : existing.location,
        images: body.images !== undefined ? body.images : existing.images,
        video: body.video !== undefined ? body.video : existing.video,
        order: body.order !== undefined ? body.order : existing.order,
        featured: body.featured !== undefined ? !!body.featured : existing.featured
      };
      await writeData(data);
      return new Response(JSON.stringify({ success: true, data: data.cases[idx] }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // DELETE
    if (method === 'DELETE') {
      const caseId = url.searchParams.get('id');
      if (!caseId) {
        return new Response(JSON.stringify({ error: '缺少案例ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const data = await readData();
      const idx = data.cases.findIndex(c => c.id === caseId);
      if (idx === -1) {
        return new Response(JSON.stringify({ error: '案例不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      data.cases.splice(idx, 1);
      await writeData(data);
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
