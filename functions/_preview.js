// KAI Events · WhatsApp / social link preview for the RSVP pages (Cloudflare Pages version of netlify/edge-functions/v2-preview.js).
// Puts the event's own title, description and photo in the page's <head>, read from Supabase at request time.
const RPC = 'https://icqwbbmscoednenpielh.supabase.co/rest/v1/rpc/kai_public';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljcXdiYm1zY29lZG5lbnBpZWxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDY3MTMsImV4cCI6MjEwOTc4MjcxM30.ZWXEnYa61bZgiYXEHETDIULZ9hplkKLxpgu7eJgkEy8';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Requests sent here (see /_routes.json) don't go through _redirects, so the page is picked here:
// the event's own page (only maya-yotam has one) or the shared RSVP page.
export async function preview(ctx) {
  const url = new URL(ctx.request.url), seg = url.pathname.split('/').filter(Boolean), v2 = seg[0] === 'v2';
  const slug = ((v2 ? seg[1] : seg[0]) || '').toLowerCase();
  const own = !v2 && slug === 'maya-yotam';
  const res = await ctx.env.ASSETS.fetch(new URL(own ? '/maya-yotam/' : '/v2/rsvp', url), ctx.request);
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
  const headers = new Headers(res.headers); headers.delete('content-length');
  if (html.indexOf('property="og:title"') > -1) return new Response(html, { status: res.status, headers });   // the event's own page has its own preview
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>').replace('<head>', '<head>\n' + meta);
  return new Response(html, { status: res.status, headers });
}
