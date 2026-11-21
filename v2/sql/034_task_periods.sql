-- Additive Demo pilot upgrade. Closed tables are accessed only through kai_tasks.
alter table public.event_tasks
 add column period text not null default 'months1to3' check (period in ('early','months3to6','months1to3','weeks2to4','lastweek')),
 add column starred boolean not null default false,
 add column sort_order integer not null default 1000,
 add column template_key text;
create unique index event_tasks_template_idx on public.event_tasks(event_id,template_key);
create table public.task_templates (
 key text primary key, title text not null, owner text not null, period text not null, sort_order integer not null
);
create table public.event_task_lists (
 event_id uuid primary key references public.events(id) on delete cascade,
 seeded_at timestamptz not null default now()
);
alter table public.task_templates enable row level security;
alter table public.event_task_lists enable row level security;
revoke all on public.task_templates, public.event_task_lists from public,anon,authenticated;
insert into public.task_templates(key,title,owner,period,sort_order) values
('kai-v1-01','לבדוק תוקף דרכונים ודרישות כניסה ליעד','couple','early',1),
('kai-v1-02','להגדיר תקציב וסדרי עדיפויות','couple','early',2),
('kai-v1-03','להכין רשימת מוזמנים ראשונית','couple','early',3),
('kai-v1-04','לאשר מקום ותאריך','planner','early',4),
('kai-v1-05','להחליט אילו אירועים יתקיימו בסוף השבוע','couple','early',5),
('kai-v1-06','לאשר ולשלוח Save the Date','couple','early',6),
('kai-v1-07','לבחור ולהזמין בגדי חתונה','couple','early',7),
('kai-v1-08','להשלים שמות ופרטי קשר','couple','months3to6',8),
('kai-v1-09','להזמין טיסות לזוג','couple','months3to6',9),
('kai-v1-10','לאשר את החדר ותאריכי השהייה של הזוג','planner','months3to6',10),
('kai-v1-11','לאשר צלם סטילס','couple','months3to6',11),
('kai-v1-12','לאשר צילום וידאו','couple','months3to6',12),
('kai-v1-13','לאשר דיג׳יי ומוזיקה','couple','months3to6',13),
('kai-v1-14','לאשר איפור','couple','months3to6',14),
('kai-v1-15','לאשר עיצוב שיער','couple','months3to6',15),
('kai-v1-16','לאשר מעצב/ת אירוע','couple','months3to6',16),
('kai-v1-17','לבחור רב או עורך/ת טקס','couple','months3to6',17),
('kai-v1-18','לאשר ולשלוח הזמנה וקישור לאורחים','couple','months1to3',18),
('kai-v1-19','להשלים נעליים ואביזרים','couple','months1to3',19),
('kai-v1-20','לרכוש טבעות','couple','months1to3',20),
('kai-v1-21','לקבוע ניסיון איפור ושיער','couple','months1to3',21),
('kai-v1-22','להעביר השראות ולאשר עיצוב','couple','months1to3',22),
('kai-v1-23','לאשר תפריט ובר','couple','months1to3',23),
('kai-v1-24','לאשר את מבנה הטקס והמשתתפים','couple','months1to3',24),
('kai-v1-25','להעביר לדיג׳יי העדפות ושירים שלא רוצים','couple','months1to3',25),
('kai-v1-26','לעבור על יתרות ומועדי תשלום','planner','months1to3',26),
('kai-v1-27','להשלים אישורי הגעה','couple','weeks2to4',27),
('kai-v1-28','להשלים שיבוצי חדרים לאורחים','couple','weeks2to4',28),
('kai-v1-29','להשלים פרטי טיסות ושיוך להסעות','planner','weeks2to4',29),
('kai-v1-30','להשלים מדידות ותיקונים','couple','weeks2to4',30),
('kai-v1-31','לבחור שירי כניסה ושירים מיוחדים','couple','weeks2to4',31),
('kai-v1-32','להשלים אלרגיות וצרכים תזונתיים','couple','weeks2to4',32),
('kai-v1-33','לאשר סידורי הושבה','couple','weeks2to4',33),
('kai-v1-34','לאשר שילוט וחומרי דפוס','couple','weeks2to4',34),
('kai-v1-35','לאשר לו״ז סופי','planner','lastweek',35),
('kai-v1-36','להעביר רשימת צילומי משפחות','couple','lastweek',36),
('kai-v1-37','לאשר סדר התארגנות','planner','lastweek',37),
('kai-v1-38','לשלוח הודעת מידע אחרונה לאורחים','planner','lastweek',38),
('kai-v1-39','להכין רשימת אריזה ופריטים לטקס','couple','lastweek',39);
create or replace function public.kai_tasks(p_slug text, p_action text default 'list', p_task jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev uuid;
  task public.event_tasks;
  existing public.event_tasks;
  actor text := public.kai_email();
  task_due date;
  expected integer;
  initialized integer;
  task_period text;
  task_starred boolean;
begin
  if auth.uid() is null or actor = '' then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  select e.id into ev from public.events e
    where e.slug = p_slug and e.status <> 'Deleted' and e.settings ->> 'Tasks' = 'on'
    and (public.kai_is_admin() or exists (
      select 1 from public.event_members m where m.event_id = e.id and m.email = actor
    ));
  if ev is null then raise exception 'Tasks are unavailable for this event.' using errcode = '42501'; end if;
  if p_action = 'list' then
    -- This marker makes defaults a one-time initialization, even after tasks are deleted.
    insert into public.event_task_lists(event_id) values(ev) on conflict do nothing;
    get diagnostics initialized = row_count;
    if initialized = 1 then
      insert into public.event_tasks(id,event_id,title,owner,period,sort_order,template_key,updated_by)
        select gen_random_uuid(),ev,t.title,t.owner,t.period,t.sort_order,t.key,actor
        from public.task_templates t
        where not exists (select 1 from public.event_tasks x where x.event_id=ev and x.title=t.title)
        on conflict(event_id,template_key) do nothing;
    end if;
    return jsonb_build_object('wedding_date',(select e.date from public.events e where e.id=ev),'my_owner',case when public.kai_is_admin() then 'planner' else 'couple' end,'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'event_id' - 'updated_by' order by t.sort_order, t.id)
      from public.event_tasks t where t.event_id = ev and not t.deleted), '[]'::jsonb));
  end if;
  if p_action not in ('save', 'delete') then raise exception 'Unknown task action.'; end if;
  expected := (p_task ->> 'version')::integer;
  if expected is null or expected < 0 then raise exception 'Missing task version.'; end if;
  -- Serialize mutations within this event, including competing creates with the same UUID.
  perform pg_advisory_xact_lock(hashtext('tasks:' || ev::text));
  select * into existing from public.event_tasks where id = (p_task ->> 'id')::uuid for update;
  if existing.id is not null and (existing.event_id <> ev or existing.deleted or existing.version <> expected) then
    raise exception 'TASK_CONFLICT';
  end if;
  if existing.id is null and (expected <> 0 or p_action = 'delete') then raise exception 'TASK_CONFLICT'; end if;
  if p_action = 'delete' then
    update public.event_tasks set deleted = true, version = version + 1, updated_at = clock_timestamp(), updated_by = actor
      where id = existing.id returning * into task;
  else
    if jsonb_typeof(p_task -> 'title') is distinct from 'string' or length(trim(p_task ->> 'title')) not between 1 and 200
      or length(coalesce(p_task ->> 'description', '')) > 5000
      or coalesce(p_task ->> 'owner', '') not in ('', 'planner', 'couple')
      or coalesce(p_task ->> 'status', '') not in ('open', 'progress', 'done') then raise exception 'Invalid task fields.'; end if;
    task_period := coalesce(p_task->>'period',existing.period,'months1to3');
    if task_period not in ('early','months3to6','months1to3','weeks2to4','lastweek') then raise exception 'Invalid task period.'; end if;
    if p_task ? 'starred' and jsonb_typeof(p_task->'starred') <> 'boolean' then raise exception 'Invalid star.'; end if;
    task_starred := coalesce((p_task->>'starred')::boolean,existing.starred,false);
    task_due := nullif(p_task ->> 'due', '')::date;
    if existing.id is null then
      insert into public.event_tasks(id, event_id, title, description, owner, due, status, updated_by, period, starred)
        values ((p_task ->> 'id')::uuid, ev, trim(p_task ->> 'title'), coalesce(p_task ->> 'description', ''),
          coalesce(p_task ->> 'owner', ''), task_due, p_task ->> 'status', actor, task_period, task_starred) returning * into task;
    else
      update public.event_tasks set title = trim(p_task ->> 'title'), description = coalesce(p_task ->> 'description', ''),
        owner = coalesce(p_task ->> 'owner', ''), due = task_due, status = p_task ->> 'status', version = version + 1,
        period = task_period, starred = task_starred, updated_at = clock_timestamp(), updated_by = actor where id = existing.id returning * into task;
    end if;
  end if;
  return jsonb_build_object('task', to_jsonb(task) - 'event_id' - 'updated_by');
end $$;
revoke all on function public.kai_tasks(text, text, jsonb) from public, anon;
grant execute on function public.kai_tasks(text, text, jsonb) to authenticated;
