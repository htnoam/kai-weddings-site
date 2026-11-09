-- KAI Events v2: the API. One entry point, kai_api(action, data), mirrors the old Hub actions and answers in the same shape,
-- so the screens work unchanged. Who is calling comes from the login (auth.jwt email): Noam (admins) or the couple (event_members).

-- ---------- small helpers ----------
create or replace function public.kai_clean(v text, n int default 300) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(v, ''), '\s+', ' ', 'g')), n)
$$;

create or replace function public.kai_norm_phone(p text) returns text language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
begin
  if s = '' then return ''; end if;
  if left(s, 2) = '00' then s := '+' || substr(s, 3);
  elsif left(s, 1) = '0' then s := '+972' || substr(s, 2);
  elsif s ~ '^5[0-9]{8}$' then s := '+972' || s;
  elsif left(s, 1) <> '+' then s := '+' || s;
  end if;
  return s;
end $$;

create or replace function public.kai_stamp(who text) returns text language sql stable as $$
  select to_char(now() at time zone 'Asia/Jerusalem', 'DD/MM/YYYY HH24:MI') || ' · ' || who
$$;

create or replace function public.kai_ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

-- The built-in columns: key, label, type (text | date | time | select | phone)
create or replace function public.kai_fields() returns table (k text, label text, type text) language sql immutable as $$
  values ('first', 'First Name', 'text'), ('last', 'Last Name', 'text'), ('phone', 'Phone', 'phone'), ('age', 'Age Group', 'select'),
    ('status', 'RSVP Status', 'select'), ('group', 'Guest Group', 'text'), ('notes', 'Notes', 'text'),
    ('arrDate', 'Arrival Flight Date', 'date'), ('arrTime', 'Arrival Flight Time', 'time'), ('arrFlight', 'Arrival Flight Number', 'text'),
    ('arrBus', 'Arrival Bus', 'text'), ('depDate', 'Departure Flight Date', 'date'), ('depTime', 'Departure Flight Time', 'time'),
    ('depFlight', 'Departure Flight Number', 'text'), ('depBus', 'Departure Bus', 'text'), ('checkIn', 'Check In', 'date'),
    ('checkOut', 'Check Out', 'date'), ('room', 'Room #', 'text'), ('table', 'Table #', 'text')
$$;

-- Every column of one event (built-in + its own), with choices for list / yes-no columns.
create or replace function public.kai_cols(ev uuid) returns table (k text, label text, type text, choices text[], custom boolean)
language sql stable as $$
  select f.k, f.label, f.type,
    case f.k when 'age' then array['Adult', 'Child', 'Baby'] when 'status' then array['Maybe', 'Confirmed', 'Declined'] else null end, false
  from public.kai_fields() f
  union all
  select c.k, c.label, case c.type when 'date' then 'date' when 'text' then 'text' else 'choice' end,
    case c.type when 'list' then c.options when 'yesno' then array['Yes', 'No'] else null end, true
  from public.custom_columns c where c.event_id = ev
$$;

create or replace function public.kai_label(ev uuid, key text) returns text language sql stable as $$
  select coalesce((select label from public.kai_cols(ev) where k = key), case key when 'no' then 'Guest No.' else key end)
$$;

-- One guest as the screens expect it: built-in fields + the event's own columns, flat.
create or replace function public.kai_guest_json(g public.guests) returns jsonb language sql stable as $$
  select (to_jsonb(g) - 'event_id' - 'custom') ||
    coalesce((select jsonb_object_agg(c.k, coalesce(g.custom ->> c.k, '')) from public.custom_columns c where c.event_id = g.event_id), '{}'::jsonb)
$$;

