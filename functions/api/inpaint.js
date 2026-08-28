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
      negative_prompt: body.negative_prompt || "blurry, low quality, distorted, artifacts, text, watermark",
      num_steps: Math.min(Number(body.num_steps) || 20, 20),
      strength: body.strength !== undefined ? Number(body.strength) : 0.75,
      guidance: Number(body.guidance) || 7.5,
      seed: body.seed !== undefined ? Number(body.seed) : Math.floor(Math.random() * 1e9),
    };
    if (Array.isArray(body.image)) {
      input.image = body.image;
    } else if (body.image_b64) {
      input.image_b64 = body.image_b64;
    } else {
      return json({ error: "image (array) or image_b64 required" }, 400);
    }
    if (Array.isArray(body.mask)) {
      input.mask = body.mask;
    }
    if (body.width) input.width = Number(body.width);
    if (body.height) input.height = Number(body.height);
    // 默认模型: SD1.5 inpainting; 可选 sdxl-lightning
    const MODEL = body.model === "sdxl-lightning"
      ? "@cf/bytedance/stable-diffusion-xl-lightning"
      : "@cf/runwayml/stable-diffusion-v1-5-inpainting";
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
