// Esc, on every KAI page: cancels what you are doing, one step per press, until the screen is back to normal.
// The page's own Esc handling always goes first. Only when it did nothing does this step in:
//   1. typing in a field → what was typed is undone (a search box is cleared)
//   2. an open window, menu or popup → the one on top is closed (with its own Cancel / × when it has one)
//   3. the page's own extra steps (window.KAI_ESC: functions that return true when they did something)
(function () {
  var POPS = '[role="dialog"], [role="menu"], [aria-modal="true"], .overlay, .modal, .sheet, .dlg-bg, .exmenu, [data-esc]';
  var SCRIM = /scrim|shade|backdrop|(^|-)bg$/i;
  var CLOSE_TXT = /^(cancel|close|×|✕|✖|ביטול|סגור|סגירה)$/i;
  var shown = function (el) {
    if (!el || el.hidden || !el.isConnected || !el.getClientRects().length) return false;
    var s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none';
  };
  var isField = function (el) {
    if (!el || el === document.body) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|range|color|image|hidden)$/i.test(el.type);
  };
  var val = function (el) { return el.isContentEditable ? el.innerText : el.value; };
  var setVal = function (el, v) { if (el.isContentEditable) el.innerText = v; else el.value = v; };
  var fire = function (el, t) { el.dispatchEvent(new Event(t, { bubbles: true })); };
  var isSearch = function (el) { return el.type === 'search' || /search|חיפוש|חפש/i.test((el.id || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.getAttribute('aria-label') || '')); };
  var was = new WeakMap();
  document.addEventListener('focusin', function (e) { if (isField(e.target)) was.set(e.target, val(e.target)); }, true);

  var zOf = function (el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) { var z = parseInt(getComputedStyle(n).zIndex, 10); if (!isNaN(z)) return z; }
    return 0;
  };
  var top = function () {
    var list = Array.prototype.filter.call(document.querySelectorAll(POPS), shown);
    list = list.filter(function (el) { return !list.some(function (o) { return o !== el && o.contains(el); }); });   // the outer one of a nested pair
    list.sort(function (a, b) { return (zOf(a) - zOf(b)) || (a.compareDocumentPosition(b) & 4 ? -1 : 1); });
    return list[list.length - 1] || null;
  };
  var closer = function (el) {
    var bs = el.querySelectorAll('button, [role="button"], a, [data-close]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], id = b.id || '', t = (b.textContent || '').trim(), lab = b.getAttribute('aria-label') || '';
      if (b.hasAttribute('data-close') || /(^|-)(cancel|close)$/i.test(id) || CLOSE_TXT.test(t) || /^(close|cancel|clear selection)/i.test(lab) || (b.classList.contains('x') && t.length <= 1))
        if (shown(b)) return b;
    }
    return null;
  };
  var clickOn = function (el) {
    ['mousedown', 'mouseup', 'click'].forEach(function (t) { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); });
  };
  var close = function (el) {
    var b = closer(el);
    if (b) { if (!b.disabled && b.getAttribute('aria-disabled') !== 'true') b.click(); return; }   // a disabled Cancel = busy (saving / uploading): wait
    var scrims = Array.prototype.filter.call(document.querySelectorAll('body *'), function (n) { return SCRIM.test(n.id) || SCRIM.test(typeof n.className === 'string' ? n.className.split(' ')[0] : ''); }).filter(shown);
    var s = scrims.filter(function (n) { return n.parentNode === el.parentNode || el.contains(n); })[0] || scrims[scrims.length - 1];
    if (s) clickOn(s);
    if (shown(el)) clickOn(el);                 // a click on the dark background around a window
    if (shown(el)) clickOn(document.body);      // a click outside a menu
    if (shown(el)) el.hidden = true;
  };
  var step = function () {
    var a = document.activeElement;
    if (isField(a)) {
      if (isSearch(a) && val(a)) { setVal(a, ''); fire(a, 'input'); fire(a, 'change'); return; }
      var w = was.get(a);
      if (w !== undefined && val(a) !== w) { setVal(a, w); fire(a, 'input'); a.blur(); return; }
      a.blur();
    }
    var p = top(); if (p) { close(p); return; }
    (window.KAI_ESC || []).some(function (fn) { try { return fn() === true; } catch (x) { return false; } });
  };

  // Did the page already do something with this Esc? (a change on the screen, or the cursor moved)
  var mo = null, before = null;
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.isComposing) return;
    if (mo) mo.disconnect();
    before = document.activeElement; mo = new MutationObserver(function () {});
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    var m = mo; setTimeout(function () { m.disconnect(); if (mo === m) mo = null; }, 0);
  }, true);
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !mo) return;
    var changed = mo.takeRecords().length > 0; mo.disconnect(); mo = null;
    if (e.defaultPrevented || changed || document.activeElement !== before) return;
    step();
  });
})();
