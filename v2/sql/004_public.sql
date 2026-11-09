-- KAI Events v2: the guests' side (no sign-in): RSVP form, Grand site, guest area. One entry point: kai_public(data).
-- Same behaviour as the old Hub (rsvpToGuests_, externalRsvp_ own, grandGet_, portalLogin_/portalRsvp_/portalFlights_).

create table if not exists public.rsvp_data (      -- the whole Grand RSVP as the guest sent it, so their personal link can reopen it
  event_id uuid not null references public.events(id) on delete cascade,
  ref text not null,
  updated_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  primary key (event_id, ref)
);
create table if not exists public.rsvp_map (       -- guest N of a Grand RSVP always maps to the same row
  event_id uuid not null references public.events(id) on delete cascade,
  ref text not null,
  idx int not null,
  "no" int not null,
  primary key (event_id, ref, idx)
);
alter table public.rsvp_data enable row level security;
alter table public.rsvp_map enable row level security;

-- Write fields as they are (no checks), recording each change for "Changes to review". Old Hub: setCells_.
create or replace function public.kai_set_cells(ev uuid, gno int, fields jsonb, who text) returns void
language plpgsql set search_path = public as $$
declare g public.guests; c record; v text; cur text; diffs text[] := '{}'; cj jsonb;
begin
  select * into g from public.guests where event_id = ev and "no" = gno; if g."no" is null then return; end if;
  cj := g.custom;
  for c in select * from public.kai_cols(ev) loop
    if not (fields ? c.k) then continue; end if;
    v := public.kai_clean(fields ->> c.k);
    cur := case when c.custom then coalesce(g.custom ->> c.k, '') else coalesce(to_jsonb(g) ->> c.k, '') end;
    if cur = v then continue; end if;
    if c.k in ('age', 'status') and v not in (select unnest(c.choices)) then continue; end if;
    insert into public.changes (event_id, "no", k, old, nw, by_name) values (ev, gno, c.k, cur, v, who);
    if c.custom then cj := cj || jsonb_build_object(c.k, v);
    else execute format('update public.guests set %I = $1 where event_id = $2 and "no" = $3', c.k) using v, ev, gno; end if;
    diffs := diffs || (c.label || ': ' || coalesce(nullif(cur, ''), '—') || ' → ' || coalesce(nullif(v, ''), '—'));
  end loop;
  if array_length(diffs, 1) > 0 then
    update public.guests set custom = cj, updated = public.kai_stamp(who) where event_id = ev and "no" = gno;
    insert into public.guest_log (event_id, by_name, "no", guest, action, details)
      select ev, who, gno, x."first" || ' ' || x."last", 'Edited', array_to_string(diffs, '; ') from public.guests x where x.event_id = ev and x."no" = gno;
  end if;
end $$;

-- A new guest from the guests' side (no checks beyond what the caller did). Shows as "New guest" in Changes to review.
create or replace function public.kai_new_guest(ev uuid, f jsonb, log_by text, chg_by text, details text) returns int
language plpgsql set search_path = public as $$
declare nxt int; c record; v text;
begin
  perform pg_advisory_xact_lock(hashtext(ev::text));
  select coalesce(max("no"), 0) + 1 into nxt from public.guests where event_id = ev;
  insert into public.guests (event_id, "no", "first", "last", phone, age, status, "group", notes, updated)
    values (ev, nxt, public.kai_clean(f ->> 'first'), public.kai_clean(f ->> 'last'), coalesce(f ->> 'phone', ''),
      case when f ->> 'age' in ('Adult', 'Child', 'Baby') then f ->> 'age' else 'Adult' end,
      case when f ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then f ->> 'status' else 'Maybe' end,
      public.kai_clean(f ->> 'group'), public.kai_clean(f ->> 'notes'), public.kai_stamp(log_by));
  for c in select * from public.kai_cols(ev) cc where not cc.custom and cc.k not in ('first', 'last', 'phone', 'age', 'status', 'group', 'notes') loop
    v := public.kai_clean(f ->> c.k);
    if v <> '' then execute format('update public.guests set %I = $1 where event_id = $2 and "no" = $3', c.k) using v, ev, nxt; end if;
  end loop;
  insert into public.changes (event_id, "no", k, old, nw, by_name) values (ev, nxt, '*', '', 'New guest', chg_by);
  insert into public.guest_log (event_id, by_name, "no", guest, action, details)
    values (ev, log_by, nxt, public.kai_clean(f ->> 'first') || ' ' || public.kai_clean(f ->> 'last'), 'Added', details);
  return nxt;
