import { useState } from "react";
import {
  BedDouble,
  CalendarDays,
  Users,
  Wrench,
  Clock,
  Coffee,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "../context";
import { today, addDays, displayDate } from "../dates";
import { PageHeading, Status, Empty, Field } from "../components/UI";
import { operationsSnapshot, staffLocations } from "../operations";
const labels = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  closed: "Out of service",
  inactive: "Inactive",
};
const colors = {
  available: "#00877b",
  reserved: "#73cfc1",
  occupied: "#3f66b5",
  closed: "#f07870",
  inactive: "#b5bfcb",
};
const keys = Object.keys(labels) as (keyof typeof labels)[];
export function Overview() {
  const { data, user } = useApp();
  const operational = user.role === "admin" || data.approver_id === user.id;
  const [house, setHouse] = useState("");
  const [date, setDate] = useState(today());
  const [staff, setStaff] = useState("");
  const [movementFilter, setMovementFilter] = useState("all");
  const s = operationsSnapshot(data, date, house);
  const total = s.states.length;
  const locations = staffLocations(data, staff, date);
  const pending = s.pending.length;
  const metrics = [
    ["Available rooms", s.counts.available, BedDouble],
    ["Reserved", s.counts.reserved, CalendarDays],
    ["Occupied", s.counts.occupied, Users],
    ["Out of service", s.counts.closed, Wrench],
    ["Pending requests", pending, Clock],
    ["On Break", s.breaks.length, Coffee],
  ] as const;
  let offset = 0;
  const stops = keys
    .map((k) => {
      const start = offset;
      offset += total ? (s.counts[k] / total) * 100 : 0;
      return `${colors[k]} ${start}% ${offset}%`;
    })
    .join(",");
  const movements = s.requests.filter(
    (q) =>
      q.status === "confirmed" &&
      q.request_type === "accommodation" &&
      (movementFilter === "arrival"
        ? q.start_date === date
        : movementFilter === "departure"
          ? q.end_date === date
          : q.start_date === date || q.end_date === date),
  );
  if (!operational)
    return (
      <>
        <PageHeading
          title="Your overview"
          description="Your accommodation and travel requests."
        />
        <div className="metrics">
          {["pending", "confirmed", "rejected", "cancelled"].map((status) => (
            <div key={status}>
              <span>{status}</span>
              <strong>
                {
                  data.requests.filter(
                    (q) => q.requester_id === user.id && q.status === status,
                  ).length
                }
              </strong>
            </div>
          ))}
        </div>
        <h2>Recent requests</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stay</th>
                <th>Destination</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.requests
                .filter((q) => q.requester_id === user.id)
                .sort((a, b) => b.reference - a.reference)
                .slice(0, 10)
                .map((q) => (
                  <tr key={q.id}>
                    <td>
                      {q.start_date} to {q.end_date}
                    </td>
                    <td>{q.destination}</td>
                    <td>
                      <Status value={q.status} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </>
    );
  return (
    <div className="operations-dashboard">
      <div className="dashboard-heading">
        <PageHeading
          title="Operations overview"
          description="Accommodation and travel at a glance."
        />
        <div className="dashboard-filters">
          <Field label="Guesthouse">
            <select value={house} onChange={(e) => setHouse(e.target.value)}>
              <option value="">All guesthouses</option>
              {data.guesthouses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dashboard date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
            />
          </Field>
        </div>
      </div>
      <div className="dashboard-metrics">
        {metrics.map(([label, n, Icon]) => (
          <div key={label}>
            <span className="metric-icon">
              <Icon size={22} />
            </span>
            <div>
              <span>{label}</span>
              <strong>{n}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <h2>Room status</h2>
          <p>One status per room on the selected date</p>
          <div className="status-chart">
            <div
              role="img"
              aria-label={keys
                .map((k) => `${labels[k]}: ${s.counts[k]}`)
                .join(", ")}
              className="status-donut"
              style={{
                background: total ? `conic-gradient(${stops})` : "#edf2f7",
              }}
            >
              <div>
                <strong>{total}</strong>
                <span>Total rooms</span>
              </div>
            </div>
            <div className="chart-legend">
              {keys.map((k) => (
                <div key={k}>
                  <span>
                    <i style={{ background: colors[k] }} />
                    {labels[k]}
                  </span>
                  <strong>{s.counts[k]}</strong>
                  <small>
                    {total ? Math.round((s.counts[k] / total) * 100) : 0}%
                  </small>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="dashboard-panel">
          <h2>Guesthouse capacity</h2>
          <p>Room distribution across the portfolio</p>
          <div className="capacity-list">
            {s.houses.map((h) => {
              const hs = operationsSnapshot(data, date, h.id);
              return (
                <div key={h.id} className="capacity-row">
                  <strong>{h.name}</strong>
                  <div
                    className="capacity-bar"
                    role="img"
                    aria-label={keys
                      .map((k) => `${labels[k]} ${hs.counts[k]}`)
                      .join(", ")}
                  >
                    {keys.map((k) => (
                      <span
                        key={k}
                        title={`${labels[k]}: ${hs.counts[k]}`}
                        style={{
                          background: colors[k],
                          width: `${hs.states.length ? (hs.counts[k] / hs.states.length) * 100 : 0}%`,
                        }}
                      />
                    ))}
                  </div>
                  <span>{hs.states.length} rooms</span>
                </div>
              );
            })}
            {!s.houses.length && <Empty>No guesthouses configured.</Empty>}
          </div>
          <div className="inline-legend">
            {keys.map((k) => (
              <span key={k}>
                <i style={{ background: colors[k] }} />
                {labels[k]}
              </span>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-grid planning-grid">
        <section className="dashboard-panel">
          <h2>14-day planning</h2>
          <p>
            Reserved and closed rooms. Planned dates, not a forecast of physical
            occupancy.
          </p>
          <div
            className="planning-bars"
            role="img"
            aria-label="Fourteen-day room commitments"
          >
            {Array.from({ length: 14 }, (_, i) => {
              const day = addDays(date, i);
              const p = operationsSnapshot(data, day, house);
              const used = p.counts.reserved + p.counts.occupied;
              return (
                <div
                  key={day}
                  className="planning-day"
                  title={`${day}: ${used} occupied or reserved; ${p.counts.closed} closed; ${p.counts.available} available`}
                >
                  <div className="planning-track">
                    <span
                      style={{
                        height: `${p.states.length ? (p.counts.closed / p.states.length) * 100 : 0}%`,
                        background: colors.closed,
                      }}
                    />
                    <span
                      style={{
                        height: `${p.states.length ? (used / p.states.length) * 100 : 0}%`,
                        background: colors.available,
                      }}
                    />
                  </div>
                  <small>{day.slice(8)}</small>
                </div>
              );
            })}
          </div>
          <div className="inline-legend">
            <span>
              <i style={{ background: colors.available }} />
              Reserved / occupied
            </span>
            <span>
              <i style={{ background: colors.closed }} />
              Closed
            </span>
          </div>
        </section>
        <section className="dashboard-panel">
          <h2>Attention</h2>
          <p>Items requiring follow-up</p>
          <div
            className={
              s.overdue.length ? "attention danger-attention" : "attention"
            }
          >
            <AlertTriangle size={22} />
            <div>
              <strong>{s.overdue.length} overdue checkouts</strong>
              <span>Recorded check-ins without checkout</span>
            </div>
          </div>
          <div className="attention amber-attention">
            <Clock size={22} />
            <div>
              <strong>{pending} pending approvals</strong>
              <span>Awaiting the designated approver</span>
            </div>
          </div>
          <div className="attention">
            <CalendarDays size={22} />
            <div>
              <strong>
                {s.arrivals.length} arrivals · {s.departures.length} departures
              </strong>
              <span>On {displayDate(date)}</span>
            </div>
          </div>
        </section>
      </div>
      <section className="dashboard-panel staff-location-panel">
        <div className="section-heading">
          <div>
            <h2>Staff whereabouts</h2>
            <p>
              Confirmed plans for {date}. Recorded movement is the latest
              status, not GPS.
            </p>
          </div>
          <Field label="Select staff">
            <select value={staff} onChange={(e) => setStaff(e.target.value)}>
              <option value="">All staff</option>
              {data.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="muted">
          This directory includes all guesthouses, independently of the chart
          filter. Multiple assignments are shown together. Historical plans
          reflect current booking records.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Location / room</th>
                <th>Dates</th>
                <th>Latest recorded movement</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(({ staff: p, bookings, overdue }) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.full_name}</strong>
                    <small>
                      {p.department || "Staff"}
                      {p.active ? "" : " · inactive"}
                    </small>
                  </td>
                  <td>
                    {bookings.length
                      ? bookings.map(({ request: q, allocation: a }) => (
                          <div key={q.id}>
                            {q.request_type === "break"
                              ? `Break${q.destination ? " · " + q.destination : ""}`
                              : `${data.guesthouses.find((h) => h.id === q.guesthouse_id)?.name ?? "Guesthouse"} · ${data.rooms.find((r) => r.id === a?.room_id)?.name ?? "Room"}`}
                          </div>
                        ))
                      : "No confirmed location"}
                    {!!overdue.length && (
                      <small className="danger-text">
                        Unresolved occupied room:{" "}
                        {overdue
                          .map(
                            (a) =>
                              data.rooms.find((r) => r.id === a.room_id)?.name,
                          )
                          .join(", ")}
                      </small>
                    )}
                  </td>
                  <td>
                    {bookings.map(({ request: q }) => (
                      <div key={q.id}>
                        {q.start_date} to {q.end_date}
                      </div>
                    ))}
                  </td>
                  <td>
                    {bookings.map(({ request: q, allocation: a }) => (
                      <div key={q.id}>
                        <Status value={a!.movement} />
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!locations.length && <Empty>No staff match this selection.</Empty>}
        </div>
      </section>
      <section className="dashboard-panel">
        <div className="section-heading">
          <div>
            <h2>Arrivals / departures</h2>
            <p>Confirmed accommodation movements on the selected date</p>
          </div>
          <Field label="Movement filter">
            <select
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value)}
            >
              <option value="all">All movements</option>
              <option value="arrival">Arrivals</option>
              <option value="departure">Departures</option>
            </select>
          </Field>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Traveler</th>
                <th>Guesthouse</th>
                <th>Room</th>
                <th>Arrival</th>
                <th>Departure</th>
                <th>Movement</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((q) => {
                const a = data.room_allocations.find(
                  (a) => a.request_id === q.id && a.active,
                );
                return (
                  <tr key={q.id}>
                    <td>
                      {data.profiles.find((p) => p.id === q.requester_id)
                        ?.full_name ?? "Staff member"}
                    </td>
                    <td>
                      {
                        data.guesthouses.find((h) => h.id === q.guesthouse_id)
                          ?.name
                      }
                    </td>
                    <td>{data.rooms.find((r) => r.id === a?.room_id)?.name}</td>
                    <td>{q.start_date}</td>
                    <td>{q.end_date}</td>
                    <td>
                      <Status value={a?.movement ?? q.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!movements.length && (
            <Empty>No confirmed movements on this date.</Empty>
          )}
        </div>
      </section>
      <p className="dashboard-footnote">
        Dates use Africa/Juba. Occupied rooms remain unavailable until checkout
        is recorded. Use Refresh data for the latest updates. Charts use current
        records, not historical occupancy snapshots.
      </p>
    </div>
  );
}
