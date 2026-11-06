import type { Data, Request } from "./types";

// Planned itinerary from current records, not a reconstruction of physical movements.
export function twoWeekSchedule(
  data: Data,
  days: string[],
  staffId = "",
  houseId = "",
) {
  const allocations = data.room_allocations.filter(
    (a) => a.active && !["no_show", "cancelled"].includes(a.movement),
  );
  const plans = data.requests.filter(
    (q) =>
      q.status === "pending" ||
      (q.status === "confirmed" &&
        allocations.some((a) => a.request_id === q.id)),
  );
  const onDay = (q: Request, day: string) =>
    q.start_date <= day && day < q.end_date;
  const location = (q: Request) =>
    q.request_type === "break"
      ? `Break${q.destination ? " · " + q.destination : ""}`
      : (data.guesthouses.find((h) => h.id === q.guesthouse_id)?.name ??
        q.destination ??
        "Unknown guesthouse");
  const staff = data.profiles
    .filter((p) => !staffId || p.id === staffId)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((person) => ({
      person,
      cells: days.map((day) => {
        const requests = plans.filter(
          (q) => q.requester_id === person.id && onDay(q, day),
        );
        return {
          day,
          entries: requests.map((q) => ({ request: q, label: location(q) })),
          conflict: requests.filter((q) => q.status === "confirmed").length > 1,
        };
      }),
    }));
  const rooms = data.rooms
    .filter(
      (r) =>
        r.unit_type === "accommodation" &&
        (!houseId || r.guesthouse_id === houseId),
    )
    .sort((a, b) =>
      `${a.guesthouse_id} ${a.name}`.localeCompare(
        `${b.guesthouse_id} ${b.name}`,
        undefined,
        { numeric: true },
      ),
    )
    .map((room) => ({
      room,
      house: data.guesthouses.find((h) => h.id === room.guesthouse_id),
      cells: days.map((day) => {
        const requests = plans.filter(
          (q) =>
            q.status === "confirmed" &&
            onDay(q, day) &&
            allocations.some(
              (a) => a.request_id === q.id && a.room_id === room.id,
            ),
        );
        const closed = data.room_blocks.some(
          (b) =>
            b.active &&
            b.room_id === room.id &&
            b.start_date <= day &&
            day < b.end_date,
        );
        const inactive =
          !room.active ||
          !data.guesthouses.find((h) => h.id === room.guesthouse_id)?.active;
        return { day, requests, closed, inactive };
      }),
    }));
  return {
    staff,
    rooms,
    plans: plans.filter((q) => days.some((day) => onDay(q, day))),
  };
}
