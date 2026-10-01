/* ==========================================================================
   个人简历网站 · 渲染与交互
   内容全部来自 resume-data.js，本文件只负责"把数据变成页面"
   动效部分只做渐进增强：脚本没跑起来 / 浏览器不支持时，内容照常可见
   ========================================================================== */

(function () {
  'use strict';

  /* ---------- 小工具 ---------- */

  // 数据里可能有 <> 等字符，插入页面前统一转义，避免结构被破坏
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // 敏感环境下（如某些 file:// 场景）localStorage 会抛错，做一层兜底
  var storage = {
    get: function (k) {
      try { return window.localStorage.getItem(k); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(k, v); } catch (e) { /* 忽略 */ }
    }
  };

  function $(id) { return document.getElementById(id); }

  // 只放行 http(s) 外链和站内相对路径。
  // 数据文件是给人手改的，得防住三类别扭写法：
  //   javascript: / data: / vbscript: —— 点一下就在本页执行脚本
  //   //evil.com                       —— 省略协议的外部地址，看着像站内
  //   /etc/passwd 这类绝对路径          —— 站点根目录以外的东西
  function safeUrl(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;          // 正常外链
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return ''; // 任何带协议的一律拒掉
    if (s.charAt(0) === '/') return '';             // 绝对路径与 //host 一起拒掉
    return s;                                       // 剩下的当站内相对路径
  }

  function each(list, fn) {
    Array.prototype.forEach.call(list, fn);
  }

  function prefersReduce() {
    try {
      return !!(window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  /* ---------- 侧栏 ---------- */

  function renderSide() {
    var r = RESUME;

    // 照片：屏幕用方形头像（avatar），打印用竖版证件照（photo）。
    // 两张都输出，靠 CSS 在 @media print 里切换，缺哪张就用另一张顶上。
    if (r.photo || r.avatar) {
      var av = r.avatar || r.photo;
      var ph = r.photo || r.avatar;
      $('avatar').innerHTML =
        '<img src="' + esc(av) + '" alt="" class="avatar-img">' +
        '<img src="' + esc(ph) + '" alt="" class="avatar-photo">';
    } else {
      // 没有照片就用姓氏首字；姓名还是占位符（含「〔」）时给个中性字
      var nm = String(r.name || '');
      $('avatar').textContent = r.photoInitial ||
        (nm.indexOf('〔') === -1 && nm ? nm.slice(0, 1) : '简');
    }

    $('name').textContent = r.name || '个人简历';

    var intentEl = $('intent');
    if (r.intent) {
      intentEl.textContent = r.intent;
    } else {
      intentEl.hidden = true;
    }

    $('tagline').textContent = r.tagline || '';

    $('contacts').innerHTML = (r.contacts || []).map(function (c) {
      return '<li>' +
        '<span class="c-label">' + esc(c.label) + '</span>' +
        '<span class="c-value">' + esc(c.value) + '</span>' +
        '</li>';
    }).join('');

    $('skillTags').innerHTML = (r.skillTags || []).map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');

    document.title = (r.name && r.name.indexOf('〔') === -1 ? r.name : '个人简历')
      + ' · 个人简历';
  }

  /* ---------- 首屏数字看板 ---------- */

  function renderStats() {
    var box = $('stats');
    if (!box) return;

    var list = RESUME.stats || [];
    if (!list.length) { box.hidden = true; return; }

    box.hidden = false;
    box.innerHTML = list.map(function (s) {
      var attrs = ' data-value="' + esc(s.value) + '"';
      if (s.decimals) attrs += ' data-decimals="' + esc(s.decimals) + '"';
      if (s.prefix) attrs += ' data-prefix="' + esc(s.prefix) + '"';
      if (s.suffix) attrs += ' data-suffix="' + esc(s.suffix) + '"';

      return '<div class="stat">' +
        '<span class="stat-num"' + attrs + '></span>' +
        '<span class="stat-label">' + esc(s.label) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ---------- 各类型章节的渲染 ---------- */

  // 技能熟练度条：只认四个档位，避免出现「87%」这种经不起追问的伪精度
  var LEVELS = { '精通': 92, '熟练': 76, '掌握': 58, '了解': 38 };

  function renderMeters(list) {
    if (!list || !list.length) return '';

    var items = list.map(function (m) {
      var w = LEVELS[m.level];
      if (w == null) w = 60;

      return '<div class="meter">' +
        '<div class="meter-head">' +
        '<span class="meter-name">' + esc(m.label) + '</span>' +
        '<span class="meter-level">' + esc(m.level) + '</span>' +
        '</div>' +
        '<div class="meter-track">' +
        '<span class="meter-fill" style="--w:' + w + '%"></span>' +
        '</div>' +
        '</div>';
    }).join('');

    return '<div class="meters">' + items + '</div>';
  }

  function renderTimeline(sec) {
    var items = (sec.items || []).map(function (it) {
      var pts = (it.points || []).map(function (p) {
        // 要点支持两种写法：纯字符串，或 { label, text }（label 会加粗）
        if (p && typeof p === 'object') {
          return '<li><span class="p-k">' + esc(p.label) + '</span>' +
            esc(p.text) + '</li>';
        }
        return '<li>' + esc(p) + '</li>';
      }).join('');

      return '<div class="tl-item">' +
        (it.period ? '<div class="tl-period">' + esc(it.period) + '</div>' : '') +
        '<h3 class="tl-title">' + esc(it.title) + '</h3>' +
        (it.subtitle ? '<p class="tl-sub">' + esc(it.subtitle) + '</p>' : '') +
        (pts ? '<ul class="tl-points">' + pts + '</ul>' : '') +
        '</div>';
    }).join('');

    return '<div class="tl">' + items + '</div>';
  }

  // 小标题 + 说明段落，适合「个人优势」这类没有时间线的条目
  function renderDefs(sec) {
    var items = (sec.items || []).map(function (it) {
      return '<div class="def-item">' +
        '<p class="def-k">' + esc(it.label) + '</p>' +
        '<p class="def-v">' + esc(it.text) + '</p>' +
        '</div>';
    }).join('');

    return '<div class="defs">' + items + '</div>';
  }

  function renderList(sec) {
    var items = (sec.items || []).map(function (it) {
      return '<li>' +
        '<span class="p-label">' + esc(it.label) + '</span>' +
        '<span class="p-value">' + esc(it.value) + '</span>' +
        '</li>';
    }).join('');

    return '<ul class="plain-list">' + items + '</ul>';
  }

  function renderGrid(sec) {
    var cards = (sec.items || []).map(function (g) {
      var lines = (g.lines || []).map(function (l) {
        return '<li>' + esc(l) + '</li>';
      }).join('');

      return '<div class="skill-card">' +
        '<h3>' + esc(g.group) + '</h3>' +
        '<ul>' + lines + '</ul>' +
        '</div>';
    }).join('');

    // meters 可选：给了就渲染在卡片上方
    return renderMeters(sec.meters) + '<div class="skills-grid">' + cards + '</div>';
  }

  // 项目卡片：正文之外的「关键成果」放在悬停预览层里，
  // 触屏设备与打印时该层自动变成普通区块，内容一样看得到
  function renderProjects(sec) {
    var items = (sec.items || []).map(function (p) {
      var pts = (p.points || []).map(function (t) {
        return '<li>' + esc(t) + '</li>';
      }).join('');

      var tags = (p.tags || []).length
        ? '<ul class="proj-tags">' + p.tags.map(function (t) {
            return '<li>' + esc(t) + '</li>';
          }).join('') + '</ul>'
        : '';

      var links = (p.links || []).map(function (l) {
        var url = safeUrl(l.url);
        if (!url) return '';

        if (/^https?:\/\//i.test(url)) {
          return '<a class="proj-out" href="' + esc(url) +
            '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>';
        }

        // 站内附件：PDF / 图片 / 纯文本浏览器能直接渲染，新开标签页让人在线看；
        // docx / pptx / zip 这类浏览器打不开，直接 download 存盘，免得先弹个空页。
        var clean = url.split('?')[0].split('#')[0];
        var viewable = /\.(pdf|png|jpe?g|gif|webp|svg|txt|md)$/i.test(clean);
        return '<a class="proj-local" href="' + esc(url) + '"' +
          (viewable ? ' target="_blank" rel="noopener"' : ' download') +
          '>' + esc(l.label) + '</a>';
      }).join('');
      links = links ? '<p class="proj-links">' + links + '</p>' : '';

      var more = pts
        ? '<div class="proj-more">' +
          '<p class="proj-more-title">关键成果</p>' +
          '<ul class="proj-points">' + pts + '</ul>' +
          '</div>'
        : '';

      // 注意：外链必须放在 .proj-body 之外。
      // 悬停预览层是 inset:0 的绝对定位块，鼠标要点链接就得先悬停卡片，
      // 一悬停它就把整张卡片盖住并接管指针事件 —— 链接会变成点不动的死链。
      // 把它夹在 .proj-body 里、让浮层只覆盖 .proj-body，链接就始终可点。
      return '<article class="proj-card">' +
        '<div class="proj-body">' +
        '<div class="proj-head">' +
        '<h3 class="proj-name">' + esc(p.name) + '</h3>' +
        (p.period ? '<span class="proj-time">' + esc(p.period) + '</span>' : '') +
        '</div>' +
        (p.role ? '<p class="proj-role">' + esc(p.role) + '</p>' : '') +
        (p.desc ? '<p class="proj-desc">' + esc(p.desc) + '</p>' : '') +
        tags + more +
        '</div>' +
        links +
        '</article>';
    }).join('');

    return '<div class="projects">' + items + '</div>';
  }

  function renderText(sec) {
    var ps = (sec.paragraphs || []).map(function (p) {
      return '<p>' + esc(p) + '</p>';
    }).join('');

    return '<div class="prose">' + ps + '</div>';
  }

  var RENDERERS = {
    timeline: renderTimeline,
    list: renderList,
    projects: renderProjects,
    grid: renderGrid,
    defs: renderDefs,
    text: renderText
  };

  /* ---------- 正文 ---------- */

  function renderSections() {
    var sections = RESUME.sections || [];

    var html = sections.map(function (sec, i) {
      var num = String(i + 1).padStart(2, '0');
      var fn = RENDERERS[sec.type] || renderText;

      return '<section class="sec" id="' + esc(sec.id) + '">' +
        '<div class="sec-head">' +
        '<span class="sec-num">' + num + '</span>' +
        '<h2 class="sec-title">' + esc(sec.title) + '</h2>' +
        '</div>' +
        fn(sec) +
        '</section>';
    }).join('');

    $('sections').innerHTML = html;

    $('sectionNav').innerHTML = sections.map(function (sec, i) {
      var num = String(i + 1).padStart(2, '0');
      return '<a href="#' + esc(sec.id) + '">' + num + ' ' + esc(sec.title) + '</a>';
    }).join('');
  }

  /* ---------- 主题 ---------- */

  var bgThemeHook = null;   // 背景画布注册进来，主题一变就换配色

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeLabel').textContent = theme === 'dark' ? '浅色模式' : '深色模式';
    if (bgThemeHook) bgThemeHook(theme);
  }

  function initTheme() {
    // 这套设计的默认形态是深色科技风；用户手动切过就尊重他的选择
    var saved = storage.get('resume-theme');
    if (saved !== 'light' && saved !== 'dark') saved = 'dark';

    // 地址栏加 ?theme=light / ?theme=dark 可临时指定主题（方便分享特定版本）
    try {
      var m = /[?&]theme=(dark|light)/.exec(window.location.search || '');
      if (m) saved = m[1];
    } catch (e) { /* 忽略 */ }

    applyTheme(saved);

    $('themeToggle').addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'light' : 'dark';
      applyTheme(next);
      storage.set('resume-theme', next);
    });
  }

  /* ---------- 草稿提示条 ---------- */

  // 待确认内容的标记：〔……〕，括号里至少有一个字符。
  // 要求非空是为了让提示条自己那句「用〔…〕标出」不被误判成占位符。
  var PLACEHOLDER = /〔[^〕]+〕/;

  // 扫正文文本节点，跳过 script / style —— 否则把脚本内联进页面时，
  // 注释里出现的括号会被当成正文里的占位符。
  function hasPlaceholder() {
    var root = document.body;
    if (!root) return false;

    if (typeof document.createTreeWalker !== 'function') {
      return PLACEHOLDER.test(root.textContent || '');
    }
    var SHOW_TEXT = (window.NodeFilter && window.NodeFilter.SHOW_TEXT) || 4;
    var walker = document.createTreeWalker(root, SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var p = node.parentNode;
      if (!p) continue;
      var tag = p.nodeName;
      if (tag === 'SCRIPT' || tag === 'STYLE') continue;
      // 提示条自己那句「用〔…〕标出」得排除掉，不然它会自己触发自己
      if (p.closest && p.closest('#draftBanner')) continue;
      if (PLACEHOLDER.test(node.nodeValue || '')) return true;
    }
    return false;
  }

  function initBanner() {
    var banner = $('draftBanner');
    if (!banner) return;

    // 只有页面上真的还剩占位符时才提示。补完最后一条它就自动消失，
    // 不用再手动来关。别用「」判断：那是正文里引用荣誉名称的正常引号。
    if (!hasPlaceholder()) { banner.hidden = true; return; }

    if (storage.get('resume-banner-closed') === '1') {
      banner.hidden = true;
      return;
    }
    $('draftClose').addEventListener('click', function () {
      banner.hidden = true;
      storage.set('resume-banner-closed', '1');
    });
  }

  /* ---------- 阅读进度 ---------- */

  function initProgress() {
    var bar = $('progress');

    function update() {
      var doc = document.documentElement;
      var max = doc.scrollHeight - doc.clientHeight;
      var pct = max > 0 ? (doc.scrollTop / max) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
    }

    // 用 rAF 节流，避免滚动时反复触发布局计算
    var pending = false;
    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        update();
      });
    }, { passive: true });

    window.addEventListener('resize', update);
    update();
  }

  /* ---------- 章节导航高亮 ---------- */

  function initNavHighlight() {
    if (!('IntersectionObserver' in window)) return;

    var links = Array.prototype.slice.call(
      $('sectionNav').querySelectorAll('a')
    );
    var map = {};
    links.forEach(function (a) {
      map[a.getAttribute('href').slice(1)] = a;
    });

    var visible = {};

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0;
      });

      // 取"当前最靠上且可见"的章节作为高亮目标
      var best = null, bestTop = Infinity;
      Object.keys(visible).forEach(function (id) {
        if (visible[id] <= 0) return;
        var el = document.getElementById(id);
        if (!el) return;
        var top = el.getBoundingClientRect().top;
        if (top < bestTop) { bestTop = top; best = id; }
      });

      links.forEach(function (a) { a.classList.remove('active'); });
      if (best && map[best]) map[best].classList.add('active');
    }, {
      rootMargin: '-80px 0px -60% 0px',
      threshold: [0, 0.01, 0.5, 1]
    });

    (RESUME.sections || []).forEach(function (sec) {
      var el = document.getElementById(sec.id);
      if (el) io.observe(el);
    });
  }

  /* ---------- 打印 ---------- */

  function initPrint() {
    $('printBtn').addEventListener('click', function () {
      window.print();
    });
  }

  /* ==========================================================================
     以下为科技风动效层：全部是「加上去」的，删掉任何一段功能都不受影响
     ========================================================================== */

  /* ---------- 1. 背景粒子星网 ---------- */

  function initBackground() {
    var cv = $('bgCanvas');
    if (!cv || typeof cv.getContext !== 'function') return;

    var ctx = null;
    try { ctx = cv.getContext('2d'); } catch (e) { return; }
    if (!ctx) return;               // 无头环境（如 jsdom）直接放弃，不留副作用

    var palette = { dot: '86,200,255', wire: '124,124,255', k: 1 };
    var W = 0, H = 0, dots = [], raf = 0, running = false;
    var LINK = 132;
    var reduced = prefersReduce();

    function readPalette() {
      var dark = document.documentElement.getAttribute('data-theme') !== 'light';
      palette = dark
        ? { dot: '86,200,255', wire: '124,124,255', k: 1 }
        : { dot: '12,96,168', wire: '79,70,229', k: .72 };
    }

    function build() {
      var n = Math.round(Math.min(74, Math.max(30, (W * H) / 26000)));
      dots = [];
      for (var i = 0; i < n; i++) {
        dots.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - .5) * .26,
          vy: (Math.random() - .5) * .26,
          r: Math.random() * 1.5 + .55
        });
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth || window.innerWidth || 0;
      H = cv.clientHeight || window.innerHeight || 0;
      // 兜底：万一样式没生效（canvas 会退回默认 300×150），直接按视口尺寸画
      if (W < 320 || H < 240) {
        W = window.innerWidth || W;
        H = window.innerHeight || H;
      }
      if (!W || !H) return;
      cv.width = Math.floor(W * dpr);
      cv.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function frame() {
      ctx.clearRect(0, 0, W, H);

      var i, j, d;
      for (i = 0; i < dots.length; i++) {
        d = dots[i];
        d.x += d.vx;
        d.y += d.vy;
        if (d.x < -20) d.x = W + 20; else if (d.x > W + 20) d.x = -20;
        if (d.y < -20) d.y = H + 20; else if (d.y > H + 20) d.y = -20;
      }

      ctx.lineWidth = 1;
      for (i = 0; i < dots.length; i++) {
        for (j = i + 1; j < dots.length; j++) {
          var dx = dots[i].x - dots[j].x;
          var dy = dots[i].y - dots[j].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > LINK) continue;
          ctx.strokeStyle = 'rgba(' + palette.wire + ',' +
            ((1 - dist / LINK) * .17 * palette.k).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(dots[i].x, dots[i].y);
          ctx.lineTo(dots[j].x, dots[j].y);
          ctx.stroke();
        }
      }

      for (i = 0; i < dots.length; i++) {
        ctx.fillStyle = 'rgba(' + palette.dot + ',' +
          (.5 * palette.k).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(dots[i].x, dots[i].y, dots[i].r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (running || reduced || !dots.length) return;
      running = true;
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    readPalette();
    resize();
    start();

    bgThemeHook = readPalette;

    window.addEventListener('resize', function () {
      resize();
      if (!running) stop();
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });
  }

  /* ---------- 2. 滚动入场（错落淡入上滑） ---------- */

  function initReveal() {
    if (prefersReduce()) return;

    // 只挑"没有 hover 形变"的块做位移，卡片单独走纯透明度
    var up = document.querySelectorAll(
      '.sec, .tl-item, .def-item, .plain-list li, .tags li, .contacts li'
    );
    var fade = document.querySelectorAll('.skill-card, .proj-card, .stat, .meter');
    if (!up.length && !fade.length) return;

    // 打开开关后 .reveal-* 才会隐藏；脚本没跑到这儿时内容始终可见
    document.documentElement.classList.add('has-reveal');

    var nodes = [];
    var seen = {};

    function stage(list, cls) {
      each(list, function (el) {
        var host = (el.closest && el.closest('.sec')) || el;
        var key = host.id || 'x';
        seen[key] = (seen[key] || 0) + 1;
        el.classList.add(cls);
        // 同一章节内依次出场，最多叠 6 档，避免长列表等太久
        el.style.setProperty('--rd', Math.min(seen[key] - 1, 6) * 70 + 'ms');
        nodes.push(el);
      });
    }
    stage(up, 'reveal-up');
    stage(fade, 'reveal-fade');

    var raf = 0;

    // 用滚动位置判定，不用 IntersectionObserver —— 少一层异步依赖，
    // 也不会出现"回调没送达导致正文整块空白"的风险
    function sweep() {
      raf = 0;
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      for (var i = nodes.length - 1; i >= 0; i--) {
        var r = nodes[i].getBoundingClientRect();
        if (r.top < vh * 0.92) {
          nodes[i].classList.add('in');
          nodes.splice(i, 1);
        }
      }
      if (!nodes.length) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(sweep);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    sweep();                        // 首屏立刻判定
    requestAnimationFrame(sweep);   // 布局稳定后再判一次
    setTimeout(sweep, 400);         // 字体与图片就位后兜底再判一次
  }

  /* ---------- 3. 数字滚动 + 技能条填充 ---------- */

  function initAmbient() {
    var statEls = document.querySelectorAll('.stat-num');
    var meterEls = document.querySelectorAll('.meter-fill');
    if (!statEls.length && !meterEls.length) return;

    // 先把终值写进 DOM：无论后面动画跑不跑，屏幕上都是正确的数字
    var nums = [];
    each(statEls, function (el) {
      var target = parseFloat(el.getAttribute('data-value'));
      if (isNaN(target)) return;

      var dec = parseInt(el.getAttribute('data-decimals') || '0', 10) || 0;
      var pre = el.getAttribute('data-prefix') || '';
      var suf = el.getAttribute('data-suffix') || '';
      var fmt = function (v) { return pre + v.toFixed(dec) + suf; };

      el.textContent = fmt(target);
      nums.push({ el: el, target: target, fmt: fmt });
    });

    var pendingBars = Array.prototype.slice.call(meterEls);

    // 减弱动效时直接给终值，不做动画
    if (prefersReduce()) {
      each(pendingBars, function (b) {
        b.style.width = b.style.getPropertyValue('--w') || '0%';
      });
      return;
    }

    each(nums, function (n) { n.el.textContent = n.fmt(0); });

    var pendingNums = nums.concat();
    var raf = 0;

    function countUp(item) {
      var dur = 1150, t0 = 0;
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);         // easeOutCubic
        item.el.textContent = item.fmt(item.target * e);
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function sweep() {
      raf = 0;
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      var trigger = vh * 0.94;
      var i;

      for (i = pendingNums.length - 1; i >= 0; i--) {
        if (pendingNums[i].el.getBoundingClientRect().top < trigger) {
          countUp(pendingNums[i]);
          pendingNums.splice(i, 1);
        }
      }
      for (i = pendingBars.length - 1; i >= 0; i--) {
        if (pendingBars[i].getBoundingClientRect().top < trigger) {
          pendingBars[i].style.width =
            pendingBars[i].style.getPropertyValue('--w') || '0%';
          pendingBars.splice(i, 1);
        }
      }

      if (!pendingNums.length && !pendingBars.length) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(sweep);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    sweep();
    requestAnimationFrame(sweep);
    setTimeout(sweep, 400);
  }

  /* ---------- 4. 卡片 3D 倾斜 ---------- */

  function initTilt() {
    try {
      if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;
    } catch (e) { /* 继续 */ }

    each(document.querySelectorAll('.skill-card'), function (card) {
      var raf = 0, rx = 0, ry = 0;

      function paint() {
        raf = 0;
        card.style.transform =
          'perspective(720px) rotateY(' + ry.toFixed(2) + 'deg) rotateX(' +
          rx.toFixed(2) + 'deg) translateY(-3px)';
      }

      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        ry = (px - .5) * 10;
        rx = -((py - .5) * 10);
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        if (!raf) raf = requestAnimationFrame(paint);
      });

      card.addEventListener('mouseleave', function () {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        card.style.transform = '';
      });
    });
  }

  /* ---------- 4. 点击波纹 ---------- */

  function initRipple() {
    each(document.querySelectorAll('.ghost-btn, .cta-btn, .mobile-dl, .draft-banner button, .to-top'),
      function (btn) {
        btn.classList.add('ripple-host');
        btn.addEventListener('pointerdown', function (e) {
          var r = btn.getBoundingClientRect();
          var size = Math.max(r.width, r.height) || 40;
          var s = document.createElement('span');
          s.className = 'ripple';
          s.style.width = s.style.height = size + 'px';
          s.style.left = (e.clientX - r.left - size / 2) + 'px';
          s.style.top = (e.clientY - r.top - size / 2) + 'px';
          btn.appendChild(s);
          setTimeout(function () {
            if (s.parentNode) s.parentNode.removeChild(s);
          }, 660);
        });
      });
  }

  /* ---------- 6. 轻提示气泡 ---------- */

  var toastTimer = 0;

  function showToast(text) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 1800);
  }

  function copyText(text) {
    if (window.navigator && navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        var okd = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        okd ? resolve() : reject(new Error('copy failed'));
      } catch (err) { reject(err); }
    });
  }

  /* ---------- 7. 点击联系方式即复制 ---------- */
  function initCopyContacts() {
    each(document.querySelectorAll('#contacts li'), function (li) {
      var v = li.querySelector('.c-value');
      if (!v) return;
      li.setAttribute('title', '点击复制');
      li.addEventListener('click', function () {
        var text = (v.textContent || '').trim();
        if (!text) return;
        copyText(text).then(function () {
          showToast('已复制：' + text);
        }, function () {
          showToast(text);
        });
      });
    });
  }

  /* ---------- 8. 回到顶部 ---------- */

  function initToTop() {
    var btn = $('toTop');
    if (!btn) return;

    var pending = false;
    function update() {
      btn.classList.toggle('show', document.documentElement.scrollTop > 420);
    }

    window.addEventListener('scroll', function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; update(); });
    }, { passive: true });

    btn.addEventListener('click', function () {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (e) {
        window.scrollTo(0, 0);
      }
    });

    update();
  }

  /* ---------- 9. 手机端浮动下载按钮 ---------- */

  function initMobileDl() {
    var btn = $('mobileDl');
    if (!btn) return;

    var mq = (typeof window.matchMedia === 'function')
      ? window.matchMedia('(max-width: 900px)')
      : null;

    var pending = false;

    function update() {
      // 桌面端由 CSS 直接 display:none，这里再判一次是为了避免窗口拉宽后残留 .show
      var narrow = mq ? mq.matches : window.innerWidth <= 900;
      if (!narrow) { btn.classList.remove('show'); return; }

      // 侧栏那颗「下载 PDF 简历」滚出屏幕之后，浮动按钮才浮上来，
      // 免得同一个动作在屏幕上同时出现两次。
      var anchor = $('printBtn');
      var out = anchor
        ? anchor.getBoundingClientRect().bottom < 0
        : document.documentElement.scrollTop > 420;

      btn.classList.toggle('show', out);
    }

    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; update(); });
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', schedule);
    } else if (mq && typeof mq.addListener === 'function') {
      mq.addListener(schedule);           // 老浏览器兜底
    }

    btn.addEventListener('click', function () { window.print(); });

    update();
  }

  /* ---------- 启动 ---------- */

  function init() {
    if (typeof RESUME === 'undefined') {
      document.body.innerHTML =
        '<p style="padding:40px;font-family:sans-serif">' +
        '数据文件未加载成功，请确认 js/resume-data.js 存在。</p>';
      return;
    }

    renderSide();
    renderSections();
    renderStats();
    initTheme();
    initBanner();
    initProgress();
    initNavHighlight();
    initPrint();

    // 动效层
    initBackground();
    initReveal();
    initAmbient();
    initTilt();
    initRipple();
    initCopyContacts();
    initToTop();
    initMobileDl();

    $('footYear').textContent = '© ' + new Date().getFullYear();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
