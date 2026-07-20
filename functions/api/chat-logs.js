// Cloudflare Pages Function: /api/chat-logs
// Admin query: list sessions by date, get full conversation

const BUCKET_NAME = 'IMAGES';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Max-Age': '86400',
  };
}

async function verifyToken(token, env) {
  if (!token) return false;
  try {
    const obj = await env[BUCKET_NAME].get(`sessions/${token}.json`);
    if (!obj) return false;
    const session = JSON.parse(await obj.text());
    if (Date.now() > session.expiresAtTs) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders(),
    });
  }

  // Auth
  const headerToken = request.headers.get('x-admin-token') || '';
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token') || '';
  let authed = false;
  if (headerToken) authed = await verifyToken(headerToken, env);
  else if (queryToken) authed = await verifyToken(queryToken, env);

  if (!authed) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders(),
    });
  }

  const date = url.searchParams.get('date');
  const session = url.searchParams.get('session');

  try {
    if (!date) {
      return new Response(JSON.stringify({ success: false, error: 'Missing date parameter' }), {
        status: 400, headers: corsHeaders(),
      });
    }

    if (session) {
      // Return full conversation for a specific session
      const logKey = `chat-logs/${date}/${session}.jsonl`;
      const obj = await env[BUCKET_NAME].get(logKey);
      if (!obj) {
        return new Response(JSON.stringify({ success: false, error: 'Session not found' }), {
          status: 404, headers: corsHeaders(),
        });
      }
      const text = await obj.text();
      const lines = text.trim().split('\n').filter(Boolean);
      const messages = lines.map(line => {
        try { return JSON.parse(line); } catch (e) { return null; }
      }).filter(Boolean);

      return new Response(JSON.stringify({ success: true, session, messages }), {
        headers: corsHeaders(),
      });
    }

    // List all sessions for the date
    const prefix = `chat-logs/${date}/`;
    let allObjects = [];
    let cursor;

    do {
      const listOpts = { prefix, limit: 200 };
      if (cursor) listOpts.cursor = cursor;
      const list = await env[BUCKET_NAME].list(listOpts);
      allObjects = allObjects.concat(list.objects);
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);

    // For each session file, read the first line to get summary
    const sessions = [];
    for (const obj of allObjects) {
      const sessionId = obj.key.replace(prefix, '').replace('.jsonl', '');
      try {
        const fileObj = await env[BUCKET_NAME].get(obj.key);
        const text = await fileObj.text();
        const lines = text.trim().split('\n').filter(Boolean);
        const msgCount = lines.length;
        const firstMsg = lines.length > 0 ? (() => {
          try { return JSON.parse(lines[0]); } catch (e) { return null; }
        })() : null;
        const lastMsg = lines.length > 0 ? (() => {
          try { return JSON.parse(lines[lines.length - 1]); } catch (e) { return null; }
        })() : null;

        // Get time from first message
        const time = firstMsg ? firstMsg.timestamp : '';
        // Get first user message as preview
        const preview = firstMsg ? (firstMsg.content || '').substring(0, 50) : '';

        sessions.push({
          sessionId,
          time,
          preview,
          msgCount,
          userMsgCount: Math.ceil(msgCount / 2),
          lastTime: lastMsg ? lastMsg.timestamp : '',
        });
      } catch (e) {
        sessions.push({ sessionId, time: '', preview: '', msgCount: 0, userMsgCount: 0, lastTime: '' });
      }
    }

    // Sort by time descending
    sessions.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return b.time.localeCompare(a.time);
    });

    return new Response(JSON.stringify({ success: true, date, sessions }), {
      headers: corsHeaders(),
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
}
