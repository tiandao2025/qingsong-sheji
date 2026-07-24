// qingsong-email Worker (qingsong-email.td468999.workers.dev)
// 部署版本: a5643fb4 (最新)
// 来源: Cloudflare Dashboard 代码编辑器
// 功能: SMTP 连接测试 (smtp.qq.com:465 via node:tls)

var worker_default = {
  async fetch(request) {
    if (request.method === "GET") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
    }

    try {
      const { to, subject, body } = await request.json();
      try {
        const tls = await import("node:tls");
        const testResult = await new Promise((resolve, reject) => {
          const socket = tls.connect(465, "smtp.qq.com", { rejectUnauthorized: false }, () => {
            socket.once("data", (data) => {
              socket.end();
              resolve("CONNECTED: " + data.toString().slice(0, 100));
            });
          });
          socket.on("error", (e) => reject("SOCKET_ERR: " + e.message));
          setTimeout(() => reject("TIMEOUT"), 15000);
        });
        return new Response(JSON.stringify({ tlsTest: testResult }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (e2) {
        return new Response(JSON.stringify({ tlsError: e2.message || String(e2) }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
  }
};

export { worker_default as default };
