/**
 * POST /api/chat/log
 * 聊天记录后台存储 + AI 自动总结
 * 记录完整对话、访客地理位置，并调用智谱 AI 提取有价值信息
 */

const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

/**
 * 从 request.cf 提取地理位置，精确到市县
 */
function extractLocation(cf) {
  if (!cf) return '未知';
  const parts = [];
  if (cf.country && cf.country !== 'XX') parts.push(cf.country);
  if (cf.region) parts.push(cf.region);
  if (cf.city) parts.push(cf.city);
  return parts.length > 0 ? parts.join('') : '未知';
}

/**
 * 调用智谱 API 总结聊天内容，提取有价值信息
 */
async function summarizeChat(apiKey, messages) {
  // 提取用户消息用于总结（过滤掉 system 消息和长内容）
  const userDialogue = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role === 'user' ? '客户' : '赛赛'}: ${m.content}`)
    .join('\n');

  const summaryPrompt = `请分析以下客服聊天记录，用 JSON 格式返回（不要 markdown 代码块，直接纯 JSON）：

{
  "intent_level": "高/中/低",
  "focus": "客户关注什么类型（如住宅设计/商业空间/局部改造等）",
  "style_preference": "客户偏好的风格（如现代简约/新中式等）",
  "budget": "客户提到的预算或价格敏感度",
  "contact": "客户留下的联系方式（电话/微信等），没有则为空",
  "key_points": "其他有价值信息（如房屋面积、户型、时间要求等）",
  "summary": "一句话总结本次对话"
}

对话内容：
${userDialogue.slice(0, 3000)}`;

  try {
    const resp = await fetch(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 512
      })
    });

    if (!resp.ok) {
      console.error('智谱总结API错误:', resp.status);
      return null;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    // 尝试解析 JSON
    let jsonStr = content.trim();
    // 去掉可能的 markdown 代码块包裹
    jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
      return JSON.parse(jsonStr);
    } catch {
      // 解析失败则返回原始文本作为 summary
      return { summary: content, intent_level: '未知', focus: '', style_preference: '', budget: '', contact: '', key_points: '' };
    }
  } catch (err) {
    console.error('智谱总结请求失败:', err.message);
    return null;
  }
}

export async function onRequest({ request, env }) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const body = await request.json();
    const { sessionId, messages } = body;

    if (!sessionId || !messages || messages.length === 0) {
      return new Response(JSON.stringify({ success: false, error: '缺少必要参数' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 提取地理位置与 IP
    const cf = request.cf || {};
    const visitorLocation = extractLocation(cf);
    const visitorIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '未知';
    const createdAt = new Date().toISOString();

    // 调用智谱 AI 总结
    const apiKey = (env.ZHIPU_API_KEY || '').replace(/^\uFEFF/, '').trim();
    const analysis = apiKey ? await summarizeChat(apiKey, messages) : null;

    const summary = analysis?.summary || '';
    const valuableInfo = analysis ? JSON.stringify({
      intent_level: analysis.intent_level || '未知',
      focus: analysis.focus || '',
      style_preference: analysis.style_preference || '',
      budget: analysis.budget || '',
      contact: analysis.contact || '',
      key_points: analysis.key_points || ''
    }) : '';

    // 存入 D1
    const messagesJson = JSON.stringify(messages);
    const result = await env.DB.prepare(
      `INSERT INTO chat_logs (session_id, messages, visitor_ip, visitor_location, summary, valuable_info, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(sessionId, messagesJson, visitorIp, visitorLocation, summary, valuableInfo, createdAt)
      .run();

    if (!result.success) {
      console.error('D1写入失败:', result);
      return new Response(JSON.stringify({ success: false, error: '数据库写入失败' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      id: result.meta?.last_row_id,
      summary: summary,
      visitor_location: visitorLocation
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    console.error('/api/chat/log 异常:', err.message);
    return new Response(JSON.stringify({ success: false, error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
