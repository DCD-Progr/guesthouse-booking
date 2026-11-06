import { test } from "node:test";
import assert from "node:assert/strict";
import { operationsSnapshot, staffLocations } from "../src/operations.ts";
const base = () => ({
  profiles: [
    { id: "u", full_name: "Traveler", active: true },
    { id: "v", full_name: "Unassigned", active: true },
  ],
  guesthouses: [
    { id: "h", active: true },
    { id: "x", active: true },
  ],
  rooms: [
    { id: "r", guesthouse_id: "h", unit_type: "accommodation", active: true },
    { id: "s", guesthouse_id: "h", unit_type: "accommodation", active: true },
    { id: "b", unit_type: "break", active: true },
  ],
  requests: [],
  room_allocations: [],
  room_blocks: [],
  activity_events: [],
  approver_id: null,
});
const q = (id = "q", type = "accommodation") => ({
  id,
  requester_id: "u",
  status: "confirmed",
  request_type: type,
  guesthouse_id: type === "break" ? null : "h",
  start_date: "2090-01-01",
  end_date: "2090-01-04",
});
const a = (id = "a", request_id = "q", room_id = "r") => ({
  id,
  request_id,
  room_id,
  active: true,
  movement: "expected",
  actual_checkout: null,
});
test("dashboard uses exclusive room categories and excludes unlimited Break", () => {
  const d = base();
  d.requests = [q()];
  d.room_allocations = [{ ...a(), movement: "checked_in" }];
  const s = operationsSnapshot(d, "2090-01-02");
  assert.equal(s.counts.occupied, 1);
  assert.equal(s.counts.reserved, 0);
  assert.equal(s.counts.available, 1);
  assert.equal(
    Object.values(s.counts).reduce((a, b) => a + b, 0),
    2,
  );
});
test("departure boundary is free, closed and inactive rooms are not available", () => {
  const d = base();
  d.requests = [q()];
  d.room_allocations = [a()];
  assert.equal(operationsSnapshot(d, "2090-01-04").counts.available, 2);
  d.room_blocks = [
    {
      room_id: "r",
      active: true,
      start_date: "2090-01-04",
      end_date: "2090-01-06",
    },
  ];
  d.rooms[1].active = false;
  assert.deepEqual(operationsSnapshot(d, "2090-01-04").counts, {
    available: 0,
    reserved: 0,
    occupied: 0,
    closed: 1,
    inactive: 1,
  });
});
test("staff dropdown preserves overlapping locations rather than picking one", () => {
  const d = base();
  d.requests = [q(), q("bq", "break")];
  d.room_allocations = [a(), { ...a("ba", "bq", "b"), movement: "on_break" }];
  const result = staffLocations(d, "u", "2090-01-02");
  assert.equal(result.length, 1);
  assert.equal(result[0].bookings.length, 2);
  assert.equal(operationsSnapshot(d, "2090-01-02").breaks.length, 1);
  assert.equal(staffLocations(d, "v", "2090-01-02")[0].bookings.length, 0);
});
test("pending, rejected and cancelled requests never become staff locations", () => {
  const d = base();
  d.requests = ["pending", "rejected", "cancelled"].map((status, i) => ({
    ...q(String(i)),
    status,
  }));
  d.room_allocations = d.requests.map((q) => a(q.id, q.id));
  assert.equal(staffLocations(d, "u", "2090-01-02")[0].bookings.length, 0);
});
test("overdue physical occupancy survives planned departure and house filtering", () => {
  const d = base();
  d.requests = [q()];
  d.room_allocations = [{ ...a(), movement: "checked_in" }];
  assert.equal(operationsSnapshot(d, "2090-01-05", "h").overdue.length, 1);
  assert.equal(operationsSnapshot(d, "2090-01-05", "x").overdue.length, 0);
  assert.equal(staffLocations(d, "u", "2090-01-05")[0].overdue.length, 1);
});

const { twoWeekSchedule } = await import("../src/schedule.ts");
const days = Array.from(
  { length: 14 },
  (_, i) => `2090-01-${String(i + 1).padStart(2, "0")}`,
);
test("fortnight staff matrix preserves all staff and departure-exclusive locations", () => {
  const d = base();
  d.guesthouses[0].name = "Renk Guesthouse";
  d.requests = [q()];
  d.room_allocations = [a()];
  const s = twoWeekSchedule(d, days);
  assert.equal(s.staff.length, 2);
  assert.equal(s.staff[0].cells.length, 14);
  const traveler = s.staff.find((r) => r.person.id === "u");
  assert.equal(traveler.cells[0].entries[0].label, "Renk Guesthouse");
  assert.equal(traveler.cells[3].entries.length, 0);
  assert.equal(s.rooms.length, 2);
  assert.equal(s.rooms[0].cells[2].requests.length, 1);
  assert.equal(s.rooms[0].cells[3].requests.length, 0);
});
test("pending Break is distinct, needs no allocation and never reserves a room", () => {
  const d = base();
  d.requests = [
    { ...q("break", "break"), status: "pending", destination: "Nairobi" },
  ];
  const s = twoWeekSchedule(d, days, "u", "h");
  assert.equal(s.staff.length, 1);
  assert.equal(s.staff[0].cells[0].entries[0].label, "Break · Nairobi");
  assert.equal(s.staff[0].cells[0].entries[0].request.status, "pending");
  assert.equal(
    s.rooms.flatMap((r) => r.cells).some((c) => c.requests.length),
    false,
  );
});
test("room filter cannot hide staff locations; cancelled and no-show plans excluded", () => {
  const d = base();
  d.requests = [q(), { ...q("cancel"), status: "cancelled" }, q("no")];
  d.room_allocations = [
    a(),
    a("c", "cancel"),
    { ...a("n", "no"), movement: "no_show" },
  ];
  const s = twoWeekSchedule(d, days, "u", "x");
  assert.equal(s.rooms.length, 0);
  assert.equal(s.staff[0].cells[0].entries.length, 1);
});
test("closures are exclusive and simultaneous confirmed plans remain visible as conflicts", () => {
  const d = base();
  d.requests = [q(), q("bq", "break")];
  d.room_allocations = [a(), a("b", "bq", "b")];
  d.room_blocks = [
    {
      room_id: "s",
      active: true,
      start_date: "2090-01-02",
      end_date: "2090-01-04",
    },
  ];
  const s = twoWeekSchedule(d, days);
  assert.equal(
    s.staff.find((r) => r.person.id === "u").cells[1].conflict,
    true,
  );
  const room = s.rooms.find((r) => r.room.id === "s");
  assert.equal(room.cells[1].closed, true);
  assert.equal(room.cells[3].closed, false);
});
