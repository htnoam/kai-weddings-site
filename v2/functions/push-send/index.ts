// KAI Events v2 · push-send: every 3 minutes (pg_cron) sends Noam's phone one notification per event with the changes
// guests and couples made since the last run (notify_queue). Couples who turned notifications on hear only about their own
// event, and only new guests and RSVP changes made by others. Quiet hours 23:00–07:00 Israel time: they wait for the morning.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("kai_config").select("k, v").in("k", ["vapid_public", "vapid_private", "push_cron_key", "admin_code"]);
  const C: Record<string, string> = {}; (cfg || []).forEach((r: { k: string; v: string }) => { C[r.k] = String(r.v); });
  const body = await req.json().catch(() => ({}));
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!C.push_cron_key || req.headers.get("x-kai-key") !== C.push_cron_key) {
    // Noam's own "Send a test" button: signed in as an admin, test only.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const { data: u } = await db.auth.getUser(token);
    const email = (u?.user?.email || "").toLowerCase();
    const { data: adm } = email ? await db.from("admins").select("email").eq("email", email).limit(1) : { data: [] };
    // The couple can test their own phone too (signed in, member of that event).
    let member = false;
    if (email && (!adm || !adm.length) && body.slug) {
      const { data: evr } = await db.from("events").select("id").eq("slug", String(body.slug).toLowerCase()).limit(1);
      if (evr && evr.length) { const { data: m } = await db.from("event_members").select("email").eq("event_id", evr[0].id).eq("email", email).limit(1); member = !!(m && m.length); }
    }
    if (((!adm || !adm.length) && !member) || !body.test) return new Response(JSON.stringify({ ok: false, error: "Not allowed." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const r = await run(db, C, true, email, String(body.endpoint || ""));
    return new Response(JSON.stringify(r), { headers: { ...cors, "Content-Type": "application/json" } });
  }
  if (body.alert) return json(await alert(db, C, String(body.alert).slice(0, 400)));
  return json(await run(db, C, !!body.test, ""));
});

// The morning health check (pg_cron, kai_health) found something that stopped working: tell Noam's phones.
// deno-lint-ignore no-explicit-any
async function alert(db: any, C: Record<string, string>, text: string) {
  webpush.setVapidDetails("mailto:htnoam@gmail.com", C.vapid_public, C.vapid_private);
  const { data: subs } = await db.from("push_subs").select("*").eq("audience", "admin");
  let sent = 0;
  for (const s of subs || []) {
    const payload = JSON.stringify({ title: "KAI · something needs a look ⚠️", body: text, tag: "kai-health", url: "/admin" + (C.admin_code ? "/" + C.admin_code : "") });
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" }); sent++; } catch (_e) { /* a dead phone is cleaned up by the regular run */ }
  }
  return { ok: true, sent };
}

// deno-lint-ignore no-explicit-any
async function run(db: any, C: Record<string, string>, test: boolean, onlyEmail: string, onlyEndpoint = "") {
  const body = { test };

  const hour = +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }).format(new Date());
  if (!body.test && (hour >= 23 || hour < 7)) return { ok: true, quiet: true };

  webpush.setVapidDetails("mailto:htnoam@gmail.com", C.vapid_public, C.vapid_private);
  const { data: all } = await db.from("push_subs").select("*");
  // A device's home-screen app is either the dashboard (slug '' = every event) or one event (its slug: only that event, its own red number).
  const subs = (all || []).filter((s: { email: string; endpoint: string }) => (!onlyEmail || s.email === onlyEmail) && (!onlyEndpoint || s.endpoint === onlyEndpoint));
  if (!subs.length) return { ok: true, subs: 0 };

  let groups: { slug: string; title: string; body: string; n: number; couple?: boolean }[] = [];
  let ids: number[] = [];
  if (body.test) {
    groups = [{ slug: "*", title: "KAI Event Planners", body: "Notifications are on ✅ You’ll get guest updates here.", n: 0 }];
  } else {
    const { data: rows } = await db.from("notify_queue").select("id, event_id, txt, who, kind").is("sent_at", null).order("id").limit(500);
    if (!rows || !rows.length) return { ok: true, sent: 0 };
    ids = rows.map((r: { id: number }) => r.id);
    const evIds = [...new Set(rows.map((r: { event_id: string }) => r.event_id))];
    const { data: evs } = await db.from("events").select("id, slug, couple, settings").in("id", evIds);
    // deno-lint-ignore no-explicit-any
    const ev: Record<string, any> = {}; (evs || []).forEach((e: { id: string }) => { ev[e.id] = e; });
    type Row = { event_id: string; txt: string; who: string; kind: string };
    const group = (slug: string, title: string, lines: string[], couple: boolean) => {
      const shown = lines.slice(0, 3).join("\n") + (lines.length > 3 ? "\n+" + (lines.length - 3) + " more" : "");
      groups.push({ slug, title: title + (lines.length > 1 ? " · " + lines.length + " updates" : ""), body: shown, n: lines.length, couple });
    };
    for (const id of evIds) {
      const mine = (rows as Row[]).filter((r) => r.event_id === id);
      const e = ev[id] || { slug: "", couple: "KAI Event Planners", settings: {} };
      const names = String((e.settings && e.settings["Couple Names"]) || e.couple || "");
      group(e.slug, e.couple, [...new Set(mine.map((r) => r.txt))], false);
      const forCouple = [...new Set(mine.filter((r) => (r.kind === "added" || r.kind === "rsvp") && r.who !== names && r.who !== "couple").map((r) => r.txt))];
      if (forCouple.length && e.slug) group(e.slug, names || e.couple, forCouple, true);
    }
  }

  let sent = 0; const errs: string[] = [];
  for (const s of subs) {
    const couple = s.audience === "couple";
    const mine = groups.filter((g) => g.slug === "*" || (couple ? g.couple && g.slug === s.slug : !g.couple && (!s.slug || g.slug === s.slug)));
    if (!mine.length) continue;
    const badge = (s.unseen || 0) + mine.reduce((a, g) => a + g.n, 0);
    let alive = true;
    for (const g of mine) {
      const slug = g.slug === "*" ? s.slug : g.slug;
      const payload = JSON.stringify({ title: g.title, body: g.body, badge, tag: slug || "kai", url: (slug ? "/" + slug + "/portal" : "/admin") + (C.admin_code && !couple ? "/" + C.admin_code : "") });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { alive = false; break; }
        errs.push(code + " " + String((err as Error).message || err).slice(0, 200)); console.log("push failed", errs[errs.length - 1]);
      }
    }
    if (!alive) await db.from("push_subs").delete().eq("endpoint", s.endpoint);
    else await db.from("push_subs").update({ unseen: badge, last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint);
  }
  if (ids.length) await db.from("notify_queue").update({ sent_at: new Date().toISOString() }).in("id", ids);
  return { ok: errs.length === 0 || sent > 0, sent, groups: groups.length, errs };
}
