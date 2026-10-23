// Decides which CSS selectors actually match the captured reference DOM, so the
// replica ships only rules that can affect this page.
//
// Method: load the reference DOM, insert the real stylesheets, then ask the
// engine directly which selectors resolve. Each selector is evaluated on its
// own with try/catch, so one unsupported selector cannot poison a batch.
//
// Selectors that cannot match at rest (state pseudo-classes like :hover) are
// retried as stripped variants: the rule is still needed for interactive states.
// A selector counts as live if any variant matches at either supported width.
//
// Output: .verify/claudedev/rep/live-selectors.json -> [{ s, cond, live, widths }]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.cwd();
const SRC = join(ROOT, '.verify', 'claudedev');
const REP = join(SRC, 'rep');
mkdirSync(REP, { recursive: true });
const CACHE = join(REP, 'live-selectors.json');
if (existsSync(CACHE) && !process.argv.includes('--force')) {
  const l = JSON.parse(readFileSync(CACHE, 'utf8'));
  console.log(JSON.stringify({ cache: true, total: l.length, live: l.filter((r) => r.live).length }));
  process.exit(0);
}

const frozen = readFileSync(join(SRC, 'orig', 'ref1440.frozen.html'), 'utf8');
const dom = frozen.slice(frozen.indexOf('<body'), frozen.indexOf('</body>'));
const headHtml = frozen.slice(frozen.indexOf('<head>'), frozen.indexOf('</head>'));
const SHEETS = ['2firyrdw0dsae', '2sv-4d5fh1pck', '3h3wq0jc0mhco', '1l7bm09v8b8ia'];
const injected = [...headHtml.matchAll(/<style(?![^>]*__freeze__)[^>]*>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1]).filter((t) => t.trim());
const sheets = SHEETS.map((n) => ({ name: n, css: readFileSync(join(SRC, `${n}.css`), 'utf8') }));
injected.forEach((css, i) => sheets.push({ name: 'injected' + i, css }));

writeFileSync(join(REP, 'probe.html'), `<!DOCTYPE html><html><head></head>${dom}</html>`, 'utf8');

const installChunk = (cssText) => `(() => {
  const el = document.createElement('style');
  el.textContent = ${JSON.stringify(cssText)};
  document.head.appendChild(el);
  try { return document.styleSheets[document.styleSheets.length - 1].cssRules.length; }
  catch (e) { return -1; }
})()`;

// Enumerate selectors in source order. Commas split only at top level: commas
// inside :is()/:not()/:where()/:has() belong to the inner list, and splitting
// them there truncates the selector into something that never matches.
const ENUM = `(() => {
  const splitSelectorList = (text) => {
    const out = [];
    let depth = 0, buf = '', q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        buf += c;
        if (c === '\\\\') { buf += text[++i] ?? ''; }
        else if (c === q) { q = null; }
        continue;
      }
      if (c === '"' || c === "'") { q = c; buf += c; continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      if (c === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
      buf += c;
    }
    out.push(buf);
    return out;
  };
  const statePseudo = /:(hover|focus-within|focus-visible|focus|active|target|visited|link|any-link|checked|disabled|enabled|placeholder-shown|autofill|open|popover-open|modal)\\b/g;
  const stripStates = (s) => s.replace(/::[a-zA-Z-]+(\\([^)]*\\))?/g, '').replace(statePseudo, '');
  const dropNot = (s) => {
    let o = s;
    while (o.includes(':not(')) {
      const i = o.indexOf(':not(');
      let d = 0, j = i + 4, e = -1;
      for (; j < o.length; j++) {
        if (o[j] === '(') d++;
        else if (o[j] === ')') { d--; if (!d) { e = j; break; } }
      }
      if (e < 0) break;
      o = o.slice(0, i) + o.slice(e + 1);
    }
    return o;
  };
  const entries = [];
  const walk = (rules, cond) => {
    for (const r of rules) {
      if (r.selectorText !== undefined && r.style !== undefined) {
        for (const sel of splitSelectorList(String(r.selectorText))) {
          const s = sel.trim();
          if (!s) continue;
          const a = stripStates(s), b = dropNot(a);
          entries.push({ s, cond, variants: [...new Set([s, a, b])].filter(Boolean) });
        }
        continue;
      }
      let inner = null;
      try { inner = r.cssRules; } catch (e) {}
      if (inner && inner.length) {
        const own = r.conditionText || r.name || '';
        walk(inner, cond ? cond + ' && ' + own : own);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules, ''); } catch (e) {}
  }
  window.__entries = entries;
  window.__live = new Array(entries.length).fill(false);
  return JSON.stringify({ count: entries.length });
})()`;

