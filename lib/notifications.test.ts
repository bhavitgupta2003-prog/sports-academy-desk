import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_LOOKAHEAD_DAYS, attendanceWindowStart, buildNotifications } from "./notifications.ts";
import { buildRows, type PaymentRow, type StudentRow } from "./studentList.ts";
import type { EventRow } from "./events.ts";

const TODAY = "2026-10-22";
const mk = (id: string, name: string, batch: string, fee: number, joined: string): StudentRow => ({
  id, name, coach: "Ravi", monthly_fee: fee, joined_on: joined, batch_id: "b-" + batch, batches: { name: batch },
});
const students = [
  mk("1", "Aarav Kumar", "A", 3000, "2026-10-01"), // owes October, past the 5th -> overdue Rs 3,000
  mk("2", "Meera Shah", "A", 3000, "2026-09-15"), // paid 1000 of two months -> overdue Rs 5,000
  mk("3", "Rohan Das", "B", 2000, "2026-10-22"), // joined today, unpaid -> due today
  mk("4", "Isha Rao", "B", 2000, "2026-10-01"), // paid in full
];
const payments: PaymentRow[] = [{ student_id: "2", amount: 1000 }, { student_id: "4", amount: 2000 }];
const rows = buildRows(students, payments, TODAY);
const mark = (student_id: string, date: string, status: string) => ({ student_id, date, status });
const ev = (id: string, title: string, event_date: string, extra: Partial<EventRow> = {}): EventRow => ({
  id, title, event_date, event_time: null, location: null, notes: null, batch_id: null, batches: null, ...extra,
});
const build = (marks = [] as ReturnType<typeof mark>[], events: EventRow[] = []) => buildNotifications({ rows, marks, events, today: TODAY });

test("overdue students get a high-priority notification, biggest balance first", () => {
  const n = build().filter((x) => x.kind === "fee_overdue");
  assert.deepEqual(n.map((x) => x.title), ["Meera Shah's fee is overdue", "Aarav Kumar's fee is overdue"]);
  assert.equal(n[0].severity, "high");
  assert.match(n[0].detail, /Rs 5,000 outstanding · 2 months overdue · A/);
  assert.match(n[1].detail, /Rs 3,000 outstanding · 1 month overdue/);
  assert.equal(n[0].href, "/students/2");
});
test("a fee due today gets a 'due soon' notification with the date, and paid students get nothing", () => {
  const all = build();
  const due = all.filter((x) => x.kind === "fee_due_soon");
  assert.deepEqual(due.map((x) => x.title), ["Rohan Das's fee is due today"]);
  assert.match(due[0].detail, /Rs 2,000 due on 22 Oct · B/);
  assert.equal(due[0].severity, "medium");
  assert.equal(all.some((x) => x.title.includes("Isha")), false);
});
test("low attendance: only below the cut-off with enough marks, with the percentage and counts", () => {
  const marks = [
    mark("1", "2026-10-01", "present"), mark("1", "2026-10-03", "absent"), mark("1", "2026-10-05", "absent"), mark("1", "2026-10-07", "absent"), // 25%
    mark("4", "2026-10-01", "present"), mark("4", "2026-10-03", "present"), mark("4", "2026-10-05", "present"), // 100%
    mark("2", "2026-10-01", "absent"), mark("2", "2026-10-03", "absent"), // only 2 marks: not judged
  ];
  const low = build(marks).filter((x) => x.kind === "low_attendance");
  assert.deepEqual(low.map((x) => x.title), ["Aarav Kumar has low attendance"]);
  assert.match(low[0].detail, /25% present \(1 of 4 sessions\) in the last month · A/);
});
test("events: only today through the next 7 days, soonest first, with time, place and batch", () => {
  const events = [
    ev("e1", "Sports day", "2026-10-29", { location: "Main ground" }), // exactly 7 days away: included
    ev("e2", "Kit distribution", "2026-10-30"), // 8 days: not yet
    ev("e3", "Trials", "2026-10-23", { event_time: "17:30:00", batches: { name: "Cricket U-12" } }),
    ev("e4", "Yesterday's match", "2026-10-21"), // already past
  ];
  const n = build([], events).filter((x) => x.kind === "event");
  assert.deepEqual(n.map((x) => x.title), ["Trials", "Sports day"]);
  assert.equal(EVENT_LOOKAHEAD_DAYS, 7);
  assert.equal(n[0].detail, "tomorrow · 5:30 PM · Cricket U-12");
  assert.equal(n[1].detail, "in 7 days (29 Oct) · Main ground · All batches");
  assert.equal(n[0].severity, "medium"); // tomorrow
  assert.equal(n[1].severity, "info");
  assert.equal(n[0].href, "/events");
});
test("an event today is medium priority and listed before later ones", () => {
  const n = build([], [ev("a", "Later", "2026-10-25"), ev("b", "Today", TODAY, { event_time: "09:00:00" })]).filter((x) => x.kind === "event");
  assert.deepEqual(n.map((x) => x.title), ["Today", "Later"]);
  assert.equal(n[0].severity, "medium");
});
test("the list is ordered: high priority, then medium (fees, attendance, events), then info", () => {
  const marks = [mark("1", "d1", "absent"), mark("1", "d2", "absent"), mark("1", "d3", "absent")];
  const n = build(marks, [ev("e", "Sports day", "2026-10-28"), ev("f", "Trials", "2026-10-23")]);
  assert.deepEqual(n.map((x) => x.kind), ["fee_overdue", "fee_overdue", "fee_due_soon", "low_attendance", "event", "event"]);
  assert.deepEqual(n.map((x) => x.severity), ["high", "high", "medium", "medium", "medium", "info"]);
});
test("ids are unique, and stay the same when nothing has changed (so a dismissed one stays dismissed)", () => {
  const a = build([], [ev("e", "Sports day", "2026-10-28")]);
  const b = build([], [ev("e", "Sports day", "2026-10-28")]);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.equal(new Set(a.map((x) => x.id)).size, a.length);
});
test("ids change when the situation changes, so a worse situation shows up again", () => {
  const before = build().find((x) => x.title.startsWith("Aarav"))!.id;
  const worse = buildNotifications({ rows: buildRows(students, payments, "2026-11-10"), marks: [], events: [], today: "2026-11-10" }).find((x) => x.title.startsWith("Aarav"))!.id;
  assert.notEqual(before, worse); // one month overdue became two
});
test("with no problems and no events there are no notifications", () => {
  const clean = buildRows([mk("9", "Zed", "A", 1000, "2026-10-01")], [{ student_id: "9", amount: 1000 }], TODAY);
  assert.deepEqual(buildNotifications({ rows: clean, marks: [], events: [], today: TODAY }), []);
});
test("the attendance window is the last month", () => {
  assert.equal(attendanceWindowStart(TODAY), "2026-09-23");
});
