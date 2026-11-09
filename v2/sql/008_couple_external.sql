-- KAI Events v2: the couple's permanent link (signs them in without email) and the couple's own RSVP site (external).

-- Each event has a secret couple token: /v2/<event>/portal?t=<token>. The edge function "couple-enter" checks it and signs
-- the couple in as couple-<event>@kaiwedd.com (no email is sent). That address is added to the event's members.
alter table public.events add column if not exists couple_token text not null default (md5(random()::text || clock_timestamp()::text) || md5(clock_timestamp()::text || random()::text));

create or replace function public.kai_couple_email(slug text) returns text language sql immutable set search_path = public as $$
  select 'couple-' || slug || '@kaiwedd.com'
$$;

-- Couple emails: Settings › Client Email (one or more) + the event's own couple address.
create or replace function public.kai_sync_members(ev uuid) returns void language plpgsql set search_path = public as $$
declare em text;
begin
  delete from public.event_members where event_id = ev;
  foreach em in array regexp_split_to_array(coalesce((select settings ->> 'Client Email' from public.events where id = ev), ''), '[,;\s]+') loop
    em := lower(btrim(em));
    if em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then insert into public.event_members values (ev, em) on conflict do nothing; end if;
  end loop;
  insert into public.event_members select ev, public.kai_couple_email(slug) from public.events where id = ev on conflict do nothing;
end $$;

-- Called only by the edge function (service role): the event's couple address if the token is right, else null.
create or replace function public.kai_couple_enter(p_slug text, p_token text) returns text language plpgsql security definer set search_path = public as $$
declare e public.events;
begin
  select * into e from public.events where slug = lower(coalesce(p_slug, '')) and status <> 'Deleted';
  if e.id is null or coalesce(p_token, '') = '' or e.couple_token <> p_token then return null; end if;
  insert into public.event_members values (e.id, public.kai_couple_email(e.slug)) on conflict do nothing;
  return public.kai_couple_email(e.slug);
end $$;

-- The couple's own RSVP site (old Hub: external_). One household per phone; matched by name, else added.
create or replace function public.kai_external(e public.events, d jsonb) returns jsonb language plpgsql set search_path = public as $$
declare ev uuid := e.id; ph text := public.kai_norm_phone(d ->> 'phone'); p jsonb; i int := -1; grp text; fl jsonb := '{}'::jsonb; k text; st text; age text;
  f jsonb; g public.guests; r jsonb; added int := 0; updated int := 0; err text;
begin
  if ph !~ '^\+[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'error', 'Phone number is missing or incomplete.'); end if;
  select x."group" into grp from public.guests x where x.event_id = ev and not x.deleted and x.phone = ph order by x."no" limit 1;
  grp := coalesce(grp, public.kai_clean(coalesce(d -> 'guests' -> 0 ->> 'first', '') || ' ' || coalesce(d -> 'guests' -> 0 ->> 'last', '')));
  foreach k in array array['arrDate', 'arrTime', 'arrFlight', 'depDate', 'depTime', 'depFlight'] loop
    if public.kai_clean(d -> 'flights' ->> k) <> '' then fl := fl || jsonb_build_object(k, public.kai_clean(d -> 'flights' ->> k)); end if;
  end loop;
  for p in select value from jsonb_array_elements(case when jsonb_typeof(d -> 'guests') = 'array' then d -> 'guests' else '[]'::jsonb end) limit 30 loop
    i := i + 1;
    if public.kai_clean(p ->> 'first') = '' and public.kai_clean(p ->> 'last') = '' then continue; end if;
    st := case lower(coalesce(p ->> 'status', '')) when 'yes' then 'Confirmed' when 'confirmed' then 'Confirmed' when 'no' then 'Declined' when 'declined' then 'Declined'
      when 'maybe' then 'Maybe' when 'pending' then 'Maybe' when 'tentative' then 'Maybe' else case when p ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then p ->> 'status' else 'Confirmed' end end;
    age := case lower(coalesce(p ->> 'age', '')) when 'child' then 'Child' when 'kid' then 'Child' when 'baby' then 'Baby' when 'infant' then 'Baby' else 'Adult' end;
    f := jsonb_build_object('status', st, 'age', age) || fl;
    if i = 0 and public.kai_clean(d ->> 'note') <> '' then f := f || jsonb_build_object('notes', public.kai_clean(d ->> 'note')); end if;
    select * into g from public.guests x where x.event_id = ev and not x.deleted and x.phone = ph
      and lower(x."first" || '|' || x."last") = lower(public.kai_clean(p ->> 'first') || '|' || public.kai_clean(p ->> 'last')) order by x."no" limit 1;
    if g."no" is not null then
      r := public.kai_apply(ev, g, f, 'RSVP site', false);
      if r ? 'error' then err := coalesce(err, r ->> 'error'); else updated := updated + 1; end if;
      g := null; continue;
    end if;
    perform public.kai_new_guest(ev, f || jsonb_build_object('first', p ->> 'first', 'last', p ->> 'last', 'phone', ph, 'group', grp), 'RSVP site', 'RSVP site', st || ' · ' || age || ' · ' || grp);
    added := added + 1;
  end loop;
  if err is not null then return jsonb_build_object('ok', false, 'error', err, 'added', added, 'updated', updated); end if;
  return jsonb_build_object('ok', true, 'added', added, 'updated', updated);
