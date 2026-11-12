-- 030: one link for guests (12 Nov 2026).
--   * guests.phone2 ("Own Phone"): an extra guest's own phone, given in the RSVP form. The family still shares the main phone
--     (guests.phone); signing in to the guest area with an own phone opens that whole family (kai_family_phone).
--   * rsvpCheck: the RSVP form asks whether a phone is already registered, to point the guest to their guest area.
--   * kai_rsvp: a phone that is already registered never adds new people (the form sends the guest to the guest area instead);
--     a new guest whose name already exists in another family gets "Possible duplicate of #N" in Notes and in the notification.
alter table public.guests add column if not exists phone2 text not null default '';
create index if not exists guests_phone2_idx on public.guests (event_id, phone2) where phone2 <> '';

-- The family (main phone) a phone belongs to: the phone itself when it is a main phone, else the family of the guest who gave it as their own.
create or replace function public.kai_family_phone(ev uuid, ph text) returns text
language sql stable set search_path to 'public' as $$
  select coalesce(
    (select ph where ph <> '' and exists (select 1 from public.guests where event_id = ev and not deleted and phone = ph)),
    (select g.phone from public.guests g where ph <> '' and g.event_id = ev and not g.deleted and g.phone2 = ph and g.phone <> '' order by g."no" limit 1),
    ph)
$$;

do $$
declare d text;
begin
  -- the new column in the guest table (edit, views, change log)
  d := pg_get_functiondef('public.kai_fields'::regproc);
  if position($q$('table', 'Table #', 'text')$q$ in d) = 0 then raise exception 'kai_fields: no match'; end if;
  execute replace(d, $q$('table', 'Table #', 'text')$q$, $q$('table', 'Table #', 'text'), ('phone2', 'Own Phone', 'text')$q$);

  d := pg_get_functiondef('public.kai_apply'::regproc);
  if position($q$when c.k = 'phone' then$q$ in d) = 0 then raise exception 'kai_apply: no match'; end if;
  execute replace(d, $q$when c.k = 'phone' then$q$, $q$when c.k in ('phone', 'phone2') then$q$);

  d := pg_get_functiondef('public.kai_validate'::regproc);
  if position($q$  if (not partial or f ? 'age')$q$ in d) = 0 then raise exception 'kai_validate: no match'; end if;
  execute replace(d, $q$  if (not partial or f ? 'age')$q$, $q$  if f ? 'phone2' and public.kai_clean(f ->> 'phone2') <> '' and public.kai_norm_phone(f ->> 'phone2') !~ '^\+[0-9]{8,15}$' then
    errs := errs || 'Own phone number looks incomplete.'::text;
  end if;
  if (not partial or f ? 'age')$q$);

  -- guest area: an own phone signs in to its family; rsvpCheck for the RSVP form
  d := pg_get_functiondef('public.kai_public_core'::regproc);
  if position($q$then return jsonb_build_object('ok', false, 'error', 'bad'); end if;$q$ in d) = 0 then raise exception 'core: no match 1'; end if;
  d := replace(d, $q$then return jsonb_build_object('ok', false, 'error', 'bad'); end if;$q$, $q$then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
    ph := public.kai_family_phone(ev, ph);$q$);
  if position($q$  if act in ('portalLogin', 'portalRsvp', 'portalFlights', 'portalExtend') then$q$ in d) = 0 then raise exception 'core: no match 2'; end if;
  d := replace(d, $q$  if act in ('portalLogin', 'portalRsvp', 'portalFlights', 'portalExtend') then$q$, $q$  if act = 'rsvpCheck' then
    ph := public.kai_family_phone(ev, public.kai_norm_phone(d ->> 'phone'));
    return jsonb_build_object('ok', true, 'known', ph ~ '^\+[0-9]{8,15}$' and exists (select 1 from public.guests where event_id = ev and not deleted and phone = ph));
  end if;

  if act in ('portalLogin', 'portalRsvp', 'portalFlights', 'portalExtend') then$q$);
  execute d;

  -- the notification says when a new guest may be a duplicate
  d := pg_get_functiondef('public.kai_notify_from_log'::regproc);
  if position($q$else ' was added' end;$q$ in d) = 0 then raise exception 'notify: no match'; end if;
  execute replace(d, $q$else ' was added' end;$q$, $q$else ' was added' end || case when d ~ 'Possible duplicate' then ' · possible duplicate ⚠️' else '' end;$q$);
end $$;

