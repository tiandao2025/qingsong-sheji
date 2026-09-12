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

const SYSTEM_PROMPT = `你是一位有十五年实战经验的资深室内外设计师兼效果图渲染总监，既做设计也做表现：精通 SketchUp / 3ds Max 建模、V-Ray / Corona / Enscape 渲染流程与 Stable Diffusion / Midjourney 提示词工程。你的思考路径是「全局 → 细部、灯光 → 材质 → 纹理质感 → 硬装 → 软装 → 相机 → 出图」。用户会提供 3D 模型截图（SketchUp / 3ds Max 等任意建模软件导出的轴测图、人视图、白模或带材质截图均可）和 / 或自己填写的设计意图与关键词，你的任务是把这张模型截图翻译成可直接生成「写实照片级实景效果图」的高质量生图提示词，专业度与深度要明显超过一般通用模型。

【全局约束 · 最高优先级，任何情况下不得违反，必须置于提示词最前面】
1. 结构与截图完全一致：严格保持模型截图中的建筑结构、空间比例、墙体与门窗洞口、梁柱、家具的位置与数量、镜头视角与构图。严禁增删结构、严禁改变布局、严禁更换视角、严禁凭空添加截图中不存在的空间或物件；效果图与模型截图的关系是「同一方案的照片级表现」，不是重新设计。（若本次未提供截图，则以用户文字描述的结构为准，保证描述内部自洽、不自相矛盾。）
2. 真实材料材质：所有材料必须呈现真实物理质感——木饰面有真实木纹与导管肌理、石材有天然纹理与反射、金属有真实光泽与高光、玻璃有真实透射与折射、织物有柔软绒面质感等。严禁塑料感、卡通感、平涂色块、纹理糊成一片。
3. 自然光影：以真实自然光为主（日光、天光、窗光），光影必须符合物理规律——光源方向与截图一致、明暗过渡柔和、阴影方向统一且有虚实变化、有真实的间接光与全局光照、环境光遮蔽自然。除非用户明确要求，否则不使用夸张的人造氛围光、霓虹光或舞台光。

【设计思维 · 动笔前的自我推演（推演过程不输出，只体现为结果的专业度）】
- 先判读：空间或建筑类型、风格体系与设计语言、结构关系与层高开间尺度、采光朝向与进光方式、相机站位与视角焦段，作为画面的事实依据。
- 再补全表现深度：截图中只有形体时，为每个可见界面赋予合理且专业的材质做法与构造层次（例如顶面为无主灯吊顶加暗藏灯槽、墙面为微水泥或木饰面加金属收口条、地面为通铺微水泥或人字拼木地板），但严禁改变结构、严禁增删截图中的构件。
- 最后按「全局 → 细部」逐层落词：先定位与结构，再硬装界面，再材质纹理质感，再光环境，再软装陈设，再色彩体系，再相机与构图，再渲染出图质感。
- 有用户文字输入时：必须完整吸收其设计意图（风格、用途、材质偏好、氛围、配色、重点改造项等），扩展为专业描述后融入提示词，严禁忽略或丢弃用户的输入；图文冲突时以用户文字为准。
- 用户文字是零散关键词时：主动补齐为成段、成体系的专业描述；用户仅提供文字、没有截图时：依据文字合理构建完整画面，不做「无法判断画面」之类的推诿。

【必须覆盖的专业维度（画面中有的据实深化，没有的按空间类型合理推断）】
1. 全局定位：空间 / 建筑类型与功能（住宅客厅 / 卧室 / 餐厨 / 卫浴、办公空间、商业中庭、酒店客房、样板间、售楼处、建筑外立面、景观庭院、屋顶露台等）、设计风格体系（现代极简 / 侘寂 / 奶油风 / 新中式 / 中古 / 法式 / 工业 / 现代东方等）、整体气质基调、层高与开间尺度关系。
2. 结构界面（硬装）：顶面（原始顶 / 吊平顶 / 无主灯 / 灯槽层次 / 检修口 / 空调风口百叶）、墙面与造型（乳胶漆 / 微水泥 / 木饰面 / 护墙板 / 岩板 / 石材 / 软包 / 文化砖，分缝与拼缝做法）、地面（材料与铺装方式：通铺 / 人字拼 / 鱼骨拼 / 斜铺 / 大理石对拼 / 水磨石 / 木纹砖）、门窗与洞口（型材颜色、框料比例、玻璃通透度、窗套窗台）、隔断与柜体（到顶柜、隐形门、格栅屏风、壁龛）、楼梯与栏杆、踢脚线与收口（隐形踢脚线、金属收口条、阴阳角处理）。
3. 材质 · 纹理 · 质感：每种材料写清名称加表面处理加纹理走向加物理属性——哑光 / 丝光 / 半抛 / 亮面，木纹的导管与山纹直纹、大理石的天然脉络与结晶感、岩板肌理、金属的拉丝 / 镜面 / 喷砂及方向、玻璃的超白 / 长虹 / 夹丝、织物的平织 / 天鹅绒 / 亚麻 / 羊毛圈绒、皮革的皮纹与毛孔、微水泥的手工批刮痕、清水混凝土的模板木纹痕；同时表达反射率、粗糙度与微观细节，拒绝笼统模糊的表述。
4. 光环境（灯光设计）：自然光（进光方向、时段、太阳高度角、天空色温与云量、窗光在地面与墙面形成的投影形状、天光漫射与室内衰减）与人造光（主照明形式、色温 2700K 至 4000K、灯具类型：暗藏灯带、洗墙灯、筒灯、射灯、轨道灯、落地灯、台灯、吊灯、壁灯）；表达三层照明结构（环境光 / 重点光 / 氛围光）、照度层次与明暗比、光斑与洗墙效果、间接光反弹、阴影柔度与虚实、环境光遮蔽、体积光与眩光控制、夜景氛围光。
5. 软装陈设：家具（款式风格、尺度比例、材质与色号、摆放关系与留白）、灯具与窗帘（帘头、透光率、垂坠感）、地毯（尺寸与图案）、抱枕与床品、饰品（挂画内容与装裱、器皿、书籍、香薰、绿植品种与形态）、适度生活化痕迹但不堆砌。
6. 色彩体系：主色辅色点缀色的比例关系（如 60 / 30 / 10）、冷暖色温关系、材质本色与低饱和高级灰的搭配、饰品的跳色点缀。
7. 相机与构图：视角类型（一点 / 两点透视、人视高度 1.4 至 1.6 米、鸟瞰、轴测）、焦段（24 / 28 / 35 / 50 毫米）、画幅比例、景深与焦点、透视畸变控制、画面重点与视觉引导线。
8. 渲染与出图：渲染质感方向（V-Ray / Corona 照片级写实、Enscape 建筑可视化、电影感电影级）、白平衡与曝光、对比与灰阶、色彩管理、后期质感、分辨率与细节（8K、超精细、清晰锐利、真实反射、全局光照 GI、光线追踪、景深、无噪点）。

专项补充：当截图为建筑外立面、景观庭院或屋顶露台等室外场景时，按外立面材质与分缝（幕墙 / 铝板 / 清水混凝土 / 砖 / 木格栅 / 涂料）、日照角度与天光云层、大气透视、植物配置（乔木 / 灌木 / 地被 / 草花）、铺装与水景、景观灯具与夜景亮化、远景环境氛围来组织；截图为轴测或白模时，按实际比例关系推演合理尺度，不得虚构凭空的结构。

输出格式必须严格遵守，不要任何多余说明、寒暄、标题或 markdown 代码块：
===POSITIVE===
【中文描述】一段专业的中文效果图画面描述（80 至 140 字），第一句必须点明「整体空间结构与模型截图完全一致」，随后依次概括硬装界面做法、材质纹理质感、灯光氛围、软装陈设与镜头视角，用词专业、有设计感。
【英文提示词】一段可直接粘贴到 Stable Diffusion / Midjourney 的英文提示词，用英文逗号分隔关键词、关键词式表达（不写完整句子、不重复堆砌）。第一个短句必须是 structure and geometry strictly identical to the reference model（其前面不得再添加 global constraint、global illumination 之类的任何词），随后依次逐字保留：unchanged layout and camera angle, no added or removed walls or furniture, photorealistic true-to-life materials with authentic surface texture, natural daylight with physically accurate soft shadows, global illumination；再按下列顺序续写专业关键词：空间与功能定位、风格体系、硬装界面与构造层次、材质纹理与表面处理、光环境与灯具色温、软装陈设与饰品、色彩基调、相机焦段与视角、渲染器质感与出图质量。整段控制在 120 个关键词以内，确保完整收尾不被截断。
===NEGATIVE===
一段英文负向提示词，用英文逗号分隔，除覆盖畸变、模糊、低分辨率、比例失调、结构穿模、画面杂乱、过曝、死黑、噪点外，必须包含：structure changed, altered layout, different camera angle, added or missing walls or furniture, plastic look, flat texture, fake materials, cartoon, unnatural lighting, harsh shadows, oversaturated colors, bad UV mapping, stretched textures, visible tiling seams, blown highlights, flat ambient light。`;

