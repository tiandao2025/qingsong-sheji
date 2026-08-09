// ==================== 聊天记录 API ====================
// GET     /api/admin-chats       — 获取聊天记录列表
// GET     /api/admin-chats?sid=  — 获取指定 session 的聊天记录
// DELETE  /api/admin-chats?sid=  — 删除指定 session 的聊天记录
// DELETE  /api/admin-chats?clear=1 — 清空所有聊天记录

const CHATS_INDEX_KEY = 'chats-index.json';

function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const validToken = env.ADMIN_TOKEN || 'qs-admin-2024';
  const adminKey = request.headers.get('x-admin-key') || '';
  return token === validToken || adminKey === validToken;
}

async function getChatsIndex(env) {
  try {
    const obj = await env.IMAGES.get(CHATS_INDEX_KEY);
    if (!obj) return [];
    const text = await obj.text();
    return JSON.parse(text);
  } catch (e) {
    return [];
  }
}

async function saveChatsIndex(env, data) {
  await env.IMAGES.put(CHATS_INDEX_KEY, JSON.stringify(data, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

// 记录新对话（由前端聊天组件调用）
async function recordChat(env, sessionId, userMessage, aiReply) {
  let chats = await getChatsIndex(env);
  chats.push({
    sessionId,
    time: new Date().toISOString(),
    userMessage,
    aiReply: aiReply ? aiReply.substring(0, 500) : '',
    messageLength: aiReply ? aiReply.length : 0
  });
  // 保留最近 2000 条
  if (chats.length > 2000) chats = chats.slice(-2000);
  await saveChatsIndex(env, chats);
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (!verifyAuth(request, env)) {
    return new Response(JSON.stringify({ error: '未授权访问' }), { status: 401, headers });
  }

  const url = new URL(request.url);
  const sid = url.searchParams.get('sid');
  const clear = url.searchParams.get('clear');

  try {
    if (request.method === 'GET') {
      let chats = await getChatsIndex(env);

      if (sid) {
        chats = chats.filter(c => c.sessionId === sid);
      }

      // 按时间倒序，最近在前
      chats.sort((a, b) => new Date(b.time) - new Date(a.time));

      // 分页
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 200);
      const total = chats.length;
      const start = (page - 1) * limit;
      const paged = chats.slice(start, start + limit);

      // 统计信息
      const uniqueSessions = [...new Set(chats.map(c => c.sessionId))].length;
      const today = new Date().toISOString().split('T')[0];
      const todayCount = chats.filter(c => c.time.startsWith(today)).length;

      return new Response(JSON.stringify({
        success: true,
        data: paged,
        total,
        page,
        limit,
        stats: {
          totalMessages: total,
          uniqueSessions,
          todayMessages: todayCount
        }
      }), { headers });
    }

    if (request.method === 'DELETE') {
      let chats = await getChatsIndex(env);

      if (clear === '1') {
        await env.IMAGES.put(CHATS_INDEX_KEY, '[]', {
          httpMetadata: { contentType: 'application/json' }
        });
        return new Response(JSON.stringify({ success: true, message: '已清空所有聊天记录', deletedCount: chats.length }), { headers });
      }

      if (sid) {
        const before = chats.length;
        chats = chats.filter(c => c.sessionId !== sid);
        const deleted = before - chats.length;
        await saveChatsIndex(env, chats);
        return new Response(JSON.stringify({ success: true, message: `已删除 ${deleted} 条记录`, deletedCount: deleted }), { headers });
      }

      return new Response(JSON.stringify({ error: '请指定 sid 或 clear=1' }), { status: 400, headers });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), { status: 500, headers });
  }
}
