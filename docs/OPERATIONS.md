# Setup and operation

## Current delivery boundary

The repository contains the application, database migrations, administrator invitation function, automated checks and a manual GitHub Pages deployment workflow. The published app is https://dcd-progr.github.io/guesthouse-booking/. The SI Supabase project and GitHub Pages frontend are deployed. Initial accounts, approved inventory, production email delivery and pilot acceptance remain before operational use. Sample mode is fictional, volatile, explicitly labelled and never writes to Supabase.

## Local development

Use Node 24. Run `npm ci`, copy `.env.example` to `.env.local` if connecting a development project, and run `npm run dev -- --host 127.0.0.1 --port 4173`. Without configuration the app offers sample mode. Never use production personal data in fixtures. All dates are start-inclusive/end-exclusive.

Checks:

- `npm run build`: TypeScript and production bundle.
- `npm test`: date arithmetic and interval boundaries.
- `npm run test:db`: migration, RLS and booking-function tests using embedded PostgreSQL (PGlite).
- `npm run test:e2e`: browser journeys at desktop and mobile sizes; install Chromium with `npx playwright install chromium` first.
- Set `TEST_DATABASE_URL` to an EMPTY disposable PostgreSQL database to run `npm run test:db` against real PostgreSQL. It creates mock Auth roles/schema for tests, never target a Supabase project or production database. Then run `node --test tests/concurrency/*.test.mjs` against that same disposable database. CI provides this separate environment.

## Create the live backend

1. In an organisation-owned Supabase account, create a project in an approved region. Record ownership and billing. Do not put the database password or secret API key in this repository or the frontend.
2. Apply `supabase/migrations/20261104070728_initial_guesthouse_booking.sql` through the Supabase SQL editor, or use the Supabase CLI to link the project and run `supabase db push`. Apply the remaining migrations in filename order too. Migration filenames now match the live deployment history. This is a one-time initial setup. Back up before any later migration.
3. In Auth settings, disable public signup. Set Site URL and allowed redirect URL to the exact application URL, including `/guesthouse-booking/` for a project Pages site. Avoid broad wildcard redirects in production.
4. Configure production Auth SMTP and an authenticated sender domain. Supabase's development email service is not a substitute for production delivery. Test invitation and magic-link delivery with an approved test account before inviting staff. Set appropriate Auth email rate limits. No booking notification email service is implemented; users check in-app status.
5. Invite the initial administrator through Supabase Auth. Then run the bootstrap SQL below with the exact Auth user ID and business name. This is the only manual admin bootstrap. Do not expose this SQL as a public endpoint.
6. Deploy the `invite-staff` Edge Function using the CLI: `supabase functions deploy invite-staff`. It manually verifies user JWTs with Auth and checks current administrator authority. The deployed function defaults to the GitHub Pages origin and URL. To use a different host, configure function secrets `APP_ORIGIN` (origin only, e.g. `https://dcd-progr.github.io`) and `APP_URL` (complete application URL). Supabase supplies its runtime project URL and standard keys; alternatively set `SUPABASE_SECRET_KEY` and `SUPABASE_PUBLISHABLE_KEY` there. Privileged credentials stay only in the function environment. Never add them as `VITE_*` values.
7. Add public repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Only use the publishable key. Configure the same values in `.env.local` for local work. RLS and RPC authorization, not key secrecy, protect data.
8. In the app, add real guesthouses and rooms. Invite staff, then select an active admin/approver as the single designated approver. The designated approver cannot decide their own request; another authorized person must be designated for their travel.

Bootstrap SQL, after replacing placeholders:

```sql
insert into public.profiles(id,email,full_name,role,active)
select id,lower(email),'INITIAL ADMIN NAME','admin',true
from auth.users where id='INITIAL_AUTH_USER_UUID'::uuid;
```

If an invitation email succeeds but profile provisioning fails, the user has no application access. An existing admin can finish provisioning through `provision_invited_staff`, or a trusted database operator can insert a requester profile from the matching Auth user. Do not repeatedly resend or delete Auth accounts to conceal partial provisioning.

## GitHub Pages

The repository was made public with the owner's explicit approval. GitHub access review found zero collaborators; public visitors can read/fork source but cannot push changes to this repository. GitHub Pages is enabled with GitHub Actions and HTTPS. Keep privileged keys and staff/travel records out of the repository.

Enable GitHub Actions as the Pages source. The `Deploy GitHub Pages` workflow is manual. Run it from `main` after merging and passing checks. `sample_only=true` publishes a clearly labelled sample workspace without live configuration. `sample_only=false` requires the public Supabase variables. The deployment artifact includes code and public configuration, never database contents.

Use GitHub environment protection rules if deployment review is required. The public frontend and source contain no operational dataset; every data operation still requires authenticated authorization. Verify signed-out users cannot read data before launch.

Reference: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

## Daily workflow

- Staff search by guesthouse and full date interval. Availability is advisory and makes no hold.
- Approver opens pending requests, selects an available room and confirms. Decision, allocation, occupancy and audit commit together. A conflict refreshes the room options and leaves the request pending.
- Break requests bypass guesthouse/room capacity and use the protected unlimited Break unit.
- Admin checks travelers in/out or records no-shows. Check-in is only allowed within booked dates. Checkout releases unused remaining nights. A still-open actual check-in conservatively blocks new assignments for that room, even beyond its planned dates, until checkout resolves it.
- Add maintenance closures only after resolving conflicting bookings. The app rejects conflicts. Contact affected staff and use replacement requests or cancellation, rather than overwriting a confirmed booking.
- Requesters can submit a replacement for an unstarted confirmed booking. The original remains allocated until the replacement succeeds. Failure rolls back every replacement change.
- Review actual movement separately from planned reservation counts. Daily overview uses Africa/Juba; check-in validation uses the guesthouse timezone. A calendar cell shows planned capacity, with actual occupancy listed below.
- Refresh screens for current information. The MVP uses explicit refresh rather than live subscriptions; confirmation always rechecks database state.

## Access and incident handling

Admin can suspend a profile; all queries and sensitive mutations recheck active status. Admin cannot remove their own admin access. Select a replacement approver before suspending the current one, or decisions will pause. Audit events record role/approver edits and cannot be rewritten through the authenticated application API.

The service-role credential and database owner can bypass application controls. Limit access to those credentials. The browser keeps Auth sessions in memory, so a page reload requires sign-in again. No staff/travel dataset is persisted in browser local storage.

## Backup and restore

Choose and record required recovery point and recovery time before launch. Confirm what the selected Supabase plan backs up and whether point-in-time recovery is included. Do not assume that database backups include every Auth configuration, Edge secret or external SMTP setting.

Use managed backups plus a documented, access-controlled database export process. Store exports outside the public website and repository. Export roles/schema/data with supported Supabase tools, encrypt exports, restrict access and test retention. Preserve Auth user IDs referenced by profiles and keep environment configuration separately in the organisation's secret store.

Restore into an isolated project first. Apply the matching migration version, restore data with referential integrity, configure Auth/SMTP/redirects and function secrets, and compare counts. Run the acceptance workflow with test accounts, including a booking conflict, a closure conflict, cancellation and staff isolation. Record elapsed restore time and the tested recovery point. Do not point the production frontend at a restored project until these checks pass.

## Pilot gate

Begin with one guesthouse and approved test accounts. Verify roles through direct API attempts, actual Auth invitations, current-day movement, simultaneous approvals in the deployed database, mobile usability, and restore. Record the real approver/admin, region, staff list, retention, backups and hosting ownership. Expand to other guesthouses after the pilot passes.