end $$;

-- Entry points: the earlier ones are kept as *_core; these add the external site and the couple link.
alter function public.kai_public(jsonb) rename to kai_public_core;
create or replace function public.kai_public(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce(p, '{}'::jsonb); act text := coalesce(d ->> 'action', ''); e public.events;
begin
  if act not in ('external', 'externalRsvp') then return public.kai_public_core(p); end if;
  select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'This event was not found. Check the link.'); end if;
  if coalesce(e.settings ->> 'External Key', '') = '' or coalesce(d ->> 'key', '') <> e.settings ->> 'External Key' then return jsonb_build_object('ok', false, 'error', 'Not allowed.'); end if;
  update public.events set ver = public.kai_ms(clock_timestamp()), ver_by = '', ver_name = 'RSVP site' where id = e.id;
  if act = 'external' then return public.kai_external(e, d); end if;
  return public.kai_grand_save(e.id, d, 'RSVP site');
end $$;

alter function public.kai_api(text, jsonb) rename to kai_api_core;
create or replace function public.kai_api(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); e public.events; k text;
begin
  if p_action <> 'externalKey' then return public.kai_api_core(p_action, p_data); end if;
  if not public.kai_is_admin() then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
  select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'Event not found.'); end if;
  k := nullif(e.settings ->> 'External Key', '');
  if k is null then
    k := md5(random()::text || clock_timestamp()::text);
    update public.events set settings = settings || jsonb_build_object('External Key', k) where id = e.id;
  end if;
  return jsonb_build_object('ok', true, 'key', k);
end $$;

-- The events list also gives Noam each event's couple link token.
create or replace function public.kai_events() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('ok', true, 'github', jsonb_build_object('set', true, 'error', ''), 'events', coalesce(jsonb_agg(x order by x ->> 'date'), '[]'::jsonb))
  from (
    select jsonb_build_object('slug', e.slug, 'couple', coalesce(nullif(e.settings ->> 'Couple Names', ''), e.couple),
      'date', coalesce(nullif(e.settings ->> 'Wedding Date', ''), e.date), 'place', coalesce(e.settings ->> 'Location', ''), 'status', e.status,
      'start', coalesce(e.settings ->> 'Start Date', ''), 'end', coalesce(e.settings ->> 'End Date', ''), 'sunset', coalesce(e.settings ->> 'Sunset Time', ''),
      'email', coalesce(e.settings ->> 'Client Email', ''), 'venue', coalesce(e.settings ->> 'Venue', ''), 'country', coalesce(e.settings ->> 'Country', ''),
      'sheetUrl', '', 'folderUrl', '', 'coupleToken', e.couple_token,
      'counts', (select jsonb_build_object('total', count(*), 'Maybe', count(*) filter (where status = 'Maybe'),
          'Confirmed', count(*) filter (where status = 'Confirmed'), 'Declined', count(*) filter (where status = 'Declined'),
          'adults', count(*) filter (where status = 'Confirmed' and age = 'Adult'), 'children', count(*) filter (where status = 'Confirmed' and age = 'Child'),
          'babies', count(*) filter (where status = 'Confirmed' and age = 'Baby'))
        from public.guests g where g.event_id = e.id and not g.deleted)) x
    from public.events e where e.status <> 'Deleted'
  ) s
$$;

do $$ declare r record; begin for r in select id from public.events loop perform public.kai_sync_members(r.id); end loop; end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.kai_api(text, jsonb) to authenticated;
grant execute on function public.kai_public(jsonb) to anon, authenticated;
grant execute on function public.kai_alive() to anon;
grant execute on function public.kai_is_admin() to authenticated;
grant execute on function public.kai_couple_enter(text, text) to service_role;
