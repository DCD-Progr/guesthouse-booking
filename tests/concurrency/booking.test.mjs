import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
const url = process.env.TEST_DATABASE_URL;
async function client() {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}
async function as(c, user, sql, args = []) {
  await c.query("begin");
  try {
    await c.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await c.query("set local role authenticated");
    const r = await c.query(sql, args);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
test(
  "concurrent booking/booking, booking/closure and competing decisions are serialized safely",
  { skip: !url },
  async () => {
    const setup = await client(),
      a = await client(),
      b = await client();
    const user = "00000000-0000-4000-8000-000000000003",
      other = "00000000-0000-4000-8000-000000000004",
      approver = "00000000-0000-4000-8000-000000000002",
      admin = "00000000-0000-4000-8000-000000000001",
      house = "10000000-0000-4000-8000-000000000001",
      room = "20000000-0000-4000-8000-000000000001";
    async function submit(u, start, end) {
      return (
        await as(
          setup,
          u,
          "select submit_request('accommodation',$1,$2,$3,'Juba','Concurrency test','',gen_random_uuid(),null) id",
          [house, start, end],
        )
      ).rows[0].id;
    }
    try {
      const q1 = await submit(user, "2095-01-01", "2095-01-05"),
        q2 = await submit(other, "2095-01-01", "2095-01-05");
      let result = await Promise.allSettled([
        as(a, approver, "select decide_request($1,true,$2,'')", [q1, room]),
        as(b, approver, "select decide_request($1,true,$2,'')", [q2, room]),
      ]);
      assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
      const q3 = await submit(user, "2095-02-01", "2095-02-05");
      result = await Promise.allSettled([
        as(a, approver, "select decide_request($1,true,$2,'')", [q3, room]),
        as(
          b,
          admin,
          "select create_block($1,'2095-02-01','2095-02-05','Concurrent closure')",
          [room],
        ),
      ]);
      assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
      const q4 = await submit(user, "2095-03-01", "2095-03-05");
      result = await Promise.allSettled([
        as(a, approver, "select decide_request($1,true,$2,'')", [q4, room]),
        as(b, approver, "select decide_request($1,false,null,'Rejected')", [
          q4,
        ]),
      ]);
      assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
      const q5 = await submit(user, "2095-04-01", "2095-04-05");
      result = await Promise.allSettled([
        as(a, approver, "select decide_request($1,true,$2,'') id", [q5, room]),
        as(b, approver, "select decide_request($1,true,$2,'') id", [q5, room]),
      ]);
      assert.equal(result.filter((x) => x.status === "fulfilled").length, 2);
      assert.equal(result[0].value.rows[0].id, result[1].value.rows[0].id);
      // Ten independent sessions compete for exactly one room.
      const competing = [];
      for (let i = 0; i < 10; i++) {
        const staffId = `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`;
        await setup.query("insert into auth.users(id,email)values($1,$2)", [
          staffId,
          `race${i}@example.invalid`,
        ]);
        await setup.query(
          "insert into profiles(id,email,full_name,role)values($1,$2,'Race staff','requester')",
          [staffId, `race${i}@example.invalid`],
        );
        competing.push(await submit(staffId, "2099-01-01", "2099-01-05"));
      }
      const clients = await Promise.all(competing.map(() => client()));
      try {
        const outcomes = await Promise.allSettled(
          clients.map((c, i) =>
            as(c, approver, "select decide_request($1,true,$2,'Stress test')", [
              competing[i],
              room,
            ]),
          ),
        );
        assert.equal(
          outcomes.filter((x) => x.status === "fulfilled").length,
          1,
        );
        assert.equal(
          Number(
            (
              await setup.query(
                "select count(*) n from occupancy_slots where room_id=$1 and stay && daterange('2099-01-01','2099-01-05','[)')",
                [room],
              )
            ).rows[0].n,
          ),
          1,
        );
      } finally {
        await Promise.all(clients.map((c) => c.end()));
      }
      const cancelRace = await submit(user, "2099-02-01", "2099-02-05");
      await Promise.allSettled([
        as(a, approver, "select decide_request($1,true,$2,'')", [
          cancelRace,
          room,
        ]),
        as(b, user, "select cancel_request($1,'Concurrent cancellation')", [
          cancelRace,
        ]),
      ]);
      assert.equal(
        (
          await setup.query("select status from requests where id=$1", [
            cancelRace,
          ])
        ).rows[0].status,
        "cancelled",
      );
      assert.equal(
        Number(
          (
            await setup.query(
              "select count(*) n from occupancy_slots s join room_allocations a on a.id=s.allocation_id where a.request_id=$1",
              [cancelRace],
            )
          ).rows[0].n,
        ),
        0,
      );
      const staffRace = await Promise.allSettled([
        as(
          a,
          user,
          "select submit_request('break',null,'2100-04-01','2100-04-05','','Rest','',gen_random_uuid(),null)",
        ),
        as(
          b,
          user,
          "select submit_request('accommodation',$1,'2100-04-01','2100-04-05','','Travel','',gen_random_uuid(),null)",
          [house],
        ),
      ]);
      assert.equal(staffRace.filter((x) => x.status === "fulfilled").length, 1);
      assert.match(
        staffRace.find((x) => x.status === "rejected").reason.message,
        /overlapping/,
      );
    } finally {
      await Promise.all([a.end(), b.end(), setup.end()]);
    }
  },
);
