// Compares a replica against the reference capture: DOM shape, per-element
// geometry, computed styles, and a full-page pixel diff.
//
// Usage: node scripts/clone-claudedev-verify.mjs [--width 1440|390|all]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderPage, serveStatic, CHROME } from './lib/render.mjs';

const ROOT = process.cwd();
const SRC = join(ROOT, '.verify', 'claudedev');
const REF = join(SRC, 'orig');
const REP = join(SRC, 'rep');
mkdirSync(REP, { recursive: true });

const WIDTHS = (() => {
  const i = process.argv.indexOf('--width');
  if (i === -1) return [1440, 390];
  const v = process.argv[i + 1];
  if (v === 'all' || !v) return [1440, 390];
  return [Number(v)];
})();

const REF_URL = 'https://claude.dev/blog/building-with-claude-sonnet-5-5/';
const TOL = 2; // px: sub-pixel layout rounding

const norm = (p) => p
  .replace(/\[(\d+)\]/g, '')
  .replace(/\.on\b/g, '')
  .replace(/\.reveal-done\b/g, '')
  .replace(/\.is-in\b/g, '')
  .replace(/\.f\d+\b/g, '')
  .replace(/\.webp\b/g, '');

function diffStyles(refList, repList) {
  const repByPath = new Map();
  for (const r of repList) if (!repByPath.has(r.p)) repByPath.set(r.p, r);
  const repByNorm = new Map();
  for (const r of repList) {
    const k = norm(r.p);
    if (!repByNorm.has(k)) repByNorm.set(k, []);
    repByNorm.get(k).push(r);
  }

  const missing = [];
  const moved = [];
  const styleDiff = new Map(); // property -> {count, samples}
  let compared = 0;

  for (const ref of refList) {
    let rep = repByPath.get(ref.p);
    if (!rep) {
      // Positional variants can shift index between renders; fall back to a
      // normalised key and pick the geometry-closest candidate.
      const cands = repByNorm.get(norm(ref.p)) || [];
      if (cands.length) {
        let best = null, bestD = Infinity;
        for (const c of cands) {
          const d = Math.abs(c.b[0] - ref.b[0]) + Math.abs(c.b[1] - ref.b[1]);
          if (d < bestD) { bestD = d; best = c; }
        }
        rep = best;
      }
    }
    if (!rep) { missing.push(ref.p); continue; }
    compared++;

    const d = ref.b.map((v, i) => v - rep.b[i]);
    if (d.some((x) => Math.abs(x) > TOL)) moved.push({ p: ref.p, ref: ref.b, rep: rep.b, d });

    for (const k of Object.keys(ref)) {
      if (k === 'p' || k === 'b') continue;
      const a = String(ref[k]), b = String(rep[k]);
      // Colours and numbers can serialise slightly differently; compare the
      // leading numeric parts where both look numeric.
      if (a === b) continue;
      const near = (() => {
        const na = parseFloat(a), nb = parseFloat(b);
        if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
        return Math.abs(na - nb) <= 0.02;
      })();
      if (near) continue;
      if (!styleDiff.has(k)) styleDiff.set(k, { count: 0, samples: [] });
      const rec = styleDiff.get(k);
      rec.count++;
      if (rec.samples.length < 4) rec.samples.push({ p: ref.p, ref: a, rep: b });
    }
  }

  return {
    compared,
    refElements: refList.length,
    repElements: repList.length,
    missing: missing.slice(0, 25),
    missingCount: missing.length,
    movedCount: moved.length,
    moved: moved.sort((x, y) => Math.abs(y.d[1]) - Math.abs(x.d[1])).slice(0, 20),
    styleDiff: [...styleDiff.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 25)
      .map(([k, v]) => ({ prop: k, count: v.count, samples: v.samples })),
  };
}

/** Pixel diff via Chrome's own PNG decoder + canvas.
 *
 * `maskBands` blanks horizontal strips that hold state the page's own script
 * owns (the video caption's Play/Pause label), so a re-render difference is not
 * reported as a layout or style difference. The band is listed in the output.
 */
async function pixelDiff(aPath, bPath, port, maskBands = []) {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--user-data-dir=${join(REP, '_chrome-px')}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    await sleep(250);
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { /* waiting */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('no CDP for pixel diff'); }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  let seq = 0;
  const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const onMsg = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id !== id) return; ws.removeEventListener('message', onMsg);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result); };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  try {
    const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
    await rpc('Page.enable', {}, sessionId);
    const toDataUrl = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
    const expr = `(async () => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const A = await load(${JSON.stringify(toDataUrl(aPath))});
      const B = await load(${JSON.stringify(toDataUrl(bPath))});
      const W = Math.min(A.width, B.width), H = Math.min(A.height, B.height);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(A, 0, 0); const da = g.getImageData(0, 0, W, H).data;
      g.clearRect(0, 0, W, H); g.drawImage(B, 0, 0); const db = g.getImageData(0, 0, W, H).data;
      let diff = 0, worstRow = -1, worstRowCount = 0;
      const masked = ${JSON.stringify(maskBands)};
      const isMasked = (y) => masked.some(([a, b]) => y >= a && y < b);
      const rows = [];
      for (let y = 0; y < H; y++) {
        let rowDiff = 0;
        if (!isMasked(y)) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (da[i] !== db[i] || da[i+1] !== db[i+1] || da[i+2] !== db[i+2]) { rowDiff++; }
          }
        }
        rows.push(rowDiff);
        diff += rowDiff;
        if (rowDiff > worstRowCount) { worstRowCount = rowDiff; worstRow = y; }
      }
      const bands = [];
      const BAND = 400;
      for (let y0 = 0; y0 < H; y0 += BAND) {
        let s = 0;
        for (let y = y0; y < Math.min(y0 + BAND, H); y++) s += rows[y] || 0;
        bands.push({ y0, y1: Math.min(y0 + BAND, H), diffPx: s, pct: +(100 * s / (W * (Math.min(y0+BAND,H)-y0))).toFixed(3) });
      }
      return JSON.stringify({
        sizeRef: [A.width, A.height], sizeRep: [B.width, B.height],
        compared: [W, H], diffPx: diff, pct: +(100 * diff / (W * H)).toFixed(4),
        worstRow: { y: worstRow, diffPx: worstRowCount },
        bands: bands.filter(b => b.diffPx > 0),
      });
    })()`;
    const { result } = await rpc('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400));
    return JSON.parse(result.value);
  } finally {
    try { ws.close(); } catch { /* ignore */ }
    chrome.kill();
    await sleep(300);
  }
}

