import { useState } from "react";
import { useApp } from "../context";
import type { Request, Room } from "../types";
import { displayDate } from "../dates";
import { Empty, Field, Modal, PageHeading, Status } from "../components/UI";
export function Requests({ approval = false }: { approval?: boolean }) {
  const { data, user, call, busy, notify } = useApp();
  const [selected, setSelected] = useState<Request | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [room, setRoom] = useState("");
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState(approval ? "pending" : "all");
  const [change, setChange] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rows = data.requests
    .filter((q) => approval || q.requester_id === user.id)
    .filter((q) => filter === "all" || q.status === filter)
    .sort((a, b) => b.reference - a.reference);
  async function open(q: Request) {
    setSelected(q);
    setRooms([]);
    setRoom("");
    setComment("");
    setReason("");
    setChange(false);
    setLoaded(false);
    if (
      approval &&
      q.status === "pending" &&
      q.request_type === "accommodation"
    ) {
      try {
        setRooms(await call<Room[]>("candidate_rooms", { p_request: q.id }));
        setLoaded(true);
      } catch {}
    } else setLoaded(true);
  }
  async function decide(approve: boolean) {
    if (!selected) return;
    try {
      await call("decide_request", {
        p_request: selected.id,
        p_approve: approve,
        p_room: room || null,
        p_comment: comment,
      });
      setSelected(null);
      notify(approve ? "Booking confirmed." : "Request rejected.");
    } catch {
      if (selected.request_type === "accommodation") {
        try {
          setRooms(
            await call<Room[]>("candidate_rooms", { p_request: selected.id }),
          );
          setRoom("");
        } catch {}
      }
    }
  }
  async function cancel() {
    if (!selected) return;
    try {
      await call("cancel_request", {
        p_request: selected.id,
        p_reason: reason,
      });
      setSelected(null);
      notify("Request cancelled.");
    } catch {}
  }
  async function replacement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const f = new FormData(e.currentTarget);
    try {
      await call("submit_request", {
        p_type: selected.request_type,
        p_house: selected.request_type === "break" ? null : f.get("house"),
        p_start: f.get("start"),
        p_end: f.get("end"),
        p_destination: selected.destination,
        p_purpose: f.get("purpose"),
        p_requirements: selected.requirements,
        p_token: crypto.randomUUID(),
        p_replaces: selected.id,
      });
      setSelected(null);
      notify(
        "Change request submitted. Your original booking stays confirmed until approval.",
      );
    } catch {}
  }
  return (
    <>
      <PageHeading
        title={approval ? "Approvals" : "My requests"}
        description={
          approval
            ? "Review requests and assign an available room."
            : "Track your requests, room assignments and decisions."
        }
      />
      <div className="toolbar">
        <Field label="Status">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["all", "pending", "confirmed", "rejected", "cancelled"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
        </Field>
        <span>{rows.length} requests</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Request</th>
              {approval && <th>Traveler</th>}
              <th>Guesthouse</th>
              <th>Stay</th>
              <th>Status</th>
              <th>Assigned room</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => {
              const a = data.room_allocations.find(
                (a) => a.request_id === q.id,
              );
              return (
                <tr key={q.id}>
                  <td>
                    #{String(q.reference).padStart(4, "0")}
                    {q.replaces_id && <small>Change request</small>}
                  </td>
                  {approval && (
                    <td>
                      {data.profiles.find((u) => u.id === q.requester_id)
                        ?.full_name ?? "Staff member"}
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
                  <td>
                    {data.rooms.find((r) => r.id === a?.room_id)?.name ??
                      "Awaiting assignment"}
                  </td>
                  <td>
                    <button className="secondary" onClick={() => void open(q)}>
                      View request
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <Empty>No requests match this status.</Empty>}
      </div>
      {selected && (
        <Modal
          title={"Request #" + String(selected.reference).padStart(4, "0")}
          close={() => setSelected(null)}
        >
          <div className="detail-grid">
            <div>
              <small>Traveler</small>
              <p>
                {
                  data.profiles.find((u) => u.id === selected.requester_id)
                    ?.full_name
                }
              </p>
            </div>
            <div>
              <small>Status</small>
              <p>
                <Status value={selected.status} />
              </p>
            </div>
            <div>
              <small>Stay</small>
              <p>
                {selected.start_date} to {selected.end_date}
              </p>
            </div>
            <div>
              <small>Guesthouse</small>
              <p>
                {selected.request_type === "break"
                  ? "Break"
                  : data.guesthouses.find(
                      (h) => h.id === selected.guesthouse_id,
                    )?.name}
              </p>
            </div>
          </div>
          <h3>Purpose</h3>
          <p className="prewrap">{selected.purpose}</p>
          {selected.requirements && (
            <>
              <h3>Requirements</h3>
              <p className="prewrap">{selected.requirements}</p>
            </>
          )}
          {selected.decision_comment && (
            <>
              <h3>Decision comments</h3>
              <p className="prewrap">{selected.decision_comment}</p>
            </>
          )}
          {approval && selected.status === "pending" && (
            <>
              <hr />
              {selected.request_type === "accommodation" && (
                <Field label="Available room for the entire stay">
                  <select
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    required
                  >
                    <option value="">
                      {!loaded
                        ? "Loading rooms…"
                        : rooms.length
                          ? "Select a room"
                          : "No rooms available"}
                    </option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.code}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Decision comments (required for rejection)">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={2000}
                />
              </Field>
              <div className="actions">
                <button
                  disabled={
                    busy ||
                    !loaded ||
                    (selected.request_type === "accommodation" && !room)
                  }
                  onClick={() => void decide(true)}
                >
                  Approve and confirm
                </button>
                <button
                  className="danger"
                  disabled={
                    busy || !comment.trim() || selected.requester_id === user.id
                  }
                  onClick={() => void decide(false)}
                >
                  Reject request
                </button>
              </div>
              <p className="muted">
                Availability is checked again when you confirm.
              </p>
            </>
          )}
          {!approval && ["pending", "confirmed"].includes(selected.status) && (
            <>
              <hr />
              <Field label="Cancellation reason">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                />
              </Field>
              <button
                className="danger"
                disabled={busy || !reason.trim()}
                onClick={() => void cancel()}
              >
                Cancel request
              </button>
              {selected.status === "confirmed" && (
                <button
                  className="secondary"
                  onClick={() => setChange(!change)}
                >
                  Request a change
                </button>
              )}
              {change && (
                <form className="change-form" onSubmit={replacement}>
                  <h3>Change dates or guesthouse</h3>
                  <p>
                    Your original booking remains until a replacement is
                    approved.
                  </p>
                  {selected.request_type === "accommodation" && (
                    <Field label="Guesthouse">
                      <select
                        name="house"
                        defaultValue={selected.guesthouse_id ?? ""}
                      >
                        {data.guesthouses
                          .filter((h) => h.active)
                          .map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  <div className="form-grid">
                    <Field label="Start date">
                      <input
                        name="start"
                        type="date"
                        defaultValue={selected.start_date}
                        required
                      />
                    </Field>
                    <Field label="End date">
                      <input
                        name="end"
                        type="date"
                        defaultValue={selected.end_date}
                        required
                      />
                    </Field>
                  </div>
                  <Field label="Reason for change">
                    <textarea name="purpose" required maxLength={2000} />
                  </Field>
                  <button disabled={busy}>Submit change request</button>
                </form>
              )}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
