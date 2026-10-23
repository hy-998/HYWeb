// Builds the standalone replica of claude.dev/blog/building-with-claude-sonnet-5-5/
// from the real site sources mirrored into .verify/claudedev.
//
// Inputs (verbatim from claude.dev):
//   post.html                     server HTML
//   orig/ref1440.frozen.html      post-hydration DOM, frozen and deterministic
//   *.css                         the stylesheets the page loads
//   rep/live-selectors.json       which selectors resolve against that DOM
//   fonts/  clawd-mark.png  favicon.svg  hero.jpg  anim.mp4
//
// Output: sonnet-5-5/{index.html, clone.js, assets/**}
//
// Nothing here is rewritten by hand: markup, CSS, fonts and media are the
// original bytes with paths re-pointed at the local tree. clone.js is the only
// authored file, and it re-implements the page's runtime behaviour.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, '.verify', 'claudedev');
const OUT = join(ROOT, 'sonnet-5-5');
const A = (...p) => join(SRC, ...p);
const ensure = (p) => mkdirSync(p, { recursive: true });

// ------------------------------------------------------------ CSS pruning
// ------------------------------------------------------------------ CSS
// All four upstream sheets ship verbatim (see where SHEETS is read below).
//
// A selector-pruning pass used to live here, along with the CSS parser needed to
// support it. It was removed because a sheet can contribute only inside a media
// query or a @scope, so "does any selector match at 1440px in the saved DOM" is
// the wrong test — dropping a sheet that way silently broke every other
// breakpoint. Shipping the originals also removes any risk of a false negative
// hiding a rule the page actually needs.

// ------------------------------------------------------------------ build
const report = { sheets: {} };

const frozen = readFileSync(A('orig', 'ref1440.frozen.html'), 'utf8');
const headHtml = frozen.slice(frozen.indexOf('<head>'), frozen.indexOf('</head>'));
const bodyHtml = frozen.slice(frozen.indexOf('<body'), frozen.indexOf('</body>'));

// Cascade order is exactly what the real page loads.
const SHEETS = ['2firyrdw0dsae', '2sv-4d5fh1pck', '3h3wq0jc0mhco', '1l7bm09v8b8ia'];
// Next.js injects two style tags at hydration. The palette styles are a real
// feature (the ⌘K overlay), so they ship too.
const injectedStyles = [...headHtml.matchAll(/<style(?![^>]*__freeze__)[^>]*>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1]).filter((t) => t.trim());

// All four upstream sheets ship. They are the design system this page is built
// from: a sheet can contribute only inside a media query or a `@scope`, so
// "does any selector match at 1440px in the frozen DOM" is the wrong question,
// and dropping one silently breaks other breakpoints. Measured cost of keeping
// all four is ~95 KB of CSS for a pixel-accurate result.
let css = '/* claude.dev article styles: the page\'s own stylesheets, in cascade\n' +
  '   order, with asset paths pointed at the local tree. */\n';
for (const name of SHEETS) {
  const raw = readFileSync(A(`${name}.css`), 'utf8');
  css += `\n/* ${name}.css */\n` + raw + '\n';
  report.sheets[name] = { kept: true, sourceBytes: raw.length };
}
injectedStyles.forEach((s, i) => {
  css += `\n/* injected at hydration ${i} */\n` + s + '\n';
  report.sheets[`injected${i}`] = { kept: true, sourceBytes: s.length };
});

// The footer scene (starfield + the animated Clawd astronaut) ships as the
// site's own lazy chunk, vendored verbatim and wrapped so it can be invoked by
// the local loader. Reimplementing that noise field and actor system would only
// approximate it; running the original code does not.
// The logo is a Lottie animation drawn onto a canvas (the <img> beside it is
// visibility:hidden). The page loads lottie_canvas.min.js from its vendor
// directory, so the clone ships the same library and draws the same frame.
const lottieLib = readFileSync(A('vendor', 'lottie_canvas.min.js'), 'utf8');
const lottieAnim = readFileSync(A('rep', 'lottie', 'clawd-anim.json'), 'utf8');
report.lottieLibBytes = Buffer.byteLength(lottieLib);
report.lottieAnimBytes = Buffer.byteLength(lottieAnim);

