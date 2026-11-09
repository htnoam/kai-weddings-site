// KAI Events v2 · kai-hook: the couple's own RSVP site posts here (plain text, no-cors, like it did to the old Hub).
// It passes the request on to kai_public, which checks the event's External Key.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method !== "POST") return new Response(JSON.stringify({ ok: true, service: "KAI Events" }), { headers: cors });
  try {
    const p = JSON.parse(await req.text());
    if (!p || !["external", "externalRsvp"].includes(p.action)) return new Response(JSON.stringify({ ok: false, error: "Unknown action." }), { headers: cors });
    const key = Deno.env.get("SUPABASE_ANON_KEY")!;
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/kai_public", {
      method: "POST", headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify({ p }),
    });
    return new Response(await r.text(), { headers: cors });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false, error: "Bad request." }), { headers: cors });
  }
});
