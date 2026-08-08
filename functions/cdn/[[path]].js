// CDN 代理：从 R2 返回文件，R2 未命中时回退旧版部署
// GET /cdn/*
const OLD_ORIGIN = 'https://33e00147.qingsong-sheji.pages.dev';

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const key = url.pathname.replace('/cdn/', '');

  if (!key) {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const object = await env.IMAGES.get(key);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('etag', object.httpEtag);
      return new Response(object.body, { headers });
    }

    // R2 未命中 → 先尝试当前 Pages 部署的 images/ 静态资源
    const selfUrlObj = new URL(request.url);
    selfUrlObj.pathname = '/images/' + key;
    const selfResp = await fetch(selfUrlObj.toString());
    if (selfResp.ok && !(selfResp.headers.get('content-type') || '').includes('text/html')) {
      const headers = new Headers(selfResp.headers);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(selfResp.body, { headers });
    }

    // 再回退旧版部署
    const oldUrl = `${OLD_ORIGIN}/${key}`;
    const oldResp = await fetch(oldUrl);
    if (oldResp.ok) {
      const headers = new Headers(oldResp.headers);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(oldResp.body, { headers });
    }

    // 404 不缓存，防止 Cloudflare 缓存错误响应
    const notFoundHeaders = new Headers();
    notFoundHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return new Response('Not Found', { status: 404, headers: notFoundHeaders });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}
