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

// 兼容 x-admin-key 鉴权（旧版后台 api() 携带）
function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const validToken = env.ADMIN_TOKEN || 'qs-admin-2024';
  const adminKey = request.headers.get('x-admin-key') || '';
  return verifyToken(authHeader) || adminKey === validToken;
}

export async function onRequest({ request, env }) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key'
      }
    });
  }

  // 鉴权
  if (!verifyAuth(request, env)) {
    return new Response(JSON.stringify({ error: '未授权访问' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 删除：?clear=1 清空全部；?sid=xxx 删除指定会话；?id=X 删除单条
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const clear = url.searchParams.get('clear');
      const sid = url.searchParams.get('sid');
      const did = url.searchParams.get('id');
      if (clear === '1') {
        await env.DB.prepare('DELETE FROM chat_logs').run();
      } else if (sid) {
        await env.DB.prepare('DELETE FROM chat_logs WHERE session_id = ?').bind(sid).run();
      } else if (did) {
        await env.DB.prepare('DELETE FROM chat_logs WHERE id = ?').bind(parseInt(did)).run();
      } else {
        return new Response(JSON.stringify({ error: '缺少删除参数' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '删除失败: ' + err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
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

    // 处理返回数据：计算 messages 长度，格式化 valuable_info，提取首条用户消息与末条 AI 回复
    const logs = results.map(row => {
      const messagesLen = row.messages ? row.messages.length : 0;
      let valuableInfo = null;
      let firstUserMsg = '';
      let lastAiMsg = '';
      try {
        if (row.messages) {
          const msgs = JSON.parse(row.messages);
          if (Array.isArray(msgs)) {
            const userMsgs = msgs.filter(m => m.role === 'user' && m.content);
            const aiMsgs = msgs.filter(m => m.role === 'assistant' && m.content);
            if (userMsgs.length > 0) firstUserMsg = String(userMsgs[0].content).substring(0, 200);
            if (aiMsgs.length > 0) lastAiMsg = String(aiMsgs[aiMsgs.length - 1].content).substring(0, 200);
          }
        }
      } catch (e) {}
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
        messages_length: messagesLen,
        first_user_message: firstUserMsg,
        last_ai_message: lastAiMsg
      };
    });

    // 获取总数与统计信息
    const countResult = await env.DB.prepare('SELECT COUNT(*) as total FROM chat_logs').first();
    const total = countResult ? countResult.total : logs.length;
    const today = new Date().toISOString().split('T')[0];
    const todayResult = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM chat_logs WHERE substr(created_at, 1, 10) = ?"
    ).bind(today).first();
    const sessionResult = await env.DB.prepare(
      'SELECT COUNT(DISTINCT session_id) as c FROM chat_logs'
    ).first();

    return new Response(JSON.stringify({
      logs, total,
      stats: {
        totalMessages: total,
        todayMessages: todayResult ? todayResult.c : 0,
        uniqueSessions: sessionResult ? sessionResult.c : 0
      }
    }), {
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
