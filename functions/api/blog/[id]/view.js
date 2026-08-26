// POST /api/blog/:id/view - 文章浏览量计数接口
// 防刷：同一 IP 1 小时内对同一文章只计数一次（D1 blog_view_logs 去重）
export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 2]; // 路径形如 /api/blog/[id]/view

  // 幂等建表（首次访问时自动创建，不存在则建）
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS blog_view_logs (
      blog_id INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      viewed_at INTEGER NOT NULL
    )`
  ).run();

  // 获取客户端 IP（Cloudflare 直连头优先）
  const ip = request.headers.get('CF-Connecting-IP') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown';

  // 简单哈希，避免直接落库明文 IP
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = ((h << 5) - h + ip.charCodeAt(i)) | 0;
  }
  const ipHash = (h >>> 0).toString(36);

  const now = Math.floor(Date.now() / 1000);
  const WINDOW = 3600; // 去重窗口：1 小时

  const recent = await env.DB.prepare(
    'SELECT viewed_at FROM blog_view_logs WHERE blog_id = ? AND ip_hash = ? ORDER BY viewed_at DESC LIMIT 1'
  ).bind(id, ipHash).first();

  let counted = false;
  if (recent && (now - recent.viewed_at) < WINDOW) {
    // 窗口内重复访问：不重复计数
  } else {
    await env.DB.prepare(
      'INSERT INTO blog_view_logs (blog_id, ip_hash, viewed_at) VALUES (?, ?, ?)'
    ).bind(id, ipHash, now).run();
    await env.DB.prepare(
      'UPDATE blog_posts SET views = COALESCE(views, 0) + 1 WHERE id = ?'
    ).bind(id).run();
    counted = true;
  }

  const post = await env.DB.prepare('SELECT views FROM blog_posts WHERE id = ?').bind(id).first();
  return new Response(JSON.stringify({
    views: post ? (post.views || 0) : 0,
    counted: counted
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