end $$;

-- Guest area: what the family on this phone sees.
create or replace function public.kai_portal_view(e public.events, ph text) returns jsonb
language plpgsql stable set search_path = public as $$
declare s jsonb := e.settings; show jsonb;
begin
  show := jsonb_build_object('rsvp', coalesce(s ->> 'Portal RSVP', '') <> 'off', 'flights', s ->> 'Portal Flights' = 'on',
    'stay', s ->> 'Portal Stay' = 'on', 'info', s ->> 'Portal Info' = 'on');
  return jsonb_build_object('ok', true, 'show', show,
    'info', case when (show ->> 'info')::boolean then jsonb_build_object('he', coalesce(s ->> 'Info HE', ''), 'en', coalesce(s ->> 'Info EN', '')) else null end,
    'wedding', jsonb_build_object('couple', coalesce(s ->> 'Couple Names', ''), 'date', coalesce(s ->> 'Wedding Date', ''), 'place', coalesce(s ->> 'Location', '')),
    'family', (select coalesce(jsonb_agg(
        jsonb_build_object('no', g."no", 'first', g."first", 'last', g."last", 'age', g.age, 'status', g.status)
        || case when (show ->> 'flights')::boolean then jsonb_build_object('arrDate', g."arrDate", 'arrTime', g."arrTime", 'arrFlight', g."arrFlight",
             'depDate', g."depDate", 'depTime', g."depTime", 'depFlight', g."depFlight") else '{}'::jsonb end
        || case when (show ->> 'stay')::boolean then jsonb_build_object('room', g.room, 'table', g."table", 'checkIn', g."checkIn", 'checkOut', g."checkOut") else '{}'::jsonb end
        order by g."no"), '[]'::jsonb)
      from public.guests g where g.event_id = e.id and not g.deleted and g.phone = ph));
end $$;

-- The RSVP form (classic design). Old Hub: rsvpToGuests_.
create or replace function public.kai_rsvp(ev uuid, d jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare ph text := public.kai_norm_phone(d ->> 'phone');
  st text := case d ->> 'attend' when 'yes' then 'Confirmed' when 'no' then 'Declined' when 'maybe' then 'Maybe' else 'Confirmed' end;
  people jsonb; p jsonb; grp text; g public.guests; f jsonb; i int := 0; age text;
begin
  people := jsonb_build_array(jsonb_build_object('first', d ->> 'first', 'last', d ->> 'last', 'type', coalesce(d ->> 'type', 'adult'), 'main', true));
  if coalesce(d ->> 'attend', '') <> 'no' and jsonb_typeof(d -> 'companions') = 'array' then people := people || (d -> 'companions'); end if;
  select x."group" into grp from public.guests x where ph <> '' and x.event_id = ev and not x.deleted and x.phone = ph order by x."no" limit 1;
  grp := coalesce(grp, public.kai_clean((d ->> 'first') || ' ' || (d ->> 'last')));
  for p in select value from jsonb_array_elements(people) limit 11 loop
    if public.kai_clean(p ->> 'first') = '' and public.kai_clean(p ->> 'last') = '' then continue; end if;
    age := case p ->> 'type' when 'child' then 'Child' when 'baby' then 'Baby' else 'Adult' end;
    f := jsonb_build_object('status', st, 'age', age);
    if coalesce((p ->> 'main')::boolean, false) and public.kai_clean(d ->> 'note') <> '' then f := f || jsonb_build_object('notes', public.kai_clean(d ->> 'note')); end if;
    g := null;
    if ph <> '' then
      select * into g from public.guests x where x.event_id = ev and not x.deleted and x.phone = ph
        and lower(x."first" || '|' || x."last") = lower(public.kai_clean(p ->> 'first') || '|' || public.kai_clean(p ->> 'last')) order by x."no" limit 1;
    end if;
    if g."no" is not null then perform public.kai_apply(ev, g, f, 'RSVP', false); continue; end if;
    perform public.kai_new_guest(ev, f || jsonb_build_object('first', p ->> 'first', 'last', p ->> 'last', 'phone', ph, 'group', grp),
      'RSVP', 'RSVP form', st || ' · ' || age || ' · ' || grp);
  end loop;
  return jsonb_build_object('ok', true);
end $$;

-- The Grand site's RSVP (with the guest's personal link ?r=<id>). Old Hub: externalRsvp_(d, 'RSVP form').
create or replace function public.kai_grand_save(ev uuid, d jsonb, who text) returns jsonb
language plpgsql set search_path = public as $$
declare x jsonb := coalesce(d -> 'data', '{}'::jsonb); vref text := coalesce(x ->> 'id', ''); yes boolean; people jsonb; st text; grp text;
  p jsonb; i int := -1; fullname text; sp int; fi text; la text; f jsonb; ph text; own boolean; notes text; gno int; added int := 0; m record; n int;
  en jsonb := '{"צמחוני":"Vegetarian","טבעוני":"Vegan","כשר":"Kosher","כשר למהדרין":"Strictly kosher","גלוטן":"gluten","חלב / לקטוז":"dairy / lactose","ביצים":"eggs","בוטנים":"peanuts","אגוזים":"nuts","שומשום":"sesame","דגים":"fish"}';
