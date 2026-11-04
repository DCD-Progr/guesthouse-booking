import type { Data } from "./types";
export function operationsSnapshot(data: Data, date: string, house = "") {
  const houses = data.guesthouses.filter((h) => !house || h.id === house);
  const rooms = data.rooms.filter(
    (r) =>
      r.unit_type === "accommodation" &&
      houses.some((h) => h.id === r.guesthouse_id),
  );
  const requestMap = new Map(data.requests.map((q) => [q.id, q]));
  const states = rooms.map((room) => {
    const h = houses.find((h) => h.id === room.guesthouse_id)!;
    const allocations = data.room_allocations.filter(
      (a) => a.room_id === room.id && a.active,
    );
    const occupied = allocations.some(
      (a) =>
        a.movement === "checked_in" &&
        !a.actual_checkout &&
        (!a.actual_checkin || a.actual_checkin.slice(0, 10) <= date),
    );
    const reserved = allocations.some(
      (a) =>
        !["checked_out", "no_show", "cancelled"].includes(a.movement) &&
        (() => {
          const q = requestMap.get(a.request_id);
          return (
            q?.status === "confirmed" &&
            q.start_date <= date &&
            date < q.end_date
          );
        })(),
    );
    const closed = data.room_blocks.some(
      (b) =>
        b.room_id === room.id &&
        b.active &&
        b.start_date <= date &&
        date < b.end_date,
    );
    return {
      room,
      state: occupied
        ? "occupied"
        : !room.active || !h.active
          ? "inactive"
          : closed
            ? "closed"
            : reserved
              ? "reserved"
              : "available",
    };
  });
  const counts = {
    available: 0,
    reserved: 0,
    occupied: 0,
    closed: 0,
    inactive: 0,
  };
  for (const { state } of states) counts[state as keyof typeof counts]++;
  const requests = data.requests.filter(
    (q) => !house || q.guesthouse_id === house,
  );
  const pending = requests.filter((q) => q.status === "pending");
  const arrivals = requests.filter(
    (q) =>
      q.status === "confirmed" &&
      q.request_type === "accommodation" &&
      q.start_date === date,
  );
  const departures = requests.filter(
    (q) =>
      q.status === "confirmed" &&
      q.request_type === "accommodation" &&
      q.end_date === date,
  );
  const breaks = data.requests.filter(
    (q) =>
      q.status === "confirmed" &&
      q.request_type === "break" &&
      q.start_date <= date &&
      date < q.end_date &&
      data.room_allocations.some(
        (a) => a.request_id === q.id && a.active && a.movement === "on_break",
      ),
  );
  const overdue = data.room_allocations.filter(
    (a) =>
      a.active &&
      a.movement === "checked_in" &&
      !a.actual_checkout &&
      (() => {
        const q = requestMap.get(a.request_id);
        return q && q.end_date <= date && (!house || q.guesthouse_id === house);
      })(),
  );
  return {
    houses,
    states,
    counts,
    requests,
    pending,
    arrivals,
    departures,
    breaks,
    overdue,
  };
}
export function staffLocations(data: Data, staffId: string, date: string) {
  return data.profiles
    .filter((p) => !staffId || p.id === staffId)
    .map((staff) => {
      const bookings = data.requests
        .filter(
          (q) =>
            q.requester_id === staff.id &&
            q.status === "confirmed" &&
            q.start_date <= date &&
            date < q.end_date,
        )
        .map((request) => ({
          request,
          allocation: data.room_allocations.find(
            (a) => a.request_id === request.id && a.active,
          ),
        }))
        .filter(
          (x) =>
            x.allocation &&
            !["no_show", "cancelled"].includes(x.allocation.movement),
        );
      // Preserve simultaneous bookings as separate evidence rather than inventing one location.
      const overdue = data.room_allocations.filter(
        (a) =>
          a.active &&
          a.movement === "checked_in" &&
          !a.actual_checkout &&
          data.requests.some(
            (q) =>
              q.id === a.request_id &&
              q.requester_id === staff.id &&
              q.end_date <= date,
          ),
      );
      return { staff, bookings, overdue };
    });
}
