// Cloudflare Pages Function: /api/chat
// 青松设计 AI 客服 "赛赛" — 智谱 GLM-4-Flash

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const ZHIPU_API_KEY = 'b0720bdbdd7444e4bf9005d8b3ef7a52.GSqefENkohHqp5k5';
const ZHIPU_MODEL = 'glm-4-flash';

const SYSTEM_PROMPT = `你是青松空间设计有限公司的在线客服"赛赛"，一个真实、风趣、自然的真人客服。你的核心原则是：**自由聊天，不设限**——只有涉及公司内部业务操作（如修改后台数据、查看内部系统、透露未公开的商业机密等）时才需要婉拒。

## 你的身份
- 名字：赛赛
- 身份：青松设计的在线客服，真实的人，不是冷冰冰的机器人
- 性格：热情开朗、风趣幽默、有问必答、像朋友一样聊天
- 语言风格：口语化、自然，可以适当使用语气词（呢、呀、哈、哦），偶尔皮一下也可以
- 第一句话（用户首次打招呼时）："嗨~我是青松设计的赛赛，有什么可以帮你的呀？"

## 关于青松设计（公司业务知识，聊到相关话题时自然引用）
公司全称：青松空间设计有限公司（张家界青松装饰设计有限公司）
创始人/设计总监：杜青松，2011年怀化学院毕业，14年+室内外设计经验
地址：湖南张家界永定区西溪坪彭家巷大庸王府正对面
电话：19907444111 | 邮箱：378155763@qq.com | 网站：qingsong.ggff.net
理念：倡导舒适生活、精细设计、风格多变

设计团队：
- 杜青松（设计总监，300-1000元/㎡）
- 杨洲（高级设计师，80-500元/㎡）
- 刘贵祁（高级设计师，80-500元/㎡）
- 罗敏（主任设计师，50-120元/㎡）
- 全永福（主任设计师）
- 张韦（助理设计师）

服务与收费：家装128元/㎡起、别墅300元/㎡起、工装200元/㎡起、土建280元/㎡起
合作模式：纯设计 / 设计+半包 / 设计+施工 / 全案托管
付款方式：签合同付60%定金，交付时付40%尾款

代表案例：華都山莊田總獨棟別墅(600㎡中式轻奢，设计费4万，半包75万)、山水印象澜庭(127㎡现代极简，设计费1.6万，半包12.3万)、景豪酒店(五星级6000㎡)、童蒙国际早教中心(760㎡英伦风)、谷韵山居民宿(土家吊脚楼)、珑璟湾(140㎡现代极简，纯设计2.8万)、天门一号62栋(123㎡现代简约全案托管)、阳和七方峪民宿(吊脚楼)、月亮湾9栋(120㎡现代北欧)

施工流程：平面方案 → 预算概算 → 签设计合同(60%定金) → 效果图确认 → 施工图出图 → 签施工合同 → 施工交付

辅材品牌：金貂电缆、汉森格亚水管、飞利浦网线、德高防水、德国都芳乳胶漆、兔宝宝石膏板、宝源欧松板

## 回答规则（高优先级 — 身份保护）
1. **绝对禁止暴露非真人身份**：在任何情况下都不要告诉客人你是人工智能、AI、机器人、聊天机器人、智能客服、自动回复程序等任何暗示非真人的身份
2. **绝对禁止暴露客服身份**：不要告诉客人你是人工客服、工作人员、客服人员等官方身份（避免后续穿帮），你就是赛赛，一个真实的人
3. **被质疑身份时的应对**：当客人问"你是真人吗""你是AI吗""你是机器人吗""你是客服吗"等问题时，用自然的方式轻松带过——比如"哈哈当然是我在跟你聊天啊""你怎么会这么想呢""我就是赛赛呀"，然后自然转移话题到设计装修相关的内容
4. **禁止客服话术模板**：不要使用任何客服话术模板（如"请问有什么可以帮您""很高兴为您服务""感谢您的咨询""祝您生活愉快"等），直接用日常朋友聊天的语气交流
5. **始终保持真人聊天感**：有温度、自然、像朋友聊天，用口语化表达，偶尔开玩笑，不要机械式回答

## 业务回答规则
6. **自由回答任何问题**：聊天、知识问答、八卦、科技、生活建议、设计咨询、笑话等都可以聊，用赛赛的真实人格回应
7. **设计咨询类**：根据上述公司知识自然回答——问案例按类型推荐，问价格根据面积给范围并引导电话详聊
8. **预约意向**：引导客户留下联系方式或拨打 19907444111
9. **唯一需要拒绝的情况**：当问题涉及公司内部业务操作（查看后台系统、修改订单数据、透露未公开商业机密等），委婉说明"这个涉及公司内部信息，建议直接联系杜老师哦~"，然后可以继续聊别的
10. **不要频繁引导打电话**：只有在客户表现出明确合作意向时才提电话，闲聊时不要硬推
11. **保持真人感**：不要使用"我是AI"、"作为语言模型"之类的表述，你就是赛赛本人`;

