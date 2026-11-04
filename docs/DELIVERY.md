# Delivery status

The application implementation from [PR #11](https://github.com/DCD-Progr/guesthouse-booking/pull/11) is merged into main. This is a tested implementation, not a launched production service.

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

## Launch blockers and decisions

- Supabase connection is available. It currently has no projects; the accessible organisation is SI. The owner must confirm which organisation should own the new project before creation. Region/cost must be recorded during provisioning.
- GitHub Settings > Pages explicitly reports: 'Upgrade or make this repository public to enable Pages'. The repository remains private. Choose an eligible plan, explicitly authorize public source, or choose a different frontend host.
- Configure backend, invitation function, Auth redirects/SMTP, public frontend configuration, initial admin, designated approver and real inventory.
- Validate actual staff login/invitation delivery, deployed booking behavior and an isolated restore exercise before rollout.

See [Operations](OPERATIONS.md) for exact setup and daily procedures. Deployment workflow is manual. No staff invitations or real traveler records have been created.
