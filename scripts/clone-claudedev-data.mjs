// Generates the data module the replica's script loads.
//
// Two orderings are needed, and they differ on the live site, so both are taken
// from the page's own artefacts rather than re-derived by a guessed rule:
//
//   relatedOrder  the "Related posts" feed order. Read from the rendered feed in
//                 the captured markup (the site's own initial render).
//   posts         the roster order, read from the page's Next.js payload. This
//                 drives the ⌘K palette, which uses the payload order.
//
// Deriving a sort rule would be guesswork: for the two Sep 25 posts the feed
// puts "Using Claude Code: Spending your effort" first while the payload puts
// "What a task costs on Opus 5.5" first.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, '.verify', 'claudedev');
const OUT = join(ROOT, 'sonnet-5-5');

const roster = JSON.parse(readFileSync(join(SRC, 'rep', 'roster.json'), 'utf8'));
const posts = roster.map((r) => ({
  slug: r.slug, title: r.title, cat: r.cat, date: r.date, mins: r.mins,
}));

// Capture the feed order from the frozen markup written by .verify/claudedev/capture.mjs,
// which covers only the rows the page renders up front (5 of them). The
// remainder of the order is taken from the payload, already newest-first there.
const frozen = readFileSync(join(SRC, 'orig', 'ref1440.frozen.html'), 'utf8');
const feedStart = frozen.indexOf('<div id="feed"');
const feed = frozen.slice(feedStart, frozen.indexOf('</div>', frozen.indexOf('</a>', feedStart)));
const relatedTitles = [...feed.matchAll(/<span class="f-t">([^<]*)<\/span>/g)].map((m) => m[1]);
const byTitle = new Map(posts.map((p) => [p.title, p.slug]));
const missing = relatedTitles.filter((t) => !byTitle.has(t));
if (missing.length) throw new Error('feed titles not in roster: ' + missing.join(' | '));

// Newest-first by date, with the feed's own order used to break same-day ties.
const feedRank = new Map(relatedTitles.map((t, i) => [byTitle.get(t), i]));
const ordered = posts.slice().sort((a, b) => {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const ra = feedRank.has(a.slug) ? feedRank.get(a.slug) : 99;
  const rb = feedRank.has(b.slug) ? feedRank.get(b.slug) : 99;
  return ra - rb;
});
const allOrder = ordered.map((p) => p.slug);

mkdirSync(join(OUT, 'assets', 'data'), { recursive: true });
const body = `/* claude.dev post data, read from the page's own payload and markup.
   Consumed by clone.js for the filter tabs, the LOAD MORE list and the ⌘K
   palette search.

   allOrder is the full newest-first sequence used by the related feed and its
   category tabs, with the current article excluded. The first five entries are
   the rows the page renders up front, taken from the rendered feed; the rest
   follow the payload's order. */
window.__CLONE_POSTS__ = {
  current: "building-with-claude-sonnet-5-5",
  relatedLimit: ${relatedTitles.length},
  allOrder: ${JSON.stringify(allOrder, null, 2)},
  posts: ${JSON.stringify(posts, null, 2)},
};
`;
writeFileSync(join(OUT, 'assets', 'data', 'posts.js'), body, 'utf8');
console.log(`posts.js: ${posts.length} posts, ${allOrder.length} in feed order, ${Buffer.byteLength(body)} bytes`);
console.log('feed order:', allOrder.join(', '));
console.log('categories:', [...new Set(posts.map((p) => p.cat))].join(', '));
const byCat = {};
for (const p of posts) {
  if (p.slug === 'building-with-claude-sonnet-5-5') continue;
  byCat[p.cat] = (byCat[p.cat] || 0) + 1;
}
console.log('per-category counts (excluding current):', JSON.stringify(byCat));
