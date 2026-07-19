// Cloudflare Pages Function: /images/*
// R2 图片代理 — 从 R2 bucket 读取图片并返回

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const url = new URL(request.url);
    // 去掉 /images/ 前缀得到 R2 object key
    const key = url.pathname.replace(/^\/images\//, '');

    if (!key) {
      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const bucket = env.IMAGES;
    if (!bucket) {
      return new Response(JSON.stringify({ error: 'R2 bucket binding not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 先用 path 直接作为 key 查找
    let object = await bucket.get(key);
    if (object === null) {
      // R2 中文件 key 格式为 "uploads/timestamp_uuid.ext"
      // 如果直接用 path 找不到，尝试加 "uploads/" 前缀
      object = await bucket.get('uploads/' + key);
    }
    if (object === null) {
      // R2 中未找到，fall through 到 Cloudflare Pages 静态文件服务器
      return context.next();
    }

    // 根据文件扩展名确定 Content-Type
    const ext = key.split('.').pop().toLowerCase();
    const contentTypeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
    };
    const contentType = contentTypeMap[ext] || object.httpMetadata?.contentType || 'application/octet-stream';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
