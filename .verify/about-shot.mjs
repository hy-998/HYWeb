/* about.html 视觉、对齐与门禁验证
   运行：node .verify/about-shot.mjs
   产物：.verify/about-*.png + .verify/about-report.json
   三段各自要量住的东西：
     · 视觉/对齐 —— 左缘对齐、配图编号、暗亮双主题、窄屏联系方式不被省略号截断
     · 放大层   —— 「点开→Esc 关掉」里 scrollY 与焦点有没有被改动，越无感越要能被量出来
     · 门禁     —— 没钥匙必须被弹回首页、静态导航里搜不到「关于」、解锁后页签才出现 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = '.verify';
const BASE = process.env.BASE || 'file:///D:/LHYsAuto/HYWeb/';
const KEY = 'SsIU9mi1NBV4'; /* 与 assets/js/access.js 保持一致；换钥匙时两处一起改 */
const URL_ = BASE + 'about.html?k=' + KEY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 用锚点而不是魔法 y：新增模块会把文档推长 */
const CASES = [
  { name: 'about-desktop-dark-hero',     w: 1280, h: 900, theme: 'dark',  sel: '#sec-hero' },
  { name: 'about-desktop-dark-timeline', w: 1280, h: 900, theme: 'dark',  sel: '#sec-exp' },
  { name: 'about-desktop-dark-works',    w: 1280, h: 900, theme: 'dark',  sel: '#sec-works' },
  { name: 'about-desktop-dark-skills',   w: 1280, h: 900, theme: 'dark',  sel: '#sec-skills' },
  { name: 'about-desktop-light-hero',    w: 1280, h: 900, theme: 'light', sel: '#sec-hero' },
  { name: 'about-desktop-light-works',   w: 1280, h: 900, theme: 'light', sel: '#sec-works' },
  { name: 'about-mobile-dark-hero',      w: 390,  h: 844, theme: 'dark',  sel: '#sec-hero' },
  { name: 'about-mobile-dark-timeline',  w: 390,  h: 844, theme: 'dark',  sel: '#sec-exp' },
  { name: 'about-mobile-dark-works',     w: 390,  h: 844, theme: 'dark',  sel: '#sec-works' },
  /* 灯箱展开态的样子，单独一张给人看；断言在两个 timeline 用例里也跑一遍 */
  { name: 'about-desktop-dark-shotbox',  w: 1280, h: 900, theme: 'dark',  sel: '#sec-exp', lb: true },
  { name: 'about-mobile-dark-shotbox',   w: 390,  h: 844, theme: 'dark',  sel: '#sec-exp', lb: true },
  { name: 'about-desktop-dark-shotbox-mid', w: 1280, h: 900, theme: 'dark', sel: '#sec-exp', lbMid: true },
  { name: 'about-desktop-light-shotbox',   w: 1280, h: 900, theme: 'light', sel: '#sec-exp', lb: true },
  { name: 'about-desktop-dark-contact',    w: 1280, h: 900, theme: 'dark',  sel: '#sec-contact' },
  { name: 'about-desktop-dark-contact-copied', w: 1280, h: 900, theme: 'dark', sel: '#sec-contact', copyShot: true },
  { name: 'about-desktop-dark-qr',         w: 1280, h: 900, theme: 'dark',  sel: '#sec-contact', qrShot: true },
  { name: 'about-mobile-dark-contact',     w: 390,  h: 844, theme: 'dark',  sel: '#sec-contact' },
  { name: 'about-mobile-dark-qr',          w: 390,  h: 844, theme: 'dark',  sel: '#sec-contact', qrShot: true },
];

const IMG_SET = '.tl-shots img, .about-works img';
/* 「站外」按当前 base 判，不写死 file: —— 同一套断言既跑本地文件，也跑 https 线上 */
const IS_REMOTE = 'const isRemote = (u) => { try { const x = new URL(u, location.href); return x.protocol !== location.protocol || x.host !== location.host; } catch (e) { return true; } };';

