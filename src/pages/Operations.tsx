import { useState } from "react";
import { useApp } from "../context";
import { addDays, today, overlaps, displayDate } from "../dates";
import { Empty, Field, Modal, PageHeading, Status } from "../components/UI";
import type { House, Room, Profile } from "../types";
export function Inventory() {
  const { data, call, busy, notify } = useApp();
  const [tab, setTab] = useState("Rooms");
  const [form, setForm] = useState<"room" | "house" | "block" | null>(null);
  const [editing, setEditing] = useState<Room | House | null>(null);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let args: Record<string, unknown> = {};
    let rpc = "";
    if (form === "house") {
      rpc = "save_guesthouse";
      args = {
        p_id: editing?.id ?? null,
        p_name: f.get("name"),
        p_code: f.get("code"),
        p_destination: f.get("destination"),
        p_timezone: f.get("timezone"),
        p_active: f.get("active") === "on",
        p_instructions: f.get("instructions"),
      };
    } else if (form === "room") {
      rpc = "save_room";
      args = {
        p_id: editing?.id ?? null,
        p_name: f.get("name"),
        p_code: f.get("code"),
        p_house: f.get("house"),
        p_mode: f.get("mode"),
        p_physical: f.get("physical"),
        p_active: f.get("active") === "on",
      };
    } else {
      rpc = "create_block";
      args = {
        p_room: f.get("room"),
        p_start: f.get("start"),
        p_end: f.get("end"),
        p_reason: f.get("reason"),
      };
    }
    try {
      await call(rpc, args);
      setForm(null);
      notify("Saved successfully.");
    } catch {}
  }
  const h = editing && "destination" in editing ? editing : null;
  const r = editing && "mode" in editing ? editing : null;
  return (
    <>
      <PageHeading
        title="Inventory"
        description="Manage guesthouses, rooms, separately bookable beds and closures."
        action={
          <button
            onClick={() => {
              setEditing(null);
              setForm(
                tab === "Guesthouses"
                  ? "house"
                  : tab === "Closures"
                    ? "block"
                    : "room",
              );
            }}
          >
            Add{" "}
            {tab === "Guesthouses"
              ? "guesthouse"
              : tab === "Closures"
                ? "closure"
                : "room"}
          </button>
        }
      />
      <div className="tabs">
        {["Rooms", "Guesthouses", "Closures"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : "secondary"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {(tab === "Rooms"
                ? ["Room / unit", "Guesthouse", "Mode", "Status", ""]
                : tab === "Guesthouses"
                  ? ["Guesthouse", "Destination", "Timezone", "Status", ""]
                  : ["Room", "From", "Until", "Reason", ""]
              ).map((v, i) => (
                <th key={i}>{v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tab === "Rooms"
              ? data.rooms.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {x.name}
                      <small>{x.code}</small>
                    </td>
                    <td>
                      {data.guesthouses.find((h) => h.id === x.guesthouse_id)
                        ?.name ?? "Not applicable"}
                    </td>
                    <td>{x.mode.replace("_", " ")}</td>
                    <td>
                      <Status
                        value={
                          x.unit_type === "break"
                            ? "unlimited"
                            : x.active
                              ? "active"
                              : "inactive"
                        }
                      />
                    </td>
                    <td>
                      {x.unit_type !== "break" && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditing(x);
                            setForm("room");
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              : tab === "Guesthouses"
                ? data.guesthouses.map((x) => (
                    <tr key={x.id}>
                      <td>
                        {x.name}
                        <small>{x.code}</small>
                      </td>
                      <td>{x.destination}</td>
                      <td>{x.timezone}</td>
                      <td>
                        <Status value={x.active ? "active" : "inactive"} />
                      </td>
                      <td>
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditing(x);
                            setForm("house");
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                : data.room_blocks
                    .filter((b) => b.active)
                    .map((b) => (
                      <tr key={b.id}>
                        <td>
                          {data.rooms.find((r) => r.id === b.room_id)?.name}
                        </td>
                        <td>{b.start_date}</td>
                        <td>{b.end_date}</td>
                        <td>{b.reason}</td>
                        <td>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void call("release_block", { p_block: b.id })
                                .then(() => notify("Closure released."))
                                .catch(() => {})
                            }
                          >
                            Release
                          </button>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>
      {form && (
        <Modal
          title={
            (editing ? "Edit " : "Add ") +
            (form === "house"
              ? "guesthouse"
              : form === "block"
                ? "closure"
                : "room")
          }
          close={() => setForm(null)}
        >
          <form onSubmit={save}>
            {form === "block" ? (
              <>
                <Field label="Room">
                  <select name="room" required>
                    <option value="">Select room</option>
                    {data.rooms
                      .filter((r) => r.unit_type === "accommodation")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} · {r.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="form-grid">
                  <Field label="Start date">
                    <input
                      name="start"
                      type="date"
                      defaultValue={today()}
                      required
                    />
                  </Field>
                  <Field label="End date (exclusive)">
                    <input
                      name="end"
                      type="date"
                      defaultValue={addDays(today(), 1)}
                      required
                    />
                  </Field>
                </div>
                <Field label="Reason">
                  <textarea name="reason" required maxLength={2000} />
                </Field>
                <p className="muted">
                  Conflicting reservations must be resolved before adding a
                  closure.
                </p>
              </>
            ) : (
              <>
                <Field label="Name">
                  <input
                    name="name"
                    defaultValue={editing?.name}
                    required
                    maxLength={150}
                  />
                </Field>
                <Field label="Unique code">
                  <input
                    name="code"
                    defaultValue={editing?.code}
                    required
                    maxLength={100}
                  />
                </Field>
                {form === "house" ? (
                  <>
                    <Field label="Destination">
                      <input
                        name="destination"
                        defaultValue={h?.destination}
                        required
                      />
                    </Field>
                    <Field label="Timezone">
                      <input
                        name="timezone"
                        defaultValue={h?.timezone ?? "Africa/Juba"}
                        required
                      />
                    </Field>
                    <Field label="Arrival instructions">
                      <textarea
                        name="instructions"
                        defaultValue={h?.instructions}
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Guesthouse">
                      <select
                        name="house"
                        defaultValue={r?.guesthouse_id ?? ""}
                        required
                      >
                        <option value="">Select guesthouse</option>
                        {data.guesthouses.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Allocation mode">
                      <select
                        name="mode"
                        defaultValue={r?.mode ?? "whole_room"}
                      >
                        <option value="whole_room">Whole room</option>
                        <option value="bed">Individual bed</option>
                      </select>
                    </Field>
                    <Field label="Physical room label (for beds)">
                      <input name="physical" defaultValue={r?.physical_room} />
                    </Field>
                  </>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    name="active"
                    defaultChecked={editing?.active ?? true}
                  />
                  Active
                </label>
              </>
            )}
            <button disabled={busy}>
              Save{" "}
              {form === "house"
                ? "guesthouse"
                : form === "block"
                  ? "closure"
                  : "room"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Staff() {
  const { data, call, busy, demo, notify } = useApp();
  const [edit, setEdit] = useState<Profile | null>(null);
  const [invite, setInvite] = useState(false);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await call("set_staff", {
        p_user: edit?.id,
        p_name: f.get("name"),
        p_department: f.get("department"),
        p_role: f.get("role"),
        p_active: f.get("active") === "on",
        p_designate: f.get("designate") === "on",
      });
      setEdit(null);
      notify("Staff access updated.");
    } catch {}
  }
  async function sendInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await call("invite_staff", {
        email: f.get("email"),
        full_name: f.get("name"),
        redirectTo: window.location.origin + window.location.pathname,
      });
      setInvite(false);
      notify("Invitation sent.");
    } catch {}
  }
  return (
    <>
      <PageHeading
        title="Staff access"
        description="Invite staff and manage their permissions. One approver is designated for booking decisions."
        action={
          <button disabled={demo} onClick={() => setInvite(true)}>
            Invite staff
          </button>
        }
      />
      {demo && (
        <p className="notice">
          Sample mode uses fictional accounts. Email invitations are available
          after live setup.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Staff member</th>
              <th>Department</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.profiles.map((u) => (
              <tr key={u.id}>
                <td>
                  {u.full_name}
                  <small>{u.email}</small>
                </td>
                <td>{u.department || "—"}</td>
                <td>
                  {u.role}
                  {data.approver_id === u.id && (
                    <small>Designated approver</small>
                  )}
                </td>
                <td>
                  <Status value={u.active ? "active" : "inactive"} />
                </td>
                <td>
                  <button className="secondary" onClick={() => setEdit(u)}>
                    Edit access
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Modal title="Edit staff access" close={() => setEdit(null)}>
          <form onSubmit={save}>
            <Field label="Full name">
              <input name="name" defaultValue={edit.full_name} required />
            </Field>
            <Field label="Department">
              <input name="department" defaultValue={edit.department} />
            </Field>
            <Field label="Role">
              <select name="role" defaultValue={edit.role}>
                <option>requester</option>
                <option>approver</option>
                <option>admin</option>
              </select>
            </Field>
            <label className="check">
              <input
                type="checkbox"
                name="active"
                defaultChecked={edit.active}
              />
              Active
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="designate"
                defaultChecked={data.approver_id === edit.id}
              />
              Designate as the single approver
            </label>
            <button disabled={busy}>Save access</button>
          </form>
        </Modal>
      )}
      {invite && (
        <Modal title="Invite staff" close={() => setInvite(false)}>
          <form onSubmit={sendInvite}>
            <Field label="Full name">
              <input name="name" required maxLength={150} />
            </Field>
            <Field label="Work email">
              <input name="email" type="email" required />
            </Field>
            <p>
              New staff start as requesters. You can change their role after
              invitation.
            </p>
            <button disabled={busy}>Send invitation</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Calendar() {
  const { data, call, busy, notify, user } = useApp();
  const [house, setHouse] = useState(data.guesthouses[0]?.id ?? "");
  const [start, setStart] = useState(today());
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const rows = data.rooms.filter(
    (r) => r.guesthouse_id === house && r.unit_type === "accommodation",
  );
  return (
    <>
      <PageHeading
        title="Room calendar"
        description="Reservations and closures across the next 14 days. Actual occupancy is tracked below."
      />
      <div className="toolbar">
        <Field label="Guesthouse">
          <select value={house} onChange={(e) => setHouse(e.target.value)}>
            {data.guesthouses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value || today())}
          />
        </Field>
      </div>
      <div className="legend">
        <span className="legend-reserved">Reserved</span>
        <span className="legend-closure">Closure</span>
        <span>Blank = no planned reservation or closure</span>
      </div>
      <div className="table-wrap calendar">
        <table>
          <thead>
            <tr>
              <th>Room</th>
              {days.map((d) => (
                <th key={d}>{displayDate(d)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th>{r.name}</th>
                {days.map((d) => {
                  const block = data.room_blocks.find(
                    (b) =>
                      b.active &&
                      b.room_id === r.id &&
                      overlaps(d, addDays(d, 1), b.start_date, b.end_date),
                  );
                  const a = data.room_allocations.find(
                    (a) =>
                      a.active &&
                      a.room_id === r.id &&
                      !["checked_out", "no_show"].includes(a.movement) &&
                      data.requests.some(
                        (q) =>
                          q.id === a.request_id &&
                          overlaps(d, addDays(d, 1), q.start_date, q.end_date),
                      ),
                  );
                  const q = data.requests.find((q) => q.id === a?.request_id);
                  return (
                    <td
                      key={d}
                      className={
                        block ? "closure-cell" : a ? "reserved-cell" : ""
                      }
                      title={
                        block
                          ? block.reason
                          : q
                            ? "Request #" +
                              q.reference +
                              " · " +
                              data.profiles.find((p) => p.id === q.requester_id)
                                ?.full_name
                            : "No planned allocation"
                      }
                    >
                      {block
                        ? "Closed"
                        : q
                          ? (data.profiles.find((p) => p.id === q.requester_id)
                              ?.full_name ?? "Staff member")
                          : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <Empty>No accommodation rooms in this guesthouse.</Empty>
        )}
      </div>
      <h2 className="section-title">Traveler tracking</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Traveler</th>
              <th>Unit</th>
              <th>Planned dates</th>
              <th>Movement</th>
              {user.role === "admin" && <th>Update</th>}
            </tr>
          </thead>
          <tbody>
            {data.room_allocations
              .filter(
                (a) =>
                  a.active &&
                  data.requests.some(
                    (q) => q.id === a.request_id && q.status === "confirmed",
                  ),
              )
              .map((a) => {
                const q = data.requests.find((q) => q.id === a.request_id)!;
                return (
                  <tr key={a.id}>
                    <td>
                      {
                        data.profiles.find((p) => p.id === q.requester_id)
                          ?.full_name
                      }
                    </td>
                    <td>{data.rooms.find((r) => r.id === a.room_id)?.name}</td>
                    <td>
                      {q.start_date} to {q.end_date}
                    </td>
                    <td>
                      <Status value={a.movement} />
                      {a.movement === "checked_in" && q.end_date <= today() && (
                        <small className="danger-text">
                          Overdue checkout: resolve occupancy
                        </small>
                      )}
                    </td>
                    {user.role === "admin" && (
                      <td>
                        <div className="actions">
                          {(a.movement === "expected"
                            ? ["checked_in", "no_show"]
                            : a.movement === "checked_in"
                              ? ["checked_out"]
                              : a.movement === "on_break"
                                ? ["break_completed"]
                                : []
                          ).map((m) => (
                            <button
                              key={m}
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void call("set_movement", {
                                  p_request: q.id,
                                  p_movement: m,
                                })
                                  .then(() => notify("Movement updated."))
                                  .catch(() => {})
                              }
                            >
                              {m.replaceAll("_", " ")}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </>
  );
}
export function Activity() {
  const { data } = useApp();
  return (
    <>
      <PageHeading
        title="Activity history"
        description="Booking decisions, inventory changes and operational updates."
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Event</th>
              <th>Request</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {[...data.activity_events].reverse().map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.occurred_at).toLocaleString()}</td>
                <td>
                  {data.profiles.find((u) => u.id === e.actor_id)?.full_name ??
                    "System"}
                </td>
                <td>{e.event.replaceAll("_", " ")}</td>
                <td>
                  {data.requests.find((q) => q.id === e.request_id)
                    ?.reference ?? "—"}
                </td>
                <td className="break-word">{e.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.activity_events.length && <Empty>No activity yet.</Empty>}
      </div>
    </>
  );
}
