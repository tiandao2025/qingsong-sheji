// email-sender Worker (email-sender.td468999.workers.dev)
// 部署版本: 48848a29 (活动)
// 来源: Cloudflare Dashboard 代码编辑器

var index_default = {
  async fetch(request, _) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-type"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    try {
      const body = await request.json();
      const resp = await fetch("https://artistic-closure-billing-beautiful.trycloudflare.com/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to: body.to || "doqingsong108@163.com",
          subject: body.subject || "VueSEO",
          body: body.body || "Hello World!",
          content: body.content || body.htmlBody || "No content"
        })
      });
      const result = await resp.json();
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};

export { index_default as default };