-- Same checks as the old Hub (validate_). partial = only the keys that were sent.
create or replace function public.kai_validate(ev uuid, f jsonb, partial boolean) returns text language plpgsql stable as $$
declare errs text[] := '{}'; k text; v text; c record; lab text;
begin
  foreach k in array array['first', 'last', 'phone'] loop
    if not partial or f ? k then
      if public.kai_clean(f ->> k) = '' then
        lab := case k when 'first' then 'First Name' when 'last' then 'Last Name' else 'Phone' end;
        errs := errs || (lab || ' is required.');
      end if;
    end if;
  end loop;
  if (f ? 'first' and coalesce(f ->> 'first', '') ~ '[֐-׿]') or (f ? 'last' and coalesce(f ->> 'last', '') ~ '[֐-׿]') then
    errs := errs || 'Names must be in English.'::text;
  end if;
  if f ? 'phone' and public.kai_clean(f ->> 'phone') <> '' and public.kai_norm_phone(f ->> 'phone') !~ '^\+[0-9]{8,15}$' then
    errs := errs || 'Phone number looks incomplete.'::text;
  end if;
  if (not partial or f ? 'age') and coalesce(f ->> 'age', '') not in ('Adult', 'Child', 'Baby') then errs := errs || 'Age Group must be Adult, Child or Baby.'::text; end if;
  if (not partial or f ? 'status') and coalesce(f ->> 'status', '') not in ('Maybe', 'Confirmed', 'Declined') then errs := errs || 'RSVP Status is not valid.'::text; end if;
  for c in select * from public.kai_cols(ev) loop
    v := coalesce(f ->> c.k, '');
    if not (f ? c.k) or v = '' then continue; end if;
    if c.type = 'date' and v !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then errs := errs || 'Write dates as DD/MM/YYYY.'::text; end if;
    if c.type = 'time' and v !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then errs := errs || 'Write times as HH:MM.'::text; end if;
    if c.custom and c.choices is not null and not (v = any (c.choices)) then errs := errs || ('Choose one of: ' || array_to_string(c.choices, ', ') || '.'); end if;
  end loop;
  select array_agg(distinct e) into errs from unnest(errs) e;
  return coalesce(array_to_string(errs, ' '), '');
end $$;

-- ---------- who is calling ----------
create or replace function public.kai_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;
create or replace function public.kai_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where email = public.kai_email() and public.kai_email() <> '')
$$;

-- ---------- reads used by list ----------
create or replace function public.kai_views(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', v.name,
      'cols', (select coalesce(jsonb_agg(x), '[]'::jsonb) from unnest(v.cols) x where x in (select k from public.kai_cols(ev))),
      'status', v.status, 'age', v.age, 'sort', v.sort, 'filters', v.filters) order by v.id), '[]'::jsonb)
  from public.views v where v.event_id = ev
$$;
create or replace function public.kai_custom(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('k', c.k, 'label', c.label, 'type', c.type,
      'options', to_jsonb(case c.type when 'yesno' then array['Yes', 'No'] else c.options end)) order by c.pos), '[]'::jsonb)
  from public.custom_columns c where c.event_id = ev
$$;
create or replace function public.kai_reminders(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_object_agg(phone, t), '{}'::jsonb)
  from (select phone, max(public.kai_ms(sent_at)) t from public.reminders where event_id = ev group by phone) x
$$;
create or replace function public.kai_changes(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'at', public.kai_ms(c.at), 'no', c."no", 'k', c.k, 'old', c.old, 'nw', c.nw, 'by', c.by_name) order by c.id), '[]'::jsonb)
  from public.changes c where c.event_id = ev and c.seen_at is null
$$;
create or replace function public.kai_guests(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(public.kai_guest_json(g) order by g."no"), '[]'::jsonb) from public.guests g where g.event_id = ev
$$;

-- ---------- writing one guest's fields (update / bulk) ----------
create or replace function public.kai_apply(ev uuid, g public.guests, fields jsonb, who text, is_admin boolean)
returns jsonb language plpgsql as $$
declare f jsonb := '{}'::jsonb; c record; v text; cur text; diffs text[] := '{}'; err text; cj jsonb := g.custom;
begin
  for c in select * from public.kai_cols(ev) loop
    if not (fields ? c.k) then continue; end if;
    v := case when c.k = 'phone' then public.kai_norm_phone(fields ->> c.k)
              when c.k in ('age', 'status') then coalesce(fields ->> c.k, '')
              else public.kai_clean(fields ->> c.k) end;
    f := f || jsonb_build_object(c.k, v);
  end loop;
  err := public.kai_validate(ev, f, true);
  if err <> '' then return jsonb_build_object('error', err); end if;
  for c in select * from public.kai_cols(ev) loop
    if not (f ? c.k) then continue; end if;
    v := f ->> c.k;
    cur := case when c.custom then coalesce(g.custom ->> c.k, '') else coalesce(to_jsonb(g) ->> c.k, '') end;
    if cur = v then continue; end if;
    if not is_admin then
      insert into public.changes (event_id, "no", k, old, nw, by_name) values (ev, g."no", c.k, cur, v, who);
    end if;
    if c.custom then cj := cj || jsonb_build_object(c.k, v);
    else execute format('update public.guests set %I = $1 where event_id = $2 and "no" = $3', c.k) using v, ev, g."no";
    end if;
    diffs := diffs || (c.label || ': ' || coalesce(nullif(cur, ''), '—') || ' → ' || coalesce(nullif(v, ''), '—'));
  end loop;
  if array_length(diffs, 1) > 0 then
    update public.guests set custom = cj, updated = public.kai_stamp(who) where event_id = ev and "no" = g."no";
    insert into public.guest_log (event_id, by_name, "no", guest, action, details)
      select ev, who, g."no", x."first" || ' ' || x."last", 'Edited', array_to_string(diffs, '; ') from public.guests x where x.event_id = ev and x."no" = g."no";
  end if;
  return jsonb_build_object('guest', (select public.kai_guest_json(x) from public.guests x where x.event_id = ev and x."no" = g."no"));
