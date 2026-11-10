// KAI Events v2 · admin-enter: Noam's own links sign him in without email, like the old system:
// /admin/<admin code> and /<event>/portal/<admin code>. The code is kept in kai_config 'admin_code' (change it there to cut old links).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Content-Type": "application/json" };
const out = (o: unknown) => new Response(JSON.stringify(o), { headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const p = await req.json().catch(() => ({}));
  const { data: cfg } = await db.from("kai_config").select("v").eq("k", "admin_code").maybeSingle();
  const code = cfg ? String(cfg.v) : "";
  if (!code || typeof p.code !== "string" || p.code !== code) {
    await new Promise((r) => setTimeout(r, 1200));   // slows down guessing
    return out({ ok: false, error: "This link is not valid." });
  }
  const { data: adm } = await db.from("admins").select("email").limit(1).maybeSingle();
  if (!adm?.email) return out({ ok: false, error: "No admin is set up." });
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: adm.email });
  if (error || !data?.properties?.hashed_token) return out({ ok: false, error: "Couldn’t sign you in. Try again." });
  return out({ ok: true, token_hash: data.properties.hashed_token });
});
