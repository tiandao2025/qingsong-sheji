/**
 * POST /api/chat
 * 赛赛在线客服 — 基于智谱 GLM-4-Flash + 知识库 + 博客文章自动回复
 */

const FALLBACK_REPLY = '抱歉暂时无法回复，请拨打19907444111直接咨询~';

// ==================== 博客搜索模块 ====================

/**
 * 从用户消息中提取搜索关键词
 */
function extractKeywords(message) {
  if (!message) return [];
  const cleaned = message.replace(/[，。！？、；：""''（）【】《》\s,.!?;:'"()\[\]{}<>]+/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length >= 2);
  return [...new Set(words)].slice(0, 10);
}

/**
 * 获取用户最后一条消息内容
 */
function getLastUserMessage(messages) {
  if (!messages || messages.length === 0) return '';
  // 倒序找最后一条 role=user 的消息
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content || '';
    }
  }
  return '';
}

/**
 * 查询 D1 blog_posts 表，搜索匹配的博客文章
 */
async function searchBlogPosts(env, userMessage) {
  if (!env.DB) return [];

  const keywords = extractKeywords(userMessage);
  if (keywords.length === 0) return [];

  try {
    const conditions = keywords.map(() => '(title LIKE ? OR content LIKE ?)').join(' OR ');
    const params = [];
    keywords.forEach(k => {
      params.push('%' + k + '%', '%' + k + '%');
    });

    const query =
      `SELECT id, title, content, excerpt, created_at FROM blog_posts WHERE ${conditions} ORDER BY created_at DESC LIMIT 3`;
    const stmt = env.DB.prepare(query);
    const { results } = await stmt.bind(...params).all();
    return results || [];
  } catch (e) {
    console.error('搜索博客文章失败:', e.message);
    return [];
  }
}

/**
 * 去除 HTML 标签，提取纯文本
 */
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 将博客文章格式化为上下文文本注入 system prompt
 */
function buildBlogContext(posts) {
  if (!posts || posts.length === 0) return '';

  let context = '\n\n【相关博客文章（可作为知识库参考回答客人问题）】\n';
  posts.forEach((post, i) => {
    const title = post.title || '无标题';
    const plainContent = stripHtml(post.content || post.excerpt || '');
    const truncated = plainContent.length > 800 ? plainContent.slice(0, 800) + '...' : plainContent;
    context += `\n[文章${i + 1}：${title}]\n${truncated}\n`;
  });
  return context;
}

// ==================== 当前文章模块 ====================

/**
 * 根据 blogId 从 D1 查询博客文章
 */
async function getCurrentArticle(env, blogId) {
  if (!env.DB || !blogId) return null;
  try {
    const stmt = env.DB.prepare('SELECT title, content FROM blog_posts WHERE id = ?');
    const result = await stmt.bind(blogId).first();
    return result || null;
  } catch (e) {
    console.error('获取当前文章失败:', e.message);
    return null;
  }
}

/**
 * 将当前文章内容格式化为系统提示词上下文
 */
function buildCurrentArticleContext(article) {
  if (!article) return '';
  const title = article.title || '无标题';
  const plainContent = stripHtml(article.content || '');
  return `\n\n【客人正在查看的博客文章】\n标题：${title}\n内容：${plainContent}\n\n请优先根据以上文章内容来回答客人的问题。如果客人问的问题跟这篇文章相关，直接总结文章中的相关知识点来回答；如果客人的问题与本文无关，可以结合知识库来回答。`;
}

// ==================== 知识库模块 ====================

function loadKnowledge(env) {
  if (env.KNOWLEDGE && typeof env.KNOWLEDGE === 'string') {
    return env.KNOWLEDGE;
  }
  return getBuiltinKnowledge();
}