const results = {};
let port = 9520;
const server = await serveStatic(join(ROOT, 'sonnet-5-5'), 8960);

try {
  for (const width of WIDTHS) {
    const refShot = join(REF, `ref${width}.png`);
    const repShot = join(REP, `rep${width}.png`);

    const repInfo = await renderPage({
      url: server.url, outDir: REP, width, label: `rep${width}`, port: port++,
    });

    // Reference artefacts come from capture.mjs, which writes ref<width>.*
    // (the frozen DOM, computed styles, per-element paths and the full-page PNG).
    const refStylesPath = join(REF, `ref${width}.styles.json`);
    const refPathsPath = join(REF, `ref${width}.paths.json`);

    if (!existsSync(refStylesPath) || process.argv.includes('--refresh-ref')) {
      await renderPage({
        url: REF_URL, outDir: REF, width, label: `ref${width}`, port: port++, filePrefix: `ref${width}`,
      });
    }
    if (!existsSync(refPathsPath)) {
      throw new Error(`missing ${refPathsPath}; re-run capture with --refresh-ref`);
    }
    if (!existsSync(refShot)) {
      throw new Error(`missing ${refShot}; re-run capture with --refresh-ref`);
    }

    const diff = diffStyles(
      JSON.parse(readFileSync(refStylesPath, 'utf8')),
      JSON.parse(readFileSync(join(REP, `rep${width}.styles.json`), 'utf8')),
    );
    // The caption row holds a page-script-owned Play/Pause label. Both renders
    // are normalised to the same label, so the strip stays comparable; masking
    // is available via --mask-caption when investigating that band.
    const repStyles = JSON.parse(readFileSync(join(REP, `rep${width}.styles.json`), 'utf8'));
    const masks = process.argv.includes('--mask-caption')
      ? repStyles.filter((r) => /figcaption\.cap$/.test(r.p)).map((r) => [Math.max(0, r.b[1] - 2), r.b[1] + r.b[3] + 2])
      : [];
    const px = await pixelDiff(refShot, repShot, port++, masks);
    results[width] = { rep: repInfo, diff, px, maskedCaptionBands: masks };
  }
} finally {
  server.close();
}

writeFileSync(join(REP, 'verify.json'), JSON.stringify(results, null, 2), 'utf8');

for (const [w, r] of Object.entries(results)) {
  const d = r.diff, p = r.px;
  console.log(`\n===== width ${w} =====`);
  console.log(`  elements: ref=${d.refElements} rep=${d.repElements} compared=${d.compared}`);
  console.log(`  missing elements: ${d.missingCount}   geometry mismatches: ${d.movedCount}`);
  console.log(`  differing style groups: ${d.styleDiff.length}`);
  console.log(`  pixel: ref=${p.sizeRef.join('x')} rep=${p.sizeRep.join('x')} diff=${p.diffPx}px (${p.pct}%)`);
  if (r.maskedCaptionBands && r.maskedCaptionBands.length) {
    console.log(`  (masked caption band(s): ${r.maskedCaptionBands.map((b) => b.join('-')).join(', ')})`);
  }
  if (p.bands.length) {
    console.log(`  worst bands:`);
    for (const b of p.bands.sort((x, y) => y.diffPx - x.diffPx).slice(0, 6)) {
      console.log(`    y ${b.y0}-${b.y1}: ${b.diffPx}px (${b.pct}%)`);
    }
  }
  if (d.missingCount) console.log(`  first missing: ${d.missing.slice(0, 5).join(' | ')}`);
  if (d.movedCount) {
    console.log(`  biggest moves:`);
    for (const m of d.moved.slice(0, 5)) console.log(`    ${m.p.slice(-70)} ref=${m.ref.join(',')} rep=${m.rep.join(',')} d=${m.d.join(',')}`);
  }
  if (d.styleDiff.length) {
    console.log(`  top style diffs:`);
    for (const s of d.styleDiff.slice(0, 8)) {
      console.log(`    ${s.prop} x${s.count}  e.g. ${s.samples[0].ref} -> ${s.samples[0].rep}  @ ${s.samples[0].p.slice(-60)}`);
    }
  }
}
