// KAI Events v2 · WhatsApp / social link preview for /v2/<event>/rsvp.
// Puts the event's own title, description and photo in the page's <head> (same as the old system's preview pages),
// read from Supabase at request time, so nothing has to be redeployed when the texts or photo change.
const RPC = 'https://icqwbbmscoednenpielh.supabase.co/rest/v1/rpc/kai_public';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcXdiYm1zY29lZG5lbnBpZWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDY3MTMsImV4cCI6MjEwOTc4MjcxM30.ZWXEnYa61bZgiYXEHETDIULZ9hplkKLxpgu7eJgkEy8';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async (request, context) => {
  const res = await context.next();
  const path = new URL(request.url).pathname, v2 = path.indexOf('/v2/') === 0;
  const slug = (path.split('/').filter(Boolean)[v2 ? 1 : 0] || '').toLowerCase();
  if (!/^[a-z0-9-]{1,40}$/.test(slug) || !(res.headers.get('content-type') || '').includes('text/html')) return res;
  let st = null;
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: { action: 'rsvpInfo', e: slug } }), signal: AbortSignal.timeout(2500) });
    const j = await r.json(); if (j && j.ok) st = j.event;
  } catch (e) { return res; }
  if (!st) return res;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(st.date || '');
  const when = st['Dates Line'] ? String(st['Dates Line']).replace(/\s+/g, ' ') : m ? Number(m[3]) + '.' + Number(m[2]) + '.' + m[1] : '';
  const title = (st.couple || '') + ' – We’re getting married!';
  const desc = [st.place, when, 'You’re invited'].filter(Boolean).join(' · ');
  const img = st['Share Image'] || st['Hero Image'] || '';
  const meta = '<meta name="description" content="' + esc(desc) + '">\n<meta property="og:type" content="website">\n' +
    '<meta property="og:url" content="https://events.kaiwedd.com' + (v2 ? '/v2/' : '/') + slug + '/rsvp">\n<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    (img ? '<meta property="og:image" content="' + esc(img) + '">\n<meta name="twitter:card" content="summary_large_image">\n' : '');
  let html = await res.text();
  if (html.indexOf('property="og:title"') > -1) return new Response(html, { status: res.status, headers: res.headers });   // the event's own page has its own preview
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>').replace('<head>', '<head>\n' + meta);
  const headers = new Headers(res.headers); headers.delete('content-length');
  return new Response(html, { status: res.status, headers });
};

export const config = { path: ['/v2/*/rsvp', '/v2/*/rsvp/', '/*/rsvp', '/*/rsvp/', '/amit-or', '/amit-or/', '/demo-wedding', '/demo-wedding/'] };
