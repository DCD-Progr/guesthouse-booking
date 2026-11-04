import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import pg from "pg";
const url = process.env.TEST_DATABASE_URL;
let db;
const ids = {
  admin: "00000000-0000-4000-8000-000000000001",
  approver: "00000000-0000-4000-8000-000000000002",
  user: "00000000-0000-4000-8000-000000000003",
  other: "00000000-0000-4000-8000-000000000004",
};
const house = "10000000-0000-4000-8000-000000000001",
  room = "20000000-0000-4000-8000-000000000001",
  room2 = "20000000-0000-4000-8000-000000000002";
const query = async (sql, args = []) => {
  const r = await db.query(sql, args);
  return r.rows;
};
const exec = (sql) => (url ? db.query(sql) : db.exec(sql));
async function as(user, sql, args = []) {
  await exec("begin");
  try {
    await query("select set_config('request.jwt.claim.sub',$1,true)", [
      ids[user],
    ]);
    await exec("set local role authenticated");
    const r = await query(sql, args);
    await exec("commit");
    return r;
  } catch (e) {
    await exec("rollback");
    throw e;
  }
}
let serial = 100;
async function submit(
  user = "user",
  start = "2090-01-01",
  end = "2090-01-05",
  type = "accommodation",
  replace = null,
) {
  return (
    await as(
      user,
      "select public.submit_request($1,$2,$3,$4,'Juba','Work travel','',$5,$6) as id",
      [
        type,
        type === "break" ? null : house,
        start,
        end,
        `00000000-0000-4000-8000-${String(serial++).padStart(12, "0")}`,
        replace,
      ],
    )
  )[0].id;
}
async function approve(id, r = room) {
  return as(
    "approver",
    "select public.decide_request($1,true,$2,'Approved') as id",
    [id, r],
  );
}
before(async () => {
  if (url) {
    db = new pg.Client({ connectionString: url });
    await db.connect();
  } else db = new PGlite({ extensions: { btree_gist } });
  await exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to authenticated;`,
  );
  for (const file of (await fs.readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await exec(await fs.readFile("supabase/migrations/" + file, "utf8"));
  }
  for (const [role, id] of Object.entries(ids)) {
    await query("insert into auth.users(id,email)values($1,$2)", [
      id,
      role + "@example.invalid",
    ]);
    await query(
      "insert into public.profiles(id,email,full_name,role)values($1,$2,$3,$4)",
      [
        id,
        role + "@example.invalid",
        role,
        role === "admin"
          ? "admin"
          : role === "approver"
            ? "approver"
            : "requester",
      ],
    );
  }
  await query("update public.settings set approver_id=$1", [ids.approver]);
  await query(
    "insert into public.guesthouses(id,name,code,destination)values($1,'Juba','JUB','Juba')",
    [house],
  );
  await query(
    "insert into public.rooms(id,guesthouse_id,name,code)values($1,$2,'Room 1','R1'),($3,$2,'Room 2','R2')",
    [room, house, room2],
  );
});
after(async () => {
  if (url) await db.end();
  else await db.close();
});
test("validates migration, boundaries and complete interval availability", async () => {
  const q = await submit();
  await approve(q);
  const a = await as("user", "select * from public.availability($1,$2,$3)", [
    house,
    "2090-01-02",
    "2090-01-04",
  ]);
  assert.equal(Number(a[0].available_count), 1);
  const adjacent = await submit("other", "2090-01-05", "2090-01-08");
  await approve(adjacent);
  await assert.rejects(
    as("user", "select * from public.availability($1,$2,$3)", [
      house,
      "2090-01-04",
      "2090-01-04",
    ]),
    /Departure/,
  );
});
test("overlap rejected without partial approval and confirmation retry is safe", async () => {
  const q = await submit("other", "2090-01-02", "2090-01-04");
  await assert.rejects(approve(q), /no longer available/);
  assert.equal(
    (await query("select status from requests where id=$1", [q]))[0].status,
    "pending",
  );
  assert.equal(
    (await query("select * from room_allocations where request_id=$1", [q]))
      .length,
    0,
  );
  await approve(q, room2);
  const again = await approve(q, room2);
  assert.ok(again[0].id);
  assert.equal(
    (await query("select * from room_allocations where request_id=$1", [q]))
      .length,
    1,
  );
});
test("closures conflict with bookings; available closure excludes room and release restores it", async () => {
  await assert.rejects(
    as(
      "admin",
      "select public.create_block($1,'2090-01-02','2090-01-03','Maintenance')",
      [room],
    ),
    /conflicts/,
  );
  const b = (
    await as(
      "admin",
      "select public.create_block($1,'2090-02-01','2090-02-10','Maintenance') as id",
      [room],
    )
  )[0].id;
  assert.equal(
    Number(
      (
        await as(
          "user",
          "select * from public.availability($1,'2090-02-02','2090-02-03')",
          [house],
        )
      )[0].available_count,
    ),
    1,
  );
  await as("admin", "select public.release_block($1)", [b]);
  assert.equal(
    Number(
      (
        await as(
          "user",
          "select * from public.availability($1,'2090-02-02','2090-02-03')",
          [house],
        )
      )[0].available_count,
    ),
    2,
  );
});
test("different rooms free on different nights is not full-stay availability", async () => {
  await approve(await submit("user", "2090-03-01", "2090-03-03"), room);
  await approve(await submit("other", "2090-03-03", "2090-03-05"), room2);
  assert.equal(
    Number(
      (
        await as(
          "user",
          "select * from public.availability($1,'2090-03-01','2090-03-05')",
          [house],
        )
      )[0].available_count,
    ),
    0,
  );
});
test("RLS isolates travelers and forbids direct approval, role and inventory writes", async () => {
  const visible = await as(
    "user",
    "select distinct requester_id from public.requests",
  );
  assert.deepEqual(
    visible.map((r) => r.requester_id),
    [ids.user],
  );
  for (const sql of [
    "update public.profiles set role='admin'",
    "update public.requests set status='confirmed'",
    "insert into public.guesthouses(name,code,destination)values('Bad','BAD','Bad')",
    "select public.log_event(null,'forged','')",
  ]) {
    await assert.rejects(as("user", sql), /permission denied/);
  }
  await assert.rejects(
    as("user", "select * from public.candidate_rooms($1)", [
      (await query("select id from requests limit 1"))[0].id,
    ]),
    /approver/,
  );
});
test("admin is not implicitly approver; designated approver can approve own requests; rejection needs reason", async () => {
  const q = await submit();
  await assert.rejects(
    as("admin", "select public.decide_request($1,true,$2)", [q, room]),
    /approver/,
  );
  const own = await submit("approver", "2095-01-01", "2095-01-05");
  await assert.rejects(
    as(
      "approver",
      "select public.decide_request($1,false,null,'Own rejection')",
      [own],
    ),
    /own request/,
  );
  await approve(own);
  assert.equal(
    (
      await query("select status,decided_by from requests where id=$1", [own])
    )[0].decided_by,
    ids.approver,
  );
  await assert.rejects(
    as("approver", "select public.decide_request($1,false,null,'')", [q]),
    /reason/,
  );
  await as(
    "approver",
    "select public.decide_request($1,false,null,'Not approved')",
    [q],
  );
});
test("unlimited Break approvals do not occupy rooms and cannot be blocked", async () => {
  const before = Number(
    (await query("select count(*) as n from occupancy_slots"))[0].n,
  );
  await approve(
    await submit("user", "2090-04-01", "2090-04-10", "break"),
    null,
  );
  await approve(
    await submit("other", "2090-04-01", "2090-04-10", "break"),
    null,
  );
  assert.equal(
    Number((await query("select count(*) as n from occupancy_slots"))[0].n),
    before,
  );
  const b = (await query("select id from rooms where unit_type='break'"))[0].id;
  await assert.rejects(
    as(
      "admin",
      "select public.create_block($1,'2090-04-01','2090-04-02','Bad')",
      [b],
    ),
    /accommodation/,
  );
});
test("cancellation releases capacity, retries safely and checks ownership", async () => {
  const q = await submit("user", "2090-05-01", "2090-05-04");
  await approve(q);
  await assert.rejects(
    as("other", "select public.cancel_request($1,'Cancel')", [q]),
    /unavailable/,
  );
  await as("user", "select public.cancel_request($1,'Plans changed')", [q]);
  await as("user", "select public.cancel_request($1,'Plans changed')", [q]);
  assert.equal(
    (
      await query(
        "select * from occupancy_slots s join room_allocations a on a.id=s.allocation_id where a.request_id=$1",
        [q],
      )
    ).length,
    0,
  );
});
test("failed replacement preserves old confirmed allocation and successful replacement swaps atomically", async () => {
  const old = await submit("user", "2090-06-01", "2090-06-04");
  await approve(old);
  await approve(await submit("other", "2090-06-05", "2090-06-08"), room2);
  const replacement = await submit(
    "user",
    "2090-06-02",
    "2090-06-07",
    "accommodation",
    old,
  );
  await assert.rejects(approve(replacement, room2), /no longer available/);
  assert.equal(
    (await query("select status from requests where id=$1", [old]))[0].status,
    "confirmed",
  );
  await approve(replacement, room);
  assert.equal(
    (await query("select status from requests where id=$1", [old]))[0].status,
    "cancelled",
  );
});
test("suspended accounts lose access even with retained JWT identity", async () => {
  await query("update profiles set active=false where id=$1", [ids.other]);
  assert.equal((await as("other", "select * from requests")).length, 0);
  await assert.rejects(submit("other"), /active staff/);
  await query("update profiles set active=true where id=$1", [ids.other]);
});
test("date, guesthouse and original-stay guards reject invalid mutations", async () => {
  await assert.rejects(
    submit("user", "2090-01-04", "2090-01-04"),
    /date range/,
  );
  const q = await submit("user", "2090-07-01", "2090-07-04");
  await assert.rejects(
    approve(q, "20000000-0000-4000-8000-999999999999"),
    /active room/,
  );
  const b = await submit("user", "2090-07-01", "2090-07-04", "break");
  await assert.rejects(
    submit("other", "2090-07-01", "2090-07-04", "accommodation", b),
    /unstarted/,
  );
});
test("overstay guard blocks allocation until actual checkout", async () => {
  const q = await submit("user", "2090-08-01", "2090-08-04");
  await approve(q);
  await query(
    "update room_allocations set movement='checked_in',actual_checkin=now() where request_id=$1",
    [q],
  );
  const future = await submit("other", "2090-09-01", "2090-09-04");
  await assert.rejects(approve(future), /no longer available/);
  await as("admin", "select public.set_movement($1,'checked_out')", [q]);
  await approve(future);
});
test("anonymous users cannot execute booking or read operational tables", async () => {
  await exec("begin");
  try {
    await exec("set local role anon");
    await assert.rejects(
      query("select * from public.requests"),
      /permission denied/,
    );
  } finally {
    await exec("rollback");
  }
  await exec("begin");
  try {
    await exec("set local role anon");
    await assert.rejects(
      query("select * from public.availability($1,'2090-10-01','2090-10-02')", [
        house,
      ]),
      /permission denied/,
    );
  } finally {
    await exec("rollback");
  }
});
