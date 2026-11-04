import { useRef, useState } from "react";
import { useApp } from "../context";
import { today, addDays } from "../dates";
import { Field, Modal, PageHeading } from "../components/UI";
export function Availability() {
  const { data, call, busy, notify } = useApp();
  const [house, setHouse] = useState(
    data.guesthouses.find((h) => h.active)?.id ?? "",
  );
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(addDays(today(), 3));
  const [result, setResult] = useState<number | null>(null);
  const [modal, setModal] = useState(false);
  const [breakMode, setBreakMode] = useState(false);
  const token = useRef(crypto.randomUUID());
  const searchVersion = useRef(0);
  const valid = Boolean(
    house && start && end && end > start && start >= today(),
  );
  const reset = () => {
    searchVersion.current++;
    setResult(null);
  };
  async function check() {
    const version = ++searchVersion.current;
    setResult(null);
    try {
      const r = await call<{ available_count: number }[]>("availability", {
        p_house: house,
        p_start: start,
        p_end: end,
      });
      if (version === searchVersion.current)
        setResult(Number(r[0]?.available_count ?? 0));
    } catch {
      /* App displays errors */
    }
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await call("submit_request", {
        p_type: breakMode ? "break" : "accommodation",
        p_house: breakMode ? null : house,
        p_start: start,
        p_end: end,
        p_destination: breakMode
          ? String(f.get("destination") ?? "")
          : (data.guesthouses.find((h) => h.id === house)?.destination ?? ""),
        p_purpose: f.get("purpose"),
        p_requirements: f.get("requirements"),
        p_token: token.current,
        p_replaces: null,
      });
      token.current = crypto.randomUUID();
      setModal(false);
      setResult(null);
      notify("Request submitted. Your approver will review it.");
    } catch {
      /* preserve form */
    }
  }
  return (
    <>
      <PageHeading
        title="Room availability"
        description="Find a room for your entire stay."
        action={
          <button
            className="secondary"
            onClick={() => {
              setBreakMode(true);
              setModal(true);
            }}
          >
            Request Break
          </button>
        }
      />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <Field label="Guesthouse">
          <select
            value={house}
            onChange={(e) => {
              setHouse(e.target.value);
              reset();
            }}
            required
          >
            <option value="">Select guesthouse</option>
            {data.guesthouses
              .filter((h) => h.active)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Arrival date">
          <input
            type="date"
            min={today()}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              reset();
            }}
            required
          />
        </Field>
        <Field label="Departure date">
          <input
            type="date"
            min={addDays(start || today(), 1)}
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              reset();
            }}
            required
          />
        </Field>
        <button disabled={busy || !valid}>Check availability</button>
      </form>
      {result !== null ? (
        <section className="results" aria-live="polite">
          <h2 className={result ? "teal" : "danger-text"}>
            {result} {result === 1 ? "room" : "rooms"} available
          </h2>
          <p>
            Your approver will select the room. Availability is checked again at
            confirmation.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Guesthouse</th>
                  <th>Destination</th>
                  <th>Available for full stay</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{data.guesthouses.find((h) => h.id === house)?.name}</td>
                  <td>
                    {data.guesthouses.find((h) => h.id === house)?.destination}
                  </td>
                  <td>{result} available</td>
                  <td>
                    <button
                      disabled={!result || busy}
                      onClick={() => {
                        setBreakMode(false);
                        setModal(true);
                      }}
                    >
                      Request accommodation
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="search-hint">
          Choose a guesthouse and dates to check availability. Pending requests
          do not reserve a room.
        </p>
      )}
      <section className="how">
        <h2>How booking works</h2>
        <div className="steps">
          {[
            [
              "Select your stay",
              "Choose the guesthouse and your arrival and departure dates, then check availability.",
            ],
            ["Submit a request", "Request accommodation for your entire stay."],
            [
              "Approver assigns a room",
              "Your approver will review the request and assign a room, then confirm your booking.",
            ],
          ].map(([t, d], i) => (
            <div key={t}>
              <h3>
                <span>{i + 1}</span>
                {t}
              </h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>
      {modal && (
        <Modal
          title={breakMode ? "Request Break" : "Request accommodation"}
          close={() => setModal(false)}
        >
          <form onSubmit={submit}>
            <p>
              {breakMode
                ? "Break does not reserve accommodation."
                : data.guesthouses.find((h) => h.id === house)?.name}
            </p>
            <div className="form-grid">
              <Field label="Arrival / start">
                <input
                  type="date"
                  value={start}
                  min={today()}
                  onChange={(e) => {
                    setStart(e.target.value);
                    reset();
                  }}
                  required
                />
              </Field>
              <Field label="Departure / end">
                <input
                  type="date"
                  value={end}
                  min={addDays(start || today(), 1)}
                  onChange={(e) => {
                    setEnd(e.target.value);
                    reset();
                  }}
                  required
                />
              </Field>
            </div>
            {breakMode && (
              <Field label="Destination">
                <input name="destination" maxLength={300} />
              </Field>
            )}
            <Field label="Purpose">
              <textarea autoFocus name="purpose" required maxLength={2000} />
            </Field>
            <Field label="Requirements (optional)">
              <textarea
                name="requirements"
                maxLength={2000}
                placeholder="Practical accommodation needs. Avoid sensitive personal details."
              />
            </Field>
            <p className="muted">
              Submission creates a pending request. It does not confirm a room.
            </p>
            <button disabled={busy || end <= start || start < today()}>
              Submit request
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
