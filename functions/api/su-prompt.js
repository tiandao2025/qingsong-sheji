/**
 * POST /api/su-prompt
 * SketchUp 模型截图 → 建筑/室内渲染效果图生图提示词（生成 / 润色）
 * 使用智谱 GLM-4V-Flash（视觉）或 GLM-4-Flash（纯文本）
 *
 * 入参 JSON:
 *   { img?: string, text?: string, mode?: 'generate' | 'polish' }
 *   注：图片字段名用 img（qingsong.ggff.net 域名层对 image_b64 字段会边缘拦截 502），
 *       同时兼容旧字段 image_b64。
 * 出参 JSON:
 *   { success: true, text: '正向提示词', negative: '负向提示词' }
 *   { success: false, error: '...' }
 *
 * 无鉴权、CORS 全开，与 /api/inpaint 同风格；图片经前端压缩后 base64 直传，不落 R2。
 */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB，超过直接拒绝
const ZHIPU_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const SYSTEM_PROMPT = `你是一位资深建筑/室内效果图渲染师与 AI 生图提示词专家，精通 SketchUp 建模与 Stable Diffusion、Midjourney 等 AI 渲染工作流。你的任务是根据用户提供的 SketchUp 模型截图（及可选的原提示词），产出可直接用于 AI 渲染效果图生图的高质量提示词。

提示词必须覆盖以下专业要素（画面中有的据实描述，没有的依画面类型合理推断）：
1. 画面主体与空间类型（住宅客厅/卧室/餐厨/办公空间/商业中庭/酒店客房/建筑外立面/景观庭院等）
2. 材质与纹理（木饰面、大理石、微水泥、乳胶漆、玻璃幕墙、金属、织物、地毯、绿植等）
3. 光线与氛围（自然侧光/黄昏暖光/夜景灯光/人工照明，色温、明暗对比、氛围情绪）
4. 镜头视角与焦段（人视图/鸟瞰图/轴测图/一点透视/两点透视，24mm 广角、35mm、50mm 等）
5. 渲染风格（写实照片级、写意氛围感、电影感、建筑可视化、3D 渲染风等）
6. 画质与细节关键词（8K、超精细、真实反射、全局光照 GI、光线追踪、景深、体积光、无噪点等）

输出格式必须严格遵守，不要任何多余说明、寒暄、标题或 markdown 代码块：
===POSITIVE===
【中文描述】一段专业的中文效果图画面描述（60~120 字），点明空间类型、材质、光线氛围与镜头视角。
【英文提示词】一段可直接粘贴到 Stable Diffusion / Midjourney 的英文提示词，用英文逗号分隔关键词，依次包含：主体与空间、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质与细节。
===NEGATIVE===
一段英文负向提示词，用英文逗号分隔，覆盖畸变、模糊、低分辨率、比例失调、结构穿模、画面杂乱、过曝等问题关键词。`;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

/** 估算 base64 解码后的字节数 */
function base64Bytes(b64) {
  if (!b64) return 0;
  const clean = String(b64).replace(/\s/g, '').replace(/^data:[^,]*,/, '');
  const padding = (clean.match(/=+$/) || [''])[0].length;
  return Math.max(0, Math.floor(clean.length * 3 / 4) - padding);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }
  if (request.method !== 'POST') {
    return json({ success: false, error: 'Method Not Allowed' }, 405);
  }
  try {
    return await handle(request, env);
  } catch (err) {
    return json({ success: false, error: `服务异常: ${err && err.message ? err.message : err}` }, 500);
  }
}

async function handle(request, env) {
  const apiKey = (env.ZHIPU_API_KEY || 'de905fb991ce4344877e5d4400a17ad1.NAN6MxvJYl5jMzsO').replace(/^\uFEFF/, '').trim();
  if (!apiKey) {
    return json({ success: false, error: 'ZHIPU_API_KEY 未配置' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: '请求体不是合法 JSON' }, 400);
  }

  const mode = body.mode === 'polish' ? 'polish' : 'generate';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const rawImage = typeof body.img === 'string'
    ? body.img.trim()
    : (typeof body.image_b64 === 'string' ? body.image_b64.trim() : '');

  // 规范化图片为 data URL，并做 2MB 体积校验
  let imageDataUrl = '';
  if (rawImage) {
    const bytes = base64Bytes(rawImage);
    if (!bytes) {
      return json({ success: false, error: '图片数据无效' }, 400);
    }
    if (bytes > MAX_IMAGE_BYTES) {
      return json({ success: false, error: `图片过大（约 ${(bytes / 1024 / 1024).toFixed(1)}MB），请压缩到 2MB 以内` }, 400);
    }
    imageDataUrl = /^data:image\//i.test(rawImage)
      ? rawImage
      : `data:image/jpeg;base64,${rawImage.replace(/^data:[^,]*,/, '')}`;
  }

  if (!imageDataUrl && !text) {
    return json({ success: false, error: '请提供 SketchUp 截图（img）或已有提示词（text）' }, 400);
  }

  const taskText = mode === 'polish'
    ? `以下是我已有的效果图生图提示词，请结合这张 SketchUp 模型截图对其进行专业化润色、补全与规范化（保留我的核心意图，并补足材质、光线、镜头视角与焦段、渲染风格、画质细节要素）：\n\n${text}`
    : `请仔细观察这张 SketchUp 模型截图，判断空间类型、材质、结构与视角，生成一段用于 AI 渲染效果图的生图提示词。`;

  const userContent = imageDataUrl
    ? [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: taskText }
      ]
    : taskText;

  const model = imageDataUrl ? 'glm-4v-flash' : 'glm-4-flash';

  let resp;
  try {
    resp = await fetch(ZHIPU_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7,
        max_tokens: 1024
      })
    });
  } catch (err) {
    return json({ success: false, error: `请求智谱API失败: ${err.message}` }, 502);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    return json({ success: false, error: `智谱API返回错误 ${resp.status}: ${errText}` }, 502);
  }

  let data;
  try {
    data = await resp.json();
  } catch (err) {
    return json({ success: false, error: `智谱API返回内容解析失败: ${err.message}` }, 502);
  }

  let raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  raw = String(raw).trim();
  if (!raw) {
    return json({ success: false, error: '智谱API返回空内容，请重试' }, 502);
  }
  // 去掉可能的 markdown 代码块包裹
  raw = raw.replace(/^```[a-zA-Z]*\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

  const parsed = parseResult(raw);
  return json({ success: true, text: parsed.positive, negative: parsed.negative });
}

/** 从模型输出中拆出正向 / 负向提示词 */
function parseResult(raw) {
  const posMatch = raw.match(/===\s*POSITIVE\s*===([\s\S]*?)(?====\s*NEGATIVE\s*===|$)/i);
  const negMatch = raw.match(/===\s*NEGATIVE\s*===([\s\S]*)$/i);
  let positive = posMatch ? posMatch[1].trim() : '';
  let negative = negMatch ? negMatch[1].trim() : '';
  if (!positive) {
    // 模型未按格式输出：整段作为正向提示词
    positive = raw.replace(/===\s*NEGATIVE\s*===[\s\S]*$/i, '').replace(/===\s*POSITIVE\s*===/i, '').trim();
  }
  if (!negative) {
    negative = 'low quality, blurry, distorted, deformed, bad proportions, messy geometry, cluttered, watermark, text, oversaturated, unrealistic lighting, cartoon, low resolution';
  }
  return { positive, negative };
}