begin
  if vref !~* '^[a-f0-9]{8,40}$' then return jsonb_build_object('ok', false, 'error', 'Missing RSVP id.'); end if;
  yes := not coalesce((d ->> 'cancel')::boolean, false) and coalesce(x ->> 'status', '') <> 'cancelled' and x ->> 'attending' = 'yes';
  people := case when yes and jsonb_typeof(x -> 'guests') = 'array' and jsonb_array_length(x -> 'guests') > 0 then x -> 'guests' else jsonb_build_array(jsonb_build_object('name', x ->> 'name')) end;
  st := case when yes then 'Confirmed' else 'Declined' end;
  grp := public.kai_clean(coalesce(nullif(x ->> 'name', ''), people -> 0 ->> 'name'));
  ph := public.kai_norm_phone(x ->> 'phone');
  for p in select value from jsonb_array_elements(people) limit 30 loop
    i := i + 1;
    fullname := public.kai_clean(coalesce(nullif(p ->> 'name', ''), case when i = 0 then x ->> 'name' end));
    if fullname = '' then fullname := 'Guest ' || (i + 1) || ' of ' || grp; end if;
    sp := position(' ' in fullname);
    fi := case when sp > 0 then left(fullname, sp - 1) else fullname end; la := case when sp > 0 then substr(fullname, sp + 1) else '' end;
    if public.kai_clean(p ->> 'first') <> '' then fi := public.kai_clean(p ->> 'first'); la := public.kai_clean(p ->> 'last'); end if;
    f := jsonb_build_object('first', fi, 'last', la, 'status', st,
      'age', case lower(public.kai_clean(p ->> 'age')) when 'ילד' then 'Child' when 'תינוק' then 'Baby' when 'child' then 'Child' when 'baby' then 'Baby' else 'Adult' end);
    if ph ~ '^\+[0-9]{8,15}$' then f := f || jsonb_build_object('phone', ph); end if;
    if yes then
      own := coalesce((p ->> 'ownFlight')::boolean, false);
      f := f || jsonb_build_object('arrFlight', public.kai_clean(case when own then p ->> 'flightOut' else x ->> 'flightOut' end),
        'depFlight', public.kai_clean(case when own then p ->> 'flightBack' else x ->> 'flightBack' end),
        'arrDate', coalesce(to_char(to_date(substring(x ->> 'flightOutDate' from '^\d{4}-\d{2}-\d{2}'), 'YYYY-MM-DD'), 'DD/MM/YYYY'), ''),
        'arrTime', coalesce(substring(x ->> 'flightOutTime' from '^(\d{2}:\d{2})'), ''),
        'depDate', coalesce(to_char(to_date(substring(x ->> 'flightBackDate' from '^\d{4}-\d{2}-\d{2}'), 'YYYY-MM-DD'), 'DD/MM/YYYY'), ''),
        'depTime', coalesce(substring(x ->> 'flightBackTime' from '^(\d{2}:\d{2})'), ''));
      notes := concat_ws(' · ',
        case when coalesce(p ->> 'diet', '') not in ('', 'רגיל') then coalesce(en ->> public.kai_clean(p ->> 'diet'), public.kai_clean(p ->> 'diet')) end,
        case when coalesce(p ->> 'kosher', '') not in ('', 'לא משנה') then coalesce(en ->> public.kai_clean(p ->> 'kosher'), public.kai_clean(p ->> 'kosher')) end,
        case when jsonb_typeof(p -> 'allergies') = 'array' and jsonb_array_length(p -> 'allergies') > 0 then 'Allergies: ' ||
          (select string_agg(coalesce(en ->> public.kai_clean(a), public.kai_clean(a)), ', ') from jsonb_array_elements_text(p -> 'allergies') a) end,
        nullif(public.kai_clean(p ->> 'other'), ''));
      f := f || jsonb_build_object('notes', coalesce(notes, ''));
    end if;
    select r."no" into gno from public.rsvp_map r join public.guests g on g.event_id = r.event_id and g."no" = r."no" and not g.deleted
      where r.event_id = ev and r.ref = x ->> 'id' and r.idx = i;
    if gno is not null then perform public.kai_set_cells(ev, gno, f, who); gno := null; continue; end if;
    n := public.kai_new_guest(ev, f || jsonb_build_object('group', grp), who, who, st || ' · ' || grp);
    insert into public.rsvp_map values (ev, x ->> 'id', i, n) on conflict (event_id, ref, idx) do update set "no" = excluded."no";
    added := added + 1;
  end loop;
  for m in select r."no" from public.rsvp_map r where r.event_id = ev and r.ref = x ->> 'id' and r.idx > i loop   -- no longer on this RSVP
    perform public.kai_set_cells(ev, m."no", '{"status":"Declined"}'::jsonb, who);
  end loop;
  insert into public.rsvp_data (event_id, ref, data) values (ev, x ->> 'id', x)
    on conflict (event_id, ref) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('ok', true, 'added', added);
