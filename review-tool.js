/* 수정 메모 도구 — 페이지에 하이라이트·박스로 메모를 남기고 사이드바에 모아 본다.
   켜기: 주소 끝에 ?review=1  /  끄기: 사이드바의 '끄기' 또는 ?review=0
   저장: 이 브라우저(localStorage). 다른 기기와 공유되지 않으므로 '내보내기'로 백업한다. */
(function () {
  'use strict';
  var LS = (function () { try { return window.localStorage; } catch (e) { return null; } })();
  function lget(k) { try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
  function lset(k, v) { try { if (LS) LS.setItem(k, v); } catch (e) {} }
  var q = new URLSearchParams(location.search).get('review');
  if (q === '1') lset('rv:on', '1');
  if (q === '0') lset('rv:on', '0');
  if (lget('rv:on') !== '1') return;
  if (window.__rv) return;
  window.__rv = true;

  var KEY = 'rv:items';
  var items = [];
  try { items = JSON.parse(lget(KEY) || '[]') || []; } catch (e) { items = []; }
  if (!Array.isArray(items)) items = [];
  items.forEach(function (x) { Object.keys(x).forEach(function (k) { if (k.charAt(0) === '_') delete x[k]; }); });
  function ser(sp) { return JSON.stringify(items, function (k, v) { return k.charAt(0) === '_' ? undefined : v; }, sp); }
  function save() { lset(KEY, ser()); }
  function pageKey() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function keyOf(it) { return it.url; }
  function uid() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 스타일(문서) ---------- */
  var st = document.createElement('style');
  st.textContent =
    '::highlight(rv-h){background:rgba(255,212,71,.65);color:inherit}' +
    '::highlight(rv-done){background:rgba(61,107,142,.25);color:inherit}' +
    '::highlight(rv-flash){background:rgba(255,120,60,.55);color:inherit}' +
    '.rv-box{position:absolute;border:2px solid #C98F00;background:rgba(255,212,71,.2);pointer-events:none;box-sizing:border-box}' +
    '.rv-box.done{border-color:#3D6B8E;background:rgba(61,107,142,.12)}' +
    '.rv-box.flash{animation:rvf 1.2s ease 2}' +
    '.rv-box i{position:absolute;left:-2px;top:-24px;min-width:22px;height:22px;padding:0 5px;background:#FFD447;color:#1B2635;border:2px solid #1B2635;font:700 12px/18px monospace;text-align:center;pointer-events:auto;cursor:pointer;font-style:normal}' +
    '@keyframes rvf{50%{background:rgba(255,120,60,.45)}}' +
    '.rv-draw{position:fixed;inset:0;z-index:2147482500;cursor:crosshair;touch-action:none;background:rgba(27,38,53,.08)}' +
    '.rv-draw b{position:fixed;border:2px dashed #B4492F;background:rgba(255,212,71,.25);pointer-events:none}' +
    '@media print{.rv-host,.rv-layer{display:none!important}}';
  document.head.appendChild(st);

  /* ---------- 텍스트 위치 ---------- */
  var host = document.createElement('div');
  host.className = 'rv-host';
  function entries() {
    var out = [], pos = 0, w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var p = n.parentNode;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.nodeName) || host.contains(n)) continue;
      out.push({ node: n, start: pos });
      pos += n.nodeValue.length;
    }
    return { list: out, total: pos, text: out.map(function (e) { return e.node.nodeValue; }).join('') };
  }
  function gpos(E, c, o) {
    var i;
    if (c.nodeType === 3) {
      for (i = 0; i < E.list.length; i++) if (E.list[i].node === c) return E.list[i].start + o;
      return null;
    }
    var b = document.createRange(); b.setStart(c, o); b.collapse(true);
    for (i = 0; i < E.list.length; i++) {
      var n = document.createRange(); n.setStart(E.list[i].node, 0); n.collapse(true);
      if (b.compareBoundaryPoints(Range.START_TO_START, n) <= 0) return E.list[i].start;
    }
    return E.total;
  }
  function locate(E, g, isEnd) {
    for (var i = 0; i < E.list.length; i++) {
      var e = E.list[i], len = e.node.nodeValue.length;
      if (isEnd ? (g > e.start && g <= e.start + len) : (g >= e.start && g < e.start + len)) return [e.node, g - e.start];
    }
    return null;
  }
  function cssPath(el) {
    var p = [];
    while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
      if (el.id && document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) { p.unshift('#' + CSS.escape(el.id)); return p.join('>'); }
      var n = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) n++;
      p.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + n + ')');
      el = el.parentElement;
    }
    return 'body' + (p.length ? '>' + p.join('>') : '');
  }
  function textTarget(sel) {
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    var r = sel.getRangeAt(0);
    if (host.contains(r.commonAncestorContainer)) return null;
    var E = entries(), a = gpos(E, r.startContainer, r.startOffset), b = gpos(E, r.endContainer, r.endOffset);
    if (a == null || b == null || b <= a) return null;
    var s = E.text.slice(a, b), lead = s.length - s.replace(/^\s+/, '').length;
    a += lead; s = E.text.slice(a, b).replace(/\s+$/, ''); b = a + s.length;
    if (s.length < 2) return null;
    var anc = r.commonAncestorContainer; if (anc.nodeType !== 1) anc = anc.parentElement;
    return { type: 'text', quote: s.slice(0, 600), prefix: E.text.slice(Math.max(0, a - 40), a), suffix: E.text.slice(b, b + 40), sel: cssPath(anc) };
  }
  function findRange(it) {
    var E = entries(), t = E.text, q0 = it.quote, i = -1, best = -1, from = 0;
    while ((i = t.indexOf(q0, from)) !== -1) {
      if (best < 0) best = i;
      if (it.prefix && t.slice(Math.max(0, i - it.prefix.length), i) === it.prefix) { best = i; break; }
      from = i + 1;
    }
    if (best < 0) return null;
    var s = locate(E, best, false), e = locate(E, best + q0.length, true);
    if (!s || !e) return null;
    var r = document.createRange(); r.setStart(s[0], s[1]); r.setEnd(e[0], e[1]);
    return r;
  }

  /* ---------- 박스 위치 ---------- */
  function docRect(el) { var r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }
  function boxTarget(c) {
    var cx = c.x + c.w / 2 - scrollX, cy = c.y + c.h / 2 - scrollY;
    var el = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, cx)), Math.min(innerHeight - 1, Math.max(0, cy)));
    while (el && el !== document.body && el !== document.documentElement) {
      var d = docRect(el);
      if (d.x <= c.x + 2 && d.y <= c.y + 2 && d.x + d.w >= c.x + c.w - 2 && d.y + d.h >= c.y + c.h - 2) break;
      el = el.parentElement;
    }
    if (!el || el === document.documentElement) el = document.body;
    var d2 = docRect(el);
    return { type: 'box', sel: cssPath(el), rel: { x: (c.x - d2.x) / (d2.w || 1), y: (c.y - d2.y) / (d2.h || 1), w: c.w / (d2.w || 1), h: c.h / (d2.h || 1) },
      abs: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }, pageW: document.documentElement.scrollWidth, quote: '',
      ctx: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100) };
  }
  function boxRect(it) {
    var el = null;
    try { el = document.querySelector(it.sel); } catch (e) {}
    if (el && it.rel) {
      var d = docRect(el);
      return { x: d.x + it.rel.x * d.w, y: d.y + it.rel.y * d.h, w: it.rel.w * d.w, h: it.rel.h * d.h };
    }
    return it.abs || null;
  }

  /* ---------- 그리기 ---------- */
  var layer = document.createElement('div');
  layer.className = 'rv-layer';
  layer.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;z-index:2147482000;pointer-events:none';
  document.documentElement.appendChild(layer);
  var hiOpen = null, hiDone = null, hiFlash = null;
  function pageItems() { var k = pageKey(); return items.filter(function (x) { return x.url === k; }); }
  function render() {
    layer.innerHTML = '';
    var cur = pageItems(), open = [], done = [], n = 0;
    cur.forEach(function (it, idx) {
      it._n = idx + 1; it._ok = false;
      if (it.type === 'text') {
        var r = findRange(it);
        it._range = r; it._ok = !!r;
        if (r) (it.done ? done : open).push(r);
      } else {
        var b = boxRect(it);
        it._ok = !!b;
        if (b) {
          var d = document.createElement('div');
          d.className = 'rv-box' + (it.done ? ' done' : ''); d.dataset.id = it.id;
          d.style.cssText = 'left:' + b.x + 'px;top:' + b.y + 'px;width:' + b.w + 'px;height:' + b.h + 'px';
          var i = document.createElement('i'); i.textContent = it._n;
          i.addEventListener('click', function () { openItem(it.id); });
          d.appendChild(i); layer.appendChild(d); it._el = d;
        }
      }
    });
    if (window.CSS && CSS.highlights) {
      CSS.highlights.set('rv-h', new Highlight());
      CSS.highlights.set('rv-done', new Highlight());
      if (open.length) CSS.highlights.set('rv-h', new (Function.prototype.bind.apply(Highlight, [null].concat(open)))());
      if (done.length) CSS.highlights.set('rv-done', new (Function.prototype.bind.apply(Highlight, [null].concat(done)))());
    }
    renderList();
  }
  var rafId = 0;
  function rerender() { clearTimeout(rafId); rafId = setTimeout(render, 60); }

  /* ---------- 사이드바(shadow DOM) ---------- */
  host.style.cssText = 'all:initial;position:fixed;top:0;right:0;bottom:0;z-index:2147483000;pointer-events:none';
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>' +
    ':host{font:14px/1.6 "Noto Sans KR",system-ui,sans-serif;color:#1B2635}*{box-sizing:border-box}' +
    '.tab{position:fixed;right:0;top:40%;pointer-events:auto;background:#FFD447;border:2px solid #1B2635;border-right:0;padding:10px 8px;writing-mode:vertical-rl;font:700 13px "Noto Sans KR",sans-serif;cursor:pointer;color:#1B2635}' +
    '.side{position:fixed;top:0;right:0;bottom:0;width:min(360px,100vw);background:#F5F4EF;border-left:2px solid #1B2635;box-shadow:-6px 0 0 rgba(27,38,53,.1);display:flex;flex-direction:column;pointer-events:auto}' +
    '.side.hide{display:none}.tab.hide{display:none}' +
    'header{padding:12px 14px;border-bottom:2px solid #1B2635;background:#fff}' +
    'h1{font:700 16px "Gowun Batang",serif;margin:0 0 8px;display:flex;justify-content:space-between;align-items:center}' +
    '.row{display:flex;flex-wrap:wrap;gap:6px}' +
    'button{font:500 13px "Noto Sans KR",sans-serif;border:2px solid #1B2635;background:#fff;color:#1B2635;padding:7px 10px;min-height:36px;cursor:pointer}' +
    'button.on,button.pri{background:#1B2635;color:#FFD447}button:focus-visible,textarea:focus-visible{outline:3px solid #3D6B8E;outline-offset:1px}' +
    'button.sm{min-height:28px;padding:2px 8px;font-size:12px}' +
    '.hint{font-size:12px;color:#5C6774;margin-top:8px}' +
    '.form{padding:12px 14px;border-bottom:2px solid #1B2635;background:#FFFBE6}.form[hidden]{display:none}' +
    '.pv{font-size:13px;border-left:5px solid #C98F00;padding:4px 8px;margin-bottom:8px;background:#fff;max-height:90px;overflow:auto}' +
    'textarea{width:100%;min-height:78px;border:2px solid #1B2635;padding:8px;font:14px/1.5 "Noto Sans KR",sans-serif;resize:vertical;background:#fff}' +
    '.list{flex:1;overflow:auto;padding:10px 14px}' +
    '.it{background:#fff;border:2px solid #1B2635;padding:10px;margin-bottom:10px;box-shadow:4px 4px 0 rgba(27,38,53,.1);cursor:pointer}' +
    '.it.done{opacity:.6}.it.orphan{border-style:dashed}' +
    '.meta{font:11px "IBM Plex Mono",monospace;color:#5C6774;margin-bottom:4px;word-break:break-all}' +
    '.q{font-size:12px;background:rgba(255,212,71,.5);padding:1px 4px;display:inline}' +
    '.c{margin-top:6px;white-space:pre-wrap;word-break:break-word}' +
    '.act{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}' +
    '.n{display:inline-block;min-width:20px;text-align:center;background:#FFD447;border:2px solid #1B2635;font:700 11px/16px monospace;margin-right:6px}' +
    '.sep{font:700 12px "IBM Plex Mono",monospace;letter-spacing:.1em;color:#3D6B8E;margin:12px 0 6px}' +
    '.empty{color:#5C6774;font-size:13px;padding:8px 0}' +
    '.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1B2635;color:#FFD447;padding:8px 14px;font-size:13px;pointer-events:none;display:none}' +
    '@media(max-width:700px){.side{top:auto;height:55vh;width:100vw;border-left:0;border-top:2px solid #1B2635}.tab{top:auto;bottom:0;right:10px;writing-mode:horizontal-tb;border:2px solid #1B2635;border-bottom:0}}' +
    '</style>' +
    '<button class="tab hide" id="tab" type="button" aria-label="수정 메모 열기">✎ 수정 메모 <span id="cnt"></span></button>' +
    '<aside class="side" id="side" aria-label="수정 메모 사이드바">' +
    '<header><h1><span>✎ 수정 메모 <small id="cnt2"></small></span><span class="row"><button class="sm" id="fold" type="button">접기 ▸</button></span></h1>' +
    '<div class="row"><button id="mText" class="on" type="button" aria-pressed="true">하이라이트</button><button id="mBox" type="button" aria-pressed="false">박스 그리기</button></div>' +
    '<div class="hint" id="hint">본문 글자를 드래그하면 하이라이트가 잡히고, [박스 그리기]를 누르면 영역을 끌어서 지정합니다. 페이지 주소와 위치는 자동으로 기록됩니다.</div></header>' +
    '<section class="form" id="form" hidden><div class="pv" id="pv"></div><textarea id="ta" placeholder="무엇을 어떻게 고칠지 적으세요 (Ctrl+Enter로 저장)" aria-label="메모"></textarea>' +
    '<div class="act"><button class="pri" id="save" type="button">저장</button><button id="cancel" type="button">취소</button></div></section>' +
    '<div class="row" style="padding:8px 14px 0"><button class="sm on" id="fThis" type="button">이 페이지</button><button class="sm" id="fAll" type="button">전체</button></div>' +
    '<div class="list" id="list" role="list"></div>' +
    '<footer style="padding:10px 14px;border-top:2px solid #1B2635;background:#fff"><div class="row"><button class="sm" id="exMd" type="button">복사(Markdown)</button><button class="sm" id="exJson" type="button">JSON 저장</button><button class="sm" id="imp" type="button">가져오기</button><button class="sm" id="off" type="button">끄기</button></div>' +
    '<input type="file" id="file" accept="application/json" hidden></footer></aside><div class="toast" id="toast" role="status"></div>';
  function $(id) { return root.getElementById(id); }
  var mode = 'text', filter = 'this', pending = null, editing = null;
  function toast(t) { var e = $('toast'); e.textContent = t; e.style.display = 'block'; setTimeout(function () { e.style.display = 'none'; }, 1800); }
  function setMode(m) {
    mode = m;
    $('mText').classList.toggle('on', m === 'text'); $('mBox').classList.toggle('on', m === 'box');
    $('mText').setAttribute('aria-pressed', String(m === 'text')); $('mBox').setAttribute('aria-pressed', String(m === 'box'));
    if (m === 'box') startDraw();
  }
  function showSide(v) { $('side').classList.toggle('hide', !v); $('tab').classList.toggle('hide', v); lset('rv:open', v ? '1' : '0'); }
  $('fold').addEventListener('click', function () { showSide(false); });
  $('tab').addEventListener('click', function () { showSide(true); });
  $('mText').addEventListener('click', function () { setMode('text'); });
  $('mBox').addEventListener('click', function () { setMode('box'); });
  $('fThis').addEventListener('click', function () { filter = 'this'; $('fThis').classList.add('on'); $('fAll').classList.remove('on'); renderList(); });
  $('fAll').addEventListener('click', function () { filter = 'all'; $('fAll').classList.add('on'); $('fThis').classList.remove('on'); renderList(); });
  $('off').addEventListener('click', function () {
    if (confirm('수정 메모 모드를 끕니다. 저장된 메모는 지워지지 않습니다. 다시 켜려면 주소 끝에 ?review=1을 붙이세요.')) { lset('rv:on', '0'); location.href = location.pathname; }
  });

  function openForm(t, existing) {
    pending = t; editing = existing || null;
    $('form').hidden = false;
    $('pv').textContent = t.type === 'text' ? '“' + t.quote.slice(0, 140) + (t.quote.length > 140 ? '…' : '') + '”' : '▭ 박스 영역 (' + t.sel + ')';
    $('ta').value = existing ? existing.comment : ''; showSide(true); $('ta').focus();
  }
  function closeForm() { pending = null; editing = null; $('form').hidden = true; $('ta').value = ''; }
  $('cancel').addEventListener('click', closeForm);
  function doSave() {
    var c = $('ta').value.trim();
    if (!pending) return;
    if (!c) { toast('메모 내용을 적어 주세요'); return; }
    if (editing) { editing.comment = c; }
    else {
      items.push({ id: uid(), type: pending.type, url: pageKey(), path: location.pathname, title: document.title,
        quote: pending.quote || '', prefix: pending.prefix || '', suffix: pending.suffix || '', sel: pending.sel, rel: pending.rel, abs: pending.abs,
        pageW: pending.pageW, ctx: pending.ctx || '', vw: innerWidth || document.documentElement.clientWidth, scrollY: Math.round(scrollY), comment: c, done: false, created: new Date().toISOString() });
    }
    save(); closeForm(); var s = getSelection(); if (s) s.removeAllRanges(); render(); toast('저장했습니다');
  }
  $('save').addEventListener('click', doSave);
  $('ta').addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doSave(); if (e.key === 'Escape') closeForm(); });

  /* 텍스트 선택 → 폼 */
  document.addEventListener('mouseup', function (e) { setTimeout(function () { if (e.composedPath && e.composedPath().indexOf(host) > -1) return; if (mode !== 'text') return; var t = textTarget(getSelection()); if (t) openForm(t); }, 10); });
  document.addEventListener('touchend', function (e) { setTimeout(function () { if (e.composedPath && e.composedPath().indexOf(host) > -1) return; if (mode !== 'text') return; var t = textTarget(getSelection()); if (t) openForm(t); }, 300); });

  /* 박스 그리기 */
  function startDraw() {
    if (innerWidth <= 700) showSide(false); /* 좁은 화면: 시트가 그리기 영역을 가리지 않게 접는다 */
    var ov = document.createElement('div'); ov.className = 'rv-draw'; var rb = document.createElement('b'); ov.appendChild(rb);
    var hint = document.createElement('div'); hint.textContent = '끌어서 영역을 지정하세요 (Esc 취소)';
    hint.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#1B2635;color:#FFD447;padding:8px 14px;font:13px sans-serif;pointer-events:none'; ov.appendChild(hint);
    document.documentElement.appendChild(ov);
    var sx = 0, sy = 0, go = false;
    function end(ok, ex, ey) {
      document.removeEventListener('keydown', esc, true); ov.remove(); setMode('text');
      if (!ok) return;
      var x = Math.min(sx, ex), y = Math.min(sy, ey), w = Math.abs(ex - sx), h = Math.abs(ey - sy);
      if (w < 8 || h < 8) { toast('영역이 너무 작습니다'); return; }
      openForm(boxTarget({ x: x + scrollX, y: y + scrollY, w: w, h: h }));
    }
    function esc(e) { if (e.key === 'Escape') end(false); }
    document.addEventListener('keydown', esc, true);
    ov.addEventListener('pointerdown', function (e) { go = true; sx = e.clientX; sy = e.clientY; ov.setPointerCapture(e.pointerId); });
    ov.addEventListener('pointermove', function (e) {
      if (!go) return;
      rb.style.left = Math.min(sx, e.clientX) + 'px'; rb.style.top = Math.min(sy, e.clientY) + 'px';
      rb.style.width = Math.abs(e.clientX - sx) + 'px'; rb.style.height = Math.abs(e.clientY - sy) + 'px';
    });
    ov.addEventListener('pointerup', function (e) { if (go) { go = false; ov.style.display = 'none'; end(true, e.clientX, e.clientY); } });
  }

  /* 목록 */
  function short(p) { return p.replace(/^\/research-methodology/, '') || '/'; }
  function renderList() {
    var n = pageItems().length;
    $('cnt').textContent = '(' + n + ')'; $('cnt2').textContent = '이 페이지 ' + n + ' · 전체 ' + items.length;
    var L = $('list'); L.innerHTML = '';
    var show = items.filter(function (x) { return filter === 'all' || x.url === pageKey(); });
    if (!show.length) { L.innerHTML = '<div class="empty">아직 메모가 없습니다. 본문을 드래그하거나 [박스 그리기]를 눌러 보세요.</div>'; return; }
    var lastUrl = null;
    show.forEach(function (it) {
      if (filter === 'all' && it.url !== lastUrl) { var s = document.createElement('div'); s.className = 'sep'; s.textContent = short(it.path); L.appendChild(s); lastUrl = it.url; }
      var cur = it.url === pageKey(), d = document.createElement('div');
      d.className = 'it' + (it.done ? ' done' : '') + (cur && it._ok === false ? ' orphan' : ''); d.setAttribute('role', 'listitem');
      var meta = (cur ? '<span class="n">' + (it._n || '') + '</span>' : '') + (it.type === 'text' ? '하이라이트' : '박스') + ' · ' + short(it.path) + (cur && it._ok === false ? ' · ⚠ 위치를 찾지 못함' : '');
      d.innerHTML = '<div class="meta"></div>' + (it.quote ? '<span class="q"></span>' : '') + '<div class="c"></div><div class="act"></div>';
      d.querySelector('.meta').innerHTML = meta;
      if (it.quote) d.querySelector('.q').textContent = '“' + it.quote.slice(0, 80) + (it.quote.length > 80 ? '…' : '') + '”';
      d.querySelector('.c').textContent = it.comment;
      var act = d.querySelector('.act');
      function btn(t, f) { var b = document.createElement('button'); b.type = 'button'; b.className = 'sm'; b.textContent = t; b.addEventListener('click', function (e) { e.stopPropagation(); f(); }); act.appendChild(b); }
      btn(it.done ? '다시 열기' : '완료', function () { it.done = !it.done; save(); render(); });
      btn('수정', function () { if (it.url !== pageKey()) { toast('해당 페이지에서 수정하세요'); return; } openForm({ type: it.type, quote: it.quote, sel: it.sel }, it); });
      btn('삭제', function () { if (confirm('이 메모를 삭제할까요?')) { items = items.filter(function (x) { return x.id !== it.id; }); save(); render(); } });
      d.addEventListener('click', function () { openItem(it.id); });
      L.appendChild(d);
    });
  }
  function openItem(id) {
    var it = items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    if (it.url !== pageKey()) { location.href = it.path + '?review=1#rv-' + id; return; }
    var top = null;
    if (it.type === 'text' && it._range) {
      top = it._range.getBoundingClientRect().top + scrollY;
      if (window.CSS && CSS.highlights) { CSS.highlights.set('rv-flash', new Highlight(it._range)); setTimeout(function () { CSS.highlights.delete('rv-flash'); }, 2500); }
    } else if (it._el) {
      top = it._el.getBoundingClientRect().top + scrollY; it._el.classList.add('flash'); setTimeout(function () { it._el.classList.remove('flash'); }, 2600);
    } else { toast('이 위치를 찾지 못했습니다. 페이지가 바뀌었을 수 있습니다'); }
    if (top != null) window.scrollTo({ top: Math.max(0, top - 120), behavior: 'smooth' });
  }

  /* 내보내기·가져오기 */
  function mdOut() {
    var out = ['# 수정 요청 목록 (' + items.length + '건)', '', '생성: ' + new Date().toLocaleString('ko-KR'), ''];
    var by = {}; items.forEach(function (x) { (by[x.url] = by[x.url] || []).push(x); });
    Object.keys(by).forEach(function (u) {
      out.push('## ' + (by[u][0].title || u) + ' — ' + u, '');
      by[u].forEach(function (x, i) {
        var link = x.type === 'text' && x.quote ? u + '#:~:text=' + encodeURIComponent(x.quote.slice(0, 60)).replace(/-/g, '%2D') : u + '?review=1#rv-' + x.id;
        out.push((i + 1) + '. [' + (x.done ? '완료' : '미완료') + '] ' + (x.type === 'text' ? '하이라이트' : '박스'));
        out.push('   - 메모: ' + x.comment.replace(/\n/g, ' / '));
        if (x.quote) out.push('   - 인용: "' + x.quote.slice(0, 200).replace(/\n/g, ' ') + '"');
        if (x.type === 'box' && x.ctx) out.push('   - 영역 근처 텍스트: "' + x.ctx + '"');
        out.push('   - 위치: `' + x.sel + '`' + (x.type === 'box' && x.rel ? ' 영역 비율 x=' + x.rel.x.toFixed(2) + ' y=' + x.rel.y.toFixed(2) + ' w=' + x.rel.w.toFixed(2) + ' h=' + x.rel.h.toFixed(2) : '') + ' (화면폭 ' + x.vw + 'px, 스크롤 ' + x.scrollY + 'px)');
        out.push('   - 바로 열기: ' + link, '');
      });
    });
    return out.join('\n');
  }
  $('exMd').addEventListener('click', function () {
    var t = mdOut();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Markdown을 복사했습니다'); }, function () { prompt('복사해서 사용하세요', t); });
    else prompt('복사해서 사용하세요', t);
  });
  $('exJson').addEventListener('click', function () {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ser(2)], { type: 'application/json' }));
    a.download = 'review-notes-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove();
  });
  $('imp').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    var f = this.files[0]; if (!f) return; var fr = new FileReader();
    fr.onload = function () {
      try {
        var arr = JSON.parse(fr.result), have = {}; items.forEach(function (x) { have[x.id] = 1; }); var add = 0;
        (Array.isArray(arr) ? arr : []).forEach(function (x) { if (x && x.id && x.url && !have[x.id]) { items.push(x); add++; } });
        save(); render(); toast(add + '건 가져왔습니다');
      } catch (e) { toast('가져오기 실패: JSON 형식이 아닙니다'); }
    };
    fr.readAsText(f); this.value = '';
  });

  /* ---------- 시작 ---------- */
  showSide(lget('rv:open') !== '0');
  function init() {
    render();
    var m = /^#rv-(.+)$/.exec(location.hash);
    if (m) setTimeout(function () { openItem(m[1]); }, 400);
  }
  if (document.readyState === 'complete') init(); else window.addEventListener('load', init);
  window.addEventListener('resize', rerender);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(rerender);
  if (window.ResizeObserver) new ResizeObserver(rerender).observe(document.body);
  /* 보조: 일부 환경에서 resize 이벤트가 누락될 때 문서 크기 변화를 주기적으로 확인 */
  var sig = '';
  setInterval(function () { var s2 = innerWidth + 'x' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight; if (s2 !== sig) { sig = s2; rerender(); } }, 700);
})();
