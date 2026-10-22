// Builds the demo dataset in memory. It touches no database and needs no password.
// Dates are relative to `asOf` (today in India by default). Fee balances and statuses are NOT stored
// anywhere: they come out of the app's own fee functions from the students and payments created here.

import { addDays, feeStatus, isValidDate, monthsBilled, outstanding, type FeeStatus } from "../../lib/fees.ts";
import { normalizeName } from "../../lib/validation.ts";
import { BATCHES, EXCLUDED_NAMES, FIRST_NAMES, PARENT_FIRST_NAMES, PAYMENT_METHODS, SURNAMES } from "./data.ts";
import { hash01, uuidV5 } from "./ids.ts";

export type Profile = "regular" | "late" | "ahead" | "partial" | "behind1" | "behind2" | "behind3" | "new_unpaid";

/** How many students behave each way. Must add up to the number of students in data.ts (25). */
export const PROFILE_COUNTS: Record<Profile, number> = {
  regular: 13, // pays every month, early
  late: 3, // pays every month but after the due date
  ahead: 1, // paid next month's fee in advance
  partial: 3, // paid only part of this month's fee
  behind1: 2, // has not paid this month
  behind2: 1, // has not paid the last two months
  behind3: 1, // has not paid for three or four months
  new_unpaid: 1, // joined today, first fee not paid yet
};

/** How reliably students attend: [chance of being present, how many students]. Adds up to 25. */
export const RELIABILITY_TIERS: [number, number][] = [[0.92, 14], [0.78, 6], [0.58, 3], [0.38, 2]];

export const WINDOW_DAYS = 61; // about two months of history, plus today
const SEED = 20261022;
const CANCELLED_CHANCE = 0.07; // some sessions are cancelled (rain, holidays)
const MARKED_TODAY_CHANCE = 0.6; // coaches have marked about 60% of today's sessions so far

export type DemoBatch = { id: string; key: string; name: string; coach: string; weekdays: number[]; fee: number };
export type DemoStudent = {
  id: string; key: string; name: string; batch_id: string; coach: string; parent_name: string; parent_phone: string;
  monthly_fee: number; joined_on: string;
  profile: Profile; reliability: number; unpaid: number; // used only to build attendance and payments, never inserted
};
export type DemoAttendance = { id: string; student_id: string; date: string; status: "present" | "absent" };
export type DemoPayment = { id: string; student_id: string; amount: number; paid_on: string; note: string };
export type Dataset = { asOf: string; batches: DemoBatch[]; students: DemoStudent[]; attendance: DemoAttendance[]; payments: DemoPayment[] };

// ---------- small helpers ----------
const pad2 = (n: number) => String(n).padStart(2, "0");
const parts = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
};
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayIn = (monthKey: string, day: number) => {
  const [y, m] = monthKey.split("-").map(Number);
  return `${monthKey}-${pad2(Math.min(Math.max(day, 1), lastDay(y, m)))}`;
};
const monthEnd = (monthKey: string) => dayIn(monthKey, 31);
const shiftMonth = (monthKey: string, delta: number) => {
  const [y, m] = monthKey.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
};
const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);
const minDate = (a: string, b: string) => (a < b ? a : b);
const weekday = (d: string) => {
  const { y, m, day } = parts(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
};
const dayNumber = (d: string) => {
  const { y, m, day } = parts(d);
  return Math.floor(Date.UTC(y, m - 1, day) / 86_400_000);
};
const roundTo50 = (n: number) => Math.round(n / 50) * 50;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weighted(weights: number[], u: number): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total;
    if (u < acc) return i;
  }
  return weights.length - 1;
}

// ---------- stable ids (so reruns and "remove demo" can find exactly these rows) ----------
export const demoBatchId = (userId: string, key: string) => uuidV5(`${userId}:batch:${key}`);
export const demoStudentKey = (i: number) => `s${String(i + 1).padStart(3, "0")}`;
export const demoStudentId = (userId: string, key: string) => uuidV5(`${userId}:student:${key}`);
export const demoBatchIds = (userId: string) => BATCHES.map((b) => demoBatchId(userId, b.key));
export const totalStudents = () => BATCHES.reduce((s, b) => s + b.size, 0);
export const demoStudentIds = (userId: string) => Array.from({ length: totalStudents() }, (_, i) => demoStudentId(userId, demoStudentKey(i)));

