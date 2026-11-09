-- KAI Events v2: kai_api with the schedule, brief and templates (replaces the entry point in 003_actions.sql).
create or replace function public.kai_api(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d jsonb := coalesce(p_data, '{}'::jsonb);
  is_admin boolean := public.kai_is_admin();
  em text := public.kai_email();
  e public.events; ev uuid; who text; vsid text := left(coalesce(d ->> 'sid', ''), 16); res jsonb; t public.schedule_templates;
begin
  if em = '' then return jsonb_build_object('ok', false, 'error', 'Please sign in.', 'auth', true); end if;

  if p_action = 'whoami' then
    return jsonb_build_object('ok', true, 'email', em, 'admin', is_admin,
      'events', (select coalesce(jsonb_agg(e2.slug), '[]'::jsonb) from public.events e2 join public.event_members m on m.event_id = e2.id where m.email = em and e2.status <> 'Deleted'));
  end if;

  -- dashboard (Noam only)
  if p_action in ('events', 'createEvent', 'endEvent', 'deleteEvent', 'scheduleTemplates', 'deleteScheduleTemplate', 'mainScheduleTemplate') then
    if not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
    if p_action = 'events' then return public.kai_events(); end if;
    if p_action = 'scheduleTemplates' then return public.kai_templates_pub(); end if;
    if p_action = 'deleteScheduleTemplate' then
      t := public.kai_find_template(d ->> 'name'); if t.name is null then return jsonb_build_object('ok', false, 'error', 'Template not found.'); end if;
      perform public.kai_drop_template(t.name); return public.kai_templates_pub();
    end if;
    if p_action = 'mainScheduleTemplate' then
      t := public.kai_find_template(d ->> 'name'); if t.name is null then return jsonb_build_object('ok', false, 'error', 'Template not found.'); end if;
      insert into public.kai_config values ('main_template', to_jsonb(t.name)) on conflict (k) do update set v = excluded.v;
      return public.kai_templates_pub();
    end if;
    if p_action = 'createEvent' then
      res := public.kai_create_event(coalesce(d -> 'event', '{}'::jsonb));
      if not coalesce((res ->> 'ok')::boolean, false) then return res; end if;
      -- the schedule, built once from the template and this sunset
      select * into e from public.events where slug = res -> 'event' ->> 'slug';
      if public.kai_tpl_need(e) = '' then
        t := public.kai_find_template(d -> 'event' ->> 'stpl'); if t.name is null then t := public.kai_find_template(public.kai_main_template()); end if;
        if t.name is not null and coalesce((public.kai_save_schedule(e.id, public.kai_tpl_rows(t.rows, e.settings ->> 'Wedding Date', e.settings ->> 'Sunset Time')) ->> 'ok')::boolean, false) then
          res := res || jsonb_build_object('schedule', t.name);
        end if;
      end if;
      return res;
    end if;
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
      'lang', case when e.settings ->> 'Default Language' = 'en' then 'en' else 'he' end,
      'schedule', case when public.kai_plan_on(e) then public.kai_sched(e, is_admin) else null end,
      'brief', case when public.kai_plan_on(e) then public.kai_brief(ev) else null end);
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
  res := public.kai_act_plan(p_action, d, e, who, is_admin);
  if res is not null then return res; end if;
  res := public.kai_act_misc(p_action, d, ev, who, is_admin);
  if res is not null then return res; end if;
  return jsonb_build_object('ok', false, 'error', 'This isn’t available in the new system yet.');
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.kai_api(text, jsonb) to authenticated;
grant execute on function public.kai_public(jsonb) to anon, authenticated;
grant execute on function public.kai_alive() to anon;
grant execute on function public.kai_is_admin() to authenticated;
