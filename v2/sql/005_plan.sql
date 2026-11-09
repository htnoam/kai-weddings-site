-- KAI Events v2: schedule, ceremony brief and schedule templates (guest screen › Schedule / Questions).
-- Same behaviour as the old Hub (sched_, saveSchedule_, copySchedule_, tpl*, brief*). In v2 these are on for every event
-- unless Settings › Wedding Plan = Off.

alter table public.events add column if not exists schedule jsonb not null default '[]'::jsonb;   -- [{ id, day, time, until, what, where, who, notes[], couple, red, kind }]
alter table public.events add column if not exists brief jsonb;                                    -- { times, sections[] }; null = not started yet

create table if not exists public.schedule_templates (
  name text primary key,
  rows jsonb not null default '[]'::jsonb,        -- [{ d, t, u, o, ou, k, what, where, who, notes, couple, red }]
  created_at timestamptz not null default now()
);
create table if not exists public.kai_config (    -- 'main_template' (text), 'brief_template' (json)
  k text primary key,
  v jsonb
);
alter table public.schedule_templates enable row level security;
alter table public.kai_config enable row level security;

create or replace function public.kai_plan_on(e public.events) returns boolean language sql immutable as $$
  select coalesce(e.settings ->> 'Wedding Plan', '') <> 'Off'
$$;

-- ---------- schedule ----------
create or replace function public.kai_sched(e public.events, is_admin boolean) returns jsonb language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(case when is_admin then r else r || jsonb_build_object('notes',
      (select coalesce(jsonb_agg(n), '[]'::jsonb) from jsonb_array_elements(r -> 'notes') n where not coalesce((n ->> 'hidden')::boolean, false))) end), '[]'::jsonb)
  from jsonb_array_elements(e.schedule) r
  where (coalesce(r ->> 'what', '') <> '' or coalesce(r ->> 'time', '') <> '') and (is_admin or coalesce((r ->> 'couple')::boolean, true))
$$;

create or replace function public.kai_save_schedule(ev uuid, rows jsonb) returns jsonb language plpgsql set search_path = public as $$
declare x jsonb; out jsonb := '[]'::jsonb; err text; what text; tm text; un text; dy text; notes jsonb; e public.events;
begin
  for x in select value from jsonb_array_elements(case when jsonb_typeof(rows) = 'array' then rows else '[]'::jsonb end) limit 500 loop
    what := public.kai_clean(x ->> 'what'); tm := public.kai_clean(x ->> 'time'); un := public.kai_clean(x ->> 'until'); dy := public.kai_clean(x ->> 'day');
    if what = '' and tm = '' then continue; end if;
    if dy !~ '^\d{2}/\d{2}/\d{4}$' then err := coalesce(err, 'A row has no day. Refresh the page and try again.'); end if;
    if (tm <> '' and tm !~ '^([01]\d|2[0-3]):[0-5]\d$') or (un <> '' and un !~ '^([01]\d|2[0-3]):[0-5]\d$') then err := coalesce(err, 'Write times as HH:MM.'); end if;
    notes := (select coalesce(jsonb_agg(jsonb_build_object('text', public.kai_clean(n ->> 'text', 500), 'red', coalesce((n ->> 'red')::boolean, false),
        'hidden', coalesce((n ->> 'hidden')::boolean, false))), '[]'::jsonb)
      from (select value n from jsonb_array_elements(case when jsonb_typeof(x -> 'notes') = 'array' then x -> 'notes' else '[]'::jsonb end) limit 50) z
      where public.kai_clean(n ->> 'text', 500) <> '');
    out := out || jsonb_build_array(jsonb_build_object('id', coalesce(nullif(x ->> 'id', ''), substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
      'day', dy, 'time', tm, 'until', un, 'what', what, 'where', public.kai_clean(x ->> 'where'), 'who', public.kai_clean(x ->> 'who'), 'notes', notes,
      'couple', coalesce((x ->> 'couple')::boolean, true), 'red', coalesce((x ->> 'red')::boolean, false),
      'kind', case when x ->> 'kind' in ('fixed', 'sunset') then x ->> 'kind' else '' end));
  end loop;
  if err is not null then return jsonb_build_object('ok', false, 'error', err); end if;
  update public.events set schedule = out where id = ev returning * into e;
  return jsonb_build_object('ok', true, 'schedule', public.kai_sched(e, true));
end $$;

-- Copy from another event: its rows, with the days moved to this wedding (red marks and hidden lines kept).
create or replace function public.kai_copy_schedule(e public.events, src text) returns jsonb language plpgsql stable set search_path = public as $$
declare f public.events; shift int := 0; rows jsonb := '[]'::jsonb; r jsonb; m text[];
begin
  select * into f from public.events where slug = lower(coalesce(src, '')) and status <> 'Deleted';
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'Event not found.'); end if;
  if jsonb_array_length(public.kai_sched(f, true)) = 0 then return jsonb_build_object('ok', false, 'error', 'That event has no schedule yet.'); end if;
  if coalesce(e.settings ->> 'Wedding Date', e.date) ~ '^\d{4}-\d{2}-\d{2}$' and coalesce(f.settings ->> 'Wedding Date', f.date) ~ '^\d{4}-\d{2}-\d{2}$' then
    shift := coalesce(e.settings ->> 'Wedding Date', e.date)::date - coalesce(f.settings ->> 'Wedding Date', f.date)::date;
  end if;
  for r in select value from jsonb_array_elements(public.kai_sched(f, true)) loop
    m := regexp_match(r ->> 'day', '^(\d{2})/(\d{2})/(\d{4})$');
    if m is not null and shift <> 0 then r := r || jsonb_build_object('day', to_char(make_date(m[3]::int, m[2]::int, m[1]::int) + shift, 'DD/MM/YYYY')); end if;
    rows := rows || jsonb_build_array(r || '{"id":""}'::jsonb);
  end loop;
  return jsonb_build_object('ok', true, 'rows', rows, 'shifted', shift, 'from', coalesce(nullif(f.settings ->> 'Couple Names', ''), f.couple));