// ---------- students ----------
function pickJoinDate(profile: Profile, asOf: string, unpaid: number, u1: number, u2: number, u3: number): string {
  if (profile === "new_unpaid") return asOf;
  const { day: asDay } = parts(asOf);
  const currentKey = asOf.slice(0, 7);
  let k: number; // how many months before this month the student joined
  switch (profile) {
    case "regular": k = weighted([8, 12, 15, 15, 15, 15, 12, 8], u1); break;
    case "late": k = 2 + Math.floor(u1 * 6); break; // 2..7
    case "ahead": k = 1 + Math.floor(u1 * 6); break; // 1..6
    case "partial": k = asDay >= 7 && u1 < 0.18 ? 0 : 1 + Math.floor(u2 * 6); break; // a few joined this month
    case "behind1": k = 1 + Math.floor(u1 * 6); break;
    case "behind2": k = 3 + Math.floor(u1 * 5); break; // 3..7
    default: k = unpaid + Math.floor(u1 * (8 - unpaid)); break; // behind3: at least as many months as they skipped
  }
  const monthKey = shiftMonth(currentKey, -k);
  const preferredDay = 1 + Math.floor(u3 * 28); // the same for this student whatever today's date is
  if (k === 0) {
    // Joined this month: the preferred day, but not after today (for "partial": before today, so their fee is already past due).
    const latest = profile === "partial" ? asDay - 1 : asDay;
    return dayIn(monthKey, Math.min(preferredDay, Math.max(1, latest)));
  }
  return dayIn(monthKey, preferredDay);
}

