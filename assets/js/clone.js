/* yaolifeng.com/shorts 复刻 · 交互脚本
   1. 主题切换：与原站一致，localStorage 存 'theme'，默认 dark
   2. 分页：点击切换 current 态（静态复刻，无真实翻页数据） */

(function () {
  /* 0. 首次访问：先播放打字机开篇
        - 只有确认 localStorage 可写时才启用该重定向。存储被浏览器禁用时
          setItem 永远失败、标记永远写不上，若照旧放行会形成
          intro.html ↔ index.html 死循环（用户永远进不了博客）
        - 跳转附带 ?next=<当前页面>，ENTER 后回到用户原本要看的页面，
          而不是一律丢回首页（外部深链接首访不再被吞）
        - ?skipIntro=1 为逃生口：任何情况下都直接放行，不播欢迎页
        - 点头像重播不受此标记影响（见第 5 节） */
  var introTarget = (function () {
    var file = location.pathname.split('/').pop(); /* 根路径 /HYWeb/ → '' */
    if (!file || file === 'index.html') return '';
    return file + location.search + location.hash;
  })();

  var storageWritable = (function () {
    try {
      var probe = '__introProbe__';
      localStorage.setItem(probe, '1');
      var ok = localStorage.getItem(probe) === '1';
      localStorage.removeItem(probe);
      return ok;
    } catch (e) {
      return false;
    }
  })();

  var seen = null;
  if (storageWritable) {
    try { seen = localStorage.getItem('introPlayed'); } catch (e) {}
  }

  var skipIntro = /[?&]skipIntro=1(?:&|$)/.test(location.search);
  if (storageWritable && !seen && !skipIntro && !/intro\.html$/.test(location.pathname)) {
    location.href = 'intro.html' + (introTarget ? '?next=' + encodeURIComponent(introTarget) : '');
    return;
  }

  var root = document.documentElement;
  var toggle = document.querySelector('.theme-toggle');

  toggle.addEventListener('click', function () {
    var next = root.classList.contains('dark') ? 'light' : 'dark';
    root.classList.remove('light', 'dark');
    root.classList.add(next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  var nums = document.querySelectorAll('.page-num');
  nums.forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelector('.page-num.current').classList.remove('current');
      btn.classList.add('current');
      // 同步移动端指示器文本
      var ind = document.querySelector('.page-indicator');
      if (ind) ind.textContent = btn.textContent + '/15';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  /* 3. 详情页：阅读进度条（原站随滚动更新内条 width%） */
  var bar = document.getElementById('progressBar');
  if (bar) {
    var updateBar = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = pct + '%';
    };
    window.addEventListener('scroll', updateBar, { passive: true });
    window.addEventListener('resize', updateBar);
    updateBar();
  }

  /* 4. 详情页：回到顶部 / 复制链接 */
  var backTop = document.getElementById('backTopBtn');
  if (backTop) {
    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  var copyLink = document.getElementById('copyLinkBtn');
  if (copyLink) {
    copyLink.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(location.href);
    });
  }

  /* 5. 点击左上角头像 → 重播开篇动画（intro.html） */
  var avatar = document.querySelector('.brand-avatar');
  if (avatar) {
    avatar.style.cursor = 'pointer';
    avatar.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      window.location.href = 'intro.html';
    });
  }

  /* 6. 收藏推荐页：页签分类筛选 */
  var tags = document.querySelectorAll('.filter-tag');
  if (tags.length) {
    var favCards = document.querySelectorAll('.fav-card');
    var favEmpty = document.getElementById('favEmpty');
    tags.forEach(function (tag) {
      tag.addEventListener('click', function () {
        var cur = document.querySelector('.filter-tag.active');
        if (cur) cur.classList.remove('active');
        tag.classList.add('active');
        var g = tag.getAttribute('data-group');
        var shown = 0;
        favCards.forEach(function (c) {
          var groups = (c.getAttribute('data-groups') || '').split(',');
          var ok = g === 'all' || groups.indexOf(g) !== -1;
          c.style.display = ok ? '' : 'none';
          if (ok) shown++;
        });
        if (favEmpty) favEmpty.style.display = shown ? 'none' : 'block';
      });
    });
  }

  /* 7. 列表页 ↔ 详情页：记住浏览位置与分页页码
        点条目进详情页时记录（页码 + 滚动位置）到 sessionStorage；
        回到 index 时恢复并立即消费（一次性）；项目/收藏/欢迎页
        属于"绕路"，进入即失效，避免陈旧状态误恢复 */
  var SS_KEY = 'listScrollState';
  var shortList = document.querySelector('.short-list');
  if (shortList) {
    /* 离开列表前往详情页的瞬间记录状态 */
    shortList.querySelectorAll('.short-item').forEach(function (a) {
      a.addEventListener('click', function () {
        var cur = document.querySelector('.page-num.current');
        try {
          sessionStorage.setItem(SS_KEY, JSON.stringify({
            p: cur ? cur.textContent : '1',
            y: window.scrollY
          }));
        } catch (e) {}
      });
    });

    /* 返回列表：恢复分页 current 态与滚动位置（一次性，恢复后即清除） */
    var state = null;
    try { state = JSON.parse(sessionStorage.getItem(SS_KEY)); } catch (e) {}
    if (state) {
      var target = [].filter.call(document.querySelectorAll('.page-num'), function (b) {
        return b.textContent === String(state.p);
      })[0];
      if (target && !target.classList.contains('current')) {
        document.querySelector('.page-num.current').classList.remove('current');
        target.classList.add('current');
        var ind = document.querySelector('.page-indicator');
        if (ind) ind.textContent = target.textContent + '/15';
      }
      if (state.y) {
        window.scrollTo(0, state.y);
        /* 布局竞态兜底：图片解码完成后可能仍有微小位移，load 后再钉一次 */
        window.addEventListener('load', function () {
          window.scrollTo(0, state.y);
        });
      }
      try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
    }
  } else if (document.querySelector('.works-grid, .fav-grid, #typewriter')) {
    /* 绕路页面：清除残留的返回状态 */
    try { sessionStorage.removeItem(SS_KEY); } catch (e) {}
  }

  /* 8. 详情页：自动生成目录
        提取正文一级标题（h2）写入「目录」卡；未读条目浅色、
        已读/当前条目文字回归正常色；点击平滑跳转到对应小节 */
  var proseEl = document.querySelector('.prose');
  var tocList = document.querySelector('.toc-list');
  if (proseEl && tocList) {
    var heads = proseEl.querySelectorAll('h2');
    if (heads.length) {
      tocList.innerHTML = '';
      var tocItems = [];
      heads.forEach(function (h, i) {
        h.id = 'sec-' + (i + 1);
        var a = document.createElement('a');
        a.className = 'toc-item';
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        var li = document.createElement('li');
        li.appendChild(a);
        tocList.appendChild(li);
        tocItems.push({ a: a, h: h });
      });

      var updateToc = function () {
        var last = -1;
        tocItems.forEach(function (it, i) {
          if (it.h.getBoundingClientRect().top <= 160) last = i;
        });
        /* 已滚到页面底部时，最后一节视为已读（末节后内容不足以滚到阈值） */
        var doc = document.documentElement;
        if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) {
          last = tocItems.length - 1;
        }
        tocItems.forEach(function (it, i) {
          it.a.classList.toggle('is-read', i <= last);
        });
      };
      window.addEventListener('scroll', updateToc, { passive: true });
      updateToc();
    }
  }
})();

/* ---------- 9. 移动端菜单：汉堡按钮开合下拉导航 ---------- */
(function () {
  var btn = document.querySelector(".mobile-menu-btn");
  var menu = document.querySelector(".mobile-menu");
  if (!btn || !menu) return;

  var setOpen = function (open) {
    menu.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  };

  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    setOpen(!menu.classList.contains("open"));
  });
  /* 点外部关闭 */
  document.addEventListener("click", function (e) {
    if (menu.classList.contains("open") && !menu.contains(e.target) && e.target !== btn) setOpen(false);
  });
  /* Esc 关闭；点菜单里的链接后关闭 */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });
  menu.addEventListener("click", function (e) {
    if (e.target.closest("a")) setOpen(false);
  });
  /* 窗口拉宽到桌面档时收起 */
  window.addEventListener("resize", function () {
    if (window.innerWidth >= 768) setOpen(false);
  });
})();
