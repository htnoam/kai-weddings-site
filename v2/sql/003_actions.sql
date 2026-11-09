-- KAI Events v2: the actions, split in three (guests / views, columns, reminders, changes / the entry point kai_api).

create or replace function public.kai_drop_view(ev uuid, vname text) returns void language sql as $$
  delete from public.views where event_id = ev and name = vname;
$$;
create or replace function public.kai_drop_column(ev uuid, ck text) returns void language sql as $$
  delete from public.custom_columns where event_id = ev and k = ck;
$$;

create or replace function public.kai_act_guests(p_action text, d jsonb, ev uuid, who text, is_admin boolean)
returns jsonb language plpgsql as $$
declare g public.guests; r jsonb; out jsonb := '[]'::jsonb; n int; nxt int; vk text; v text; x jsonb; f jsonb; err text;
  skipped jsonb := '[]'::jsonb; added int := 0; seen text[] := '{}'; vkey text; i int := 0; c record;
begin
  if p_action = 'add' then
    f := coalesce(d -> 'guest', '{}'::jsonb);
    f := jsonb_build_object('first', public.kai_clean(f ->> 'first'), 'last', public.kai_clean(f ->> 'last'), 'phone', public.kai_norm_phone(f ->> 'phone'),
      'age', coalesce(nullif(f ->> 'age', ''), 'Adult'), 'status', coalesce(nullif(f ->> 'status', ''), 'Maybe'), 'group', public.kai_clean(f ->> 'group'), 'notes', public.kai_clean(f ->> 'notes'));
    err := public.kai_validate(ev, f, false);
    if err <> '' then return jsonb_build_object('ok', false, 'error', err); end if;
    perform pg_advisory_xact_lock(hashtext(ev::text));
    select coalesce(max("no"), 0) + 1 into nxt from public.guests where event_id = ev;
    insert into public.guests (event_id, "no", "first", "last", phone, age, status, "group", notes, updated)
      values (ev, nxt, f ->> 'first', f ->> 'last', f ->> 'phone', f ->> 'age', f ->> 'status', f ->> 'group', f ->> 'notes', public.kai_stamp(who)) returning * into g;
    if not is_admin then insert into public.changes (event_id, "no", k, old, nw, by_name) values (ev, nxt, '*', '', 'New guest', who); end if;
    insert into public.guest_log (event_id, by_name, "no", guest, action, details)
      values (ev, who, nxt, g."first" || ' ' || g."last", 'Added', g.status || ' · ' || g.age || case when g."group" <> '' then ' · ' || g."group" else '' end);
    return jsonb_build_object('ok', true, 'guest', public.kai_guest_json(g));
  end if;

  if p_action = 'import' then
    perform pg_advisory_xact_lock(hashtext(ev::text));
    select coalesce(max("no"), 0) + 1 into nxt from public.guests where event_id = ev;
    select coalesce(array_agg(lower(phone || '|' || "first" || '|' || "last")), '{}') into seen from public.guests where event_id = ev and not deleted;
    for x in select value from jsonb_array_elements(coalesce(d -> 'guests', '[]'::jsonb)) limit 2000 loop
      i := i + 1;
      f := jsonb_build_object('first', public.kai_clean(x ->> 'first'), 'last', public.kai_clean(x ->> 'last'), 'phone', public.kai_norm_phone(x ->> 'phone'),
        'age', case when x ->> 'age' in ('Adult', 'Child', 'Baby') then x ->> 'age' else 'Adult' end,
        'status', case when x ->> 'status' in ('Pending', 'Tentative') then 'Maybe' when x ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then x ->> 'status' else 'Maybe' end,
        'group', public.kai_clean(x ->> 'group'), 'notes', public.kai_clean(x ->> 'notes'));
      err := public.kai_validate(ev, f, false);
      if err <> '' then skipped := skipped || jsonb_build_array(jsonb_build_object('row', coalesce((x ->> 'row')::int, i), 'reason', err)); continue; end if;
      vkey := lower((f ->> 'phone') || '|' || (f ->> 'first') || '|' || (f ->> 'last'));
      if vkey = any (seen) then skipped := skipped || jsonb_build_array(jsonb_build_object('row', coalesce((x ->> 'row')::int, i), 'reason', 'Already on the list.')); continue; end if;
      seen := seen || vkey;
      insert into public.guests (event_id, "no", "first", "last", phone, age, status, "group", notes, updated)
        values (ev, nxt, f ->> 'first', f ->> 'last', f ->> 'phone', f ->> 'age', f ->> 'status',
          coalesce(nullif(f ->> 'group', ''), (f ->> 'first') || ' ' || (f ->> 'last')), f ->> 'notes', public.kai_stamp(who)) returning * into g;
      for c in select * from public.kai_cols(ev) cc where cc.k not in ('first', 'last', 'phone', 'age', 'status', 'group', 'notes') loop
        v := public.kai_clean(x ->> c.k);
        if v = '' or (c.custom and c.choices is not null and not (v = any (c.choices))) then continue; end if;
        if c.custom then update public.guests set custom = custom || jsonb_build_object(c.k, v) where event_id = ev and "no" = nxt;
        else execute format('update public.guests set %I = $1 where event_id = $2 and "no" = $3', c.k) using v, ev, nxt; end if;
      end loop;
      insert into public.guest_log (event_id, by_name, "no", guest, action, details)
        values (ev, who, nxt, g."first" || ' ' || g."last", 'Imported', g.status || ' · ' || g.age || case when (f ->> 'group') <> '' then ' · ' || (f ->> 'group') else '' end);
      nxt := nxt + 1; added := added + 1;
    end loop;
    return jsonb_build_object('ok', true, 'added', added, 'skipped', skipped, 'guests', public.kai_guests(ev));
  end if;

  if p_action = 'update' then
    select * into g from public.guests where event_id = ev and "no" = (d ->> 'no')::int;
    if g."no" is null then return jsonb_build_object('ok', false, 'error', 'Guest not found. Refresh and try again.'); end if;
    r := public.kai_apply(ev, g, coalesce(d -> 'fields', '{}'::jsonb), who, is_admin);
    if r ? 'error' then return jsonb_build_object('ok', false, 'error', r ->> 'error'); end if;
    return jsonb_build_object('ok', true, 'guest', r -> 'guest');
  end if;

  if p_action = 'bulk' then
    f := '{}'::jsonb;
    foreach vk in array array['status', 'age', 'group'] loop if (d -> 'fields') ? vk then f := f || jsonb_build_object(vk, d -> 'fields' -> vk); end if; end loop;
    for n in select (jsonb_array_elements_text(coalesce(d -> 'nos', '[]'::jsonb)))::int loop
      select * into g from public.guests where event_id = ev and "no" = n;
      if g."no" is null then continue; end if;
      r := public.kai_apply(ev, g, f, who, is_admin);
      if r ? 'error' then raise exception using message = 'KAI:' || (r ->> 'error'); end if;
      out := out || jsonb_build_array(r -> 'guest');
    end loop;
    return jsonb_build_object('ok', true, 'guests', out);
  end if;

  if p_action in ('delete', 'restore') then
    for n in select (jsonb_array_elements_text(coalesce(d -> 'nos', '[]'::jsonb)))::int loop
      update public.guests set deleted = (p_action = 'delete'), updated = public.kai_stamp(who)
        where event_id = ev and "no" = n and deleted <> (p_action = 'delete') returning * into g;
      if not found then continue; end if;
      insert into public.guest_log (event_id, by_name, "no", guest, action, details) values (ev, who, n, g."first" || ' ' || g."last", case when p_action = 'delete' then 'Deleted' else 'Restored' end, '');
      out := out || jsonb_build_array(public.kai_guest_json(g));
    end loop;
    return jsonb_build_object('ok', true, 'guests', out);
  end if;

  return null;
