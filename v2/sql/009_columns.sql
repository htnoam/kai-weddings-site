-- KAI Events v2: guest screen › Columns (order and hidden columns) kept per event, the same on every computer.
-- Saved in settings › "Guest Columns" as {"order":[...],"hidden":[...]}; "list" hands it back as "cols".
create or replace function public.kai_api(p_action text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb := coalesce(p_data, '{}'::jsonb); e public.events; k text; res jsonb; c jsonb;
begin
  if p_action = 'list' then
    res := public.kai_api_core(p_action, p_data);
    if coalesce((res ->> 'ok')::boolean, false) then
      select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
      begin c := (e.settings ->> 'Guest Columns')::jsonb; exception when others then c := null; end;
      res := res || jsonb_build_object('cols', case when jsonb_typeof(c -> 'order') = 'array' then c else null end);
    end if;
    return res;
  end if;

  if p_action = 'saveCols' then
    if public.kai_email() = '' then return jsonb_build_object('ok', false, 'error', 'Please sign in.', 'auth', true); end if;
    select * into e from public.events where slug = lower(coalesce(d ->> 'e', '')) and status <> 'Deleted';
    if e.id is null then return jsonb_build_object('ok', false, 'error', 'This event was not found. Check the link.'); end if;
    if not public.kai_is_admin() and not exists (select 1 from public.event_members where event_id = e.id and email = public.kai_email()) then
      return jsonb_build_object('ok', false, 'error', 'This email doesn’t have access to this event. Ask Noam to add it.', 'auth', true);
    end if;
    if jsonb_typeof(d -> 'cols' -> 'order') <> 'array' then return jsonb_build_object('ok', false, 'error', 'Couldn’t save the column order.'); end if;
    c := jsonb_build_object(
      'order', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select left(regexp_replace(value, '[^A-Za-z0-9_]', '', 'g'), 40) x from jsonb_array_elements_text(d -> 'cols' -> 'order') with ordinality t(value, n) where n <= 200 order by n) q where x <> ''),
      'hidden', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select left(regexp_replace(value, '[^A-Za-z0-9_]', '', 'g'), 40) x from jsonb_array_elements_text(case when jsonb_typeof(d -> 'cols' -> 'hidden') = 'array' then d -> 'cols' -> 'hidden' else '[]'::jsonb end) with ordinality t(value, n) where n <= 200 order by n) q where x <> ''));
    update public.events set settings = settings || jsonb_build_object('Guest Columns', c::text) where id = e.id;
    return jsonb_build_object('ok', true);
  end if;

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
