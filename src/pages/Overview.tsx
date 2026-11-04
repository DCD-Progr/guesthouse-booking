import { useApp } from "../context";
import { today, addDays, overlaps, displayDate } from "../dates";
import { PageHeading, Status, Empty } from "../components/UI";
export function Overview() {
  const { data, user } = useApp();
  const operational = user.role === "admin" || data.approver_id === user.id;
  const date = today();
  const requests = data.requests.filter(
    (q) => operational || q.requester_id === user.id,
  );
  const units = data.rooms.filter(
    (r) =>
      r.unit_type === "accommodation" &&
      r.active &&
      data.guesthouses.some((h) => h.id === r.guesthouse_id && h.active),
  );
  const occupied = new Set(
    data.room_allocations
      .filter(
        (a) => a.active && a.movement === "checked_in" && !a.actual_checkout,
      )
      .map((a) => a.room_id),
  );
  const reserved = new Set(
    data.room_allocations
      .filter(
        (a) =>
          a.active &&
          !["checked_out", "no_show"].includes(a.movement) &&
          data.requests.some(
            (q) =>
              q.id === a.request_id &&
              q.request_type === "accommodation" &&
              overlaps(date, addDays(date, 1), q.start_date, q.end_date),
          ),
      )
      .map((a) => a.room_id),
  );
  const closed = new Set(
    data.room_blocks
      .filter(
        (b) =>
          b.active &&
          overlaps(date, addDays(date, 1), b.start_date, b.end_date),
      )
      .map((b) => b.room_id),
  );
  const available = units.filter(
    (r) => !occupied.has(r.id) && !reserved.has(r.id) && !closed.has(r.id),
  ).length;
  const breaks = requests.filter(
    (q) =>
      q.request_type === "break" &&
      q.status === "confirmed" &&
      q.start_date <= date &&
      q.end_date > date &&
      data.room_allocations.some(
        (a) => a.request_id === q.id && a.active && a.movement === "on_break",
      ),
  ).length;
  const stats = operational
    ? [
        ["Available rooms", available],
        ["Reserved today", reserved.size],
        ["Physically occupied", occupied.size],
        ["Out of service", closed.size],
        [
          "Pending requests",
          requests.filter((q) => q.status === "pending").length,
        ],
        ["Travelers on Break", breaks],
      ]
    : [
        [
          "Pending requests",
          requests.filter((q) => q.status === "pending").length,
        ],
        [
          "Confirmed stays",
          requests.filter((q) => q.status === "confirmed").length,
        ],
        ["On Break", breaks],
      ];
  return (
    <>
      <PageHeading
        title="Overview"
        description={
          (operational
            ? "Accommodation operations"
            : "Your accommodation requests") +
          " · " +
          new Intl.DateTimeFormat("en-GB", {
            dateStyle: "long",
            timeZone: "Africa/Juba",
          }).format(new Date())
        }
      />
      <div className="metrics">
        {stats.map(([label, n]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      {operational && (
        <p className="muted">
          Daily overview uses Africa/Juba dates. Reserved rooms can also be
          physically occupied; these figures are not additive.
        </p>
      )}
      <h2 className="section-title">
        {operational ? "Arrivals and departures today" : "Recent requests"}
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Request</th>
              {operational && <th>Traveler</th>}
              <th>Guesthouse</th>
              <th>Stay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests
              .filter(
                (q) =>
                  !operational ||
                  (q.status === "confirmed" &&
                    (q.start_date === date || q.end_date === date)),
              )
              .slice(-10)
              .reverse()
              .map((q) => (
                <tr key={q.id}>
                  <td>#{q.reference}</td>
                  {operational && (
                    <td>
                      {
                        data.profiles.find((p) => p.id === q.requester_id)
                          ?.full_name
                      }
                    </td>
                  )}
                  <td>
                    {q.request_type === "break"
                      ? "Break"
                      : data.guesthouses.find((h) => h.id === q.guesthouse_id)
                          ?.name}
                  </td>
                  <td>
                    {displayDate(q.start_date)} - {displayDate(q.end_date)}
                  </td>
                  <td>
                    <Status value={q.status} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!requests.some(
          (q) =>
            !operational ||
            (q.status === "confirmed" &&
              (q.start_date === date || q.end_date === date)),
        ) && (
          <Empty>
            {operational
              ? "No confirmed arrivals or departures today."
              : "No requests yet. Open Availability to plan a stay."}
          </Empty>
        )}
      </div>
    </>
  );
}
