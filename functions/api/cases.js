// cases.js — 案例公开API (Cloudflare Pages Functions)
// 无需认证，支持 ?type= 和 ?featured=true 过滤

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: '仅支持GET请求' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bucket = env.IMAGES;
  const key = 'cases-data.json';

  try {
    const obj = await bucket.get(key);
    if (!obj) {
      return new Response(JSON.stringify({ cases: [] }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    const text = await obj.text();
    const data = JSON.parse(text);
    let cases = data.cases || [];

    const typeFilter = url.searchParams.get('type');
    if (typeFilter) {
      cases = cases.filter(c => c.type === typeFilter);
    }

    const featuredFilter = url.searchParams.get('featured');
    if (featuredFilter === 'true') {
      cases = cases.filter(c => c.featured === true);
    }

    cases.sort((a, b) => (a.order || 0) - (b.order || 0));

    return new Response(JSON.stringify({ cases }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ cases: [], error: e.message }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
