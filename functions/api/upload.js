// Cloudflare Pages Function: /api/upload
// 手动解析 multipart body 以避免 request.formData() 兼容性问题

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error('No boundary found');
  const boundary = boundaryMatch[1].trim();
  const boundaryBytes = new TextEncoder().encode('--' + boundary);

  const bodyBytes = new Uint8Array(body);
  const parts = [];
  let start = boundaryBytes.length + 2; // 跳过第一个 boundary + \r\n

  while (start < bodyBytes.length) {
    let nextBoundary = -1;
    for (let i = start; i <= bodyBytes.length - boundaryBytes.length; i++) {
      let match = true;
      for (let j = 0; j < boundaryBytes.length; j++) {
        if (bodyBytes[i + j] !== boundaryBytes[j]) { match = false; break; }
      }
      if (match) { nextBoundary = i; break; }
    }
    if (nextBoundary === -1) break;

    const section = bodyBytes.slice(start, nextBoundary - 2);

    let headerEnd = -1;
    for (let i = 0; i < section.length - 3; i++) {
      if (section[i] === 13 && section[i+1] === 10 && section[i+2] === 13 && section[i+3] === 10) {
        headerEnd = i;
        break;
      }
    }
    if (headerEnd === -1) break;

    const headerText = new TextDecoder().decode(section.slice(0, headerEnd));
    const content = section.slice(headerEnd + 4);

    const cdMatch = headerText.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (!cdMatch) continue;

    const name = cdMatch[1];
    const filename = cdMatch[2] || null;
    const ctMatch = headerText.match(/Content-Type:\s*(.+)/i);
    const ctVal = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';

    parts.push({ name, filename, contentType: ctVal, data: content });

    const afterB = bodyBytes[nextBoundary + boundaryBytes.length];
    const afterAA = bodyBytes[nextBoundary + boundaryBytes.length + 1];
    if (afterB === 45 && afterAA === 45) break;

    start = nextBoundary + boundaryBytes.length + 2;
  }
  return parts;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  try {
    const ct = request.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const body = await request.arrayBuffer();
    const parts = parseMultipart(body, ct);

    if (parts.length === 0) {
      return new Response(JSON.stringify({ error: 'No parts found in multipart body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const fp = parts.find(p => p.name === 'file');
    if (!fp) {
      return new Response(JSON.stringify({ error: 'Field "file" not found', fields: parts.map(p => p.name) }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (fp.data.byteLength > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 20MB)' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const allowed = ['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','image/bmp'];
    if (!allowed.includes(fp.contentType)) {
      return new Response(JSON.stringify({ error: 'Unsupported file type: ' + fp.contentType }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const ext = (fp.filename || 'upload.jpg').split('.').pop() || 'jpg';
    const key = Date.now() + '_' + crypto.randomUUID().split('-')[0] + '.' + ext;

    const bucket = env.IMAGES;
    if (!bucket) {
      return new Response(JSON.stringify({ error: 'R2 bucket binding not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    await bucket.put(key, fp.data, {
      httpMetadata: { contentType: fp.contentType },
    });

    return new Response(JSON.stringify({ url: 'https://qingsong.ggff.net/images/' + key }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
