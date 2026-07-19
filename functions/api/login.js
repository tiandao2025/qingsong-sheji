// Cloudflare Pages Function: /api/login
// Admin login with password verification and token generation

// Default fallback password (used when ADMIN_PASSWORD env var not set)
const DEFAULT_PASSWORD = 'qingsong2024';
const TOKEN_EXPIRY_HOURS = 8;
const SALT = 'qingsong-sheji-auth';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    'Access-Control-Max-Age': '86400',
  };
}

async function generateToken(passwordHint, env) {
  // Create a token using Web Crypto API: randomUUID + timestamp + HMAC
  const uuid = crypto.randomUUID();
  const timestamp = Date.now();
  const raw = `${uuid}:${timestamp}:${passwordHint}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(SALT);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(raw));

  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const token = `${uuid}.${timestamp}.${sigHex}`;

  // Store session in R2
  const expiresAt = timestamp + TOKEN_EXPIRY_HOURS * 3600 * 1000;
  const sessionData = {
    token,
    createdAt: new Date(timestamp).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    expiresAtTs: expiresAt,
  };

  try {
    await env.IMAGES.put(`sessions/${token}.json`, JSON.stringify(sessionData), {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (e) {
    // R2 write failed, still return token (degraded mode)
  }

  return {
    token,
    expires: new Date(expiresAt).toISOString(),
  };
}

export async function verifyToken(token, env) {
  if (!token) return false;
  try {
    const obj = await env.IMAGES.get(`sessions/${token}.json`);
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

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders(),
    });
  }

  try {
    const body = await request.json();
    const inputPassword = body.password || '';

    // Read password: env var > default fallback
    const correctPassword = env.ADMIN_PASSWORD || DEFAULT_PASSWORD;

    if (inputPassword !== correctPassword) {
      return new Response(JSON.stringify({ success: false, error: '密码错误' }), {
        status: 401, headers: corsHeaders(),
      });
    }

    const result = await generateToken(correctPassword, env);

    return new Response(JSON.stringify({
      success: true,
      token: result.token,
      expires: result.expires,
    }), { headers: corsHeaders() });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
}
