// Pages Functions: /api/inpaint
// 云端 AI 图片处理入口（Cloudflare Workers AI 免费额度）
//
// 默认模型：@cf/black-forest-labs/flux-2-klein-4b（Flux.2 klein 4B，图像编辑 / 图像生成）
//   · 输入：multipart/form-data，字段 prompt / input_image_0（可选，参考图）/ guidance / width / height / seed
//   · binding 调用：FormData 经 Response 序列化后以 { multipart: { body, contentType } } 传入
//   · 尺寸约束：参考图须小于 512x512（前端统一按 448 压缩并补边）；输出边长 256~1920（默认 768）
// 兼容旧模型分支（JSON 数组输入）：sd15-inpaint / sd15-img2img / sdxl-lightning
//
// 请求 JSON: { image_b64?, prompt, negative_prompt?, width?, height?, model?, strength?, seed? }
// 成功响应：图片二进制（image/png 或 image/jpeg）
export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
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
  if (!env.AI) {
    return json(
      { error: "云端 AI 未绑定：请确认 Pages 项目已声明 Workers AI binding（binding 名 AI），且账号已开通 Workers AI 免费额度" },
      500
    );
  }

  try {
    const body = await request.json();
    const model = String(body.model || "flux-edit");
    const prompt = body.prompt || "high quality, natural lighting, photorealistic, detailed";

    /* ============ 新：Flux.2 klein 图像编辑 / 生成（multipart） ============ */
    if (model === "flux-edit" || model === "flux" || model === "flux-2-klein-4b") {
      // 输出尺寸：前端按原图比例换算（模型范围 256~1920，取 16 的倍数）
      const outW = clamp16(Number(body.width) || 768, 256, 1920);
      const outH = clamp16(Number(body.height) || Number(body.width) || 768, 256, 1920);
      const fd = new FormData();
      fd.append("prompt", prompt);
      fd.append("width", String(outW));
      fd.append("height", String(outH));
      if (body.seed !== undefined) fd.append("seed", String(Math.abs(Number(body.seed) || 0)));
      if (body.guidance !== undefined) fd.append("guidance", String(Number(body.guidance)));
      const b64 = typeof body.image_b64 === "string" ? body.image_b64 : null;
      if (b64) {
        const bytes = b64ToBytes(b64);
        if (bytes.length) {
          fd.append("input_image_0", new Blob([bytes], { type: sniffMime(bytes) }), "input.png");
        }
      }
      // FormData 不暴露序列化后的 body 与 boundary：需先交给 Response 构造器序列化，
      // 再以 { multipart: { body, contentType } } 形式传入 AI binding（官方要求写法）
      const formResp = new Response(fd);
      const out = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", {
        multipart: {
          body: formResp.body,
          contentType: formResp.headers.get("content-type"),
        },
      });
      const img = normalizeImageOutput(out);
      if (!img) return json({ error: "模型未返回图像数据" }, 502);
      return new Response(img.body, {
        headers: {
          "Content-Type": img.type,
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    /* ============ 兼容：旧扩散模型（JSON 数组输入） ============ */
    const input = { prompt };
    if (body.negative_prompt) input.negative_prompt = body.negative_prompt;
    if (body.num_steps !== undefined) input.num_steps = Math.min(Number(body.num_steps), 20);
    if (body.strength !== undefined) input.strength = Number(body.strength);
    if (body.guidance !== undefined) input.guidance = Number(body.guidance);
    if (body.seed !== undefined) input.seed = Number(body.seed);

    let MODEL = "@cf/runwayml/stable-diffusion-v1-5-inpainting";
    if (model === "sd15-img2img") MODEL = "@cf/runwayml/stable-diffusion-v1-5-img2img";
    else if (model === "sdxl-lightning") MODEL = "@cf/bytedance/stable-diffusion-xl-lightning";

    if (Array.isArray(body.image)) input.image = body.image;
    else if (body.image_b64) input.image = b64ToArray(body.image_b64);
    else if (MODEL !== "@cf/bytedance/stable-diffusion-xl-lightning") {
      return json({ error: "image (array) or image_b64 required" }, 400);
    }

    if (Array.isArray(body.mask)) input.mask = body.mask;
    else if (body.mask_b64) input.mask = b64ToArray(body.mask_b64);
    if (MODEL === "@cf/runwayml/stable-diffusion-v1-5-inpainting" && !input.mask) {
      const w = Math.max(1, Math.min(Number(body.width) || 512, 1024));
      const h = Math.max(1, Math.min(Number(body.height) || 512, 1024));
      input.mask = new Array(w * h).fill(255);
    }
    if (body.width) input.width = Number(body.width);
    if (body.height) input.height = Number(body.height);
    if (MODEL === "@cf/bytedance/stable-diffusion-xl-lightning") {
      delete input.image;
      delete input.mask;
    }

    const out = await env.AI.run(MODEL, input);
    const img = normalizeImageOutput(out);
    if (!img) return json({ error: "模型未返回图像数据" }, 502);
    return new Response(img.body, {
      headers: {
        "Content-Type": img.type,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return json({ error: String((err && err.message) || err) }, 500);
  }
}

/* ---------------- 工具函数 ---------------- */

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** 取 16 的倍数并夹在给定范围内（模型对宽高有整除偏好） */
function clamp16(v, lo, hi) {
  const n = Math.round(Number(v) / 16) * 16;
  return Math.max(lo, Math.min(hi, n || lo));
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

/** base64 -> Uint8Array（Workers 运行时内置 atob） */
function b64ToBytes(b64) {
  const clean = String(b64).replace(/^data:image\/\w+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** base64 -> number[]（旧模型需要数组输入） */
function b64ToArray(b64) {
  const clean = String(b64).replace(/^data:image\/\w+;base64,/, "");
  const bin = atob(clean);
  const out = new Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 依据文件头判断图片 MIME */
function sniffMime(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 12 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "image/png";
}

/** 把 Workers AI 各种输出形态归一化为 { body, type } */
function normalizeImageOutput(out) {
  if (!out) return null;
  if (out instanceof ArrayBuffer) return { body: out, type: "image/png" };
  if (ArrayBuffer.isView(out)) return { body: out, type: "image/png" };
  if (typeof out === "string") return { body: b64ToBytes(out), type: mimeOfB64(out) };
  if (typeof out.image === "string") return { body: b64ToBytes(out.image), type: mimeOfB64(out.image) };
  if (out.image && out.image.data) return { body: new Uint8Array(out.image.data), type: "image/png" };
  if (out.body && typeof out.body.getReader === "function") {
    const type = (out.headers && out.headers.get && out.headers.get("content-type")) || "image/jpeg";
    return { body: out.body, type };
  }
  return null;
}

function mimeOfB64(b64) {
  return String(b64).startsWith("iVBOR") ? "image/png" : "image/jpeg";
}
