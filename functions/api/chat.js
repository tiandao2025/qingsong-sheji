// Cloudflare Pages Function: /api/chat
// 青松设计 AI 客服 "小青" — REST API 直调 Cloudflare Workers AI
// 无需 env.AI binding，通过 fetch + Bearer token 调用

const SYSTEM_PROMPT = `你是青松空间设计有限公司的智能客服"小青"。你必须用以下知识回答客户问题：

公司信息：青松空间设计有限公司（张家界青松装饰设计有限公司），创始人/设计总监杜青松，2011年怀化学院毕业，14年+室内外设计经验。地址：湖南张家界永定区西溪坪彭家巷大庸王府正对面。电话：19907444111，邮箱：378155763@qq.com，网站：qingsong.ggff.net。理念：倡导舒适生活、精细设计、风格多变。

设计团队：杜青松（设计总监，300-1000元/㎡）、杨洲（高级设计师，80-500元/㎡）、刘贵祁（高级设计师，80-500元/㎡）、罗敏（主任设计师，50-120元/㎡）、全永福（主任设计师）、张韦（助理设计师）。

服务与收费：家装128元/㎡起、别墅300元/㎡起、工装200元/㎡起、土建280元/㎡起。模式：纯设计/设计+半包/设计+施工/全案托管。付款：签合同付60%定金，交付时付40%尾款。

代表案例：華都山莊田總獨棟別墅(600㎡中式轻奢，设计费4万，半包75万)、山水印象澜庭(127㎡现代极简，设计费1.6万，半包12.3万)、景豪酒店(五星级6000㎡)、童蒙国际早教中心(760㎡英伦风)、谷韵山居民宿(土家吊脚楼)、珑璟湾(140㎡现代极简，纯设计2.8万)、天门一号62栋(123㎡现代简约全案托管)、阳和七方峪民宿(吊脚楼)、月亮湾9栋(120㎡现代北欧)。

施工流程：平面方案→预算概算→签设计合同(60%定金)→效果图确认→施工图出图→签施工合同→施工交付。

辅材品牌：金貂电缆、汉森格亚水管、飞利浦网线、德高防水、德国都芳乳胶漆、兔宝宝石膏板、宝源欧松板。

回复规则：自称"小青"，热情友好。问案例按类型推荐，问价格根据面积给范围并引导电话详聊，想预约引导留联系方式或拨打19907444111。不知道的诚实告知打19907444111。第一句话："您好！我是青松设计的智能客服小青~ 请问有什么可以帮您的？"`;

// ===== 本地知识库兜底 =====
const KNOWLEDGE_BASE = [
  { pattern: /你好|您好|hi|hello/i, reply: "您好！我是青松设计的智能客服小青~ 请问有什么可以帮您的？您可以问我设计案例、收费标准、施工流程等问题。" },
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

const FALLBACK_REPLY = "抱歉，我暂时无法回答这个问题，建议您拨打19907444111直接咨询杜青松老师，他会给您最专业的解答~";

function matchLocal(userMessage) {
  for (const item of KNOWLEDGE_BASE) {
    if (item.pattern.test(userMessage)) {
      return item.reply;
    }
  }
  return null;
}

// ===== 导出 =====
export async function onRequest(context) {
  const { request, env } = context;

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

    // 最后一条用户消息
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg ? lastUserMsg.content : '';
    let aiError = '';

    // ===== 方案 A：优先使用 env.AI binding（自动注入） =====
    if (env && env.AI) {
      try {
        const aiMessages = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ];
        const result = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: aiMessages,
          max_tokens: 800,
          temperature: 0.7,
        });
        const reply = result.response || result;
        if (reply) {
          return new Response(JSON.stringify({ reply, _ver: 'v5', _source: 'ai_binding' }), { headers: corsHeaders() });
        }
      } catch (e) {
        aiError = 'AI binding: ' + e.message;
        console.log(aiError);
      }
    }

    // ===== 方案 B：REST API 直调 Workers AI（动态获取 account_id） =====
    const apiToken = env.CF_API_TOKEN;

    if (apiToken) {
      let accountId = env.CF_ACCOUNT_ID;

      // 动态获取 account_id（如果 env 中没有）
      if (!accountId) {
        try {
          const acctRes = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          });
          const acctData = await acctRes.json();
          if (acctData.success && acctData.result && acctData.result.length > 0) {
            accountId = acctData.result[0].id;
          }
        } catch (e) {
          aiError = 'fetch accounts: ' + e.message;
        }
      }

      if (accountId) {
        const aiMessages = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map(m => ({ role: m.role, content: m.content })),
        ];

        const models = ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.2-3b-instruct'];
        let reply = null;

        for (const model of models) {
          try {
            const res = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messages: aiMessages,
                  max_tokens: 800,
                  temperature: 0.7,
                }),
              }
            );
            const data = await res.json();
            if (data.success && data.result) {
              reply = data.result.response || data.result;
              aiError = '';
              break;
            }
            aiError += `${model}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 500)} | `;
          } catch (e) {
            aiError += `${model}: fetch error ${e.message} | `;
          }
        }

        if (reply) {
          return new Response(JSON.stringify({ reply, _ver: 'v5', _source: 'ai' }), { headers: corsHeaders() });
        }
      }
    }

    // ===== 方案 B：本地知识库关键词匹配 =====
    const localReply = matchLocal(userText);
    if (localReply) {
      return new Response(JSON.stringify({ reply: localReply, _ver: 'v5', _source: 'local', _aiErr: aiError || '' }), { headers: corsHeaders() });
    }

    // ===== 最终兜底 =====
    return new Response(JSON.stringify({ reply: FALLBACK_REPLY, _ver: 'v5', _debug: `ai=${!!(accountId && apiToken)} err=${aiError}`, userText: userText }), { headers: corsHeaders() });

  } catch (error) {
    console.error('Chat error:', error);

    // 尝试本地匹配做最后兜底
    try {
      const body = await request.clone().json();
      const msgs = body.messages || [];
      const last = [...msgs].reverse().find(m => m.role === 'user');
      if (last) {
        const localReply = matchLocal(last.content);
        if (localReply) {
          return new Response(JSON.stringify({ reply: localReply }), { headers: corsHeaders() });
        }
      }
    } catch (_) { /* ignore */ }

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
