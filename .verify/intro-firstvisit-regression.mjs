/* 首访开场回归用例（真实浏览器，CDP 驱动）
   覆盖：首访重定向 / 深链接回跳 / next 校验（开放重定向防护）/
        存储禁用不再死循环 / ?skipIntro=1 逃生口 / 头像重播 /
        核心链路（列表 → 详情 → 返回原位）/ 主题切换持久化

   断言与部署子路径无关：站点可托管在域名根目录，也可在 /HYWeb/ 子路径下。

   前置：
     1) 起一个本地静态服务器托管仓库根目录，例如
        node %TEMP%\hyweb-serve.mjs 8899 D:\LHYsAuto\HYWeb
     2) headless Chromium 开 CDP 端口
        chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<临时目录> about:blank
   运行：
     node .verify/intro-firstvisit-regression.mjs 9333 http://127.0.0.1:8899/
     node .verify/intro-firstvisit-regression.mjs 9333 https://hy-998.github.io/HYWeb/
*/
const PORT = process.argv[2] || '9333';
const BASE = (process.argv[3] || 'http://127.0.0.1:8899/').replace(/\/?$/, '/');
const PREFIX = new URL(BASE).pathname.replace(/\/$/, ''); /* '' 或 '/HYWeb' */
/* 去掉部署前缀后的站内相对路径，便于同一套断言跑本地与线上 */
const rel = (p) => ((PREFIX && p.indexOf(PREFIX) === 0 ? p.slice(PREFIX.length) : p) || '/');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let exceptions = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  →  ' + JSON.stringify(detail)}`);
}

