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
  const q = await submit("user", "2096-01-01", "2096-01-05");
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
  await as(
    "approver",
    "select public.cancel_request($1,'Self-approval test complete')",
    [own],
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
  const b = await submit("user", "2090-07-05", "2090-07-08", "break");
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

test("all operational tables have RLS and all relationships are enforced", async () => {
  const tables = await query(
    "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'",
  );
  assert.equal(tables.length, 9);
  assert.ok(tables.every((t) => t.relrowsecurity));
  await assert.rejects(
    query(
      "insert into rooms(name,code,guesthouse_id) values('Orphan','ORPHAN',gen_random_uuid())",
    ),
    /foreign key/,
  );
  await assert.rejects(
    query(
      "insert into room_allocations(request_id,room_id)values(gen_random_uuid(),$1)",
      [room],
    ),
    /foreign key/,
  );
  await assert.rejects(
    query(
      "insert into rooms(name,code,unit_type,mode)values('Another Break','SECOND_BREAK','break','unlimited')",
    ),
    /unique/,
  );
});
test("every administrative RPC rejects requester and non-designated approver writes", async () => {
  const calls = [
    [
      "save_guesthouse",
      "select save_guesthouse(null,'Test','TEST','Test','Africa/Juba',true,'')",
      [],
    ],
    [
      "save_room",
      "select save_room(null,$1,'Test','TEST','whole_room','',true)",
      [house],
    ],
    [
      "create_block",
      "select create_block($1,'2098-01-01','2098-01-02','Test')",
      [room],
    ],
    ["release_block", "select release_block(gen_random_uuid())", []],
    [
      "set_movement",
      "select set_movement(gen_random_uuid(),'checked_out')",
      [],
    ],
    [
      "set_staff",
      "select set_staff($1,'Test','','admin',true,true)",
      [ids.user],
    ],
    [
      "provision_invited_staff",
      "select provision_invited_staff($1,'Test')",
      [ids.user],
    ],
  ];
  for (const user of ["user", "approver"])
    for (const [name, sql, args] of calls)
      await assert.rejects(
        as(user, sql, args),
        /Administrator/,
        `${user} must not call ${name}`,
      );
});
test("staff designation supports explicit removal and live handover", async () => {
  await as(
    "admin",
    "select set_staff($1,'approver','','approver',true,false)",
    [ids.approver],
  );
  assert.equal((await as("approver", "select is_approver() ok"))[0].ok, false);
  await as("admin", "select set_staff($1,'admin','','admin',true,true)", [
    ids.admin,
  ]);
  assert.equal((await as("admin", "select is_approver() ok"))[0].ok, true);
  await assert.rejects(
    as("admin", "select set_staff($1,'admin','','requester',true,false)", [
      ids.admin,
    ]),
    /own admin/,
  );
  await assert.rejects(
    as("admin", "select set_staff($1,'user','','requester',true,true)", [
      ids.user,
    ]),
    /authorized/,
  );
  await as("admin", "select set_staff($1,'approver','','approver',true,true)", [
    ids.approver,
  ]);
  assert.equal((await as("admin", "select is_approver() ok"))[0].ok, false);
});
test("inventory RPCs reject blank fields, invalid timezone and duplicate codes", async () => {
  for (const name of ["", "   ", null]) {
    await assert.rejects(
      as(
        "admin",
        "select save_guesthouse(null,$1,'TEST','Test','Africa/Juba',true,'')",
        [name],
      ),
      /name/,
    );
    await assert.rejects(
      as("admin", "select save_room(null,$1,$2,'TEST','whole_room','',true)", [
        house,
        name,
      ]),
      /name/,
    );
  }
  await assert.rejects(
    as(
      "admin",
      "select save_guesthouse(null,'Test','TEST','Test','Not/AZone',true,'')",
    ),
    /timezone/,
  );
  await assert.rejects(
    as("admin", "select save_room(null,$1,'Test','R1','whole_room','',true)", [
      house,
    ]),
    /unique/,
  );
  const b = (await query("select id from rooms where unit_type='break'"))[0].id;
  await assert.rejects(
    as(
      "admin",
      "select save_room($1,$2,'Break','BREAK','whole_room','',false)",
      [b, house],
    ),
    /protected/,
  );
  await assert.rejects(
    as(
      "admin",
      "select save_room($1,gen_random_uuid(),'Moved','R1','whole_room','',true)",
      [room],
    ),
    /history/,
  );
});
test("inactive guesthouse or room cannot be assigned, candidates exclude them", async () => {
  const q = await submit("user", "2097-01-01", "2097-01-04");
  await query("update rooms set active=false where id=$1", [room]);
  assert.ok(
    !(await as("approver", "select * from candidate_rooms($1)", [q])).some(
      (r) => r.id === room,
    ),
  );
  await assert.rejects(approve(q), /active room/);
  await query("update rooms set active=true where id=$1", [room]);
  await query("update guesthouses set active=false where id=$1", [house]);
  assert.equal(
    (
      await as(
        "user",
        "select * from availability($1,'2097-01-01','2097-01-04')",
        [house],
      )
    ).length,
    0,
  );
  await assert.rejects(approve(q), /active room/);
  await assert.rejects(
    submit("user", "2097-01-01", "2097-01-04"),
    /active guesthouse/,
  );
  await query("update guesthouses set active=true where id=$1", [house]);
});
test("submission retry is idempotent and token cannot be reused by another requester", async () => {
  const token = "99999999-0000-4000-8000-000000000001";
  const sql =
    "select submit_request('break',null,'2097-02-01','2097-02-03','','Rest','',$1,null) id";
  const a = await as("user", sql, [token]),
    b = await as("user", sql, [token]);
  assert.equal(a[0].id, b[0].id);
  await assert.rejects(as("other", sql, [token]), /unique/);
});
test("rejected, cancelled and null decisions cannot create room allocations", async () => {
  const q = await submit("user", "2097-03-01", "2097-03-03");
  await assert.rejects(
    as("approver", "select decide_request($1,null,$2)", [q, room]),
    /decision/,
  );
  await as("approver", "select decide_request($1,false,null,'Declined')", [q]);
  await assert.rejects(approve(q), /pending/);
  const c = await submit("user", "2097-03-01", "2097-03-03");
  await as("user", "select cancel_request($1,'Changed')", [c]);
  await assert.rejects(approve(c), /pending/);
  assert.equal(
    (
      await query(
        "select * from room_allocations where request_id in ($1,$2)",
        [q, c],
      )
    ).length,
    0,
  );
});
test("checked-in, checkout and no-show state transitions release capacity correctly", async () => {
  const date = (
    await query("select (now() at time zone 'Africa/Juba')::date::text d")
  )[0].d;
  const end = (await query("select ($1::date+2)::text d", [date]))[0].d;
  const q = await submit("user", date, end);
  await approve(q, room2);
  await assert.rejects(
    as("admin", "select set_movement($1,'checked_out')", [q]),
    /transition/,
  );
  await as("admin", "select set_movement($1,'checked_in')", [q]);
  await as("admin", "select set_movement($1,'checked_in')", [q]);
  await assert.rejects(
    as("user", "select cancel_request($1,'Cancel')", [q]),
    /active or completed/,
  );
  await as("admin", "select set_movement($1,'checked_out')", [q]);
  assert.equal(
    (
      await query(
        "select * from occupancy_slots s join room_allocations a on a.id=s.allocation_id where a.request_id=$1",
        [q],
      )
    ).length,
    0,
  );
  const no = await submit("other", date, end);
  await approve(no, room2);
  await as("admin", "select set_movement($1,'no_show')", [no]);
  assert.equal(
    (
      await query(
        "select * from occupancy_slots s join room_allocations a on a.id=s.allocation_id where a.request_id=$1",
        [no],
      )
    ).length,
    0,
  );
});
test("future check-in, no-show and Break completion are rejected", async () => {
  const q = await submit("user", "2097-04-01", "2097-04-03");
  await approve(q, room2);
  for (const m of ["checked_in", "no_show", "invalid"])
    await assert.rejects(
      as("admin", "select set_movement($1,$2)", [q, m]),
      /within|transition/,
    );
  const b = await submit("other", "2097-04-01", "2097-04-03", "break");
  await approve(b, null);
  await assert.rejects(
    as("admin", "select set_movement($1,'break_completed')", [b]),
    /transition/,
  );
  await as("user", "select cancel_request($1,'Test cleanup')", [q]);
  await as("other", "select cancel_request($1,'Test cleanup')", [b]);
});
test("replacement rejection and duplicate change preserve original booking", async () => {
  const old = await submit("user", "2097-05-01", "2097-05-04");
  await approve(old, room2);
  const next = await submit(
    "user",
    "2097-05-02",
    "2097-05-06",
    "accommodation",
    old,
  );
  await assert.rejects(
    submit("user", "2097-05-02", "2097-05-06", "accommodation", old),
    /already pending/,
  );
  await as("approver", "select decide_request($1,false,null,'Cannot change')", [
    next,
  ]);
  assert.equal(
    (await query("select status from requests where id=$1", [old]))[0].status,
    "confirmed",
  );
  assert.equal(
    (
      await query(
        "select count(*)::int n from occupancy_slots s join room_allocations a on a.id=s.allocation_id where a.request_id=$1",
        [old],
      )
    )[0].n,
    1,
  );
  await as("user", "select cancel_request($1,'Cleanup')", [old]);
});
test("availability agrees with an independent interval oracle for 120 date ranges", async () => {
  const h = (
    await query(
      "insert into guesthouses(name,code,destination)values('Oracle','ORACLE','Test')returning id",
    )
  )[0].id;
  const ids2 = [];
  for (let i = 0; i < 4; i++)
    ids2.push(
      (
        await query(
          "insert into rooms(name,code,guesthouse_id)values($1,$2,$3)returning id",
          ["Oracle " + i, "ORACLE-" + i, h],
        )
      )[0].id,
    );
  const blocks = [
    [0, 2, 6],
    [0, 10, 14],
    [1, 0, 3],
    [1, 8, 12],
    [2, 5, 10],
    [3, 14, 18],
  ];
  const d = (n) =>
    new Date(Date.UTC(2098, 0, 1 + n)).toISOString().slice(0, 10);
  for (const [r, a, b] of blocks)
    await as("admin", "select create_block($1,$2,$3,'Oracle')", [
      ids2[r],
      d(a),
      d(b),
    ]);
  for (let i = 0; i < 120; i++) {
    const a = i % 20,
      b = a + 1 + (i % 7);
    const expected = ids2.filter(
      (_, r) => !blocks.some(([rr, x, y]) => rr === r && a < y && b > x),
    ).length;
    const actual = await as("user", "select * from availability($1,$2,$3)", [
      h,
      d(a),
      d(b),
    ]);
    assert.equal(
      Number(actual[0].available_count),
      expected,
      `${d(a)} to ${d(b)}`,
    );
  }
});
test("all final allocations, slots and decisions satisfy integrity invariants", async () => {
  const checks = [
    "select * from occupancy_slots a join occupancy_slots b on a.id<b.id and a.room_id=b.room_id and a.stay&&b.stay",
    "select q.id from requests q where status='confirmed' and not exists(select 1 from room_allocations a where a.request_id=q.id and a.active)",
    "select a.id from room_allocations a join requests q on q.id=a.request_id join rooms r on r.id=a.room_id where q.request_type='accommodation' and r.guesthouse_id<>q.guesthouse_id",
    "select q.id from requests q where status in ('confirmed','rejected') and (decided_at is null or decided_by is null)",
  ];
  for (const sql of checks) assert.equal((await query(sql)).length, 0, sql);
});

test("same staff cannot overlap rooms and Break in either direction, including pending requests", async () => {
  const roomRequest = await submit("user", "2100-01-01", "2100-01-05");
  await assert.rejects(
    submit("user", "2100-01-02", "2100-01-04", "break"),
    /overlapping/,
  );
  await assert.rejects(
    submit("user", "2100-01-02", "2100-01-04"),
    /overlapping/,
  );
  await approve(roomRequest, room);
  await assert.rejects(
    submit("user", "2100-01-04", "2100-01-06", "break"),
    /overlapping/,
  );
  const adjacent = await submit("user", "2100-01-05", "2100-01-07", "break");
  await approve(adjacent, null);
  await assert.rejects(
    submit("user", "2100-01-06", "2100-01-08"),
    /overlapping/,
  );
  await as("user", "select cancel_request($1,'Change plans')", [roomRequest]);
  await submit("user", "2100-01-01", "2100-01-05", "break");
});
test("overlap across guesthouses is prevented and explicit replacement remains possible", async () => {
  const old = await submit("other", "2100-02-01", "2100-02-05");
  await approve(old, room2);
  const h = (await query("select id from guesthouses where code='ORACLE'"))[0]
    .id;
  await assert.rejects(
    as(
      "other",
      "select submit_request('accommodation',$1,'2100-02-02','2100-02-04','','Test','',gen_random_uuid(),null)",
      [h],
    ),
    /overlapping/,
  );
  const change = await submit(
    "other",
    "2100-02-02",
    "2100-02-06",
    "accommodation",
    old,
  );
  await approve(change, room2);
  assert.equal(
    (await query("select status from requests where id=$1", [old]))[0].status,
    "cancelled",
  );
});
test("approval rejects legacy conflicting requests without altering either request", async () => {
  const first = await submit("admin", "2100-03-01", "2100-03-05", "break");
  // Simulate a record imported before the guard existed, only in the isolated test database.
  await query(
    "alter table public.requests disable trigger staff_commitments_guard",
  );
  let second;
  try {
    second = (
      await query(
        "insert into requests(requester_id,request_type,start_date,end_date,purpose,client_token)values($1,'break','2100-03-02','2100-03-04','Legacy duplicate',gen_random_uuid())returning id",
        [ids.admin],
      )
    )[0].id;
  } finally {
    await query(
      "alter table public.requests enable trigger staff_commitments_guard",
    );
  }
  await assert.rejects(approve(first, null), /overlapping/);
  assert.equal(
    (await query("select status from requests where id=$1", [first]))[0].status,
    "pending",
  );
  await as("admin", "select cancel_request($1,'Resolve duplicate')", [second]);
  await approve(first, null);
});

test("database trigger blocks overlapping raw writes without using the booking RPC", async () => {
  const q = await submit("user", "2101-01-01", "2101-01-04");
  await assert.rejects(
    query(
      "insert into requests(requester_id,request_type,start_date,end_date,purpose,client_token)values($1,'break','2101-01-02','2101-01-03','Bypass attempt',gen_random_uuid())",
      [ids.user],
    ),
    /overlap/,
  );
  const adjacent = await submit("user", "2101-01-04", "2101-01-05", "break");
  await approve(q, room);
  await approve(adjacent, null);
  await assert.rejects(
    query("update requests set start_date='2101-01-02' where id=$1", [q]),
    /immutable/,
  );
});
test("commit guard rejects confirmed-without-allocation and allocation-without-slot", async () => {
  const q = await submit("other", "2101-02-01", "2101-02-03");
  await assert.rejects(
    query("update requests set status='confirmed' where id=$1", [q]),
    /requires an active allocation/,
  );
  assert.equal(
    (await query("select status from requests where id=$1", [q]))[0].status,
    "pending",
  );
  await exec("begin");
  try {
    await query(
      "insert into room_allocations(request_id,room_id)values($1,$2)",
      [q, room2],
    );
    await query("update requests set status='confirmed' where id=$1", [q]);
    await assert.rejects(exec("commit"), /matching capacity slot/);
  } finally {
    await exec("rollback");
  }
  assert.equal(
    (await query("select * from room_allocations where request_id=$1", [q]))
      .length,
    0,
  );
});
test("commit guard rejects wrong-house allocations and altered or missing capacity slots", async () => {
  const q = await submit("admin", "2101-03-01", "2101-03-04");
  await approve(q, room2);
  const allocation = (
    await query("select id from room_allocations where request_id=$1", [q])
  )[0].id;
  await assert.rejects(
    query("delete from occupancy_slots where allocation_id=$1", [allocation]),
    /matching capacity slot/,
  );
  const foreignRoom = (
    await query(
      "select r.id from rooms r join guesthouses h on h.id=r.guesthouse_id where h.code='ORACLE' limit 1",
    )
  )[0].id;
  await assert.rejects(
    query("update room_allocations set room_id=$1 where id=$2", [
      foreignRoom,
      allocation,
    ]),
    /does not match/,
  );
  await assert.rejects(
    query(
      "update occupancy_slots set stay=daterange('2101-03-01','2101-03-02','[)') where allocation_id=$1",
      [allocation],
    ),
    /matching capacity slot|does not match/,
  );
  assert.equal(
    (
      await query("select room_id from room_allocations where id=$1", [
        allocation,
      ])
    )[0].room_id,
    room2,
  );
});
test("all internal security helpers, guards and operational writes are inaccessible to anonymous users", async () => {
  const helpers = await query(
    "select proname,has_function_privilege('authenticated',oid,'execute') staff,has_function_privilege('anon',oid,'execute') anon from pg_proc where pronamespace='public'::regnamespace and proname in ('booking_lock','require_role','log_event','room_free','guard_staff_commitments','guard_booking_integrity')",
  );
  assert.equal(helpers.length, 6);
  assert.ok(helpers.every((h) => !h.staff && !h.anon));
  for (const table of [
    "profiles",
    "settings",
    "guesthouses",
    "rooms",
    "requests",
    "room_allocations",
    "room_blocks",
    "occupancy_slots",
    "activity_events",
  ]) {
    const r = await query(
      "select has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d,has_table_privilege('anon',$1,'SELECT') s",
      ["public." + table],
    );
    assert.ok(
      Object.values(r[0]).every((v) => v === false),
      table,
    );
  }
});

test("a valid Auth identity without a provisioned active staff profile sees no app data", async () => {
  const id = "00000000-0000-4000-8888-000000000001";
  await query(
    "insert into auth.users(id,email)values($1,'unprovisioned@example.invalid')",
    [id],
  );
  await exec("begin");
  try {
    await query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
    await exec("set local role authenticated");
    for (const table of [
      "profiles",
      "settings",
      "guesthouses",
      "rooms",
      "requests",
      "room_allocations",
      "room_blocks",
      "occupancy_slots",
      "activity_events",
    ])
      assert.equal(
        (await query("select * from public." + table)).length,
        0,
        table,
      );
    await assert.rejects(
      query("select availability($1,'2103-01-01','2103-01-02')", [house]),
      /active staff/,
    );
  } finally {
    await exec("rollback");
  }
});
