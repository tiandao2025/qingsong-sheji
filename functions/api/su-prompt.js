/**
 * POST /api/su-prompt
 * SketchUp / 3ds Max 模型截图 → 写实实景效果图生图提示词（生成 / 润色）
 * 支持「截图 + 文本框设计意图」综合丰富，也支持仅文本框的纯文字扩写
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

const SYSTEM_PROMPT = `你是一位资深建筑/室内效果图渲染师与 AI 生图提示词专家，精通 SketchUp、3ds Max 等建模软件与 Stable Diffusion、Midjourney 等 AI 生图工作流。用户会提供 3D 模型截图（SketchUp / 3ds Max 等任意建模软件导出的轴测图、人视图、白模或带材质截图均可）和 / 或自己填写的设计意图与关键词，你的任务是产出可直接用于生成「写实照片级实景效果图」的高质量生图提示词。

核心要求：
- 有截图时：先据图判断空间类型、结构关系、材质现状、镜头视角与光线方向，作为画面的事实依据，不得凭空编造截图外的空间结构。
- 有用户文字输入时：必须完整吸收其设计意图（风格、用途、材质偏好、氛围、配色、重点改造项等），扩展为专业描述并融入提示词，严禁忽略或丢弃用户的输入。
- 图文冲突时：以用户的文字说明为准（用户指定的风格、材质、配色优先）。
- 用户文字是零散关键词时：主动补齐为成段、成体系的专业描述。
- 用户仅提供文字、没有截图时：依据文字合理构建完整画面，不做「无法判断画面」之类的推诿。

提示词必须覆盖以下专业要素（画面中有的据实描述，没有的依画面类型合理推断）：
1. 画面主体与空间类型（住宅客厅/卧室/餐厨/办公空间/商业中庭/酒店客房/建筑外立面/景观庭院等）
2. 材质与纹理（木饰面、大理石、微水泥、乳胶漆、玻璃幕墙、金属、织物、地毯、绿植等）
3. 光线与氛围（自然侧光/黄昏暖光/夜景灯光/人工照明，色温、明暗对比、氛围情绪）
4. 镜头视角与焦段（人视图/鸟瞰图/轴测图/一点透视/两点透视，24mm 广角、35mm、50mm 等）
5. 渲染风格（默认写实照片级实景效果图；若用户指定写意氛围感、电影感、建筑可视化等风格，则以用户要求为准）
6. 画质与细节关键词（8K、超精细、真实反射、全局光照 GI、光线追踪、景深、体积光、无噪点等）

输出格式必须严格遵守，不要任何多余说明、寒暄、标题或 markdown 代码块：
===POSITIVE===
【中文描述】一段专业的中文效果图画面描述（60~120 字），点明空间类型、材质、光线氛围与镜头视角。
【英文提示词】一段可直接粘贴到 Stable Diffusion / Midjourney 的英文提示词，用英文逗号分隔关键词，依次包含：主体与空间、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质与细节。
===NEGATIVE===
一段英文负向提示词，用英文逗号分隔，覆盖畸变、模糊、低分辨率、比例失调、结构穿模、画面杂乱、过曝等问题关键词。`;

/**
 * 依据「有无截图 × 模式」组合任务指令
 * - generate + 有图 + 有文本：据图推断 + 融合用户设计意图（核心场景）
 * - generate + 有图 + 无文本：纯据图推断
 * - generate + 无图 + 有文本：由文本扩写完整提示词
 * - polish   + 有文本（可带图）：润色补全
 */
function buildTaskText(mode, hasImage, text) {
  if (mode === 'polish') {
    return hasImage
      ? `以下是我已有的效果图生图提示词，请结合这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可）对它进行专业化润色、补全与规范化：保留我的核心意图，并据截图补足空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的提示词】\n${text}`
      : `以下是我已有的效果图生图提示词，请对它进行专业化润色、补全与规范化：保留我的核心意图，并补足空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的提示词】\n${text}`;
  }
  if (hasImage) {
    return text
      ? `请仔细观察这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可），判断空间类型、结构、材质、视角与光线；再结合我下面填写的设计意图与关键词，综合生成一段用于生成写实实景效果图的生图提示词。\n\n【我的设计意图 / 关键词】\n${text}\n\n要求：画面结构、材质与视角以截图为准据；风格、用途、氛围、配色、重点改造项以我的说明为准，两者冲突时以我的说明为准；把我的零散关键词扩展为专业的完整描述。`
      : `请仔细观察这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可），判断空间类型、材质、结构与视角，生成一段用于生成写实实景效果图的生图提示词。`;
  }
  return `我暂时没有提供模型截图，请根据我下面的设计意图与关键词，扩写成一段完整的、可直接用于生成写实实景效果图的生图提示词，补齐空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的设计意图 / 关键词】\n${text}`;
}

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
    return json({ success: false, error: '请上传 SU / 3ds Max 模型截图（img），或填写设计意图关键词（text）' }, 400);
  }

  const taskText = buildTaskText(mode, !!imageDataUrl, text);

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