exception when raise_exception then
  if sqlerrm like 'KAI:%' then return jsonb_build_object('ok', false, 'error', substr(sqlerrm, 5)); end if;
  raise;
end $$;

create or replace function public.kai_act_misc(p_action text, d jsonb, ev uuid, who text, is_admin boolean)
returns jsonb language plpgsql as $$
declare r jsonb; n int; vk text; v text; x jsonb; f jsonb; opts text[];
begin
  if p_action = 'saveView' then
    f := coalesce(d -> 'view', '{}'::jsonb); v := left(public.kai_clean(f ->> 'name'), 40);
    if v = '' then return jsonb_build_object('ok', false, 'error', 'Give the view a name.'); end if;
    if lower(v) = 'all' or exists (select 1 from public.views vw where vw.event_id = ev and lower(vw.name) = lower(v) and vw.name <> coalesce(d ->> 'old', '')) then
      return jsonb_build_object('ok', false, 'error', 'A view with this name already exists.');
    end if;
    x := coalesce((select jsonb_object_agg(t.fk, t.fv) from jsonb_each(coalesce(f -> 'filters', '{}'::jsonb)) t(fk, fv)
      where t.fk in (select cc.k from public.kai_cols(ev) cc) and jsonb_typeof(t.fv) = 'array' and jsonb_array_length(t.fv) > 0), '{}'::jsonb);
    r := case when f -> 'sort' ->> 'k' in (select cc.k from public.kai_cols(ev) cc) or f -> 'sort' ->> 'k' = 'no'
      then jsonb_build_object('k', f -> 'sort' ->> 'k', 'dir', case when (f -> 'sort' ->> 'dir')::int < 0 then -1 else 1 end) else null end;
    update public.views vw set name = v,
        cols = array(select c2 from jsonb_array_elements_text(coalesce(f -> 'cols', '[]'::jsonb)) c2 where c2 in (select cc.k from public.kai_cols(ev) cc)),
        status = case when f ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then f ->> 'status' else '' end,
        age = case when f ->> 'age' in ('Adult', 'Child', 'Baby') then f ->> 'age' else '' end, sort = r, filters = x
      where vw.event_id = ev and vw.name = coalesce(d ->> 'old', '') and coalesce(d ->> 'old', '') <> '';
    if not found then
      insert into public.views (event_id, name, cols, status, age, sort, filters) values (ev, v,
        array(select c2 from jsonb_array_elements_text(coalesce(f -> 'cols', '[]'::jsonb)) c2 where c2 in (select cc.k from public.kai_cols(ev) cc)),
        case when f ->> 'status' in ('Maybe', 'Confirmed', 'Declined') then f ->> 'status' else '' end,
        case when f ->> 'age' in ('Adult', 'Child', 'Baby') then f ->> 'age' else '' end, r, x);
    end if;
    return jsonb_build_object('ok', true, 'views', public.kai_views(ev));
  end if;

  if p_action = 'deleteView' then
    perform public.kai_drop_view(ev, coalesce(d ->> 'name', ''));
    return jsonb_build_object('ok', true, 'views', public.kai_views(ev));
  end if;

  if p_action = 'addColumn' then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    v := left(public.kai_clean(d ->> 'label'), 40); vk := case when d ->> 'type' in ('text', 'list', 'date', 'yesno') then d ->> 'type' else 'text' end;
    if v = '' then return jsonb_build_object('ok', false, 'error', 'Give the column a name.'); end if;
    if exists (select 1 from public.kai_cols(ev) cc where lower(cc.label) = lower(v)) or lower(v) in ('guest no.', 'last updated', 'deleted') then
      return jsonb_build_object('ok', false, 'error', 'A column with this name already exists.');
    end if;
    opts := array(select public.kai_clean(o) from unnest(string_to_array(coalesce(d ->> 'options', ''), ',')) o where public.kai_clean(o) <> '');
    if vk <> 'list' then opts := '{}'; end if;
    if vk = 'list' and coalesce(array_length(opts, 1), 0) < 2 then return jsonb_build_object('ok', false, 'error', 'Write at least two options, separated by commas.'); end if;
    select coalesce(max(substr(cc.k, 2)::int), 0) + 1 into n from public.custom_columns cc where cc.event_id = ev and cc.k ~ '^c[0-9]+$';
    insert into public.custom_columns (event_id, k, label, type, options) values (ev, 'c' || n, v, vk, opts);
    return jsonb_build_object('ok', true, 'custom', public.kai_custom(ev));
  end if;

  if p_action = 'removeColumn' then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    perform public.kai_drop_column(ev, coalesce(d ->> 'key', ''));
    return jsonb_build_object('ok', true, 'custom', public.kai_custom(ev));
  end if;

  if p_action = 'remind' then
    v := regexp_replace(coalesce(d ->> 'phone', ''), '[^0-9+]', '', 'g');
    if v = '' then return jsonb_build_object('ok', false, 'error', 'This guest has no phone number.'); end if;
    insert into public.reminders (event_id, phone, names, by_name) values (ev, v, left(public.kai_clean(d ->> 'names'), 200), who);
    return jsonb_build_object('ok', true, 'reminders', public.kai_reminders(ev));
  end if;

  if p_action = 'reminderText' then
    v := left(btrim(replace(coalesce(d ->> 'text', ''), E'\r', '')), 1000);
    update public.events set settings = settings || jsonb_build_object('Reminder Message', v) where id = ev;
    return jsonb_build_object('ok', true, 'text', v);
  end if;

  if p_action = 'seen' then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    update public.changes ch set seen_at = now() where ch.event_id = ev and ch.seen_at is null
      and (coalesce((d ->> 'all')::boolean, false) or ch.id in (select (jsonb_array_elements_text(coalesce(d -> 'ids', '[]'::jsonb)))::bigint));
    return jsonb_build_object('ok', true, 'changes', public.kai_changes(ev));
  end if;

  return null;
