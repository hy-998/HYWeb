/* ============================================================
   简历页（about.html）专属交互
   ------------------------------------------------------------
   分段编号沿用预览稿：3 刻度条 · 4 进场观察 · 5 阅读进度条 · 6 类别筛选
   · 7 东八区现场时钟 · 8 图片放大层 · 9 复制。
   1~2 段（主题切换、移动端菜单）不在此处——由 assets/js/clone.js 全站统一负责。
   ============================================================ */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 3. 刻度条：用 span 生成 10 格，逐格错峰升起 */
  var meters = document.querySelectorAll('.meter');
  meters.forEach(function (m) {
    var level = parseInt(m.getAttribute('data-level'), 10) || 0;
    for (var i = 0; i < 10; i++) {
      var bar = document.createElement('i');
      if (i < level) bar.className = 'on';
      if (!reduce) bar.style.transitionDelay = (i * 40) + 'ms';
      m.appendChild(bar);
    }
  });

  /* 4. 进场：IntersectionObserver（淡入上浮 + 遮罩行 + 数字滚动 + 刻度点亮） */
  var hero = document.querySelector('.about-hero');
  var revealEls = [].slice.call(document.querySelectorAll('.reveal, .mask'));

  var playStats = function () {
    document.querySelectorAll('.num').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var dec = parseInt(el.getAttribute('data-dec'), 10) || 0;
      if (reduce) { el.textContent = target.toFixed(dec); return; }
      var dur = 1100, t0 = null;
      var step = function (ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);      /* easeOutCubic */
        el.textContent = (target * eased).toFixed(dec);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  };

  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
    playStats();
  } else {
    var group = 0;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.style.transitionDelay = ((group++ % 4) * 80) + 'ms';   /* 同屏错峰，上限 240ms */
        el.classList.add('is-in');
        io.unobserve(el);
        if (el.id === 'statBand') playStats();
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });

    revealEls.forEach(function (el) { io.observe(el); });
    var band = document.getElementById('statBand');
    if (band) io.observe(band);
    if (hero) {
      var heroName = hero.querySelector('.hero-name');
      if (heroName) io.observe(heroName);
    }
  }

  /* 5. 顶部阅读进度条（详情页逻辑同款） */
  var bar = document.getElementById('progressBar');
  var rail = document.getElementById('tlRail');
  var items = [].slice.call(document.querySelectorAll('.tl-item'));
  var ghost = document.getElementById('heroGhost');
  var ticking = false;

  var update = function () {
    ticking = false;
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var y = window.pageYOffset || doc.scrollTop;

    if (bar) bar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';

    /* 时间轴脊线：以视口 45% 高度为「阅读线」 */
    if (rail) {
      var rect = rail.getBoundingClientRect();
      var line = window.innerHeight * 0.45;
      var h = rect.height || 1;
      var pct = Math.max(0, Math.min(1, (line - rect.top) / h));
      rail.style.setProperty('--fill', pct);
      rail.style.setProperty('--head-on', (pct > 0.002 && pct < 0.999) ? 1 : 0);

      items.forEach(function (it) {
        if (it.style.display === 'none') return;
        var node = it.querySelector('.tl-node');
        if (!node) return;
        var nr = node.getBoundingClientRect();
        it.classList.toggle('is-lit', (nr.top + nr.height / 2) <= line);
      });
    }

    /* 幽灵大字：微弱视差，只做纵深 */
    if (ghost && !reduce) ghost.style.transform = 'translateY(' + Math.min(y * 0.12, 120) + 'px)';
  };

  var onScroll = function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  /* 6. 类别筛选（收藏推荐页同款行为） */
  var filterBar = document.getElementById('tlFilter');
  if (filterBar) {
    filterBar.addEventListener('click', function (e) {
      var tag = e.target.closest('.filter-tag');
      if (!tag) return;
      filterBar.querySelector('.filter-tag.active').classList.remove('active');
      tag.classList.add('active');
      var kind = tag.getAttribute('data-kind');
      items.forEach(function (it) {
        var ok = kind === 'all' || it.getAttribute('data-kind') === kind;
        it.style.display = ok ? '' : 'none';
        if (ok) it.classList.add('is-in');
      });
      update();
    });
  }

  /* 7. 现场时钟：固定取东八区墙钟，与"广州"标签一致，不受访问者本机时区影响 */
  (function () {
    var out = document.getElementById('heroClock');
    if (!out) return;
    var fmt = null;
    try {
      fmt = new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Asia/Shanghai'
      });
    } catch (e) {}
    var tick = function () {
      var d = new Date();
      out.textContent = fmt
        ? fmt.format(d)
        : (function (p) { return p.map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':'); })
            ([d.getHours(), d.getMinutes(), d.getSeconds()]);
    };
    tick();
    setInterval(tick, 1000);
  })();

  /* 8. 放大层：作品缩略图与微信二维码共用一套。只做三件事——把图放到眼前、挡住背后的滚动、
     把焦点还回去。全程不碰 body 的 overflow/position，也不改 window.scrollY，所以关掉之后人还在
     原地，列表不重排、不闪白，读到的那一行没被挪走。
     两种进场：缩略图走 FLIP，从它自己的矩形长出来（同一张图在移动）；二维码的触发点是颗扁胶囊，
     按矩形拉伸会拧巴，改成原地 0.92 → 1 长开，配合同一条曲线。 */
  (function () {
    var box = document.getElementById('shotBox');
    var big = document.getElementById('shotBoxImg');
    var cap = document.getElementById('shotBoxCap');
    if (!box || !big) return;

    /* 展开用「先蓄力再落位」那条曲线：本页标志性的 0.16,1,0.3,1 在 25% 时间点已经走完 83%，
       9 倍尺寸的位移会被看成「弹出来」而不是「长出来」；换成 0.4,0,0.2,1 后这段飞行才读得出来。 */
    var EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
    var EASE_IN = 'cubic-bezier(0.4, 0, 0.6, 1)';
    var OUT = 420, BACK = 300, SHRINK = 'scale(0.92)';
    var current = null;      // 当前触发者：一枚缩略图或扫码按钮
    var mode = 'flip';       // flip = 从触发点原位长出来；grow = 原地长开
    var baseRect = null;     // 大图在遮罩里的布局矩形（展开期间不会变）
    var expanded = false;    // 展开动画已到位，可以反向收回
    var timer = 0;

    /* 量按钮而不是里面的 img：img 悬停时被 scale(1.08) 放大，按钮盒子不受影响 */
    var rectOf = function (el) { return el.getBoundingClientRect(); };

    /* 触发者自带 <img> 就当作品缩略图（FLIP + 原位隐去），否则按 data-qr 当二维码 */
    var cfgOf = function (el) {
      var img = el.querySelector('img');
      if (img) {
        return { src: img.getAttribute('src'), alt: img.getAttribute('alt'),
                 cap: el.getAttribute('data-cap') || '', mode: 'flip', lift: true };
      }
      return { src: el.getAttribute('data-qr'), alt: el.getAttribute('data-alt') || '二维码',
               cap: el.getAttribute('data-cap') || '', mode: 'grow', lift: false };
    };

    /* 逆矩阵：把布局矩形压回 from 矩形，transform-origin 固定左上，缩放比即尺寸比 */
    var inv = function (from, to) {
      return 'translate(' + (from.left - to.left) + 'px, ' + (from.top - to.top) + 'px) scale('
        + (from.width / (to.width || 1)) + ', ' + (from.height / (to.height || 1)) + ')';
    };

    var finish = function () {
      box.classList.remove('is-open');
      box.classList.remove('is-qr');
      box.setAttribute('aria-hidden', 'true');
      big.style.transition = 'none';
      big.style.transform = 'none';
      big.style.visibility = 'hidden';
      if (current) current.classList.remove('is-lifted');
      var back = current;
      current = null;
      baseRect = null;
      expanded = false;
      if (back) { try { back.focus({ preventScroll: true }); } catch (e) { back.focus(); } }
    };

    var close = function () {
      if (!current) return;
      clearTimeout(timer);
      if (reduce || !expanded || (mode === 'flip' && !baseRect)) { finish(); return; }
      /* 收回一开始就让原图回到 100% 不透明：它全程被正在缩小的这张盖住，
         等大图落回原位那一刻它已经实了，交接处不会闪一下空位 */
      current.classList.remove('is-lifted');
      big.style.transition = 'transform ' + BACK + 'ms ' + EASE_IN;
      big.style.transform = mode === 'flip' ? inv(rectOf(current), baseRect) : SHRINK;
      timer = setTimeout(finish, BACK);
    };

    var open = function (el) {
      if (current === el) return;
      if (current) finish();
      clearTimeout(timer);
      var cfg = cfgOf(el);
      var from = rectOf(el);
      current = el;
      mode = cfg.mode;
      expanded = false;
      baseRect = null;
      box.classList.add('is-open');
      box.classList.toggle('is-qr', mode === 'grow');
      box.setAttribute('aria-hidden', 'false');
      box.setAttribute('aria-label', cfg.cap || '放大查看图片');
      if (cfg.lift) el.classList.add('is-lifted');
      big.style.transition = 'none';
      big.style.transform = 'none';
      big.style.visibility = 'hidden';
      big.src = cfg.src;
      big.alt = cfg.alt;
      cap.textContent = cfg.cap;
      var hint = document.createElement('span');
      hint.textContent = ' · 点击任意处或 Esc 关闭';
      cap.appendChild(hint);

      var play = function () {
        if (current !== el) return;
        big.style.transformOrigin = mode === 'flip' ? '0 0' : 'center';
        baseRect = big.getBoundingClientRect();      // 此刻无变换，量到的是布局矩形
        if (reduce) {
          big.style.visibility = 'visible';
          expanded = true;
          return;
        }
        /* 先摆回触发点的大小和位置，再放开——看起来是同一张图在移动，而不是弹出一个新窗口 */
        big.style.transform = mode === 'flip' ? inv(from, baseRect) : SHRINK;
        big.style.visibility = 'visible';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (current !== el) return;
            big.style.transition = 'transform ' + OUT + 'ms ' + EASE_OUT;
            big.style.transform = 'none';
            expanded = true;
          });
        });
      };

      if (big.complete && big.naturalWidth) play();
      else if (big.decode) big.decode().then(play, play);
      else big.addEventListener('load', play, { once: true });

      try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
    };

    document.querySelectorAll('.tl-shot, .contact-act[data-qr]').forEach(function (el) {
      el.addEventListener('click', function () { open(el); });
    });

    box.addEventListener('click', close);
    /* 遮罩是 fixed 的，滚轮默认还会把底下的文档推走，这里就地拦下，不动 scrollY 一个像素 */
    box.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    box.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if (!current) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') e.preventDefault();       // 层内没有别的焦点目标，出去就是打断阅读
    });
    window.addEventListener('resize', function () { if (current) finish(); });
  })();

  /* 9. 复制：点一下进剪贴板，按钮用「主色扫过 + 图标换对勾 + 文案上滑」三件事同时确认，1.6s 后自己退回。
     file:// 与未聚焦的标签页里 navigator.clipboard 可能被拒，所以留了 execCommand 兜底；
     两条路都不通就把值选中、在 aria-live 里说清楚，不假装成功。 */
  (function () {
    var live = document.getElementById('contactLive');
    var say = function (msg) { if (live) live.textContent = msg; };

    var legacy = function (text) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      return ok;
    };

    var pick = function (el) {
      /* 选中会把页面拽到选区上去，先把 scrollY 记下来，选完立刻送回去 */
      var doc = document.documentElement;
      var y = window.pageYOffset || doc.scrollTop;
      var r = document.createRange();
      r.selectNodeContents(el);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      window.scrollTo({ top: y, left: 0, behavior: 'instant' });   /* 站点 html 是 smooth，必须点名 instant 才送得回去 */
    };

    document.querySelectorAll('.contact-act[data-copy]').forEach(function (btn) {
      var timer = 0;
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy');
        var what = btn.getAttribute('data-what') || '';
        var done = function () {
          btn.classList.add('is-copied');
          say(what + '已复制：' + text);
          clearTimeout(timer);
          timer = setTimeout(function () { btn.classList.remove('is-copied'); say(''); }, 1600);
        };
        var fail = function () {
          say('浏览器拦住了自动复制，' + what + '已选中，按 Ctrl/⌘+C 即可');
          var val = btn.parentNode.querySelector('.contact-val');
          if (val) pick(val);
        };
        var fallback = function () { if (legacy(text)) done(); else fail(); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else {
          fallback();
        }
      });
    });
  })();

  /* 10. 导出 PDF：不预生成文件，把当前这一页交给浏览器的打印管线，
        纸面版式写在 about.css 第 9 节。好处是简历永远和页面同步——改了经历
        不必记得重新导出一份二进制塞回仓库。
        打印前替「纸上世界」做三件收尾：没滚到的进场元素直接落终态、
        计数数字定稿、类别筛选恢复成「全部」——不然点过「教育」再导出，
        纸上就只剩一条经历。打完原样还回去。 */
  (function () {
    var btn = document.getElementById('pdfBtn');
    var busy = false;
    var restoreKind = '';

    var settle = function () {
      if (busy) return;                       /* 点按钮和 beforeprint 会双触发，只收一次尾 */
      busy = true;
      revealEls.forEach(function (el) { el.classList.add('is-in'); });
      document.querySelectorAll('.num').forEach(function (el) {
        var t = parseFloat(el.getAttribute('data-count'));
        var dec = parseInt(el.getAttribute('data-dec'), 10) || 0;
        if (!isNaN(t)) el.textContent = t.toFixed(dec);
      });
      var active = filterBar && filterBar.querySelector('.filter-tag.active');
      var kind = active && active.getAttribute('data-kind');
      if (kind && kind !== 'all') {
        restoreKind = kind;
        var all = filterBar.querySelector('.filter-tag[data-kind="all"]');
        if (all) all.click();
      }
    };

    var restore = function () {
      if (!busy) return;
      busy = false;
      if (!restoreKind || !filterBar) return;
      var tag = filterBar.querySelector('.filter-tag[data-kind="' + restoreKind + '"]');
      restoreKind = '';
      if (tag) tag.click();
    };

    window.addEventListener('beforeprint', settle);
    window.addEventListener('afterprint', restore);
    if (btn) {
      btn.addEventListener('click', function () {
        settle();                             /* 老 Safari 不发 beforeprint，按钮这条路上自己兜住 */
        window.print();
      });
    }
  })();
})();