end $$;

-- ---------- templates (the wedding day is built once from the sunset; after that nothing moves) ----------
create or replace function public.kai_tpl_min(t text) returns int language sql immutable as $$
  select case when t ~ '^\d{2}:\d{2}$' then case when split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int < 300
    then split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int + 1440 else split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int end end
$$;
create or replace function public.kai_tpl_hm(x int) returns text language sql immutable as $$
  select lpad((((x % 1440) + 1440) % 1440 / 60)::text, 2, '0') || ':' || lpad((((x % 1440) + 1440) % 1440 % 60)::text, 2, '0')
$$;
create or replace function public.kai_main_template() returns text language sql stable set search_path = public as $$
  select coalesce((select t.name from public.schedule_templates t where lower(t.name) = lower((select v #>> '{}' from public.kai_config where k = 'main_template'))),
    (select name from public.schedule_templates order by created_at limit 1))
$$;
create or replace function public.kai_templates_pub() returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object('ok', true, 'templates', coalesce(jsonb_agg(jsonb_build_object('name', name, 'main', name = public.kai_main_template()) order by created_at), '[]'::jsonb))
  from public.schedule_templates
$$;
create or replace function public.kai_find_template(n text) returns public.schedule_templates language sql stable set search_path = public as $$
  select * from public.schedule_templates where lower(name) = lower(coalesce(n, '')) limit 1
$$;

-- Template rows -> schedule rows for a wedding date (YYYY-MM-DD) and sunset (HH:MM).
create or replace function public.kai_tpl_rows(trows jsonb, dt text, sunset text) returns jsonb language plpgsql immutable as $$
declare r jsonb; out jsonb := '[]'::jsonb; s int := public.kai_tpl_min(sunset); tm text; un text;
begin
  for r in select value from jsonb_array_elements(trows) loop
    tm := coalesce(r ->> 't', ''); un := coalesce(r ->> 'u', '');
    if r ->> 'k' = 'sunset' then tm := sunset; un := '';
    elsif r ? 'o' and r ->> 'o' is not null then
      tm := public.kai_tpl_hm((round((s + (r ->> 'o')::int) / 5.0) * 5)::int);
      un := case when r ->> 'ou' is not null then public.kai_tpl_hm((round((s + (r ->> 'ou')::int) / 5.0) * 5)::int) else '' end;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', '', 'day', to_char(dt::date + coalesce((r ->> 'd')::int, 0), 'DD/MM/YYYY'), 'time', tm, 'until', un,
      'what', coalesce(r ->> 'what', ''), 'where', coalesce(r ->> 'where', ''), 'who', coalesce(r ->> 'who', ''), 'notes', coalesce(r -> 'notes', '[]'::jsonb),
      'couple', coalesce((r ->> 'couple')::boolean, true), 'red', coalesce((r ->> 'red')::boolean, false), 'kind', coalesce(r ->> 'k', '')));
  end loop;
  return out;
end $$;

create or replace function public.kai_tpl_need(e public.events) returns text language sql immutable as $$
  select case when coalesce(e.settings ->> 'Wedding Date', '') !~ '^\d{4}-\d{2}-\d{2}$' then 'Add the wedding date to this event first.'
    when coalesce(e.settings ->> 'Sunset Time', '') !~ '^\d{2}:\d{2}$' then 'Add the sunset time to this event first.' else '' end
$$;

create or replace function public.kai_save_template(e public.events, n text) returns jsonb language plpgsql set search_path = public as $$
declare nm text := left(public.kai_clean(n), 60); need text := public.kai_tpl_need(e); s int; w date; r jsonb; out jsonb := '[]'::jsonb; o jsonb; m text[]; dd int; t public.schedule_templates;
begin
  if nm = '' then return jsonb_build_object('ok', false, 'error', 'Give the template a name.'); end if;
  if need <> '' then return jsonb_build_object('ok', false, 'error', need); end if;
  if jsonb_array_length(public.kai_sched(e, true)) = 0 then return jsonb_build_object('ok', false, 'error', 'The schedule is empty.'); end if;
  s := public.kai_tpl_min(e.settings ->> 'Sunset Time'); w := (e.settings ->> 'Wedding Date')::date;
  for r in select value from jsonb_array_elements(public.kai_sched(e, true)) loop
    m := regexp_match(r ->> 'day', '^(\d{2})/(\d{2})/(\d{4})$');
    dd := case when m is null then 0 else make_date(m[3]::int, m[2]::int, m[1]::int) - w end;
    o := jsonb_build_object('d', dd, 'k', case when r ->> 'kind' in ('fixed', 'sunset') then r ->> 'kind' else '' end, 'what', r ->> 'what', 'where', r ->> 'where', 'who', r ->> 'who',
      'notes', r -> 'notes', 'couple', coalesce((r ->> 'couple')::boolean, true), 'red', coalesce((r ->> 'red')::boolean, false));
    if dd = 0 and o ->> 'k' = '' and public.kai_tpl_min(r ->> 'time') is not null then
      o := o || jsonb_build_object('o', public.kai_tpl_min(r ->> 'time') - s);
      if public.kai_tpl_min(r ->> 'until') is not null then o := o || jsonb_build_object('ou', public.kai_tpl_min(r ->> 'until') - s); end if;
    else o := o || jsonb_build_object('t', coalesce(r ->> 'time', ''), 'u', coalesce(r ->> 'until', ''));
    end if;
    out := out || jsonb_build_array(o);
  end loop;
  t := public.kai_find_template(nm);
  if t.name is not null then update public.schedule_templates set rows = out where name = t.name;
  else
    insert into public.schedule_templates (name, rows) values (nm, out);   -- the first template becomes the main one by itself
  end if;
  return public.kai_templates_pub() || jsonb_build_object('updated', t.name is not null, 'name', coalesce(t.name, nm));
end $$;

-- ---------- ceremony brief ----------
create or replace function public.kai_brief_clean(b jsonb, keep boolean) returns jsonb language sql volatile set search_path = public as $$
  select jsonb_build_object(
    'times', jsonb_build_object(
      'sunset', case when public.kai_clean(b -> 'times' ->> 'sunset') ~ '^([01]\d|2[0-3]):[0-5]\d$' then public.kai_clean(b -> 'times' ->> 'sunset') else '' end,
      'call', case when public.kai_clean(b -> 'times' ->> 'call') ~ '^([01]\d|2[0-3]):[0-5]\d$' then public.kai_clean(b -> 'times' ->> 'call') else '' end,
      'start', case when public.kai_clean(b -> 'times' ->> 'start') ~ '^([01]\d|2[0-3]):[0-5]\d$' then public.kai_clean(b -> 'times' ->> 'start') else '' end),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('title', coalesce(nullif(public.kai_clean(s.v ->> 'title'), ''), 'נושא'),
        'qs', coalesce((select jsonb_agg(jsonb_build_object('id', coalesce(nullif(q.v ->> 'id', ''), substr(md5(random()::text || q.i::text || s.i::text), 1, 8)),
            'label', public.kai_clean(q.v ->> 'label'), 'type', case when q.v ->> 'type' in ('text', 'long', 'yesno', 'song') then q.v ->> 'type' else 'text' end,
            'extra', public.kai_clean(q.v ->> 'extra'), 'a', case when keep then left(coalesce(q.v ->> 'a', ''), 3000) else '' end,
            'a2', case when keep then left(coalesce(q.v ->> 'a2', ''), 1000) else '' end) order by q.i)
          from (select value v, ordinality i from jsonb_array_elements(case when jsonb_typeof(s.v -> 'qs') = 'array' then s.v -> 'qs' else '[]'::jsonb end) with ordinality limit 60) q
          where public.kai_clean(q.v ->> 'label') <> ''), '[]'::jsonb)) order by s.i)
      from (select value v, ordinality i from jsonb_array_elements(case when jsonb_typeof(b -> 'sections') = 'array' then b -> 'sections' else '[]'::jsonb end) with ordinality limit 30) s), '[]'::jsonb))
