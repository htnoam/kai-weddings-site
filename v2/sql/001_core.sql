-- KAI Events v2: core tables. Every read and write goes through kai_api() (security definer),
-- so the tables themselves are closed to the browser (RLS on, no policies).

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  couple text not null default '',
  date text not null default '',            -- YYYY-MM-DD, like the Settings tab
  status text not null default '',          -- '' | 'Ended' | 'Deleted'
  settings jsonb not null default '{}'::jsonb,
  ver bigint not null default 0,            -- last change (ms), for live updates
  ver_by text not null default '',
  ver_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.event_members (   -- the couple: who may open this event besides Noam
  event_id uuid not null references public.events(id) on delete cascade,
  email text not null,
  primary key (event_id, email)
);

create table if not exists public.guests (
  event_id uuid not null references public.events(id) on delete cascade,
  "no" int not null,
  "first" text not null default '',
  "last" text not null default '',
  "phone" text not null default '',
  "age" text not null default 'Adult' check ("age" in ('Adult', 'Child', 'Baby')),
  "status" text not null default 'Maybe' check ("status" in ('Maybe', 'Confirmed', 'Declined')),
  "group" text not null default '',
  "notes" text not null default '',
  "updated" text not null default '',
  "deleted" boolean not null default false,
  "arrDate" text not null default '', "arrTime" text not null default '', "arrFlight" text not null default '', "arrBus" text not null default '',
  "depDate" text not null default '', "depTime" text not null default '', "depFlight" text not null default '', "depBus" text not null default '',
  "checkIn" text not null default '', "checkOut" text not null default '', "room" text not null default '', "table" text not null default '',
  custom jsonb not null default '{}'::jsonb,   -- this event's own columns: { c1: '...', ... }
  primary key (event_id, "no")
);

create table if not exists public.guest_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  at timestamptz not null default now(),
  by_name text not null default '',
  "no" int,
  guest text not null default '',
  action text not null default '',
  details text not null default ''
);
create index if not exists guest_log_event_no on public.guest_log (event_id, "no", id);

create table if not exists public.views (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  cols text[] not null default '{}',
  status text not null default '',
  age text not null default '',
  sort jsonb,
  filters jsonb not null default '{}'::jsonb
);
create index if not exists views_event on public.views (event_id, id);

create table if not exists public.custom_columns (
  event_id uuid not null references public.events(id) on delete cascade,
  k text not null,
  label text not null,
  type text not null default 'text',
  options text[] not null default '{}',
  pos bigint generated always as identity,
  primary key (event_id, k)
);

create table if not exists public.changes (   -- changes by the couple / guests, until Noam marks them seen
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  at timestamptz not null default now(),
  "no" int,
  k text not null default '',
  old text not null default '',
  nw text not null default '',
  by_name text not null default '',
  seen_at timestamptz
);
create index if not exists changes_event_open on public.changes (event_id) where seen_at is null;

create table if not exists public.reminders (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  phone text not null,
  names text not null default '',
  sent_at timestamptz not null default now(),
  by_name text not null default ''
);

create table if not exists public.presence (
  event_id uuid not null references public.events(id) on delete cascade,
  sid text not null,
  name text not null default '',
  seen_at timestamptz not null default now(),
  primary key (event_id, sid)
);

alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.guests enable row level security;
alter table public.guest_log enable row level security;
alter table public.views enable row level security;
alter table public.custom_columns enable row level security;
alter table public.changes enable row level security;
alter table public.reminders enable row level security;
alter table public.presence enable row level security;

insert into public.admins (email) values ('htnoam@gmail.com') on conflict do nothing;
