-- 10 Nov 2026 · Sign-in for the home-screen app (iPhone): the email link opens in Safari, not in the app.
-- The app starts a pairing (random id + email) → the email link carries ?pair=<id> → Safari, signed in by the link, confirms it
-- (must be the same email) → the app, asking every few seconds, gets a one-time token (generateLink) and signs itself in.
-- Edge function app-pair (v2/functions/app-pair), ops start / confirm / claim. Valid 15 minutes, used once.
create table if not exists public.app_pairs (pair text primary key, email text not null, created_at timestamptz not null default now(),
  confirmed_at timestamptz, claimed_at timestamptz);
alter table public.app_pairs enable row level security;
