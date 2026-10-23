// Verifies the octopus page: the six printed pieces are on it, the animated
// styles still work below, and the zoom works.
//
// Served over HTTP rather than opened from disk: a canvas that has drawn a
// file:// image is tainted, so getImageData would throw and the pixel checks
// would be measuring a security error instead of the artwork.
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serveStatic } from '../../scripts/lib/render.mjs';
import { connect } from '../../.verify/claudedev/lib/cdp.mjs';

const OUT = 'octopus/.shots';
mkdirSync(OUT, { recursive: true });
const server = await serveStatic(join(process.cwd(), 'octopus'), 9140);

const cdp = await connect({ port: 10500, profile: '_chrome-octp', width: 1100, height: 1500 });
try {
  await cdp.rpc('Page.navigate', { url: server.url }, cdp.sessionId);
  await cdp.sleep(3000);

  console.log('=== printed pieces ===');
  const pieces = await cdp.json(`JSON.stringify({
    figures: document.querySelectorAll('#gallery figure').length,
    captions: [...document.querySelectorAll('#gallery figcaption')].map((c) => c.textContent.trim()),
  })`);
  console.log(`  ${pieces.figures} figures`);
  for (const c of pieces.captions) console.log('    ' + c);

  // Each print must actually be decoded and have real size, not a broken image.
  console.log('\n=== images decode ===');
  const imgs = await cdp.json(`JSON.stringify([...document.querySelectorAll('#gallery img')].map((i) => ({
    src: i.getAttribute('src').replace('assets/', ''),
    w: i.naturalWidth, h: i.naturalHeight, complete: i.complete,
  })))`);
  let allOk = true;
  for (const i of imgs) {
    const ok = i.complete && i.w === 512 && i.h === 512;
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${i.src.padEnd(20)} ${i.w}x${i.h}`);
  }

  console.log('\n=== zoom ===');
  await cdp.evaluate(`document.querySelector('#gallery img').click(); 1`);
  await cdp.sleep(400);
  const zoomed = await cdp.json(`JSON.stringify({
    open: document.getElementById('zoom').classList.contains('open'),
    src: document.getElementById('zoom').querySelector('img').getAttribute('src'),
  })`);
  console.log(`  open=${zoomed.open} src=${zoomed.src}`);
  await cdp.evaluate(`document.getElementById('zoom').click(); 1`);
  await cdp.sleep(300);
  const closed = await cdp.evaluate(`document.getElementById('zoom').classList.contains('open')`);
  console.log(`  closes on click: ${closed === false}`);

  console.log('\n=== animated styles below ===');
  const styles = await cdp.json(`JSON.stringify([...document.querySelectorAll('#styles button')].map((b) => b.dataset.s))`);
  console.log(`  ${styles.length} buttons: ${styles.join(', ')}`);
  const painted = async () => {
    const raw = await cdp.evaluate(`(function () {
      const c = document.getElementById('c');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0, sum = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) { n++; sum += d[i] + d[i + 1] + d[i + 2]; }
      return JSON.stringify({ painted: n, sum: sum });
    }())`);
    return JSON.parse(raw);
  };
  for (const id of styles) {
    await cdp.evaluate(`document.querySelector('#styles button[data-s="${id}"]').click(); 1`);
    await cdp.sleep(420);
    const a = await painted();
    await cdp.sleep(320);
    const b = await painted();
    const ok = a.painted > 100000 && a.sum !== b.sum;
    if (!ok) allOk = false;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${id.padEnd(10)} painted=${a.painted}`);
  }

  const shot = await cdp.rpc('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true }, cdp.sessionId);
  writeFileSync(join(OUT, 'page.png'), Buffer.from(shot.data, 'base64'), 'base64');
  console.log('\nwrote .shots/page.png');

  console.log('\nerrors:');
  console.log(cdp.errors.length ? cdp.errors.join('\n') : '  none');
  if (!allOk) process.exitCode = 1;
} finally { cdp.close(); server.close(); }