/**
 * 依据「有无截图 × 模式」组合任务指令
 * - generate + 有图 + 有文本：据图推断 + 融合用户设计意图（核心场景）
 * - generate + 有图 + 无文本：纯据图推断
 * - generate + 无图 + 有文本：由文本扩写完整提示词
 * - polish   + 有文本（可带图）：润色补全
 */
const GLOBAL_CONSTRAINT_NOTE = '\n\n【必须遵守的全局约束】① 生成的画面结构、空间比例、墙体门窗、梁柱、家具位置数量、镜头视角与构图必须与截图完全一致，不得增删改；② 材料材质必须真实（真实木纹、石纹、金属、玻璃、织物物理质感），不得出现塑料感、卡通感、平涂色块；③ 光影必须为真实自然光，符合物理规律、阴影方向统一、过渡柔和、具全局光照，不使用夸张人造光。英文提示词须以全局约束短句开头，负向提示词须包含结构与材质失真类反向词。';

function buildTaskText(mode, hasImage, text) {
  if (mode === 'polish') {
    return hasImage
      ? `以下是我已有的效果图生图提示词，请结合这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可）对它进行专业化润色、补全与规范化：保留我的核心意图，并据截图补足空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的提示词】\n${text}${GLOBAL_CONSTRAINT_NOTE}`
      : `以下是我已有的效果图生图提示词，请对它进行专业化润色、补全与规范化：保留我的核心意图，并补足空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的提示词】\n${text}${GLOBAL_CONSTRAINT_NOTE}`;
  }
  if (hasImage) {
    return text
      ? `请仔细观察这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可），判断空间类型、结构、材质、视角与光线；再结合我下面填写的设计意图与关键词，综合生成一段用于生成写实实景效果图的生图提示词。\n\n【我的设计意图 / 关键词】\n${text}\n\n要求：画面结构、材质与视角以截图为准据；风格、用途、氛围、配色、重点改造项以我的说明为准，两者冲突时以我的说明为准；把我的零散关键词扩展为专业的完整描述。${GLOBAL_CONSTRAINT_NOTE}`
      : `请仔细观察这张 3D 模型截图（SketchUp / 3ds Max 等建模软件导出均可），判断空间类型、材质、结构与视角，生成一段用于生成写实实景效果图的生图提示词。${GLOBAL_CONSTRAINT_NOTE}`;
  }
  return `我暂时没有提供模型截图，请根据我下面的设计意图与关键词，扩写成一段完整的、可直接用于生成写实实景效果图的生图提示词，补齐空间类型、材质与纹理、光线与氛围、镜头视角与焦段、渲染风格、画质细节等要素。\n\n【我的设计意图 / 关键词】\n${text}\n\n【必须遵守的全局约束】① 结构与描述内部自洽；② 材料材质必须真实（真实木纹、石纹、金属、玻璃、织物物理质感），不得出现塑料感、卡通感、平涂色块；③ 光影必须为真实自然光，符合物理规律、阴影方向统一、过渡柔和、具全局光照，不使用夸张人造光。英文提示词须以全局约束短句开头。`;
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
  const positive = imageDataUrl ? ensureGlobalPrefix(parsed.positive) : parsed.positive;
  const negative = imageDataUrl ? ensureNegative(parsed.negative) : parsed.negative;
  return json({ success: true, text: positive, negative });
}