$$;

create or replace function public.kai_brief_default() returns jsonb language sql immutable as $$
  select '{"times":{},"sections":[{"title":"אנשים","qs":[{"label":"שמות הורי החתן","type":"text","extra":""},{"label":"שמות הורי הכלה","type":"text","extra":""},{"label":"מי מעביר את הטקס? (שם וטלפון)","type":"text","extra":""},{"label":"ילדי/ות פרחים (שמות וגילאים)","type":"long","extra":""},{"label":"מי נושא/ת את הטבעות?","type":"text","extra":""},{"label":"מי שומר/ת על הטבעות עד הטקס?","type":"text","extra":""},{"label":"סדר הכניסה לחופה (מי נכנס, באיזה סדר ועם מי)","type":"long","extra":""},{"label":"מי עומד תחת החופה?","type":"long","extra":""}]},{"title":"פרטי הטקס","qs":[{"label":"הינומה?","type":"yesno","extra":""},{"label":"שבירת כוס?","type":"yesno","extra":"מי מביא את הכוס?"},{"label":"סוג יין","type":"text","extra":""},{"label":"נדרים?","type":"yesno","extra":"מי מתחיל?"},{"label":"נאומים או קטעי קריאה בטקס? (מי ובאיזה סדר)","type":"long","extra":""},{"label":"רוצים לציין מישהו יקר שלא יהיה איתנו?","type":"long","extra":""}]},{"title":"מוזיקה","qs":[{"label":"שיר כניסה לחופה","type":"song","extra":""},{"label":"שיר נפרד לכניסת הכלה?","type":"yesno","extra":"איזה שיר?"},{"label":"שיר שבירת הכוס / יציאה מהחופה","type":"song","extra":""}]},{"title":"בקשות מיוחדות","qs":[{"label":"בקשות מיוחדות","type":"long","extra":""}]}]}'::jsonb
