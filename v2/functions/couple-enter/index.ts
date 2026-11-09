// KAI Events v2 · couple-enter: the couple's permanent link (/v2/<event>/portal?t=<token>) signs them in.
// Checks the token in the database, then makes a one-time sign-in link for the event's couple account. No email is sent.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "https://events.kaiwedd.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { slug, t, path } = await req.json();
    // t = the event's couple token; empty t is the old open couple link /<event>/portal (only for events with Settings › Couple Open Link = on)
    if (!/^[a-z0-9-]{1,40}$/.test(String(slug || "")) || !/^([a-f0-9]{20,80})?$/.test(String(t ?? ""))) return json({ ok: false, error: "This link is not valid." });
    const back = typeof path === "string" && /^\/[a-z0-9-]{1,40}\/portal\/?$/.test(path) ? path : `/v2/${slug}/portal`;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: email, error } = await admin.rpc("kai_couple_enter", { p_slug: slug, p_token: String(t ?? "") });
    if (error || !email) return json({ ok: false, error: "This link is not valid. Ask Noam for a new one." });
    await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => null);   // fine if it already exists
    const { data, error: e2 } = await admin.auth.admin.generateLink({
      type: "magiclink", email, options: { redirectTo: `https://events.kaiwedd.com${back}` },
    });
    if (e2 || !data?.properties?.action_link) return json({ ok: false, error: "Couldn’t sign you in. Try again in a minute." });
    return json({ ok: true, url: data.properties.action_link });
  } catch (_e) {
    return json({ ok: false, error: "Couldn’t sign you in. Try again in a minute." });
  }
});
