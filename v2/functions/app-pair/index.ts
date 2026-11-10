// KAI Events v2 · app-pair: signing in the home-screen app (iPhone). The app can't receive the email link (it opens in Safari),
// so: the app starts a pairing with a random id → the email link carries that id → Safari, once signed in, confirms it →
// the app (asking every few seconds) gets a one-time sign-in token for the same email. Valid for 15 minutes, once.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Content-Type": "application/json" };
const out = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const p = await req.json().catch(() => ({}));
  const pair = String(p.pair || "");
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(pair)) return out({ ok: false, error: "Bad request." }, 400);
  const fresh = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  if (p.op === "start") {
    const email = String(p.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out({ ok: false, error: "Check the email address." });
    await db.from("app_pairs").delete().lt("created_at", fresh);
    const { error } = await db.from("app_pairs").insert({ pair, email });
    return out({ ok: !error });
  }

  const { data: row } = await db.from("app_pairs").select("*").eq("pair", pair).gte("created_at", fresh).maybeSingle();
  if (!row) return out({ ok: false, error: "This sign-in expired. Try again." });

  if (p.op === "confirm") {
    // Called by Safari right after the email link signed it in: must be the same person.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
    const { data: u } = await db.auth.getUser(token);
    if ((u?.user?.email || "").toLowerCase() !== row.email) return out({ ok: false, error: "Not allowed." }, 401);
    await db.from("app_pairs").update({ confirmed_at: new Date().toISOString() }).eq("pair", pair).is("confirmed_at", null);
    return out({ ok: true });
  }

  if (p.op === "claim") {
    if (!row.confirmed_at) return out({ ok: true, waiting: true });
    if (row.claimed_at) return out({ ok: false, error: "This sign-in was already used. Try again." });
    const { data: done } = await db.from("app_pairs").update({ claimed_at: new Date().toISOString() }).eq("pair", pair).is("claimed_at", null).select("pair");
    if (!done || !done.length) return out({ ok: false, error: "This sign-in was already used. Try again." });
    const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: row.email });
    if (error || !data?.properties?.hashed_token) return out({ ok: false, error: "Couldn’t sign you in. Try again." });
    return out({ ok: true, token_hash: data.properties.hashed_token, email: row.email });
  }
  return out({ ok: false, error: "Bad request." }, 400);
});
