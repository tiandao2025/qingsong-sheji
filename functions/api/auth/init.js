// 初始化管理员账号：POST /api/auth/init
// 仅在 admins 表为空时可调用，用于首次创建管理员
export async function onRequestPost({ request, env }) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: '请提供用户名和密码' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: '密码至少6位' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await env.DB.prepare('SELECT COUNT(*) as cnt FROM admins').first();
    if (existing.cnt > 0) {
      return new Response(JSON.stringify({ error: '管理员已存在，无法重复初始化' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // SHA-256 哈希
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(password));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await env.DB.prepare(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)'
    ).bind(username, hashHex).run();

    return new Response(JSON.stringify({ success: true, message: '管理员创建成功' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
