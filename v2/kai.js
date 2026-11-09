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
    box.innerHTML = '<form class="kl" novalidate><h1>KAI Events</h1><p>Sign in with your email. We’ll send you a link; open it on this device.</p>' +
      '<input type="email" placeholder="Your email" autocomplete="email" required aria-label="Email"><button type="submit">Send me a sign-in link</button>' +
      '<div class="err" role="alert">' + (msg || '') + '</div></form>';
    document.body.appendChild(box);
    var f = box.querySelector('form'), inp = f.querySelector('input'), b = f.querySelector('button'), err = f.querySelector('.err');
    try { inp.value = localStorage.getItem('kai-v2-email') || ''; } catch (e) {}
    inp.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var em = inp.value.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { err.textContent = 'Check the email address.'; return; }
      b.disabled = true; b.textContent = 'Sending…'; err.textContent = '';
      try { localStorage.setItem('kai-v2-email', em); } catch (x) {}
      sb.auth.signInWithOtp({ email: em, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } }).then(function (r) {
        if (r.error) { b.disabled = false; b.textContent = 'Send me a sign-in link'; err.textContent = /rate|seconds/i.test(r.error.message) ? 'Too many links were sent. Wait a few minutes and try again.' : 'Couldn’t send the link: ' + r.error.message; return; }
        f.innerHTML = '<h1>Check your email</h1><p>We sent a sign-in link to <b>' + em.replace(/[<>&"]/g, '') + '</b>. Open it on this device to continue. It can take a minute; check spam too.</p><button type="button" class="lnk">Use another email</button>';
        f.querySelector('.lnk').onclick = function () { box.remove(); box = null; showLogin(); };
      });
    });
  }
  function hideLogin() { if (box) { box.remove(); box = null; } }

  sb.auth.onAuthStateChange(function (ev, s) {
    session = s;
    if (s) { hideLogin(); done(); }
  });
  var first = sb.auth.getSession().then(function (r) { session = r.data.session; if (session) done(); });

  // Resolves once someone is signed in (shows the sign-in screen until then).
  function ready() {
    return first.then(function () {
      if (session) return;
      return new Promise(function (ok) { waiting.push(ok); if (document.body) showLogin(); else document.addEventListener('DOMContentLoaded', function () { showLogin(); }); });
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

  window.KAI = { api: api, ready: ready, signOut: signOut, email: email, sb: sb };
})();
