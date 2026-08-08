export async function onRequest({ request, env }) {
  const apiKey = env.ZHIPU_API_KEY || 'de905fb991ce4344877e5d4400a17ad1.NAN6MxvJYl5jMzsO';
  
  // Test 1: 能否访问外网
  let test1 = 'fail';
  try {
    const r1 = await fetch('https://httpbin.org/ip');
    test1 = await r1.text();
  } catch(e) { test1 = e.message; }

  // Test 2: 智谱 API 详细错误
  let test2 = 'fail';
  try {
    const r2 = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: 'glm-4-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 })
    });
    const raw = await r2.text();
    test2 = `status=${r2.status} body=${raw.substring(0,300)}`;
  } catch(e) { test2 = e.message; }

  return new Response(JSON.stringify({ test1, test2, key_preview: apiKey.substring(0,10)+'...' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
