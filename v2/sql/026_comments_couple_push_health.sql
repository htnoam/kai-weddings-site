-- KAI Events v2 · 026 (10/11/2026): schedule comments, couple notifications, dashboard "needs" counts, morning health check.
-- Applied live with the Supabase tools. Functions marked "patched in place" were edited with pg_get_functiondef + replace;
-- their full current text is in the database (and in every nightly backup run of pg_get_functiondef if needed).

-- Notifications: what kind of change each line is, and who each phone belongs to.
alter table public.notify_queue add column if not exists kind text not null default '';      -- 'added' / 'rsvp' / 'comment' / ''
alter table public.push_subs add column if not exists audience text not null default 'admin'; -- 'admin' (Noam) / 'couple'

-- Last time the nightly backup and the Hub's mail check ran (read by kai_health).
create table if not exists public.kai_heartbeat (name text primary key, at timestamptz not null default now());
alter table public.kai_heartbeat enable row level security;

-- Patched in place:
--  kai_notify_from_log : fills notify_queue.kind ('added' for a new guest, 'rsvp' for an RSVP status change).
--  kai_save_schedule   : keeps each row's "comments" exactly as stored (only the comment actions change them).
--  kai_act_plan        : new actions scheduleComment (couple or Noam; couple's comment queues a notification, kind 'comment')
--                        and scheduleCommentDone (Noam only: {row, id, done}).
--  kai_api 'events'    : each event also returns qOpen (unanswered ceremony questions) and notes (open couple comments).
--  kai_api push*       : the couple may turn notifications on/off for their own event (member of d.slug); saved with audience 'couple'.
--  kai_backup          : records the heartbeat; no longer copies vapid_private, push_cron_key or admin_code into the backup file.
--  kai_mail_take       : records the heartbeat.
-- Edge function push-send v6: couple phones get only 'added'/'rsvp' lines made by others, and links without the admin code;
--  body {alert} with the cron key sends a health alert to Noam's phones; the couple can "Send a test" for their own event.

create or replace function public.kai_health() returns text[] language plpgsql security definer set search_path to 'public' as $f$
-- Every morning: is everything still running? Returns what needs a look (empty = all good).
declare out text[] := '{}'; t timestamptz; n int;
begin
  select at into t from public.kai_heartbeat where name = 'backup';
  if t is not null and t < now() - interval '26 hours' then out := out || ('No backup since ' || to_char(t at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI')); end if;
  select at into t from public.kai_heartbeat where name = 'mail';
  if t is not null and t < now() - interval '30 minutes' then out := out || ('Emails aren’t going out (the Hub last checked ' || to_char(t at time zone 'Asia/Jerusalem', 'DD/MM HH24:MI') || ')'); end if;
  select count(*) into n from public.mail_queue where error is not null and created_at > now() - interval '1 day';
  if n > 0 then out := out || (n || ' email(s) failed yesterday'); end if;
  select count(*) into n from public.mail_queue where sent_at is null and error is null and created_at < now() - interval '1 hour';
  if n > 0 then out := out || (n || ' email(s) waiting over an hour'); end if;
  select count(*) into n from cron.job_run_details d join cron.job j on j.jobid = d.jobid where j.jobname = 'kai-push-send' and d.status = 'failed' and d.start_time > now() - interval '1 day';
  if n > 0 then out := out || ('Notifications job failed ' || n || ' time(s) yesterday'); end if;
  select count(*) into n from public.notify_queue where sent_at is null and at < now() - interval '9 hours';
  if n > 0 then out := out || (n || ' notification(s) stuck'); end if;
  return out;
end $f$;
revoke all on function public.kai_health() from public, anon, authenticated;

-- 06:10 UTC = 08:10 Israel in winter (09:10 in summer). Sends a push only when something is wrong.
select cron.schedule('kai-health', '10 6 * * *', $c$
  select net.http_post(url := 'https://icqwbbmscoednenpielh.supabase.co/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-kai-key', (select v #>> '{}' from public.kai_config where k = 'push_cron_key')),
    body := jsonb_build_object('alert', array_to_string(h, ' · ')))
  from (select public.kai_health() h) x where cardinality(h) > 0
$c$);
