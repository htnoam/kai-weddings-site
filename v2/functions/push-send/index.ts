// KAI Events v2 · push-send: every 3 minutes (pg_cron) sends Noam's phone one notification per event with the changes
// guests and couples made since the last run (notify_queue). Quiet hours 23:00–07:00 Israel time: they wait for the morning.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("kai_config").select("k, v").in("k", ["vapid_public", "vapid_private", "push_cron_key"]);
  const C: Record<string, string> = {}; (cfg || []).forEach((r: { k: string; v: string }) => { C[r.k] = String(r.v); });
  const body = await req.json().catch(() => ({}));
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!C.push_cron_key || req.headers.get("x-kai-key") !== C.push_cron_key) {
    // Noam's own "Send a test" button: signed in as an admin, test only.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const { data: u } = await db.auth.getUser(token);
    const email = (u?.user?.email || "").toLowerCase();
    const { data: adm } = email ? await db.from("admins").select("email").eq("email", email).limit(1) : { data: [] };
    if (!adm || !adm.length || !body.test) return new Response(JSON.stringify({ ok: false, error: "Not allowed." }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const r = await run(db, C, true, email);
    return new Response(JSON.stringify(r), { headers: { ...cors, "Content-Type": "application/json" } });
  }
  return json(await run(db, C, !!body.test, ""));
});

// deno-lint-ignore no-explicit-any
async function run(db: any, C: Record<string, string>, test: boolean, onlyEmail: string) {
  const body = { test };

  const hour = +new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hourCycle: "h23" }).format(new Date());
  if (!body.test && (hour >= 23 || hour < 7)) return { ok: true, quiet: true };

  webpush.setVapidDetails("mailto:htnoam@gmail.com", C.vapid_public, C.vapid_private);
  const { data: all } = await db.from("push_subs").select("*");
  const subs = (all || []).filter((s: { email: string }) => !onlyEmail || s.email === onlyEmail);
  if (!subs.length) return { ok: true, subs: 0 };

  let groups: { slug: string; title: string; body: string; n: number }[] = [];
  let ids: number[] = [];
  if (body.test) {
    groups = [{ slug: "", title: "KAI Events", body: "Notifications are on ✅ You’ll get guest updates here.", n: 0 }];
  } else {
    const { data: rows } = await db.from("notify_queue").select("id, event_id, txt").is("sent_at", null).order("id").limit(500);
    if (!rows || !rows.length) return { ok: true, sent: 0 };
    ids = rows.map((r: { id: number }) => r.id);
    const evIds = [...new Set(rows.map((r: { event_id: string }) => r.event_id))];
    const { data: evs } = await db.from("events").select("id, slug, couple").in("id", evIds);
    const ev: Record<string, { slug: string; couple: string }> = {}; (evs || []).forEach((e: { id: string; slug: string; couple: string }) => { ev[e.id] = e; });
    for (const id of evIds) {
      const lines = [...new Set(rows.filter((r: { event_id: string }) => r.event_id === id).map((r: { txt: string }) => r.txt))];
      const e = ev[id] || { slug: "", couple: "KAI Events" };
      const shown = lines.slice(0, 3).join("\n") + (lines.length > 3 ? "\n+" + (lines.length - 3) + " more" : "");
      groups.push({ slug: e.slug, title: e.couple + (lines.length > 1 ? " · " + lines.length + " updates" : ""), body: shown, n: lines.length });
    }
  }

  const total = groups.reduce((a, g) => a + g.n, 0);
  let sent = 0; const errs: string[] = [];
  for (const s of subs) {
    const badge = (s.unseen || 0) + total;
    let alive = true;
    for (const g of groups) {
      const payload = JSON.stringify({ title: g.title, body: g.body, badge, tag: g.slug || "kai", url: g.slug ? "/" + g.slug + "/portal" : "/admin" });
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