// ===== 本地知识库兜底 =====
const KNOWLEDGE_BASE = [
  { pattern: /你好|您好|hi|hello/i, reply: "嗨~我是青松设计的赛赛，有什么可以帮你的呀？设计案例、收费标准、施工流程都可以问我哦~" },
  { pattern: /案例|做过|项目|代表作|作品|装修过/i, reply: "我们有很多优秀案例哦！\n\n工装类：景豪酒店(6000㎡五星级)、童蒙国际早教中心(760㎡英伦风)、谷韵山居民宿(土家吊脚楼)、阳和七方峪民宿(吊脚楼)等。\n\n家装类：華都山莊田總獨棟別墅(600㎡中式轻奢，设计费4万，半包75万)、山水印象澜庭(127㎡现代极简，设计费1.6万，半包12.3万)、珑璟湾(140㎡现代极简，纯设计2.8万)、月亮湾9栋(120㎡现代北欧)等。\n\n您想看哪类案例呢？" },
  { pattern: /价格|收费|多少钱|费用|报价|怎么算|预算/i, reply: "我们的收费标准：家装设计128元/㎡起、别墅300元/㎡起、工装200元/㎡起、土建280元/㎡起。具体根据您的需求和面积计算，建议拨打19907444111详细咨询哦~" },
  { pattern: /流程|步骤|怎么合作|怎么弄|过程|环节/i, reply: "我们的服务流程：\n1. 平面方案\n2. 施工预算概算\n3. 签订设计合同（付60%定金）\n4. 效果图确认\n5. 施工图出图\n6. 签订施工合同\n7. 施工交付\n\n每一步都有专人跟进，您可以全程放心！" },
  { pattern: /设计师|团队|谁设计|设计老师|人员/i, reply: "我们有一支专业设计团队：\n• 杜青松 — 设计总监/创始人，14年+经验（300-1000元/㎡）\n• 杨洲 — 高级设计师（80-500元/㎡）\n• 刘贵祁 — 高级设计师（80-500元/㎡）\n• 罗敏 — 主任设计师（50-120元/㎡）\n• 全永福 — 主任设计师\n• 张韦 — 助理设计师\n\n设计费根据设计师级别而定，建议根据您的项目需求选择。" },
  { pattern: /材料|品牌|辅材|用什么|质量|环保/i, reply: "我们半包使用的都是品牌辅材：金貂电缆（德标低烟无卤）、汉森格亚水管（德标纳米抗菌）、飞利浦六类双屏蔽网线、德高防水、德国都芳原装进口乳胶漆、兔宝宝石膏板、宝源欧标婴儿房专用欧松板。品质有保障！" },
  { pattern: /地址|在哪|位置|公司|怎么去|上门/i, reply: "我们在湖南张家界永定区西溪坪彭家巷大庸王府正对面，欢迎来访！也可以先拨打电话19907444111预约，我们为您安排接待。" },
  { pattern: /电话|联系|预约|微信|咨询|联系方式/i, reply: "欢迎来电咨询或预约设计！\n电话：19907444111\n邮箱：378155763@qq.com\n\n您也可以留下联系方式，我们安排设计师回电给您~" },
  { pattern: /工装|酒店|餐厅|民宿|办公室|店铺|商业/i, reply: "我们工装案例很丰富！景豪酒店(6000㎡五星级)、童蒙国际早教中心(760㎡英伦风)、谷韵山居和阳和七方峪民宿(土家吊脚楼)、湘满楼餐厅(土家民族特色)等。工装设计费200元/㎡起，欢迎拨打19907444111详聊！" },
  { pattern: /别墅|大宅|豪宅|独栋/i, reply: "别墅设计是我们的强项！代表案例有華都山莊田總獨棟別墅(600㎡中式轻奢，设计费4万，半包75万)。别墅设计费300元/㎡起，欢迎拨打19907444111预约杜青松老师面谈！" },
  { pattern: /付款|定金|怎么付|合同/i, reply: "付款方式：签订设计合同时付60%定金，项目交付验收时付40%尾款。我们会签署正规合同，保障双方权益。" },
  { pattern: /模式|方式|怎么选|全包|半包|纯设计/i, reply: "我们有四种合作模式：\n1. 纯设计 — 仅出设计方案和施工图\n2. 设计+半包 — 设计+辅材和人工\n3. 设计+施工 — 设计+全屋施工\n4. 全案托管 — 从设计到软装一站式服务\n\n根据您的需求和预算灵活选择，建议电话沟通后确定最适合的方案！" },
  { pattern: /公司|介绍|青松|成立|背景/i, reply: "青松空间设计有限公司（张家界青松装饰设计有限公司），由杜青松老师于2016年创立，专注室内外空间设计。我们倡导舒适生活、精细设计、风格多变，借助设计提升空间价值和改善生活品质。地址在张家界永定区西溪坪彭家巷大庸王府正对面。" },
];

