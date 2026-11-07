// Phones: date and time fields open the phone's own picker (calendar / time wheel) instead of typing.
// The visible field still holds DD/MM/YYYY or HH:MM, so every page reads and saves exactly as before.
// A field is picked up by its placeholder (DD/MM/YYYY or HH:MM) or by data-dt="date" / data-dt="time".
(function () {
  if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
  var st = document.createElement('style');
  st.textContent = '.dtw{position:relative;display:block}.dtw>.dtp{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;font-size:16px;border:0;margin:0;padding:0;-webkit-appearance:none;appearance:none;z-index:2;background:transparent}';
  (document.head || document.documentElement).appendChild(st);
  function p2(n) { return ('0' + n).slice(-2); }
  function toIso(v, kind) {
    v = String(v || '').trim(); var m;
    if (kind === 'time') { m = /^(\d{1,2})[:.](\d{2})$/.exec(v); return m ? p2(m[1]) + ':' + m[2] : ''; }
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(v); return m ? m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) : '';
  }
  function fromIso(v, kind) {
    if (!v) return '';
    if (kind === 'time') return v.slice(0, 5);
    var p = v.split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  }
  function fire(el, t) { el.dispatchEvent(new Event(t, { bubbles: true })); }
  function hook(el) {
    if (!el || el.tagName !== 'INPUT' || el.dataset.dtp || el.classList.contains('dtp')) return;
    var kind = el.getAttribute('data-dt') || (el.placeholder === 'DD/MM/YYYY' ? 'date' : el.placeholder === 'HH:MM' ? 'time' : '');
    if (!kind || !el.parentNode) return;
    el.dataset.dtp = '1'; el.readOnly = true;
    var w = document.createElement('span'); w.className = 'dtw';
    el.parentNode.insertBefore(w, el); w.appendChild(el);
    var p = document.createElement('input'); p.type = kind; p.className = 'dtp'; p.tabIndex = -1; p.setAttribute('aria-label', el.getAttribute('aria-label') || kind);
    function sync() { p.value = toIso(el.value, kind); }
    sync(); p.addEventListener('focus', sync); p.addEventListener('touchstart', sync, { passive: true });
    p.addEventListener('change', function () { el.value = fromIso(p.value, kind); fire(el, 'input'); fire(el, 'change'); });
    w.appendChild(p);
  }
  function scan(root) { Array.prototype.forEach.call((root || document).querySelectorAll('input[placeholder="DD/MM/YYYY"],input[placeholder="HH:MM"],input[data-dt]'), hook); }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType !== 1) return; if (n.tagName === 'INPUT') hook(n); else scan(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { scan(); }); else scan();
})();