// One call tests a contiguous slice, variant by variant, each in its own
// try/catch, and records the first variant that resolves.
const probeSlice = (start, len) => `(() => {
  const entries = window.__entries.slice(${start}, ${start + len});
  let n = 0;
  entries.forEach((e, i) => {
    for (const v of e.variants) {
      let hit = false;
      try { hit = document.querySelectorAll(v).length > 0; } catch (err) { hit = false; }
      if (hit) { window.__live[${start} + i] = true; n++; break; }
    }
  });
  return JSON.stringify(n);
})()`;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9477;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  `--user-data-dir=${join(REP, '_chrome-probe')}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
  catch { /* waiting */ }
}
if (!wsUrl) { chrome.kill(); throw new Error('no CDP endpoint'); }

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
    m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result);
  };
  ws.addEventListener('message', onMsg);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

try {
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);

  const evalIn = async (expression) => {
    const { result } = await rpc('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 700));
    return result.value;
  };

  const installed = [];
  const WIDTHS = [1440, 390];
  let entries = null;
  const liveAt = {};

  for (const w of WIDTHS) {
    await rpc('Emulation.setDeviceMetricsOverride',
      { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 700 }, sessionId);
    await rpc('Page.navigate', { url: 'file:///' + join(REP, 'probe.html').replace(/\\/g, '/') }, sessionId);
    await sleep(1200);
    for (const s of sheets) {
      const rules = await evalIn(installChunk(s.css));
      if (!installed.some((x) => x.name === s.name)) installed.push({ name: s.name, rules });
    }
    const { count } = JSON.parse(await evalIn(ENUM));
    const SLICE = 40;
    for (let start = 0; start < count; start += SLICE) {
      await evalIn(probeSlice(start, Math.min(SLICE, count - start)));
    }
    const { result: liveRaw } = await rpc('Runtime.evaluate',
      { expression: 'JSON.stringify(window.__live)', returnByValue: true }, sessionId);
    liveAt[w] = JSON.parse(liveRaw.value);
    // The engine rewrites selectors into canonical form, quoting attribute
    // values that the minified stylesheets leave bare (`[data-tpl=article]`
    // becomes `[data-tpl="article"]`). Unquote them so selectors can be
    // compared against the source text.
    const { result: er } = await rpc('Runtime.evaluate', {
      expression: `JSON.stringify(window.__entries.map(e => ({
        s: e.s, cond: e.cond,
        k: e.s.replace(/\\[([\\w-]+)=(["'])([\\w-]+)\\2\\]/g, '[$1=$3]'),
      })))`,
      returnByValue: true,
    }, sessionId);
    entries = JSON.parse(er.value);
  }

  const out = entries.map((e, i) => {
    const widths = WIDTHS.filter((w) => liveAt[w][i]);
    return { s: e.s, k: e.k || e.s, cond: e.cond, live: widths.length > 0, widths };
  });
  writeFileSync(CACHE, JSON.stringify(out), 'utf8');
  const live = out.filter((r) => r.live).length;
  for (const probeSel of ['.prose', '.rail', '.art-code', '.frow', '.tabs', '.pal-overlay']) {
    const rec = out.find((r) => r.s === probeSel);
    if (rec) console.log(`spot ${probeSel}: ${rec.live ? 'LIVE [' + rec.widths + ']' : 'dead'}`);
  }
  console.log(JSON.stringify({ installed, total: out.length, live, dead: out.length - live }, null, 2));
} finally {
  try { ws.close(); } catch {}
  chrome.kill();
}
