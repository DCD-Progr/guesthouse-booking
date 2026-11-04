# Security and booking-integrity review

Reviewed 4 November 2026. Scope: application and invitation endpoint source, deployed PostgreSQL privileges/policies and business rules, public Auth settings, hosted-page behavior, dependencies, CI and deployment configuration. This is a source-backed engineering review with attack/regression tests and live checks, not an independent penetration-test certification. The specialized registered security-scan runtime and referenced resources were unavailable, so no claim of a completed formal Codex Security scan is made.

## Assessment

No critical/high-severity external exploit was demonstrated in the reviewed paths. Anonymous clients and invalid tokens received HTTP 401 for traveler reads and decisions. All nine operational tables use RLS. Staff have read-only, filtered table access and write through checked RPCs; helper/trigger functions are not callable by application roles. A signed-in Auth identity without an active provisioned profile has no application access.

There are still production-readiness gaps below. Passing these tests does not prove that all vulnerabilities or business-rule omissions have been eliminated.

## Findings and remediation

| Finding | Impact and evidence | Resolution |
|---|---|---|
| Public registration was enabled | Public Auth settings returned disable_signup=false and dashboard showed the signup switch enabled. Unprovisioned accounts cannot read application data, but open signup creates unnecessary account/email-abuse exposure. | Disabled public registration; retained email confirmation and disabled anonymous sign-in. Public settings endpoint subsequently returned disable_signup=true. |
| Traveler overlap depended on API functions | Submission/approval checks protected existing paths, but an unrelated future privileged writer could omit them. | BEFORE trigger independently rejects overlapping pending/confirmed room or Break requests. Only a pending change and its confirmed original may overlap. The existing global transaction lock serializes writes. |
| Relationship integrity depended on application sequencing | Foreign keys link valid IDs but do not prove the allocation belongs to the requested house, or that a confirmed room has a matching capacity record. | Deferred commit-time guards enforce allocation/type/house consistency, confirmed allocation presence, exact reservation and closure slots, and valid movement families. Allocated request identity/dates cannot be edited in place. One pending replacement per original is indexed uniquely. |
| Missing browser resource policy and embedding protection | Hosted page had no CSP or X-Frame-Options headers. React escapes user content, but supplementary browser defenses were absent. | Production HTML receives a strict self-script CSP, exact configured API connection origin, no objects/frames/forms, and no-referrer policy. App refuses login/booking UI when embedded in another page. |
| Password-policy assurance | UI password length alone is not a server-side guarantee. | Align hosted minimum length with the app's 12-character requirement and enable recent-login checks for password changes. Existing passwords are not changed by this configuration. |

## Independent database invariants

1. A traveler cannot have overlapping pending or confirmed accommodation/Break requests across any guesthouses. End dates are exclusive; adjacent stays are valid.
2. A pending replacement may overlap its confirmed original; two confirmed overlapping stays are never exempt. Replacement owner/type must match. Only one pending replacement can exist per original.
3. A confirmed request must have an active allocation. An active allocation must belong to a confirmed request, match the requested unit type, and match its guesthouse for accommodation.
4. Every open room allocation has exactly its own room/date capacity slot. Break never consumes a room slot.
5. Reservation slots cannot remain attached to cancelled, completed, no-show or inactive allocations. Active closures require exact matching room/date slots; released closures cannot retain slots.
6. Room overlap exclusion remains independent of the traveler guard. Cancellation, early checkout and replacement must leave a consistent final transaction state.
7. Pending/confirmed admission rules, cancellation ownership, admin authority, designation, inactive accounts and booking-state transitions are still checked inside RPCs.

Commit guards are deferred so a legitimate atomic replacement can temporarily remove the original slot before creating the new one. An inconsistent transaction cannot commit. Their checks run with a fixed search path, use the existing lock, and are not public RPCs. They are a second layer, not a replacement for permission checks.

## Verification

- 33 database regression tests on PGlite and PostgreSQL 17, including raw-writer bypass attempts, failed transaction rollback, immutable allocated dates, missing/wrong slots, wrong-house allocations, unprovisioned account isolation and complete role/grant checks.
- 25 browser journeys, including production-build inline-script injection, hostile HTML as literal user text, blocked unauthorized outbound requests, frame denial, existing auth/booking/calendar/dashboard/mobile journeys and individual overlap rejection.
- 11 unit tests for dates/auth/dashboard/staff location calculations.
- Real PostgreSQL concurrency test covers eight patterns: competing room approvals, booking/closure, approve/reject, duplicate approval, ten distinct travelers competing for a room, approve/cancel, simultaneous room/Break submission for one person, and direct privileged raw inserts for one person bypassing RPCs.
- Independent availability oracle compares 120 intervals. Live integrity inspection found zero traveler-overlap pairs after the explicitly authorized cancellation and retained 33 rooms.
- Dependency audit reported zero known advisories at review time. Dependencies and lockfile are pinned. This does not cover undiscovered vulnerabilities or all supply-chain compromise scenarios.
- New live mutation checks use transactions that roll back; no test staff bookings are retained. Normal requester changes remain auditable.

## Remaining limits and priorities

- **Authentication email delivery/recovery:** the existing starter mail service is unsuitable for broad staff onboarding/recovery. Resolve with an approved sender or another agreed authentication design. No personal domain was connected.
- **MFA:** enrollment/enforcement for app administrators and account-owner MFA for GitHub/Supabase are not verified by this review. These require deliberate enrollment and recovery planning; do not assume they are active.
- **Compromised-password screening:** hosted advisor reports it disabled; the dashboard states it requires Pro or above. No paid upgrade was initiated. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
- **Hosting headers:** the application-level frame denial and HTML CSP improve protection, but HTTP frame-ancestors/X-Frame-Options headers are still absent on the checked GitHub Pages response. A host supporting configurable headers would provide stronger embedding policy. Meta CSP cannot enforce frame-ancestors: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors .
- **Privileged operators:** database owners/service-role credentials can disable triggers or change grants. No application can defend its database against an operator with unrestricted database ownership. Protect privileged accounts and secrets.
- **Recovery:** a real backup/restore exercise remains outstanding. No destructive recovery test was performed against production.
- **Scale:** the installation deliberately serializes mutations; deferred integrity checks inspect current related data. This favors correctness for a small guesthouse installation, not high-volume throughput. Higher-volume growth requires measured load tests and narrower incremental checks.
- **Dashboard location:** confirmed plans and latest recorded movements do not establish GPS location or a complete historical physical-location timeline.
- **Self-approval:** explicitly allowed by the owner and logged. This is a governance choice, not an accidental privilege bypass.
- **Intentional advisor warning:** 14 authenticated SECURITY DEFINER API entry points remain. Their identity/role/state checks and fixed search paths were reviewed. Private helpers have no staff/anonymous execution grants. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable .

## Release discipline

Run the full suite on every PR/main commit and require successful current-main checks before Pages publication. For every new workflow, add both positive cases and denial/rollback/concurrency cases, and identify which database invariant prevents bypass. Re-check hosted Auth settings after configuration changes. This reduces recurrence risk; it is not a zero-defect guarantee.