// The page's runtime widgets: the footer scene (starfield plus the Clawd
// astronaut) and the "Related posts" perch robot. Both ship as the site's own
// lazy bundles, vendored verbatim; the loader supplies the module plumbing they
// expect. Reimplementing that noise field, the actor system and the perch's
// animation library could only approximate them.
const sceneChunk = readFileSync(A('vendor', '3ap3r640smdew.js'), 'utf8');
const perchChunk = readFileSync(A('vendor', '0swczvabs4cv9.js'), 'utf8');
report.sceneChunkBytes = Buffer.byteLength(sceneChunk);
report.perchChunkBytes = Buffer.byteLength(perchChunk);

// The animations those widgets play. They ask lottie for each movement by URL,
// which cannot work from disk, so every animation the page can request is
// embedded as data and the loader answers from this set.
const ANIM_DIR = A('rep', 'anim');
const ANIM_PATHS = {
  'clawd-walking.json': '/shared/video/clawd-walking.json',
  'clawd-looking.json': '/shared/video/clawd-looking.json',
  'clawd-waving.json': '/shared/video/clawd-waving.json',
  'Clawd-Turning.json': '/shared/video/acts/Clawd-Turning.json',
  'Clawd-Jumping.json': '/shared/video/acts/Clawd-Jumping.json',
  'Clawd-JumpingHappy.json': '/shared/video/acts/Clawd-JumpingHappy.json',
  'Clawd-Dancing.json': '/shared/video/acts/Clawd-Dancing.json',
  'Clawd-DancingHappy.json': '/shared/video/acts/Clawd-DancingHappy.json',
  'Clawd-BreakDancing.json': '/shared/video/acts/Clawd-BreakDancing.json',
  'Clawd-Confetti.json': '/shared/video/acts/Clawd-Confetti.json',
  'Clawd-ConfettiHappy.json': '/shared/video/acts/Clawd-ConfettiHappy.json',
};
const spriteNames = {};
const spritePaths = {};
for (const file of Object.keys(ANIM_PATHS)) {
  const json = readFileSync(join(ANIM_DIR, file), 'utf8');
  const parsed = JSON.parse(json);
  spriteNames[parsed.nm || file.replace(/\.json$/, '')] = parsed;
  spritePaths[ANIM_PATHS[file]] = parsed.nm || file.replace(/\.json$/, '');
}
report.spriteCount = Object.keys(spriteNames).length;

