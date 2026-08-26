// ==================== 数据统计 API ====================
// GET  /api/admin-stats       — 获取综合统计数据
// POST /api/admin-stats       — 记录一次页面访问（前端自动调用）

const STATS_KEY = 'site-stats.json';
const GEO_KEY_PREFIX = 'geo-';
const UV_KEY_PREFIX = 'uv-';

// 北京时间（UTC+8）日期 YYYY-MM-DD：统计按中国时区自然日归档
function cnDateStr(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().split('T')[0];
}

// 北京时间 ISO 时间字符串（小时字段即北京时间，用于 geo 明细的时段分布）
function cnISO(d = new Date()) {
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString();
}

function verifyAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  const validToken = env.ADMIN_TOKEN || 'qs-admin-2024';
  const adminKey = request.headers.get('x-admin-key') || '';
  return token === validToken || adminKey === validToken;
}

async function getStats(env) {
  try {
    const obj = await env.IMAGES.get(STATS_KEY);
    if (!obj) return getDefaultStats();
    const text = await obj.text();
    return JSON.parse(text);
  } catch (e) {
    return getDefaultStats();
  }
}

function getDefaultStats() {
  return {
    totalPV: 0,
    totalUV: 0,
    totalDuration: 0,
    visitCount: 0,
    pageViews: {},
    dailyPV: {},
    dailyUV: {},
    dailyPageViews: {},
    dailyReferrers: {},
    referrers: {},
    cities: {},
    regions: {},
    startDate: cnDateStr()
  };
}

async function saveStats(env, stats) {
  await env.IMAGES.put(STATS_KEY, JSON.stringify(stats, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  });
}

