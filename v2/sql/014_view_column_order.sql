-- A view's columns keep the order they were saved in (9 Nov 2026). "c2 in (select …)" could shuffle them;
-- kai_act_misc (saveView, two places) now uses "with ordinality … order by", and kai_views reads them in order:
create or replace function public.kai_views(ev uuid) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', v.name,
      'cols', (select coalesce(jsonb_agg(x order by n), '[]'::jsonb) from unnest(v.cols) with ordinality u(x, n) where x in (select k from public.kai_cols(ev))),
      'status', v.status, 'age', v.age, 'sort', v.sort, 'filters', v.filters) order by v.id), '[]'::jsonb)
  from public.views v where v.event_id = ev
$$;
