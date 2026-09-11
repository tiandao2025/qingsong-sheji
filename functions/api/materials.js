// materials.js — 设计选材 / 材质库 API (Cloudflare Pages Functions)
// 路由: /api/materials
// GET  /api/materials?category=xxx  公开，返回材质列表 {items:[{id,name,category,description,image_url,created_at}]}，按创建时间倒序
// POST /api/materials                需认证（写法与 upload.js 完全一致：x-admin-key / Bearer 明文 token / JWT）
//    multipart 表单字段: file(图片) + name + category + description
//    图片写入 R2(binding=IMAGES, bucket qingsong-images)，key = uploads/textures/{毫秒时间戳}_{净化文件名}
//    素材索引统一存 R2 根 materials-index.json（读-合并-写回，参考 site-content.js / blog-index.json 模式）
//    同文件重复上传按内容指纹(SHA-256)与 URL 双重去重，不重复登记
// 响应头带 CORS，GET/POST/OPTIONS 均处理，供外部独立 Pages 项目跨域调用

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

const INDEX_KEY = 'materials-index.json';
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB，与 upload.js 一致
const DEFAULT_CATEGORY = '其他';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ...CORS_HEADERS }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (method === 'GET') {
    return handleGet(request, env);
  }
  if (method === 'POST') {
    return handlePost(request, env);
  }
  return json({ error: '不支持的请求方法' }, 405);
}

// ---------- 读 / 写 R2 索引 ----------
async function readIndex(env) {
  try {
    const obj = await env.IMAGES.get(INDEX_KEY);
    if (!obj) return { items: [] };
    const text = await obj.text();
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.items)) return parsed;
    if (Array.isArray(parsed)) return { items: parsed }; // 兼容旧结构
    return { items: [] };
  } catch (e) {
    // 数据损坏或读取失败时按空库处理，避免阻塞上传
    return { items: [] };
  }
}

async function writeIndex(env, data) {
  await env.IMAGES.put(INDEX_KEY, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

// ---------- GET ----------
async function handleGet(request, env) {
  try {
    const url = new URL(request.url);
    const category = (url.searchParams.get('category') || '').trim();
    const limit = parseInt(url.searchParams.get('limit') || '200', 10);

    const index = await readIndex(env);
    let items = index.items || [];

    if (category) {
      items = items.filter((m) => (m.category || '').trim() === category);
    }

    // 按创建时间倒序
    items = items.slice().sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    if (Number.isFinite(limit) && limit > 0) {
      items = items.slice(0, limit);
    }

    return json({ items });
  } catch (e) {
    return json({ error: '服务器错误: ' + e.message }, 500);
  }
}

// ---------- POST ----------
async function handlePost(request, env) {
  const auth = await verifyAuth(request, env);
  if (!auth) {
    return json({ error: '未授权' }, 401);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const name = (formData.get('name') || '').toString().trim();
    const category = (formData.get('category') || '').toString().trim() || DEFAULT_CATEGORY;
    const description = (formData.get('description') || '').toString().trim();

    if (!file || !file.name) {
      return json({ error: '请选择材质图片' }, 400);
    }
    if (!name) {
      return json({ error: '材质名称不能为空' }, 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: '文件大小不能超过 50MB' }, 400);
    }
    if (file.type && !file.type.startsWith('image/')) {
      return json({ error: '仅支持图片文件' }, 400);
    }

    // 内容指纹：用于"同文件重复上传按 URL 去重不重复登记"
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    const fileHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^\w.-]/g, '_');
    const key = `uploads/textures/${timestamp}_${safeName}`;
    const imageUrl = `https://qingsong.ggff.net/cdn/${key}`;

    // 读-合并-写回（并发写入为尽力而为，与 blog-index.json / site-content.json 既有模式一致）
    const index = await readIndex(env);
    const items = index.items || [];

    // 去重检查：同 URL 或同内容指纹视为同一文件，不重复登记
    const existing = items.find((m) => m.image_url === imageUrl || m.file_hash === fileHash);
    if (existing) {
      return json({ success: true, duplicate: true, url: existing.image_url, material: existing });
    }

    await env.IMAGES.put(key, buffer, {
      httpMetadata: {
        contentType: file.type || 'image/png'
      }
    });

    const material = {
      id: `m_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      category,
      description,
      image_url: imageUrl,
      created_at: new Date().toISOString(),
      file_hash: fileHash // 内部字段，用于去重（GET 对外输出时保留亦可，字段语义为轻量去重标识）
    };

    items.push(material);
    await writeIndex(env, { items });

    return json({ success: true, url: material.image_url, material }, 200);
  } catch (e) {
    return json({ error: '上传失败: ' + e.message }, 500);
  }
}

// 鉴权写法与 functions/api/upload.js 完全一致（引用其校验逻辑）
async function verifyAuth(request, env) {
  // 兼容旧版后台 admin.html 的 x-admin-key 认证
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);

  // 兼容新版后台登录返回的明文 token（非 JWT）
  if (token === 'qs-admin-2024') return true;
  if (env.ADMIN_TOKEN && token === env.ADMIN_TOKEN) return true;

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
