import test from "node:test";
import assert from "node:assert/strict";
import { fetchAll } from "./fetchAll.ts";

// A fake "database table" with a server-side cap on rows per response, like Supabase's default.
function fakeTable(total: number, serverCap: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ n: i }));
  let calls = 0;
  const getPage = async (from: number, to: number) => {
    calls++;
    const wanted = to - from + 1;
    return { data: rows.slice(from, from + Math.min(wanted, serverCap)), error: null };
  };
  return { getPage, calls: () => calls };
}

test("a plain query is cut at the server cap (this is the bug fetchAll prevents)", async () => {
  const t = fakeTable(2500, 1000);
  const { data } = await t.getPage(0, 9_999_999);
  assert.equal(data.length, 1000);
});
test("fetchAll returns every row when there are more than the cap", async () => {
  const t = fakeTable(2500, 1000);
  const { data, error } = await fetchAll(t.getPage);
  assert.equal(error, null);
  assert.equal(data.length, 2500);
  assert.deepEqual(data.map((r) => r.n), Array.from({ length: 2500 }, (_, i) => i)); // in order, none repeated or missing
});
test("it still works when the server cap is lower than the page size asked for", async () => {
  const t = fakeTable(1234, 400);
  const { data } = await fetchAll(t.getPage);
  assert.equal(data.length, 1234);
});
test("an empty table gives an empty list", async () => {
  const { data, error } = await fetchAll(fakeTable(0, 1000).getPage);
  assert.deepEqual(data, []);
  assert.equal(error, null);
});
test("exactly one page of rows works", async () => {
  const { data } = await fetchAll(fakeTable(1000, 1000).getPage);
  assert.equal(data.length, 1000);
});
test("an error stops the read and is passed back (no partial data is returned as if complete)", async () => {
  let n = 0;
  const { data, error } = await fetchAll(async () => (++n === 1 ? { data: [{ n: 1 }], error: null } : { data: null, error: { code: "X" } }));
  assert.deepEqual(error, { code: "X" });
  assert.deepEqual(data, []);
});