// 记录一次访问
async function trackPageView(env, page, referrer, visitorId, duration, cf, isExit) {
  const stats = await getStats(env);
  const today = cnDateStr();

  // 基础 PV
  stats.totalPV = (stats.totalPV || 0) + 1;
  stats.pageViews = stats.pageViews || {};
  stats.pageViews[page] = (stats.pageViews[page] || 0) + 1;
  stats.dailyPV = stats.dailyPV || {};
  stats.dailyPV[today] = (stats.dailyPV[today] || 0) + 1;
  stats.dailyPageViews = stats.dailyPageViews || {};
  stats.dailyPageViews[today] = stats.dailyPageViews[today] || {};
  stats.dailyPageViews[today][page] = (stats.dailyPageViews[today][page] || 0) + 1;

  // 停留时长累计：仅在 exit 时累加，防止心跳稀释平均时长
  if (isExit && duration && typeof duration === 'number' && duration > 0) {
    stats.totalDuration = (stats.totalDuration || 0) + duration;
    stats.visitCount = (stats.visitCount || 0) + 1;
  }

  // 来源
  if (referrer && referrer !== '') {
    stats.referrers = stats.referrers || {};
    stats.dailyReferrers = stats.dailyReferrers || {};
    stats.dailyReferrers[today] = stats.dailyReferrers[today] || {};
    try {
      const refHost = new URL(referrer).hostname;
      stats.referrers[refHost] = (stats.referrers[refHost] || 0) + 1;
      stats.dailyReferrers[today][refHost] = (stats.dailyReferrers[today][refHost] || 0) + 1;
    } catch (e) {}
  }

  // 地理位置（Cloudflare request.cf）
  const city = (cf && cf.city) || null;
  const region = (cf && cf.region) || null;
  const country = (cf && cf.country) || null;
  const lat = (cf && cf.latitude) ? parseFloat(cf.latitude) : null;
  const lon = (cf && cf.longitude) ? parseFloat(cf.longitude) : null;

  if (city || region || country) {
    const geoKey = GEO_KEY_PREFIX + today;
    try {
      let geoList = [];
      const geoObj = await env.IMAGES.get(geoKey);
      if (geoObj) {
        geoList = JSON.parse(await geoObj.text());
      }
      geoList.push({
        city: city || '',
        region: region || '',
        country: country || '',
        lat: lat,
        lon: lon,
        page: page,
        time: cnISO(),
        duration: duration || 0
      });
      await env.IMAGES.put(geoKey, JSON.stringify(geoList), {
        httpMetadata: { contentType: 'application/json' }
      });
    } catch (e) {}

    // 聚合到 site-stats
    stats.cities = stats.cities || {};
    stats.regions = stats.regions || {};
    if (city) {
      stats.cities[city] = (stats.cities[city] || 0) + 1;
    }
    if (region) {
      stats.regions[region] = (stats.regions[region] || 0) + 1;
    }
  }

  // UV 去重
  if (visitorId) {
    const uvKey = `${UV_KEY_PREFIX}${today}-${visitorId}`;
    try {
      const existing = await env.IMAGES.get(uvKey);
      if (!existing) {
        stats.totalUV = (stats.totalUV || 0) + 1;
        stats.dailyUV = stats.dailyUV || {};
        stats.dailyUV[today] = (stats.dailyUV[today] || 0) + 1;
        await env.IMAGES.put(uvKey, '1', {
          httpMetadata: { contentType: 'text/plain' },
          customMetadata: { ttl: '86400' }
        });
      }
    } catch (e) {}
  }

  await saveStats(env, stats);
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      await trackPageView(
        env,
        body.page || '/',
        body.referrer || '',
        body.visitorId || '',
        body.duration || 0,
        request.cf || {},
        body.exit || false
      );
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    if (request.method === 'GET') {
      if (!verifyAuth(request, env)) {
        return new Response(JSON.stringify({ error: '未授权访问' }), { status: 401, headers });
      }

      const url = new URL(request.url);
      const queryDate = url.searchParams.get('date') || null;
      const stats = await getStats(env);
      const today = cnDateStr();

      // 博客文章数
      let blogCount = 0;
      try {
        const blogObj = await env.IMAGES.get('blog-index.json');
        if (blogObj) {
          const blogs = JSON.parse(await blogObj.text());
          blogCount = Array.isArray(blogs) ? blogs.length : 0;
        }
      } catch (e) {}

      // 聊天统计：优先读 D1 chat_logs（前端智能客服数据），R2 chats-index.json 兜底
      let chatStats = { totalMessages: 0, todayMessages: 0, uniqueSessions: 0 };
      try {
        if (env.DB) {
          const totalRow = await env.DB.prepare('SELECT COUNT(*) as c FROM chat_logs').first();
          const todayRow = await env.DB.prepare(
            "SELECT COUNT(*) as c FROM chat_logs WHERE substr(created_at, 1, 10) = ?"
          ).bind(today).first();
          const sessionRow = await env.DB.prepare(
            'SELECT COUNT(DISTINCT session_id) as c FROM chat_logs'
          ).first();
          chatStats.totalMessages = totalRow ? totalRow.c : 0;
          chatStats.todayMessages = todayRow ? todayRow.c : 0;
          chatStats.uniqueSessions = sessionRow ? sessionRow.c : 0;
        } else {
          const chatsObj = await env.IMAGES.get('chats-index.json');
          if (chatsObj) {
            const chats = JSON.parse(await chatsObj.text());
            if (Array.isArray(chats)) {
              chatStats.totalMessages = chats.length;
              chatStats.todayMessages = chats.filter(c => c.time && c.time.startsWith(today)).length;
              chatStats.uniqueSessions = [...new Set(chats.map(c => c.sessionId))].length;
            }
          }
        }
      } catch (e) {}

      // PV 趋势：有 date 参数时只返回该日，否则近 30 天
      const dailyTrend = [];
      if (queryDate) {
        dailyTrend.push({
          date: queryDate,
          pv: (stats.dailyPV && stats.dailyPV[queryDate]) || 0
        });
      } else {
        for (let i = 29; i >= 0; i--) {
          const dateKey = cnDateStr(new Date(Date.now() - i * 86400000));
          dailyTrend.push({
            date: dateKey,
            pv: (stats.dailyPV && stats.dailyPV[dateKey]) || 0
          });
        }
      }

      // 热门页面 Top 10：指定日期时优先取该日明细，否则取全局
      let pageSource = stats.pageViews || {};
      if (queryDate && stats.dailyPageViews && stats.dailyPageViews[queryDate]) {
        pageSource = stats.dailyPageViews[queryDate];
      }
      const topPages = Object.entries(pageSource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([page, count]) => ({ page, count }));

      // 来源统计 Top 10：指定日期时优先取该日明细，否则取全局
      let referrerSource = stats.referrers || {};
      if (queryDate && stats.dailyReferrers && stats.dailyReferrers[queryDate]) {
        referrerSource = stats.dailyReferrers[queryDate];
      }
      const topReferrers = Object.entries(referrerSource)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([host, count]) => ({ host, count }));

      // 停留时长统计
      const avgDuration = (stats.visitCount && stats.visitCount > 0)
        ? Math.round(stats.totalDuration / stats.visitCount)
        : 0;
      const totalDuration = stats.totalDuration || 0;

      // 停留时长：有 date 参数时只取该日，否则今日 + 近 7 天平均
      let todayAvg = 0;
      let weeklyAvg = 0;
      try {
        if (queryDate) {
          const geoObj = await env.IMAGES.get(GEO_KEY_PREFIX + queryDate);
          if (geoObj) {
            const geoList = JSON.parse(await geoObj.text());
            const durs = geoList.filter(g => g.duration > 0);
            if (durs.length > 0) {
              todayAvg = Math.round(durs.reduce((s, g) => s + g.duration, 0) / durs.length);
            }
          }
        } else {
          const todayGeoKey = GEO_KEY_PREFIX + today;
          const todayGeoObj = await env.IMAGES.get(todayGeoKey);
          if (todayGeoObj) {
            const todayGeoList = JSON.parse(await todayGeoObj.text());
            const todayDurs = todayGeoList.filter(g => g.duration > 0);
            if (todayDurs.length > 0) {
              todayAvg = Math.round(todayDurs.reduce((s, g) => s + g.duration, 0) / todayDurs.length);
            }
          }

          const weeklyDurs = [];
          for (let i = 0; i < 7; i++) {
            const dk = cnDateStr(new Date(Date.now() - i * 86400000));
            const geoObj = await env.IMAGES.get(GEO_KEY_PREFIX + dk);
            if (geoObj) {
              const geoList = JSON.parse(await geoObj.text());
              geoList.filter(g => g.duration > 0).forEach(g => weeklyDurs.push(g.duration));
            }
          }
          if (weeklyDurs.length > 0) {
            weeklyAvg = Math.round(weeklyDurs.reduce((s, v) => s + v, 0) / weeklyDurs.length);
          }
        }
      } catch (e) {}

      // 地理分布：有 date 参数时只取该日，否则近 30 天聚合
      const geoDistribution = [];
      try {
        const regionMap = {};
        if (queryDate) {
          const geoObj = await env.IMAGES.get(GEO_KEY_PREFIX + queryDate);
          if (geoObj) {
            const geoList = JSON.parse(await geoObj.text());
            geoList.forEach(g => {
              const r = g.region || '未知';
              const c = g.city || '未知';
              if (!regionMap[r]) {
                regionMap[r] = { count: 0, cities: {} };
              }
              regionMap[r].count++;
              regionMap[r].cities[c] = (regionMap[r].cities[c] || 0) + 1;
            });
          }
        } else {
          for (let i = 0; i < 30; i++) {
            const dk = cnDateStr(new Date(Date.now() - i * 86400000));
            const geoObj = await env.IMAGES.get(GEO_KEY_PREFIX + dk);
            if (geoObj) {
              const geoList = JSON.parse(await geoObj.text());
              geoList.forEach(g => {
                const r = g.region || '未知';
                const c = g.city || '未知';
                if (!regionMap[r]) {
                  regionMap[r] = { count: 0, cities: {} };
                }
                regionMap[r].count++;
                regionMap[r].cities[c] = (regionMap[r].cities[c] || 0) + 1;
              });
            }
          }
        }
        for (const [region, data] of Object.entries(regionMap)) {
          const cities = Object.entries(data.cities)
            .sort((a, b) => b[1] - a[1])
            .map(([city, count]) => ({ city, count }));
          geoDistribution.push({ region, count: data.count, cities });
        }
        geoDistribution.sort((a, b) => b.count - a.count);
      } catch (e) {}

      // 访问时段分布（24 小时）：有 date 参数时只取该日，否则近 30 天
      const hourlyStats = Array(24).fill(0);
      const countryStats = [];
      try {
        const countryMap = {};
        const collectDays = [];
        if (queryDate) {
          collectDays.push(queryDate);
        } else {
          for (let i = 0; i < 30; i++) {
            collectDays.push(cnDateStr(new Date(Date.now() - i * 86400000)));
          }
        }
        for (const dk of collectDays) {
          const geoObj = await env.IMAGES.get(GEO_KEY_PREFIX + dk);
          if (!geoObj) continue;
          const geoList = JSON.parse(await geoObj.text());
          geoList.forEach(g => {
            if (g.time) {
              const h = parseInt(g.time.substring(11, 13), 10);
              if (!isNaN(h) && h >= 0 && h < 24) hourlyStats[h]++;
            }
            const cntry = g.country || '未知';
            countryMap[cntry] = (countryMap[cntry] || 0) + 1;
          });
        }
        for (const [country, count] of Object.entries(countryMap)) {
          countryStats.push({ country, count });
        }
        countryStats.sort((a, b) => b.count - a.count);
      } catch (e) {}

      return new Response(JSON.stringify({
        success: true,
        data: {
          overview: {
            totalPV: stats.totalPV || 0,
            totalUV: stats.totalUV || 0,
            todayPV: (stats.dailyPV && stats.dailyPV[queryDate || today]) || 0,
            todayUV: (stats.dailyUV && stats.dailyUV[queryDate || today]) || 0,
            blogCount,
            chatStats,
            avgDuration,
            totalDuration
          },
          dailyTrend,
          topPages,
          topReferrers,
          geoDistribution,
          hourlyStats,
          countryStats,
          durationStats: {
            todayAvg,
            weeklyAvg
          }
        }
      }), { headers });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), { status: 405, headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), { status: 500, headers });
  }
}
