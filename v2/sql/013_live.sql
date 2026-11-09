-- Live guest screen (9 Nov 2026): a private Realtime channel per event, "event:<slug>".
-- Only Noam and the event's members can listen or send (policies on realtime.messages use kai_can_topic(realtime.topic())).
-- Trigger kai_ver_changed on events.ver sends 'changed' to the channel at every change, so open screens refresh at once.
-- The screens also send 'editing' {sid, name, no, k} so others see who is editing which cell. The 5-second ping stays as a backup.
create or replace function public.kai_can_topic(t text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events e where 'event:' || e.slug = t and e.status <> 'Deleted'
    and (public.kai_is_admin() or exists (select 1 from public.event_members m where m.event_id = e.id and m.email = public.kai_email())))
$$;
grant execute on function public.kai_can_topic(text) to authenticated;
create policy kai_event_listen on realtime.messages for select to authenticated using (public.kai_can_topic(realtime.topic()));
create policy kai_event_send on realtime.messages for insert to authenticated with check (public.kai_can_topic(realtime.topic()));
create or replace function public.kai_ver_changed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ver is distinct from old.ver then
    perform realtime.send(jsonb_build_object('ver', new.ver, 'by', new.ver_by, 'name', new.ver_name), 'changed', 'event:' || new.slug, true);
  end if;
  return new;
end $$;
create trigger kai_ver_changed after update of ver on public.events for each row execute function public.kai_ver_changed();
