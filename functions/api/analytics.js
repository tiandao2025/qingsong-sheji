// Cloudflare Pages Function: /api/analytics
// Site analytics: POST for beacon data, GET for aggregated query
// Data stored in R2 bucket: analytics/YYYY-MM-DD.json

const ADMIN_KEY = 'qingsong2024';
const BUCKET_NAME = 'IMAGES';

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
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

  const entry = {
    country,
    page: body.page || '',
    referrer: body.referrer || '',
    sessionId: body.sessionId || '',
    time: new Date().toISOString(),
    isHeartbeat: !!body.heartbeat,
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
  const password = url.searchParams.get('password') || '';

  if (password !== ADMIN_KEY) {
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

  return new Response(JSON.stringify({
    success: true,
    range,
    totalPV,
    uniqueVisitors,
    avgDuration,
    pageRanking,
    countryDistribution,
    hourlyDistribution,
  }), { headers: corsHeaders() });
}
