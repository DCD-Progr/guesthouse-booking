import { useState } from "react";
import { useApp } from "../context";
import { today, addDays, displayDate } from "../dates";
import { PageHeading, Status, Empty, Field } from "../components/UI";
import { twoWeekSchedule } from "../schedule";
export function Overview() {
  const { data, user } = useApp();
  const operational = user.role === "admin" || data.approver_id === user.id;
  const [house, setHouse] = useState("");
  const [date, setDate] = useState(today());
  const [staff, setStaff] = useState("");
  const days = Array.from({ length: 14 }, (_, i) => addDays(date, i));
  const schedule = twoWeekSchedule(data, days, staff, house);
  const dateHeaders = days.map((day) => (
    <th
      scope="col"
      key={day}
      className={day === today() ? "schedule-today" : ""}
    >
      <span>
        {new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", {
          weekday: "short",
          timeZone: "UTC",
        })}
      </span>
      <strong>{displayDate(day)}</strong>
    </th>
  ));
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
      <PageHeading
        title="Operations overview"
        description="Two weeks of staff plans, followed by room reservations."
      />
      <div className="schedule-toolbar">
        <Field label="Period starts">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || today())}
          />
        </Field>
        <div className="schedule-navigation">
          <button onClick={() => setDate(addDays(date, -14))}>
            Previous 14 days
          </button>
          <button onClick={() => setDate(today())}>Today</button>
          <button onClick={() => setDate(addDays(date, 14))}>
            Next 14 days
          </button>
        </div>
        <strong aria-live="polite">
          {displayDate(date)} {date.slice(0, 4)} to {displayDate(days[13])}{" "}
          {days[13].slice(0, 4)} · 14 days
        </strong>
      </div>
      <div className="period-summary">
        <div>
          <strong>
            {new Set(schedule.plans.map((q) => q.requester_id)).size}
          </strong>
          <span>Staff with plans in period</span>
        </div>
        <div>
          <strong>
            {schedule.plans.filter((q) => q.status === "confirmed").length}
          </strong>
          <span>Confirmed stays / Breaks in period</span>
        </div>
        <div>
          <strong>
            {schedule.plans.filter((q) => q.status === "pending").length}
          </strong>
          <span>Pending requests in period</span>
        </div>
      </div>
      <section className="dashboard-panel staff-schedule-panel">
        <div className="section-heading">
          <div>
            <h2>Staff whereabouts</h2>
            <p>
              Rows are staff, columns are dates, cells show the planned
              guesthouse or location.
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
        <div className="schedule-legend">
          <span className="plan-confirmed">Confirmed accommodation</span>
          <span className="plan-break">Break</span>
          <span className="plan-pending">Pending approval</span>
          <span>No plan = location unknown</span>
        </div>
        <p className="muted">
          All guesthouses and Break destinations are included. Departure dates
          are exclusive. These are booked plans, not live tracking; completed
          stays retain their planned dates.
        </p>
        <div
          className="schedule-scroll"
          role="region"
          aria-label="Two-week staff schedule"
          tabIndex={0}
        >
          <table className="schedule-table">
            <thead>
              <tr>
                <th scope="col">Staff member</th>
                {dateHeaders}
              </tr>
            </thead>
            <tbody>
              {schedule.staff.map(({ person, cells }) => (
                <tr key={person.id}>
                  <th scope="row">
                    <strong>{person.full_name}</strong>
                    <small>
                      {person.department || "Staff"}
                      {person.active ? "" : " · inactive"}
                    </small>
                  </th>
                  {cells.map((cell) => (
                    <td
                      key={cell.day}
                      className={cell.day === today() ? "schedule-today" : ""}
                    >
                      {cell.conflict && (
                        <strong className="danger-text">
                          Conflicting plans
                        </strong>
                      )}
                      {cell.entries.length ? (
                        cell.entries.map(({ request: q, label }) => (
                          <div
                            key={q.id}
                            className={`schedule-entry ${q.status === "pending" ? "plan-pending" : q.request_type === "break" ? "plan-break" : "plan-confirmed"}`}
                            title={`Request #${q.reference}: ${q.start_date} to ${q.end_date} (departure exclusive)`}
                          >
                            {label}
                            <small>
                              {q.status === "pending"
                                ? "Pending approval"
                                : q.request_type === "break"
                                  ? "Confirmed Break"
                                  : "Confirmed"}
                            </small>
                          </div>
                        ))
                      ) : (
                        <span className="no-plan">No plan</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!schedule.staff.length && (
            <Empty>No staff match this selection.</Empty>
          )}
        </div>
      </section>
      <section className="dashboard-panel room-schedule-panel">
        <div className="section-heading">
          <div>
            <h2>Room schedule</h2>
            <p>The same 14 days, with traveler names in each reserved room.</p>
          </div>
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
        </div>
        <p className="muted">
          The guesthouse filter applies only to rooms. Breaks do not consume
          room capacity. Available means no planned reservation or closure;
          check live availability before booking.
        </p>
        <div
          className="schedule-scroll"
          role="region"
          aria-label="Two-week room schedule"
          tabIndex={0}
        >
          <table className="schedule-table">
            <thead>
              <tr>
                <th scope="col">Guesthouse / room</th>
                {dateHeaders}
              </tr>
            </thead>
            <tbody>
              {schedule.rooms.map(({ room, house: h, cells }) => (
                <tr key={room.id}>
                  <th scope="row">
                    <strong>{room.name}</strong>
                    <small>{h?.name || "Unknown guesthouse"}</small>
                  </th>
                  {cells.map((cell) => (
                    <td
                      key={cell.day}
                      className={cell.day === today() ? "schedule-today" : ""}
                    >
                      {cell.requests.map((q) => (
                        <div
                          key={q.id}
                          className="schedule-entry plan-confirmed"
                          title={`Request #${q.reference}: ${q.start_date} to ${q.end_date}`}
                        >
                          {data.profiles.find((p) => p.id === q.requester_id)
                            ?.full_name || "Unknown staff"}
                          <small>Reserved</small>
                        </div>
                      ))}
                      {cell.inactive ? (
                        <span className="schedule-unavailable">Inactive</span>
                      ) : cell.closed ? (
                        <span className="schedule-unavailable">
                          Out of service
                        </span>
                      ) : !cell.requests.length ? (
                        <span className="no-plan">Available</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!schedule.rooms.length && (
            <Empty>No rooms match this selection.</Empty>
          )}
        </div>
      </section>
      <p className="dashboard-footnote">
        Dates use Africa/Juba. Current booking records are shown, including
        pending changes alongside their original plans. Use Refresh data for the
        latest updates.
      </p>
    </div>
  );
}
