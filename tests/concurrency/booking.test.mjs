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
    } finally {
      await Promise.all([a.end(), b.end(), setup.end()]);
    }
  },
);
