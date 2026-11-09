-- 9 Nov 2026 · Welcome email to the couple.
-- mail_queue: emails waiting to go out (RLS on, no policies). kai_api 'queueEmail' {e, to, subject, html} (Noam only) adds one;
-- the dashboard builds the email (Hebrew or English) and adds it after New Event, or from ⋯ › "Send the welcome email (again)".
-- kai_mail_take(key) / kai_mail_done(key, id, error): the old Hub's mailQueue (Apps Script time trigger, every minute) takes the
-- waiting emails with the backup key and sends them from Noam's Gmail (MailApp, name "Noam · KAI Events", reply-to him). Retried up to 3 times.
-- kai_api 'events' gives each event 'welcome' {sent 'DD/MM', waiting, error} for the line under the couple's name.
-- Also on 9 Nov (Amit & Or): kai_grand_save puts the RSVP's general note on the first guest's Notes, and food answers into the event's
-- columns named Menu / Kosher / Allergies ('None' when none) / Anything else when they exist (amit-or: c1–c4); kai_new_guest fills custom columns.
create table if not exists public.mail_queue (
  id bigserial primary key, event_id uuid references public.events(id) on delete cascade, kind text not null default 'welcome',
  to_email text not null, subject text not null, html text not null, created_at timestamptz not null default now(),
  taken_at timestamptz, tries int not null default 0, sent_at timestamptz, error text);
alter table public.mail_queue enable row level security;
-- Function bodies: see Supabase (kai_mail_take, kai_mail_done; kai_api edited in place).
