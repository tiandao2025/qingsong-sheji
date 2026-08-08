/**
 * GET /api/chat/logs
 * 聊天记录列表 — JWT 鉴权
 */

const JWT_SECRET = 'qs-cms-secret-2026';

function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const token = authHeader.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  try {
    const [headerB64, payloadB64] = parts;
    const fromBase64Url = (str) => {
      str = str.replace(/-/g, '+').replace(/_/g, '/');
      while (str.length % 4) str += '=';
      return atob(str);
    };

    const payload = JSON.parse(fromBase64Url(payloadB64));
    if (payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch (e) {
    return false;
  }
}

export async function onRequest({ request, env }) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // JWT 鉴权
  const authHeader = request.headers.get('Authorization');
  if (!verifyToken(authHeader)) {
    return new Response(JSON.stringify({ error: '未授权访问' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const url = new URL(request.url);

    // 详情查询：?id=X 返回单条 + 完整 messages
    const detailId = url.searchParams.get('id');
    if (detailId) {
      const row = await env.DB.prepare(
        'SELECT id, session_id, messages, visitor_ip, visitor_location, summary, valuable_info, created_at FROM chat_logs WHERE id = ?'
      ).bind(parseInt(detailId)).first();

      if (!row) {
        return new Response(JSON.stringify({ error: '记录不存在' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      let messages = [];
      let valuableInfo = null;
      try {
        if (row.messages) messages = JSON.parse(row.messages);
      } catch (e) {}
      try {
        if (row.valuable_info) valuableInfo = JSON.parse(row.valuable_info);
      } catch (e) {}

      return new Response(JSON.stringify({
        id: row.id,
        session_id: row.session_id,
        messages: messages,
        visitor_ip: row.visitor_ip,
        visitor_location: row.visitor_location || '未知',
        summary: row.summary || '',
        valuable_info: valuableInfo,
        created_at: row.created_at
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 列表查询
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20'), 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0'), 0);

    const { results } = await env.DB.prepare(
      `SELECT id, session_id, visitor_location, summary, valuable_info, created_at, messages
       FROM chat_logs
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    if (!results) {
      return new Response(JSON.stringify({ logs: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 处理返回数据：计算 messages 长度，格式化 valuable_info
    const logs = results.map(row => {
      const messagesLen = row.messages ? row.messages.length : 0;
      let valuableInfo = null;
      try {
        if (row.valuable_info) {
          valuableInfo = JSON.parse(row.valuable_info);
        }
      } catch (e) {
        valuableInfo = { raw: row.valuable_info };
      }

      return {
        id: row.id,
        session_id: row.session_id,
        visitor_location: row.visitor_location || '未知',
        summary: row.summary || '',
        valuable_info: valuableInfo,
        created_at: row.created_at,
        messages_length: messagesLen
      };
    });

    // 获取总数
    const countResult = await env.DB.prepare('SELECT COUNT(*) as total FROM chat_logs').first();
    const total = countResult ? countResult.total : logs.length;

    return new Response(JSON.stringify({ logs, total }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (err) {
    console.error('/api/chat/logs 查询失败:', err.message);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
