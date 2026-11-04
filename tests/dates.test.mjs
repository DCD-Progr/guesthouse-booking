import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, overlaps, today } from "../src/dates.ts";
test("adjacent stays have no overlap", () =>
  assert.equal(
    overlaps("2090-01-01", "2090-01-05", "2090-01-05", "2090-01-08"),
    false,
  ));
test("containment and partial intersection overlap", () => {
  assert.ok(overlaps("2090-01-01", "2090-01-09", "2090-01-02", "2090-01-03"));
  assert.ok(overlaps("2090-01-01", "2090-01-05", "2090-01-04", "2090-01-08"));
});
test("calendar day arithmetic crosses month and leap-year boundaries", () => {
  assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  assert.equal(addDays("2027-12-31", 1), "2028-01-01");
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
