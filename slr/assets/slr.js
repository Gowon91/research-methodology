/* slr.js — 체계적 문헌고찰 웹 교재 동작 스크립트 (바닐라 JS, 외부 의존 없음) */
(function () {
  'use strict';

  var doc = document;
  doc.documentElement.classList.add('js');

  /* ---------- 공통 도구 ---------- */
  function q(sel, root) { return (root || doc).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }
  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function safe(fn) { try { fn(); } catch (err) { if (window.console) console.warn('[slr.js]', err); } }
  function fixButtons() { qa('button:not([type])').forEach(function (b) { b.type = 'button'; }); }

  // 클립보드 복사: Clipboard API 우선, 실패하면 임시 textarea 폴백. Promise<boolean>
  function copyText(text) {
    function fallback() {
      return new Promise(function (resolve) {
        var ta = doc.createElement('textarea');
        var prev = doc.activeElement;
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        doc.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        doc.body.removeChild(ta);
        if (prev && prev.focus) prev.focus();
        resolve(ok);
      });
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return fallback();
  }

  // 상태 메시지: 몇 초 뒤 지운다
  function flash(el, text, ok, ms) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('ok', !!ok);
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.textContent = ''; el.classList.remove('ok'); }, ms || 3500);
  }

  /* ---------- 1. 핫스팟 ↔ 범례 연동 ---------- */
  // scope 안의 .hs / .shot-legend li 를 번호(data-n)로 묶어 강조한다. 이벤트는 위임 방식.
  function bindHot(scope) {
    var hover = null, pin = null;
    function items(n) {
      return qa('.hs[data-n="' + n + '"], .shot-legend li[data-n="' + n + '"]', scope);
    }
    function render() {
      var cur = hover !== null ? hover : pin;
      qa('.hs[data-n], .shot-legend li[data-n]', scope).forEach(function (el) {
        el.classList.toggle('is-on', cur !== null && el.getAttribute('data-n') === cur);
        // 범례 항목은 role=button 이므로 '고정됨' 상태를 aria-pressed 로 알린다
        if (el.tagName === 'LI' && el.getAttribute('role') === 'button') {
          el.setAttribute('aria-pressed', pin !== null && el.getAttribute('data-n') === pin ? 'true' : 'false');
        }
      });
    }
    function blink(n) {
      if (reduced()) return;
      items(n).forEach(function (el) {
        if (!el.animate) return;
        el.animate(
          [{ backgroundColor: 'rgba(255,212,71,.95)' }, { backgroundColor: 'rgba(255,212,71,.05)' },
           { backgroundColor: 'rgba(255,212,71,.95)' }, { backgroundColor: 'rgba(255,212,71,.05)' },
           { backgroundColor: 'rgba(255,212,71,.45)' }],
          { duration: 900, easing: 'ease-in-out' }
        );
      });
    }
    function hot(e) { return e.target.closest ? e.target.closest('.hs[data-n], .shot-legend li[data-n]') : null; }
    function setHover(e, on) {
      var t = hot(e);
      if (!t || !scope.contains(t)) return;
      hover = on ? t.getAttribute('data-n') : null;
      render();
    }
    function press(t) {
      var n = t.getAttribute('data-n');
      pin = pin === n ? null : n;
      render();
      if (pin !== null) blink(n);
    }
    scope.addEventListener('mouseover', function (e) { setHover(e, true); });
    scope.addEventListener('mouseout', function (e) { setHover(e, false); });
    scope.addEventListener('focusin', function (e) { setHover(e, true); });
    scope.addEventListener('focusout', function (e) { setHover(e, false); });
    // 터치: 작은 핫스팟은 손가락 끝에서 click 이 어긋날 수 있으므로 touchstart 에서 바로 처리하고,
    // 뒤따라 오는 합성 click 이 한 번 더 토글하지 않게 막는다.
    var lastTouch = 0;
    scope.addEventListener('touchstart', function (e) {
      var t = hot(e);
      if (!t || !scope.contains(t)) return;
      lastTouch = Date.now();
      press(t);
    }, { passive: true });
    scope.addEventListener('click', function (e) {
      var t = hot(e);
      if (!t || !scope.contains(t)) return;
      if (Date.now() - lastTouch < 800) return;
      press(t);
    });
    scope.addEventListener('keydown', function (e) {
      var t = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('.shot-legend li[data-n]')) {
        e.preventDefault();
        press(t);
      }
    });
    scope._hotReset = function () { hover = null; pin = null; render(); };
  }

  function initShots() {
    qa('figure.shot').forEach(function (fig) {
      var legend = q('.shot-legend', fig);
      qa('.hs[data-n]', fig).forEach(function (h) {
        h.style.pointerEvents = 'auto'; // CSS 기본값(none)을 걷어 마우스·터치를 받는다
        h.style.cursor = 'pointer';
        h.setAttribute('aria-hidden', 'true');
      });
      if (legend) {
        legend.setAttribute('role', 'group');
        if (!legend.getAttribute('aria-label')) legend.setAttribute('aria-label', '그림 안의 번호 설명 (누르면 그림에서 해당 상자를 강조)');
        qa('li[data-n]', legend).forEach(function (li) {
          li.setAttribute('role', 'button');
          li.setAttribute('aria-pressed', 'false');
          li.tabIndex = 0;
          li.style.cursor = 'pointer';
          li.setAttribute('title', '누르면 그림의 해당 상자가 깜박인다');
        });
      }
      // 확대 단추가 없는 스테이지(워크스루 등)에는 단추를 보태 키보드로도 확대할 수 있게 한다
      qa('.shot-stage', fig).forEach(function (st) {
        st.style.cursor = 'zoom-in';
        if (!q('.shot-zoom', st)) {
          var b = doc.createElement('button');
          b.className = 'shot-zoom';
          b.type = 'button';
          b.setAttribute('aria-label', '이 그림 확대');
          b.textContent = '확대 ⤢';
          st.appendChild(b);
        }
      });
      bindHot(fig);
    });
  }

  /* ---------- 2. 라이트박스 ---------- */
  var lb = null, lbStage = null, lbClose = null, lbTitle = null, lbBody = null, lbOpener = null;

  function ensureLightbox() {
    lb = q('.lightbox');
    if (!lb) {
      lb = doc.createElement('div');
      lb.className = 'lightbox';
      lb.setAttribute('role', 'dialog');
      lb.setAttribute('aria-modal', 'true');
      lb.setAttribute('aria-label', '확대 보기');
      lb.hidden = true;
      lb.innerHTML = '<div class="lb-body"><div class="lb-bar"><span class="lb-title"></span>' +
        '<button class="lb-close" type="button">닫기 ✕</button></div><div class="lb-stage"></div></div>';
      doc.body.appendChild(lb);
    }
    lbBody = q('.lb-body', lb);
    lbStage = q('.lb-stage', lb);
    lbClose = q('.lb-close', lb);
    lbTitle = q('.lb-title', lb);
    // 스크롤되는 내용이 막대 밑으로 비치지 않게, 닫기 단추가 줄어들지 않게 한다
    q('.lb-bar', lb).style.background = '#1B2635';
    lbClose.style.flex = 'none';
    lbClose.style.whiteSpace = 'nowrap';
    bindHot(lbBody);
    lbClose.addEventListener('click', closeLightbox);
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
    lb.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); return; }
      if (e.key !== 'Tab') return;
      var f = qa('button:not([disabled]), [tabindex="0"]', lb).filter(function (el) { return el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (doc.activeElement === first || !lb.contains(doc.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (doc.activeElement === last || !lb.contains(doc.activeElement))) { e.preventDefault(); first.focus(); }
    });
    // 포커스가 밖으로 나가면 되돌린다
    doc.addEventListener('focusin', function (e) {
      if (!lb.hidden && !lb.contains(e.target)) lbClose.focus();
    });
    window.addEventListener('resize', function () { if (!lb.hidden) updateLbHint(); });
  }

  function openLightbox(stage, opener) {
    if (!lb) return;
    var fig = stage.closest('figure.shot');
    var clone = stage.cloneNode(true);
    qa('.shot-zoom', clone).forEach(function (b) { b.parentNode.removeChild(b); });
    qa('img', clone).forEach(function (im) { im.loading = 'eager'; });
    clone.style.cursor = 'default';
    // slr.css 의 스테이지 규칙은 figure.shot 아래에서만 걸리므로 복제본을 같은 틀로 감싼다
    var shell = doc.createElement('figure');
    shell.className = 'shot';
    shell.style.cssText = 'margin:0;padding:0;border:0;box-shadow:none;background:none';
    shell.appendChild(clone);
    lbStage.textContent = '';
    lbStage.appendChild(shell);
    var old = q('.lb-legend', lbBody);
    if (old) old.parentNode.removeChild(old);
    var legend = fig ? q('.shot-legend', fig) : null;
    if (legend) {
      var wrap = doc.createElement('div');
      wrap.className = 'lb-legend';
      wrap.style.cssText = 'background:var(--card);border:2px solid var(--ink);padding:10px 14px;margin-top:10px';
      var lg = legend.cloneNode(true);
      lg.style.margin = '0';
      wrap.appendChild(lg);
      lbBody.appendChild(wrap);
    }
    var cap = fig ? q('figcaption', fig) : null;
    var img = q('img', stage);
    lbTitle.textContent = cap ? cap.textContent.replace(/\s*\(출처.*$/, '').trim() : (img ? (img.getAttribute('alt') || '').trim() : '');
    if (lbBody._hotReset) lbBody._hotReset();
    lbOpener = opener || doc.activeElement;
    lb.hidden = false;
    doc.body.classList.add('lb-open');
    lbStage.scrollLeft = 0;
    lbStage.scrollTop = 0;
    lbClose.focus();
    capUpscale(clone);
    updateLbHint();
  }

  // 원본보다 크게 늘어나 흐려지는 것을 줄인다: 크롭 그림이 원본의 1.5배를 넘으면 스테이지 폭을 제한한다.
  function capUpscale(clone) {
    var im = q('img', clone);
    if (!im) return;
    function apply() {
      if (!im.naturalWidth || lb.hidden) return;
      var shown = im.getBoundingClientRect().width;
      var scale = shown / im.naturalWidth;
      if (!(scale > 1.5)) return;
      var curW = clone.getBoundingClientRect().width;
      var target = Math.max(480, Math.round(curW * 1.5 / scale));
      if (target >= curW) return;
      clone.style.minWidth = target + 'px';
      clone.style.maxWidth = target + 'px';
      clone.style.marginLeft = 'auto';
      clone.style.marginRight = 'auto';
      updateLbHint();
    }
    if (im.complete && im.naturalWidth) apply();
    else im.addEventListener('load', apply, { once: true });
  }

  // 가로 스크롤이 필요한 폭이면 '밀어 보기' 안내를 막대에 보인다 (R1-014)
  function updateLbHint() {
    var bar = q('.lb-bar', lb);
    if (!bar) return;
    var hint = q('.lb-hint', bar);
    if (!hint) {
      hint = doc.createElement('span');
      hint.className = 'lb-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '← 가로로 밀어 보기 →';
      hint.style.cssText = 'font-family:var(--mono);font-size:11px;color:#C9D3E0;white-space:nowrap;margin:0 10px 0 auto';
      bar.insertBefore(hint, lbClose);
    }
    hint.hidden = !(lbStage.scrollWidth > lbStage.clientWidth + 4);
  }

  function closeLightbox() {
    if (!lb || lb.hidden) return;
    lb.hidden = true;
    doc.body.classList.remove('lb-open');
    lbStage.textContent = '';
    var old = q('.lb-legend', lbBody);
    if (old) old.parentNode.removeChild(old);
    if (lbOpener && doc.contains(lbOpener) && lbOpener.focus) lbOpener.focus();
    lbOpener = null;
  }

  function initLightbox() {
    ensureLightbox();
    doc.addEventListener('click', function (e) {
      var t = e.target;
      if (!t.closest || t.closest('.lightbox')) return;
      var stage = null, opener = null;
      var btn = t.closest('.shot-zoom');
      if (btn) { stage = btn.closest('.shot-stage'); opener = btn; }
      else if (!t.closest('.hs')) {
        stage = t.closest('.shot-stage');
        if (stage) opener = q('.shot-zoom', stage);
      }
      if (stage) openLightbox(stage, opener);
    });
  }

  /* ---------- 3. 워크스루 ---------- */
  function initWalk(w) {
    var steps = qa('.walk-step', w);
    if (!steps.length) return;
    var cap = q('.walk-cap', w), nEl = q('.walk-head .n', w);
    var prev = q('.walk-prev', w), next = q('.walk-next', w);
    var dots = qa('.walk-dots button', w);
    var cur = 0;
    steps.forEach(function (s, i) { if (s.classList.contains('is-active')) cur = i; });
    w.classList.add('is-ready');

    function preload(i) {
      if (steps[i]) qa('img', steps[i]).forEach(function (im) { im.loading = 'eager'; });
    }
    function show(i) {
      if (i < 0 || i > steps.length - 1) return;
      var had = doc.activeElement;
      cur = i;
      steps.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) {
        d.classList.toggle('is-on', k === i);
        if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
      if (cap) {
        var no = doc.createElement('span');
        no.className = 'step-no';
        no.textContent = (i + 1) + '/' + steps.length;
        cap.textContent = '';
        cap.appendChild(no);
        cap.appendChild(doc.createTextNode(steps[i].getAttribute('data-caption') || ''));
      }
      if (nEl) nEl.textContent = 'STEP ' + (i + 1) + ' / ' + steps.length;
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === steps.length - 1;
      // 눌러서 비활성이 된 단추에 있던 포커스는 반대편 단추로 옮긴다
      if (had === prev && prev.disabled && next) next.focus();
      else if (had === next && next.disabled && prev) prev.focus();
      preload(i - 1); preload(i + 1);
    }
    if (prev) prev.addEventListener('click', function () { show(cur - 1); });
    if (next) next.addEventListener('click', function () { show(cur + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); }); });
    w.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(cur + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(cur - 1); }
    });
    show(cur);
  }

  /* ---------- 4. 검색식 조립기 ---------- */
  function initQuery(root) {
    var field = root.getAttribute('data-field') || '';
    var out = q('.qstr', root), msg = q('.query-msg', root), copyBtn = q('.copy', root);
    var concepts = qa('.q-concept', root);
    if (!out) return;
    out.setAttribute('aria-live', 'polite');

    function span(cls, text) {
      var s = doc.createElement('span');
      s.className = cls; s.textContent = text;
      return s;
    }
    function render() {
      var groups = [];
      concepts.forEach(function (c) {
        var terms = qa('.chip[aria-pressed="true"]', c).map(function (ch) {
          return ch.getAttribute('data-term') || ch.textContent.trim();
        });
        if (terms.length) groups.push(terms);
      });
      while (out.firstChild) out.removeChild(out.firstChild); // 비워야 data-empty 문구가 보인다
      if (!groups.length) return;
      var frag = doc.createDocumentFragment();
      if (field) { frag.appendChild(span('fld', field)); frag.appendChild(doc.createTextNode('(')); }
      groups.forEach(function (terms, gi) {
        if (gi) frag.appendChild(span('op', ' AND '));
        var paren = terms.length > 1;
        if (paren) frag.appendChild(doc.createTextNode('('));
        terms.forEach(function (t, ti) {
          if (ti) frag.appendChild(span('op', ' OR '));
          frag.appendChild(doc.createTextNode(t));
        });
        if (paren) frag.appendChild(doc.createTextNode(')'));
      });
      if (field) frag.appendChild(doc.createTextNode(')'));
      out.appendChild(frag);
    }
    root.addEventListener('click', function (e) {
      var chip = e.target.closest ? e.target.closest('.chip') : null;
      if (!chip || !root.contains(chip)) return;
      chip.setAttribute('aria-pressed', chip.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      if (msg) { msg.textContent = ''; msg.classList.remove('ok'); }
      render();
    });
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = out.textContent;
        if (!text) { flash(msg, '복사할 검색식이 없다', false); return; }
        copyText(text).then(function (ok) {
          flash(msg, ok ? '검색식을 복사했다' : '복사하지 못했다. 식을 직접 선택해 복사한다', ok);
          if (!ok && window.getSelection) {
            var r = doc.createRange(); r.selectNodeContents(out);
            var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
          }
        });
      });
    }
    render();
  }

  /* ---------- 5. 벤 다이어그램 ---------- */
  function initVenn(root) {
    var btns = qa('[data-op]', root).filter(function (b) { return b.tagName === 'BUTTON'; });
    var read = q('.venn-read', root);
    function set(op) {
      root.setAttribute('data-op', op);
      btns.forEach(function (b) {
        var on = b.getAttribute('data-op') === op;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var html = root.getAttribute('data-text-' + op);
      if (read && html !== null) read.innerHTML = html; // 문장은 빌더가 만든 신뢰된 마크업
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-op')); }); });
    set(root.getAttribute('data-op') || 'and');
  }

  /* ---------- 6. 비교표 열 강조 ---------- */
  function initCompare(root) {
    var btns = qa('[data-col]', root);
    function sync() {
      var hl = root.getAttribute('data-hl');
      btns.forEach(function (b) {
        var on = hl !== null && b.getAttribute('data-col') === hl;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var c = b.getAttribute('data-col');
        if (root.getAttribute('data-hl') === c) root.removeAttribute('data-hl');
        else root.setAttribute('data-hl', c);
        sync();
      });
    });
    sync();
  }

  /* ---------- 7. 검색 기록표 CSV 복사 ---------- */
  function csvField(s) {
    s = s.replace(/\s+/g, ' ').trim();
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function initLog(root) {
    var btn = q('[data-act="copy-csv"]', root), table = q('table', root);
    if (!btn || !table) return;
    var label = btn.textContent;
    var bar = btn.parentNode;
    var msg = doc.createElement('span');
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.style.cssText = 'font-family:var(--mono);font-size:11.5px;color:var(--hl);margin-left:auto;margin-right:10px';
    bar.insertBefore(msg, btn);
    var timer = null;
    btn.addEventListener('click', function () {
      var rows = qa('thead tr, tbody tr', table).map(function (tr) {
        return qa('th, td', tr).map(function (c) { return csvField(c.textContent); }).join(',');
      });
      copyText(rows.join('\n')).then(function (ok) {
        clearTimeout(timer);
        btn.textContent = ok ? '복사됨 ✓' : '복사 실패';
        msg.textContent = ok ? '기록표 ' + rows.length + '행을 CSV로 복사했다' : '복사하지 못했다. 표를 직접 선택해 복사한다';
        timer = setTimeout(function () { btn.textContent = label; msg.textContent = ''; }, 2500);
      });
    });
  }

  /* ---------- 8. PRISMA 입력기 ---------- */
  // 판정 원칙: PRISMA 2020 흐름도 템플릿이 정의한 관계만 ✓/✗ 로 판정한다.
  //  식별 − 선별 전 제거 = 선별 / 확보 시도 − 확보 못 함 = 적격성 평가 /
  //  적격성 평가 − 사유별 제외 합계 (+ 기타 방법 열의 남은 보고서) = 포함 연구의 보고서 / 포함 연구 ≤ 보고서.
  //  ‘선별 − 제외 = 확보 시도’ 는 템플릿이 정한 등식이 아니므로 ‘참고’(정보)로만 알린다.
  function initPrisma(root, idx) {
    var inputs = qa('input.pz-input', root);
    var nums = inputs.filter(function (i) { return i.type === 'number'; });
    var score = q('.pz-score', root), tools = q('.pz-tools', root);
    var boxes = {};
    qa('.pz-box[data-box]', root).forEach(function (b) { boxes[b.getAttribute('data-box')] = b; });
    var key = 'slr:prisma:' + (location.pathname.split('/').pop() || 'index') + ':' + idx;
    var INT = /^\d+$/;

    var msg = doc.createElement('div');
    msg.className = 'pz-msg';
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    msg.style.cssText = 'flex-basis:100%;font-family:var(--mono);font-size:12px;line-height:1.7;color:var(--ink)';
    var note = doc.createElement('div');
    note.className = 'pz-note';
    note.style.cssText = 'flex-basis:100%;font-family:var(--mono);font-size:12px;line-height:1.7;color:var(--sub)';
    if (tools) { tools.appendChild(msg); tools.appendChild(note); }
    if (score) score.setAttribute('aria-live', 'off'); // 입력마다 읽히지 않게 한다

    function store(op) {
      try {
        if (op === 'clear') localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(inputs.map(function (i) { return i.value; })));
      } catch (e) { /* 저장소가 없어도 동작한다 */ }
    }
    function restore() {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return;
        var arr = JSON.parse(raw);
        if (arr && arr.length === inputs.length) inputs.forEach(function (i, k) { i.value = arr[k]; });
      } catch (e) { /* 무시 */ }
    }
    function filledCount() { return nums.filter(function (i) { return i.value !== ''; }).length; }
    function updateScore(extra) {
      if (score) score.textContent = '입력 ' + filledCount() + ' / ' + nums.length + ' 칸' + (extra ? ' · ' + extra : '');
    }
    function clearMarks() {
      Object.keys(boxes).forEach(function (k) { boxes[k].classList.remove('ok', 'bad'); });
      msg.textContent = '';
      note.textContent = '';
    }
    function mark(box, ok, label) {
      if (!box) return;
      var m = q('.pz-mark', box);
      box.classList.remove('ok', 'bad');
      box.classList.add(ok ? 'ok' : 'bad');
      if (m) m.textContent = label || (ok ? '✓ 일치' : '✗ 불일치');
    }

    // 값 하나가 0 이상의 정수인가. 빈 칸은 미입력(null), 브라우저가 못 읽은 값(1e, - 등)·음수·소수는 NaN.
    function parseVal(i) {
      var v = (i.value || '').trim();
      if (v === '') return (i.validity && i.validity.badInput) ? NaN : null;
      return INT.test(v) ? Number(v) : NaN;
    }
    function isBad(v) { return v !== null && isNaN(v); }
    function errEl(box, k) {
      var e = q('.pz-err', box);
      if (!e) {
        e = doc.createElement('span');
        e.className = 'pz-err';
        e.id = 'pz-err-' + idx + '-' + k;
        e.setAttribute('role', 'status');
        e.style.cssText = 'display:block;font-family:var(--mono);font-size:11px;line-height:1.5;color:#B3261E;margin-top:3px';
        box.appendChild(e);
      }
      return e;
    }
    // 모든 숫자 칸을 검사한다. 잘못된 칸에는 aria-invalid, 칸이 든 상자에는 짧은 메시지.
    function validateAll() {
      var any = false;
      var seen = {};
      nums.forEach(function (i) {
        var bad = isBad(parseVal(i));
        var box = i.closest ? i.closest('.pz-box') : null;
        if (bad) { i.setAttribute('aria-invalid', 'true'); any = true; if (box) seen[box.getAttribute('data-box') || ''] = box; }
        else { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); }
      });
      Object.keys(boxes).forEach(function (k) {
        var b = boxes[k];
        if (seen[k]) {
          var er = errEl(b, k);
          er.textContent = '0 이상의 정수만 넣는다';
          qa('input[aria-invalid="true"]', b).forEach(function (i) { i.setAttribute('aria-describedby', er.id); });
        } else {
          var e = q('.pz-err', b);
          if (e) e.textContent = '';
        }
      });
      return any;
    }

    // 칸의 합계. 사유별 제외(excl2, oth-excl)는 .pz-reason-n 칸만 더한다(없으면 상자 안 숫자 칸 전부).
    function S(name) {
      var r = { sum: 0, filled: 0, bad: false, ins: [] };
      var b = boxes[name];
      if (!b) return r;
      var ins = qa('input.pz-reason-n', b);
      if (!ins.length) ins = qa('input.pz-input[type="number"]', b);
      ins.forEach(function (i) {
        r.ins.push(i);
        var v = parseVal(i);
        if (v === null) return;
        if (isNaN(v)) { r.bad = true; return; }
        r.sum += v; r.filled++;
      });
      return r;
    }

    function check() {
      var res = {};            // 칸 이름 -> {ok, bad}
      var failed = [];
      var notes = [];
      function add(name, ok, label) {
        var r = res[name] || (res[name] = { ok: 0, bad: 0 });
        if (ok) r.ok++; else { r.bad++; failed.push(label); }
      }
      var invalid = validateAll();
      var ident = S('ident'), removed = S('removed'), screened = S('screened'), excl1 = S('excl1');
      var sought = S('sought'), notret = S('notret'), assessed = S('assessed'), excl2 = S('excl2');
      var incl = S('incl'), oi = S('oth-ident'), os = S('oth-sought'), on = S('oth-notret');
      var oa = S('oth-assessed'), oe = S('oth-excl');
      var all = [ident, removed, screened, excl1, sought, notret, assessed, excl2, incl, oi, os, on, oa, oe];
      var names = ['ident', 'removed', 'screened', 'excl1', 'sought', 'notret', 'assessed', 'excl2', 'incl', 'oth-ident', 'oth-sought', 'oth-notret', 'oth-assessed', 'oth-excl'];
      all.forEach(function (r, k) { if (r.bad && boxes[names[k]]) add(names[k], false, '숫자 칸에는 0 이상의 정수만 넣을 수 있다'); });
      // 잘못된 값이 든 칸이 낀 식은 판정하지 않는다
      function usable() {
        for (var k = 0; k < arguments.length; k++) if (!arguments[k].filled || arguments[k].bad) return false;
        return true;
      }

      // data-answer 가 있는 칸(시연 값): 같으면 시연값과 같음, 다르면 불일치 (정답이라고 말하지 않는다)
      var demoOk = {};
      qa('.pz-box', root).forEach(function (b) {
        var ans = qa('input[data-answer]', b).filter(function (i) { return i.getAttribute('data-answer') !== ''; });
        if (!ans.length) return;
        var name = b.getAttribute('data-box');
        var filled = ans.filter(function (i) { var v = parseVal(i); return v !== null && !isNaN(v); });
        if (!filled.length) return;
        var wrong = filled.some(function (i) { return parseVal(i) !== Number(i.getAttribute('data-answer')); });
        if (wrong) add(name, false, '시연 값 칸의 숫자가 원고의 시연값과 다르다');
        else if (filled.length === ans.length) { add(name, true, ''); demoOk[name] = true; }
      });

      // 템플릿 관계 1: 식별 − 선별 전 제거 = 선별한 레코드
      if (usable(ident, removed, screened))
        add('screened', screened.sum === ident.sum - removed.sum, '선별한 레코드 ≠ 식별 합계 − 선별 전 제거 합계');
      // 참고(판정 아님): 선별 − 제외 = 확보 시도 는 템플릿의 등식이 아니다
      if (usable(screened, excl1, sought) && sought.sum !== screened.sum - excl1.sum)
        notes.push('선별한 레코드 − 제외한 레코드가 확보 시도 보고서와 다르다. 이 식은 PRISMA 템플릿이 정한 등식이 아니다(레코드와 보고서가 1:1이 아닐 수 있다). 다르다면 이유를 본문에 적는다.');
      // 제외한 레코드는 선별한 레코드의 부분집합이므로 반드시 ≤ (판정)
      if (usable(screened, excl1))
        add('excl1', excl1.sum <= screened.sum, '제외한 레코드가 선별한 레코드보다 많다');
      // 템플릿 관계 2: 확보 시도 − 확보 못 함 = 적격성 평가
      if (usable(sought, notret, assessed))
        add('assessed', assessed.sum === sought.sum - notret.sum, '적격성 평가 ≠ 확보 시도 − 확보 못 함');

      // 기타 방법 열 (같은 규칙)
      // 템플릿이 정한 관계가 아니므로 판정하지 않고 참고만 한다 (한 레코드에서 보고서 여러 편을 확보할 수 있다)
      if (usable(oi, os) && os.sum > oi.sum)
        notes.push('기타 방법: 확보 시도 보고서가 식별한 레코드보다 많다. 템플릿이 정한 관계가 아니므로 이유를 본문에 적는다.');
      if (usable(os, on, oa))
        add('oth-assessed', oa.sum === os.sum - on.sum, '기타 방법: 적격성 평가 ≠ 확보 시도 − 확보 못 함');
      if (usable(oa, oe))
        add('oth-excl', oe.sum <= oa.sum, '기타 방법: 사유별 제외 합계가 평가한 보고서보다 많다');

      // 부분집합: 사유별 제외 합계 ≤ 적격성 평가 (판정)
      if (usable(assessed, excl2))
        add('excl2', excl2.sum <= assessed.sum, '사유별 제외 합계가 적격성 평가 보고서보다 많다');

      // 템플릿 관계 3: 포함 연구의 보고서 = (적격성 평가 − 사유별 제외 합계) + (기타 방법 평가 − 기타 방법 제외 합계)
      var inclReports = incl.ins[1], inclStudies = incl.ins[0];
      var rv = inclReports ? parseVal(inclReports) : null;
      var sv = inclStudies ? parseVal(inclStudies) : null;
      var othAny = oi.filled + os.filled + on.filled + oa.filled + oe.filled > 0;
      // 기타 방법 열의 남은 보고서: 평가 칸이 있으면 (평가 − 제외, 제외 칸이 비면 0), 열을 아예 안 썼으면 0, 중간까지만 썼으면 알 수 없음
      var othRemain = (oa.filled && !oa.bad && !oe.bad) ? oa.sum - oe.sum : ((othAny || oa.bad || oe.bad) ? null : 0);
      // 사유 칸이 비어 있으면 ‘제외 0건’인지 ‘아직 안 넣은 것’인지 알 수 없으므로 어긋날 때는 판정을 보류한다
      var held = false;
      var pending = !excl2.filled || (oa.filled && !oe.filled);
      if (assessed.filled && !assessed.bad && !excl2.bad && rv !== null && !isNaN(rv) && othRemain !== null) {
        var expected = assessed.sum - excl2.sum + othRemain;
        if (rv === expected) add('incl', true, '');
        else if (pending) { held = true; notes.push('판정 보류: 사유별 제외 칸이 비어 있다. 전문 단계에서 제외가 없으면 사유 칸 하나에 0을 넣는다.'); }
        else add('incl', false,
          '포함 연구의 보고서 ≠ 적격성 평가 − 사유별 제외 합계' + (othAny ? ' (+ 기타 방법의 남은 보고서)' : ''));
      }
      // 템플릿 관계 4: 포함 연구 ≤ 포함 연구의 보고서, 보고서가 있으면 연구도 1 이상
      if (sv !== null && rv !== null && !isNaN(sv) && !isNaN(rv)) {
        add('incl', sv <= rv, '포함 연구가 포함 연구의 보고서보다 많다');
        if (rv >= 1) add('incl', sv >= 1, '보고서가 있는데 포함 연구가 0이다');
      }

      if (held && res.incl && !res.incl.bad) delete res.incl; // 보류 중인 칸에는 ✓ 도 붙이지 않는다

      // 표시 반영
      clearMarks();
      var okN = 0, badN = 0;
      Object.keys(res).forEach(function (n) {
        var r = res[n];
        if (r.bad) { mark(boxes[n], false); badN++; }
        else if (r.ok) { mark(boxes[n], true, demoOk[n] && r.ok === 1 ? '✓ 시연값과 같음' : '✓ 일치'); okN++; }
      });
      updateScore('일치 ' + okN + ' · 불일치 ' + badN);
      if (badN) msg.textContent = '확인할 곳: ' + failed.filter(function (f, k) { return failed.indexOf(f) === k; }).join(' / ');
      else if (okN) msg.textContent = '검사할 수 있는 식은 모두 성립한다 (' + okN + '칸). 비어 있는 칸은 검사하지 않았다.';
      else msg.textContent = '검사할 수 있는 식이 없다. 이어지는 칸을 함께 채운 뒤 다시 누른다.';
      note.textContent = notes.length ? '참고(판정 아님): ' + notes.join(' ') : '';
      return invalid;
    }

    root.addEventListener('input', function (e) {
      if (!e.target.classList || !e.target.classList.contains('pz-input')) return;
      clearMarks();
      validateAll();
      updateScore();
      store('save');
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('pz-input')) { e.preventDefault(); check(); }
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b || !root.contains(b)) return;
      var act = b.getAttribute('data-act');
      if (act === 'check') check();
      else if (act === 'reset') {
        inputs.forEach(function (i) { i.value = ''; });
        clearMarks(); validateAll(); store('clear'); updateScore();
        msg.textContent = '모든 칸을 지웠다.';
      }
    });
    restore();
    validateAll();
    updateScore();
  }

  /* ---------- 9. 진행 막대 · 절 목차 · 앵커 ---------- */
  function initProgress() {
    var bar = q('.progress > i');
    if (!bar) return;
    var tick = false;
    function update() {
      tick = false;
      var h = doc.documentElement.scrollHeight - window.innerHeight;
      var r = h > 0 ? Math.min(1, Math.max(0, (window.pageYOffset || doc.documentElement.scrollTop) / h)) : 0;
      bar.style.width = (r * 100).toFixed(2) + '%';
    }
    function onScroll() { if (!tick) { tick = true; window.requestAnimationFrame(update); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  function initToc() {
    var toc = q('nav.toc');
    if (!toc) return;
    var details = q('details', toc);
    var wide = window.matchMedia && window.matchMedia('(min-width:1260px)').matches;
    if (details && !wide) details.open = false; // 좁은 화면에서는 처음 한 번만 접는다
    var links = qa('a[href^="#"]', toc);
    if (details) {
      // 1260px 미만: 열린 목차는 스크롤을 내리면 접는다 (열 때의 위치에서 40px 넘게 움직였을 때)
      var openY = 0;
      details.addEventListener('toggle', function () { openY = window.pageYOffset || 0; });
      window.addEventListener('scroll', function () {
        if (!details.open) return;
        if (window.matchMedia && window.matchMedia('(min-width:1260px)').matches) return;
        if (Math.abs((window.pageYOffset || 0) - openY) > 40) details.open = false;
      }, { passive: true });
      toc.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a') : null;
        if (a && !(window.matchMedia && window.matchMedia('(min-width:1260px)').matches)) details.open = false;
      });
    }
    if (!('IntersectionObserver' in window) || !links.length) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var a = map[en.target.id];
        if (!a) return;
        links.forEach(function (l) { l.classList.toggle('is-cur', l === a); });
      });
    }, { rootMargin: '-30% 0px -40% 0px', threshold: 0 });
    qa('section.ch[id]').forEach(function (s) { if (map[s.id]) io.observe(s); });
  }

  function initAnchors() {
    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a || a.closest('.lightbox')) return;
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      if (!id) return;
      var t = doc.getElementById(id);
      if (!t) return;
      e.preventDefault();
      safe(function () { openZoomFor(t); }); // 접힌 확대 상자 안의 대상이면 먼저 연다
      t.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* 무시 */ }
      if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
      try { t.focus({ preventScroll: true }); } catch (err) { t.focus(); }
    });
  }

  /* ---------- 9b. GIF 포스터 방식 (WCAG 2.2.2, 전송량) ---------- */
  // figure.fig[data-gif] 는 처음에 정지 포스터(webp)만 보인다. [재생] 단추를 누르면 data-gif-src 의 GIF 를 불러와 재생하고,
  // 다시 누르면 포스터로 되돌린다. 단추 글자는 '재생' 고정이고 상태는 aria-pressed(true=재생 중)로만 알린다.
  // 상태 변화는 role=status 한 줄로 알린다. 움직임 줄이기 설정이어도 포스터로 시작하므로 따로 처리할 것이 없다.
  // data-gif-src 가 없고 img 가 .gif 이면 같은 이름의 -poster.webp 를 포스터로 시도하고, 없으면 원본 GIF 를 그대로 둔다.
  function initGifs() {
    var figs = qa('figure.fig[data-gif]');
    qa('figure.fig').forEach(function (f) {
      var im = q('img', f);
      if (im && /\.gif(\?|#|$)/i.test(im.getAttribute('src') || '') && figs.indexOf(f) < 0) figs.push(f);
    });
    figs.forEach(function (f) { safe(function () { initGif(f); }); });
  }

  function initGif(fig) {
    var img = q('img', fig);
    if (!img || fig._gifReady) return;
    var cur = img.getAttribute('src') || '';
    var gifSrc = fig.getAttribute('data-gif-src') || '';
    var poster = cur;
    if (!gifSrc) {
      if (!/\.gif(\?|#|$)/i.test(cur)) return;
      gifSrc = cur;
      poster = cur.replace(/\.gif(\?.*)?$/i, '-poster.webp');
      // 포스터가 실제로 있을 때만 포스터 방식으로 바꾼다
      var probe = new Image();
      probe.onload = function () { fig._gifReady = false; fig.setAttribute('data-gif-src', gifSrc); img.setAttribute('src', poster); initGif(fig); };
      probe.src = poster;
      return;
    }
    fig._gifReady = true;
    var playing = false, token = 0;

    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'gif-toggle';
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = '재생';
    btn.style.cssText = 'display:inline-block;margin-top:10px;padding:6px 14px;min-height:36px;min-width:64px;' +
      'font-family:var(--mono);font-size:12px;color:var(--ink);background:var(--card);border:2px solid var(--ink);cursor:pointer';
    var st = doc.createElement('span');
    st.className = 'gif-status';
    st.setAttribute('role', 'status');
    st.style.cssText = 'margin-left:10px;font-family:var(--mono);font-size:11.5px;color:var(--sub)';
    var cap = q('figcaption', fig);
    if (cap) { fig.insertBefore(btn, cap); fig.insertBefore(st, cap); }
    else { fig.appendChild(btn); fig.appendChild(st); }

    function say(t) { st.textContent = t; }
    function backToPoster(msg, failed) {
      playing = false;
      token++;
      btn.setAttribute('aria-pressed', 'false');
      btn.removeAttribute('aria-busy');
      img.removeAttribute('data-loading');
      img.style.opacity = '';
      img.setAttribute('src', poster);
      say(msg);
      if (failed) btn.focus();
    }
    function play() {
      playing = true;
      var my = ++token;
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-busy', 'true');
      img.setAttribute('data-loading', 'true');
      img.style.opacity = '.55';
      say('GIF를 불러오는 중…');
      var loader = new Image();
      loader.onload = function () {
        if (my !== token || !playing) return;
        btn.removeAttribute('aria-busy');
        img.removeAttribute('data-loading');
        img.style.opacity = '';
        img.loading = 'eager';
        img.setAttribute('src', loader.src);
        say('재생 중');
      };
      loader.onerror = function () {
        if (my !== token) return;
        backToPoster('GIF를 불러오지 못해 포스터로 돌아갔다', true);
      };
      loader.src = fig.getAttribute('data-gif-src') || gifSrc;
    }
    btn.addEventListener('click', function () {
      if (playing) backToPoster('정지했다 (포스터)', false);
      else play();
    });
  }

  /* ---------- 9c. 확대 접이식(details.zoom-more) ---------- */
  function openZoomFor(el) {
    var d = el && el.closest ? el.closest('details.zoom-more') : null;
    if (d && !d.open) { d.open = true; return true; }
    return false;
  }

  function initZoomMore() {
    var all = qa('details.zoom-more');
    if (!all.length) return;
    function eager(d) { qa('img', d).forEach(function (im) { im.loading = 'eager'; }); }
    function fromHash() {
      var id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) { return; }
      if (!id) return;
      var t = doc.getElementById(id);
      if (t && openZoomFor(t)) {
        window.requestAnimationFrame(function () { t.scrollIntoView({ block: 'start' }); });
      }
    }
    all.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        eager(d); // 숨겨져 있던 이미지가 열린 뒤에 바로 크기를 갖도록 지연 로딩을 풀고, 레이아웃을 다시 계산하게 한다
        try { window.dispatchEvent(new Event('resize')); } catch (e) { /* 무시 */ }
      });
    });
    fromHash();
    window.addEventListener('hashchange', fromHash);
    // 인쇄: 모두 열고, 끝나면 원래 상태로 되돌린다
    var saved = null;
    window.addEventListener('beforeprint', function () {
      if (saved) return;
      saved = all.map(function (d) { return d.open; });
      all.forEach(function (d) { d.open = true; eager(d); });
    });
    window.addEventListener('afterprint', function () {
      if (!saved) return;
      all.forEach(function (d, i) { d.open = saved[i]; });
      saved = null;
    });
  }

  /* ---------- 10. reveal ---------- */
  function initReveal() {
    var els = qa('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('show'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('show'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 시작 ---------- */
  function init() {
    safe(fixButtons);
    safe(initShots);
    safe(initLightbox);
    safe(initZoomMore);
    safe(initGifs);
    qa('.walk[data-walk]').forEach(function (w) { safe(function () { initWalk(w); }); });
    qa('.query[data-query]').forEach(function (w) { safe(function () { initQuery(w); }); });
    qa('.venn[data-venn]').forEach(function (w) { safe(function () { initVenn(w); }); });
    qa('.compare').forEach(function (w) { safe(function () { initCompare(w); }); });
    qa('.log').forEach(function (w) { safe(function () { initLog(w); }); });
    qa('.prisma[data-prisma]').forEach(function (w, i) { safe(function () { initPrisma(w, i); }); });
    safe(initProgress);
    safe(initToc);
    safe(initAnchors);
    // reveal 은 실패해도 본문이 보이도록 마지막에 실행하고, 예외 시 모두 연다
    try { initReveal(); } catch (err) { qa('.reveal').forEach(function (el) { el.classList.add('show'); }); }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