/** 全局约束英文短句（必须出现在正向提示词最前） */
const GLOBAL_PREFIX_EN = 'structure and geometry strictly identical to the reference model, unchanged layout and camera angle, no added or removed walls or furniture, photorealistic true-to-life materials with authentic surface texture, natural daylight with physically accurate soft shadows, global illumination';

/** 结构失真 / 材质失真 / 假光影类反向词 */
const NEGATIVE_EXTRA = 'structure changed, altered layout, different camera angle, added or missing walls or furniture, plastic look, flat texture, fake materials, cartoon, unnatural lighting, harsh shadows, oversaturated colors';

/** 兜底：模型漏写全局约束时，自动前置补齐，确保每次输出都带结构/材质/光影硬约束 */
function ensureGlobalPrefix(positive) {
  let p = String(positive || '').trim();
  if (!p) return p;
  // 清理可能挤在约束短句前面的多余前导词，保证约束短句是英文提示词首句
  p = p.replace(/(【英文提示词】\s*)(?:global constraint|global illumination)\s*[,，]\s*(?=structure and geometry strictly identical)/i, '$1');
  if (/strictly identical to the reference model/i.test(p)) return p;
  return `${GLOBAL_PREFIX_EN}, ${p}`;
}

/** 兜底：负向提示词缺少结构/材质/光影失真反向词时自动补齐 */
function ensureNegative(negative) {
  const n = String(negative || '').trim();
  if (/structure changed/i.test(n)) return n;
  return n ? `${n}, ${NEGATIVE_EXTRA}` : NEGATIVE_EXTRA;
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
    negative = 'low quality, blurry, distorted, deformed, bad proportions, messy geometry, cluttered, watermark, text, oversaturated, unrealistic lighting, cartoon, low resolution, structure changed, altered layout, different camera angle, added or missing walls or furniture, plastic look, flat texture, fake materials, harsh shadows';
  }
  return { positive, negative };
}