end $$;

-- ---------- the default views of a new event ----------
create or replace function public.kai_default_views(ev uuid) returns void language sql as $$
  insert into public.views (event_id, name, cols, status, age, sort) values
    (ev, 'Hotel', array['group', 'age', 'checkIn', 'checkOut', 'room', 'notes'], 'Confirmed', '', null),
    (ev, 'Arrivals', array['phone', 'arrDate', 'arrTime', 'arrFlight', 'arrBus'], 'Confirmed', '', '{"k":"arrDate","dir":1}'::jsonb),
    (ev, 'Departures', array['phone', 'depDate', 'depTime', 'depFlight', 'depBus'], 'Confirmed', '', '{"k":"depDate","dir":1}'::jsonb)
$$;

-- Couple emails come from Settings › Client Email (one or more, separated by commas).
create or replace function public.kai_sync_members(ev uuid) returns void language plpgsql as $$
declare em text;
begin
  delete from public.event_members where event_id = ev;
  foreach em in array regexp_split_to_array(coalesce((select settings ->> 'Client Email' from public.events where id = ev), ''), '[,;\s]+') loop
    em := lower(btrim(em));
    if em ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then insert into public.event_members values (ev, em) on conflict do nothing; end if;
  end loop;
end $$;

-- ---------- dashboard (Noam only) ----------
create or replace function public.kai_events() returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'github', jsonb_build_object('set', true, 'error', ''), 'events', coalesce(jsonb_agg(x order by x ->> 'date'), '[]'::jsonb))
  from (
    select jsonb_build_object('slug', e.slug, 'couple', coalesce(nullif(e.settings ->> 'Couple Names', ''), e.couple),
      'date', coalesce(nullif(e.settings ->> 'Wedding Date', ''), e.date), 'place', coalesce(e.settings ->> 'Location', ''), 'status', e.status,
      'start', coalesce(e.settings ->> 'Start Date', ''), 'end', coalesce(e.settings ->> 'End Date', ''), 'sunset', coalesce(e.settings ->> 'Sunset Time', ''),
      'email', coalesce(e.settings ->> 'Client Email', ''), 'venue', coalesce(e.settings ->> 'Venue', ''), 'country', coalesce(e.settings ->> 'Country', ''),
      'sheetUrl', '', 'folderUrl', '',
      'counts', (select jsonb_build_object('total', count(*), 'Maybe', count(*) filter (where status = 'Maybe'),
          'Confirmed', count(*) filter (where status = 'Confirmed'), 'Declined', count(*) filter (where status = 'Declined'),
          'adults', count(*) filter (where status = 'Confirmed' and age = 'Adult'), 'children', count(*) filter (where status = 'Confirmed' and age = 'Child'),
          'babies', count(*) filter (where status = 'Confirmed' and age = 'Baby'))
        from public.guests g where g.event_id = e.id and not g.deleted)) x
    from public.events e where e.status <> 'Deleted'
  ) s
$$;

create or replace function public.kai_basic_keys() returns text[] language sql immutable as $$
  select array['Couple Names', 'Wedding Date', 'Location', 'Client Email', 'Start Date', 'End Date', 'Sunset Time', 'Venue', 'Country', 'Wedding Plan',
    'Default Language', 'Dates Line', 'Hero Image', 'Share Image', 'Intro HE', 'Intro EN', 'Ask HE', 'Ask EN', 'Script HE', 'Script EN',
    'Hosting Title HE', 'Hosting Title EN', 'Hosting Chips HE', 'Hosting Chips EN', 'Hosting Text HE', 'Hosting Text EN', 'Hosting Note HE', 'Hosting Note EN',
    'Thanks HE', 'Thanks EN', 'Portal RSVP', 'Portal Flights', 'Portal Stay', 'Portal Info', 'Info HE', 'Info EN', 'Template', 'Grand Config']
$$;

