// KAI Events v2: the guests' side (RSVP form, Grand site, guest area). No sign-in; one call: KAI_PUB({ action, e, ... }).
// Answers in the same shape as the old Hub ({ ok, ... }).
(function () {
  var URL = 'https://icqwbbmscoednenpielh.supabase.co/rest/v1/rpc/kai_public';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcXdiYm1zY29lZG5lbnBpZWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDY3MTMsImV4cCI6MjEwOTc4MjcxM30.ZWXEnYa61bZgiYXEHETDIULZ9hplkKLxpgu7eJgkEy8';
  window.KAI_PUB = function (body) {
    return fetch(URL, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ p: body || {} }) })
      .then(function (r) { return r.json(); })
      .then(function (res) { return res && typeof res.ok === 'boolean' ? res : { ok: false, error: 'Something went wrong. Try again.' }; });
  };
})();
