# Mobile design and portal language pilot

Scope: Demo Wedding only (`demo-wedding`). No production couple has been enabled.

The shared portal loads a phone-only visual layer. Existing field identifiers, canonical enum values, API handlers, edit/save guards, comments and access levels remain in use. The guest row has a compact status dot and two lines; saved views still show their existing view-specific details. The approved budget summary uses the existing KAI sheet line totals, with a separate ring per currency. Desktop retains its existing budget summary and layout. Existing spreadsheet/grid budget formats have not been replaced.

`portal-locale.js` loads language preferences from `kai_portal_language`. The setting is independent of the RSVP form's `Default Language`. The default interface language is English; the legacy Hebrew Tasks and the existing brief language are preserved as overrides until an administrator changes them. The portal shell follows the default; module labels and direction follow their effective language. No entered content is translated. Template labels are localized before interpolation, not by searching the rendered user text. Native select values remain canonical.

Admin entry: Dashboard → Demo Wedding → Edit event → Portal settings · שפה. Each enabled module has Inherit / Hebrew / English. Revision checks prevent silent overwrites. The server checks event access, requires administrator rights for writes, validates all values and limits the pilot to Demo. The new function has an empty search_path; anonymous EXECUTE is revoked. Existing internal SECURITY DEFINER architecture is preserved with explicit authorization rather than weakening RLS.

Migration: `sql/035_portal_language.sql` (applied as `portal_language_demo_pilot`). No event settings or user data were changed during rollout; write tests ran in a rolled-back transaction.

Verification:

- `tests/portal-language.cjs`: module inheritance/overrides, RTL/LTR, preserved names/notes/vendor/task/question content and canonical RSVP/yes-no values; separate EUR/ILS rings; non-Demo isolation.
- `tests/language-settings.cjs`: admin settings UI, inherited-language hints, explicit module overrides, revision on save, conflict/draft retention, non-Demo and non-admin protection.
- Existing guest draft/save/delete/Undo/leave/conflict tests and task editor CRUD/navigation tests passed.
- SQL rollback tests: unauthenticated denied, unrelated user denied, member can read but cannot write, admin can save, inheritance normalized, invalid values denied, stale revision denied. Anonymous cannot execute; authenticated users can execute with the above checks.
- Browser visual QA was blocked by automatic approval review reporting a tool usage limit. No alternate browser route was used. A real iPhone visual check remains required before enabling production portals.

Run DOM tests with Node and jsdom 31.0.1 installed: `node v2/tests/portal-language.cjs` and `node v2/tests/language-settings.cjs`.

Rollback: revert this commit's frontend changes. The additive RPC can remain unused or be dropped with its exact signature `public.kai_portal_language(text,jsonb,text)`; no existing API was replaced.
