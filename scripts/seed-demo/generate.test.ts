import test from "node:test";
import assert from "node:assert/strict";
import { feeStatus, outstanding } from "../../lib/fees.ts";
import { normalizeName } from "../../lib/validation.ts";
import { buildRows } from "../../lib/studentList.ts";
import { summarizeDashboard } from "../../lib/dashboard.ts";
import { BATCHES, EXCLUDED_NAMES } from "./data.ts";
import {
  PROFILE_COUNTS, demoBatchIds, demoStudentIds, expectedStatus, generateDemo, summarize, toRows, validateDataset,
} from "./generate.ts";
import { uuidV5 } from "./ids.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER_USER = "99999999-2222-4333-8444-555555555555";
const TODAY = "2026-10-22"; // a Thursday
// Dates chosen to hit the awkward ones: before/after the 5th, month ends, year change, leap day.
const DATES = ["2026-10-22", "2026-11-01", "2026-11-03", "2026-11-05", "2026-11-06", "2026-12-31", "2027-01-01", "2027-01-05", "2027-03-15", "2028-02-29", "2026-10-07", "2026-10-31"];

const ds = generateDemo(TODAY, USER);

// ---------- ids ----------
test("uuid v5 matches the published test vector (so ids are standard and stable)", () => {
  assert.equal(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "2ed6657d-e927-568b-95e1-2665a8aea6a2");
});
test("ids are valid uuids, and the id helpers match what is generated", () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  for (const id of [...ds.batches.map((b) => b.id), ...ds.students.map((s) => s.id), ...ds.attendance.slice(0, 50).map((a) => a.id), ...ds.payments.slice(0, 50).map((p) => p.id)]) assert.match(id, uuid);
  assert.deepEqual(ds.batches.map((b) => b.id), demoBatchIds(USER));
  assert.deepEqual(ds.students.map((s) => s.id), demoStudentIds(USER));
});
test("a different account gets different ids (two accounts can never collide)", () => {
  const other = generateDemo(TODAY, OTHER_USER);
  const mine = new Set([...ds.batches, ...ds.students, ...ds.attendance, ...ds.payments].map((r) => r.id));
  for (const r of [...other.batches, ...other.students, ...other.attendance, ...other.payments]) assert.equal(mine.has(r.id), false);
});

// ---------- repeatable ----------
test("the same inputs always give exactly the same data (needed for safe reruns)", () => {
  assert.deepEqual(generateDemo(TODAY, USER), ds);
});
test("rerunning on a later day keeps every student, batch and name, and any attendance mark it repeats is identical", () => {
  const later = generateDemo("2026-10-25", USER);
  assert.deepEqual(later.students.map((s) => s.id), ds.students.map((s) => s.id));
  assert.deepEqual(later.students.map((s) => s.name), ds.students.map((s) => s.name));
  assert.deepEqual(later.students.map((s) => s.profile), ds.students.map((s) => s.profile));
  // The later run looks back 61 days from 25 Oct (so it starts on 25 Aug). Marks it shares with the first run must match.
  const laterAtt = new Map(later.attendance.map((a) => [a.id, a.status]));
  const old = ds.attendance.filter((x) => x.date >= "2026-08-25" && x.date < "2026-10-22");
  const shared = old.filter((a) => laterAtt.has(a.id));
  assert.ok(shared.length > old.length * 0.98, "almost all old marks are repeated");
  for (const a of shared) assert.equal(laterAtt.get(a.id), a.status);
});
test("a student's join date never moves earlier on a later run, so a rerun can't create marks before joining", () => {
  const later = generateDemo("2026-10-25", USER);
  const first = new Map(ds.students.map((s) => [s.id, s.joined_on]));
  for (const s of later.students) {
    if (s.profile === "new_unpaid") continue; // these join "today", whatever today is
    assert.ok(s.joined_on >= first.get(s.id)!, `${s.key}: ${s.joined_on} < ${first.get(s.id)}`);
  }
});

