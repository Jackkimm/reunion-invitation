/* ═══════════════════════════════════════════════════════════
   동창회 초대장 · 프론트엔드 로직
   (내용 수정은 config.js 에서 하세요. 이 파일은 건드릴 일이 거의 없습니다)
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.CONFIG || {};
  var UI = CFG.ui || {};
  var $ = function (id) { return document.getElementById(id); };

  /**
   * 초대장은 언제나 맨 위(서예)부터 보이게 합니다.
   * 참석 투표 버튼을 누르면 주소 끝에 #rsvp 가 붙는데, 그 주소를 그대로
   * 단톡방에 공유하면 받는 사람은 투표 화면부터 열리게 됩니다.
   * 브라우저가 이전 위치를 기억해 두었다가 복원하는 경우도 막습니다.
   */
  function startAtTop() {
    try {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    } catch (e) { /* 무시 */ }

    if (window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) { /* 무시 */ }
    }

    // 부드러운 스크롤이 켜져 있어 잠시 껐다가 맨 위로 보냅니다.
    var root = document.documentElement;
    var before = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    setTimeout(function () {          // 사파리가 뒤늦게 복원하는 경우 대비
      window.scrollTo(0, 0);
      root.style.scrollBehavior = before;
    }, 0);
  }

  /** config.js 의 ui 문구를 꺼냅니다. 비어 있으면 기본 문구를 씁니다. */
  function T(key, fallback) {
    var v = UI[key];
    return (typeof v === 'string' && v.trim()) ? v : fallback;
  }
  var OTHER = '기타';
  // config.js 의 statuses 를 그대로 씁니다. (없으면 최소 형태로 대체)
  var STATUSES = (Array.isArray(CFG.statuses) && CFG.statuses.length ? CFG.statuses : [
    { value: '참석', label: '참석', emoji: '🙋', counts: true },
    { value: '불참', label: '불참', emoji: '🙇', counts: false }
  ]).map(function (s, i) { s.idx = i; return s; });

  function statusMeta(value) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].value === value) return STATUSES[i];
    return { value: value, label: T('statusOther', OTHER), emoji: '📝', idx: -1, counts: false };
  }
  var ME_KEY = 'reunion:myName';

  /* ── 1. config.js 값을 화면에 채우기 ─────────────────── */
  function applyConfig() {
    document.querySelectorAll('[data-cfg]').forEach(function (el) {
      var val = CFG[el.dataset.cfg];
      if (val) el.textContent = val; else el.hidden = true;
    });

    // 버튼·안내문 같은 고정 문구 (config.js 의 ui 항목)
    document.querySelectorAll('[data-ui]').forEach(function (el) {
      el.textContent = T(el.dataset.ui, el.textContent);
    });
    document.querySelectorAll('[data-ui-ph]').forEach(function (el) {
      el.placeholder = T(el.dataset.uiPh, el.placeholder);
    });

    applyHeroImage();
    renderSchedule();
    buildChoices();
    buildFilters();
    renderFees();
    renderAccount();

    if (Array.isArray(CFG.greeting)) $('greeting').textContent = CFG.greeting.join('\n');
    else if (CFG.greeting) $('greeting').textContent = CFG.greeting;

    linkOrHide($('kakaoMap'), CFG.kakaoMapUrl);
    linkOrHide($('naverMap'), CFG.naverMapUrl);

    var call = $('contactCall');
    if (CFG.contactPhone) {
      call.href = 'tel:' + CFG.contactPhone.replace(/[^0-9+]/g, '');
      $('contactLabel').textContent =
        (CFG.contactName ? CFG.contactName + ' ' : '') + T('callBtn', '문의하기');
    } else {
      call.hidden = true;
    }
  }

  function linkOrHide(el, url) {
    if (url) el.href = url; else el.hidden = true;
  }

  /** 참석 여부 선택 버튼을 config.js 의 statuses 로 만듭니다. */
  function buildChoices() {
    var row = $('statusRow');
    row.innerHTML = '';
    STATUSES.forEach(function (s, i) {
      var label = document.createElement('label');
      label.className = 'choice';

      var input = document.createElement('input');
      input.type = 'radio';
      input.name = 'status';
      input.value = s.value;
      if (i === 0) input.required = true;

      var box = document.createElement('span');
      box.className = 'choice__box st-' + i;

      var emoji = document.createElement('span');
      emoji.className = 'choice__emoji';
      emoji.setAttribute('aria-hidden', 'true');
      emoji.textContent = s.emoji || '•';

      var name = document.createElement('span');
      name.className = 'choice__name';
      name.textContent = s.label || s.value;

      box.appendChild(emoji);
      box.appendChild(name);
      // 시간과 회비를 한 줄로 (예: "15:00~ · 5만원")
      var sub = [s.time, s.fee].filter(Boolean).join(' · ');
      if (sub) {
        var time = document.createElement('span');
        time.className = 'choice__time';
        time.textContent = sub;
        box.appendChild(time);
      }

      label.appendChild(input);
      label.appendChild(box);
      row.appendChild(label);
    });
  }

  /** 참석 시점별 회비. statuses 에 fee 가 하나도 없으면 아무것도 그리지 않습니다. */
  function renderFees() {
    var rows = STATUSES.filter(function (s) { return s.counts && s.fee; });
    var list = $('fees');
    if (!list) return;
    if (!rows.length) { list.hidden = true; return; }

    list.innerHTML = '';
    rows.forEach(function (s) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = s.label || s.value;
      var amount = document.createElement('strong');
      amount.textContent = s.fee;
      li.appendChild(name);
      li.appendChild(amount);
      list.appendChild(li);
    });
  }

  /**
   * 계좌 + 복사 버튼.
   * 클립보드 API 가 막힌 환경(오래된 인앱 브라우저 등)을 위해
   * 눈에 안 보이는 입력칸을 만들어 복사하는 방법도 함께 씁니다.
   */
  function renderAccount() {
    var acc = CFG.account || {};
    var number = (acc.number || '').trim();
    var box = $('account');
    if (!box) return;
    if (!number) { box.remove(); return; }

    var parts = [];
    if (acc.bank) parts.push(acc.bank);
    parts.push(number);
    var text = parts.join(' ');
    if (acc.holder) text += ' (' + T('accountHolder', '예금주') + ': ' + acc.holder + ')';

    $('accountText').textContent = text;
    box.hidden = false;

    var btn = $('copyAccount');
    btn.textContent = T('copy', '복사');
    btn.addEventListener('click', function () {
      copyText(number).then(function (okCopy) {
        if (okCopy) {
          btn.textContent = T('copied', '복사됐어요');
          btn.classList.add('is-done');
          say($('copyMsg'), T('copied', '복사됐어요'), 'is-ok');
          setTimeout(function () {
            btn.textContent = T('copy', '복사');
            btn.classList.remove('is-done');
            say($('copyMsg'), '', '');
          }, 1800);
        } else {
          say($('copyMsg'), T('copyFail', '복사하지 못했어요.'), 'is-err');
        }
      });
    });
  }

  /** 계좌번호 복사. 되면 true */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text)
        .then(function () { return true; })
        .catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      document.body.appendChild(area);
      area.select();
      area.setSelectionRange(0, text.length);   // iOS 대응
      var okCopy = document.execCommand('copy');
      document.body.removeChild(area);
      return okCopy;
    } catch (e) {
      return false;
    }
  }

  /** 명단 필터 칩 만들기 */
  function buildFilters() {
    var wrap = $('filters');
    wrap.innerHTML = '';
    var items = [{ value: '전체', label: T('filterAll', '전체') }].concat(
      STATUSES.map(function (s) { return { value: s.value, label: s.label || s.value }; })
    );

    items.forEach(function (item, i) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (i === 0 ? ' is-on' : '');
      chip.dataset.filter = item.value;
      chip.textContent = item.label;
      chip.addEventListener('click', function () {
        wrap.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
        state.filter = item.value;
        renderList();
      });
      wrap.appendChild(chip);
    });
  }

  /** 하루 일정표. config.js 의 schedule 이 비어 있으면 섹션째 감춥니다. */
  function renderSchedule() {
    var rows = Array.isArray(CFG.schedule) ? CFG.schedule : [];
    if (!rows.length) return;

    var list = $('timeline');
    rows.forEach(function (row) {
      if (!row || (!row.time && !row.title)) return;

      var li = document.createElement('li');
      li.className = 'tl';

      var dot = document.createElement('span');
      dot.className = 'tl__dot';
      dot.setAttribute('aria-hidden', 'true');
      li.appendChild(dot);

      if (row.time) {
        var time = document.createElement('p');
        time.className = 'tl__time';
        time.textContent = row.time;
        li.appendChild(time);
      }

      var title = document.createElement('p');
      title.className = 'tl__title';
      title.textContent = row.title || '';
      if (row.note) {
        var note = document.createElement('em');
        note.className = 'tl__note';
        note.textContent = row.note;
        title.appendChild(document.createTextNode(' '));
        title.appendChild(note);
      }
      li.appendChild(title);
      list.appendChild(li);
    });

    if (list.children.length) $('schedule').hidden = false;
  }

  /**
   * 히어로 이미지.
   *  plate      → 한 장으로 또렷하게 보여줍니다
   *  background → 히어로 배경에 깔고 종이색 덮개를 씌웁니다
   * 이미지 파일이 없으면(404) 자동으로 감춰서 빈 자리가 생기지 않게 합니다.
   */
  function applyHeroImage() {
    var src = CFG.heroImage;
    if (!src) return;

    var hero = document.querySelector('.hero');
    if (CFG.heroImageStyle === 'background') {
      hero.classList.add('hero--bg');
      hero.style.setProperty('--hero-img', 'url("' + src + '")');
      var wash = Number(CFG.heroOverlay);
      if (wash >= 0 && wash <= 1) hero.style.setProperty('--hero-wash', wash);
      return;
    }

    var plate = $('heroPlate');
    var img = $('heroImg');
    img.alt = CFG.heroImageAlt || '';
    img.onload = function () { plate.hidden = false; };
    img.onerror = function () { plate.remove(); };
    img.src = src;
  }

  /* ── 2. D-day 카운트다운 ──────────────────────────────── */
  function startCountdown() {
    var target = CFG.date ? new Date(CFG.date) : null;
    if (!target || isNaN(target.getTime())) { $('dday').hidden = true; return; }

    function tick() {
      var diff = target.getTime() - Date.now();
      var box = $('dday');

      if (diff <= 0) {
        // 모임 당일 이후: 시계를 숨기고 문구만 바꿉니다.
        var passedDays = Math.floor(-diff / 86400000);
        box.classList.add(passedDays === 0 ? 'is-today' : 'is-past');
        $('ddayBig').textContent = passedDays === 0
          ? T('ddayToday', '오늘 만나요!')
          : T('ddayPast', '함께해 주셔서 고맙습니다');
        $('dday').querySelector('.dday__label').textContent = passedDays === 0
          ? T('ddayTodayLabel', '드디어')
          : T('ddayPastLabel', '동창회가 끝났습니다');
        return;
      }

      var days = Math.floor(diff / 86400000);
      var hours = Math.floor(diff / 3600000) % 24;
      var mins = Math.floor(diff / 60000) % 60;
      var secs = Math.floor(diff / 1000) % 60;

      $('ddayNum').textContent = days;
      $('cDays').textContent = days;
      $('cHours').textContent = pad(hours);
      $('cMins').textContent = pad(mins);
      $('cSecs').textContent = pad(secs);
    }

    tick();
    setInterval(tick, 1000);
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  /* ── 3. 참석 투표 보내기 ──────────────────────────────── */
  function setupForm() {
    var form = $('rsvpForm');
    var btn = $('submitBtn');
    var msg = $('formMsg');
    var messageEl = $('message');

    messageEl.addEventListener('input', function () {
      $('msgCount').textContent = messageEl.value.length;
    });

    // 예전에 응답한 이름은 명단에서 "나" 를 표시하는 데만 쓰고,
    // 입력칸은 비워 둡니다. (이미 적혀 있으면 남의 응답을 덮어쓸 수 있어서)

    // 투표 마감 처리
    if (CFG.rsvpDeadline) {
      var due = new Date(CFG.rsvpDeadline);
      if (!isNaN(due.getTime()) && Date.now() > due.getTime()) {
        form.querySelectorAll('input,textarea,button').forEach(function (el) { el.disabled = true; });
        say(msg, T('closed', '참석 투표가 마감되었습니다.'), 'is-err');
        return;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = $('name').value.trim().replace(/\s+/g, ' ');
      var checked = form.querySelector('input[name="status"]:checked');
      var message = messageEl.value.trim();

      if (name.length < 1) { say(msg, T('errName', '이름을 입력해 주세요.'), 'is-err'); $('name').focus(); return; }
      if (!checked) { say(msg, T('errStatusPick', T('errStatus', '참석 여부를 선택해 주세요.')), 'is-err'); return; }

      btn.disabled = true;
      btn.textContent = T('submitting', '보내는 중…');
      say(msg, '', '');

      fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, status: checked.value, message: message })
      })
        .then(readJson)
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || '저장에 실패했습니다.');
          safeSet(ME_KEY, name);
          say(msg, data.updated
            ? T('okUpdate', '응답을 수정했습니다. 고마워요!')
            : T('okNew', '참석 여부를 보냈습니다. 고마워요!'), 'is-ok');
          loadAttendees();
        })
        .catch(function (err) {
          say(msg, err.message || T('errSend', '전송 중 문제가 생겼습니다.'), 'is-err');
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = T('submit', '보내기');
        });
    });
  }

  /** 안내 문구를 넣습니다. 원래 붙어 있던 첫 클래스는 그대로 두고 상태만 바꿉니다. */
  function say(el, text, cls) {
    el.textContent = text;
    if (!el.dataset.base) el.dataset.base = el.className.split(' ')[0] || '';
    el.className = el.dataset.base + (cls ? ' ' + cls : '');
  }

  function readJson(res) {
    return res.json().catch(function () {
      throw new Error('서버 응답을 읽지 못했습니다. (' + res.status + ')');
    });
  }

  /* ── 4. 참석자 명단 ───────────────────────────────────── */
  var state = { list: [], filter: '전체' };

  /* 이름 가나다순 정렬용. 한글 자모 순서를 제대로 따르고,
     "김한빛 2" 처럼 숫자가 섞여도 사람이 보기 좋은 순서가 됩니다. */
  var collator = (function () {
    try {
      return new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' });
    } catch (e) {
      return { compare: function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); } };
    }
  })();

  function byName(a, b) {
    return collator.compare(a.name || '', b.name || '');
  }

  function loadAttendees() {
    var btn = $('refreshBtn');
    btn.classList.add('is-loading');

    return fetch('/api/attendees', { headers: { 'Accept': 'application/json' } })
      .then(readJson)
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || '명단을 불러오지 못했습니다.');
        state.list = (data.attendees || []).slice().sort(byName);   // 가나다순
        renderCounts(data.counts || {});
        renderList();
        $('listUpdated').textContent = T('updatedPrefix', '마지막 업데이트') + ' ' + timeText(new Date());
      })
      .catch(function (err) {
        $('people').innerHTML = '';
        var empty = $('listEmpty');
        empty.hidden = false;
        empty.textContent = err.message;
      })
      .then(function () { btn.classList.remove('is-loading'); });
  }

  function renderCounts(counts) {
    var wrap = $('counts');
    wrap.innerHTML = '';

    var shown = STATUSES.slice();
    if (counts[OTHER]) shown.push({ value: OTHER, label: T('statusOther', OTHER), idx: -1 });

    shown.forEach(function (s) {
      var li = document.createElement('li');
      li.className = 'count st-' + (s.idx >= 0 ? s.idx : 'other');
      var n = document.createElement('strong');
      n.textContent = counts[s.value] || 0;
      var t2 = document.createElement('span');
      t2.textContent = s.label || s.value;
      li.appendChild(n);
      li.appendChild(t2);
      wrap.appendChild(li);
    });

    renderStages(counts);
  }

  /**
   * 시간대별 예상 인원.
   * 일찍 오는 사람은 뒤 순서에도 있으므로 누적해서 보여줍니다.
   * (축구부터 온 사람은 저녁·뒷풀이에도 있다고 봅니다)
   */
  function renderStages(counts) {
    var joining = STATUSES.filter(function (s) { return s.counts; });
    if (joining.length < 2) { $('stages').textContent = ''; return; }

    var running = 0;
    var parts = joining.map(function (s) {
      running += counts[s.value] || 0;
      return (s.label || s.value) + ' ' + running + '명';
    });

    $('stages').textContent = T('stageSummary', '시간대별 예상 인원') + ' · ' + parts.join(' → ');
  }

  function renderList() {
    var wrap = $('people');
    var me = safeGet(ME_KEY);
    var rows = state.filter === '전체'
      ? state.list
      : state.list.filter(function (p) { return p.status === state.filter; });

    wrap.innerHTML = '';
    $('listEmpty').hidden = rows.length > 0;
    if (!rows.length) {
      $('listEmpty').textContent = state.filter === '전체'
        ? T('empty', '아직 응답이 없어요. 첫 번째 주인공이 되어주세요!')
        : T('emptyFiltered', '해당하는 분이 아직 없습니다.');
      return;
    }

    rows.forEach(function (p) {
      var meta = statusMeta(p.status);
      var cls = 'st-' + (meta.idx >= 0 ? meta.idx : 'other');

      var li = document.createElement('li');
      li.className = 'person ' + cls + (me && me === p.name ? ' is-me' : '');

      var body = document.createElement('div');
      body.className = 'person__body';

      var top = document.createElement('div');
      top.className = 'person__top';

      var name = document.createElement('span');
      name.className = 'person__name';
      name.textContent = p.name;

      var tag = document.createElement('span');
      tag.className = 'person__tag ' + cls;
      tag.textContent = meta.label || p.status;

      top.appendChild(name);
      top.appendChild(tag);
      if (me && me === p.name) {
        var mine = document.createElement('span');
        mine.className = 'person__me';
        mine.textContent = T('meBadge', '나');
        top.appendChild(mine);
      }
      body.appendChild(top);

      if (p.message) {
        var m = document.createElement('p');
        m.className = 'person__msg';
        m.textContent = p.message;   // textContent 사용 → HTML 삽입(XSS) 걱정 없음
        body.appendChild(m);
      }

      li.appendChild(body);
      wrap.appendChild(li);
    });
  }

  function setupList() {
    $('refreshBtn').addEventListener('click', loadAttendees);

    // 자동 새로고침: 화면이 보이는 동안에만 돌립니다.
    var every = Math.max(10, Number(CFG.refreshSeconds) || 30) * 1000;
    setInterval(function () {
      if (document.visibilityState === 'visible') loadAttendees();
    }, every);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') loadAttendees();
    });
  }

  function timeText(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  /* localStorage 는 시크릿 모드 등에서 막힐 수 있어 감싸둡니다. */
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }

  /* ── 실행 ─────────────────────────────────────────────── */
  startAtTop();
  applyConfig();
  startCountdown();
  setupForm();
  setupList();
  $('people').innerHTML = '<li class="skeleton"></li><li class="skeleton"></li>';
  loadAttendees();
})();