function buildNames(rng: () => number, count: number): { first: string; surname: string }[] {
  const seen = new Set<string>(EXCLUDED_NAMES);
  const out: { first: string; surname: string }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 10_000) {
    const first = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
    const key = normalizeName(`${first} ${surname}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ first, surname });
  }
  if (out.length < count) throw new Error("Could not build enough unique names");
  return out;
}

function buildStudents(asOf: string, userId: string, batches: DemoBatch[]): DemoStudent[] {
  const rng = mulberry32(SEED); // the same students every time, whatever today's date is
  const slots = BATCHES.flatMap((b, bi) => Array.from({ length: b.size }, () => bi));
  const profileTotal = Object.values(PROFILE_COUNTS).reduce((a, b) => a + b, 0);
  const tierTotal = RELIABILITY_TIERS.reduce((a, [, n]) => a + n, 0);
  if (profileTotal !== slots.length || tierTotal !== slots.length) {
    throw new Error(`Counts must add up to ${slots.length} students (profiles ${profileTotal}, attendance tiers ${tierTotal})`);
  }
  const reliabilities = shuffle(RELIABILITY_TIERS.flatMap(([p, n]) => Array.from({ length: n }, () => p)), rng);
  const profiles = shuffle((Object.entries(PROFILE_COUNTS) as [Profile, number][]).flatMap(([p, n]) => Array.from({ length: n }, () => p)), rng);
  const names = buildNames(rng, slots.length);

  return slots.map((bi, i) => {
    const key = demoStudentKey(i);
    const batch = batches[bi];
    const profile = profiles[i];
    const [u1, u2, u3, u4, u5, , u7] = [rng(), rng(), rng(), rng(), rng(), rng(), rng()]; // always the same number of draws per student
    const unpaid = profile === "behind1" ? 1 : profile === "behind2" ? 2 : profile === "behind3" ? (u4 < 0.5 ? 3 : 4) : 0;
    const joined_on = pickJoinDate(profile, asOf, unpaid, u1, u2, u3);
    const discount = u5 < 0.12 ? (u5 < 0.06 ? 0.8 : 0.9) : 1; // a few sibling / scholarship discounts
    const reliability = reliabilities[i];
    const { first, surname } = names[i];
    const parentFirst = PARENT_FIRST_NAMES[Math.floor(u7 * PARENT_FIRST_NAMES.length)];
    return {
      id: demoStudentId(userId, key),
      key,
      name: `${first} ${surname}`,
      batch_id: batch.id,
      coach: batch.coach,
      parent_name: `${parentFirst} ${surname}`,
      parent_phone: `00000 ${String(i + 1).padStart(5, "0")}`,
      monthly_fee: roundTo50(batch.fee * discount),
      joined_on,
      profile,
      reliability,
      unpaid,
    };
  });
}

// ---------- attendance ----------
function buildAttendance(asOf: string, batches: DemoBatch[], students: DemoStudent[]): DemoAttendance[] {
  const out: DemoAttendance[] = [];
  const start = addDays(asOf, -WINDOW_DAYS);
  for (const batch of batches) {
    const sessionDates: string[] = [];
    for (let d = start; d <= asOf; d = addDays(d, 1)) {
      if (!batch.weekdays.includes(weekday(d))) continue;
      if (hash01("cancel", batch.key, d) < CANCELLED_CHANCE) continue; // session cancelled
      if (d === asOf && hash01("today", batch.key, d) >= MARKED_TODAY_CHANCE) continue; // not marked yet today
      sessionDates.push(d);
    }
    for (const s of students.filter((x) => x.batch_id === batch.id)) {
      for (const d of sessionDates) {
        if (d < s.joined_on) continue;
        const badWeek = hash01("badweek", s.key, Math.floor(dayNumber(d) / 7)) < 0.12; // absences come in clusters
        const p = badWeek ? s.reliability * 0.45 : s.reliability;
        out.push({
          id: uuidV5(`${s.id}:attendance:${d}`),
          student_id: s.id,
          date: d,
          status: hash01("att", s.key, d) < p ? "present" : "absent",
        });
      }
    }
  }
  return out;
}

// ---------- payments ----------
type Plan = "full" | "none" | "partial";
function planFor(s: DemoStudent, offset: number): Plan {
  switch (s.profile) {
    case "partial": return offset === 0 ? "partial" : "full";
    case "behind1": return offset === 0 ? "none" : "full";
    case "behind2": return offset <= 1 ? "none" : "full";
    case "behind3": return offset < s.unpaid ? "none" : "full";
    case "new_unpaid": return "none";
    default: return "full";
  }
}

function buildPayments(asOf: string, students: DemoStudent[]): DemoPayment[] {
  const out: DemoPayment[] = [];
  const { day: asDay } = parts(asOf);
  const method = (s: DemoStudent, tag: string) => PAYMENT_METHODS[Math.floor(hash01("method", s.key, tag) * PAYMENT_METHODS.length)];

  for (const s of students) {
    const fee = s.monthly_fee;
    const n = monthsBilled(s.joined_on, asOf);
    const joinKey = s.joined_on.slice(0, 7);
    const push = (mKey: string, seq: number, amount: number, paid_on: string, note: string) =>
      out.push({ id: uuidV5(`${s.id}:payment:${mKey}:${seq}`), student_id: s.id, amount, paid_on, note });

    for (let idx = 0; idx < n; idx++) {
      const mKey = shiftMonth(joinKey, idx);
      const offset = n - 1 - idx; // 0 = this month
      const plan = planFor(s, offset);
      if (plan === "none") continue;
      const lo = idx === 0 ? s.joined_on : `${mKey}-01`;
      const hi = minDate(monthEnd(mKey), asOf);
      const early = (tag: string) => clampDate(dayIn(mKey, 1 + Math.floor(hash01("payday", s.key, mKey, tag) * 8)), lo, hi);

      if (plan === "partial") {
        const total = Math.min(fee - 50, Math.max(50, roundTo50(fee * (0.4 + hash01("pct", s.key, mKey) * 0.3))));
        const first = roundTo50(total * 0.6);
        if (hash01("inst", s.key, mKey) < 0.5 && first >= 50 && total - first >= 50) {
          const d1 = early("a");
          const d2 = clampDate(addDays(d1, 7 + Math.floor(hash01("gap", s.key, mKey) * 6)), d1, hi);
          push(mKey, 1, first, d1, `Instalment 1 of 2 (${method(s, "i1")})`);
          push(mKey, 2, total - first, d2, `Instalment 2 of 2 (${method(s, "i2")})`);
        } else {
          push(mKey, 1, total, early("a"), `Part payment (${method(s, "p")})`);
        }
        continue;
      }

      // plan === "full"
      let date = early("a");
      if (s.profile === "late" && offset === 0 && asDay >= 7) {
        date = clampDate(dayIn(mKey, 6 + Math.floor(hash01("late0", s.key, mKey) * (asDay - 5))), lo, hi);
      } else if (s.profile === "late" && offset === 1) {
        date = clampDate(dayIn(mKey, 10 + Math.floor(hash01("late1", s.key, mKey) * 9)), lo, hi);
      }
      const split = offset >= 1 && s.profile !== "late" && hash01("split", s.key, mKey) < 0.12;
      if (split) {
        const first = roundTo50(fee * 0.6);
        const d2 = clampDate(dayIn(mKey, 12 + Math.floor(hash01("split2", s.key, mKey) * 8)), date, hi);
        push(mKey, 1, first, date, `Instalment 1 of 2 (${method(s, "s1")})`);
        push(mKey, 2, fee - first, d2, `Instalment 2 of 2 (${method(s, "s2")})`);
      } else {
        push(mKey, 1, fee, date, method(s, "full"));
      }
    }

    if (s.profile === "ahead") {
      const when = clampDate(addDays(asOf, -(1 + Math.floor(hash01("ahead", s.key) * 10))), s.joined_on, asOf);
      push("advance", 1, fee, when, `Advance for next month (${method(s, "adv")})`);
    }
  }
  return out;
}

// ---------- the whole dataset ----------
export function generateDemo(asOf: string, userId: string): Dataset {
  if (!isValidDate(asOf)) throw new Error(`"${asOf}" is not a valid date (use YYYY-MM-DD)`);
  const batches: DemoBatch[] = BATCHES.map((b) => ({ id: demoBatchId(userId, b.key), key: b.key, name: b.name, coach: b.coach, weekdays: b.weekdays, fee: b.fee }));
  const students = buildStudents(asOf, userId, batches);
  return { asOf, batches, students, attendance: buildAttendance(asOf, batches, students), payments: buildPayments(asOf, students) };
}

/** Exactly the columns that exist in the database. owner_id is not sent: Supabase fills it in from the login. */
export function toRows(ds: Dataset) {
  return {
    batches: ds.batches.map((b) => ({ id: b.id, name: b.name })),
    students: ds.students.map((s) => ({
      id: s.id, name: s.name, batch_id: s.batch_id, coach: s.coach, parent_name: s.parent_name,
      parent_phone: s.parent_phone, monthly_fee: s.monthly_fee, joined_on: s.joined_on,
    })),
    attendance: ds.attendance.map((a) => ({ id: a.id, student_id: a.student_id, date: a.date, status: a.status })),
    payments: ds.payments.map((p) => ({ id: p.id, student_id: p.student_id, amount: p.amount, paid_on: p.paid_on, note: p.note })),
  };
}

/** What each behaviour should look like in the app on a given date (used by the tests and the preview). */
export function expectedStatus(profile: Profile, asOf: string): FeeStatus {
  const { day } = parts(asOf);
  switch (profile) {
    case "regular": case "late": case "ahead": return "paid";
    case "new_unpaid": return "due_soon";
    case "partial": case "behind1": return day > 5 ? "overdue" : "due_soon";
    default: return "overdue";
  }
}

export type Summary = {
  statusCounts: Record<FeeStatus, number>;
  totalOutstanding: number;
  studentsOwing: number;
  perBatch: { name: string; students: number; sessions: number; attendanceRows: number; presentPct: number }[];
  presentPct: number;
  markedToday: string[];
};

/** Balances and statuses computed with the APP's own fee functions from the generated students and payments. */
export function summarize(ds: Dataset): Summary {
  const paid = new Map<string, number>();
  for (const p of ds.payments) paid.set(p.student_id, (paid.get(p.student_id) ?? 0) + p.amount);
  const statusCounts: Record<FeeStatus, number> = { paid: 0, due_soon: 0, overdue: 0 };
  let totalOutstanding = 0;
  let studentsOwing = 0;
  for (const s of ds.students) {
    const total = paid.get(s.id) ?? 0;
    statusCounts[feeStatus(s.monthly_fee, s.joined_on, total, ds.asOf)]++;
    const owed = outstanding(s.monthly_fee, s.joined_on, total, ds.asOf);
    if (owed > 0) {
      totalOutstanding += owed;
      studentsOwing++;
    }
  }
  const batchOf = new Map(ds.students.map((s) => [s.id, s.batch_id]));
  const perBatch = ds.batches.map((b) => {
    const rows = ds.attendance.filter((a) => batchOf.get(a.student_id) === b.id);
    const present = rows.filter((r) => r.status === "present").length;
    return {
      name: b.name,
      students: ds.students.filter((s) => s.batch_id === b.id).length,
      sessions: new Set(rows.map((r) => r.date)).size,
      attendanceRows: rows.length,
      presentPct: rows.length ? Math.round((present / rows.length) * 100) : 0,
    };
  });
  const presentAll = ds.attendance.filter((a) => a.status === "present").length;
  const markedToday = ds.batches.filter((b) => ds.attendance.some((a) => a.date === ds.asOf && batchOf.get(a.student_id) === b.id)).map((b) => b.name);
  return {
    statusCounts, totalOutstanding, studentsOwing, perBatch,
    presentPct: ds.attendance.length ? Math.round((presentAll / ds.attendance.length) * 100) : 0,
    markedToday,
  };
}

/** Checks the dataset against the schema's rules. An empty list means it is valid. */
export function validateDataset(ds: Dataset): string[] {
  const problems: string[] = [];
  const phone = /^\+?[0-9 ]{10,14}$/; // the same check the Add student form uses
  const ids = new Set<string>();
  const dup = (id: string, what: string) => (ids.has(id) ? problems.push(`duplicate id: ${what}`) : ids.add(id));
  ds.batches.forEach((b) => dup(b.id, `batch ${b.key}`));
  ds.students.forEach((s) => dup(s.id, `student ${s.key}`));
  ds.attendance.forEach((a) => dup(a.id, `attendance ${a.date}`));
  ds.payments.forEach((p) => dup(p.id, `payment ${p.id}`));

  const batchIds = new Set(ds.batches.map((b) => b.id));
  const studentById = new Map(ds.students.map((s) => [s.id, s]));
  const names = new Set<string>();
  for (const s of ds.students) {
    if (!batchIds.has(s.batch_id)) problems.push(`${s.key}: batch missing`);
    if (!s.name.trim() || !s.coach.trim() || !s.parent_phone.trim()) problems.push(`${s.key}: required text empty`);
    if (!phone.test(s.parent_phone)) problems.push(`${s.key}: phone fails the app's check`);
    if (/^[6-9]/.test(s.parent_phone)) problems.push(`${s.key}: phone looks like a real mobile number`);
    if (!(s.monthly_fee >= 0)) problems.push(`${s.key}: negative fee`);
    if (!isValidDate(s.joined_on) || s.joined_on > ds.asOf) problems.push(`${s.key}: bad joined_on ${s.joined_on}`);
    const nm = normalizeName(s.name);
    if (names.has(nm)) problems.push(`duplicate name ${s.name}`);
    names.add(nm);
  }
  const seenAtt = new Set<string>();
  for (const a of ds.attendance) {
    const s = studentById.get(a.student_id);
    if (!s) { problems.push("attendance: student missing"); continue; }
    if (a.status !== "present" && a.status !== "absent") problems.push(`attendance: bad status ${a.status}`);
    if (!isValidDate(a.date) || a.date > ds.asOf) problems.push(`attendance: bad or future date ${a.date}`);
    if (a.date < s.joined_on) problems.push(`attendance before joining: ${s.key} ${a.date}`);
    const k = `${a.student_id}|${a.date}`;
    if (seenAtt.has(k)) problems.push(`attendance: duplicate student+date ${k}`);
    seenAtt.add(k);
  }
  for (const p of ds.payments) {
    const s = studentById.get(p.student_id);
    if (!s) { problems.push("payment: student missing"); continue; }
    if (!(p.amount > 0)) problems.push(`payment: amount not above 0 (${p.id})`);
    if (!isValidDate(p.paid_on) || p.paid_on > ds.asOf) problems.push(`payment: bad or future date ${p.paid_on}`);
    if (p.paid_on < s.joined_on) problems.push(`payment before joining: ${s.key} ${p.paid_on}`);
  }
  return problems;
}
