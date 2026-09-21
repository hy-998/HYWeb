/* 首访欢迎页真实行为验证（Chrome DevTools Protocol，干净 profile）
   用途：确认 https://hy-998.github.io/HYWeb/ 首次打开是否跳到 intro.html，
        以及 ENTER 之后是否不再重定向。
   运行：node .verify/intro-firstvisit-cdp.mjs <cdpPort> <url> */
const PORT = process.argv[2] || '9333';
const URL_ = process.argv[3] || 'https://hy-998.github.io/HYWeb/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // 新建标签页
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const requests = [];
  const navigations = [];

  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });

  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
      return;
    }
    if (m.method === 'Network.requestWillBeSent' && m.params.type === 'Document') {
      requests.push(m.params.request.url);
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) {
      navigations.push(m.params.frame.url);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result ? r.result.value : undefined;
  };

  const goto = async (url) => {
    navigations.length = 0;
    requests.length = 0;
    const t0 = Date.now();
    await send('Page.navigate', { url });
    // 等 readyState complete 且 href 稳定
    let last = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const href = await evalJs('location.href');
      const rs = await evalJs('document.readyState');
      if (href && href === last && rs === 'complete') break;
      last = href;
    }
    await sleep(1200); // 让可能的二次跳转落地
    return { ms: Date.now() - t0, href: await evalJs('location.href'), title: await evalJs('document.title') };
  };

  const first = await goto(URL_);
  const firstState = {
    ...first,
    introPlayed: await evalJs("localStorage.getItem('introPlayed')"),
    docRequests: [...requests],
    navigations: [...navigations],
    hasEnterBtn: await evalJs("!!document.getElementById('enterBtn')"),
  };

  // 点击真实的 ENTER 按钮（走 intro.js 的 enterBlog 逻辑）
  await evalJs("document.getElementById('enterBtn').click()");
  await sleep(500);
  let afterEnter = { href: '', title: '' };
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const href = await evalJs('location.href');
    const rs = await evalJs('document.readyState');
    if (href === afterEnter.href && rs === 'complete' && href && !/intro\.html/.test(href)) break;
    afterEnter = { href, title: await evalJs('document.title') };
  }
  await sleep(1000);
  const enterState = {
    href: await evalJs('location.href'),
    title: await evalJs('document.title'),
    introPlayed: await evalJs("localStorage.getItem('introPlayed')"),
  };

  // 再次打开站点根路径（模拟二次访问）
  const second = await goto(URL_);
  const secondState = {
    ...second,
    introPlayed: await evalJs("localStorage.getItem('introPlayed')"),
    hasShortList: await evalJs("!!document.querySelector('.short-list')"),
    navigations: [...navigations],
  };

  // 直接访问一篇正文（无标记时应先去欢迎页；这里标记已存在，应停留原页）
  const deep = await goto(URL_ + 'post-awake.html');
  const deepState = { ...deep, stayedOnPost: !/intro\.html$/.test(deep.href) };

  console.log(JSON.stringify({ firstState, enterState, secondState, deepState }, null, 2));
  ws.close();
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
