// Cloudflare Pages Function: /api/analytics
// Site analytics: POST for beacon data, GET for aggregated query
// Data stored in R2 bucket: analytics/YYYY-MM-DD.json

const ADMIN_KEY = 'qingsong2024'; // fallback for backward compat
const BUCKET_NAME = 'IMAGES';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateRangeKeys(days) {
  const keys = [];
  const d = new Date();
  for (let i = 0; i < days; i++) {
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    d.setDate(d.getDate() - 1);
  }
  return keys;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  try {
    if (request.method === 'POST') {
      return await handlePost(request, env);
    }

    if (request.method === 'GET') {
      return await handleGet(request, env);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders(),
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 500, headers: corsHeaders(),
    });
  }
}

async function handlePost(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400, headers: corsHeaders(),
    });
  }

  const country = (request.cf && request.cf.country) || 'Unknown';
  const city = (request.cf && request.cf.city) || '';
  const region = (request.cf && request.cf.region) || '';

  const entry = {
    country,
    city,
    region,
    page: body.page || '',
    referrer: body.referrer || '',
    sessionId: body.sessionId || '',
    time: new Date().toISOString(),
    isHeartbeat: !!body.heartbeat,
    endTime: !!body.heartbeat ? new Date().toISOString() : '',
  };

  const key = `analytics/${todayKey()}.json`;

  // Read existing data, append, write back
  let records = [];
  try {
    const obj = await env[BUCKET_NAME].get(key);
    if (obj) {
      const text = await obj.text();
      records = JSON.parse(text);
    }
  } catch (e) {
    // file doesn't exist yet, start fresh
  }

  records.push(entry);

  await env[BUCKET_NAME].put(key, JSON.stringify(records), {
    httpMetadata: { contentType: 'application/json' },
  });

  return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
}

async function handleGet(request, env) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || 'today';

  // Auth: check x-admin-token header first, then query param token (compat), then legacy password
  const headerToken = request.headers.get('x-admin-token') || '';
  const queryToken = url.searchParams.get('token') || '';
  const legacyPassword = url.searchParams.get('password') || '';

  let authed = false;

  if (headerToken) {
    authed = await verifyToken(headerToken, env);
  } else if (queryToken) {
    authed = await verifyToken(queryToken, env);
  } else if (legacyPassword === ADMIN_KEY) {
    authed = true;
  }

  if (!authed) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401, headers: corsHeaders(),
    });
  }

  let days = 1;
  if (range === '7days') days = 7;
  else if (range === '30days') days = 30;

  const keys = dateRangeKeys(days);
  const allRecords = [];

  for (const key of keys) {
    try {
      const obj = await env[BUCKET_NAME].get(`analytics/${key}.json`);
      if (obj) {
        const text = await obj.text();
        const records = JSON.parse(text);
        allRecords.push(...records);
      }
    } catch (e) {
      // file not found, skip
    }
  }

  // --- Aggregation ---

  // Total PV (non-heartbeat entries only)
  const pageViews = allRecords.filter(r => !r.isHeartbeat);

  const totalPV = pageViews.length;

  // Unique visitors (unique sessionId among pageViews)
  const uniqueSessions = new Set(pageViews.map(r => r.sessionId));
  const uniqueVisitors = uniqueSessions.size;

  // Average visit duration in seconds
  // For each session, find first and last heartbeat timestamps
  const sessionTimes = {};
  for (const r of allRecords) {
    const sid = r.sessionId;
    const t = new Date(r.time).getTime();
    if (!sessionTimes[sid]) {
      sessionTimes[sid] = { first: t, last: t };
    } else {
      if (t < sessionTimes[sid].first) sessionTimes[sid].first = t;
      if (t > sessionTimes[sid].last) sessionTimes[sid].last = t;
    }
  }

  let totalDuration = 0;
  let sessionsWithDuration = 0;
  for (const sid in sessionTimes) {
    const dur = sessionTimes[sid].last - sessionTimes[sid].first;
    if (dur > 0) {
      totalDuration += dur;
      sessionsWithDuration++;
    }
  }
  const avgDuration = sessionsWithDuration > 0 ? Math.round(totalDuration / sessionsWithDuration / 1000) : 0;

  // Page view ranking
  const pageCount = {};
  for (const r of pageViews) {
    const p = r.page || '/';
    pageCount[p] = (pageCount[p] || 0) + 1;
  }
  const pageRanking = Object.entries(pageCount)
    .map(([page, pv]) => ({ page, pv, ratio: totalPV > 0 ? (pv / totalPV * 100).toFixed(1) + '%' : '0%' }))
    .sort((a, b) => b.pv - a.pv);

  // Country distribution
  const countryCount = {};
  for (const r of pageViews) {
    const c = r.country || 'Unknown';
    countryCount[c] = (countryCount[c] || 0) + 1;
  }
  const countryDistribution = Object.entries(countryCount)
    .map(([country, pv]) => ({ country, pv }))
    .sort((a, b) => b.pv - a.pv);

  // Hourly distribution (0-23)
  const hourlyCount = new Array(24).fill(0);
  for (const r of pageViews) {
    const hour = new Date(r.time).getHours();
    hourlyCount[hour]++;
  }
  const maxHourly = Math.max(...hourlyCount, 1);
  const hourlyDistribution = hourlyCount.map((count, hour) => ({
    hour: String(hour).padStart(2, '0') + ':00',
    count,
    heightPercent: Math.round(count / maxHourly * 100),
  }));

  // City distribution (city-level PV ranking)
  const cityCount = {};
  for (const r of pageViews) {
    const cityKey = (r.city || '') + '|' + (r.region || '');
    if (!cityCount[cityKey]) {
      cityCount[cityKey] = { city: r.city || '未知', region: r.region || '未知', pv: 0 };
    }
    cityCount[cityKey].pv++;
  }
  const cityDistribution = Object.values(cityCount)
    .sort((a, b) => b.pv - a.pv);

  // Sessions: detailed info per session
  const sessionMap = {};
  for (const r of allRecords) {
    const sid = r.sessionId;
    if (!sessionMap[sid]) {
      sessionMap[sid] = {
        sessionId: sid,
        startTime: r.time,
        endTime: r.endTime || r.time,
        pages: new Set(),
        city: r.city || '',
        region: r.region || '',
        country: r.country || 'Unknown',
        referrer: r.referrer || '',
        pv: 0,
      };
    }
    const s = sessionMap[sid];
    if (r.time < s.startTime) s.startTime = r.time;
    if ((r.endTime || r.time) > s.endTime) s.endTime = r.endTime || r.time;
    if (r.page) s.pages.add(r.page);
    if (!s.city && r.city) s.city = r.city;
    if (!s.region && r.region) s.region = r.region;
    if (!r.isHeartbeat) s.pv++;
  }

  const sessions = Object.values(sessionMap)
    .map(s => {
      const startMs = new Date(s.startTime).getTime();
      const endMs = new Date(s.endTime).getTime();
      return {
        sessionId: s.sessionId,
        startTime: s.startTime,
        endTime: s.endTime,
        duration: Math.max(0, Math.round((endMs - startMs) / 1000)),
        pages: [...s.pages],
        city: s.city,
        region: s.region,
        country: s.country,
        referrer: s.referrer,
        pv: s.pv,
      };
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  return new Response(JSON.stringify({
    success: true,
    range,
    totalPV,
    uniqueVisitors,
    avgDuration,
    pageRanking,
    countryDistribution,
    cityDistribution,
    hourlyDistribution,
    sessions,
  }), { headers: corsHeaders() });
}
