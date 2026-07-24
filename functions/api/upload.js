export async function onRequestPost(context) {
  const { request, env } = context;
  const R2_PUBLIC = 'https://pub-7646c45fb83242e189261cdec03baf81.r2.dev';
  const MAX_SIZE = 25 * 1024 * 1024; // 25MB

  // Cloudflare Pages 可能自动添加了中间件，先尝试直接读取 body
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    console.log('Content-Type:', contentType);
    return new Response(JSON.stringify({ error: '需要 multipart/form-data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let formData;
  try {
    formData = await request.formData();
    console.log('FormData keys:', Array.from(formData.keys()));
  } catch (e) {
    console.error('FormData parse error:', e);
    return new Response(JSON.stringify({ error: '表单解析失败: ' + e.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const file = formData.get('file');
  console.log('File from FormData:', file ? 'found' : 'not found', file);
  if (!file || !(file instanceof File)) {
    return new Response(JSON.stringify({ error: '未找到上传文件（字段名应为 file）' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: '文件超过 25MB 限制' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const key = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  try {
    await env.IMAGES.put(key, file, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });
  } catch (e) {
    console.error('R2 put error:', e);
    return new Response(JSON.stringify({ error: '上传至 R2 失败: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ url: `${R2_PUBLIC}/${key}` }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