// Re-point every site-absolute asset reference at the local tree.
const repath = (s) => s
  .replace(/url\(\s*\/shared\/fonts\//g, 'url(../fonts/')
  .replace(/\/shared\/fonts\//g, '../fonts/')
  .replace(/url\(\s*["']?\/media\//g, "url('../media/")
  .replace(/\/shared\/img\//g, '../img/')
  .replace(/(["'(])\/media\//g, '$1../media/');
const cssOut = repath(css);

// ----------------------------------------------------------------- markup
// Keep every real page node, not just the ones inside <div id="app">: the page
// also ends with <div id="veil">, <div id="toast"> and the ⌘K palette overlay,
// which live as siblings after the app div. Only scripts are removed.
//
// Scripts are matched as whole elements (attribute-aware, bracket-aware) rather
// than with a regex, because the Next.js runtime ships inline JSON containing
// script-like text.
function stripScripts(html) {
  let out = '', i = 0;
  while (i < html.length) {
    const open = html.indexOf('<script', i);
    if (open === -1) { out += html.slice(i); break; }
    // Find the end of the opening tag, honouring quoted attribute values.
    let j = open + 7, q = null, tagEnd = -1;
    for (; j < html.length; j++) {
      const c = html[j];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '>') { tagEnd = j; break; }
    }
    if (tagEnd === -1) { out += html.slice(i); break; }
    const close = html.indexOf('</script>', tagEnd + 1);
    out += html.slice(i, open);
    i = close === -1 ? html.length : close + '</script>'.length;
  }
  return out;
}

let body = stripScripts(bodyHtml)
  .replace(/^<body[^>]*>/, '')
  .replace(/<\/body>\s*$/, '')
  .replace(/<\/?template[^>]*>/g, '')
  .replace(/\s*<style[^>]*>[\s\S]*?<\/style>/g, '')  // capture-time freeze shim
  .replace(/\s*<next-route-announcer[^>]*>\s*<\/next-route-announcer>/g, '') // Next.js internal
  .replace(/<!--\$\$?-->/g, '')
  .trim();

// The capture froze the page after its entrance animation and after the scroll
// handlers had run, which baked runtime state into the markup. Remove it so the
// shipped page starts in the state a first-time visitor actually sees, and let
// clone.js own everything that depends on scroll position or animation:
//   is-in / reveal-done  entrance-animation bookkeeping
//   .on on tree links    active section highlight
//   .on on filter tabs   restored to ALL
//   #topProg / #prog b   scroll-progress indicators
const stripState = (html) => html
  .replace(/\sclass="([^"]*)"/g, (m, cls) => {
    const keep = cls.split(/\s+/).filter((c) => c && c !== 'is-in' && c !== 'reveal-done');
    return keep.length ? ` class="${keep.join(' ')}"` : '';
  })
  .replace(/(<a href="#[^"]*"[^>]*?)\sclass="on"/g, '$1')
  .replace(/(<div id="topProg"[^>]*?)\sstyle="[^"]*"/g, '$1')
  .replace(/(<b)(\sstyle="[^"]*")?(><\/b>)/g, '$1$3');
body = stripState(body);

// The filter tabs and the tree highlight are recomputed on load; reset the
// hardcoded markup so the first paint has no stale selection.
body = body
  .replace(/(<button class="tab) on(")/g, '$1$2')
  .replace(/<span data-tab="([^"]*)" class="on">/g, '<span data-tab="$1" class="">')
  .replace(/(<figure class="art-fig[^"]*") data-anim-chosen=""/g, '$1')
  .replace(/(<video class="art-anim"[^>]*?)\sautoplay(="")?/g, '$1');

// --------------------------------------------------------------- rail tree
// The saved DOM ships only the seven top-level section links. The page builds
// the sub-level links at runtime, so the full tree (seven parents plus twelve
// sub-links in three collapsible groups) is taken from the live page and spliced
// in here. Runtime state — the active link and which group is open — is left to
// clone.js, so this markup ships inert.
const TREE = readFileSync(A('rep', 'tree.html'), 'utf8');
const treeInert = TREE
  .replace(/\sclass="(on|)"(?=[ >])/g, '')
  .replace(/\saria-expanded="(true|false)"/g, '');
body = body.replace(/<div id="tree">[\s\S]*?<\/div>(?=<\/aside>|<div class="prog")/, treeInert);
if (!body.includes('class="subs"')) {
  throw new Error('rail tree splice failed: no sub-groups in the built markup');
}

// Tag each palette entry with the kind its markup displays, so the runtime can
// filter by tab without re-reading label text.
//
// Approach: cut out the palette list region, split it on entry boundaries, then
// rewrite each entry's opening tag. Splitting on a literal boundary avoids
// relying on lookahead, which is easy to get subtly wrong here.
const CAT_BY_TITLE = new Map();
for (const p of JSON.parse(readFileSync(A('rep', 'roster.json'), 'utf8'))) {
  CAT_BY_TITLE.set(p.title, p.cat.toUpperCase());
}
const EMPTY = '\u0000';
let paletteTagged = 0;
{
  const listStart = body.indexOf('<div class="pal-list"');
  const listEnd = body.indexOf('<div class="pal-foot"');
  if (listStart !== -1 && listEnd > listStart) {
    const region = body.slice(listStart, listEnd);
    const parts = region.split('<div class="pal-item');
    const rebuilt = parts.map((part, index) => {
      if (index === 0) return part;                       // the pal-list opener
      // Real tag end: the class attribute itself contains no '>', so locate the
      // closing bracket the unambiguous way instead of by first '>' (which
      // would land inside the class value).
      const tagEnd = part.search(/>\s*(?:\n|<)/);
      const inner = tagEnd === -1 ? part : part.slice(tagEnd + 1);
      const kind = (/<span class="kind">([^<]*)<\/span>/.exec(inner) || [, 'ARTICLE'])[1].trim().toUpperCase();
      const nm = (/<span class="nm">([^<]*)<\/span>/.exec(inner) || [, ''])[1];
      const cat = CAT_BY_TITLE.get(nm);
      const opening = (tagEnd === -1 ? part : part.slice(0, tagEnd)).trimEnd();
      const rest = tagEnd === -1 ? '' : part.slice(tagEnd + 1);
      paletteTagged++;
      return opening + ` data-kind="${kind}"` + (cat ? ` data-cat="${cat}"` : '') + '>' + rest;
    });
    body = body.slice(0, listStart) + rebuilt.join('<div class="pal-item') + body.slice(listEnd);
  }
}

// --------------------------------------------------------------- markup paths
// Re-point the page's own asset references at the local tree.
//
// Some of the body has already been through the CSS re-pather above, which is
// why both the site-absolute and the `../` spellings are listed: the CSS rules
// need paths relative to assets/css/, but markup needs paths relative to the
// site root. Every entry is mapped explicitly so nothing depends on which pass
// touched a given URL.
const MARKUP_ASSETS = [
  ['assets/media/63c0bb81af17992642b05cdd8eb1d21a252a79c897ada4de85aeb93b6afc0aed.mp4', 'assets/media/demo.mp4'],
  ['../media/63c0bb81af17992642b05cdd8eb1d21a252a79c897ada4de85aeb93b6afc0aed.mp4', 'assets/media/demo.mp4'],
  ['/media/63c0bb81af17992642b05cdd8eb1d21a252a79c897ada4de85aeb93b6afc0aed.mp4', 'assets/media/demo.mp4'],
  ['assets/media/dca9efdc2515061f31f7244c9c4825c7e29f9e8d9b0b0da5e1259a4bca669d3d.jpg', 'assets/img/hero-poster.jpg'],
  ['../media/dca9efdc2515061f31f7244c9c4825c7e29f9e8d9b0b0da5e1259a4bca669d3d.jpg', 'assets/img/hero-poster.jpg'],
  ['/media/dca9efdc2515061f31f7244c9c4825c7e29f9e8d9b0b0da5e1259a4bca669d3d.jpg', 'assets/img/hero-poster.jpg'],
  ['assets/img/clawd-mark.png', 'assets/img/clawd-mark.png'],
  ['../img/clawd-mark.png', 'assets/img/clawd-mark.png'],
  ['/shared/img/clawd-mark.png', 'assets/img/clawd-mark.png'],
  ['assets/img/favicon.svg', 'assets/img/favicon.svg'],
  ['../img/favicon.svg', 'assets/img/favicon.svg'],
  ['/shared/img/favicon.svg', 'assets/img/favicon.svg'],
  ['assets/img/anthropic-logo.svg', 'assets/img/anthropic-logo.svg'],
  ['../img/anthropic-logo.svg', 'assets/img/anthropic-logo.svg'],
  ['/shared/img/anthropic-logo.svg', 'assets/img/anthropic-logo.svg'],
];
const repathMarkup = (markup) => {
  let out = markup;
  for (const [from, to] of MARKUP_ASSETS) out = out.replaceAll(from, to);
  return out;
};

const html = repathMarkup(`<!DOCTYPE html>
<html lang="en" data-pg="article">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Building with Claude Sonnet 5.5 / claude.dev Blog</title>
<meta name="description" content="When to choose Sonnet over Opus, what it costs, and how to tune it.">
<meta name="author" content="Addy Osmani">
<meta name="theme-color" content="#141413" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#faf9f5" media="(prefers-color-scheme: light)">
<meta property="og:title" content="Building with Claude Sonnet 5.5 / claude.dev Blog">
<meta property="og:description" content="When to choose Sonnet over Opus, what it costs, and how to tune it.">
<meta property="og:type" content="article">
<meta property="og:site_name" content="claude.dev Blog">
<meta property="article:published_time" content="2026-09-28">
<meta property="article:author" content="Addy Osmani">
<meta property="article:section" content="Playbooks">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Building with Claude Sonnet 5.5 / claude.dev Blog">
<meta name="twitter:description" content="When to choose Sonnet over Opus, what it costs, and how to tune it.">
<link rel="canonical" href="https://claude.dev/blog/building-with-claude-sonnet-5-5/">
<link rel="icon" href="assets/img/favicon.svg">
<link rel="preload" href="assets/fonts/AnthropicSans-Roman-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/AnthropicMono-Roman-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="assets/css/site.css">
</head>
<body>
${body}
<script src="assets/vendor/lottie_canvas.min.js"></script>
<script src="assets/data/clawd-anim.js"></script>
<script src="assets/data/sprites.js"></script>
<script src="assets/vendor/sprite-loader.js"></script>
<script src="assets/vendor/scene-chunk.js"></script>
<script src="assets/vendor/perch-chunk.js"></script>
<script src="assets/vendor/scene-loader.js"></script>
<script src="assets/data/posts.js"></script>
<script src="clone.js"></script>
</body>
</html>
`);

// ------------------------------------------------------------------ write
ensure(join(OUT, 'assets', 'css'));
ensure(join(OUT, 'assets', 'fonts'));
ensure(join(OUT, 'assets', 'img'));
ensure(join(OUT, 'assets', 'media'));
ensure(join(OUT, 'assets', 'data'));
ensure(join(OUT, 'assets', 'vendor'));
writeFileSync(join(OUT, 'assets', 'vendor', 'lottie_canvas.min.js'), lottieLib, 'utf8');
// The scene chunk is wrapped in a function so the loader can invoke it and
// capture the module it registers, instead of it registering itself against a
// page runtime that the replica does not have.
writeFileSync(
  join(OUT, 'assets', 'vendor', 'scene-chunk.js'),
  '/* claude.dev footer scene chunk, vendored verbatim and wrapped so the local\n' +
  '   loader can invoke it. Contains the starfield field generator, the space\n' +
  '   bodies and the Clawd astronaut actor. */\n' +
  'window.__CLONE_SCENE_CHUNK__ = function () {\n' + sceneChunk + '\n};\n',
  'utf8',
);
writeFileSync(
  join(OUT, 'assets', 'vendor', 'perch-chunk.js'),
  '/* claude.dev perch chunk, vendored verbatim and wrapped so the local loader\n' +
  '   can invoke it. Contains the "Related posts" mascot: it walks along the\n' +
  '   section header, perches on the label, and plays the act animations. */\n' +
  'window.__CLONE_PERCH_CHUNK__ = function () {\n' + perchChunk + '\n};\n',
  'utf8',
);
// The animation data is embedded rather than left as JSON files: the page must
// also work when opened directly from disk, where fetching a local file is
// blocked by the browser.
writeFileSync(
  join(OUT, 'assets', 'data', 'sprites.js'),
  '/* The Clawd animations the page widgets play, as served by the original\n' +
  '   page. Assigned to a global so file:// usage works too. */\n' +
  'window.__CLONE_SPRITES__ = {\n' +
  '  files: ' + JSON.stringify(spriteNames) + ',\n' +
  '  paths: ' + JSON.stringify(spritePaths) + '\n' +
  '};\n',
  'utf8',
);
// The animation data is embedded in a script rather than left as JSON: the page
// must also work when opened directly from disk, where fetch() of a local file
// is blocked. Assigning a global in a <script> has no such restriction.
writeFileSync(
  join(OUT, 'assets', 'data', 'clawd-anim.js'),
  '/* Lottie logo animation "Clawd-LookingAroundEyesOnly", as served by the\n' +
  '   original page. Assigned to a global so file:// usage works too. */\n' +
  'window.__CLONE_CLAWD_ANIM__ = ' + lottieAnim + ';\n',
  'utf8',
);
writeFileSync(join(OUT, 'assets', 'css', 'site.css'), cssOut, 'utf8');
for (const f of readdirSync(A('fonts'))) copyFileSync(A('fonts', f), join(OUT, 'assets', 'fonts', f));
copyFileSync(A('clawd-mark.png'), join(OUT, 'assets', 'img', 'clawd-mark.png'));
copyFileSync(A('favicon.svg'), join(OUT, 'assets', 'img', 'favicon.svg'));
copyFileSync(A('anthropic-logo.svg'), join(OUT, 'assets', 'img', 'anthropic-logo.svg'));
copyFileSync(A('hero.jpg'), join(OUT, 'assets', 'img', 'hero-poster.jpg'));
copyFileSync(A('anim.mp4'), join(OUT, 'assets', 'media', 'demo.mp4'));

const idx = join(OUT, 'index.html');
const outHtml = html;
writeFileSync(idx, outHtml, 'utf8');

report.htmlBytes = Buffer.byteLength(outHtml);
report.cssBytes = Buffer.byteLength(cssOut);
report.paletteEntriesTagged = paletteTagged;
report.leftoverSiteUrls = [...outHtml.matchAll(/(?:https:\/\/claude\.dev)?\/(_next|shared|media)\//g)]
  .map((m) => m[0]).slice(0, 10);
mkdirSync(join(REP_DIR(), ''), { recursive: true });
function REP_DIR() { return join(SRC, 'rep'); }
writeFileSync(join(SRC, 'rep', 'build-report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
  html: report.htmlBytes,
  css: report.cssBytes,
  htmlBytesSource: Buffer.byteLength(bodyHtml),
  cssBytesSource: SHEETS.reduce((n, s) => n + readFileSync(A(`${s}.css`)).length, 0),
  sheets: report.sheets,
  paletteEntriesTagged: report.paletteEntriesTagged,
  lottieLibBytes: report.lottieLibBytes,
  lottieAnimBytes: report.lottieAnimBytes,
  leftoverSiteUrls: report.leftoverSiteUrls,
}, null, 2));
