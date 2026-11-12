-- 032 (12 Nov 2026): the budget as a real spreadsheet (Univer) inside the guest-list page, tried on noam-adva only.
-- events.budget = {"source": "grid", "cats": [], "grid": <Univer workbook snapshot>}. Noam edits it; the couple gets it read-only,
-- without the column whose header starts with "Notes (only you)" and without sheets named "Private…".
create or replace function public.kai_grid_public(g jsonb) returns jsonb
language plpgsql immutable set search_path to 'public' as $$
declare out jsonb := g; sid text; sh jsonb; cols text[]; cd jsonb; rk text; row jsonb; c text;
begin
  if jsonb_typeof(g) <> 'object' or jsonb_typeof(g -> 'sheets') <> 'object' then return g; end if;
  for sid, sh in select * from jsonb_each(g -> 'sheets') loop
    if coalesce(sh ->> 'name', '') ilike 'private%' then
      out := jsonb_set(out, '{sheets}', (out -> 'sheets') - sid);
      out := jsonb_set(out, '{sheetOrder}', coalesce((select jsonb_agg(x) from jsonb_array_elements(out -> 'sheetOrder') x where x #>> '{}' <> sid), '[]'::jsonb));
      continue;
    end if;
    cols := array(select distinct cc.key from jsonb_each(coalesce(sh -> 'cellData', '{}'::jsonb)) rr, jsonb_each(rr.value) cc
                  where coalesce(cc.value ->> 'v', '') ilike 'notes (only you)%' or coalesce(cc.value ->> 'v', '') ilike 'notes · only you%');
    if array_length(cols, 1) is null then continue; end if;
    cd := '{}'::jsonb;
    for rk, row in select * from jsonb_each(coalesce(sh -> 'cellData', '{}'::jsonb)) loop
      foreach c in array cols loop row := row - c; end loop;
      cd := cd || jsonb_build_object(rk, row);
    end loop;
    out := jsonb_set(out, array['sheets', sid, 'cellData'], cd);
  end loop;
  return out;
end $$;

create or replace function public.kai_budget_public(b jsonb) returns jsonb
language sql immutable set search_path to 'public' as $function$
  -- What the couple sees: everything except Noam's private notes.
  select case when jsonb_typeof(b) <> 'object' then '{}'::jsonb
    when b ->> 'source' = 'grid' then b || jsonb_build_object('grid', public.kai_grid_public(b -> 'grid'))
    else
    b || jsonb_build_object('cats', (select coalesce(jsonb_agg(ct || jsonb_build_object('lines',
      (select coalesce(jsonb_agg(ln - 'note' order by n2), '[]'::jsonb) from jsonb_array_elements(coalesce(ct -> 'lines', '[]'::jsonb)) with ordinality y(ln, n2))) order by n1), '[]'::jsonb)
      from jsonb_array_elements(coalesce(b -> 'cats', '[]'::jsonb)) with ordinality z(ct, n1)))
  end
$function$;
