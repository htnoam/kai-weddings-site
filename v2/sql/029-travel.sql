-- 029: guest area travel (11 Nov 2026). Every event can now set, in Edit event:
--   Shuttles Go / Shuttles Back ("09:00, 11:00"), Travel Hours ("3"), Flights Go / Flights Back (recommended flights,
--   one per line: "Aegean | A3 929 | 05:00 | 07:10"), Taxi Name / Taxi Phone, Hotel Email, Extend Days ("3").
-- Shuttle days are the event's Start Date (there) and End Date (back).
-- Guests save their shuttle choice in arrBus / depBus ("09:00", "Taxi", "Own"), and a stay-extension request
-- goes into the first family member's Notes ("Stay extension request: 01/06/2027 – 07/06/2027").
do $$
declare d text;
begin
  d := pg_get_functiondef('public.kai_basic_keys'::regproc);
  if position($q$'Invited EN']$q$ in d) = 0 then raise exception 'kai_basic_keys: no match'; end if;
  execute replace(d, $q$'Invited EN']$q$, $q$'Invited EN', 'Shuttles Go', 'Shuttles Back', 'Travel Hours', 'Flights Go', 'Flights Back', 'Taxi Name', 'Taxi Phone', 'Hotel Email', 'Extend Days']$q$);

  d := pg_get_functiondef('public.kai_portal_view(public.events, text)'::regprocedure);
  if position($q$'depFlight', g."depFlight")$q$ in d) = 0 then raise exception 'kai_portal_view: no match'; end if;
  execute replace(d, $q$'depFlight', g."depFlight")$q$, $q$'depFlight', g."depFlight", 'arrBus', g."arrBus", 'depBus', g."depBus")$q$);

  d := pg_get_functiondef('public.kai_public_core'::regproc);
  if position($q$act in ('portalLogin', 'portalRsvp', 'portalFlights')$q$ in d) = 0 then raise exception 'core: no match 1'; end if;
  d := replace(d, $q$act in ('portalLogin', 'portalRsvp', 'portalFlights')$q$, $q$act in ('portalLogin', 'portalRsvp', 'portalFlights', 'portalExtend')$q$);
  if position($q$act not in ('rsvp', 'grandSave', 'portalRsvp', 'portalFlights')$q$ in d) = 0 then raise exception 'core: no match 2'; end if;
  d := replace(d, $q$act not in ('rsvp', 'grandSave', 'portalRsvp', 'portalFlights')$q$, $q$act not in ('rsvp', 'grandSave', 'portalRsvp', 'portalFlights', 'portalExtend')$q$);
  if position($q$array['arrDate', 'arrTime', 'arrFlight', 'depDate', 'depTime', 'depFlight']$q$ in d) = 0 then raise exception 'core: no match 3'; end if;
  d := replace(d, $q$array['arrDate', 'arrTime', 'arrFlight', 'depDate', 'depTime', 'depFlight']$q$, $q$array['arrDate', 'arrTime', 'arrFlight', 'arrBus', 'depDate', 'depTime', 'depFlight', 'depBus']$q$);
  if position($q$    return public.kai_portal_view(e, ph);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Unknown action.');$q$ in d) = 0 then raise exception 'core: no match 4'; end if;
  d := replace(d, $q$    return public.kai_portal_view(e, ph);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Unknown action.');$q$, $q$    return public.kai_portal_view(e, ph);
  end if;

  if act = 'portalExtend' then
    if coalesce(e.settings ->> 'Hotel Email', '') = '' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
    fi := coalesce(d ->> 'checkIn', ''); la := coalesce(d ->> 'checkOut', '');
    if fi !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' or la !~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    select * into g from public.guests where event_id = ev and not deleted and phone = ph order by "no" limit 1;
    k := 'Stay extension request: ' || fi || ' – ' || la;
    if position(k in coalesce(g.notes, '')) = 0 then
      perform public.kai_apply(ev, g, jsonb_build_object('notes', concat_ws(E'\n', nullif(g.notes, ''), k)), 'Guest portal', false);
    end if;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Unknown action.');$q$);
  execute d;
end $$;