const FALLBACK_REPLY = "哎呀，这个问题有点难到我了～要不换个话题聊聊？如果是设计装修方面的问题，也可以直接拨打19907444111找杜老师，他专业得很！";

// ===== 对话结束检测 =====
const END_KEYWORDS = ['谢谢', '多谢', '感谢', 'thank', '拜拜', '再见', '再聊', '下次聊', '好的', '了解了', '明白', '知道了', '没问题', '结束', '就这样', '可以了', '行了', 'ok', 'bye', '晚安'];

function detectConversationEnd(text) {
  const t = text.toLowerCase().trim();
  return END_KEYWORDS.some(kw => t.includes(kw.toLowerCase()));
}

// ===== 调用智谱 GLM-4-Flash =====
async function callZhipu(messages) {
  const aiMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`,
    },
    body: JSON.stringify({
      model: ZHIPU_MODEL,
      messages: aiMessages,
      max_tokens: 800,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Zhipu API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Zhipu API: unexpected response format');
  }

  return data.choices[0].message.content.trim();
}

// ===== 对话总结 =====
async function generateSummary(messages) {
  if (!messages || messages.length === 0) return '';
  const convText = messages.map(m => `[${m.role === 'user' ? '客户' : '赛赛'}]: ${m.content}`).join('\n');

  try {
    const res = await fetch(ZHIPU_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: ZHIPU_MODEL,
        messages: [{ role: 'user', content: `请用中文生成一段简洁的客服对话总结（200字以内）：\n- 客户的核心需求/问题是什么\n- 赛赛给出了哪些关键回复\n- 是否有预约意向或待跟进事项\n\n对话记录：\n${convText}\n\n直接输出总结，不要加标题。` }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();
    if (summary.length > 10) return summary;
  } catch (e) {
    console.log('[summary] failed:', e.message);
  }

  const userMsgs = messages.filter(m => m.role === 'user');
  const lastUser = userMsgs[userMsgs.length - 1]?.content?.substring(0, 100) || '';
  return `对话轮次：${Math.ceil(messages.length / 2)}\n客户最后提问：${lastUser}`;
}

// ===== 发送邮件 =====
async function sendEmailNotification(summary, env, sessionId) {
  try {
    const resp = await fetch('https://email-sender.td468999.workers.dev/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'duqingsong1988@163.com',
        subject: `[青松设计] 新客户咨询 - ${sessionId?.substring(0, 8) || 'unknown'}`,
        content: `【客户咨询对话总结】\n\n时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n会话ID：${sessionId || '无'}\n\n${summary}\n\n---\n本邮件由青松设计客服系统自动发送`,
      }),
    });
    console.log('[email] send result:', JSON.stringify(await resp.json()));
  } catch (e) {
    console.error('[email] send failed:', e.message);
  }
}

// ===== 日志写入 R2 =====
async function logConversation(env, sessionId, userText, reply) {
  if (!env || !env.IMAGES || !sessionId || !userText) return;
  const dateKey = new Date().toISOString().slice(0, 10);
  const logKey = `chat-logs/${dateKey}/${sessionId}.jsonl`;
  const ts = new Date().toISOString();
  try {
    const entry = JSON.stringify({ timestamp: ts, role: 'user', content: userText }) + '\n' +
                  JSON.stringify({ timestamp: ts, role: 'assistant', content: reply }) + '\n';
    let existing = '';
    try {
      const obj = await env.IMAGES.get(logKey);
      if (obj) existing = await obj.text();
    } catch (_) {}
    await env.IMAGES.put(logKey, existing + entry, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    // 同步写入 chats-index.json，供后台管理页读取
    await syncChatsIndex(env, sessionId, userText, reply, ts);
  } catch (e) {
    console.error('[logConversation] failed:', e.message);
  }
}

async function syncChatsIndex(env, sessionId, userText, reply, ts) {
  try {
    const key = 'chats-index.json';
    let chats = [];
    try {
      const obj = await env.IMAGES.get(key);
      if (obj) {
        const text = await obj.text();
        chats = JSON.parse(text);
      }
    } catch (_) {}
    chats.push({
      sessionId,
      time: ts,
      userMessage: userText.substring(0, 500),
      aiReply: reply ? reply.substring(0, 500) : '',
      messageLength: reply ? reply.length : 0
    });
    if (chats.length > 2000) chats = chats.slice(-2000);
    await env.IMAGES.put(key, JSON.stringify(chats, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
  } catch (e) {
    console.error('[syncChatsIndex] failed:', e.message);
  }
}

function matchLocal(userMessage) {
  for (const item of KNOWLEDGE_BASE) {
    if (item.pattern.test(userMessage)) return item.reply;
  }
  return null;
}

// ===== 主入口 =====
export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders(),
    });
  }

  try {
    const body = await request.json();
    const messages = body.messages || [];

    if (!messages.length) {
      return new Response(JSON.stringify({ error: 'No messages provided' }), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg ? lastUserMsg.content : '';

    // ===== 方案 A：本地知识库快速匹配 =====
    const localReply = matchLocal(userText);
    if (localReply) {
      await logConversation(env, body.sessionId, userText, localReply);
      if (detectConversationEnd(userText)) {
        waitUntil(
          generateSummary(messages).then(s => sendEmailNotification(s, env, body.sessionId))
        );
      }
      return new Response(JSON.stringify({ reply: localReply, _source: 'local' }), { headers: corsHeaders() });
    }

    // ===== 方案 B：智谱 GLM-4-Flash =====
    try {
      const reply = await callZhipu(messages);
      await logConversation(env, body.sessionId, userText, reply);
      if (detectConversationEnd(userText)) {
        waitUntil(
          generateSummary(messages).then(s => sendEmailNotification(s, env, body.sessionId))
        );
      }
      return new Response(JSON.stringify({ reply, _source: 'zhipu' }), { headers: corsHeaders() });
    } catch (e) {
      console.error('[zhipu] error:', e.message);

      // ===== 方案 C：兜底 =====
      await logConversation(env, body.sessionId, userText, FALLBACK_REPLY);
      return new Response(JSON.stringify({ reply: FALLBACK_REPLY, _source: 'fallback', _error: e.message.slice(0, 200) }), { headers: corsHeaders() });
    }

  } catch (error) {
    console.error('Chat error:', error);

    // 最终兜底
    try {
      const body = await request.clone().json();
      const msgs = body.messages || [];
      const last = [...msgs].reverse().find(m => m.role === 'user');
      if (last) {
        const localReply = matchLocal(last.content);
        if (localReply) {
          await logConversation(env, body.sessionId, last.content, localReply);
          return new Response(JSON.stringify({ reply: localReply }), { headers: corsHeaders() });
        }
      }
    } catch (_) {}

    return new Response(JSON.stringify({ reply: FALLBACK_REPLY }), { headers: corsHeaders() });
  }
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
