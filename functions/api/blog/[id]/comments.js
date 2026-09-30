// GET  /api/blog/:id/comments - 获取某篇文章的评论留言列表
// POST /api/blog/:id/comments - 发表评论留言（游客可用，昵称选填）
const MAX_CONTENT = 500;      // 留言正文最大字数
const MAX_NICKNAME = 20;      // 昵称最大字数
const RATE_WINDOW = 60;       // 限流窗口（秒）
const RATE_MAX = 3;           // 同一 IP 窗口内最多留言条数
const LIST_LIMIT = 200;       // 单篇文章最多返回条数

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 2]; // 路径形如 /api/blog/[id]/comments

  if (!id) return json({ error: '缺少文章 ID' }, 400);

  try {
    await ensureTable(env);
    if (request.method === 'GET') return await handleGet(env, id);
    if (request.method === 'POST') return await handlePost(request, env, id);
  } catch (e) {
    return json({ error: '评论服务异常：' + (e && e.message ? e.message : '未知错误') }, 500);
  }
  return new Response('Method Not Allowed', { status: 405 });
}

// 幂等建表：首次访问自动创建评论表（与 blog_view_logs 同一套做法）
async function ensureTable(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS blog_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_id TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '访客',
      content TEXT NOT NULL,
      ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(blog_id, created_at)'
  ).run();
}

async function handleGet(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT id, nickname, content, created_at FROM blog_comments WHERE blog_id = ? ORDER BY created_at ASC, id ASC LIMIT ?'
  ).bind(id, LIST_LIMIT).all();
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM blog_comments WHERE blog_id = ?'
  ).bind(id).first();
  return json({ comments: results || [], total: row ? row.c : 0 });
}

async function handlePost(request, env, id) {
  const post = await env.DB.prepare('SELECT id FROM blog_posts WHERE id = ?').bind(id).first();
  if (!post) return json({ error: '文章不存在' }, 404);

  let data = {};
  try {
    data = await request.json();
  } catch (e) {
    return json({ error: '请求格式有误' }, 400);
  }

  const content = cleanText(data.content);
  let nickname = cleanText(data.nickname).slice(0, MAX_NICKNAME);
  if (!content) return json({ error: '留言内容不能为空' }, 400);
  if (content.length > MAX_CONTENT) return json({ error: '留言最多 ' + MAX_CONTENT + ' 字，请精简一下' }, 400);
  if (!nickname) nickname = '访客';

  const ip = request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';
  const ipHash = hashIp(ip);

  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM blog_comments WHERE ip_hash = ? AND created_at > datetime('now', ?)"
  ).bind(ipHash, '-' + RATE_WINDOW + ' seconds').first();
  if (recent && recent.c >= RATE_MAX) {
    return json({ error: '留言太频繁啦，请稍后再试' }, 429);
  }

  const info = await env.DB.prepare(
    'INSERT INTO blog_comments (blog_id, nickname, content, ip_hash) VALUES (?, ?, ?, ?)'
  ).bind(id, nickname, content, ipHash).run();

  let rowId = null;
  if (info) {
    if (info.meta && info.meta.last_row_id) rowId = info.meta.last_row_id;
    else if (info.last_row_id) rowId = info.last_row_id;
  }
  const created = rowId
    ? await env.DB.prepare('SELECT id, nickname, content, created_at FROM blog_comments WHERE id = ?').bind(rowId).first()
    : null;
  const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM blog_comments WHERE blog_id = ?').bind(id).first();

  return json({
    comment: created || { nickname: nickname, content: content, created_at: new Date().toISOString() },
    total: total ? total.c : 0
  }, 201);
}

// 正文清洗：去控制字符、统一换行、压缩空行、裁剪首尾空白
function cleanText(v) {
  if (v === undefined || v === null) return '';
  let s = String(v).replace(/\r\n?/g, '\n');
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// 简单哈希，避免直接落库明文 IP
function hashIp(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) - h + ip.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