/* 点击放大：断言「开 → Esc 关」这一趟里，滚动位置一个像素都没动，焦点也回了那枚缩略图 */
const LIGHTBOX_TEST = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  ${IS_REMOTE}
  const box = document.getElementById('shotBox');
  const big = document.getElementById('shotBoxImg');
  const cs = () => getComputedStyle(box);
  const snap = (k) => ({ [k]: 1 });
  const state = (tag) => {
    const br = big.getBoundingClientRect();
    return {
      open: box.classList.contains('is-open'),
      ariaHidden: box.getAttribute('aria-hidden'),
      visibility: cs().visibility,
      opacity: +(+cs().opacity).toFixed(2),
      y: Math.round(window.scrollY),
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      lifted: document.querySelectorAll('.tl-shot.is-lifted').length,
      boxFocused: document.activeElement === box,
      focusOnShot: document.activeElement === shot,
      bigLoaded: !!(big.complete && big.naturalWidth > 0),
      bigRect: [Math.round(br.left), Math.round(br.top), Math.round(br.width), Math.round(br.height)],
      shotW: Math.round(shot.getBoundingClientRect().width),
      inViewport: br.top >= -1 && br.left >= -1 && br.bottom <= window.innerHeight + 1 && br.right <= window.innerWidth + 1,
      settled: getComputedStyle(big).transform === 'none',
      remote: isRemote(big.currentSrc || big.src || ''),
      cap: (document.getElementById('shotBoxCap').textContent || '').trim(),
      tag: tag,
    };
  };
  const shot = document.querySelector('.tl-shot');
  const before = state('before');
  shot.click();
  await sleep(650);
  const open = state('open');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(700);   /* 收回 300ms + 遮罩淡出 200ms，留点余量再判终态 */
  const closed = state('closed');
  /* 焦点是否回到触发它的那枚缩略图，单独量一次，别和 lifted 混在一起 */
  closed.focusOnShot = document.activeElement === shot;
  return JSON.stringify({ before, open, closed });
})()`;

/* 联系方式：两枚复制按钮逐个点，确认态要出现也要自己退回；再点扫码，看二维码走的是原地长开那一套 */
const CONTACT_TEST = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const live = document.getElementById('contactLive');
  const box = document.getElementById('shotBox');
  const big = document.getElementById('shotBoxImg');
  const y0 = Math.round(window.scrollY);
  const rows = [].slice.call(document.querySelectorAll('.contact-row'));
  const out = {
    y0: y0,
    keys: rows.map((r) => r.querySelector('.contact-key').textContent.trim()).join('|'),
    vals: rows.map((r) => r.querySelector('.contact-val').textContent.trim()).join('|'),
    rowLinks: document.querySelectorAll('.contact-list a').length,
    clipped: rows.filter((r) => { const v = r.querySelector('.contact-val'); return v.scrollWidth > v.clientWidth + 1; }).map((r) => r.querySelector('.contact-key').textContent.trim()),
    stacked: getComputedStyle(rows[0]).gridTemplateAreas.indexOf('val act') > -1,
    copy: [],
  };
  for (const btn of [].slice.call(document.querySelectorAll('.contact-act[data-copy]'))) {
    btn.click();
    await sleep(420);
    const word = btn.querySelector('.act-word').firstElementChild;
    const wt = getComputedStyle(word).transform;      /* 文案上滑：matrix(1,0,0,1,0,-13.75) */
    const bt = getComputedStyle(btn, '::before').transform;   /* 主色横扫：跑完落在 matrix(1,0,0,1,0,0) */
    const rec = {
      what: btn.getAttribute('data-what'),
      y: Math.round(window.scrollY),
      focus: (document.activeElement || {}).className || '',
      copied: btn.classList.contains('is-copied'),
      live: (live.textContent || '').trim(),
      checkShown: +getComputedStyle(btn.querySelector('.act-check')).opacity > 0.5,
      idleHidden: +getComputedStyle(btn.querySelector('.act-idle')).opacity < 0.5,
      wordUp: wt.indexOf('matrix') === 0 && parseFloat(wt.split(',')[5]) < -1,
      fillSwept: bt === 'none' || bt.indexOf('matrix(1, 0, 0, 1, 0, 0') === 0,
    };
    await sleep(1500);
    rec.reset = !btn.classList.contains('is-copied');
    rec.liveCleared = (live.textContent || '').trim() === '';
    out.copy.push(rec);
  }
  out.yAfterCopy = Math.round(window.scrollY);
  const qr = document.querySelector('.contact-act[data-qr]');
  const yQ = Math.round(window.scrollY);
  qr.click();
  await sleep(700);
  const br = big.getBoundingClientRect();
  out.qr = {
    y0: yQ,
    open: box.classList.contains('is-open'),
    isQr: box.classList.contains('is-qr'),
    loaded: !!(big.complete && big.naturalWidth > 0),
    w: Math.round(br.width),
    h: Math.round(br.height),
    inViewport: br.top >= -1 && br.left >= -1 && br.bottom <= window.innerHeight + 1 && br.right <= window.innerWidth + 1,
    boxFocused: document.activeElement === box,
    aria: box.getAttribute('aria-label'),
    y: Math.round(window.scrollY),
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(700);
  out.qr.closed = !box.classList.contains('is-open');
  out.qr.focusBack = document.activeElement === qr;
  out.qr.visibility = getComputedStyle(box).visibility;
  out.qr.yAfter = Math.round(window.scrollY);
  return JSON.stringify(out);
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const port = 9411;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    `--user-data-dir=${join(OUT, '_chrome-about')}`, `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 140 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome 未暴露 CDP 端口'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let seq = 0;
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const onMsg = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== id) return;
      ws.removeEventListener('message', onMsg);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const evalIn = async (expression, sessionId) => {
    const { result, exceptionDetails } = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 500));
    return result.value;
  };
  /* 加载事件 + 一段动效余量：本页进场是 0.85s 的遮罩行，截图得等它走完 */
  const goto = async (url, settle = 1200) => {
    await rpc('Page.navigate', { url }, sessionId);
    await new Promise((res) => {
      const onMsg = (ev) => { try { if (JSON.parse(ev.data).method === 'Page.loadEventFired') { ws.removeEventListener('message', onMsg); res(); } } catch {} };
      ws.addEventListener('message', onMsg);
      setTimeout(res, 20000);
    });
    await sleep(settle);
    try { await rpc('Page.bringToFront', {}, sessionId); } catch (e) {}
  };

  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Runtime.enable', {}, sessionId);
  /* about.html 现在挂着 clone.js，首访会被第 0 节弹去 intro.html 播打字机，
     截图就全拍到欢迎页上了。预先写上 introPlayed，让每个用例都从主界面开始。 */
  await rpc('Page.addScriptToEvaluateOnNewDocument', {
    source: "try{localStorage.setItem('introPlayed','1')}catch(e){}",
  }, sessionId);
  /* headless 里剪贴板默认被拒，复制会一路退到「选中 + 提示」那条兜底路，动画就永远测不到。
     先把权限要过来，再让页面处于前台，走的是真实用户那条路。 */
  try { await rpc('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }); }
  catch (e) { console.log('· 剪贴板权限没要到，复制走兜底路径：', e.message); }

  const report = [];
  for (const c of (process.env.ONLY ? CASES.filter((x) => x.name.includes(process.env.ONLY)) : CASES)) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: c.w, height: c.h, deviceScaleFactor: 1, mobile: c.w < 700 }, sessionId);
    await goto(URL_);

    await evalIn(`(() => {
      document.documentElement.classList.remove('light','dark');
      document.documentElement.classList.add(${JSON.stringify(c.theme)});
      /* 让视口外的元素也进入终态，避免整页截图里出现空白 */
      document.querySelectorAll('.reveal, .mask, .hero-name, #statBand').forEach(el => el.classList.add('is-in'));
      document.querySelectorAll('.num').forEach(el => {
        const t = parseFloat(el.getAttribute('data-count'));
        el.textContent = t.toFixed(parseInt(el.getAttribute('data-dec'),10) || 0);
      });
      const a = document.querySelector(${JSON.stringify(c.sel)});
      const y = a ? Math.max(0, a.getBoundingClientRect().top + window.scrollY - 88) : 0;
      /* clone.css 给 html 定了 scroll-behavior:smooth，普通 scrollTo 会一路动画，
         断言里那些「点完滚没滚」全都会被这段动画污染 —— 点名 instant 才是真的就位 */
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      window.dispatchEvent(new Event('scroll'));
      /* 断言要数「图真的解码出来了」，所以强制加载视口外的懒加载图；
         先把原始 loading 值记下来，免得把「缺 lazy」这条断言自己改掉 */
      document.querySelectorAll('img').forEach((i) => {
        i.dataset.wasLoading = i.getAttribute('loading') || '';
        if (i.getAttribute('loading') === 'lazy') i.loading = 'eager';
      });
      return 1;
    })()`, sessionId);
    for (let i = 0; i < 24; i++) {
      const ready = await evalIn(`[].slice.call(document.querySelectorAll(${JSON.stringify(IMG_SET)})).every(function(im){ return im.complete && im.naturalWidth > 0; })`, sessionId);
      if (ready) break;
      await sleep(250);
    }
    await sleep(500);

    const m = await evalIn(`(() => {
      ${IS_REMOTE}
      const L = (sel) => { const e = document.querySelector(sel); return e ? +e.getBoundingClientRect().left.toFixed(1) : null; };
      const rail = document.querySelector('#tlRail');
      const imgs = [].slice.call(document.querySelectorAll(${JSON.stringify(IMG_SET)}));
      const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
      const remote = imgs.filter((i) => isRemote(i.currentSrc || i.src));
      const cards = [].slice.call(document.querySelectorAll('.about-works .work-card'));
      const rail2 = document.querySelector('.works-grid');
      return JSON.stringify({
        heroName: L('.hero-name'), kicker: L('.hero-kicker'), stat: L('.stat'),
        sectionH2: L('.section-head h2'), tlWhen: L('.tl-when'), skillName: L('.skill-name'),
        contactKey: L('.contact-key'), workCard: L('.about-works .work-card'),
        contactH2: (document.querySelector('#sec-contact h2') || {}).textContent || null,
        contactActLeft: L('.contact-act'),
        railLeft: rail ? +(rail.getBoundingClientRect().left + 0.5).toFixed(1) : null,
        fillPct: rail ? getComputedStyle(rail).getPropertyValue('--fill') : null,
        litNodes: document.querySelectorAll('.tl-item.is-lit').length,
        shotStrips: document.querySelectorAll('.tl-shots').length,
        shots: document.querySelectorAll('.tl-shot').length,
        shotIsButton: [].slice.call(document.querySelectorAll('.tl-shot')).filter((s) => s.tagName === 'BUTTON').length,
        shotHasCap: [].slice.call(document.querySelectorAll('.tl-shot')).filter((s) => (s.getAttribute('data-cap') || '').trim()).length,
        /* 位置断言：图仍然在要点之后、标签之前，别让上次那版「标题之上」回来。
           querySelectorAll 返回文档序，所以这里量到的就是真实先后 */
        order: [].slice.call(document.querySelectorAll('.tl-item')).map(function (it) {
          return [].slice.call(it.querySelectorAll('.tl-index, .tl-points, .tl-shots, .work-tags')).map(function (e) {
            return e.classList.contains('tl-shots') ? 'shots'
              : e.classList.contains('tl-points') ? 'points'
              : e.classList.contains('tl-index') ? 'index' : 'tags';
          }).join('>');
        }).join(' | '),
        orderBad: [].slice.call(document.querySelectorAll('.tl-item')).filter(function (it) {
          var seq = [].slice.call(it.querySelectorAll('.tl-index, .tl-points, .tl-shots, .work-tags')).map(function (e) {
            return e.classList.contains('tl-shots') ? 'shots'
              : e.classList.contains('tl-points') ? 'points'
              : e.classList.contains('tl-index') ? 'index' : 'tags';
          });
          var s = seq.indexOf('shots');
          if (s < 0) return false;
          return s < seq.indexOf('points') || seq[s + 1] !== 'tags';
        }).length,
        workCards: cards.length,
        workGridLeft: rail2 ? +rail2.getBoundingClientRect().left.toFixed(1) : null,
        imgTotal: imgs.length, imgLoaded: loaded.length, imgRemote: remote.length,
        imgNoAlt: imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).length,
        imgNoLazy: imgs.filter((i) => i.dataset.wasLoading !== 'lazy').length,
        sectionNos: [].slice.call(document.querySelectorAll('.section-no')).map((e) => e.textContent.trim()).join(','),
        extLinks: cards.filter((c) => (c.getAttribute('href') || '').startsWith('http')).length,
        intLinks: cards.filter((c) => !(c.getAttribute('href') || '').startsWith('http')).length,
        brokenHref: cards.filter((c) => { const h = c.getAttribute('href') || ''; return !h || h === '#'; }).length,
        docH: document.documentElement.scrollHeight,
        overflowX: document.documentElement.scrollWidth > window.innerWidth
      });
    })()`, sessionId);
    const st = JSON.parse(m);
    const fails = [];
    if (st.overflowX) fails.push('横向溢出');
    if (st.imgTotal && st.imgLoaded !== st.imgTotal) fails.push(`图片未加载 ${st.imgLoaded}/${st.imgTotal}`);
    if (st.imgRemote) fails.push(`${st.imgRemote} 张图指向站外`);
    if (st.imgNoAlt) fails.push(`${st.imgNoAlt} 张图缺 alt`);
    if (st.imgNoLazy) fails.push(`${st.imgNoLazy} 张图缺 loading=lazy`);
    if (st.sectionNos !== '01,02,03,04') fails.push(`小节编号 ${st.sectionNos}`);
    if (st.contactH2 !== '联系方式') fails.push(`04 标题是「${st.contactH2}」`);
    if (st.shotStrips !== 2) fails.push(`配图条数 ${st.shotStrips}（期望 2）`);
    if (st.workCards !== 4) fails.push(`项目卡 ${st.workCards}（期望 4）`);
    if (st.brokenHref) fails.push(`${st.brokenHref} 张卡没有链接`);
    if (st.extLinks + st.intLinks !== st.workCards) fails.push('卡片链接类型异常');
    if (st.orderBad) fails.push(`${st.orderBad} 段经历的配图不在要点之下`);
    if (st.shots && st.shotIsButton !== st.shots) fails.push(`${st.shots - st.shotIsButton} 枚缩略图不是 button，键盘进不去`);
    if (st.shots && st.shotHasCap !== st.shots) fails.push(`${st.shots - st.shotHasCap} 枚缩略图缺 data-cap 说明`);

    /* 灯箱：跑一遍开→关，看滚动位置与焦点有没有被人动过 */
    let lb = null;
    if (c.sel === '#sec-exp' || c.lb) {
      lb = JSON.parse(await evalIn(LIGHTBOX_TEST, sessionId));
      const y0 = lb.before.y;
      if (lb.before.open || lb.before.ariaHidden !== 'true') fails.push('灯箱默认就是开着的');
      if (lb.open.ariaHidden !== 'false') fails.push('点开后 aria-hidden 没翻转');
      if (lb.open.visibility !== 'visible' || lb.open.opacity < 0.95) fails.push(`点开不显形 opacity=${lb.open.opacity}`);
      if (!lb.open.bigLoaded) fails.push('放大图没解码出来');
      if (lb.open.remote) fails.push('放大图指向站外');
      if (!lb.open.inViewport) fails.push(`放大图超出视口 ${lb.open.bigRect}`);
      if (lb.open.bigRect[2] < lb.open.shotW * 2) fails.push(`只放大到 ${lb.open.bigRect[2]}px，缩略图已有 ${lb.open.shotW}px`);
      if (!lb.open.settled) fails.push('展开动画没收在终点');
      if (lb.open.lifted !== 1) fails.push(`原位缩略图没隐去（lifted=${lb.open.lifted}）`);
      if (!lb.open.boxFocused) fails.push('打开后焦点没进灯箱');
      if (!lb.open.cap) fails.push('放大后没有说明文字');
      if (lb.open.overflowX) fails.push('灯箱撑出横向溢出');
      if (lb.open.y !== y0) fails.push(`打开时页面被推走 ${y0}→${lb.open.y}`);
      if (lb.closed.open) fails.push('Esc 没关掉');
      if (lb.closed.visibility !== 'hidden') fails.push('关闭后遮罩仍可见');
      if (!lb.closed.focusOnShot) fails.push('关闭后焦点没回到那枚缩略图');
      if (lb.closed.lifted !== 0) fails.push('关闭后原图没复位');
      if (lb.closed.y !== y0) fails.push(`关闭后阅读位置变了 ${y0}→${lb.closed.y}`);
    }

    /* 联系方式：三行内容、两枚复制按钮的确认态、二维码的弹出与回收 */
    let ct = null;
    if (c.sel === '#sec-contact' || c.copyShot || c.qrShot) {
      ct = JSON.parse(await evalIn(CONTACT_TEST, sessionId));
      if (ct.keys !== 'EMAIL|PHONE NUMBER|WECHAT') fails.push(`联系方式三行是 ${ct.keys}`);
      if (ct.rowLinks) fails.push(`${ct.rowLinks} 行联系方式还是链接`);
      /* 联系方式被省略号截断等于没给；窄屏必须换成「标签在上、值+按钮在下」的两行布局 */
      if (ct.clipped.length) fails.push(`值被截断：${ct.clipped.join('、')}`);
      if ((c.w < 640) !== ct.stacked) fails.push(`联系方式布局不匹配视口（w=${c.w} stacked=${ct.stacked}）`);
      if (ct.copy.length !== 2) fails.push(`复制按钮 ${ct.copy.length} 枚`);
      /* 两枚都没进确认态 = 剪贴板被拒，那动画就等于没测到，宁可报错也不要静默跳过 */
      if (ct.copy.length === 2 && !ct.copy.some((r) => r.copied)) fails.push('两枚复制按钮都没进确认态，动画没测到');
      ct.copy.forEach((r) => {
        const honest = r.copied ? /已复制/.test(r.live) : /拦住/.test(r.live);
        if (!honest) fails.push(`${r.what} 的反馈和实况不符（${r.live}）`);
        if (r.copied && !(r.checkShown && r.idleHidden && r.wordUp && r.fillSwept)) {
          fails.push(`${r.what} 确认动画没走完 ${JSON.stringify(r)}`);
        }
        if (!r.reset) fails.push(`${r.what} 的确认态没自己退回`);
        if (r.copied && !r.liveCleared) fails.push(`${r.what} 的播报没清空`);
      });
      if (ct.yAfterCopy !== ct.y0) fails.push(`点复制时页面被推走 ${ct.y0}→${ct.yAfterCopy}`);
      const q = ct.qr;
      if (!q.open || !q.isQr) fails.push('二维码没按二维码那套打开');
      if (!q.loaded) fails.push('二维码图没解码出来');
      if (Math.abs(q.w - q.h) > 2) fails.push(`二维码不是方形 ${q.w}×${q.h}`);
      if (!q.inViewport) fails.push('二维码超出视口');
      if (!q.boxFocused) fails.push('二维码打开后焦点没进遮罩');
      if (!/微信/.test(q.aria)) fails.push(`遮罩 aria-label 没跟着换（${q.aria}）`);
      if (q.overflowX) fails.push('二维码撑出横向溢出');
      if (q.y !== q.y0 || q.yAfter !== q.y0) fails.push(`点二维码时页面被推走 ${q.y0}→${q.y}→${q.yAfter}`);
      if (!q.closed || q.visibility !== 'hidden') fails.push('二维码关不掉');
      if (!q.focusBack) fails.push('关掉后焦点没回扫码按钮');
    }

    report.push({ case: c.name, ...st, lb: lb && { open: lb.open, closed: { y: lb.closed.y, focusOnShot: lb.closed.focusOnShot, visibility: lb.closed.visibility } }, ct: ct && { keys: ct.keys, copy: ct.copy, qr: ct.qr }, fails });
    if (c.copyShot) {
      await evalIn(`(() => { document.querySelector('.contact-act[data-copy]').click(); return 1; })()`, sessionId);
      await sleep(380);
    } else if (c.qrShot) {
      await evalIn(`(() => { document.querySelector('.contact-act[data-qr]').click(); return 1; })()`, sessionId);
      await sleep(700);
    }
    if (c.lb) {
      /* 这张要的是「正开着」的样子，所以再点开一次再截 */
      await evalIn(`(() => { document.querySelector('.tl-shot').click(); return 1; })()`, sessionId);
      await sleep(700);
    } else if (c.lbMid) {
      /* 飞行途中的一帧：图应该正骑在缩略图上方，而不是凭空出现 */
      await evalIn(`(() => { document.querySelector('.tl-shot').click(); return 1; })()`, sessionId);
      await sleep(130);
    }

    const { data } = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
    writeFileSync(join(OUT, `${c.name}.png`), Buffer.from(data, 'base64'));
    console.log('✓', c.name);
  }

  /* ---------- 打印版式：「下载简历 PDF」走的就是这条管线 ----------
     about.css 第 9 节的 @page 是 A4 竖版，去掉 13mm 左右边距后正文宽约 695px。
     视口先按这个宽度摆，再切 print 媒体，屏幕上量到的就是纸上的样子。
     注意：clone.css 的 min-width:768px 桌面栅格在 695px 下本来就不生效，
     所以打印布局必须在 @media print 里另写一套 —— 这条断言量的就是有没有写全。 */
  const A4_W = 695;
  const A4_H = 1013; /* 297 - 14 - 15 = 268mm */
  await rpc('Emulation.setDeviceMetricsOverride', { width: A4_W, height: A4_H, deviceScaleFactor: 1, mobile: false }, sessionId);
  await goto(URL_, 1400);
  /* 真实用户路径：点 #pdfBtn。headless 里弹不出打印框，所以先把 window.print 换成探针 ——
     这样量的仍是按钮自己那条链路：点击 → settle（揭开进场、落数字、放回筛掉的条目）→ 调打印。 */
  await evalIn(`(() => {
    window.__printCalls = 0;
    window.print = function () { window.__printCalls++; };
    const t = document.querySelector('.filter-tag[data-kind="work"]'); if (t) t.click(); return 1;
  })()`, sessionId);
  await sleep(300);
  const hiddenBefore = await evalIn(`(() => [].slice.call(document.querySelectorAll('.tl-item')).filter((e) => getComputedStyle(e).display === 'none').length)()`, sessionId);
  await evalIn(`(() => { document.getElementById('pdfBtn').click(); return 1; })()`, sessionId);
  await sleep(400);
  await rpc('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
  await sleep(400);
  const printCalls = await evalIn(`(() => window.__printCalls)()`, sessionId);
  const pm = JSON.parse(await evalIn(`(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const d = (s) => { const e = g(s); return e ? e.display : 'missing'; };
    /* 亮度 0~255，越小越黑；带 alpha 的先按白纸合成一遍 ——
       rgba(9,9,11,.22) 直接取 rgb 会量成近黑，可纸上其实是一层浅灰。
       屏幕上「次要文字」靠深色底 + 低不透明度分层级，白纸上同一套只会糊掉，
       纸上到底有没有墨，只能这样量出来才知道 */
    const lum = (sel, prop) => {
      const e = g(sel); if (!e) return null;
      const m = String(e[prop || 'color']).match(/[\\d.]+/g);
      if (!m || m.length < 3) return null;
      const a = m.length > 3 ? +m[3] : 1;
      const c = (i) => +m[i] * a + 255 * (1 - a);
      return +(0.299 * c(0) + 0.587 * c(1) + 0.114 * c(2)).toFixed(1);
    };
    const rev = [].slice.call(document.querySelectorAll('.reveal'));
    const items = [].slice.call(document.querySelectorAll('.tl-item'));
    const nums = [].slice.call(document.querySelectorAll('.num'));
    const act = document.querySelector('.filter-tag.active');
    const root = getComputedStyle(document.documentElement);
    return JSON.stringify({
      header: d('.site-header'), actions: d('.about-actions'), contactAct: d('.contact-act'),
      shotLb: d('#shotBox'), progress: d('.progress-track'), filterBar: d('.filter-bar'),
      screenOnly: [].slice.call(document.querySelectorAll('.screen-only')).every((e) => getComputedStyle(e).display === 'none'),
      bodyBg: g('body').backgroundColor,
      bgToken: root.getPropertyValue('--background').trim(),
      fgToken: root.getPropertyValue('--foreground').trim(),
      /* 01 经历在纸上还得是条时间轴：脊线和节点必须活着，游标点该死 */
      rail: d('.tl-rail'), node: d('.tl-node'), head: d('.tl-head'),
      nodeLum: lum('.tl-node', 'backgroundColor'),
      /* 三处最容易糊掉的墨色：巨型年份、正文要点、胶囊标签 */
      yearLum: lum('.tl-year'), pointsLum: lum('.tl-points'),
      pillBg: lum('.work-tags span', 'backgroundColor'), pillFg: lum('.work-tags span'),
      meterOff: lum('.meter i:not(.on)', 'backgroundColor'),
      tlCols: (g('.tl-item') || {}).gridTemplateColumns,
      tlWhen: (g('.tl-when') || {}).position,
      worksCols: (g('.works-grid') || {}).gridTemplateColumns,
      /* 纸上点不了链接，所以外链要把地址印出来 —— 量 ::after 真的带上去了没 */
      /* 纸上点不了链接，所以外链要把地址印出来 —— 量 ::after 真的带上去了没。
         attr() 取的是宿主自己的属性，挂在没有 href 的 h3 上会印出空串，这里连这条一起看住 */
      extCards: document.querySelectorAll('.about-works .work-card[href^="http"]').length,
      extPrinted: [].slice.call(document.querySelectorAll('.about-works .work-card[href^="http"]'))
        .filter((e) => String(getComputedStyle(e, '::after').content).indexOf('http') !== -1).length,
      extAfter: String(getComputedStyle(document.querySelector('.about-works .work-card[href^="http"]'), '::after').content).slice(0, 60),
      statCols: (g('.stat-band') || {}).gridTemplateColumns,
      revealMin: rev.length ? Math.min.apply(null, rev.map((e) => +getComputedStyle(e).opacity)) : null,
      numBad: nums.filter((e) => e.textContent.replace(/[,\\s]/g, '') !== parseFloat(e.getAttribute('data-count')).toFixed(parseInt(e.getAttribute('data-dec'), 10) || 0)).length,
      numTotal: nums.length,
      activeKind: act ? act.getAttribute('data-kind') : null,
      hiddenNow: items.filter((e) => getComputedStyle(e).display === 'none').length,
      overflowX: document.documentElement.scrollWidth > ${A4_W},
      scrollW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
      pages: Math.ceil(document.documentElement.scrollHeight / ${A4_H}),
      nameSize: (g('.hero-name') || {}).fontSize,
    });
  })()`, sessionId));
  {
    const f = [];
    if (!printCalls) f.push('点「下载简历 PDF」没有走到打印管线');
    if (pm.header !== 'none') f.push(`打印时页头还在（${pm.header}）`);
    if (pm.actions !== 'none') f.push('打印时按钮组还在');
    if (pm.contactAct !== 'none') f.push('打印时复制/扫码按钮还在');
    if (pm.shotLb !== 'none') f.push('打印时灯箱还在');
    if (pm.filterBar !== 'none') f.push('打印时筛选条还在');
    if (!pm.screenOnly) f.push('讲滚动进度的屏幕批注也上了纸（纸上没有滚动）');
    if (pm.bodyBg !== 'rgb(255, 255, 255)') f.push(`纸面底色是 ${pm.bodyBg}，不是白`);
    if (pm.bgToken !== '0 0% 100%') f.push(`打印时 --background 仍是 ${pm.bgToken}（暗色主题没被覆盖）`);
    if (pm.fgToken !== '240 10% 3.9%') f.push(`打印时 --foreground 是 ${pm.fgToken}，白墨印不出来`);
    if (pm.revealMin !== 1) f.push(`有 .reveal 在打印时仍是半透明（${pm.revealMin}）`);
    if (pm.numBad) f.push(`${pm.numBad}/${pm.numTotal} 个数字没落到终值`);
    if (hiddenBefore > 0 && (pm.activeKind !== 'all' || pm.hiddenNow > 0)) f.push(`打印前筛掉了 ${hiddenBefore} 条，打印时仍是 ${pm.activeKind} / 藏 ${pm.hiddenNow} 条`);
    if (pm.tlWhen !== 'static') f.push(`打印时时间轴年份仍是 ${pm.tlWhen}`);
    if (pm.overflowX) f.push(`打印版横向溢出（${pm.scrollW} > ${A4_W}）`);
    if (pm.pages > 4) f.push(`打印要 ${pm.pages} 页，太长`);
    /* 1) 时间轴得上纸：脊线 + 节点留着，只有跟着滚动走的游标点该死 */
    if (pm.rail === 'none' || pm.rail === 'missing') f.push('打印版把时间轴脊线弄丢了，01 经历不再是时间轴');
    if (pm.node === 'none' || pm.node === 'missing') f.push('打印版把时间轴节点弄丢了');
    if (pm.head !== 'none') f.push('纸上还留着跟着滚动走的游标点');
    if (!(pm.nodeLum <= 90)) f.push(`时间轴节点在纸上太浅（亮度 ${pm.nodeLum}）`);
    /* 2) 墨色：屏幕上靠深色底撑出来的层级，白纸上必须换成真墨 */
    if (!(pm.yearLum <= 90)) f.push(`巨型年份在纸上太浅（亮度 ${pm.yearLum}）`);
    if (!(pm.pointsLum <= 90)) f.push(`经历正文在纸上太浅（亮度 ${pm.pointsLum}）`);
    if (!(pm.meterOff <= 225)) f.push(`能力刻度的空档看不见（亮度 ${pm.meterOff}）`);
    /* 3) 胶囊：.dark 里那行硬编码 #18181880 会在白纸上糊成一坨中灰 */
    if (!(pm.pillBg >= 200)) f.push(`胶囊标签是灰底（底色亮度 ${pm.pillBg}）`);
    if (!(pm.pillFg <= 90)) f.push(`胶囊标签的字太浅（亮度 ${pm.pillFg}）`);
    if (pm.extPrinted !== pm.extCards) f.push(`${pm.extCards} 张外链项目卡里只有 ${pm.extPrinted} 张把地址印了出来`);
    /* 暗色是本站默认，也是胶囊翻车的那一档；亮色再量一遍，两套主题都得压得住 */
    await evalIn(`(() => { document.documentElement.classList.remove('dark'); document.documentElement.classList.add('light'); return 1; })()`, sessionId);
    await sleep(200);
    const inkLight = JSON.parse(await evalIn(`(() => {
      const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
      const lum = (sel, prop) => {
        const e = g(sel); if (!e) return null;
        const m = String(e[prop || 'color']).match(/[\\d.]+/g);
        if (!m || m.length < 3) return null;
        const a = m.length > 3 ? +m[3] : 1;
        const c = (i) => +m[i] * a + 255 * (1 - a);
        return +(0.299 * c(0) + 0.587 * c(1) + 0.114 * c(2)).toFixed(1);
      };
      return JSON.stringify({ pillBg: lum('.work-tags span', 'backgroundColor'), pillFg: lum('.work-tags span'), yearLum: lum('.tl-year'), pointsLum: lum('.tl-points') });
    })()`, sessionId));
    /* 那些靠 opacity 撑出来的「次要感」，纸上一律收掉，否则又是浅灰一片 */
    const faded = JSON.parse(await evalIn(`(() => {
      const sels = ['.section-en', '.tl-index', '.tl-range', '.tl-dur', '.skill-name em', '.contact-key'];
      const bad = sels.filter((s) => { const e = document.querySelector(s); return e && +getComputedStyle(e).opacity < 1; });
      return JSON.stringify({ bad: bad, min: Math.min.apply(null, sels.map((s) => { const e = document.querySelector(s); return e ? +getComputedStyle(e).opacity : 1; })) });
    })()`, sessionId));
    if (faded.bad.length) f.push(`纸上仍用 opacity 淡化文字：${faded.bad.join('、')}`);
    if (!(inkLight.pillBg >= 200)) f.push(`亮色主题下胶囊是灰底（底色亮度 ${inkLight.pillBg}）`);
    if (!(inkLight.pillFg <= 90)) f.push(`亮色主题下胶囊字太浅（亮度 ${inkLight.pillFg}）`);
    if (!(inkLight.yearLum <= 90 && inkLight.pointsLum <= 90)) f.push(`亮色主题下正文太浅（年份 ${inkLight.yearLum} / 要点 ${inkLight.pointsLum}）`);
    await evalIn(`(() => { document.documentElement.classList.remove('light'); document.documentElement.classList.add('dark'); return 1; })()`, sessionId);
    report.push({ case: 'print·A4 打印版式', ...pm, inkLight, faded, hiddenBefore, printCalls, fails: f });
    console.log(f.length ? '✗' : '✓', `print·A4 打印版式（${pm.pages} 页 / ${pm.docH}px）`);
  }
  {
    const s = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true }, sessionId);
    writeFileSync(join(OUT, 'about-print.png'), Buffer.from(s.data, 'base64'));
    /* PDF 只出到临时目录：每跑一次字节都变，不进仓库；要看真实分页再手动打开 */
    const pdf = await rpc('Page.printToPDF', {
      printBackground: true, preferCSSPageSize: true,
      paperWidth: 8.27, paperHeight: 11.69, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
    }, sessionId);
    const tmp = 'C:/Users/Administrator/AppData/Local/Temp/hyweb-resume.pdf';
    writeFileSync(tmp, Buffer.from(pdf.data, 'base64'));
    console.log('  · PDF 样例', tmp, (Buffer.from(pdf.data, 'base64').length / 1024).toFixed(0) + 'KB');
  }
  /* 必须清干净：后面的门禁用例跑的是屏幕媒体，留着 print 会量错 */
  await rpc('Emulation.setEmulatedMedia', { media: '' }, sessionId);
  await sleep(200);

  /* 打完收工：afterprint 要把打印前那个筛选条件原样还回去，
     否则用户关掉打印框会发现「我刚才只看得到工作经历，怎么全冒出来了」 */
  await evalIn(`(() => { window.dispatchEvent(new Event('afterprint')); return 1; })()`, sessionId);
  await sleep(300);
  const back = JSON.parse(await evalIn(`(() => {
    const act = document.querySelector('.filter-tag.active');
    return JSON.stringify({
      kind: act ? act.getAttribute('data-kind') : null,
      hidden: [].slice.call(document.querySelectorAll('.tl-item')).filter((e) => getComputedStyle(e).display === 'none').length,
      total: document.querySelectorAll('.tl-item').length,
    });
  })()`, sessionId));
  {
    const f = [];
    if (back.kind !== 'work') f.push(`打印后筛选回到了 ${back.kind}，不是打印前的 work`);
    if (hiddenBefore && back.hidden !== hiddenBefore) f.push(`打印后藏了 ${back.hidden} 条，打印前是 ${hiddenBefore} 条`);
    report.push({ case: 'print·打完回到原状', ...back, fails: f });
    console.log(f.length ? '✗' : '✓', `print·打完回到原状（${back.total} 条里藏 ${back.hidden} 条）`);
  }

  /* ---------- 门禁：没钥匙进不来 · 静态导航里搜不到 · 解锁后页签才出现 ---------- */
  const NAV_TEST = `(() => {
    const names = (sel) => [].slice.call(document.querySelectorAll(sel + ' a')).map((a) => a.textContent.trim());
    return JSON.stringify({
      file: location.pathname.split('/').pop(),
      search: location.search,
      main: names('.main-nav'),
      mobile: names('.mobile-menu'),
      ok: document.documentElement.classList.contains('about-ok'),
      visibility: getComputedStyle(document.body).visibility,
      resume: !!document.querySelector('.tl-item'),
      active: [].slice.call(document.querySelectorAll('.main-nav a.active')).map((a) => a.textContent.trim()),
    });
  })()`;
  const shot = async (name) => {
    const s = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
    writeFileSync(join(OUT, name + '.png'), Buffer.from(s.data, 'base64'));
  };
  const gate = [];
  const addGate = (name, fails, extra) => { gate.push({ case: name, fails, ...extra }); console.log(fails.length ? '✗' : '✓', name); };

  await rpc('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evalIn(`(() => { try { sessionStorage.clear(); } catch (e) {} return 1; })()`, sessionId);

  /* A. 没有钥匙直接访问 /about.html —— 必须被弹回首页，简历一个字都不渲染 */
  await goto(BASE + 'about.html', 1000);
  let g = JSON.parse(await evalIn(NAV_TEST, sessionId));
  let f = [];
  if (g.file !== 'index.html') f.push(`无钥匙访问停在了 ${g.file}`);
  if (g.resume) f.push('无钥匙却渲染出了简历正文');
  await shot('about-locked');
  addGate('门禁·无钥匙弹回首页', f, g);

  /* B. 从站内正常走进来 —— 桌面导航和移动菜单都不该有「关于」 */
  await goto(BASE + 'index.html', 1000);
  g = JSON.parse(await evalIn(NAV_TEST, sessionId));
  f = [];
  if (g.main.join(',') !== '首页,项目,收藏推荐') f.push(`站内导航是 ${g.main.join(',')}`);
  if (g.mobile.join(',').indexOf('关于') !== -1) f.push('移动菜单里漏了「关于」');
  addGate('门禁·站内导航不出现关于', f, g);

  /* C. 静态源码里也搜不到入口（clone.js 的注入器除外，那是解锁后才跑的） */
  const leak = ['index.html', 'projects.html', 'favorites.html', 'intro.html', 'post-awake.html',
    'post-ghost.html', 'post-memory.html', 'post-pacing.html', 'post-pixels.html']
    .filter((fn) => readFileSync(fn, 'utf8').indexOf('about.html') !== -1);
  addGate('门禁·九个页面源码搜不到入口', leak.length ? [`静态导航里写死了 about.html：${leak.join('、')}`] : [], { leak });

  /* C2. 全站版本号只有一个号（DESIGN.md 8.1）。这条是补上的：
         另一次提交把 logo 图升到 v=17，这边把 JS/CSS 从 v=15 升到 v=16，
         两边各升各的，站点就同时挂着两个号 —— 谁都不会报错，直到有人拿到旧缓存 */
  const versions = {};
  for (const fn of readdirSync('.').filter((x) => x.endsWith('.html'))) {
    for (const v of readFileSync(fn, 'utf8').matchAll(/\?v=(\d+)/g)) {
      (versions[v[1]] = versions[v[1]] || []).push(fn);
    }
  }
  const vs = Object.keys(versions);
  addGate('版本·全站只有一个版本号', vs.length === 1 ? [] : [`站点同时挂着 ${vs.map((v) => `v=${v}（${versions[v].length} 处）`).join(' + ')}`], { versions: vs });

  /* D. 带钥匙访问 —— 放行、揭开整页、钥匙从地址栏消失、「关于」出现在导航 */
  await evalIn(`(() => { try { sessionStorage.clear(); } catch (e) {} return 1; })()`, sessionId);
  await goto(URL_, 1400);
  g = JSON.parse(await evalIn(NAV_TEST, sessionId));
  f = [];
  if (!g.ok) f.push('带钥匙却没放行（html 上没有 about-ok）');
  if (g.visibility !== 'visible') f.push(`页面仍是 ${g.visibility}`);
  if (g.search !== '') f.push(`地址栏还挂着钥匙 ${g.search}`);
  if (g.main[g.main.length - 1] !== '关于') f.push(`解锁后导航末尾是 ${g.main.join(',')}`);
  if (g.active.join(',') !== '关于') f.push('在简历页上「关于」没进激活态');
  addGate('门禁·专属链接解锁并抹掉钥匙', f, g);

  /* E. 解锁状态跟着这个标签页走 —— 回到首页也能看见「关于」，即「可以访问博客的完整内容」 */
  await goto(BASE + 'index.html', 1000);
  g = JSON.parse(await evalIn(NAV_TEST, sessionId));
  f = [];
  if (g.main.join(',') !== '首页,项目,收藏推荐,关于') f.push(`解锁后进首页，导航是 ${g.main.join(',')}`);
  if (g.mobile.join(',').indexOf('关于') === -1) f.push('移动菜单里没有「关于」');
  await shot('about-nav-unlocked');
  addGate('门禁·解锁后可浏览全站', f, g);

  report.push(...gate);

  console.log('\n' + JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, 'about-report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  const bad = report.filter((r) => r.fails.length);
  bad.forEach((r) => console.log('✗', r.case, '→', r.fails.join('；')));
  console.log(bad.length ? `\nFAILS ${bad.length}/${report.length}` : `\nTOTAL FAILS 0（${report.length} 个用例）`);
  try { ws.close(); } catch {}
  chrome.kill();
  if (bad.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(1); });