$$;

-- The event's brief; the first time, it starts from the base questionnaire and is saved right away (so ids stay the same).
create or replace function public.kai_brief(ev uuid) returns jsonb language plpgsql set search_path = public as $$
declare e public.events; b jsonb;
begin
  select * into e from public.events where id = ev;
  if e.brief is not null then return e.brief; end if;
  b := public.kai_brief_clean(coalesce((select v from public.kai_config where k = 'brief_template'), public.kai_brief_default()), false);
  if coalesce(b -> 'times' ->> 'sunset', '') = '' then b := jsonb_set(b, '{times,sunset}', to_jsonb(coalesce(e.settings ->> 'Sunset Time', ''))); end if;
  update public.events set brief = b where id = ev;
  return b;
end $$;

create or replace function public.kai_save_brief(ev uuid, nb jsonb) returns jsonb language plpgsql set search_path = public as $$
declare cur jsonb := public.kai_brief(ev); ans jsonb; b jsonb := public.kai_brief_clean(nb, false);
begin
  select coalesce(jsonb_object_agg(q ->> 'id', jsonb_build_object('a', coalesce(q ->> 'a', ''), 'a2', coalesce(q ->> 'a2', ''))), '{}'::jsonb) into ans
    from jsonb_array_elements(cur -> 'sections') s, jsonb_array_elements(s -> 'qs') q;
  b := jsonb_set(b, '{sections}', coalesce((select jsonb_agg(jsonb_set(s, '{qs}', coalesce((select jsonb_agg(q || coalesce(ans -> (q ->> 'id'), '{}'::jsonb)) from jsonb_array_elements(s -> 'qs') q), '[]'::jsonb)))
    from jsonb_array_elements(b -> 'sections') s), '[]'::jsonb));
  update public.events set brief = b where id = ev;
  return jsonb_build_object('ok', true, 'brief', b);
