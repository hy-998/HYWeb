// Behavioural test of the replica: drives every interaction the clone
// implements and asserts the measured values recorded from the original page
// (see rep/behavior.json and rep/behavior2.json).
//
// Usage: node scripts/clone-claudedev-behaviour.mjs
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import { serveStatic, CHROME } from './lib/render.mjs';

const REP = '.verify/claudedev/rep';
mkdirSync(REP, { recursive: true });

// Expectations taken from the live site.
const EXPECT = {
  arrowStep: 340,
  barCells: 28,
  relatedInitial: 5,
  relatedAfterLoadMore: 11,
  paletteItems: 10,
  palettePageItems: 4,
  tabs: { ALL: 5, AGENTS: 2, ENGINEERING: 4, PLAYBOOKS: 4, SKILLS: 1 },
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const server = await serveStatic(join(process.cwd(), 'sonnet-5-5'), 9041);
const PORT = 9750;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--allow-file-access-from-files',
  `--user-data-dir=${join(REP, '_chrome-bh')}`, `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch {}
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const rpc = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++seq;
  const onMsg = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.id !== id) return; ws.removeEventListener('message', onMsg);
    m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result); };
  ws.addEventListener('message', onMsg);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

try {
  const { targetId } = await rpc('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc('Target.attachToTarget', { targetId, flatten: true });
  await rpc('Page.enable', {}, sessionId);
  await rpc('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  const errors = [];
  ws.addEventListener('message', (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception?.description || '').slice(0, 140));
  });

  await rpc('Page.navigate', { url: server.url }, sessionId);
  await sleep(3500);

  const evalIn = async (expression) => {
    const { result, exceptionDetails } = await rpc('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 300));
    return result.value;
  };

  // 1. No runtime errors.
  check('page loads without script errors', errors.length === 0, errors.join(' | '));

  // Height-dependent checks run first, while the page is in its initial state:
  // later checks (LOAD MORE, video, palette) change the document height and
  // would skew a scroll-progress ratio.
  const heightAtStart = await evalIn('Math.round(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight))');

  // 2. Progress bar: cells derived from the displayed percentage.
  // Each step waits two frames, because both progress indicators update inside
  // a requestAnimationFrame callback rather than synchronously on scroll.
  const prog = JSON.parse(await evalIn(`(async () => {
    const out = [];
    const doc = document.documentElement;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const frac of [0, 0.25, 0.5, 1]) {
      // Recompute the maximum for each step: the ratio must be measured against
      // the document as it is at that moment.
      const max = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight;
      window.scrollTo({ top: Math.round(max * frac), behavior: 'instant' });
      await frame();
      const b = document.querySelector('#prog b');
      const pct = document.querySelector('#prog .pct').textContent;
      out.push({
        frac, filled: b.textContent.length, pct,
        top: document.getElementById('topProg').style.width,
        scrolledTo: Math.round(window.scrollY), max, docH: doc.scrollHeight, vh: window.innerHeight,
      });
    }
    return JSON.stringify(out);
  })()`));
  let barOk = true;
  const barDetail = [];
  for (const s of prog) {
    const pctNum = parseInt(s.pct, 10);
    const want = Math.round(EXPECT.barCells * pctNum / 100);
    if (s.filled !== want) barOk = false;
    if (s.pct !== String(pctNum).padStart(2, '0') + '%') barOk = false;
    barDetail.push(`${s.pct}->${s.filled}/${want}`);
  }
  // The rail is hidden on short viewports where there is nothing to scroll, so
  // an all-zero reading there is the page's own behaviour, not a failure.
  const barHasRange = prog.some((s) => parseInt(s.pct, 10) > 0);
  check('rail progress bar matches percentage', barOk && barHasRange,
    barDetail.join(' ') + '  | ' + prog.map((s) => `frac${s.frac}:y${s.scrolledTo}/max${s.max}`).join(' '));
  check('top progress bar tracks scroll', prog[0].top === '0%' && prog[3].top === '100%',
    `${prog[0].top} .. ${prog[3].top}`);

  // 3. Rail tree: title, active entry, and expanding sub-levels.
  const rail = JSON.parse(await evalIn(`(async () => {
    const doc = document.documentElement;
    const max = Math.max(doc.scrollHeight, document.body.scrollHeight) - innerHeight;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    for (const frac of [0, 0.05, 0.35, 0.45, 0.6, 0.8, 1]) {
      window.scrollTo({ top: Math.round(max * frac), behavior: 'instant' });
      await frame();
      // The group's open/closed state animates over 0.3s (the stylesheet
      // transitions grid-template-rows and visibility), so wait for it to settle
      // before reading computed visibility.
      await new Promise((r) => setTimeout(r, 450));
      const links = [...document.querySelectorAll('#tree a')];
      const groups = [...document.querySelectorAll('#tree .subs')];
      out.push({
        frac,
        titleOn: document.getElementById('railTitle').classList.contains('on'),
        active: links.findIndex((a) => a.classList.contains('on')),
        open: groups.map((g, i) => (g.classList.contains('open') ? i : -1)).filter((i) => i >= 0),
        expanded: [...document.querySelectorAll('#tree a[aria-expanded]')].map((a) => a.getAttribute('aria-expanded')),
        visibleSubs: groups.filter((g) => getComputedStyle(g).visibility === 'visible').length,
      });
    }
    return JSON.stringify({
      states: out,
      links: document.querySelectorAll('#tree a').length,
      groups: document.querySelectorAll('#tree .subs').length,
      subLinks: document.querySelectorAll('#tree a.sub').length,
      titleTexts: [...new Set([...document.querySelectorAll('#railTitle')].map((e) => e.textContent))],
    });
  })()`));

  // States measured on the live page at 1440x900.
  const RAIL_EXPECT = [
    { frac: 0, titleOn: false, active: 0, open: -1 },
    { frac: 0.05, titleOn: true, active: 0, open: -1 },
    { frac: 0.35, titleOn: true, active: 2, open: -1 },
    { frac: 0.45, titleOn: true, active: 4, open: 0 },
    { frac: 0.6, titleOn: true, active: 7, open: 0 },
    { frac: 0.8, titleOn: true, active: 15, open: 1 },
    { frac: 1, titleOn: true, active: 18, open: 2 },
  ];
  const railMismatch = RAIL_EXPECT.filter((want) => {
    const got = rail.states.find((s) => s.frac === want.frac);
    if (!got) return true;
    const openOk = want.open === -1 ? got.open.length === 0 : (got.open.length === 1 && got.open[0] === want.open);
    return got.titleOn !== want.titleOn || got.active !== want.active || !openOk;
  });
  check('rail tree has three sub-groups and twelve sub-links',
    rail.links === 19 && rail.groups === 3 && rail.subLinks === 12,
    `links=${rail.links} groups=${rail.groups} subs=${rail.subLinks}`);
  check('rail title, active entry and open group match the live page',
    railMismatch.length === 0,
    railMismatch.length ? JSON.stringify(railMismatch) : rail.states.map((s) => `${s.frac}:${s.active}/${s.open.join('')}`).join(' '));
  check('only the active sub-group is visible', rail.states.every((s) => s.visibleSubs === s.open.length),
    rail.states.map((s) => `${s.visibleSubs}/${s.open.length}`).join(' '));
  check('rail title text never changes', rail.titleTexts.length === 1,
    JSON.stringify(rail.titleTexts));

  // Clicking a parent link opens its group and keeps it open during the scroll.
  const toggle = JSON.parse(await evalIn(`(async () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 300));
    const parent = document.querySelector('#tree a[aria-expanded]');
    const group = parent.nextElementSibling;
    const before = { open: group.classList.contains('open'), expanded: parent.getAttribute('aria-expanded') };
    parent.click();
    await new Promise((r) => setTimeout(r, 1200));
    const after = { open: group.classList.contains('open'), expanded: parent.getAttribute('aria-expanded'),
                    visible: getComputedStyle(group).visibility };
    return JSON.stringify({ before, after });
  })()`));
  check('clicking a parent link opens and holds its sub-group',
    !toggle.before.open && toggle.after.open && toggle.after.expanded === 'true' && toggle.after.visible === 'visible',
    JSON.stringify(toggle));

  // 4. Arrow keys scroll by the measured step.
  await evalIn(`window.scrollTo({top: 2000, behavior: 'instant'});1`);
  await sleep(300);
  const before = await evalIn('Math.round(scrollY)');
  await rpc('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }, sessionId);
  await rpc('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 }, sessionId);
  await sleep(900);
  const after = await evalIn('Math.round(scrollY)');
  check('ArrowDown scrolls by the measured step', Math.abs((after - before) - EXPECT.arrowStep) <= 2,
    `${before} -> ${after} (want +${EXPECT.arrowStep})`);

  // 5. Palette opens with Ctrl/Cmd+K, filters, and closes with Escape.
  const pal = JSON.parse(await evalIn(`(async () => {
    const ov = document.querySelector('.pal-overlay');
    const before = getComputedStyle(ov).display;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    const opened = { cls: ov.className, display: getComputedStyle(ov).display };
    const items = document.querySelectorAll('.pal-item').length;
    const pages = [...document.querySelectorAll('.pal-item')].filter((e) => (e.dataset.kind || 'ARTICLE') !== 'ARTICLE').length;
    const inp = document.querySelector('.pal-input');
    inp.value = 'opus';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const visibleAfterFilter = [...document.querySelectorAll('.pal-item')].filter((e) => e.style.display !== 'none').length;
    return JSON.stringify({ before, opened, items, pages, visibleAfterFilter });
  })()`));
  check('palette opens on Ctrl/Cmd+K', pal.opened.display === 'grid' && /open/.test(pal.opened.cls),
    `${pal.before} -> ${pal.opened.display}`);
  check('palette lists 10 entries (4 pages + 6 articles)',
    pal.items === EXPECT.paletteItems && pal.pages === EXPECT.palettePageItems,
    `items=${pal.items} pages=${pal.pages}`);
  check('palette search filters entries', pal.visibleAfterFilter > 0 && pal.visibleAfterFilter < pal.items,
    `"opus" -> ${pal.visibleAfterFilter} of ${pal.items}`);

  const esc = JSON.parse(await evalIn(`(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const ov = document.querySelector('.pal-overlay');
    return JSON.stringify({ cls: ov.className, display: getComputedStyle(ov).display });
  })()`));
  check('Escape closes the palette', esc.display === 'none', `${esc.cls} / ${esc.display}`);

  // 6. Filter tabs drive the related feed.
  const tabs = JSON.parse(await evalIn(`(async () => {
    const out = {};
    for (const cat of ['ALL', 'AGENTS', 'ENGINEERING', 'PLAYBOOKS', 'SKILLS']) {
      document.querySelector('.tabs button[data-c="' + cat + '"]').click();
      await new Promise((r) => setTimeout(r, 150));
      out[cat] = document.querySelectorAll('#feed .frow').length;
    }
    return JSON.stringify(out);
  })()`));
  check('filter tabs show the expected row counts',
    Object.entries(EXPECT.tabs).every(([k, v]) => tabs[k] === v),
    JSON.stringify(tabs));

  // 7. LOAD MORE reveals the remaining rows.
  const lm = JSON.parse(await evalIn(`(async () => {
    document.querySelector('.tabs button[data-c="ALL"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const before = document.querySelectorAll('#feed .frow').length;
    document.getElementById('vm').click();
    await new Promise((r) => setTimeout(r, 150));
    return JSON.stringify({ before, after: document.querySelectorAll('#feed .frow').length,
      vmStillPresent: !!document.getElementById('vm') });
  })()`));
  check('LOAD MORE reveals all related rows',
    lm.before === EXPECT.relatedInitial && lm.after === EXPECT.relatedAfterLoadMore && lm.vmStillPresent,
    `${lm.before} -> ${lm.after}`);

  // 8. Copy button reports through the toast.
  const copy = JSON.parse(await evalIn(`(async () => {
    const toastEl = document.getElementById('toast');
    document.querySelector('.art-code button').click();
    await new Promise((r) => setTimeout(r, 400));
    return JSON.stringify({ cls: toastEl.className, text: toastEl.textContent });
  })()`));
  check('copy button reports a result via the toast', /show/.test(copy.cls) && copy.text.length > 0,
    `${copy.cls} / ${JSON.stringify(copy.text)}`);

  // 9. Video: PLAY reveals the animation and the toggle pauses/resumes.
  const video = JSON.parse(await evalIn(`(async () => {
    const fig = document.querySelector('.art-fig');
    const play = fig.querySelector('.art-anim-play');
    const v = fig.querySelector('.art-anim');
    play.click();
    await new Promise((r) => setTimeout(r, 400));
    const afterPlay = { chosen: fig.hasAttribute('data-anim-chosen'),
      playHidden: play.hasAttribute('hidden'),
      toggleHidden: fig.querySelector('.art-anim-toggle').hasAttribute('hidden') };
    const toggle = fig.querySelector('.art-anim-toggle');
    toggle.click();
    await new Promise((r) => setTimeout(r, 200));
    const afterPause = { paused: v.paused, label: toggle.textContent };
    return JSON.stringify({ afterPlay, afterPause });
  })()`));
  check('video PLAY selects the animation',
    video.afterPlay.chosen && video.afterPlay.playHidden && !video.afterPlay.toggleHidden,
    JSON.stringify(video.afterPlay));
  check('video toggle pauses playback and relabels', video.afterPause.paused && video.afterPause.label === 'Play',
    JSON.stringify(video.afterPause));

  // 10. The logo Lottie is rendered on its canvas.
  const logo = JSON.parse(await evalIn(`(() => {
    const c = document.querySelector('.clawd-clip canvas');
    if (!c) return JSON.stringify({ error: 'no canvas' });
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
    return JSON.stringify({ w: c.width, h: c.height, painted, anims: window.lottie.getRegisteredAnimations().length });
  })()`));
  check('logo Lottie paints its canvas', logo.painted > 0 && logo.anims === 1,
    `${logo.w}x${logo.h} painted=${logo.painted} anims=${logo.anims}`);

  // 11. Footer scene: the starfield draws, and the astronaut renders.
  const scene = JSON.parse(await evalIn(`(async () => {
    const doc = document.documentElement;
    const max = Math.max(doc.scrollHeight, document.body.scrollHeight) - innerHeight;
    const state = (s) => {
      const d = s.getContext('2d').getImageData(0, 0, s.width, s.height).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    };
    window.scrollTo({ top: max, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 3000));
    const sky = document.querySelector('.sky canvas');
    const stage = document.querySelector('.astro-stage canvas');
    return JSON.stringify({
      hasSceneModule: !!window.__CLONE_SCENE__,
      sceneError: window.__CLONE_SCENE_ERROR__ || null,
      skyPainted: sky ? state(sky) : null,
      skySize: sky ? [sky.width, sky.height] : null,
      stageCanvases: document.querySelectorAll('.astro-stage canvas').length,
      astronautPainted: stage ? state(stage) : null,
      stageSize: stage ? [stage.width, stage.height] : null,
      stageOpacity: getComputedStyle(document.querySelector('.astro-stage')).opacity,
    });
  })()`));
  check('footer scene loads its vendored module', scene.hasSceneModule && !scene.sceneError,
    scene.sceneError || 'ok');
  check('starfield draws into the sky canvas', scene.skyPainted > 1000, `${scene.skyPainted}px on ${JSON.stringify(scene.skySize)}`);
  check('astronaut renders on the stage canvas',
    scene.stageCanvases === 1 && scene.astronautPainted > 500 && scene.stageOpacity === '1',
    `${scene.astronautPainted}px on ${JSON.stringify(scene.stageSize)} ${scene.stageCanvases} canvas(es)`);

  // 12. The "Related posts" perch robot: it mounts while the section is in view
  //     and walks along the header. Geometry here is compared against the values
  //     measured on the live page at 1440x900.
  const perch = JSON.parse(await evalIn(`(async () => {
    const max = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight;
    let mountedSteps = 0, firstStep = null;
    for (let i = 0; i <= 40; i++) {
      window.scrollTo({ top: Math.round(max * i / 40), behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 200));
      const here = !!document.querySelector('.clawd-perch');
      if (here) { mountedSteps++; if (firstStep === null) firstStep = i; }
    }
    // Land in the window where the original keeps the robot mounted.
    window.scrollTo({ top: Math.round(max * 0.92), behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 2500));

    const el = document.querySelector('.clawd-perch');
    if (!el) return JSON.stringify({ mounted: false, mountedSteps, firstStep });

    const section = document.querySelector('.more-sec');
    const stage = el.firstElementChild;
    const box = el.getBoundingClientRect();
    const secBox = section.getBoundingClientRect();
    const holders = [...stage.children].map((h, i) => {
      const canvas = h.querySelector('canvas');
      let painted = 0;
      if (canvas) {
        try {
          const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          for (let k = 3; k < d.length; k += 4) if (d[k] > 0) painted++;
        } catch (e) { painted = -1; }
      }
      return { i, visible: getComputedStyle(h).visibility !== 'hidden',
        left: h.style.left || null, transform: getComputedStyle(h).transform, painted };
    });
    return JSON.stringify({
      mounted: true, mountedSteps, firstStep,
      left: el.style.left, top: el.style.top, height: el.style.height, zIndex: el.style.zIndex,
      offsetInSection: Math.round(box.left - secBox.left),
      width: Math.round(box.width), boxHeight: Math.round(box.height),
      stage: [Math.round(stage.getBoundingClientRect().width), Math.round(stage.getBoundingClientRect().height)],
      holderCount: holders.length,
      visibleHolders: holders.filter((h) => h.visible).length,
      paintedHolders: holders.filter((h) => h.painted > 0).length,
      mirrored: holders.some((h) => h.transform && h.transform.indexOf('-1') !== -1),
    });
  })()`));

  // Values measured on the live page for the same section at 1440x900.
  check('perch robot mounts while the related section is in view',
    perch.mounted && perch.mountedSteps > 0,
    `mounted=${perch.mounted} steps=${perch.mountedSteps} first=${perch.firstStep}`);
  check('perch sits exactly where the live page puts it',
    perch.mounted && perch.offsetInSection === 164 && perch.width === 1225 &&
    perch.boxHeight === 92 && perch.top === '-25px' && perch.height === '92px',
    `offset=${perch.offsetInSection} size=${perch.width}x${perch.boxHeight} top=${perch.top} height=${perch.height}`);
  check('perch builds six sprites and shows one of them',
    perch.mounted && perch.holderCount === 6 && perch.visibleHolders === 1,
    `holders=${perch.holderCount} visible=${perch.visibleHolders}`);
  check('perch sprites actually draw',
    perch.mounted && perch.paintedHolders >= 4,
    `${perch.paintedHolders} of ${perch.holderCount} painted`);

  // 13. Nav collapses at the measured width.
  const nav = JSON.parse(await evalIn(`(async () => {
    const out = [];
    for (const w of [1440, 1001, 1000, 390]) {
      // Resize through the visual viewport is not available here; rely on the
      // resize handler by re-running the width check the runtime uses.
      out.push({ w, expectCollapsed: w <= 1000 });
    }
    window.dispatchEvent(new Event('resize'));
    return JSON.stringify({ out, collapsedNow: document.querySelector('.nav').classList.contains('nav-collapsed'),
      veilTop: getComputedStyle(document.documentElement).getPropertyValue('--veil-top').trim(),
      navH: document.querySelector('.nav').offsetHeight });
  })()`));
  check('nav stays expanded at 1440px', nav.collapsedNow === false, `collapsed=${nav.collapsedNow}`);
  check('veil offset tracks the nav height', nav.veilTop === nav.navH + 'px', `${nav.veilTop} vs ${nav.navH}px`);

  // 12. Mobile: nav collapses and tabs overflow.
  //
  // This gets a fresh tab rather than a viewport override on the current one. A
  // mid-run override is not reliably applied once the page has been scrolled and
  // its widgets are animating, so the check would be measuring the override
  // rather than the page.
  const mobileTarget = await rpc('Target.createTarget', { url: 'about:blank' });
  const mobileSession = (await rpc('Target.attachToTarget', { targetId: mobileTarget.targetId, flatten: true })).sessionId;
  await rpc('Page.enable', {}, mobileSession);
  await rpc('Runtime.enable', {}, mobileSession);
  await rpc('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, mobileSession);
  await rpc('Page.navigate', { url: server.url }, mobileSession);
  await sleep(3500);
  const mobileEval = async (expression) => {
    const { result, exceptionDetails } = await rpc('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true }, mobileSession);
    if (exceptionDetails) throw new Error(JSON.stringify(exceptionDetails).slice(0, 200));
    return result.value;
  };
  const mob = JSON.parse(await mobileEval(`(async () => {
    const tabs = document.getElementById('tabs');
    return JSON.stringify({
      innerWidth: innerWidth,
      collapsed: document.querySelector('.nav').classList.contains('nav-collapsed'),
      burger: getComputedStyle(document.querySelector('.nav-burger')).display,
      moreWrap: !!tabs.querySelector('.tab-more-wrap'),
      visibleTabs: [...tabs.querySelectorAll('button.tab')].filter((b) => !b.closest('.tab-more-wrap') && b.offsetWidth > 0).length,
      hiddenTabs: [...tabs.querySelectorAll('button.tab')].filter((b) => !b.closest('.tab-more-wrap') && b.offsetWidth === 0).length,
      veilTop: getComputedStyle(document.documentElement).getPropertyValue('--veil-top').trim(),
      navH: document.querySelector('.nav').offsetHeight,
    });
  })()`));
  check('mobile tab uses the 390px viewport', mob.innerWidth === 390, `innerWidth=${mob.innerWidth}`);
  check('nav collapses on mobile and shows the burger', mob.collapsed && mob.burger === 'block', JSON.stringify(mob));
  check('tab row overflows into a more-menu', mob.moreWrap && mob.hiddenTabs > 0 && mob.visibleTabs === 4,
    `visible=${mob.visibleTabs} hidden=${mob.hiddenTabs}`);
  check('veil offset updates after collapsing', mob.veilTop === mob.navH + 'px', `${mob.veilTop} vs ${mob.navH}px`);

  check('no script errors during interaction', errors.length === 0, errors.join(' | '));
} finally {
  try { ws.close(); } catch {}
  chrome.kill();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} behaviour checks passed`);
if (failed.length) {
  console.log('failed: ' + failed.map((f) => f.name).join('; '));
  process.exitCode = 1;
}
