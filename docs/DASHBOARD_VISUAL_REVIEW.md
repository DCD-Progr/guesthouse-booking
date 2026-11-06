# Staff-first fortnight dashboard

The dashboard replaces the single-date chart layout with the user's Excel-style planning layout. Staff are the primary rows, 14 consecutive dates are columns, and cells contain the guesthouse or Break destination. A secondary room matrix uses the same dates and displays traveler names.

- One start-date control, previous/next fortnight buttons and Today control synchronize both sections.
- Staff selection applies to the staff matrix; guesthouse selection applies only to rooms so it cannot conceal a staff member's other destinations.
- Confirmed accommodation, Break and pending plans have distinct text and styling. No plan means unknown location. Pending replacements appear alongside their original confirmed plans.
- End dates are exclusive. Cancelled, rejected and no-show plans are excluded. Conflicting confirmed assignments remain visible rather than being silently collapsed.
- These matrices represent current planned booking dates, including completed stays' planned dates. They do not reconstruct historical physical occupancy or claim to track real-time whereabouts. Live booking availability remains authoritative.
- Sticky staff/room labels and date headers support internally scrolling tables on desktop and mobile.
- The existing SI application palette and role restrictions are retained. Only admins and the designated approver see these operational matrices.

Validation: production build, unit tests for date boundaries, Break/pending semantics, room-filter independence, conflicts and closures; desktop/mobile browser checks cover both 14-column grids, synchronized fortnight navigation, staff filtering, requester isolation and document overflow.
