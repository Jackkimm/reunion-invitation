/* ═══════════════════════════════════════════════════════════
   동창회 초대장 · 프론트엔드 로직
   (내용 수정은 config.js 에서 하세요. 이 파일은 건드릴 일이 거의 없습니다)
═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CFG = window.CONFIG || {};
  var UI = CFG.ui || {};
  var $ = function (id) { return document.getElementById(id); };

  /** config.js 의 ui 문구를 꺼냅니다. 비어 있으면 기본 문구를 씁니다. */
  function T(key, fallback) {
    var v = UI[key];
    return (typeof v === 'string' && v.trim()) ? v : fallback;
  }
  var STATUSES = ['참석', '불참', '미정'];
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

    // 예전에 응답한 이름을 기억해 두었다가 다시 채워줍니다.
    var saved = safeGet(ME_KEY);
    if (saved) $('name').value = saved;

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
      if (!checked) { say(msg, T('errStatus', '참석 여부를 선택해 주세요.'), 'is-err'); return; }

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

  function say(el, text, cls) {
    el.textContent = text;
    el.className = 'form__msg ' + (cls || '');
  }

  function readJson(res) {
    return res.json().catch(function () {
      throw new Error('서버 응답을 읽지 못했습니다. (' + res.status + ')');
    });
  }

  /* ── 4. 참석자 명단 ───────────────────────────────────── */
  var state = { list: [], filter: '전체' };

  function loadAttendees() {
    var btn = $('refreshBtn');
    btn.classList.add('is-loading');

    return fetch('/api/attendees', { headers: { 'Accept': 'application/json' } })
      .then(readJson)
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || '명단을 불러오지 못했습니다.');
        state.list = data.attendees || [];
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
    $('cntYes').textContent = counts['참석'] || 0;
    $('cntNo').textContent = counts['불참'] || 0;
    $('cntMaybe').textContent = counts['미정'] || 0;
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
      var li = document.createElement('li');
      li.className = 'person person--' + p.status + (me && me === p.name ? ' is-me' : '');

      var body = document.createElement('div');
      body.className = 'person__body';

      var top = document.createElement('div');
      top.className = 'person__top';

      var name = document.createElement('span');
      name.className = 'person__name';
      name.textContent = p.name;

      var tag = document.createElement('span');
      tag.className = 'person__tag person__tag--' + p.status;
      tag.textContent = p.status;

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
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
        chip.classList.add('is-on');
        state.filter = chip.dataset.filter;
        renderList();
      });
    });

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
  applyConfig();
  startCountdown();
  setupForm();
  setupList();
  $('people').innerHTML = '<li class="skeleton"></li><li class="skeleton"></li>';
  loadAttendees();
})();
