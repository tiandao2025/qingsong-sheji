// 常用素材 - 图片列表 API（独立路由，避免子路径不匹配）
// GET /api/blog-materials-images  -> 列出 R2 uploads/ 目录下的历史图片（公开 URL）
// 认证：与 blog-materials.js 保持一致（x-admin-key / JWT）

const ADMIN_KEYS = ['qs-admin-2024'];

function verifyAuth(request) {
  const key = request.headers.get('x-admin-key') || '';
  if (ADMIN_KEYS.includes(key)) return true;
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    if (token && token.length >= 16) return true;
  }
  return false;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!verifyAuth(request)) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }
  try {
    if (!env.IMAGES) {
      return Response.json({ error: 'R2 未绑定' }, { status: 500 });
    }
    const listed = await env.IMAGES.list({ prefix: 'uploads/', limit: 1000 });
    const images = (listed.objects || []).map((obj) => ({
      key: obj.key,
      url: 'https://qingsong.ggff.net/cdn/' + obj.key,
      size: obj.size,
      uploaded: obj.uploaded ? obj.uploaded.toISOString() : null,
    }));
    return Response.json({ images });
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e) }, { status: 500 });
  }
}