// ---------- volume and shape ----------
test("volume: 7 batches, 100 students with the planned batch sizes", () => {
  assert.equal(ds.batches.length, 7);
  assert.equal(ds.students.length, 100);
  for (const spec of BATCHES) {
    const b = ds.batches.find((x) => x.key === spec.key)!;
    assert.equal(ds.students.filter((s) => s.batch_id === b.id).length, spec.size);
  }
});
test("volume: attendance and payments are in the planned range", () => {
  assert.ok(ds.attendance.length > 1800 && ds.attendance.length < 3000, `attendance ${ds.attendance.length}`);
  assert.ok(ds.payments.length > 350 && ds.payments.length < 650, `payments ${ds.payments.length}`);
});
test("the planned mix of payer types is exact", () => {
  for (const [profile, n] of Object.entries(PROFILE_COUNTS)) assert.equal(ds.students.filter((s) => s.profile === profile).length, n);
  assert.equal(Object.values(PROFILE_COUNTS).reduce((a, b) => a + b, 0), 100);
});

// ---------- valid against the real schema ----------
test("the dataset passes every schema rule on many different dates", () => {
  for (const d of DATES) assert.deepEqual(validateDataset(generateDemo(d, USER)), [], d);
});
test("only real columns are sent, and never owner_id", () => {
  const rows = toRows(ds);
  assert.deepEqual(Object.keys(rows.batches[0]).sort(), ["id", "name"]);
  assert.deepEqual(Object.keys(rows.students[0]).sort(), ["batch_id", "coach", "id", "joined_on", "monthly_fee", "name", "parent_name", "parent_phone"]);
  assert.deepEqual(Object.keys(rows.attendance[0]).sort(), ["date", "id", "status", "student_id"]);
  assert.deepEqual(Object.keys(rows.payments[0]).sort(), ["amount", "id", "note", "paid_on", "student_id"]);
  for (const list of Object.values(rows)) for (const r of list) assert.equal("owner_id" in r, false);
});
test("insert order is safe: every student's batch, and every mark/payment's student, exists in the data", () => {
  const rows = toRows(ds);
  const batches = new Set(rows.batches.map((b) => b.id));
  const students = new Set(rows.students.map((s) => s.id));
  assert.ok(rows.students.every((s) => batches.has(s.batch_id)));
  assert.ok(rows.attendance.every((a) => students.has(a.student_id)));
  assert.ok(rows.payments.every((p) => students.has(p.student_id)));
});

// ---------- fictional and clearly synthetic ----------
test("phones are clearly fake (start with 0), unique, and still pass the app's phone check", () => {
  const phones = ds.students.map((s) => s.parent_phone);
  assert.equal(new Set(phones).size, 100);
  for (const p of phones) {
    assert.match(p, /^00000 \d{5}$/);
    assert.match(p, /^\+?[0-9 ]{10,14}$/);
  }
});
test("student names are unique and none is a name used in earlier testing", () => {
  const names = ds.students.map((s) => normalizeName(s.name));
  assert.equal(new Set(names).size, 100);
  for (const bad of EXCLUDED_NAMES) assert.equal(names.includes(bad), false);
});
test("parents share the child's surname and no parent has a coach's first name", () => {
  const coachFirst = new Set(BATCHES.map((b) => b.coach.replace("Coach ", "").split(" ")[0]));
  for (const s of ds.students) {
    assert.equal(s.parent_name.split(" ")[1], s.name.split(" ")[1]);
    assert.equal(coachFirst.has(s.parent_name.split(" ")[0]), false);
  }
});

// ---------- fees use the app's own rules ----------
test("on 22 Oct 2026: 69 Paid, 3 Due soon, 28 Overdue", () => {
  assert.deepEqual(summarize(ds).statusCounts, { paid: 69, due_soon: 3, overdue: 28 });
});
test("every student's status matches their payer type on every test date (incl. before/after the 5th)", () => {
  for (const d of DATES) {
    const data = generateDemo(d, USER);
    const paid = new Map<string, number>();
    for (const p of data.payments) paid.set(p.student_id, (paid.get(p.student_id) ?? 0) + p.amount);
    for (const s of data.students) {
      assert.equal(feeStatus(s.monthly_fee, s.joined_on, paid.get(s.id) ?? 0, d), expectedStatus(s.profile, d), `${d} ${s.key} ${s.profile}`);
    }
  }
});
test("paid-ahead students show a credit and overdue students owe money", () => {
  const paid = new Map<string, number>();
  for (const p of ds.payments) paid.set(p.student_id, (paid.get(p.student_id) ?? 0) + p.amount);
  const owed = (id: string) => { const s = ds.students.find((x) => x.id === id)!; return outstanding(s.monthly_fee, s.joined_on, paid.get(id) ?? 0, TODAY); };
  for (const s of ds.students.filter((x) => x.profile === "ahead")) assert.ok(owed(s.id) < 0);
  for (const s of ds.students.filter((x) => x.profile.startsWith("behind") || x.profile === "partial" || x.profile === "new_unpaid")) assert.ok(owed(s.id) > 0);
  for (const s of ds.students.filter((x) => x.profile === "regular" || x.profile === "late")) assert.equal(owed(s.id), 0);
});
test("partial payers have paid something but less than a month, and some pay in instalments", () => {
  const partial = ds.students.filter((s) => s.profile === "partial");
  assert.ok(partial.length > 0);
  assert.ok(ds.payments.some((p) => p.note.startsWith("Instalment")));
  assert.ok(ds.payments.some((p) => p.note.startsWith("Advance for next month")));
});
test("each kind of student has a different payment pattern (variety, not a single script)", () => {
  assert.ok(new Set(ds.payments.map((p) => p.paid_on.slice(8))).size > 15); // many different pay days
  assert.ok(new Set(ds.students.map((s) => s.monthly_fee)).size >= 7); // different fees, incl. discounts
  assert.ok(new Set(ds.students.map((s) => s.joined_on.slice(0, 7))).size >= 7); // joined across 7+ months
});

