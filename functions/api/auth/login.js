// 仅密码验证
const ADMIN_PASSWORD = 'qingsong2026';
const JWT_SECRET = 'qs-cms-secret-2026';

export async function onRequestPost({ request, env }) {
  try {
    const { password } = await request.json();

    if (!password) {
      return new Response(JSON.stringify({ error: '请输入密码' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (password !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: '密码错误' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    // 生成 JWT token
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      sub: 'admin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 // 24小时过期
    };

    const toBase64Url = (str) => {
      return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };

    const headerB64 = toBase64Url(JSON.stringify(header));
    const payloadB64 = toBase64Url(JSON.stringify(payload));
    const signatureInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signatureInput));
    const sigArray = Array.from(new Uint8Array(sigBuffer));
    const sigHex = sigArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const sigB64 = toBase64Url(sigHex);
    const token = `${headerB64}.${payloadB64}.${sigB64}`;

    return new Response(JSON.stringify({ token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
