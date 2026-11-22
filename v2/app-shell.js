/* Demo-only phone app layer (22/11/2026, design "Option 1 – preferred", Design 1).
   Layout only: bottom tabs, home, "More", the add button in the top bar, pinned search, the guest card as a sheet,
   big choices, pull to refresh, offline line. Every field, value and save path is the portal's own; this file only
   moves things on screen and presses the portal's own buttons. Phones only (≤759px); the computer just gets the look (CSS). */
(function () {
  'use strict';
  var H = window.KaiAppHost;
  if (!H || !document.body.classList.contains('km-app')) return;
  var $ = function (id) { return document.getElementById(id); };
  var phone = window.matchMedia('(max-width: 759px)');
  var t = function (s) { return window.kl ? kl(s, 'shell') : s; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var IC = {
    home: '<path d="M4 11l8-6.5 8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
    guests: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.8.1 4.8 1.8 5.4 4.9"/>',
    sched: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    budget: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    brief: '<path d="M9 5h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10"/><path d="M8 11h8M8 15h5"/>',
    tasks: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    phone: '<path d="M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5z"/><path d="M11 18.5h2"/>',
    back: '<path d="M15 5l-7 7 7 7"/>', chev: '<path d="M9 6l6 6-6 6"/>',
    call: '<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/>',
    wa: '<path d="M4 20l1.2-3.9A8 8 0 1 1 8 19z"/>'
  };
  var ic = function (n, s) { return '<svg aria-hidden="true" width="' + (s || 24) + '" height="' + (s || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; };
  var TITLES = { home: 'Home', guests: 'Guests', sched: 'Schedule', budget: 'Budget', more: 'More', brief: 'Questions', tasks: 'Tasks' };
  var cur = 'guests';

  // ---------- pieces added to the page (hidden on the computer by CSS) ----------
  var main = document.querySelector('main.wrap'), topIn = document.querySelector('.top-in');
  var home = document.createElement('section'); home.id = 'km-home'; home.className = 'km-page'; home.hidden = true; main.appendChild(home);
  var more = document.createElement('section'); more.id = 'km-more'; more.className = 'km-page'; more.hidden = true; main.appendChild(more);
  var navt = document.createElement('div'); navt.className = 'km-navt'; navt.setAttribute('aria-hidden', 'true'); topIn.appendChild(navt);
  var addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.className = 'km-add'; addBtn.hidden = true; topIn.appendChild(addBtn);
  var tabs = document.createElement('nav'); tabs.className = 'km-tabs'; tabs.setAttribute('aria-label', t('Sections')); document.body.appendChild(tabs);
  var offline = document.createElement('div'); offline.className = 'km-offline'; offline.setAttribute('role', 'status'); offline.hidden = true;
  offline.textContent = t('No connection. Changes can’t be saved until you’re back online.'); document.body.appendChild(offline);
  var ptr = document.createElement('div'); ptr.className = 'km-ptr'; ptr.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-8.5 6"/></svg>'; document.body.appendChild(ptr);
  var dim = document.createElement('div'); dim.className = 'km-dim'; dim.hidden = true; document.body.appendChild(dim);
  // Guests: big title, then the counts line; the search, the ⋯ button and the views are pinned while scrolling
  var title = $('km-guests-title'), count = document.createElement('p'); count.className = 'km-count'; title.after(count);
  var pin = document.createElement('div'); pin.className = 'km-pin'; count.after(pin);
  ['.toolbar', '#fchips', '.tabrow'].forEach(function (sel) { var el = document.querySelector('#app > ' + sel); if (el) pin.appendChild(el); });

  // ---------- tabs ----------
  function tabList() { return ['home', 'guests'].concat($('s-sched').hidden ? [] : ['sched']).concat($('s-budget').hidden ? [] : ['budget']).concat(['more']); }
  function moreBadge() { var n = $('s-brief-n'); return n && !n.hidden && !$('s-brief').hidden ? n.textContent : ''; }
  function drawTabs() {
    var on = cur === 'brief' || cur === 'tasks' ? 'more' : cur, b = moreBadge();
    var h = tabList().map(function (k) {
      return '<button type="button" data-km="' + k + '"' + (k === on ? ' class="on" aria-current="page"' : '') + '>' + ic(k) + '<span>' + esc(t(TITLES[k])) + '</span>' + (k === 'more' && b ? '<em>' + esc(b) + '</em>' : '') + '</button>';
    }).join('');
    if (tabs.kmHtml !== h) { tabs.kmHtml = h; tabs.innerHTML = h; }
  }
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('[data-km]'); if (!b) return;
    if (b.dataset.km === cur) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    H.show(b.dataset.km);
  });

  // ---------- the add button in the top bar: presses the section's own add button ----------
  function addTarget() {
    if (cur === 'guests') return H.canAddGuest() ? { label: 'Guest', go: H.addGuest } : null;
    var q = { sched: '#sched .sc-day:not(.sc-phone-inactive) [data-scadd]', budget: '#budget .bv-pay', tasks: '#kai-tasks .kt-header .btn.primary' }[cur];
    var el = q && document.querySelector(q); if (!el || el.disabled) return null;
    return { label: { sched: 'Row', budget: 'Payment', tasks: 'Task' }[cur], go: function () { el.click(); } };
  }
  var addGo = null;
  function drawAdd() {
    var a = addTarget(); addGo = a && a.go; if (addBtn.hidden !== !a) addBtn.hidden = !a;
    if (a) { var txt = '+ ' + t(a.label); if (addBtn.textContent !== txt) addBtn.textContent = txt; addBtn.setAttribute('aria-label', t('Add') + ' ' + t(a.label)); }
  }
  addBtn.addEventListener('click', function () { if (addGo) addGo(); });

  // ---------- top bar title: the couple's name; the section's name once its big title has scrolled away ----------
  function drawNav() {
    var scrolled = window.scrollY > 44 && cur !== 'home';
    document.body.classList.toggle('km-scrolled', scrolled);
    var txt = scrolled ? t(TITLES[cur]) : ($('couple').textContent || '');
    if (navt.textContent !== txt) navt.textContent = txt;
  }
  window.addEventListener('scroll', drawNav, { passive: true });

  // ---------- guests counts line ----------
  function drawCount() {
    var d = H.home(), r = d.rsvp, parts = [d.guests + ' ' + t(d.guests === 1 ? 'guest' : 'guests')];
    if (r.Confirmed) parts.push(r.Confirmed + ' ' + t('confirmed'));
    if (r.Maybe) parts.push(r.Maybe + ' ' + t('maybe'));
    if (r.Declined) parts.push(r.Declined + ' ' + t('declined'));
    var txt = parts.join(' · '); if (count.textContent !== txt) count.textContent = txt;
  }

  // ---------- home ----------
  function days(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); if (!m) return null;
    var n = new Date(); n = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - n) / 86400000);
  }
  function dmy(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function hm(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : -1; }
  function kpi(k, label, val, sub, cls) { return '<button type="button" class="km-kpi" data-go="' + k + '"><small>' + esc(t(label)) + '</small><b class="' + (cls || '') + '">' + val + '</b><span>' + esc(sub) + '</span></button>'; }
  function drawHome() {
    var d = H.home(), n = days(d.date), tk = window.KaiTasks && KaiTasks.counts ? KaiTasks.counts() : null, h = '';
    if (d.today) {
      var now = new Date(), nowM = now.getHours() * 60 + now.getMinutes(), at = -1;
      d.today.rows.forEach(function (r, i) { if (hm(r.time) >= 0 && hm(r.time) <= nowM) at = i; });
      var wd = new Date().toLocaleDateString('en-GB', { weekday: 'short' });
      h += '<h1 class="km-h1">' + esc(t('Today')) + '</h1><p class="km-sub">' + esc(wd + ' ' + d.today.day) + '</p><div class="km-list">' +
        d.today.rows.map(function (r, i) {
          return '<button type="button" class="km-li km-today' + (i === at ? ' now' : '') + '" data-go="sched"><b class="tm">' + esc(r.time) + '</b><span class="tx"><b>' + esc(r.what) + '</b>' +
            (i === at ? '<small class="nowl">' + esc(t('Now')) + '</small>' : r.where ? '<small>' + esc(r.where) + '</small>' : '') + '</span></button>';
        }).join('') + '</div><div class="km-grp">' + esc(t('Summary')) + '</div>';
    } else {
      h += '<h1 class="km-h1">' + esc(t('Hi') + ' ' + d.couple) + '</h1><p class="km-sub">' + esc([dmy(d.date), n > 0 ? n + ' ' + t(n === 1 ? 'day to go' : 'days to go') : ''].filter(Boolean).join(' · ')) + '</p>';
    }
    // Confirmed guests: the number (centred), then one small column per age group of the event
    var AGEW = { Adult: 'Adults', Teen: 'Teens', Child: 'Children', Baby: 'Babies' };
    var k = ['<button type="button" class="km-kpi km-kg" data-go="guests"><small>' + esc(t('Confirmed')) + '</small><span class="km-hn"><b>' + (d.rsvp.Confirmed || 0) + '</b><i>' + esc(t('of')) + ' ' + d.guests + '</i></span>' +
      '<span class="km-t3">' + (d.ages || []).map(function (a) { return '<span><b>' + a[1] + '</b><i>' + esc(t(AGEW[a[0]] || a[0])) + '</i></span>'; }).join('') + '</span></button>'];
    // Left to pay: euros and shekels the same size; with one currency, a bigger amount, its total and how much is paid
    if (d.budget) {
      var b = d.budget, cs = [];
      if (b.e > 0.005) cs.push({ c: '', name: 'Euros', left: Math.max(b.e - b.ep, 0), tot: b.e, paid: b.ep });
      if (b.i > 0.005) cs.push({ c: '₪', name: 'Shekels', left: Math.max(b.i - b.ip, 0), tot: b.i, paid: b.ip });
      var inner = cs.length > 1 ? cs.map(function (x) { return '<span class="km-m"><i>' + esc(t(x.name)) + '</i><b>' + esc(b.money(x.left, x.c)) + '</b></span>'; }).join('')
        : cs.length ? '<span class="km-hn"><b>' + esc(b.money(cs[0].left, cs[0].c)) + '</b></span><span class="km-of">' + esc(t('of')) + ' ' + esc(b.money(cs[0].tot, cs[0].c)) + '</span>' +
          '<span class="km-pb"><i style="width:' + Math.min(100, Math.round(cs[0].paid / cs[0].tot * 100)) + '%"></i></span><span class="km-of">' + Math.round(cs[0].paid / cs[0].tot * 100) + '% ' + esc(t('paid')) + '</span>'
        : '<span class="km-of">' + esc(t('Nothing yet')) + '</span>';
      k.push('<button type="button" class="km-kpi km-kb' + (cs.length > 1 ? ' two' : '') + '" data-go="budget"><small>' + esc(t('Left to pay')) + '</small>' + inner + '</button>');
    }
    if (tk && tk.total) k.push(kpi('tasks', 'Tasks', tk.done + ' / ' + tk.total, t('done')));
    if (d.brief && d.brief.total) { var left = d.brief.total - d.brief.done; k.push(kpi('brief', 'Questions', String(left), t(left ? 'to answer' : 'all answered ✓'), left ? 'bad' : '')); }
    h += '<div class="km-kpis">' + k.join('') + '</div>';
    var next = [];
    if (d.brief && d.brief.total > d.brief.done) next.push(['brief', 'Answer the ceremony questions', (d.brief.total - d.brief.done) + ' ' + t('left')]);
    if (tk) tk.next.slice(0, 2).forEach(function (x) { next.push(['tasks', x, t('Task · important')]); });
    if (d.budget && d.budget.vend[0]) next.push(['budget', t('Pay') + ' ' + d.budget.vend[0].name, d.budget.money(d.budget.vend[0].left, d.budget.vend[0].cur) + ' ' + t('left')]);
    next = next.slice(0, 3);
    if (next.length) h += '<div class="km-grp">' + esc(t('Next up')) + '</div><div class="km-list">' + next.map(function (x) {
      return '<button type="button" class="km-li" data-go="' + x[0] + '"><span class="tx"><b dir="auto">' + esc(t(x[1])) + '</b><small>' + esc(x[2]) + '</small></span>' + ic('chev', 18) + '</button>';
    }).join('') + '</div>';
    if (home.kmHtml !== h) { home.kmHtml = h; home.innerHTML = h; }
  }
  home.addEventListener('click', function (e) { var b = e.target.closest('[data-go]'); if (b) H.show(b.dataset.go); });
  document.addEventListener('kai-tasks-changed', function () { if (cur === 'home') setTimeout(drawHome, 0); });

  // ---------- more ----------
  function drawMore() {
    var tk = window.KaiTasks && KaiTasks.counts ? KaiTasks.counts() : null, b = moreBadge(), rows = [];
    if (!$('s-brief').hidden) rows.push(['brief', 'brief', 'Questions', b ? '<em>' + esc(b) + '</em>' : '']);
    if (window.KaiTasks) rows.push(['tasks', 'tasks', 'Tasks', tk && tk.total ? '<i>' + tk.done + ' / ' + tk.total + '</i>' : '']);
    if ('PushManager' in window && 'serviceWorker' in navigator) rows.push(['push', 'bell', 'Notifications', '']);
    if (H.canInstall()) rows.push(['install', 'phone', 'Save to home screen', '']);
    if (!$('toadmin').hidden) rows.push(['events', 'back', 'All events', '']);
    var h = '<h1 class="km-h1">' + esc(t('More')) + '</h1><div class="km-list">' + rows.map(function (r) {
      return '<button type="button" class="km-li km-mi" data-more="' + r[0] + '">' + ic(r[1], 22) + '<span class="tx"><b>' + esc(t(r[2])) + '</b></span>' + r[3] + ic('chev', 18) + '</button>';
    }).join('') + '</div>';
    if (more.kmHtml !== h) { more.kmHtml = h; more.innerHTML = h; }
  }
  more.addEventListener('click', function (e) {
    var b = e.target.closest('[data-more]'); if (!b) return; var k = b.dataset.more;
    if (k === 'brief' || k === 'tasks') H.show(k);
    else if (k === 'push') H.openPush(); else if (k === 'install') H.openInstall();
    else if (k === 'events') location.href = $('toadmin').href;
  });

  // ---------- section changes (called by the portal's showSect) ----------
  window.KaiApp = {
    onSect: function (name) {
      var changed = name !== cur; cur = name;
      document.body.dataset.kmSect = name;
      if (name === 'home') drawHome(); if (name === 'more') drawMore();
      drawTabs(); drawAdd(); if (changed && phone.matches) window.scrollTo(0, 0); drawNav();
    }
  };
  // keep tabs, add button, counts and badges in step with whatever the portal redraws
  var raf = 0;
  function refreshBits() { raf = 0; drawTabs(); drawAdd(); drawNav(); if (cur === 'guests') drawCount(); if (cur === 'more') drawMore(); if (typeof tasksSheet === 'function') tasksSheet(); if (typeof watchWindows === 'function') watchWindows(); }
  new MutationObserver(function () { if (!raf) raf = requestAnimationFrame(refreshBits); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });

  // first screen on the phone: Home (unless the link asks for a section)
  function start() {
    if ($('app').hidden) return false;
    cur = H.sect(); document.body.dataset.kmSect = cur;
    if (phone.matches && !location.hash && cur === 'guests') H.show('home'); else window.KaiApp.onSect(cur);
    drawCount();
    return true;
  }
  if (!start()) { var so = new MutationObserver(function () { if (start()) so.disconnect(); }); so.observe($('app'), { attributes: true, attributeFilter: ['hidden'] }); }

  // ---------- pull down to refresh (instead of the Refresh buttons) ----------
  (function () {
    var y0 = null, dy = 0, busy = false;
    function blocked(el) { return document.body.classList.contains('menu-open') || !$('panel').hidden || el.closest('dialog,.dialog,.sheet,.msheet,.menu,.fpop,.km-as,input,textarea,select,[contenteditable],.kt-details,.tablewrap'); }
    document.addEventListener('touchstart', function (e) {
      y0 = null; if (!phone.matches || busy || window.scrollY > 0 || e.touches.length !== 1 || blocked(e.target)) return;
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (y0 == null) return; dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) { y0 = null; ptr.style.transform = ''; ptr.classList.remove('on'); return; }
      var p = Math.min(dy * 0.5, 80); ptr.classList.add('on'); ptr.style.transform = 'translate(-50%,' + p + 'px) rotate(' + (p * 4) + 'deg)';
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (y0 == null) return; y0 = null;
      if (dy * 0.5 < 60) { ptr.classList.remove('on'); ptr.style.transform = ''; return; }
      busy = true; ptr.classList.add('spin'); ptr.style.transform = 'translate(-50%,56px)';
      var jobs = [Promise.resolve(H.refresh())];
      if (cur === 'tasks' && window.KaiTasks && KaiTasks.reload) jobs.push(KaiTasks.reload());
      Promise.all(jobs).catch(function () {}).then(function () { busy = false; ptr.classList.remove('on', 'spin'); ptr.style.transform = ''; if (cur === 'home') drawHome(); });
    }, { passive: true });
  })();

  // ---------- no connection ----------
  function net() { if (offline.hidden !== (navigator.onLine !== false)) offline.hidden = navigator.onLine !== false; document.body.classList.toggle('km-off', !offline.hidden); }
  window.addEventListener('online', net); window.addEventListener('offline', net); net();

  // ---------- the guest card as a sheet: opens half way, pull up (or scroll) for everything, pull down to close ----------
  var panel = $('panel'), lastOpen = false;
  function sheetOn() { return phone.matches && !panel.hidden && panel.classList.contains('pm'); }
  function quick() {
    var hd = panel.querySelector('.pm-hd'); if (!hd) return;
    if (!hd.querySelector('.km-grab')) { var g = document.createElement('button'); g.type = 'button'; g.className = 'km-grab'; g.setAttribute('aria-label', t('Show all details')); hd.prepend(g); }
    var st = panel.querySelector('select[data-pf="status"]'), ph = panel.querySelector('input[data-pf="phone"]'), grp = panel.querySelector('input[data-pf="group"]');
    var q = hd.querySelector('.km-quick'); if (!q) { q = document.createElement('div'); q.className = 'km-quick'; hd.appendChild(q); }
    var s = st ? st.value : '', cls = { Confirmed: 'ok', Maybe: 'warn', Declined: 'bad' }[s] || '', num = ph ? ph.value.replace(/[^\d+]/g, '') : '';
    var label = st && st.selectedOptions[0] ? st.selectedOptions[0].textContent : s;
    var html = '<div class="km-qs"><span dir="auto">' + esc(grp && grp.value || '') + '</span>' + (s ? '<span class="km-pill ' + cls + '">' + esc(label) + '</span>' : '') + '</div>' +
      (num ? '<div class="km-qb"><a class="km-qbtn" href="tel:' + esc(num) + '">' + ic('call', 18) + esc(t('Call')) + '</a><a class="km-qbtn" target="_blank" rel="noopener" href="' + esc(H.waLink(num)) + '">' + ic('wa', 18) + esc(t('WhatsApp')) + '</a></div>' : '');
    if (q.innerHTML !== html) q.innerHTML = html;
  }
  function sheet() {
    var on = sheetOn();
    if (on && !lastOpen) panel.classList.remove('km-full');   // every opening starts half way
    // closing already slides the card down (the portal's own motion); the dim fades out with it
    dim.classList.toggle('km-out', on && panel.classList.contains('pm-dismissing'));
    if (dim.hidden !== !on) dim.hidden = !on;
    lastOpen = on; document.body.classList.toggle('km-sheet', on);
    if (on) quick();
  }
  new MutationObserver(function () { sheet(); }).observe(panel, { attributes: true, attributeFilter: ['hidden', 'class'], childList: true });
  panel.addEventListener('change', function (e) { if (e.target.matches('[data-pf="status"],[data-pf="phone"],[data-pf="group"]')) quick(); });
  panel.addEventListener('input', function (e) { if (e.target.matches('[data-pf="phone"],[data-pf="group"]')) quick(); });
  panel.addEventListener('scroll', function (e) { if (sheetOn() && !panel.classList.contains('km-full') && e.target.classList && e.target.classList.contains('pm-body') && e.target.scrollTop > 6) panel.classList.add('km-full'); }, true);
  panel.addEventListener('click', function (e) {
    if (e.target.closest('.km-grab')) panel.classList.toggle('km-full');
    else if (sheetOn() && e.target.closest('.pm-ch')) panel.classList.add('km-full');   // opening a section shows the whole card
  });
  panel.addEventListener('focusin', function (e) { if (sheetOn() && e.target.matches('input,textarea')) panel.classList.add('km-full'); });
  (function () {   // drag the top of the sheet up to open it fully
    var y = null;
    panel.addEventListener('touchstart', function (e) { y = sheetOn() && !panel.classList.contains('km-full') && e.target.closest('.pm-hd') && !e.target.closest('a,button:not(.km-grab),input,select') ? e.touches[0].clientY : null; }, { passive: true });
    panel.addEventListener('touchmove', function (e) { if (y != null && y - e.touches[0].clientY > 30) { panel.classList.add('km-full'); y = null; } }, { passive: true });
  })();
  dim.addEventListener('click', function () { if (sheetOn()) H.closeGuest(); });

  // ---------- big choices: lists with a few values open as large buttons from the bottom ----------
  var as = null;
  function closeSheet() { if (as) { as.remove(); as = null; } }
  function choose(sel) {
    closeSheet();
    var opts = Array.prototype.filter.call(sel.options, function (o) { return !o.disabled; });
    var lab = sel.closest('label'), name = lab ? lab.firstChild && lab.firstChild.nodeType === 3 ? lab.firstChild.nodeValue : sel.getAttribute('aria-label') : sel.getAttribute('aria-label');
    var color = { Confirmed: 'ok', Maybe: 'warn', Declined: 'bad' };
    as = document.createElement('div'); as.className = 'km-as'; as.setAttribute('role', 'dialog'); as.setAttribute('aria-label', name || '');
    as.innerHTML = '<div class="km-as-in">' + (name ? '<div class="km-as-h">' + esc(name.trim()) + '</div>' : '') + opts.map(function (o) {
      return '<button type="button" data-v="' + esc(o.value) + '" class="' + (color[o.value] || '') + (o.value === sel.value ? ' on' : '') + '">' + (color[o.value] ? '<i></i>' : '') + esc(o.textContent || '—') + (o.value === sel.value ? ' ✓' : '') + '</button>';
    }).join('') + '</div><button type="button" class="km-as-x">' + esc(t('Cancel')) + '</button>';
    document.body.appendChild(as);
    as.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { closeSheet(); return; }
      if (b.dataset.v != null && b.dataset.v !== sel.value) {
        sel.value = b.dataset.v;
        sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeSheet();
    });
  }
  function pickable(el) { return phone.matches && el && el.tagName === 'SELECT' && !el.disabled && !el.multiple && el.options.length >= 2 && el.options.length <= 8 && el.closest('#panel.pm, #kai-tasks .kt-details, #dlg'); }
  function grab(e) { var s = e.target.closest && e.target.closest('select'); if (!pickable(s)) return; if (e.cancelable) e.preventDefault(); s.focus({ preventScroll: true }); choose(s); }
  document.addEventListener('touchstart', grab, { passive: false });
  document.addEventListener('mousedown', function (e) { if (phone.matches && window.matchMedia('(pointer: coarse)').matches) grab(e); });

  // ---------- tasks: the editor opens as a tall sheet over the dimmed list; tapping outside closes it (with the usual unsaved-changes question) ----------
  var tdim = document.createElement('div'); tdim.className = 'km-dim km-tdim'; tdim.hidden = true; document.body.appendChild(tdim);
  var tWatch = null;
  function tasksSheet() {
    var ed = document.querySelector('#kai-tasks .kt-editor');
    if (ed && ed !== tWatch) { tWatch = ed; new MutationObserver(tasksSheet).observe(ed, { attributes: true, attributeFilter: ['hidden'] }); }
    var on = !!(ed && !ed.hidden && phone.matches && cur === 'tasks');
    if (tdim.hidden !== !on) tdim.hidden = !on;
  }
  tdim.addEventListener('click', function () { var x = document.querySelector('#kai-tasks .kt-editor .kt-close'); if (x) x.click(); });
  document.addEventListener('kai-tasks-changed', tasksSheet);

  // ---------- every other bottom window moves the same way: slides up when it opens, slides down when it closes ----------
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function ghost(el, where) {   // a still copy slides away; the real window is already closed
    if (!phone.matches || reduceMotion.matches || !el) return;
    // the copy keeps the ids so it looks exactly the same; it sits after the real one, so the page still finds the real one first
    var c = el.cloneNode(true); c.removeAttribute('hidden'); c.classList.add('km-closing'); c.classList.remove('km-in');
    c.setAttribute('aria-hidden', 'true'); c.inert = true;
    (where || el.parentNode || document.body).appendChild(c);
    setTimeout(function () { c.remove(); }, 320);
  }
  var watched = [];
  function watchWindows() {   // some windows are made only when first used (e.g. Notifications), so this runs again on page changes
    ['dlg', 'dlg2', 'dlg-imp', 'dlg-pay', 'msheet', 'mscrim', 'pushsheet', 'bgk-sheet'].forEach(function (id) {
      var el = $(id); if (!el || watched.indexOf(el) > -1) return; watched.push(el);
      new MutationObserver(function (m) { if (m.some(function (r) { return r.oldValue === null; }) && el.hidden) ghost(el); })
        .observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    });
  }
  watchWindows();
  (function () {   // the budget's service details are drawn again on every change, so follow them by presence
    var box = $('budget'), had = null, hadScrim = null;
    if (!box) return;
    new MutationObserver(function () {
      var dr = box.querySelector('.bv-dr:not(.km-closing)'), sc = box.querySelector('.bv-scrim:not(.km-closing)');
      if (dr && !had) { dr.classList.add('km-in'); if (sc) sc.classList.add('km-in'); }
      if (!dr && had) { ghost(had, box); if (hadScrim) ghost(hadScrim, box); }
      had = dr; hadScrim = sc;
    }).observe(box, { childList: true, subtree: true });
  })();

  // Dates and times already open the phone's own wheel (the portal's .dtp fields), so nothing to add here.

  phone.addEventListener && phone.addEventListener('change', function () { drawTabs(); drawAdd(); sheet(); });
})();
