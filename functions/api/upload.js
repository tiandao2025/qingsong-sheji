// POST /api/upload - 上传文件到 R2（需认证）
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAuth(request, env);
  if (!auth) {
    return new Response(JSON.stringify({ error: '未授权' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !file.name) {
      return new Response(JSON.stringify({ error: '请选择文件' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // 限制文件大小 50MB
    if (file.size > 50 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: '文件大小不能超过 50MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^\w.-]/g, '_');
    const key = `uploads/${timestamp}_${safeName}`;

    await env.IMAGES.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream'
      }
    });

    // 生成公开访问 URL
    const publicUrl = `https://qingsong.ggff.net/cdn/${key}`;

    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      key: key,
      name: file.name,
      size: file.size,
      type: file.type
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '上传失败: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

async function verifyAuth(request, env) {
  // 兼容旧版后台 admin.html 的 x-admin-key 认证
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  // 兼容新版后台登录返回的明文 token（非 JWT）
  if (token === 'qs-admin-2024') return true;
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
