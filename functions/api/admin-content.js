// admin-content.js — 网站内容管理API (Cloudflare Pages Functions)
// 认证: x-admin-key: qs-admin-2024
// 存储: R2 bucket qingsong-images, 文件 site-content.json

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;

  const adminKey = request.headers.get('x-admin-key') || '';
  if (adminKey !== 'qs-admin-2024') {
    return new Response(JSON.stringify({ error: '未授权访问' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bucket = env.IMAGES;
  const key = 'site-content.json';

  const DEFAULT_SERVICES = [
    { icon: '&#9678;', title: '住宅全案设计', desc: '从平面方案到全景效果图、施工图,提供一站式全案设计服务', price: '120', unit: 'm²', img: '' },
    { icon: '&#9640;', title: '商业空间设计', desc: '办公室、店铺、展厅等商业空间的创意设计与空间规划', price: '150', unit: 'm²', img: '' },
    { icon: '&#9711;', title: '软装搭配设计', desc: '家具、灯具、窗帘等软装甄选搭配,打造和谐空间氛围', price: '80', unit: 'm²', img: '' },
    { icon: '&#9654;', title: 'SU效果图制作', desc: 'SketchUp三维建模 + Enscape实时渲染,所见即所得', price: '500', unit: '张', img: '' },
    { icon: '&#9639;', title: '施工图深化', desc: '平面/立面/节点详图,CAD标准出图,指导施工落地', price: '60', unit: 'm²', img: '' },
    { icon: '&#9998;', title: '旧房翻新设计', desc: '老房改造、二手房翻新,优化空间布局焕新居住体验', price: '100', unit: 'm²', img: '' }
  ];

  async function readData() {
    try {
      const obj = await bucket.get(key);
      if (!obj) {
        return {
          hero: {
            title: '用设计重塑生活',
            sub: '上海青松空间设计,专注室内设计 19 年。\n从方案设计到施工落地,用匠心打造有温度的空间'
          },
          about: {
            title: '关于青松设计',
            text1: '',
            text2: '',
            highlights: [
              { num: '19 年', label: '室内设计经验' },
              { num: 'SU', label: 'SketchUp 三维设计' },
              { num: 'CAD', label: '施工图纸体系' },
              { num: '10+ 年', label: 'SU 教学培训经验' }
            ]
          },
          services: DEFAULT_SERVICES,
          process: [],
          contact: { phone: '', wechat: '', address: '', email: '' }
        };
      }
      const text = await obj.text();
      const parsed = JSON.parse(text);
      // 兼容旧数据：services 为空时补默认 6 项，保证后台有可编辑条目
      if (!parsed.services || parsed.services.length === 0) {
        parsed.services = DEFAULT_SERVICES;
      }
      return parsed;
    } catch (e) {
      return {
        hero: { title: '', sub: '' },
        about: { title: '', text1: '', text2: '', highlights: [] },
        services: [],
        process: [],
        contact: { phone: '', wechat: '', address: '', email: '' }
      };
    }
  }

  async function writeData(data) {
    await bucket.put(key, JSON.stringify(data, null, 2), {
      httpMetadata: { contentType: 'application/json' }
    });
  }

  try {
    if (method === 'GET') {
      const data = await readData();
      return new Response(JSON.stringify({ data }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (method === 'PUT') {
      const body = await request.json();
      const current = await readData();

      if (body.hero) {
        current.hero = {
          title: body.hero.title !== undefined ? body.hero.title : (current.hero && current.hero.title || ''),
          sub: body.hero.sub !== undefined ? body.hero.sub : (current.hero && current.hero.sub || '')
        };
      }

      if (body.about) {
        current.about = {
          title: body.about.title !== undefined ? body.about.title : current.about.title,
          text1: body.about.text1 !== undefined ? body.about.text1 : current.about.text1,
          text2: body.about.text2 !== undefined ? body.about.text2 : current.about.text2,
          highlights: body.about.highlights !== undefined ? body.about.highlights : current.about.highlights
        };
      }

      if (body.services !== undefined) {
        current.services = body.services.map((s, i) => ({
          icon: s.icon !== undefined ? s.icon : (current.services[i] && current.services[i].icon || ''),
          title: s.title !== undefined ? s.title : '',
          desc: s.desc !== undefined ? s.desc : '',
          price: s.price !== undefined ? s.price : (current.services[i] && current.services[i].price || ''),
          unit: s.unit !== undefined ? s.unit : (current.services[i] && current.services[i].unit || ''),
          img: s.img !== undefined ? s.img : (current.services[i] && current.services[i].img || '')
        }));
      }

      if (body.process !== undefined) {
        current.process = body.process.map((p, i) => ({
          step: p.step !== undefined ? p.step : (current.process[i] && current.process[i].step || String(i + 1)),
          title: p.title !== undefined ? p.title : '',
          desc: p.desc !== undefined ? p.desc : ''
        }));
      }

      if (body.contact) {
        current.contact = {
          phone: body.contact.phone !== undefined ? body.contact.phone : current.contact.phone,
          wechat: body.contact.wechat !== undefined ? body.contact.wechat : current.contact.wechat,
          address: body.contact.address !== undefined ? body.contact.address : current.contact.address,
          email: body.contact.email !== undefined ? body.contact.email : current.contact.email
        };
      }

      await writeData(current);
      return new Response(JSON.stringify({ success: true, data: current }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: '不支持的请求方法' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: '服务器错误: ' + e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
