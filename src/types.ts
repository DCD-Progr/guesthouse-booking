export type Role = "requester" | "approver" | "admin";
export type Profile = {
  id: string;
  full_name: string;
  email: string;
  department: string;
  role: Role;
  active: boolean;
};
export type House = {
  id: string;
  name: string;
  code: string;
  destination: string;
  timezone: string;
  active: boolean;
  instructions: string;
};
export type Room = {
  id: string;
  name: string;
  code: string;
  guesthouse_id: string | null;
  unit_type: "accommodation" | "break";
  mode: string;
  physical_room: string;
  active: boolean;
};
export type Request = {
  id: string;
  reference: number;
  requester_id: string;
  request_type: "accommodation" | "break";
  guesthouse_id: string | null;
  start_date: string;
  end_date: string;
  destination: string;
  purpose: string;
  requirements: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
  submitted_at: string;
  decision_comment: string;
  replaces_id: string | null;
};
export type Allocation = {
  id: string;
  request_id: string;
  room_id: string;
  active: boolean;
  movement: string;
  actual_checkin: string | null;
  actual_checkout: string | null;
};
export type Block = {
  id: string;
  room_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  active: boolean;
};
export type Event = {
  id: number;
  actor_id: string;
  request_id: string | null;
  event: string;
  detail: string;
  occurred_at: string;
};
export type Data = {
  profiles: Profile[];
  guesthouses: House[];
  rooms: Room[];
  requests: Request[];
  room_allocations: Allocation[];
  room_blocks: Block[];
  activity_events: Event[];
  approver_id: string | null;
};
export type RpcArgs = Record<string, unknown>;
export type Page =
  | "Overview"
  | "Availability"
  | "My requests"
  | "Approvals"
  | "Calendar"
  | "Inventory"
  | "Staff"
  | "Activity";