async function main() {
  const target = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
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
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception && d.exception.description) || d.text);
    }
  });
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  await send('Page.enable');
  await send('Runtime.enable');

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
    return r.result.value;
  };
  const clearStorage = () =>
    send('Storage.clearDataForOrigin', {
      origin: new URL(BASE).origin,
      storageTypes: 'local_storage,session_storage',
    });
  const where = () =>
    ev('JSON.stringify({p:location.pathname,s:location.search,h:location.hash})').then((o) => {
      const w = JSON.parse(o);
      return { ...w, r: rel(w.p) };
    });

  /* 等落点稳定：href 连续两次相同 + readyState complete + 满足可选条件 */
  const settle = async (accept) => {
    let last = null;
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      const href = await ev('location.href');
      const rs = await ev('document.readyState');
      if (href === last && rs === 'complete' && (!accept || accept(href))) return href;
      last = href;
    }
    return await ev('location.href');
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    return settle();
  };
  const clickEnter = async () => {
    await ev("document.getElementById('enterBtn').click()");
    return settle((h) => !/intro\.html/.test(h));
  };

  /* A. 首访根路径 → 欢迎页（URL 不带 next）→ ENTER 回主页 */
  await clearStorage();
  await goto(BASE);
  let w = await where();
  check('A1 首访根路径落欢迎页', w.r === '/intro.html', w);
  check('A2 首访根路径不残留 next 参数', w.s === '', w);
  await clickEnter();
  w = await where();
  check('A3 ENTER 回主页', w.r === '/index.html', w);
  check('A4 标记已写入', (await ev("localStorage.getItem('introPlayed')")) === '1', {});

  /* B. 首访深链接 → 欢迎页带 next → ENTER 回原文章 */
  await clearStorage();
  await goto(BASE + 'post-awake.html');
  w = await where();
  check('B1 深链接首访落欢迎页', w.r === '/intro.html', w);
  check('B2 next 指向原文章', decodeURIComponent(w.s) === '?next=post-awake.html', w);
  await clickEnter();
  w = await where();
  check('B3 ENTER 回到原文章', w.r === '/post-awake.html', w);
  check('B4 文章正文存在', await ev("!!document.querySelector('.prose')"), {});

  /* C. 深链接带锚点：next 需保住 hash */
  await clearStorage();
  await goto(BASE + 'post-pixels.html#sec-3');
  w = await where();
  check('C1 带锚点深链接仍落欢迎页', w.r === '/intro.html', w);
  await clickEnter();
  w = await where();
  check('C2 ENTER 回原文章且保住锚点', w.r === '/post-pixels.html' && w.h === '#sec-3', w);

  /* D. 二次访问不再重定向 */
  await goto(BASE);
  w = await where();
  check('D1 二次访问停在主页', w.r === '/', w);

  /* E. ?skipIntro=1 逃生口（干净存储也放行） */
  await clearStorage();
  await goto(BASE + '?skipIntro=1');
  w = await where();
  check('E1 根路径 skipIntro 放行', w.r === '/', w);
  await clearStorage();
  await goto(BASE + 'post-memory.html?skipIntro=1');
  w = await where();
  check('E2 正文页 skipIntro 放行', w.r === '/post-memory.html', w);

  /* F. next 校验：拒绝开放重定向与自我循环 */
  for (const [label, bad] of [
    ['协议相对 //evil.com', '//evil.com'],
    ['绝对 https 地址', 'https://evil.com/x.html'],
    ['路径穿越 ../secret.html', '../secret.html'],
    ['带路径 /post-awake.html', '/post-awake.html'],
    ['非 html 目标', 'assets/js/clone.js'],
    ['自跳 intro.html', 'intro.html'],
    ['注入 javascript: 伪协议', 'javascript:alert(1)'],
  ]) {
    await goto(BASE + 'intro.html?next=' + encodeURIComponent(bad));
    await clickEnter();
    w = await where();
    check(`F next 拒绝「${label}」→ 回主页`, w.r === '/index.html', w);
  }

  /* G. 头像重播不受标记影响，重播后回主页 */
  await goto(BASE);
  await ev("document.querySelector('.brand-avatar').click()");
  await settle((h) => /intro\.html/.test(h));
  w = await where();
  check('G1 已访问后点头像仍进欢迎页', w.r === '/intro.html', w);
  await clickEnter();
  w = await where();
  check('G2 重播后 ENTER 回主页', w.r === '/index.html', w);

  /* H. 存储被禁用：不锁死。放行主页，直开欢迎页也能正常进入 */
  const shim = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: "Object.defineProperty(window,'localStorage',{configurable:true,get:function(){throw new DOMException('denied','SecurityError');}});",
  });
  await goto(BASE);
  w = await where();
  check('H1 存储禁用时根路径不弹欢迎页（无死循环）', w.r === '/', w);
  await goto(BASE + 'intro.html');
  w = await where();
  check('H2 手动打开欢迎页仍可用', w.r === '/intro.html', w);
  await clickEnter();
  w = await where();
  check('H3 存储禁用下 ENTER 能进主页', w.r === '/index.html', w);
  await goto(BASE);
  w = await where();
  check('H4 再次打开仍停在主页', w.r === '/', w);
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: shim.identifier });

  /* J. 核心链路：列表 → 详情 → 返回原位（不改 clone.js 该段逻辑，防回归） */
  await goto(BASE); /* 先换到没有 shim 的新文档，再写标记 */
  await ev("localStorage.setItem('introPlayed','1'); localStorage.setItem('theme','dark')");
  await goto(BASE);
  await ev("[].filter.call(document.querySelectorAll('.page-num'),function(b){return b.textContent==='2'})[0].click()");
  await sleep(900); /* 分页点击的平滑回顶落定 */
  await ev('window.scrollTo(0,600)');
  await sleep(150);
  await ev("document.querySelector('.short-item').click()");
  await settle((h) => /post-/.test(h));
  const detail = await where();
  check('J1 列表点条目进入详情页', /^\/post-/.test(detail.r), detail);
  await ev('history.back()');
  await settle((h) => !/post-/.test(h));
  await sleep(600);
  const back = {
    ...(await where()),
    page: await ev("(document.querySelector('.page-num.current')||{}).textContent"),
    y: await ev('window.scrollY'),
  };
  check('J2 返回列表仍在首页', back.r === '/', back);
  check('J3 分页页码回到 2', back.page === '2', back);
  check('J4 滚动位置复位到 ~600', Math.abs(back.y - 600) <= 120, back);

  /* K. 主题切换持久化 */
  await goto(BASE);
  await ev("document.querySelector('.theme-toggle').click()");
  await sleep(200);
  const themeAfter = await ev('JSON.stringify({cls:document.documentElement.className, ls:localStorage.getItem("theme")})').then(JSON.parse);
  check('K1 点击切换主题并落存储', themeAfter.ls === 'light' && /light/.test(themeAfter.cls), themeAfter);
  await goto(BASE);
  const themeReload = await ev('document.documentElement.className');
  check('K2 刷新后主题保持', /light/.test(themeReload), themeReload);

  check('I 全程无未捕获 JS 异常', exceptions.length === 0, exceptions);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length ? 'FAILED' : 'OK'}  ${results.length - failed.length}/${results.length} passed  (base=${BASE})`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(2);
});