end $$;

create or replace function public.kai_brief_answer(ev uuid, qid text, a text, a2 text) returns jsonb language plpgsql set search_path = public as $$
declare b jsonb := public.kai_brief(ev); found boolean := false;
begin
  found := exists (select 1 from jsonb_array_elements(b -> 'sections') s, jsonb_array_elements(s -> 'qs') q where q ->> 'id' = qid);
  if not found then return jsonb_build_object('ok', false, 'error', 'This question was changed. Refresh the page.'); end if;
  b := jsonb_set(b, '{sections}', (select jsonb_agg(jsonb_set(s, '{qs}', (select coalesce(jsonb_agg(case when q ->> 'id' = qid
      then q || jsonb_build_object('a', left(coalesce(a, ''), 3000), 'a2', left(coalesce(a2, ''), 1000)) else q end), '[]'::jsonb) from jsonb_array_elements(s -> 'qs') q)))
    from jsonb_array_elements(b -> 'sections') s));
  update public.events set brief = b where id = ev;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.kai_drop_template(n text) returns void language sql set search_path = public as $$
  delete from public.schedule_templates where lower(name) = lower(n);
$$;

-- Schedule / brief actions on one event (old Hub routes). Returns null when the action isn't one of these.
create or replace function public.kai_act_plan(p_action text, d jsonb, e public.events, who text, is_admin boolean) returns jsonb
language plpgsql set search_path = public as $$
declare t public.schedule_templates; need text; r jsonb; b jsonb;
begin
  if p_action not in ('saveSchedule', 'scheduleSources', 'copySchedule', 'scheduleFromTemplate', 'saveScheduleTemplate', 'saveBrief', 'briefAnswer', 'saveBriefTemplate') then return null; end if;
  if p_action <> 'briefAnswer' and not is_admin then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;
  if p_action not in ('scheduleSources', 'copySchedule') and not public.kai_plan_on(e) then return jsonb_build_object('ok', false, 'error', 'This link is not valid.'); end if;

  if p_action = 'saveSchedule' then return public.kai_save_schedule(e.id, d -> 'rows'); end if;
  if p_action = 'scheduleSources' then
    return jsonb_build_object('ok', true, 'events', (select coalesce(jsonb_agg(jsonb_build_object('slug', x.slug, 'couple', coalesce(nullif(x.settings ->> 'Couple Names', ''), x.couple),
      'date', coalesce(nullif(x.settings ->> 'Wedding Date', ''), x.date))), '[]'::jsonb) from public.events x where x.id <> e.id and x.status = ''));
  end if;
  if p_action = 'copySchedule' then return public.kai_copy_schedule(e, d ->> 'from'); end if;
  if p_action = 'scheduleFromTemplate' then
    need := public.kai_tpl_need(e); if need <> '' then return jsonb_build_object('ok', false, 'error', need); end if;
    if jsonb_array_length(public.kai_sched(e, true)) > 0 then return jsonb_build_object('ok', false, 'error', 'This schedule isn’t empty anymore. Refresh the page.'); end if;
    t := public.kai_find_template(d ->> 'name'); if t.name is null then t := public.kai_find_template(public.kai_main_template()); end if;
    if t.name is null then return jsonb_build_object('ok', false, 'error', 'There are no templates yet.'); end if;
    r := public.kai_save_schedule(e.id, public.kai_tpl_rows(t.rows, e.settings ->> 'Wedding Date', e.settings ->> 'Sunset Time'));
    return r || jsonb_build_object('template', t.name);
  end if;
  if p_action = 'saveScheduleTemplate' then return public.kai_save_template(e, d ->> 'name'); end if;
  if p_action = 'saveBrief' then return public.kai_save_brief(e.id, coalesce(d -> 'brief', '{}'::jsonb)); end if;
  if p_action = 'briefAnswer' then return public.kai_brief_answer(e.id, coalesce(d ->> 'id', ''), d ->> 'a', d ->> 'a2'); end if;
  if p_action = 'saveBriefTemplate' then
    b := jsonb_set(public.kai_brief_clean(public.kai_brief(e.id), false), '{times}', '{}'::jsonb);
    insert into public.kai_config values ('brief_template', b) on conflict (k) do update set v = excluded.v;
    return jsonb_build_object('ok', true);
  end if;
  return null;
end $$;
