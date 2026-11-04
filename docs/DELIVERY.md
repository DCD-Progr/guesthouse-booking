# Delivery status

The application implementation from [PR #11](https://github.com/DCD-Progr/guesthouse-booking/pull/11) is merged into main. The frontend is now published at https://dcd-progr.github.io/guesthouse-booking/ and connected to the SI Supabase project. Initial staff/admin accounts, production Auth email delivery and operational pilot acceptance remain.

## Verified

- Production TypeScript/Vite build passed.
- 3 date/interval tests passed.
- 13 database tests passed in embedded PostgreSQL and in GitHub Actions PostgreSQL.
- 8 browser journeys passed at 1440x960 desktop and 390x844 mobile.
- Real PostgreSQL concurrency suite passed for competing bookings, booking versus closure, competing decisions and duplicate confirmation retries.
- [GitHub validation run](https://github.com/DCD-Progr/guesthouse-booking/actions/runs/41787296471) completed successfully.

Browser journey: availability search -> requester submits -> designated approver chooses room and confirms -> requester sees assigned room -> remaining capacity decreases. Additional journeys cover Break/cancellation, admin inventory/closure/calendar and stale-result invalidation.

The connected browser could not reach the local development server. Local Playwright headless Chromium supplied interaction and screenshot verification. The meaningful availability screen rendered without framework overlay or console errors; mobile document overflow was absent. Sample-mode verification is not evidence that live Auth emails or production infrastructure work.

## Visual review

The full availability concept and actual desktop screenshot were reviewed at the concept's 1487x1058 dimensions, with a 390px mobile review. Checked heading/copy hierarchy, white/slate/teal palette, sidebar and header geometry, search controls, result table, icons and three-step explanation. Native dialogs provide focus containment. Field labelling and mobile result layout were corrected during verification so the request action remains reachable. Intentional differences from concept: smaller operational typography, role-appropriate navigation, real runtime dates, sample identity/banner, Break action, and mobile stacked results. No decorative raster assets are shipped as functional UI.

## Deployment status

- SI project `guesthouse-booking` is active in eu-west-1 (Ireland).
- All application tables have RLS. Initial schema, extension isolation and policy/index migrations are applied; filenames match live migration history.
- The `invite-staff` Edge Function is active with explicit user JWT and admin authorization checks.
- Hosted Auth Site URL and redirect allowlist point to the exact GitHub Pages URL. Public signup and anonymous sign-in are disabled.
- Source was made public with the owner's explicit authorization. GitHub access review shows zero collaborators. Visitors may view/fork source but cannot push changes to the original repository.
- GitHub Pages deployment [run](https://github.com/DCD-Progr/guesthouse-booking/actions/runs/41791280723) succeeded with live public connection values.
- Published login page rendered without console warnings/errors. Anonymous table reads, booking RPC calls and unauthenticated invitation attempts all returned 401 permission/authentication errors.
- The remaining 14 Supabase SECURITY DEFINER advisor warnings reflect the intentionally authorized RPC design; see [security review](SECURITY_NOTES.md).

## Remaining operational onboarding

Obtain the intended initial administrator's work email before creating an account or sending an invitation. Then bootstrap the admin, designate the approver, configure/test production SMTP, load approved guesthouses/rooms/staff, and run one-guesthouse pilot and restore acceptance. No live traveler records or staff invitations have been created.

See [Operations](OPERATIONS.md) for setup and daily procedures.
