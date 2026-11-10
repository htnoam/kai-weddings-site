-- 10 Nov 2026 · Notifications on Noam's phone (web push to the home-screen app; iPhone iOS 16.4+ from the home-screen icon).
-- push_subs: one row per device that turned notifications on (🔔 in the dashboard); unseen = the red number on the icon.
-- notify_queue: one line per change by anyone but Noam. Filled by trigger kai_notify_log on guest_log (confirmed / declined /
--   maybe / added / removed / updated flights / "<fields> changed") and by kai_act_plan 'briefAnswer' from the couple.
-- kai_api: pushSubscribe {sub, device} (the first device starts fresh), pushUnsubscribe {endpoint}, pushSeen (red number back to 0).
-- Edge function push-send (v2/functions/push-send): pg_cron job 'kai-push-send' every 3 minutes (pg_net, key kai_config 'push_cron_key');
--   one notification per event ("Amit & Or · 4 updates"), quiet 23:00–07:00 Israel time (they wait for the morning).
--   VAPID keys in kai_config 'vapid_public' / 'vapid_private'. Signed-in admin can call it with {test:true} ("Send a test").
-- /sw.js shows the notification, sets the red number, opens /<event>/portal when tapped.
create table if not exists public.push_subs (endpoint text primary key, p256dh text not null, auth text not null, email text not null default '',
  device text not null default '', unseen int not null default 0, created_at timestamptz not null default now(), last_ok timestamptz);
create table if not exists public.notify_queue (id bigserial primary key, event_id uuid references public.events(id) on delete cascade,
  at timestamptz not null default now(), who text not null default '', txt text not null, sent_at timestamptz);
-- Function bodies: see Supabase (kai_notify_from_log, kai_api, kai_act_plan edited in place).
