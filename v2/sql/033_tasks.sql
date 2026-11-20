-- Independent task storage. The pilot is enabled only for demo-wedding.
create table public.event_tasks (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text not null default '' check (length(description) <= 5000),
  owner text not null default '' check (owner in ('', 'planner', 'couple')),
  due date,
  status text not null default 'open' check (status in ('open', 'progress', 'done')),
  version integer not null default 1,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
create index event_tasks_event_idx on public.event_tasks(event_id);
alter table public.event_tasks enable row level security;
revoke all on public.event_tasks from public, anon, authenticated;

-- Like the portal's existing API, authorize every call before accessing closed tables.
create function public.kai_tasks(p_slug text, p_action text default 'list', p_task jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ev uuid;
  task public.event_tasks;
  existing public.event_tasks;
  actor text := public.kai_email();
  task_due date;
  expected integer;
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
    return jsonb_build_object('tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'event_id' - 'updated_by' order by t.due nulls last, t.updated_at, t.id)
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
    task_due := nullif(p_task ->> 'due', '')::date;
    if existing.id is null then
      insert into public.event_tasks(id, event_id, title, description, owner, due, status, updated_by)
        values ((p_task ->> 'id')::uuid, ev, trim(p_task ->> 'title'), coalesce(p_task ->> 'description', ''),
          coalesce(p_task ->> 'owner', ''), task_due, p_task ->> 'status', actor) returning * into task;
    else
      update public.event_tasks set title = trim(p_task ->> 'title'), description = coalesce(p_task ->> 'description', ''),
        owner = coalesce(p_task ->> 'owner', ''), due = task_due, status = p_task ->> 'status', version = version + 1,
        updated_at = clock_timestamp(), updated_by = actor where id = existing.id returning * into task;
    end if;
  end if;
  return jsonb_build_object('task', to_jsonb(task) - 'event_id' - 'updated_by');
end $$;
revoke all on function public.kai_tasks(text, text, jsonb) from public, anon;
grant execute on function public.kai_tasks(text, text, jsonb) to authenticated;
update public.events set settings = settings || '{"Tasks":"on"}'::jsonb where slug = 'demo-wedding';
