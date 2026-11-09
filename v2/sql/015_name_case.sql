-- Guest names are always saved "First letter capital, rest small", each word (split by spaces and hyphens), however they were typed (9 Nov 2026).
-- Hebrew is not affected. The group is changed only when it was typed all in capitals or all in small letters (so a family's shared group stays identical).
create or replace function public.kai_title(t text) returns text language sql immutable set search_path = public as $$
  select coalesce(string_agg(case when m[1] ~ '^[[:space:]-]+$' then m[1] else upper(left(m[1], 1)) || lower(substr(m[1], 2)) end, '' order by n), '')
  from regexp_matches(coalesce(t, ''), '([^[:space:]-]+|[[:space:]-]+)', 'g') with ordinality r(m, n)
$$;
create or replace function public.kai_name_case() returns trigger language plpgsql set search_path = public as $$
begin
  new."first" := public.kai_title(new."first");
  new."last" := public.kai_title(new."last");
  if coalesce(new."group", '') <> '' and (new."group" = upper(new."group") or new."group" = lower(new."group")) then new."group" := public.kai_title(new."group"); end if;
  return new;
end $$;
create trigger kai_name_case before insert or update of "first", "last", "group" on public.guests for each row execute function public.kai_name_case();
-- Existing guests were updated once the same way (and family groups that match a member's name, e.g. "Evelyne ASSARAF" → "Evelyne Assaraf" for the whole family).
