-- 10 Nov 2026 · Sign-in for the home-screen app (iPhone): the email link opens in Safari, not in the app.
-- The app starts a pairing (random id + email) → the email link carries ?pair=<id> → Safari, signed in by the link, confirms it
-- (must be the same email) → the app, asking every few seconds, gets a one-time token (generateLink) and signs itself in.
-- Edge function app-pair (v2/functions/app-pair), ops start / confirm / claim. Valid 15 minutes, used once.
create table if not exists public.app_pairs (pair text primary key, email text not null, created_at timestamptz not null default now(),
  confirmed_at timestamptz, claimed_at timestamptz);
alter table public.app_pairs enable row level security;
-- Also 10 Nov: edge function admin-enter. Noam's own links /admin/<code> and /<event>/portal/<code> sign him in with no email
-- (code in kai_config 'admin_code'; a one-time token for the admin's email). Used by the home-screen app (start page = that link).
