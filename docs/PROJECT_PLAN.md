# Guesthouse booking implementation plan

Status: planning. No live application or database has been deployed.

## Goal and scope

Manage 4-10 guesthouses, staff accommodation and Break periods. Three roles: requester, one designated approver, admin. A physical bed that can be booked independently is represented as its own room/unit. Travel scope is destination and accommodation; transport booking is excluded.

## Architecture

- React and TypeScript, built with Vite, for responsive application screens.
- GitHub repository for source, migrations, documentation and issue tracking.
- GitHub Pages for the static frontend, subject to verification of private-repository Pages entitlement. Keep repository visibility unchanged unless explicitly agreed.
- Supabase PostgreSQL for durable data, Auth for invited work-email accounts, database policies for authorization, and database functions for booking mutations.
- GitHub Actions for checks and deployment. Select supported package versions during implementation.
- Microsoft single sign-on and Power BI are deferred. Email notifications require a separately configured sending service; in-app status is the baseline.
- A deployed frontend may be publicly reachable; authentication and database authorization protect all operational data. Never place personal travel data or privileged keys in source, static assets or browser storage.

## User journeys

### Requester
Select guesthouse and arrival/departure dates. Show an availability count for rooms free throughout the entire stay, without names or details of other travelers. Submit without selecting a room. View own request status, confirmed assignment and cancellation options. An availability result is advisory and does not hold inventory.

### Approver
Review pending requests. Retrieve available rooms for the selected guesthouse and dates. Choose exactly one room and approve through a single database transaction that revalidates permissions, request state, dates, inventory and conflicts. If availability changed, leave the request pending and return a useful conflict message. Rejection requires a comment. Exactly one active designated approver is the MVP policy; role assignments are protected.

### Admin
Maintain guesthouses and rooms, separately bookable beds, dated closures, staff access and settings. Track arrivals, departures, check-in/out and no-shows. Review operational calendar and dashboard. Admin permission alone does not grant approval authority.

## Business rules

1. Dates are local accommodation dates. Use start-inclusive/end-exclusive intervals [arrival, departure), with departure later than arrival. Adjacent stays are allowed.
2. A room is eligible only when its guesthouse and the room are active, it belongs to the requested guesthouse, and it is free throughout the interval.
3. A conflict exists when existing.start < requested.end AND existing.end > requested.start.
4. Pending requests create no hold. Approval creates the confirmed allocation atomically; there is no approved accommodation request without its allocation.
5. Confirmed bookings and active room blocks share one occupancy conflict mechanism. A closure overlapping a reservation must be rejected with affected bookings identified to the admin; resolving or relocating those bookings is explicit.
6. Break uses one unlimited special unit, no guesthouse requirement, no accommodation occupancy slot and no capacity restriction. Break requests still require approval.
7. Requesters cannot write approval, assigned-room, role or confirmation fields directly. All sensitive changes are authorized server-side.
8. Confirmed dates/guesthouse cannot be edited in place by requesters. Replacement or change operations must check availability and obtain approval without silently losing the original booking.
9. Cancellation releases future reservation capacity transactionally and records the actor and reason. Checked-in stays require operational handling rather than an ordinary future-booking cancellation.
10. Unresolved occupancy after planned departure must be flagged and block unsafe assignment until checkout or an explicit authorized resolution. Define and test this operational guard alongside date-based inventory.
11. Repeated confirmation/cancellation calls must be idempotent. Competing decisions for one request must not both succeed.
12. Availability checks use database queries over the complete relevant data set, never a truncated client-side download.

## Data model

| Table | Principal fields and relationships |
|---|---|
| profiles | auth user ID, full name, work email, department, active |
| user_roles | user ID, role; protected role administration |
| settings | designated approver ID, operational timezone, configuration |
| guesthouses | ID, code, name, destination, timezone, active, arrival instructions |
| rooms | ID, guesthouse ID nullable for Break, code, unit type, whole-room/bed mode, physical-room label, active |
| requests | ID, requester ID, type, guesthouse ID nullable for Break, start/end dates, destination, purpose, requirements, state, submitted timestamp, version |
| room_allocations | ID, request ID unique, room ID, status, confirmation actor/time, actual check-in/out, movement |
| room_blocks | ID, room ID, start/end, reason, active status, actor |
| occupancy_slots | room ID, date range, source allocation or block; database exclusion rule for active accommodation slots |
| activity_events | actor, event, request/entity ID, timestamp and bounded change details; client cannot rewrite history |

