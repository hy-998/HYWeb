// Renders a page over CDP into a deterministic frozen state and exports three
// artefacts: the frozen HTML, per-element computed styles, and a full-page PNG.
// Used for both sides of the pixel diff, so both are produced identically.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Kill anything time- or scroll-dependent so two renders can be compared.
// The reveal state is set the way the site itself ends up after its entrance
// animation (is-in + reveal-done), rather than by an opacity override, so the
// reference shows the real resting page and clone.js has a target to match.
const FREEZE = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }
  html, body { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const PATHS_EXPR = `(() => {
  const path = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 10; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (typeof n.className === 'string' && n.className.trim())
        s += '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName) : [];
      if (sibs.length > 1) s += '[' + (sibs.indexOf(n) + 1) + ']';
      parts.unshift(s);
    }
    return parts.join('>');
  };
  return JSON.stringify([...document.querySelectorAll('body *')].map(path));
})()`;

export const STYLES_EXPR = `(() => {
  const props = ['display','position','top','left','right','bottom','width','height',
    'marginTop','marginRight','marginBottom','marginLeft','paddingTop','paddingRight',
    'paddingBottom','paddingLeft','fontFamily','fontSize','fontWeight','fontStyle',
    'lineHeight','letterSpacing','textAlign','textTransform','color','backgroundColor',
    'borderTopWidth','borderTopColor','borderBottomWidth','borderRadius','opacity','zIndex',
    'flexDirection','justifyContent','alignItems','gap','gridTemplateColumns','maxWidth',
    'overflowX','boxShadow','textDecorationLine','whiteSpace','wordBreak','textIndent'];
  // Attributes that gate rendering are part of the comparison too: a hidden
  // difference changes what is painted without changing any computed style, so a
  // style-only diff would call two clearly different renders identical.
  const attrs = ['hidden', 'data-anim-chosen', 'aria-hidden', 'aria-expanded', 'open', 'disabled', 'data-pg'];
  const domPath = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 10; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += '#' + n.id;
      else if (typeof n.className === 'string' && n.className.trim())
        s += '.' + n.className.trim().split(/\\s+/).slice(0, 3).join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName) : [];
      if (sibs.length > 1) s += '[' + (sibs.indexOf(n) + 1) + ']';
      parts.unshift(s);
    }
    return parts.join('>');
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const hidden = cs.display === 'none' || cs.visibility === 'hidden';
    const r = el.getBoundingClientRect();
    // Hidden elements are still reported when they carry a state attribute, so a
    // visibility gate that disagrees shows up as a difference rather than as a
    // missing element.
    const gate = attrs.some(a => a === 'hidden' ? el.hasAttribute('hidden') : el.hasAttribute(a));
    if (hidden && !gate) continue;
    if (r.width === 0 && r.height === 0 && !gate) continue;
    const o = { p: domPath(el), b: [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)] };
    for (const k of props) o[k] = cs[k];
    for (const a of attrs) o['@' + a] = el.hasAttribute(a) ? 'yes' : 'no';
    out.push(o);
  }
  return JSON.stringify(out);
})()`;

export async function renderPage({ url, outDir, width, label, port, settle = 2500, filePrefix = null }) {
  mkdirSync(outDir, { recursive: true });
  // Artefact names are derived from one prefix so the caller controls whether a
  // capture is written as "rep390.*" or "ref390.*".
  const base = filePrefix || label;
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--font-render-hinting=none',
    '--disable-lcd-text', '--allow-file-access-from-files',
    `--user-data-dir=${join(outDir, `_chrome-${label}`)}`,
    `--remote-debugging-port=${port}`, 'about:blank',
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 140 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { /* waiting */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Chrome did not expose a CDP endpoint'); }

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
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

  try {
    const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
    await rpc('Page.enable', {}, sessionId);
    await rpc('Runtime.enable', {}, sessionId);
    await rpc('Emulation.setDeviceMetricsOverride',
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 }, sessionId);

    await rpc('Page.navigate', { url }, sessionId);
    await new Promise((res) => {
      const onMsg = (ev) => {
        try { if (JSON.parse(ev.data).method === 'Page.loadEventFired') { ws.removeEventListener('message', onMsg); res(); } }
        catch { /* ignore */ }
      };
      ws.addEventListener('message', onMsg);
      setTimeout(res, 25000);
    });
    await sleep(settle);

    const evalIn = async (expression) => {
      const { result } = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 600));
      return result.value;
    };

    await evalIn(`(() => {
      const s = document.createElement('style');
      s.textContent = ${JSON.stringify(FREEZE)};
      document.head.appendChild(s);
      // Resting state after the site's own entrance animation.
      const d = document.documentElement;
      d.classList.remove('reveal-hold');
      const app = document.getElementById('app');
      if (app) app.classList.add('stag');
      for (const n of document.querySelectorAll('[data-reveal]')) {
        n.classList.add('is-in', 'reveal-done');
      }
      document.getElementById('veil')?.classList.remove('on');
      // The video element uses preload=none with a poster, so whether it
      // already shows frame 0 depends on when hydration happened — a race that
      // would show up as a large spurious pixel diff. Force both sides to load
      // and park on frame 0, which is the state the page settles into.
      for (const v of document.querySelectorAll('video')) {
        try {
          v.preload = 'auto';
          v.currentTime = 0;
          v.load();
        } catch (e) { /* ignore */ }
      }
      // Close the ⌘K palette if it is open, so both renders show the article.
      const pal = document.querySelector('.pal-overlay');
      if (pal) pal.classList.remove('open', 'in', 'closing');
      // The logo is a Lottie animation driven by JavaScript, so the CSS freeze
      // above does not stop it. Park every player on its first frame.
      try {
        const anims = window.lottie && window.lottie.getRegisteredAnimations
          ? window.lottie.getRegisteredAnimations() : [];
        for (const a of anims) { a.goToAndStop(a.firstFrame || 0, true); }
      } catch (e) { /* ignore */ }
      // Normalise runtime-written state to the page's resting state.
      //
      // The video figure settles on the animation once its poster is clicked.
      // The toggle label is owned by the page's own script and the page may
      // re-render it, so both sides get a paused video (label "Play") and the
      // caption strip stays in the comparison rather than being masked.
      for (const fig of document.querySelectorAll('.art-fig')) {
        fig.setAttribute('data-anim-chosen', '');
        const play = fig.querySelector('.art-anim-play');
        if (play) play.setAttribute('hidden', '');
        const toggle = fig.querySelector('.art-anim-toggle');
        if (toggle) { toggle.removeAttribute('hidden'); toggle.textContent = 'Play'; }
      }
      // Filter tabs: the live page leaves the first tab selected.
      const tabs = [...document.querySelectorAll('.tabs button')];
      tabs.forEach((b, i) => b.classList.toggle('on', i === 0));
      window.scrollTo(0, 0);
      return 1;
    })()`);

    // Wait for the forced video load to settle so frame 0 is actually painted.
    await evalIn(`(async () => {
      const vids = [...document.querySelectorAll('video')];
      await Promise.all(vids.map((v) => new Promise((res) => {
        if (v.readyState >= 2) return res();
        const done = () => res();
        v.addEventListener('loadeddata', done, { once: true });
        v.addEventListener('error', done, { once: true });
        setTimeout(res, 6000);
      })));
      for (const v of vids) { try { v.pause(); v.currentTime = 0; } catch (e) {} }
      return 'ok';
    })()`);
    await sleep(900);

    // Capture with the viewport left alone. Resizing the emulated viewport to
    // the full document height makes captureBeyondViewport downscale the
    // result instead of producing 1:1 pixels, which produced a large fake pixel
    // diff against a reference captured under different conditions.
    const h = JSON.parse(await evalIn(`JSON.stringify({h: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))})`)).h;
    const paths = JSON.parse(await evalIn(PATHS_EXPR));
    const styles = JSON.parse(await evalIn(STYLES_EXPR));
    const dom = await evalIn(`'<!DOCTYPE html>\\n' + document.documentElement.outerHTML`);
    writeFileSync(join(outDir, `${base}.html`), dom, 'utf8');
    writeFileSync(join(outDir, `${base}.styles.json`), JSON.stringify(styles), 'utf8');
    writeFileSync(join(outDir, `${base}.paths.json`), JSON.stringify(paths), 'utf8');

    const { data } = await rpc('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: true, fromSurface: true }, sessionId);
    writeFileSync(join(outDir, `${base}.png`), Buffer.from(data, 'base64'), 'base64');

    return { label, width, height: h, elements: styles.length, html: `${base}.html` };
  } finally {
    try { ws.close(); } catch { /* ignore */ }
    chrome.kill();
    await sleep(300);
  }
}

export async function serveStatic(rootDir, port) {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { extname } = await import('node:path');
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  };
  const server = createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = join(rootDir, rel === '/' ? 'index.html' : rel);
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}
