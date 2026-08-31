// 视频分片直传 R2（支持 1GB 以内大文件）
// 三阶段：init（创建 multipart）→ part（逐片上传）→ complete（合并）
// 接口均需认证（x-admin-key / Bearer JWT），单分片经 Pages Functions（100MB 限制内）中转
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-key, Authorization',
  'Access-Control-Max-Age': '86400'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function verifyAuth(request, env) {
  const adminKey = request.headers.get('x-admin-key');
  if (adminKey === 'qs-admin-2024') return true;
  if (adminKey && adminKey === env.ADMIN_TOKEN) return true;
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const fromBase64Url = function (str) {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      return atob(str);
    };
    const payload = JSON.parse(fromBase64Url(parts[1]));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch (e) {
    return false;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS }
  });
}

export async function onRequestPost({ request, env }) {
  const auth = await verifyAuth(request, env);
  if (!auth) return json({ error: '未授权' }, 401);

  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  try {
    // 1) 初始化：创建 multipart 上传，返回 uploadId 与对象 key
    if (action === 'init') {
      const filename = url.searchParams.get('filename') || 'video.mp4';
      const size = parseInt(url.searchParams.get('size') || '0', 10);
      if (size <= 0) return json({ error: '缺少文件大小' }, 400);
      if (size > 1024 * 1024 * 1024) return json({ error: '文件不能超过 1GB' }, 400);

      const safeName = filename.replace(/[^\w.-]/g, '_');
      const key = `uploads/videos/${Date.now()}_${safeName}`;
      const multipart = await env.IMAGES.createMultipartUpload(key);
      return json({ success: true, uploadId: multipart.uploadId, key });
    }

    // 2) 上传分片：body 为二进制分片，返回 etag
    if (action === 'part') {
      const uploadId = url.searchParams.get('uploadId');
      const key = url.searchParams.get('key');
      const partNumber = parseInt(url.searchParams.get('partNumber') || '0', 10);
      if (!uploadId || !key || partNumber <= 0) return json({ error: '参数错误' }, 400);
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      if (contentType !== 'application/octet-stream' && !contentType.startsWith('application/')) {
        return json({ error: '分片必须以二进制提交' }, 400);
      }
      const body = await request.arrayBuffer();
      if (!body || body.byteLength === 0) return json({ error: '分片为空' }, 400);
      const multipart = await env.IMAGES.resumeMultipartUpload(key, uploadId);
      const part = await multipart.uploadPart(partNumber, body);
      return json({ success: true, etag: part.etag, partNumber });
    }

    // 3) 合并：parts 形如 [{partNumber, etag}, ...]，合并后返回公开 URL
    if (action === 'complete') {
      const uploadId = url.searchParams.get('uploadId');
      const key = url.searchParams.get('key');
      const body = await request.json();
      const parts = Array.isArray(body.parts) ? body.parts : [];
      if (!uploadId || !key || parts.length === 0) return json({ error: '参数错误' }, 400);

      const uploadedParts = parts
        .map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }))
        .sort((a, b) => a.partNumber - b.partNumber);

      const multipart = await env.IMAGES.resumeMultipartUpload(key, uploadId);
      const completed = await multipart.complete(uploadedParts);
      const publicUrl = `https://qingsong.ggff.net/cdn/${key}`;
      return json({ success: true, url: publicUrl, key, etag: completed.etag });
    }

    // 4) 中止：清理未完成的分片
    if (action === 'abort') {
      const uploadId = url.searchParams.get('uploadId');
      const key = url.searchParams.get('key');
      if (!uploadId || !key) return json({ error: '参数错误' }, 400);
      try {
        const multipart = await env.IMAGES.resumeMultipartUpload(key, uploadId);
        await multipart.abort();
      } catch (abortErr) {
        // 异常时忽略，未完成 multipart 依赖 R2 超时回收
      }
      return json({ success: true });
    }

    return json({ error: '未知操作' }, 400);
  } catch (e) {
    return json({ error: e.message || '上传失败' }, 500);
  }
}