Database migrations must supply keys, foreign keys, date checks, source exclusivity, indexes, policies and constraints. Exactly one special Break unit is seeded. Occupancy slot creation/release occurs inside controlled transactions. Database events and state changes commit together. Treat availability counts as a narrowly authorized aggregate, not a public table exposing travelers.

## Permissions

| Capability | Requester | Designated approver | Admin |
|---|---|---|---|
| Search sanitized availability | Yes | Yes | Yes |
| Submit and see own requests | Yes | Yes | Yes |
| See all approval requests | No | Yes | Operational access |
| Approve/reject and choose room | No | Yes | Only with approver authority |
| Manage inventory/closures | No | No | Yes |
| Grant roles or change approver | No | No | Protected admin function |
| Update operational movement | No | No | Yes |
| Read activity history | Own limited history | Relevant requests | Yes |

Use invite-only onboarding; no automatic access solely because an address uses a work domain. Initial admin setup requires a controlled bootstrap. Suspension must prevent database operations even with an existing session.

## Screens and dashboard

Requester: availability search, new request, my requests, request detail.
Approver: pending queue, decision detail with candidate rooms, decisions history.
Admin: room calendar, travelers list, guesthouses, rooms, closures, staff/access, audit history.
Dashboard: available/reserved/occupied/out-of-service rooms, pending requests, arrivals and departures, current Break travelers. Define occupied from actual movement, reserved from date-based allocations, and display overlapping conditions explicitly rather than misleadingly summing them.
Calendar: rooms down rows, dates across columns, guesthouse and date filters, distinct states for reservations, occupancy and closures. Requesters see sanitized capacity only.

## Delivery sequence and acceptance gates

### M1 Foundation
App scaffold and automated checks; complete schema/migrations; authentication, role policies and bootstrap. Gate: users cannot read or mutate unauthorized data through direct API requests.

### M2 Availability
Whole-stay availability query, closures and Break rules; requester availability screen. Gate: correct boundary behavior and no false availability when different rooms are free on different nights.

### M3 Requests and decisions
Submission, approver queue, transactional confirmation, rejection, cancellation and controlled changes. Gate: competing confirmations for one room produce exactly one reservation, and competing decisions for one request produce one outcome.

### M4 Operations
Inventory, closures, check-in/out and no-shows, dashboard and room calendar. Gate: closure conflicts and overstays receive explicit operational handling.

### M5 Pilot and deployment
Test fixtures, end-to-end and permission tests, import validation, hosting entitlement check, deployment configuration, restore exercise and operating guide. Gate: one guesthouse pilot passes acceptance before wider rollout.

Milestone headings are delivery phases, not a claim that GitHub milestone objects have been created.

## Mandatory tests

- Arrival equals another departure: allowed. Any actual interval overlap: blocked.
- Inactive room/guesthouse and overlapping closure excluded.
- Two rooms free on alternating nights do not count as one room free for the stay.
- Two simultaneous allocations for one room: one succeeds.
- Simultaneous block and booking: at most one overlapping occupancy slot succeeds.
- Simultaneous decisions for one request: one succeeds; retries are safe.
- Wrong guesthouse room, invalid dates, cancelled request or suspended user rejected.
- Requester cannot see other travelers, assign a room, approve or promote themselves.
- Multiple overlapping Break requests allowed and excluded from accommodation KPIs.
- Cancellation releases capacity; failed approval creates no partial state.
- Closed/changed browser session and stale availability are handled without losing user input.
- Overstay guard, closure relocation process and checked-in cancellation behavior tested.
- Database restore exercised in a separate environment before launch.

## Repository layout

- src/: application
- supabase/migrations/: schema, policies and functions
- supabase/tests/: authorization and concurrency tests
- tests/e2e/: complete user journeys
- docs/PROJECT_PLAN.md: this plan
- docs/OPERATIONS.md: setup, backup, restore and operational procedures
- .github/workflows/: checks and frontend deployment

## Decisions still required before production

Hosting entitlement and costs; Supabase project owner and region; staff count and approved work-email onboarding list; actual approver; initial admin; retention and backup targets; production timezone per guesthouse; notification sender if email is included. These do not block source planning or a fixture-based prototype. Do not import live staff/travel data until access controls are verified.