create or replace function public.kai_rsvp_info(e public.events) returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'event', jsonb_build_object('couple', coalesce(e.settings ->> 'Couple Names', ''), 'date', coalesce(e.settings ->> 'Wedding Date', ''),
    'place', coalesce(e.settings ->> 'Location', '')) || coalesce((select jsonb_object_agg(k, coalesce(e.settings ->> k, '')) from unnest(public.kai_basic_keys()) k where k not in
    ('Couple Names', 'Wedding Date', 'Location', 'Client Email', 'Start Date', 'End Date', 'Sunset Time', 'Venue', 'Country', 'Wedding Plan')), '{}'::jsonb))
$$;

create or replace function public.kai_create_event(f jsonb) returns jsonb language plpgsql as $$
declare couple text := public.kai_clean(f ->> 'couple'); dt text := public.kai_clean(f ->> 'date'); lang text := case when f ->> 'lang' = 'en' then 'en' else 'he' end;
  venue text := public.kai_clean(f ->> 'venue'); country text := public.kai_clean(f ->> 'country'); place text;
  st text := public.kai_clean(f ->> 'start'); en text := public.kai_clean(f ->> 'end'); sunset text := public.kai_clean(f ->> 'sunset'); email text := public.kai_clean(f ->> 'email');
  v_slug text; ev uuid;
begin
  place := coalesce(nullif(concat_ws(', ', nullif(venue, ''), nullif(country, '')), ''), public.kai_clean(f ->> 'place'));
  if (st <> '' and st !~ '^\d{4}-\d{2}-\d{2}$') or (en <> '' and en !~ '^\d{4}-\d{2}-\d{2}$') then return jsonb_build_object('ok', false, 'error', 'Choose the wedding weekend dates.'); end if;
  if st <> '' and en <> '' and en < st then return jsonb_build_object('ok', false, 'error', 'The weekend ends before it starts. Check the dates.'); end if;
  if sunset <> '' and sunset !~ '^\d{2}:\d{2}$' then return jsonb_build_object('ok', false, 'error', 'Choose the sunset time.'); end if;
  if email <> '' and email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'error', 'Check the client’s email address.'); end if;
  if couple = '' then return jsonb_build_object('ok', false, 'error', 'Write the couple’s names.'); end if;
  if couple ~ '[֐-׿]' then return jsonb_build_object('ok', false, 'error', 'Write the couple’s names in English (they become the link).'); end if;
  if dt <> '' and dt !~ '^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('ok', false, 'error', 'Choose the wedding date.'); end if;
  v_slug := left(btrim(regexp_replace(replace(lower(coalesce(nullif(f ->> 'slug', ''), couple)), '&', ' '), '[^a-z0-9]+', '-', 'g'), '-'), 40);
  if v_slug = '' then return jsonb_build_object('ok', false, 'error', 'Write the couple’s names in English letters.'); end if;
  if v_slug in ('admin', 'app', 'demo', 'logo', 'pictures', 'v2') or exists (select 1 from public.events where events.slug = v_slug) then
    return jsonb_build_object('ok', false, 'error', 'The link events.kaiwedd.com/v2/' || v_slug || ' is already taken. Change the names slightly.');
  end if;
  insert into public.events (slug, couple, date, settings) values (v_slug, couple, dt, jsonb_build_object(
    'Couple Names', couple, 'Wedding Date', dt, 'Location', place, 'Default Language', lang, 'Client Email', email,
    'Start Date', st, 'End Date', en, 'Sunset Time', sunset, 'Venue', venue, 'Country', country)) returning id into ev;
  perform public.kai_default_views(ev);
  perform public.kai_sync_members(ev);
  return jsonb_build_object('ok', true, 'event', jsonb_build_object('slug', v_slug, 'couple', couple), 'schedule', '');
end $$;

create or replace function public.kai_save_settings(e public.events, vals jsonb) returns jsonb language plpgsql as $$
declare k text; v text; s jsonb := e.settings;
begin
  for k in select jsonb_object_keys(vals) loop
    if not (k = any (public.kai_basic_keys())) then continue; end if;
    v := left(btrim(replace(coalesce(vals ->> k, ''), E'\r', '')), case when k = 'Grand Config' then 45000 else 3000 end);
    s := s || jsonb_build_object(k, v);
  end loop;
  if vals ? 'Venue' or vals ? 'Country' then
    v := concat_ws(', ', nullif(s ->> 'Venue', ''), nullif(s ->> 'Country', ''));
    if v <> '' then s := s || jsonb_build_object('Location', v); end if;
  end if;
  update public.events set settings = s, couple = coalesce(nullif(s ->> 'Couple Names', ''), couple), date = coalesce(s ->> 'Wedding Date', date)
    where id = e.id returning * into e;
  if vals ? 'Client Email' then perform public.kai_sync_members(e.id); end if;
  return public.kai_rsvp_info(e);
end $$;

