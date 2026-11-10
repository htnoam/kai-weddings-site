// KAI Events v2 (Supabase). Sign-in by email link, and one call for everything: KAI.api(action, data).
// The screens are the same as the old system; only the connection behind them changed.
(function () {
  'use strict';
  var URL = 'https://icqwbbmscoednenpielh.supabase.co';
  // Public key (safe to be in the page): it only allows signing in and calling kai_api, which checks who you are.
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcXdiYm1zY29lZG5lbnBpZWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDY3MTMsImV4cCI6MjEwOTc4MjcxM30.ZWXEnYa61bZgiYXEHETDIULZ9hplkKLxpgu7eJgkEy8';
  var sb = window.supabase.createClient(URL, ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });

  var session = null, waiting = [], box = null;
  function done() { var w = waiting; waiting = []; w.forEach(function (f) { f(); }); }

  // ---------- sign-in screen ----------
  var CSS = '#kai-login{position:fixed;inset:0;z-index:200;background:var(--bg,#F4F2EE);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit}' +
    '#kai-login .kl{background:#FFFFFF;border:1px solid var(--line,#D6D4CE);border-radius:8px;padding:28px 24px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:12px}' +
    '#kai-login h1{font:600 26px/1.1 "Cormorant Garamond",Georgia,serif;color:var(--ink,#2E3A9E);margin:0}' +
    '#kai-login p{margin:0;font-size:14px;color:var(--soft,#6E6E75);line-height:1.45}' +
    '#kai-login input{height:42px;border:1px solid var(--line,#D6D4CE);border-radius:6px;padding:0 12px;font-size:16px;font-family:inherit}' +
    '#kai-login button{height:42px;border:none;border-radius:6px;background:var(--ink,#2E3A9E);color:#FFFFFF;font-weight:600;font-size:15px;cursor:pointer;font-family:inherit}' +
    '#kai-login button:disabled{opacity:.6}#kai-login .err{color:var(--bad,#9B2C2C);font-size:13.5px}#kai-login .ok{color:#2F6B2F;font-size:14px;font-weight:600}' +
    '#kai-login .lnk{background:none;color:var(--ink,#2E3A9E);height:auto;padding:0;font-size:13.5px;align-self:flex-start}';
  function showLogin(msg) {
    if (box) { if (msg) box.querySelector('.err').textContent = msg; return; }
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'kai-login';
    box.innerHTML = '<form class="kl" novalidate><h1>KAI Event Planners</h1><p>Sign in with your email. We’ll send you a link; open it on this device.</p>' +
      '<input type="email" placeholder="Your email" autocomplete="email" required aria-label="Email"><button type="submit">Send me a sign-in link</button>' +
      '<div class="err" role="alert">' + (msg || '') + '</div><button type="button" class="lnk kcode">KAI team? Sign in with your code</button></form>';
    document.body.appendChild(box);
    var f = box.querySelector('form'), inp = f.querySelector('input'), b = f.querySelector('button'), err = f.querySelector('.err');
    try { inp.value = localStorage.getItem('kai-v2-email') || ''; } catch (e) {}
    f.querySelector('.kcode').onclick = function () {
      var c = window.prompt('Your KAI code'); if (!c) return;
      adminEnter(c).then(function (ok) { if (ok) { hideLogin(); location.reload(); } else err.textContent = 'That code isn’t right.'; });
    };
    inp.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = inp.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { err.textContent = 'Check the email address.'; return; }
      b.disabled = true; b.textContent = 'Sending…'; err.textContent = '';
      try { localStorage.setItem('kai-v2-email', em); } catch (x) {}
      // Home-screen app: the email link opens in Safari, so the app waits for Safari to confirm and then signs itself in (app-pair).
      var pair = APP ? rid() : '';
      (pair ? pairCall({ op: 'start', pair: pair, email: em }) : Promise.resolve({ ok: true })).then(function (st) {
        if (!st.ok) throw new Error(st.error || 'Couldn’t send the link. Try again.');
        return sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname + (pair ? '?pair=' + pair : ''), shouldCreateUser: true } });
      }).then(function (r) {
        if (r.error) { b.disabled = false; b.textContent = 'Send me a sign-in link'; err.textContent = /rate|seconds/i.test(r.error.message) ? 'Too many links were sent. Wait a few minutes and try again.' : 'Couldn’t send the link: ' + r.error.message; return; }
        f.innerHTML = '<h1>Check your email</h1><p>We sent a sign-in link to <b>' + em.replace(/[<>&"]/g, '') + '</b>. ' +
          (pair ? 'Tap the link (it opens in Safari), then come back here. You’ll be signed in by yourself.' : 'Open it on this device to continue.') + ' It can take a minute; check spam too.</p><div class="err" role="alert"></div><button type="button" class="lnk">Use another email</button>';
        f.querySelector('.lnk').onclick = function () { POLL.stop = true; box.remove(); box = null; showLogin(); };
        if (pair) pollPair(pair, f.querySelector('.err'));
      }).catch(function (x) { b.disabled = false; b.textContent = 'Send me a sign-in link'; err.textContent = x.message; });
    });
  }
  function hideLogin() { if (box) { box.remove(); box = null; } }

  // ---------- sign-in for the home-screen app ----------
  var APP = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true, POLL = { stop: false };
  function rid() { var a = new Uint8Array(24); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function pairCall(body, token) {
    return fetch(URL + '/functions/v1/app-pair', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + (token || ANON), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false, error: 'Couldn’t reach the server. Check your connection.' }; });
  }
  function pollPair(pair, errEl) {
    POLL.stop = false; var until = Date.now() + 15 * 60 * 1000;
    (function tick() {
      if (POLL.stop || session) return;
      if (Date.now() > until) { errEl.textContent = 'The sign-in expired. Use another email to try again.'; return; }
      if (document.visibilityState !== 'visible') { setTimeout(tick, 1500); return; }
      pairCall({ op: 'claim', pair: pair }).then(function (r) {
        if (r.ok && r.token_hash) return sb.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' }).then(function (v) { if (v.error) { errEl.textContent = 'Couldn’t sign you in. Try again.'; } });
        if (!r.ok && r.error) { errEl.textContent = r.error; return; }
        setTimeout(tick, 2500);
      });
    })();
  }
  // Safari, opened by the email link that the app asked for: confirm it, then send the person back to the app.
  var PAIR = new URLSearchParams(location.search).get('pair');
  if (PAIR) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (x) {} }
  function confirmPair() {
    if (!PAIR || !session) return; var p = PAIR; PAIR = null;
    pairCall({ op: 'confirm', pair: p }, session.access_token).then(function (r) {
      var d = document.createElement('div'); d.id = 'kai-login';
      if (!document.getElementById('kai-login-css')) { var st = document.createElement('style'); st.id = 'kai-login-css'; st.textContent = CSS; document.head.appendChild(st); }
      d.innerHTML = '<div class="kl"><h1>' + (r.ok ? 'You’re signed in' : 'Almost there') + '</h1><p>' + (r.ok ? 'Go back to the app on your home screen. It’s signing in now.' : (r.error || 'Try again from the app.')) + '</p><button type="button">Stay here instead</button></div>';
      document.body.appendChild(d); d.querySelector('button').onclick = function () { d.remove(); };
    });
  }

  sb.auth.onAuthStateChange(function (ev, s) {
    session = s;
    if (s) { hideLogin(); done(); confirmPair(); }
  });
  var first = sb.auth.getSession().then(function (r) { session = r.data.session; if (session) { done(); confirmPair(); } });

  // Resolves once someone is signed in (shows the sign-in screen until then).
  // The couple's permanent link (?t=<token>) signs them in by itself: the server checks it and hands back a one-time sign-in link.
  function wait(msg) { return new Promise(function (ok) { waiting.push(ok); if (document.body) showLogin(msg); else document.addEventListener('DOMContentLoaded', function () { showLogin(msg); }); }); }
  var coupleTried = false, adminTried = false;
  function ready() {
    return first.then(function () {
      var parts = location.pathname.split('/').filter(Boolean), v2 = parts[0] === 'v2', slug = ((v2 ? parts[1] : parts[0]) || '').toLowerCase();
      // Noam's own links (/admin/<code>, /<event>/portal/<code>) sign him in straight away, no email (admin-enter).
      // The code wins over an older sign-in on this device (e.g. a home-screen app that was opened once as the couple).
      var code = v2 ? '' : parts[0] === 'admin' ? (parts[1] || '') : parts[1] === 'portal' ? (parts[2] || '') : '';
      var adminMail = ''; try { adminMail = localStorage.getItem('kai-admin-email') || ''; } catch (x) {}
      if (session && !(code && !adminTried && (session.user && session.user.email) !== adminMail)) return;
      if (code && !adminTried) {
        adminTried = true;
        return fetch(URL + '/functions/v1/admin-enter', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (!res.ok || !res.token_hash) return ready();
            return sb.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' }).then(function (v) {
              if (!v.error && v.data && v.data.session) { session = v.data.session; try { localStorage.setItem('kai-admin-email', session.user.email); } catch (x) {} hideLogin(); done(); return; }
              return ready();
            });
          }).catch(function () { return ready(); });
      }
      var t = new URLSearchParams(location.search).get('t');
      // After the move the couple keeps the old link /<event>/portal (no code); Noam's own link and /admin sign in by email.
      if (t == null && !v2 && parts[1] === 'portal' && !code) t = '';
      if (t == null || coupleTried) return wait();
      coupleTried = true;
      return fetch(URL + '/functions/v1/couple-enter', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug, t: t, path: location.pathname }) })
        .then(function (r) { return r.json(); })
        .then(function (res) { if (res.ok && res.url) { location.replace(res.url); return new Promise(function () {}); } return wait(t === '' ? '' : res.error); })
        .catch(function () { return wait('Couldn’t sign you in. Check your connection and try again.'); });
    });
  }

  // Photos (dashboard › Edit RSVP / Grand texts): straight to Supabase Storage, public link back. Same answer as the old Hub.
  function upload(data) {
    var bin = atob(data.data || ''), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    var path = String(data.e || 'event').replace(/[^a-z0-9-]/g, '') + '/' + Date.now() + '-' + String(data.name || 'image.jpg').replace(/[^A-Za-z0-9._-]/g, '-');
    return ready().then(function () { return sb.storage.from('event-images').upload(path, new Blob([u8], { type: data.mime || 'image/jpeg' }), { contentType: data.mime || 'image/jpeg', upsert: false }); })
      .then(function (r) {
        if (r.error) { var e = new Error('Couldn’t upload the photo: ' + r.error.message); e.server = true; throw e; }
        return { ok: true, url: sb.storage.from('event-images').getPublicUrl(path).data.publicUrl };
      });
  }
  function api(action, data) {
    if (action === 'uploadImage') return upload(data || {});
    return ready().then(function () { return sb.rpc('kai_api', { p_action: action, p_data: data || {} }); }).then(function (r) {
      if (r.error) { var x = new Error('Couldn’t reach the server. Check your connection.'); throw x; }
      var res = r.data || {};
      if (!res.ok) {
        var e = new Error(res.error || 'Something went wrong.'); e.server = true; e.auth = !!res.auth;
        if (res.auth && action !== 'ping') showLogin(res.error === 'Please sign in.' ? '' : res.error + ' Signed in as ' + ((session && session.user && session.user.email) || '') + '.');
        throw e;
      }
      return res;
    });
  }
  function signOut() { return sb.auth.signOut().then(function () { location.reload(); }); }
  function email() { return (session && session.user && session.user.email) || ''; }

  // Noam's code typed by hand (home-screen apps that opened without it): signs in as Noam on this device.
  function adminEnter(code) {
    return fetch(URL + '/functions/v1/admin-enter', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ code: String(code || '').trim() }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok || !res.token_hash) return false;
        return sb.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' }).then(function (v) {
          if (v.error || !v.data || !v.data.session) return false;
          session = v.data.session; try { localStorage.setItem('kai-admin-email', session.user.email); } catch (x) {}
          return true;
        });
      }).catch(function () { return false; });
  }

  window.KAI = { api: api, ready: ready, signOut: signOut, email: email, sb: sb, adminEnter: adminEnter };
})();
