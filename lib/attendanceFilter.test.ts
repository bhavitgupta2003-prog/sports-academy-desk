import test from "node:test";
import assert from "node:assert/strict";
import { STATUS_FILTERS, attendanceCounts, filterAttendance } from "./attendanceFilter.ts";

const students = [
  { id: "1", name: "Aarav Kumar" },
  { id: "2", name: "Meera Shah" },
  { id: "3", name: "Rohan Das" },
  { id: "4", name: "Isha Rao" },
  { id: "5", name: "aarav Patel" },
];
const marks = { "1": "present", "2": "absent", "3": "present" }; // 4 and 5 are not marked
const ids = (list: { id: string }[]) => list.map((s) => s.id);
const f = (status: Parameters<typeof filterAttendance>[2]["status"], search = "") => ids(filterAttendance(students, marks, { search, status }));

test("counts: each student is in exactly one of present, absent or not marked", () => {
  const c = attendanceCounts(students, marks);
  assert.deepEqual(c, { all: 5, not_marked: 2, marked: 3, present: 2, absent: 1 });
  assert.equal(c.present + c.absent + c.not_marked, c.all);
  assert.equal(c.marked, c.present + c.absent);
});
test("counts for an empty list and for nobody marked", () => {
  assert.deepEqual(attendanceCounts([], {}), { all: 0, not_marked: 0, marked: 0, present: 0, absent: 0 });
  assert.deepEqual(attendanceCounts(students, {}), { all: 5, not_marked: 5, marked: 0, present: 0, absent: 0 });
});
test("each status filter returns the right students", () => {
  assert.deepEqual(f("all"), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(f("not_marked"), ["4", "5"]);
  assert.deepEqual(f("marked"), ["1", "2", "3"]);
  assert.deepEqual(f("present"), ["1", "3"]);
  assert.deepEqual(f("absent"), ["2"]);
});
test("search matches part of a name, ignoring capitals and extra spaces", () => {
  assert.deepEqual(f("all", "aarav"), ["1", "5"]);
  assert.deepEqual(f("all", "  MEERA "), ["2"]);
  assert.deepEqual(f("all", "sha"), ["2", "4"]); // Meera Shah and Isha Rao: matches part of a name, not just the start
  assert.deepEqual(f("all", "zzz"), []);
});
test("search and status work together", () => {
  assert.deepEqual(f("not_marked", "aarav"), ["5"]); // Aarav Kumar is marked, aarav Patel is not
  assert.deepEqual(f("present", "aarav"), ["1"]);
  assert.deepEqual(f("absent", "aarav"), []);
});
test("the counts always agree with the filters", () => {
  const c = attendanceCounts(students, marks);
  for (const { value } of STATUS_FILTERS) assert.equal(f(value).length, c[value], value);
});
test("an unknown mark value counts as not marked", () => {
  const odd = { "1": "late" };
  assert.deepEqual(attendanceCounts(students.slice(0, 2), odd), { all: 2, not_marked: 2, marked: 0, present: 0, absent: 0 });
  assert.deepEqual(ids(filterAttendance(students.slice(0, 2), odd, { search: "", status: "not_marked" })), ["1", "2"]);
});
test("the filter chips are in a sensible order, with unique values", () => {
  assert.deepEqual(STATUS_FILTERS.map((x) => x.value), ["all", "not_marked", "marked", "present", "absent"]);
  assert.equal(new Set(STATUS_FILTERS.map((x) => x.label)).size, 5);
});
