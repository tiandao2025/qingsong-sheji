/**
 * POST /api/ai-polish
 * 智谱AI免费大模型代理 — 文字润色 / 基于封面图生成内容
 * 使用 GLM-4-Flash（文本）或 GLM-4V-Flash（视觉）
 */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB，超过则跳过视觉模型降级纯文本

/**
 * 将远程图片 URL 转为 base64 data URL
 * 智谱视觉模型无法直接访问部分 CDN 域名，需先下载转 base64
 * 超过 2MB 的图片直接拒绝，避免 Worker 超时
 */
async function imageUrlToBase64(url) {
  // 先用 HEAD 检查大小
  const headResp = await fetch(url, { method: 'HEAD' });
  if (!headResp.ok) throw new Error(`图片获取失败 HTTP ${headResp.status}`);
  const contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大 (${(contentLength / 1024 / 1024).toFixed(1)}MB)，超过2MB上限`);
  }

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`图片获取失败 HTTP ${resp.status}`);
  const contentType = resp.headers.get('content-type') || 'image/jpeg';
  const buffer = await resp.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${contentType};base64,${base64}`;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let apiKey = (env.ZHIPU_API_KEY || 'de905fb991ce4344877e5d4400a17ad1.NAN6MxvJYl5jMzsO').replace(/^\uFEFF/, '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: 'ZHIPU_API_KEY 未配置' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: '请求体不是合法 JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { text, coverImage, fieldLabel } = body;

  const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  let model, messages;

  const systemPrompt = `你是一位资深室内设计师兼文案专家，服务于高端设计工作室「青松设计」。你的任务是撰写/润色装修设计相关的文字内容，表达专业、优美、有感染力。`;

  // 将封面图 URL 转为 base64 data URL（智谱服务器无法直接访问 qingsong.ggff.net 等域名）
  let coverBase64 = null;
  if (coverImage) {
    try {
      coverBase64 = await imageUrlToBase64(coverImage);
    } catch (e) {
      console.warn('封面图转换base64失败，降级为纯文本模式:', e.message);
    }
  }

  if (coverBase64 && text) {
    // 有封面图 + 有文字：视觉模型润色
    model = 'glm-4v-flash';
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: coverBase64 }
          },
          {
            type: 'text',
            text: `请以资深室内设计师+文案专家的身份，结合这张封面图的内容，对以下「${fieldLabel || '文字'}」进行润色优化，使其表达更专业、更有感染力。保持原意，用优美的中文表达。只返回润色后的纯文本，不要任何 markdown 标记、引号括起来的前缀或解释。\n\n原始文字：\n${text}`
          }
        ]
      }
    ];
  } else if (coverBase64 && !text) {
    // 无文字 + 有封面图：视觉模型从图生成
    model = 'glm-4v-flash';
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: coverBase64 }
          },
          {
            type: 'text',
            text: `请以资深室内设计师+文案专家的身份，根据这张封面图中的装修设计内容，为「${fieldLabel || '描述'}」字段生成一段专业、优美、有感染力的中文描述文字。只返回生成的纯文本，不要任何 markdown 标记、引号括起来的前缀或解释。`
          }
        ]
      }
    ];
  } else if (text) {
    // 只有文字：文本模型润色
    model = 'glm-4-flash';
    messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `请以资深室内设计师+文案专家的身份，对以下「${fieldLabel || '文字'}」进行润色优化，使其表达更专业、更有感染力。保持原意，用优美的中文表达。只返回润色后的纯文本，不要任何 markdown 标记、引号括起来的前缀或解释。\n\n原始文字：\n${text}`
      }
    ];
  } else {
    return new Response(JSON.stringify({ success: false, error: '请提供 text 或 coverImage 至少一项' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const resp = await fetch(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ success: false, error: `智谱API返回错误 ${resp.status}: ${errText}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await resp.json();
    const resultText = data.choices?.[0]?.message?.content || '';

    // 去除可能的 markdown 代码块包裹和引号
    let cleaned = resultText.trim();
    cleaned = cleaned.replace(/^```[\s\S]*?\n/, '').replace(/\n```$/, '');
    cleaned = cleaned.replace(/^["'"']+|["'"']+$/g, '');

    return new Response(JSON.stringify({ success: true, text: cleaned }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: `请求智谱API失败: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
