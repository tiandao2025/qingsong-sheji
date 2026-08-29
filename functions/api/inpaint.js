// Pages Functions: /api/inpaint
// 云端 AI 图片处理入口（Workers AI 免费模型）
// 输入 JSON: { image: number[]|null, image_b64?: string, mask?: number[], prompt?, negative_prompt?, strength?, num_steps?, model? }
// model: "sdxl-lightning" | "sd15-inpaint"（默认 sd15-inpaint）
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (request.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  try {
    const body = await request.json();
    const input = {
      prompt: body.prompt || "high quality, natural, seamless, photorealistic, detailed",
    };
    if (body.negative_prompt) input.negative_prompt = body.negative_prompt;
    if (body.num_steps !== undefined) input.num_steps = Math.min(Number(body.num_steps), 20);
    if (body.strength !== undefined) input.strength = Number(body.strength);
    if (body.guidance !== undefined) input.guidance = Number(body.guidance);
    if (body.seed !== undefined) input.seed = Number(body.seed);
    // 模型选择：默认 SD1.5 inpainting；img2img 图生图；sdxl-lightning 文生图
    let MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
    if (body.model === "sd15-img2img") {
      MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";
    } else if (body.model === "sdxl-lightning") {
      MODEL = "@cf/bytedance/stable-diffusion-xl-lightning";
    }
    if (Array.isArray(body.image)) {
      input.image = body.image;
    } else if (body.image_b64) {
      input.image = b64ToArray(body.image_b64);
    } else if (MODEL !== "@cf/bytedance/stable-diffusion-xl-lightning") {
      return json({ error: "image (array) or image_b64 required" }, 400);
    }
    if (Array.isArray(body.mask)) {
      input.mask = body.mask;
    } else if (body.mask_b64) {
      input.mask = b64ToArray(body.mask_b64);
    }
    // inpaint 必须带合法图像 mask；未传则自动生成全白 mask（等效整图重绘）
    if (MODEL === "@cf/runwayml/stable-diffusion-v1-5-inpainting" && !input.mask) {
      const w = Math.max(1, Math.min(Number(body.width) || 512, 1024));
      const h = Math.max(1, Math.min(Number(body.height) || 512, 1024));
      input.mask = new Array(w * h).fill(255);
    }
    if (body.width) input.width = Number(body.width);
    if (body.height) input.height = Number(body.height);
    // sdxl-lightning 为纯文生图，不接受 image 输入，剥离图像字段
    if (MODEL === "@cf/bytedance/stable-diffusion-xl-lightning") {
      delete input.image;
      delete input.image_b64;
      delete input.mask;
      delete input.mask_b64;
      delete input.mask_image;
      delete input.mask_image_b64;
    }
    const out = await env.AI.run(MODEL, input);
    return new Response(out, {
      headers: {
        "Content-Type": "image/png",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function b64ToArray(b64) {
  const bin = atob(b64);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