end $$;

-- The single entry point for the guests' side. Anyone may call it (like the old Hub); it only does these actions.
create or replace function public.kai_public(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce(p, '{}'::jsonb); act text := coalesce(nullif(d ->> 'action', ''), 'rsvp'); e public.events; ev uuid; ph text;
  g public.guests; mm jsonb; fi text; la text; f jsonb; r jsonb; err text; k text; res jsonb;
begin
  select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'This event was not found. Check the link.'); end if;
  ev := e.id;

  if act = 'rsvpInfo' then return public.kai_rsvp_info(e); end if;

  if act = 'grandGet' then
    if coalesce(d ->> 'ref', '') !~* '^[a-f0-9]{8,40}$' then return jsonb_build_object('ok', true, 'found', false); end if;
    select data into r from public.rsvp_data where event_id = ev and ref = d ->> 'ref';
    return case when r is null then jsonb_build_object('ok', true, 'found', false) else jsonb_build_object('ok', true, 'found', true, 'data', r) end;
  end if;

  if act in ('portalLogin', 'portalRsvp', 'portalFlights') then
    ph := public.kai_norm_phone(d ->> 'phone');
    if ph !~ '^\+[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    if not exists (select 1 from public.guests where event_id = ev and not deleted and phone = ph) then return jsonb_build_object('ok', false, 'error', 'none'); end if;
    if act = 'portalLogin' then return public.kai_portal_view(e, ph); end if;
  end if;

  if act not in ('rsvp', 'grandSave', 'portalRsvp', 'portalFlights') then return jsonb_build_object('ok', false, 'error', 'Unknown action.'); end if;
  update public.events set ver = public.kai_ms(clock_timestamp()), ver_by = '',
    ver_name = case when act = 'rsvp' or act = 'grandSave' then 'RSVP form' else 'Guest portal' end where id = ev;

  if act = 'rsvp' then return public.kai_rsvp(ev, d); end if;

  if act = 'grandSave' then
    if coalesce(e.settings ->> 'Template', '') <> 'Grand' then return jsonb_build_object('ok', false, 'error', 'This event uses another invitation design.'); end if;
    return public.kai_grand_save(ev, d, 'RSVP form');
  end if;

  if act = 'portalRsvp' then
    if coalesce(e.settings ->> 'Portal RSVP', '') = 'off' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    for mm in select value from jsonb_array_elements(case when jsonb_typeof(d -> 'members') = 'array' then d -> 'members' else '[]'::jsonb end) loop
      select * into g from public.guests where event_id = ev and not deleted and phone = ph and "no" = (mm ->> 'no')::int;
      if g."no" is null then continue; end if;
      f := '{}'::jsonb;
      k := case when mm ->> 'status' in ('Pending', 'Tentative') then 'Maybe' else mm ->> 'status' end;
      if k in ('Maybe', 'Confirmed', 'Declined') then f := f || jsonb_build_object('status', k); end if;
      fi := public.kai_clean(mm ->> 'first'); la := public.kai_clean(mm ->> 'last');
      if fi <> '' and la <> '' and (fi || la) !~ '[֐-׿]' then f := f || jsonb_build_object('first', fi, 'last', la); end if;
      if f <> '{}'::jsonb then perform public.kai_apply(ev, g, f, 'Guest portal', false); end if;
    end loop;
    for mm in select value from jsonb_array_elements(case when jsonb_typeof(d -> 'add') = 'array' then d -> 'add' else '[]'::jsonb end) limit 10 loop
      fi := public.kai_clean(mm ->> 'first'); la := public.kai_clean(mm ->> 'last');
      if fi = '' or la = '' or (fi || la) ~ '[֐-׿]' then continue; end if;
      k := case when mm ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then mm ->> 'status' else 'Confirmed' end;
      perform public.kai_new_guest(ev, jsonb_build_object('first', fi, 'last', la, 'phone', ph,
          'age', case when mm ->> 'age' in ('Adult', 'Child', 'Baby') then mm ->> 'age' else 'Adult' end, 'status', k,
          'group', (select "group" from public.guests where event_id = ev and not deleted and phone = ph order by "no" limit 1)),
        'Guest portal', 'Guest portal',
        k || ' · ' || case when mm ->> 'age' in ('Adult', 'Child', 'Baby') then mm ->> 'age' else 'Adult' end);
    end loop;
    return public.kai_portal_view(e, ph);
  end if;

  if act = 'portalFlights' then
    if coalesce(e.settings ->> 'Portal Flights', '') <> 'on' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    for mm in select value from jsonb_array_elements(case when jsonb_typeof(d -> 'flights') = 'array' then d -> 'flights' else '[]'::jsonb end) loop
      select * into g from public.guests where event_id = ev and not deleted and phone = ph and "no" = (mm ->> 'no')::int;
      if g."no" is null then continue; end if;
      f := '{}'::jsonb;
      foreach k in array array['arrDate', 'arrTime', 'arrFlight', 'depDate', 'depTime', 'depFlight'] loop
        if mm ? k then f := f || jsonb_build_object(k, public.kai_clean(mm ->> k)); end if;
      end loop;
      r := public.kai_apply(ev, g, f, 'Guest portal', false);
      if r ? 'error' and err is null then err := r ->> 'error'; end if;
    end loop;
    if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
    return public.kai_portal_view(e, ph);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Unknown action.');
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.kai_api(text, jsonb) to authenticated;
grant execute on function public.kai_public(jsonb) to anon, authenticated;
grant execute on function public.kai_alive() to anon;
grant execute on function public.kai_is_admin() to authenticated;   -- used by the photo upload rule below

-- Photos for the RSVP form / Grand site (dashboard › Edit RSVP). Public to read; only Noam can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-images', 'event-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "KAI admin uploads event images" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-images' and public.kai_is_admin());
