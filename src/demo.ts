// Explicit, volatile sample environment. Never used as a live booking backend.
import type { Data, Profile, Room, RpcArgs } from "./types";
import { today, addDays, overlaps } from "./dates";
const base = today();
export const demoUsers: Profile[] = [
  {
    id: "requester",
    full_name: "Sample traveler",
    email: "traveler@example.invalid",
    department: "Programmes",
    role: "requester",
    active: true,
  },
  {
    id: "approver",
    full_name: "Sample approver",
    email: "approver@example.invalid",
    department: "Operations",
    role: "approver",
    active: true,
  },
  {
    id: "admin",
    full_name: "Sample administrator",
    email: "admin@example.invalid",
    department: "Operations",
    role: "admin",
    active: true,
  },
];
export function demoData(): Data {
  return {
    profiles: structuredClone(demoUsers),
    approver_id: "approver",
    guesthouses: [
      {
        id: "juba",
        name: "Juba Guesthouse",
        code: "JUB",
        destination: "Juba",
        timezone: "Africa/Juba",
        active: true,
        instructions: "Contact the guesthouse focal point before arrival.",
      },
      {
        id: "bor",
        name: "Bor Guesthouse",
        code: "BOR",
        destination: "Bor",
        timezone: "Africa/Juba",
        active: true,
        instructions: "",
      },
    ],
    rooms: [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: "j" + i,
        name: "Room " + (i + 1),
        code: "JUB-0" + (i + 1),
        guesthouse_id: "juba",
        unit_type: "accommodation" as const,
        mode: "whole_room",
        physical_room: "",
        active: true,
      })),
      {
        id: "b1",
        name: "Room 1",
        code: "BOR-01",
        guesthouse_id: "bor",
        unit_type: "accommodation",
        mode: "whole_room",
        physical_room: "",
        active: true,
      },
      {
        id: "break",
        name: "Break",
        code: "BREAK",
        guesthouse_id: null,
        unit_type: "break",
        mode: "unlimited",
        physical_room: "",
        active: true,
      },
    ],
    requests: [],
    room_allocations: [],
    room_blocks: [
      {
        id: "sample-block",
        room_id: "j3",
        start_date: base,
        end_date: addDays(base, 14),
        reason: "Sample maintenance closure",
        active: true,
      },
    ],
    activity_events: [],
  };
}
export function free(
  d: Data,
  r: Room,
  start: string,
  end: string,
  except: string | null = null,
) {
  return (
    r.active &&
    d.guesthouses.some((h) => h.id === r.guesthouse_id && h.active) &&
    !d.room_blocks.some(
      (b) =>
        b.active &&
        b.room_id === r.id &&
        overlaps(start, end, b.start_date, b.end_date),
    ) &&
    !d.room_allocations.some(
      (a) =>
        a.active &&
        a.room_id === r.id &&
        a.request_id !== except &&
        d.requests.some(
          (q) =>
            q.id === a.request_id &&
            ((a.movement === "checked_in" && !a.actual_checkout) ||
              overlaps(start, end, q.start_date, q.end_date)),
        ),
    )
  );
}
export function demoRpc(
  data: Data,
  user: Profile,
  name: string,
  p: RpcArgs,
): { data: Data; value: unknown } {
  const d = structuredClone(data);
  const id = () => crypto.randomUUID();
  const s = (k: string) => String(p[k] ?? "");
  let value: unknown = null;
  const admin = () => {
    if (user.role !== "admin")
      throw new Error("Administrator access required.");
  };
  const log = (event: string, request_id: string | null, detail = "") =>
    d.activity_events.push({
      id: d.activity_events.length + 1,
      actor_id: user.id,
      request_id,
      event,
      detail,
      occurred_at: new Date().toISOString(),
    });
  if (name === "availability")
    return {
      data: d,
      value: [
        {
          guesthouse_id: p.p_house,
          available_count: d.rooms.filter(
            (r) =>
              r.guesthouse_id === p.p_house &&
              free(d, r, s("p_start"), s("p_end")),
          ).length,
        },
      ],
    };
  if (name === "candidate_rooms") {
    const q = d.requests.find((q) => q.id === p.p_request);
    return {
      data: d,
      value: q
        ? d.rooms.filter(
            (r) =>
              r.guesthouse_id === q.guesthouse_id &&
              free(d, r, q.start_date, q.end_date, q.replaces_id),
          )
        : [],
    };
  }
  if (name === "submit_request") {
    if (
      s("p_end") <= s("p_start") ||
      s("p_start") < today() ||
      !s("p_purpose").trim()
    )
      throw new Error("Check your dates and purpose.");
    const existing = d.requests.find((q) => q.id === p.p_token);
    if (existing) return { data: d, value: existing.id };
    value = s("p_token");
    d.requests.push({
      id: String(value),
      reference: d.requests.length + 1,
      requester_id: user.id,
      request_type: s("p_type") as "accommodation" | "break",
      guesthouse_id: p.p_type === "break" ? null : s("p_house"),
      start_date: s("p_start"),
      end_date: s("p_end"),
      destination: s("p_destination"),
      purpose: s("p_purpose"),
      requirements: s("p_requirements"),
      status: "pending",
      submitted_at: new Date().toISOString(),
      decision_comment: "",
      replaces_id: p.p_replaces ? String(p.p_replaces) : null,
    });
    log("submitted", String(value));
  } else if (name === "decide_request") {
    if (d.approver_id !== user.id)
      throw new Error("Designated approver required.");
    const q = d.requests.find((q) => q.id === p.p_request);
    if (!q || q.status !== "pending")
      throw new Error("Request is no longer pending.");
    if (q.requester_id === user.id && !p.p_approve)
      throw new Error("You cannot reject your own request. Cancel it instead.");
    if (!p.p_approve) {
      if (!s("p_comment").trim())
        throw new Error("Give a reason for rejection.");
      q.status = "rejected";
      q.decision_comment = s("p_comment");
      log("rejected", q.id);
    } else {
      const r = d.rooms.find((r) =>
        q.request_type === "break"
          ? r.unit_type === "break"
          : r.id === p.p_room && r.guesthouse_id === q.guesthouse_id,
      );
      if (
        !r ||
        (q.request_type !== "break" &&
          !free(d, r, q.start_date, q.end_date, q.replaces_id))
      )
        throw new Error("Room no longer available.");
      if (q.replaces_id) {
        const old = d.requests.find((x) => x.id === q.replaces_id);
        if (!old || old.status !== "confirmed")
          throw new Error("Original stay unavailable.");
        old.status = "cancelled";
        d.room_allocations
          .filter((a) => a.request_id === old.id)
          .forEach((a) => {
            a.active = false;
            a.movement = "cancelled";
          });
      }
      q.status = "confirmed";
      d.room_allocations.push({
        id: id(),
        request_id: q.id,
        room_id: r.id,
        active: true,
        movement: q.request_type === "break" ? "on_break" : "expected",
        actual_checkin: null,
        actual_checkout: null,
      });
      log("confirmed", q.id);
    }
  } else if (name === "cancel_request") {
    const q = d.requests.find(
      (q) =>
        q.id === p.p_request &&
        (q.requester_id === user.id || user.role === "admin"),
    );
    if (!q || !s("p_reason").trim())
      throw new Error("Request and cancellation reason required.");
    if (
      d.room_allocations.some(
        (a) =>
          a.request_id === q.id &&
          ["checked_in", "checked_out", "break_completed"].includes(a.movement),
      )
    )
      throw new Error("Contact the administrator to close this stay.");
    q.status = "cancelled";
    d.room_allocations
      .filter((a) => a.request_id === q.id)
      .forEach((a) => {
        a.active = false;
        a.movement = "cancelled";
      });
    log("cancelled", q.id, s("p_reason"));
  } else if (name === "save_guesthouse") {
    admin();
    const h = {
      id: p.p_id ? String(p.p_id) : id(),
      name: s("p_name"),
      code: s("p_code"),
      destination: s("p_destination"),
      timezone: s("p_timezone"),
      active: Boolean(p.p_active),
      instructions: s("p_instructions"),
    };
    d.guesthouses = d.guesthouses.filter((x) => x.id !== h.id).concat(h);
    log("guesthouse_saved", null);
  } else if (name === "save_room") {
    admin();
    const r: Room = {
      id: p.p_id ? String(p.p_id) : id(),
      guesthouse_id: s("p_house"),
      name: s("p_name"),
      code: s("p_code"),
      mode: s("p_mode"),
      physical_room: s("p_physical"),
      active: Boolean(p.p_active),
      unit_type: "accommodation",
    };
    d.rooms = d.rooms.filter((x) => x.id !== r.id).concat(r);
    log("room_saved", null);
  } else if (name === "create_block") {
    admin();
    const r = d.rooms.find(
      (r) => r.id === p.p_room && r.unit_type === "accommodation",
    );
    if (!r || !free(d, r, s("p_start"), s("p_end")))
      throw new Error("Closure conflicts with a stay or closure.");
    d.room_blocks.push({
      id: id(),
      room_id: r.id,
      start_date: s("p_start"),
      end_date: s("p_end"),
      reason: s("p_reason"),
      active: true,
    });
    log("closure_created", null);
  } else if (name === "release_block") {
    admin();
    const b = d.room_blocks.find((b) => b.id === p.p_block);
    if (b) b.active = false;
    log("closure_released", null);
  } else if (name === "set_movement") {
    admin();
    const a = d.room_allocations.find((a) => a.request_id === p.p_request);
    if (!a) throw new Error("Stay not found.");
    a.movement = s("p_movement");
    if (a.movement === "checked_in")
      a.actual_checkin = new Date().toISOString();
    if (["checked_out", "break_completed"].includes(a.movement)) {
      a.actual_checkout = new Date().toISOString();
      a.active = false;
    }
    log(a.movement, a.request_id);
  } else if (name === "set_staff") {
    admin();
    const u = d.profiles.find((x) => x.id === p.p_user);
    if (!u) throw new Error("Staff not found.");
    if (u.id === user.id && (!p.p_active || p.p_role !== "admin"))
      throw new Error("Cannot remove your own admin access.");
    Object.assign(u, {
      full_name: s("p_name"),
      department: s("p_department"),
      role: s("p_role"),
      active: Boolean(p.p_active),
    });
    if (p.p_designate) d.approver_id = u.id;
    log("staff_updated", null);
  } else throw new Error("Unknown operation.");
  return { data: d, value };
}
