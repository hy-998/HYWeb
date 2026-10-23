/* claude.dev article page behaviour — a clone of the site's own runtime.
 *
 * Everything here reproduces a measured behaviour of the original page:
 *
 *   top progress bar   fixed 1px line, width = scroll progress
 *   rail progress      "▓"xN + "░"xM + NN%, 28 cells, one glyph per 1/28
 *   section highlight  the last section whose top has passed 1/3 viewport
 *   arrow keys         ±340px (ArrowUp / ArrowDown)
 *   ⌘K / Ctrl-K        opens the finder palette, Esc closes it
 *   palette search     filters items, ↑/↓ move the selection, ↵ opens
 *   related feed       tabs filter by category, LOAD MORE reveals the rest
 *   video              poster still, centre PLAY pill, Pause/Play toggle
 *   copy buttons       write the snippet, report the result via #toast
 *   entrance reveal    sections fade up as they enter the viewport
 *
 * The CSS is the site's own, so this file only sets state that the stylesheets
 * expect: classes `.on`, `.sel`, `.is-in`, `.reveal-done`, `#veil.on`,
 * `#toast.show`, `.pal-overlay.open.in.closing`, `[data-anim-chosen]`, and the
 * inline widths on the two progress elements.
 */
(function () {
  'use strict';

  var ARROW_STEP = 340;      // measured: one ArrowDown moved scrollY 340px
  var BAR_CELLS = 28;        // measured: 28 glyphs between the bar and the "NN%"
  var FILLED = '\u2593';     // ▓
  var EMPTY = '\u2591';      // ░
  var RELATED_LIMIT = 5;     // measured: the feed starts with 5 rows
  var PALETTE_ARTICLES = 6;  // measured: the palette lists 4 pages + 6 articles
  var NAV_COLLAPSE_W = 1000; // measured: the original collapses its nav at <=1000px

  var POSTS = (window.__CLONE_POSTS__ || { posts: [], current: '', allOrder: [] });
  var CURRENT = POSTS.current;
  var LIMIT = POSTS.relatedLimit || RELATED_LIMIT;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // The related feed covers every post except the one being read, newest first.
  // Its order is the payload's, except for the posts the page renders up front,
  // whose order is taken from the page's own markup (it differs from the
  // payload for same-day posts). Falls back to payload order when unavailable.
  var related = (function () {
    var bySlug = {};
    POSTS.posts.forEach(function (p) { bySlug[p.slug] = p; });
    var order = POSTS.allOrder;
    var list = order && order.length
      ? order.map(function (s) { return bySlug[s]; }).filter(Boolean)
      : POSTS.posts.slice();
    var seen = {};
    return list.filter(function (p) {
      if (!p || p.slug === CURRENT || seen[p.slug]) return false;
      seen[p.slug] = true;
      return true;
    });
  })();

  // A category tab shows every post in that category; ALL shows the first five
  // until LOAD MORE reveals the rest.
  function feedLimitFor(cat) {
    if (feedAll) return Infinity;
    return cat === 'ALL' ? LIMIT : Infinity;
  }

  var feedAll = false;
  var feedCat = 'ALL';
  var paletteCat = 'ALL';
  var paletteSel = 0;
  var railTitle = null;

  function formatDate(iso) {
    var parts = String(iso).split('-');
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }

  /**
   * Scroll a rail link's target into view. The stylesheet's scroll-margin-top
   * keeps the heading clear of the sticky nav; the hash is updated without
   * letting the browser jump, so the scroll stays smooth.
   */
  function scrollToSection(href) {
    if (!href) return;
    var id = decodeURIComponent(href.slice(1));
    var target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    else window.location.hash = id;
  }

  function relatedFor(cat) {
    if (!cat || cat === 'ALL') return related;
    return related.filter(function (p) { return p.cat.toUpperCase() === cat.toUpperCase(); });
  }

  // ------------------------------------------------------------ progress
  function scrollProgress() {
    var doc = document.documentElement;
    var max = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight;
    if (max <= 0) return 1;
    return Math.min(1, Math.max(0, window.pageYOffset / max));
  }

  function renderProgress() {
    var p = scrollProgress();

    var top = document.getElementById('topProg');
    if (top) top.style.width = (p * 100) + '%';

    var prog = document.getElementById('prog');
    if (!prog) return;
    var bar = prog.querySelector('b');
    var pct = prog.querySelector('.pct');
    // The fill tracks the displayed percentage, so the glyphs and the number
    // always agree (measured against the original at every scroll position).
    var pctValue = Math.round(p * 100);
    var cells = Math.max(0, Math.min(BAR_CELLS, Math.round(BAR_CELLS * pctValue / 100)));
    if (bar) bar.textContent = new Array(cells + 1).join(FILLED);
    // Padded to two characters, but 100 must stay three: a two-character slice
    // would turn 100 into "00".
    if (pct) pct.textContent = (pctValue < 10 ? '0' + pctValue : String(pctValue)) + '%';
    // The empty cells live in a text node between <b> and <span class="pct">.
    for (var i = 0; i < prog.childNodes.length; i++) {
      var n = prog.childNodes[i];
      if (n.nodeType === 3 && n.nodeValue.indexOf(EMPTY) !== -1) {
        n.nodeValue = new Array(BAR_CELLS - cells + 1).join(EMPTY);
        break;
      }
    }
  }

  /**
   * Rail state, all driven by the same scroll pass:
   *
   *   title    fades in once the hero has scrolled past — measured on the live
   *            page as scrollY ~254 at 1440x900, i.e. the hero's bottom edge
   *            reaching ~60% of the viewport height. The text never changes.
   *   active   the rail entry whose heading was last passed. The rail lists
   *            headings, not sections: the page has 8 sections but 19 rail
   *            entries, because each h2 section also lists its h3 sub-headings.
   *   groups   a sub-group opens while a heading inside it is active, so the
   *            tree unfolds as the reader descends and folds again afterwards.
   *            At most one group is open at a time, matching the original.
   */
  var treeGroups = [];
  var railHeadings = [];
  // Scroll-driven group updates pause until this timestamp, so a click and its
  // smooth scroll are not undone by the positions the scroll passes through.
  var groupHold = 0;

  function renderRail() {
    var links = $$('#tree a');
    if (links.length) {
      // Collect the headings each link points at, in rail order.
      railHeadings = links.map(function (a) {
        var href = a.getAttribute('href');
        return href ? document.getElementById(decodeURIComponent(href.slice(1))) : null;
      });
      var probe = window.innerHeight / 3;
      var active = 0;
      for (var i = 0; i < railHeadings.length; i++) {
        var el = railHeadings[i];
        if (!el) continue;
        // A 1px slop absorbs fractional layout positions, so a heading sitting
        // exactly on the probe line still counts as reached.
        if (el.getBoundingClientRect().top <= probe + 1) active = i;
      }
      for (var j = 0; j < links.length; j++) links[j].classList.toggle('on', j === active);
      syncGroups(active);
    }
    syncRailTitle();
  }

  /** Open the sub-group that owns the active link, and only that one. */
  function syncGroups(active) {
    // While a click-driven scroll is in flight the intermediate positions must
    // not close the group the reader just opened.
    if (groupHold > Date.now()) return;

    // A manual toggle lasts until the reader moves into a different group.
    var manualOwner = null;
    for (var m = 0; m < treeGroups.length; m++) {
      if (treeGroups[m].manual === true) manualOwner = m;
    }
    if (manualOwner !== null && treeGroups[manualOwner].indices.indexOf(active) === -1) {
      treeGroups[manualOwner].manual = null;
      manualOwner = null;
    }

    for (var g = 0; g < treeGroups.length; g++) {
      var group = treeGroups[g];
      var isMine = manualOwner !== null
        ? g === manualOwner
        : group.indices.indexOf(active) !== -1;
      group.el.classList.toggle('open', isMine);
      if (group.parent) group.parent.setAttribute('aria-expanded', isMine ? 'true' : 'false');
    }
  }

  function syncRailTitle() {
    if (!railTitle) return;
    // Measured on the live page at 1440x900: the title turns on at scrollY 254,
    // where the rail's own top edge reaches 191px from the viewport top — about
    // a fifth of the viewport. Reproduced as the offset of the article body.
    var body = document.querySelector('.body-grid');
    if (!body) return;
    railTitle.classList.toggle('on', body.getBoundingClientRect().top <= window.innerHeight * 0.213);
  }

  function initRailTree() {
    railTitle = document.getElementById('railTitle');

    // Each sub-group follows the parent link that precedes it.
    $$('#tree .subs').forEach(function (group) {
      var parent = group.previousElementSibling;
      while (parent && parent.tagName !== 'A') parent = parent.previousElementSibling;
      var allLinks = $$('#tree a');
      var indices = $$('a', group).map(function (a) { return allLinks.indexOf(a); });
      var entry = { el: group, parent: parent, indices: indices, manual: null };

      if (parent) {
        parent.setAttribute('aria-expanded', 'false');
        parent.setAttribute('role', 'button');
        parent.addEventListener('click', function (e) {
          e.preventDefault();
          var open = !group.classList.contains('open');
          // An explicit toggle overrides the scroll rule for this group until
          // the scroll it starts has settled.
          entry.manual = open ? true : null;
          groupHold = Date.now() + 1400;
          for (var g = 0; g < treeGroups.length; g++) {
            if (treeGroups[g] !== entry) treeGroups[g].manual = null;
          }
          group.classList.toggle('open', open);
          parent.setAttribute('aria-expanded', open ? 'true' : 'false');
          scrollToSection(parent.getAttribute('href'));
        });
      }
      treeGroups.push(entry);
    });

    // Sub-links scroll like top-level ones and fold their group away after use.
    $$('#tree a.sub').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToSection(a.getAttribute('href'));
      });
    });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      renderProgress();
      renderRail();
      ticking = false;
    });
  }

  // -------------------------------------------------------- entrance reveal
  function initReveal() {
    var nodes = $$('[data-reveal]');
    if (!nodes.length) return;
    // The nav and the rail are above the fold and are revealed immediately.
    document.getElementById('app') && document.getElementById('app').classList.add('stag');

    if (!('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('is-in', 'reveal-done'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  // ------------------------------------------------------------------ feed
  var ALL_CATS = [];

  function renderFeed() {
    var feed = document.getElementById('feed');
    if (!feed) return;
    var rows = relatedFor(feedCat);
    var limit = feedLimitFor(feedCat);
    feed.innerHTML = rows.slice(0, limit).map(function (p) {
      return '<a class="frow" href="#' + p.slug + '">' +
        '<span class="f-l">' + formatDate(p.date) + '</span>' +
        '<span class="f-t">' + p.title + '</span>' +
        '<span class="f-d">' + p.mins + ' min</span>' +
        '</a>';
    }).join('');
    // The LOAD MORE row stays in the layout even once everything is shown — the
    // original leaves it rendered, so it is not hidden here.
    syncTabs();
  }

  function selectCategory(cat) {
    feedCat = cat;
    feedAll = false;
    renderFeed();
  }

  /**
   * The filter row collapses into a "…" menu when the tabs stop fitting, which
   * is what the original does at narrow widths: the visible tabs are trimmed
   * until they fit beside the overflow control.
   *
   * Measurement order matters — the wrapper is added (or removed) first, then
   * the row is measured with every tab visible, and only a real overflow hides
   * tabs. Measuring before the wrapper exists would reserve space that is not
   * actually needed on wide viewports.
   */
  function syncTabs() {
    var tabs = document.getElementById('tabs');
    if (!tabs) return;

    var btns = $$('button.tab', tabs).filter(function (b) { return !b.closest('.tab-more-wrap'); });
    if (btns.length < 2) return;

    var old = $('.tab-more-wrap', tabs);
    btns.forEach(function (b) { b.style.display = ''; });
    if (old) old.remove();

    var avail = tabs.clientWidth;
    if (!avail) return;
    var gap = parseFloat(getComputedStyle(tabs).columnGap) || 0;
    var widths = btns.map(function (b) { return b.offsetWidth; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + gap * (btns.length - 1);
    if (total <= avail) return;

    var moreBtn = $('button.tab', wrap);
    var moreW = moreBtn.offsetWidth || 24;
    var wrap = document.createElement('span');
    wrap.className = 'tab-more-wrap';
    wrap.innerHTML = '<button class="tab" type="button" aria-haspopup="menu" aria-label="More categories">\u00b7\u00b7\u00b7</button>' +
      '<div class="tab-menu" role="menu"></div>';
    var menu = $('.tab-menu', wrap);
    ALL_CATS.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab';
      b.dataset.c = cat;
      b.textContent = cat;
      b.addEventListener('click', function () {
        wrap.classList.remove('open');
        selectCategory(cat);
      });
      menu.appendChild(b);
    });
    $('button.tab', wrap).addEventListener('click', function (e) {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', function () { wrap.classList.remove('open'); });
    tabs.appendChild(wrap);

    var used = moreW;
    btns.forEach(function (b, i) {
      var next = used + (i ? gap : 0) + widths[i];
      if (next <= avail) { used = next; b.style.display = ''; }
      else b.style.display = 'none';
    });
  }

  function initFeed() {
    ALL_CATS = ['ALL'].concat(Object.keys(POSTS.posts.reduce(function (acc, p) {
      acc[p.cat.toUpperCase()] = true;
      return acc;
    }, {})));

    var tabs = document.getElementById('tabs');
    if (tabs) {
      $$('button.tab', tabs).forEach(function (btn) {
        if (btn.closest('.tab-more-wrap')) return;
        btn.addEventListener('click', function () {
          $$('button.tab', tabs).forEach(function (b) { b.classList.remove('on'); });
          btn.classList.add('on');
          selectCategory(btn.dataset.c || 'ALL');
        });
      });
    }

    var vm = document.getElementById('vm');
    if (vm) {
      var loadMore = function () {
        feedAll = true;
        renderFeed();
      };
      vm.addEventListener('click', loadMore);
      vm.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadMore(); }
      });
    }
    renderFeed();
  }

  // ---------------------------------------------------------------- camera
  function scrollByStep(delta) {
    window.scrollBy({ top: delta, behavior: 'smooth' });
  }

  function initKeys() {
    document.addEventListener('keydown', function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      var meta = e.metaKey || e.ctrlKey;

      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        togglePalette();
        return;
      }
      if (e.key === 'Escape') {
        if (paletteOpen) { e.preventDefault(); closePalette(); }
        return;
      }
      if (paletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); return; }
        if (e.key === 'Enter') { e.preventDefault(); openSelection(); return; }
        return;
      }
      if (typing || meta || e.altKey) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); scrollByStep(ARROW_STEP); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); scrollByStep(-ARROW_STEP); }
    });
  }

  // --------------------------------------------------------------- palette
  var paletteOpen = false;
  var paletteOverlay = null;

  function paletteItems() {
    return $$('.pal-item', paletteOverlay);
  }

  function visiblePaletteItems() {
    return paletteItems().filter(function (el) { return el.style.display !== 'none'; });
  }

  function applyPaletteFilter() {
    var input = $('.pal-input', paletteOverlay);
    var q = input ? input.value.trim().toLowerCase() : '';
    paletteItems().forEach(function (el) {
      var name = $('.nm', el);
      var kind = (el.dataset.kind || 'ARTICLE').toUpperCase();
      var cat = (el.dataset.cat || '').toUpperCase();
      // Non-article entries are the site's pages/game: they only belong to the
      // PAGES tab, matching the original's tab semantics.
      var catOk;
      if (paletteCat === 'ALL') catOk = true;
      else if (paletteCat === 'PAGES') catOk = kind !== 'ARTICLE';
      else catOk = kind === 'ARTICLE' && cat === paletteCat;
      var textOk = !q || (name ? name.textContent.toLowerCase().indexOf(q) !== -1 : false);
      el.style.display = catOk && textOk ? '' : 'none';
    });
    paletteSel = 0;
    paintSelection();
  }

  function paintSelection() {
    var vis = visiblePaletteItems();
    paletteItems().forEach(function (el) { el.classList.remove('sel'); });
    if (!vis.length) return;
    if (paletteSel >= vis.length) paletteSel = vis.length - 1;
    if (paletteSel < 0) paletteSel = 0;
    vis[paletteSel].classList.add('sel');
    if (vis[paletteSel].scrollIntoView) {
      vis[paletteSel].scrollIntoView({ block: 'nearest' });
    }
  }

  function moveSelection(delta) {
    var vis = visiblePaletteItems();
    if (!vis.length) return;
    paletteSel = (paletteSel + delta + vis.length) % vis.length;
    paintSelection();
  }

  function openSelection() {
    var vis = visiblePaletteItems();
    if (!vis.length) return;
    var el = vis[paletteSel];
    var target = el.dataset.href;
    if (target) { closePalette(); window.location.href = target; }
  }

  function openPalette() {
    if (!paletteOverlay || paletteOpen) return;
    paletteOpen = true;
    paletteOverlay.classList.add('open');
    var input = $('.pal-input', paletteOverlay);
    if (input) { input.value = ''; }
    applyPaletteFilter();
    window.requestAnimationFrame(function () {
      paletteOverlay.classList.add('in');
      if (input) input.focus();
    });
  }

  function closePalette() {
    if (!paletteOverlay || !paletteOpen) return;
    paletteOpen = false;
    paletteOverlay.classList.add('closing');
    paletteOverlay.classList.remove('in');
    window.setTimeout(function () {
      paletteOverlay.classList.remove('open', 'closing');
    }, 200);
  }

  function togglePalette() {
    if (paletteOpen) closePalette();
    else openPalette();
  }

  function initPalette() {
    paletteOverlay = $('.pal-overlay');
    if (!paletteOverlay) return;

    var close = $('[data-close]', paletteOverlay);
    if (close) close.addEventListener('click', closePalette);
    paletteOverlay.addEventListener('mousedown', function (e) {
      if (e.target === paletteOverlay) closePalette();
    });

    var input = $('.pal-input', paletteOverlay);
    if (input) input.addEventListener('input', applyPaletteFilter);

    $$('.pal-tabs [data-tab]', paletteOverlay).forEach(function (tab) {
      tab.addEventListener('click', function () {
        paletteCat = tab.dataset.tab || 'ALL';
        $$('.pal-tabs [data-tab]', paletteOverlay).forEach(function (t) {
          t.classList.toggle('on', t === tab);
        });
        applyPaletteFilter();
      });
    });

    // Article rows are regenerated from the payload so the list is never
    // hand-maintained in two places. The static page entries (Home, Changelog,
    // Terminal, Clawd's Quest) keep their markup and stay first.
    var list = $('.pal-list', paletteOverlay);
    if (list) {
      var pages = $$('.pal-item', list).filter(function (el) {
        var kind = $('.kind', el);
        return kind && kind.textContent.trim().toUpperCase() !== 'ARTICLE';
      });
      $$('.pal-item', list).forEach(function (el) {
        if (pages.indexOf(el) === -1) el.remove();
      });
      var index = pages.length;
      POSTS.posts.slice(0, PALETTE_ARTICLES).forEach(function (p) {
        index++;
        var el = document.createElement('div');
        el.className = 'pal-item';
        el.setAttribute('data-i', String(index - 1));
        el.dataset.cat = p.cat.toUpperCase();
        el.dataset.href = '#' + p.slug;
        el.innerHTML = '<span class="no">' + ('0' + index).slice(-2) + '</span>' +
          '<span class="nm">' + p.title + '</span>' +
          '<span class="mins">' + p.mins + ' min</span>' +
          '<span class="kind">ARTICLE</span>';
        list.appendChild(el);
      });
      paletteItems().forEach(function (el) {
        el.addEventListener('click', function () {
          var href = el.dataset.href;
          if (href) { closePalette(); window.location.href = href; }
        });
      });
    }
    applyPaletteFilter();
    paletteSel = 0;
    paintSelection();
  }

  // ---------------------------------------------------------------- video
  function initVideo() {
    $$('.art-fig').forEach(function (fig) {
      var video = $('.art-anim', fig);
      var play = $('.art-anim-play', fig);
      var toggle = $('.art-anim-toggle', fig);
      if (!video || !play) return;

      play.addEventListener('click', function () {
        // Choosing the animation replaces the poster still, as on the original.
        fig.setAttribute('data-anim-chosen', '');
        play.setAttribute('hidden', '');
        if (toggle) toggle.removeAttribute('hidden');
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay blocked: keep the poster */ });
      });

      if (toggle) {
        toggle.addEventListener('click', function () {
          if (video.paused) {
            var p = video.play();
            if (p && p.catch) p.catch(function () {});
            toggle.textContent = 'Pause';
          } else {
            video.pause();
            toggle.textContent = 'Play';
          }
        });
        video.addEventListener('play', function () { toggle.textContent = 'Pause'; });
        video.addEventListener('pause', function () { toggle.textContent = 'Play'; });
      }
    });
  }

  // ----------------------------------------------------------------- toast
  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.classList.remove('show'); }, 1800);
  }

  function initCopy() {
    $$('.art-code').forEach(function (block) {
      var btn = $('button', block.querySelector('.ch'));
      var pre = $('pre', block);
      if (!btn || !pre) return;
      btn.addEventListener('click', function () {
        var text = pre.innerText;
        var done = function (ok) {
          toast(ok ? 'Copied' : 'Copy failed — select it manually');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
        } else {
          // Fall back to a selection-based copy for non-secure contexts.
          try {
            var range = document.createRange();
            range.selectNodeContents(pre);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            done(document.execCommand('copy'));
          } catch (err) {
            done(false);
          }
        }
      });
    });
  }

  // ------------------------------------------------------------------- nav
  // The original measures its nav and hides the links behind a burger when they
  // no longer fit, which happens at 1000px and below. The mobile layout and the
  // burger's own visibility are both gated on the `nav-collapsed` class, so the
  // class has to be maintained here as well as the burger's open/close state.
  var navEl = null;

  function syncNav() {
    if (!navEl) return;
    var collapsed = window.innerWidth <= NAV_COLLAPSE_W;
    navEl.classList.toggle('nav-collapsed', collapsed);
    if (!collapsed) navEl.classList.remove('menu-open');
    // The veil starts below the nav, and the nav's height changes with the
    // collapsed layout, so this is measured after the class is applied.
    document.documentElement.style.setProperty('--veil-top', navEl.offsetHeight + 'px');
  }

  function initNav() {
    navEl = $('.nav');
    if (!navEl) return;
    var burger = $('.nav-burger', navEl);
    if (burger) {
      burger.addEventListener('click', function () {
        var open = navEl.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    syncNav();
  }

  // ------------------------------------------------------------------ logo
  /**
   * The nav logo is a Lottie animation drawn on a canvas; the <img> next to it
   * is visibility:hidden and exists only as a fallback. The original loads
   * lottie_canvas.min.js and plays "Clawd-LookingAroundEyesOnly" inside the
   * `.clawd-clip` holder. Frame 0 is the resting pose, and with reduced motion
   * the original stays paused there.
   */
  function initLogo() {
    var holder = document.querySelector('.clawd-clip span');
    if (!holder || !window.lottie || !window.lottie.loadAnimation) return;
    // The saved markup already contains a canvas from the original server
    // render, and the player appends its own. Left in place, the new (empty)
    // canvas stacks after the rendered one and covers it, so the logo paints
    // into a canvas nobody sees.
    var stale = holder.querySelector('canvas');
    if (stale) stale.parentNode.removeChild(stale);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      window.lottie.loadAnimation({
        container: holder,
        renderer: 'canvas',
        loop: true,
        autoplay: !reduce,
        // Inlined rather than fetched so the page also works from file://.
        animationData: window.__CLONE_CLAWD_ANIM__ || null,
      });
    } catch (err) {
      // A failed logo animation must not stop the rest of the page wiring up.
    }
  }

  // ----------------------------------------------------------------- scene
  /**
   * The footer scene: a dithering starfield with space bodies, plus the Clawd
   * astronaut who walks around. Both come from the site's own scene module,
   * vendored verbatim and reached through window.__CLONE_SCENE__.
   *
   * The starfield is called with its own defaults: passing an explicit spacing
   * makes it roughly twice as dense as the live page, which was confirmed by
   * measuring painted pixels at several spacing values.
   *
   * The actor is started only once the scene is 25% scrolled in, with the same
   * options as the original call site: astronaut mode, 2.7px dot pitch, resting
   * at 50%/58% with the intro skipped.
   */
  var sceneActor = null;
  var spriteReady = null;

  function initScene() {
    var scene = document.querySelector('.scene');
    var sky = scene && scene.querySelector('.sky');
    var stage = scene && scene.querySelector('.astro-stage');
    if (!scene || !sky || !stage) return;
    if (!window.__CLONE_SCENE__) return;   // vendored bundles unavailable

    var api = window.__CLONE_SCENE__;
    var progress = { p: 0 };

    // The scene markup ships an empty canvas from the original render; the
    // starfield adds its own, so the placeholder would sit on top of it.
    var stale = sky.querySelector('canvas');
    if (stale) stale.parentNode.removeChild(stale);

    var actorBox = function () { return sceneActor ? sceneActor.getRect() : null; };

    if (typeof api.dotSky === 'function') {
      try {
        api.dotSky(sky, { progressRef: progress, avoidRef: actorBox });
        // The original marks its decorative canvases aria-hidden; the starfield
        // is purely ornamental, so it is hidden from assistive technology too.
        var skyCanvas = sky.querySelector('canvas');
        if (skyCanvas) skyCanvas.setAttribute('aria-hidden', 'true');
      } catch (err) { /* a failed starfield must not stop the page */ }
    }

    var started = false;
    var onSceneScroll = function () {
      var box = scene.getBoundingClientRect();
      progress.p = Math.max(0, Math.min(1, (window.innerHeight - box.top) / (0.85 * box.height)));
      if (started || progress.p <= 0.25) return;
      started = true;
      stage.style.opacity = '0';
      stage.style.transition = 'opacity 1.4s ease';
      startActor(stage);
    };

    /** Build the astronaut once its movement animations are available. */
    function startActor(host) {
      if (typeof api.clawdActor !== 'function') return;
      ready().then(function () {
        try {
          sceneActor = api.clawdActor(host, {
            mode: 'astronaut',
            px: 2.7,
            home: { x: 0.5, y: 0.58 },
            skipIntro: true,
          });
          window.requestAnimationFrame(function () { stage.style.opacity = '1'; });
        } catch (err) { /* a failed actor must not stop the page */ }
      });
    }

    window.addEventListener('scroll', onSceneScroll, { passive: true });
    // Publish the current progress before the first draw: the starfield reads it
    // when it initialises, so starting at 0 would leave the sky blank.
    var initial = scene.getBoundingClientRect();
    progress.p = Math.max(0, Math.min(1, (window.innerHeight - initial.top) / (0.85 * initial.height)));
    onSceneScroll();
  }

  // ------------------------------------------------------------- perch robot
  /**
   * The orange Clawd above "Related posts". It walks in along the tabs row,
   * perches on the label, and plays one of the act animations.
   *
   * The original creates it once and lets it manage itself from there:
   * postMascots installs its own scroll handler and mounts, moves and unmounts
   * the robot as the section passes. Its conditions, read from the code and
   * confirmed on the live page at 1440x900:
   *
   *   mounts when the nav has scrolled away and section.top < 80% of the
   *   viewport and section.bottom > 120 — measured as present from 90% to 98%
   *   of the page;
   *   unmounts when section.bottom < 40 or section.top > viewport height.
   */
  var perchAbort = typeof AbortController === 'function' ? new AbortController() : { signal: undefined };

  function initPerch() {
    var api = window.__CLONE_PERCH__;
    var section = document.querySelector('.more-sec');
    if (!api || typeof api.postMascots !== 'function' || !section) return;

    var edge = section.querySelector('.tabs-line');
    var label = section.querySelector('.rel-lbl');
    if (!edge || !label) return;

    // The mascot plays the animations it loads, so start it once those are in
    // place. It reads the edge, the label, the nav and the abort signal — the
    // same four arguments the original passes.
    ready().then(function () {
      try {
        api.postMascots({
          section: section,
          edgeEl: edge,
          labelEl: label,
          nav: document.querySelector('.nav'),
          signal: perchAbort.signal,
        });
      } catch (err) { /* a failed mascot must not stop the page */ }
    });
  }

  /** Resolves once the movement animations are loaded (or immediately if absent). */
  function ready() {
    if (!spriteReady) {
      spriteReady = typeof window.__CLONE_SPRITES_LOAD__ === 'function'
        ? window.__CLONE_SPRITES_LOAD__().catch(function () { return null; })
        : Promise.resolve(null);
    }
    return spriteReady;
  }

  // ------------------------------------------------------------------ boot
  function boot() {
    initLogo();
    initNav();
    initReveal();
    initKeys();
    initPalette();
    initFeed();
    initVideo();
    initCopy();
    initScene();
    initPerch();
    // After initFeed: the rail tree and the feed both live outside #app, and the
    // tree's handlers only need the markup the page shipped.
    initRailTree();
    // Top-level rail links scroll to their section. Parent links (the ones that
    // own a sub-group) already have their own handler from initRailTree, so they
    // are skipped here to avoid scrolling twice.
    $$('#tree > a').forEach(function (a) {
      if (a.hasAttribute('aria-expanded')) return;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToSection(a.getAttribute('href'));
      });
    });

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      syncNav();
      // The layout width used by the tab meter must be current before measuring.
      syncTabs();
      onScroll();
    });
    renderProgress();
    renderRail();

    // Keep the two progress indicators honest if fonts or images shift layout.
    window.addEventListener('load', onScroll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
