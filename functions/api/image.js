// Cloudflare Pages Function: /api/image
// 代理 R2 图片，解决 Content-Type 和 SPA 路由回退问题

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get('key');

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // R2 中文件直接存储，无目录前缀
  const r2Key = key.replace(/^images\//, '');

  try {
    const obj = await env.IMAGES.get(r2Key);
    if (!obj) {
      return new Response(null, {
        status: 404,
        headers: corsHeaders,
      });
    }

    // 根据扩展名设置正确的 Content-Type
    const ext = r2Key.split('.').pop().toLowerCase();
    const mimeTypes = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'bmp': 'image/bmp',
      'ico': 'image/x-icon',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Access-Control-Allow-Origin', '*');

    // 写入 R2 对象的元数据
    obj.writeHttpMetadata(headers);

    return new Response(obj.body, {
      headers,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
