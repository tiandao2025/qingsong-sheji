// 后台登录接口：校验密码后返回管理凭证
// 密码从环境变量 ADMIN_PASSWORD 读取，不写入代码
export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const password = body && body.password ? String(body.password) : '';

    const validPassword = env.ADMIN_PASSWORD || '';
    if (!validPassword) {
      return new Response(JSON.stringify({ success: false, error: '服务器未配置管理员密码' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!password || password !== validPassword) {
      return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const token = env.ADMIN_TOKEN || 'qs-admin-2024';
    return new Response(JSON.stringify({ success: true, token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
