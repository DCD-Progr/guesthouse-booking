# Guesthouse booking

Staff accommodation and Break tracking for multiple guesthouses. Requesters select a guesthouse and dates, see availability for the full stay, and submit without choosing a room. The designated approver selects a room; PostgreSQL confirms the decision and reservation in one transaction.

## Application

- Requester availability search, own requests, cancellation and change requests.
- Approver queue, room candidates, approval and rejection.
- Admin guesthouses, whole rooms/individual beds, closures, invitations and roles.
- Operational overview, room calendar, check-in/out, no-shows and activity history.
- Unlimited Break unit, separate from accommodation capacity.
- Explicit sample workspace with fictional session-only data.

## Stack

React + TypeScript + Vite frontend, Supabase Auth/PostgreSQL/functions backend, GitHub Actions and GitHub Pages frontend deployment. Live service configuration is required; cloning the code does not provision Supabase or publish a site.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
```

With no environment values the app offers sample mode. For live setup follow [Operations](docs/OPERATIONS.md). Never put a privileged API key in frontend configuration.

## Verification

```sh
npm run build
npm test
npm run test:db
npx playwright install chromium
npm run test:e2e
```

CI additionally runs database/concurrency tests on a disposable PostgreSQL service. The GitHub Pages workflow is manual and supports sample-only or live configuration.

[Project plan](docs/PROJECT_PLAN.md) · [Setup and operations](docs/OPERATIONS.md) · [Implementation issues](https://github.com/DCD-Progr/guesthouse-booking/issues)
