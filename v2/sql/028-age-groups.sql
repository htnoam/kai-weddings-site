-- 028 (11 Nov 2026, live): an event can have its own age groups (Settings › Age Groups, e.g. "Baby 0-4, Child 5-12, Teen 13-17").
-- New: kai_age_ranges(ev), kai_age_list(ev), kai_age_for(ev, years). guests.age may now also be 'Teen'.
-- Patched in place: kai_cols (age choices per event), kai_validate, kai_rsvp (child's exact age -> group + "kidage" custom column),
-- kai_api list (sends "ages"), kai_basic_keys (+ 'Age Groups'), kai_new_guest / kai_act_guests / kai_act_misc / kai_public_core (accept Teen),
-- kai_events (adults include teens, + teens count). Shir & Ami: Age Groups set.
-- Later the same day: guests pick the group itself (companion "group": Adult / Teen / Child / Baby); the exact-age list was dropped
-- and its empty "Child Age" column removed.
alter table public.guests drop constraint guests_age_check;
alter table public.guests add constraint guests_age_check check (age = any (array['Adult', 'Teen', 'Child', 'Baby']));
-- Also: kai_budget_sheets — adults exclude teens; "teens" sent only for events with a Teen group (Hub budgetSync writes it to Guests!B5).