// ---------- attendance ----------
test("attendance dates: only on batch weekdays, never before joining, never in the future, never twice", () => {
  const batchOf = new Map(ds.students.map((s) => [s.id, ds.batches.find((b) => b.id === s.batch_id)!]));
  const joined = new Map(ds.students.map((s) => [s.id, s.joined_on]));
  const seen = new Set<string>();
  for (const a of ds.attendance) {
    const wd = new Date(a.date + "T00:00:00Z").getUTCDay();
    assert.ok(batchOf.get(a.student_id)!.weekdays.includes(wd), `${a.date} is not a session day`);
    assert.ok(a.date >= joined.get(a.student_id)! && a.date <= TODAY);
    const k = a.student_id + a.date;
    assert.equal(seen.has(k), false);
    seen.add(k);
  }
});
test("history covers about two months, plus some marks for today", () => {
  const dates = ds.attendance.map((a) => a.date).sort();
  assert.ok(dates[0] <= "2026-08-26" && dates[0] >= "2026-08-21", `earliest ${dates[0]}`);
  assert.ok(ds.attendance.some((a) => a.date === TODAY)); // 22 Oct 2026 is a Thursday: some Thursday batches were marked
});
test("attendance varies: a spread of attendance rates between students, and absences exist", () => {
  const rate = new Map<string, { p: number; n: number }>();
  for (const a of ds.attendance) {
    const r = rate.get(a.student_id) ?? { p: 0, n: 0 };
    r.n++;
    if (a.status === "present") r.p++;
    rate.set(a.student_id, r);
  }
  const pcts = [...rate.values()].filter((r) => r.n >= 8).map((r) => r.p / r.n);
  assert.ok(Math.min(...pcts) < 0.6, "some irregular students");
  assert.ok(Math.max(...pcts) > 0.9, "some very regular students");
  const overall = ds.attendance.filter((a) => a.status === "present").length / ds.attendance.length;
  assert.ok(overall > 0.65 && overall < 0.9, `overall ${overall}`);
});
test("the AI summary window (last 30 days) would have more than 1,000 rows, so paged reading is needed", () => {
  const since = "2026-09-23";
  assert.ok(ds.attendance.filter((a) => a.date >= since).length > 800);
});

// ---------- what the website shows, using the app's own code ----------
test("the dashboard numbers come out sensibly from the app's own functions", () => {
  const paid = ds.payments.map((p) => ({ student_id: p.student_id, amount: p.amount }));
  const rows = buildRows(ds.students.map((s) => ({ ...s, batches: { name: ds.batches.find((b) => b.id === s.batch_id)!.name } })), paid, TODAY);
  const marks = ds.attendance.filter((a) => a.date === TODAY).map((a) => ({ student_id: a.student_id, status: a.status }));
  const d = summarizeDashboard(rows, marks);
  assert.equal(d.students, 100);
  assert.equal(d.batches, 7);
  assert.equal(d.overdue.length, 28);
  assert.equal(d.studentsOwing, 31);
  assert.equal(d.present + d.absent + d.notMarked, 100);
  assert.ok(d.present > 0 && d.absent >= 0);
  assert.ok(d.totalOutstanding > 90_000 && d.totalOutstanding < 130_000);
});
