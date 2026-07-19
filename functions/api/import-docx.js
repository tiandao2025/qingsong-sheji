// Cloudflare Pages Function: /api/import-docx
// 解析上传的 .docx 文件，通过 mammoth 转为 HTML，图片上传到 R2

import mammoth from 'mammoth';

// Reuse multipart parser from upload.js
function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) throw new Error('No boundary found');
  const boundary = boundaryMatch[1].trim();
  const boundaryBytes = new TextEncoder().encode('--' + boundary);

  const bodyBytes = new Uint8Array(body);
  const parts = [];
  let start = boundaryBytes.length + 2;

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

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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

    const filePart = parts.find(p => p.name === 'file');
    if (!filePart) {
      return new Response(JSON.stringify({ error: 'Field "file" not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ];
    const filename = (filePart.filename || '').toLowerCase();
    if (!filename.endsWith('.docx')) {
      return new Response(JSON.stringify({ error: '仅支持 .docx 格式文件' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Size limit: 20MB
    if (filePart.data.byteLength > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: '文件过大（最大 20MB）' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const bucket = env.IMAGES;
    if (!bucket) {
      return new Response(JSON.stringify({ error: 'R2 bucket binding not found' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const docxBuffer = filePart.data;

    // Convert with mammoth, handle images via R2 upload
    const result = await mammoth.convertToHtml(
      { buffer: docxBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          try {
            const imageBuffer = await image.read();
            const contentType = image.contentType || 'image/png';
            const ext = contentType.split('/')[1] || 'png';

            const key = Date.now() + '_' + crypto.randomUUID().split('-')[0] + '.' + ext;

            await bucket.put(key, imageBuffer, {
              httpMetadata: { contentType },
            });

            const r2Url = 'https://qingsong.ggff.net/images/' + key;
            return { src: r2Url };
          } catch (err) {
            console.error('[import-docx] 图片上传失败:', err.message);
            // Return a placeholder on upload failure
            return { src: '' };
          }
        }),
      }
    );

    if (result.messages && result.messages.length > 0) {
      console.log('[import-docx] mammoth warnings:', JSON.stringify(result.messages));
    }

    return new Response(JSON.stringify({ html: result.value }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('[import-docx] Error:', err.message);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
