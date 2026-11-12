-- 031 (12 Nov 2026): the guest list gets the event's shuttle times (wedding.shuttlesGo / shuttlesBack),
-- for the shuttle buttons in a guest's details on the phone.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kai_api_core'::regproc);
  if position($q$'sunset', coalesce(e.settings ->> 'Sunset Time', '')),$q$ in d) = 0 then raise exception 'kai_api_core: no match'; end if;
  execute replace(d, $q$'sunset', coalesce(e.settings ->> 'Sunset Time', '')),$q$, $q$'sunset', coalesce(e.settings ->> 'Sunset Time', ''),
        'shuttlesGo', coalesce(e.settings ->> 'Shuttles Go', ''), 'shuttlesBack', coalesce(e.settings ->> 'Shuttles Back', '')),$q$);
end $$;
