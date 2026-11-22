-- 036: the language setting also works for events that have settings › Portal Language (not only Demo).
create or replace function public.kai_portal_language(p_slug text, p_values jsonb default null, p_revision text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; cfg jsonb; oldcfg jsonb; modules jsonb := '{}'::jsonb; k text; v text; em text := public.kai_email(); adm boolean := public.kai_is_admin();
begin
  if em = '' then raise exception 'AUTH_REQUIRED'; end if;
  select * into e from public.events where slug = p_slug and status <> 'Deleted' for update;
  if e.id is null then raise exception 'EVENT_NOT_FOUND'; end if;
  if not adm and not exists(select 1 from public.event_members where event_id=e.id and email=em) then raise exception 'ACCESS_DENIED'; end if;
  -- Demo, plus any event Noam gave a language setting (e.g. Mai & Omri: budget in Hebrew, 22/11/2026)
  if e.slug <> 'demo-wedding' and not (e.settings ? 'Portal Language') then return jsonb_build_object('enabled',false); end if;
  oldcfg := e.settings -> 'Portal Language';
  cfg := coalesce(oldcfg, jsonb_build_object('default','en','modules',jsonb_build_object('tasks','he','brief',case when e.brief ->> 'lang' = 'en' then 'en' else 'he' end),'revision','0'));
  if p_values is not null then
    if not adm then raise exception 'ADMIN_REQUIRED'; end if;
    if p_revision is distinct from cfg ->> 'revision' then raise exception 'LANGUAGE_CONFLICT'; end if;
    if jsonb_typeof(p_values) is distinct from 'object' or coalesce(p_values ->> 'default','') not in ('he','en') or jsonb_typeof(p_values -> 'modules') is distinct from 'object' then raise exception 'INVALID_LANGUAGE'; end if;
    for k,v in select key,value from jsonb_each_text(p_values -> 'modules') loop
      if k not in ('guests','sched','brief','budget','tasks') or coalesce(v,'') not in ('he','en','inherit') then raise exception 'INVALID_MODULE_LANGUAGE'; end if;
      if v <> 'inherit' then modules := modules || jsonb_build_object(k,v); end if;
    end loop;
    cfg := jsonb_build_object('default',p_values ->> 'default','modules',modules,'revision',gen_random_uuid()::text);
    update public.events set settings = settings || jsonb_build_object('Portal Language',cfg), ver=public.kai_ms(clock_timestamp()), ver_by='language', ver_name='Noam' where id=e.id;
  end if;
  return jsonb_build_object('enabled',true,'admin',adm,'config',cfg,'modules',jsonb_build_object('guests',true,'sched',public.kai_plan_on(e),'brief',public.kai_plan_on(e),'budget',e.settings->>'Budget'='on','tasks',e.settings->>'Tasks'='on'));
end $$;
revoke all on function public.kai_portal_language(text,jsonb,text) from public,anon;
grant execute on function public.kai_portal_language(text,jsonb,text) to authenticated;