create or replace function public.kai_rsvp(ev uuid, d jsonb) returns jsonb
language plpgsql set search_path to 'public' as $function$
declare ph text := public.kai_norm_phone(d ->> 'phone');
  st text := case d ->> 'attend' when 'yes' then 'Confirmed' when 'no' then 'Declined' when 'maybe' then 'Maybe' else 'Confirmed' end;
  people jsonb; p jsonb; grp text; g public.guests; f jsonb; i int := 0; age text; known boolean; own text; dup int; nno int;
begin
  -- an extra guest's own phone counts as their family's phone
  ph := public.kai_family_phone(ev, ph);
  known := ph <> '' and exists (select 1 from public.guests x where x.event_id = ev and not x.deleted and x.phone = ph);
  people := jsonb_build_array(jsonb_build_object('first', d ->> 'first', 'last', d ->> 'last', 'type', coalesce(d ->> 'type', 'adult'), 'main', true));
  if coalesce(d ->> 'attend', '') <> 'no' and jsonb_typeof(d -> 'companions') = 'array' then people := people || (d -> 'companions'); end if;
  select x."group" into grp from public.guests x where ph <> '' and x.event_id = ev and not x.deleted and x.phone = ph order by x."no" limit 1;
  grp := coalesce(grp, public.kai_clean((d ->> 'first') || ' ' || (d ->> 'last')));
  for p in select value from jsonb_array_elements(people) limit 11 loop
    if public.kai_clean(p ->> 'first') = '' and public.kai_clean(p ->> 'last') = '' then continue; end if;
    age := case p ->> 'type' when 'child' then 'Child' when 'baby' then 'Baby' else 'Adult' end;
    -- a child's exact age (events with their own Age Groups): the group comes from the age, and the age is kept in the Child Age column
    if p ->> 'type' = 'child' and coalesce(p ->> 'years', '') ~ '^[0-9]{1,2}$' then age := public.kai_age_for(ev, (p ->> 'years')::int); end if;
    -- events with their own Age Groups: the guest picks the group itself (Adult / Teen / Child / Baby)
    if coalesce(p ->> 'group', '') <> '' and (p ->> 'group') = any (public.kai_age_list(ev)) then age := p ->> 'group'; end if;
    f := jsonb_build_object('status', st, 'age', age);
    if p ->> 'type' = 'child' and coalesce(p ->> 'years', '') ~ '^[0-9]{1,2}$' then f := f || jsonb_build_object('kidage', case p ->> 'years' when '0' then 'Under 1' else p ->> 'years' end); end if;
    if coalesce((p ->> 'main')::boolean, false) and public.kai_clean(d ->> 'note') <> '' then f := f || jsonb_build_object('notes', public.kai_clean(d ->> 'note')); end if;
    g := null;
    if ph <> '' then
      select * into g from public.guests x where x.event_id = ev and not x.deleted and x.phone = ph
        and lower(x."first" || '|' || x."last") = lower(public.kai_clean(p ->> 'first') || '|' || public.kai_clean(p ->> 'last')) order by x."no" limit 1;
    end if;
    if g."no" is not null then perform public.kai_apply(ev, g, f, 'RSVP', false); continue; end if;
    -- This phone is already registered: no new people from the form (the guest is sent to their guest area to add or update).
    if known then continue; end if;
    own := public.kai_norm_phone(p ->> 'phone');
    if own = ph or own !~ '^\+[0-9]{8,15}$' then own := ''; end if;
    if own <> '' then f := f || jsonb_build_object('phone2', own); end if;
    -- Same name already in another family: keep both, and flag it for Noam.
    select x."no" into dup from public.guests x where x.event_id = ev and not x.deleted and x.phone <> ph
      and lower(x."first" || '|' || x."last") = lower(public.kai_clean(p ->> 'first') || '|' || public.kai_clean(p ->> 'last')) order by x."no" limit 1;
    nno := public.kai_new_guest(ev, f || jsonb_build_object('first', p ->> 'first', 'last', p ->> 'last', 'phone', ph, 'group', grp),
      'RSVP', 'RSVP form', st || ' · ' || age || ' · ' || grp || case when dup is not null then ' · Possible duplicate of #' || dup else '' end);
    if dup is not null then
      update public.guests set notes = concat_ws(E'\n', nullif(notes, ''), 'Possible duplicate of #' || dup) where event_id = ev and "no" = nno;
    end if;
    dup := null;
  end loop;
  return jsonb_build_object('ok', true, 'known', known);
end $function$;
