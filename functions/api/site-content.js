// site-content.js — 网站内容公开读取API (Cloudflare Pages Functions)
// 认证: 无需鉴权，只读
// 存储: R2 bucket qingsong-images, 文件 site-content.json
// 用途: 前端首页各板块(hero/services/process/about/contact)读取后台保存的网站内容

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  if (method !== 'GET') {
    return new Response(JSON.stringify({ error: '不支持的请求方法' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bucket = env.IMAGES;
  const key = 'site-content.json';

  try {
    const obj = await bucket.get(key);
    if (!obj) {
      return new Response(JSON.stringify({ data: null }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const text = await obj.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return new Response(JSON.stringify({ error: '内容数据损坏' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ data }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
