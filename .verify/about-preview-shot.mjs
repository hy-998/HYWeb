/* about-preview.html 视觉与对齐验证
   运行：node .verify/about-preview-shot.mjs
   产物：.verify/about-*.png + 一段左缘对齐测量 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = '.verify';
const URL_ = 'file:///D:/LHYsAuto/HYWeb/about-preview.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { name: 'about-desktop-dark-hero',    w: 1280, h: 900, theme: 'dark',  y: 0 },
  { name: 'about-desktop-dark-timeline', w: 1280, h: 900, theme: 'dark',  y: 1450 },
  { name: 'about-desktop-dark-skills',   w: 1280, h: 900, theme: 'dark',  y: 2650 },
  { name: 'about-desktop-light-hero',    w: 1280, h: 900, theme: 'light', y: 0 },
  { name: 'about-desktop-light-skills',  w: 1280, h: 900, theme: 'light', y: 2650 },
  { name: 'about-mobile-dark-hero',      w: 390,  h: 844, theme: 'dark',  y: 0 },
  { name: 'about-mobile-dark-timeline',  w: 390,  h: 844, theme: 'dark',  y: 1600 },
];

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

  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Runtime.enable', {}, sessionId);

  const report = [];
  for (const c of CASES) {
    await rpc('Emulation.setDeviceMetricsOverride', { width: c.w, height: c.h, deviceScaleFactor: 1, mobile: c.w < 700 }, sessionId);
    await rpc('Page.navigate', { url: URL_ }, sessionId);
    await new Promise((res) => {
      const onMsg = (ev) => { try { if (JSON.parse(ev.data).method === 'Page.loadEventFired') { ws.removeEventListener('message', onMsg); res(); } } catch {} };
      ws.addEventListener('message', onMsg);
      setTimeout(res, 20000);
    });
    await sleep(1200);

    await evalIn(`(() => {
      document.documentElement.classList.remove('light','dark');
      document.documentElement.classList.add(${JSON.stringify(c.theme)});
      /* 让视口外的元素也进入终态，避免整页截图里出现空白 */
      document.querySelectorAll('.reveal, .mask, .hero-name, #statBand').forEach(el => el.classList.add('is-in'));
      document.querySelectorAll('.num').forEach(el => {
        const t = parseFloat(el.getAttribute('data-count'));
        el.textContent = t.toFixed(parseInt(el.getAttribute('data-dec'),10) || 0);
      });
      window.scrollTo(0, ${c.y});
      window.dispatchEvent(new Event('scroll'));
      return 1;
    })()`, sessionId);
    await sleep(700);

    if (c.name.endsWith('hero')) {
      const m = await evalIn(`(() => {
        const L = (sel) => { const e = document.querySelector(sel); return e ? +e.getBoundingClientRect().left.toFixed(1) : null; };
        const rail = document.querySelector('#tlRail');
        const fill = document.querySelector('#tlRail');
        return JSON.stringify({
          heroName: L('.hero-name'), kicker: L('.hero-kicker'), stat: L('.stat'),
          sectionH2: L('.section-head h2'), tlWhen: L('.tl-when'), skillName: L('.skill-name'),
          contactKey: L('.contact-key'),
          railLeft: rail ? +(rail.getBoundingClientRect().left + 0.5).toFixed(1) : null,
          fillPct: fill ? getComputedStyle(fill).getPropertyValue('--fill') : null,
          litNodes: document.querySelectorAll('.tl-item.is-lit').length,
          docH: document.documentElement.scrollHeight,
          overflowX: document.documentElement.scrollWidth > window.innerWidth
        });
      })()`, sessionId);
      report.push({ case: c.name, ...JSON.parse(m) });
    }

    const { data } = await rpc('Page.captureScreenshot', { format: 'png', fromSurface: true }, sessionId);
    writeFileSync(join(OUT, `${c.name}.png`), Buffer.from(data, 'base64'), 'base64');
    console.log('✓', c.name);
  }

  console.log('\n' + JSON.stringify(report, null, 2));
  try { ws.close(); } catch {}
  chrome.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
