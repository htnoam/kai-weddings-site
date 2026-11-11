-- KAI Events v2 · 027 (11/11/2026): the Budget tab, per event (settings "Budget" = "on"). Applied live with the Supabase tools.
alter table public.events add column if not exists budget jsonb;   -- {nights, buffer, cats:[{id,name,lines:[{id,vendor,item,unit,qty,link,nightsOn,due,status,note,pays:[{id,date,amount,note}]}]}]}

-- What the couple sees: everything except Noam's private notes.
create or replace function public.kai_budget_public(b jsonb) returns jsonb language sql immutable set search_path to 'public' as $f$
  select case when jsonb_typeof(b) <> 'object' then '{}'::jsonb else
    b || jsonb_build_object('cats', (select coalesce(jsonb_agg(ct || jsonb_build_object('lines',
      (select coalesce(jsonb_agg(ln - 'note' order by n2), '[]'::jsonb) from jsonb_array_elements(coalesce(ct -> 'lines', '[]'::jsonb)) with ordinality y(ln, n2))) order by n1), '[]'::jsonb)
      from jsonb_array_elements(coalesce(b -> 'cats', '[]'::jsonb)) with ordinality z(ct, n1)))
  end
$f$;

-- Patched in place in kai_api:
--  'list'       returns budget (admin: whole; couple: kai_budget_public) when settings "Budget" = "on", else null.
--  'saveBudget' Noam only; stores d.budget (object with a cats array, under 400 KB) and bumps the event's ver so open pages refresh.

-- Turned on for one event to try it:
update public.events set settings = settings || '{"Budget":"on"}'::jsonb,
  budget = coalesce(budget, '{"nights":2,"buffer":10,"cats":[{"id":"acc","name":"Accommodation","lines":[]},{"id":"ven","name":"Venue fees","lines":[]},{"id":"fnb","name":"Food & drinks","lines":[]},{"id":"sup","name":"Suppliers","lines":[]},{"id":"pln","name":"Planning team","lines":[]}]}'::jsonb)
  where slug = 'noam-adva';