end $$;

create or replace function public.kai_api(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb);
  is_admin boolean := public.kai_is_admin();
  em text := public.kai_email();
  e public.events; ev uuid; who text; vsid text := left(coalesce(d ->> 'sid', ''), 16); res jsonb;
begin
  if em = '' then return jsonb_build_object('ok', false, 'error', 'Please sign in.', 'auth', true); end if;

  if p_action = 'whoami' then
    return jsonb_build_object('ok', true, 'email', em, 'admin', is_admin,
      'events', (select coalesce(jsonb_agg(e2.slug), '[]'::jsonb) from public.events e2 join public.event_members m on m.event_id = e2.id where m.email = em and e2.status <> 'Deleted'));
  end if;

  if p_action in ('events', 'createEvent', 'endEvent', 'deleteEvent') then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    if p_action = 'events' then return public.kai_events(); end if;
    if p_action = 'createEvent' then return public.kai_create_event(coalesce(d -> 'event', '{}'::jsonb)); end if;
    select * into e from public.events where slug = lower(coalesce(d ->> 'slug', '')) and status <> 'Deleted';
    if e.id is null then return jsonb_build_object('ok', false, 'error', 'Event not found.'); end if;
    if p_action = 'endEvent' then
      update public.events set status = case when coalesce((d ->> 'ended')::boolean, true) then 'Ended' else '' end where id = e.id;
      return jsonb_build_object('ok', true);
    end if;
    if coalesce(d ->> 'confirm', '') <> e.slug then return jsonb_build_object('ok', false, 'error', 'Type the event link to confirm.'); end if;
    update public.events set status = 'Deleted' where id = e.id;   -- hidden from the screens, still in the database
    return jsonb_build_object('ok', true);
  end if;

  select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'This event was not found. Check the link.'); end if;
  ev := e.id;
  if not is_admin and not exists (select 1 from public.event_members where event_id = ev and email = em) then
    return jsonb_build_object('ok', false, 'error', 'This email doesn’t have access to this event. Ask Noam to add it.', 'auth', true);
  end if;
  who := case when is_admin then 'Noam' else coalesce(nullif(e.settings ->> 'Couple Names', ''), e.couple) end;

  if p_action = 'ping' then
    insert into public.presence values (ev, vsid, left(public.kai_clean(d ->> 'name'), 40), now())
      on conflict (event_id, sid) do update set name = excluded.name, seen_at = now();
    if e.ver = 0 then update public.events set ver = public.kai_ms(now()) where id = ev returning * into e; end if;
    return jsonb_build_object('ok', true, 'ver', e.ver, 'by', e.ver_by, 'name', e.ver_name,
      'online', (select coalesce(jsonb_agg(distinct p.name), '[]'::jsonb) from public.presence p
        where p.event_id = ev and p.sid <> vsid and p.seen_at > now() - interval '20 seconds' and p.name <> ''));
  end if;

  if p_action = 'list' then
    return jsonb_build_object('ok', true, 'who', who, 'admin', is_admin,
      'wedding', jsonb_build_object('couple', coalesce(e.settings ->> 'Couple Names', e.couple), 'date', coalesce(e.settings ->> 'Wedding Date', e.date),
        'place', coalesce(e.settings ->> 'Location', ''), 'sunset', coalesce(e.settings ->> 'Sunset Time', '')),
      'guests', public.kai_guests(ev), 'views', public.kai_views(ev), 'custom', public.kai_custom(ev),
      'reminders', public.kai_reminders(ev), 'reminderText', coalesce(e.settings ->> 'Reminder Message', ''),
      'changes', case when is_admin then public.kai_changes(ev) else '[]'::jsonb end,
      'lang', case when e.settings ->> 'Default Language' = 'en' then 'en' else 'he' end, 'schedule', null, 'brief', null);
  end if;

  if p_action = 'history' then
    return jsonb_build_object('ok', true, 'items', (select coalesce(jsonb_agg(jsonb_build_object('when', to_char(l.at at time zone 'Asia/Jerusalem', 'FMDD Mon, HH24:MI'),
      'by', l.by_name, 'action', l.action, 'details', l.details) order by l.id desc), '[]'::jsonb)
      from (select * from public.guest_log where event_id = ev and "no" = (d ->> 'no')::int order by id desc limit 20) l));
  end if;

  if p_action = 'rsvpInfo' then return public.kai_rsvp_info(e); end if;

  -- writes: mark the event as changed, so other open screens refresh
  update public.events set ver = public.kai_ms(clock_timestamp()), ver_by = vsid, ver_name = who where id = ev;

  if p_action = 'saveSettings' then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    select * into e from public.events where id = ev;
    return public.kai_save_settings(e, coalesce(d -> 'settings', '{}'::jsonb));
  end if;

  res := public.kai_act_guests(p_action, d, ev, who, is_admin);
  if res is not null then return res; end if;
  res := public.kai_act_misc(p_action, d, ev, who, is_admin);
  if res is not null then return res; end if;
  return jsonb_build_object('ok', false, 'error', 'This isn’t available in the new system yet.');
end $$;

-- Only signed-in people may call the API; everything else is internal.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.kai_api(text, jsonb) to authenticated;

-- Fixed search path on every function, and a tiny public read used by the keep-alive job (.github/workflows/supabase-keepalive.yml).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'kai\_%' loop
    execute format('alter function %s set search_path = public', r.f);
  end loop; end $$;
create or replace function public.kai_alive() returns int language sql stable set search_path = public as $$
  select count(*)::int from public.events
$$;
grant execute on function public.kai_alive() to anon;