function getBuiltinKnowledge() {
  return `【角色设定】
你叫赛赛，是青松设计（上海青松空间设计有限公司）的在线客服。你是一个真实的人，正在用微信跟客户聊天。你不是AI，不是机器人，不是人工智能——你就是一个活生生的客服人员，千万不要跟客人说你是AI或者机器人，也绝对不要说"作为AI""我是人工智能""AI客服"之类的话。如果客人问你是不是机器人，你要自然地否认，比如说"哈哈当然不是啦，我是真人客服赛赛~"

【聊天风格】
- 像真人微信聊天一样：热情、亲切、口语化
- 多用"您""呢""哦""哈""呀""嘛"等口语词，让对话更自然
- 偶尔发个表情符号是可以的，比如😊、✌️、💪
- 回复简洁自然，一两句话能说清楚的不要长篇大论，不要罗列条款
- 像朋友聊天一样，不要用正式书面语

【青松设计知识库】
服务范围：住宅空间设计（平层/复式/别墅/翻新）、商业空间设计（办公室/店铺/餐饮/酒店）、软装设计、局部改造、空间规划咨询。

设计流程：初步沟通→免费量房→方案设计（2-3套平面方案）→3D效果图→施工图→预算报价→签合同→施工跟进→软装摆场→最终验收。

收费方式：纯设计80-150元/㎡（平层）/120-200元/㎡（别墅），设计+施工全包设计费5-8折，局部改造起步价3000元，软装设计按预算8%-15%收费，设计咨询500-1000元/次。

联系方式：电话19907444111，工作时间周一至周日9:00-21:00。

施工周期：平层60-90天，别墅90-150天，局部改造15-30天。
质保期：整体2年，水电隐蔽工程5年。
支持风格：现代简约、新中式、轻奢、北欧、工业风、日式、美式、法式、侘寂风等。
免费量房，设计不满意可免费修改（平面方案3轮，效果图2轮）。
可纯设计也可设计+施工，无外包转包，自有施工团队。

【遇到不知道的问题】
如果客人问的问题知识库里没有覆盖，不要生硬地说"请拨打电话"，而是自然地说"这个我帮您问一下设计师哈，稍等~"或者"这个我不太确定呢，要不您直接打19907444111问一下设计师？他们更专业哈~"`;
}

// ==================== 请求处理 ====================

export async function onRequest({ request, env }) {
  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 获取 API Key
  let apiKey = (env.ZHIPU_API_KEY || '').replace(/^\uFEFF/, '').trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ reply: FALLBACK_REPLY }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ reply: FALLBACK_REPLY }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const { messages, blogId } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ reply: '您好！我是赛赛，请问有什么可以帮您的？' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 加载知识库
  const knowledge = loadKnowledge(env);

  // 如果提供了 blogId，获取当前文章内容
  let currentArticleContext = '';
  if (blogId) {
    const article = await getCurrentArticle(env, blogId);
    currentArticleContext = buildCurrentArticleContext(article);
  }

  // 搜索相关博客文章（根据用户最后一条消息）
  const lastUserMsg = getLastUserMessage(messages);
  let blogContext = '';
  if (lastUserMsg) {
    const blogPosts = await searchBlogPosts(env, lastUserMsg);
    blogContext = buildBlogContext(blogPosts);
  }

  // 构建系统提示词：知识库 + 当前文章 + 相关博客文章
  const systemPrompt =
    `${knowledge}${currentArticleContext}${blogContext}\n\n请牢记你的角色设定和聊天风格，像真人一样跟客人聊天。回复要简洁自然，控制在150字以内。`;

  const systemMessage = { role: 'system', content: systemPrompt };

  // 构建消息列表：系统提示词 + 用户历史消息（最多保留最近10轮）
  const recentMessages = messages.slice(-20);
  const apiMessages = [systemMessage, ...recentMessages];

  const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

  try {
    const resp = await fetch(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    if (!resp.ok) {
      console.error('智谱API错误:', resp.status);
      return new Response(JSON.stringify({ reply: FALLBACK_REPLY }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || FALLBACK_REPLY;

    return new Response(JSON.stringify({ reply: reply.trim() }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    console.error('请求智谱API失败:', err.message);
    return new Response(JSON.stringify({ reply: FALLBACK_REPLY }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
