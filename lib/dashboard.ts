import { addDays } from "./fees.ts";
import type { ListRow } from "./studentList.ts";

// Turns the rows the Students list already builds (using the shared fee functions) into the
// dashboard's headline numbers. It only counts and adds; it does no fee maths of its own.

export type MarkRow = { student_id: string; status: string };

export type DashboardSummary = {
  students: number;
  batches: number;
  present: number;
  absent: number;
  notMarked: number;
  totalOutstanding: number;
  studentsOwing: number;
  overdue: ListRow[]; // biggest balance first
};

export function summarizeDashboard(rows: ListRow[], todayMarks: MarkRow[]): DashboardSummary {
  const ids = new Set(rows.map((r) => r.id));
  const markOf = new Map<string, string>();
  for (const m of todayMarks) if (ids.has(m.student_id)) markOf.set(m.student_id, m.status); // one mark per student

  let present = 0;
  let absent = 0;
  for (const status of markOf.values()) {
    if (status === "present") present++;
    else if (status === "absent") absent++;
  }

  return {
    students: rows.length,
    batches: new Set(rows.map((r) => r.batch_id)).size,
    present,
    absent,
    notMarked: rows.length - present - absent,
    totalOutstanding: rows.reduce((sum, r) => sum + Math.max(0, r.owed), 0),
    studentsOwing: rows.filter((r) => r.owed > 0).length,
    overdue: rows.filter((r) => r.status === "overdue").sort((a, b) => b.owed - a.owed),
  };
}

// ---------- The dashboard's period (today, 7 days, month, 3 or 6 months) ----------

export type DashboardPeriod = "today" | "week" | "month" | "quarter" | "half";

export const DASHBOARD_PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "month", label: "Last month" },
  { value: "quarter", label: "Last 3 months" },
  { value: "half", label: "Last 6 months" },
];

const MONTHS_BACK: Record<"month" | "quarter" | "half", number> = { month: 1, quarter: 3, half: 6 };

/** The same day-of-month, n calendar months earlier (31 Aug minus 6 months is 28/29 Feb). */
function sameDayMonthsAgo(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const idx = y * 12 + (m - 1) - n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * First day (inclusive) of the period that ends today.
 * "Last 7 days" = today and the 6 days before. "Last month" = the day after this date a month ago, through today.
 */
export function periodStart(period: DashboardPeriod, today: string): string {
  if (period === "today") return today;
  if (period === "week") return addDays(today, -6);
  return addDays(sameDayMonthsAgo(today, MONTHS_BACK[period]), 1);
}

export type AttendanceMark = { student_id: string; status: string; date: string };

export type AttendanceSummary = {
  present: number;
  absent: number;
  total: number; // marks recorded in the period
  presentPct: number | null; // null when nothing was recorded
  sessionDays: number; // different dates with at least one mark
  studentsMarked: number; // different students with at least one mark
  notMarked: number; // students with no mark at all in the period
};

/** Only counts and percentages: present and absent marks as recorded. No other maths. */
export function summarizeAttendance(marks: AttendanceMark[], totalStudents: number): AttendanceSummary {
  let present = 0;
  let absent = 0;
  const days = new Set<string>();
  const students = new Set<string>();
  for (const m of marks) {
    if (m.status === "present") present++;
    else if (m.status === "absent") absent++;
    else continue;
    days.add(m.date);
    students.add(m.student_id);
  }
  const total = present + absent;
  return {
    present,
    absent,
    total,
    presentPct: total ? Math.round((present / total) * 100) : null,
    sessionDays: days.size,
    studentsMarked: students.size,
    notMarked: Math.max(0, totalStudents - students.size),
  };
}

// ---------- Fees collected, new admissions, fee-status breakdown ----------

export type PaymentWithDate = { student_id: string; amount: number; paid_on: string };

/** Payments recorded between start and end (both included), added up in whole paise. */
export function paymentsInPeriod(payments: PaymentWithDate[], start: string, end: string): { total: number; count: number } {
  let paise = 0;
  let count = 0;
  for (const p of payments) {
    if (p.paid_on >= start && p.paid_on <= end) {
      paise += Math.round(Number(p.amount) * 100);
      count++;
    }
  }
  return { total: paise / 100, count };
}

/** Students who joined between start and end (both included), newest first. */
export function admissionsInPeriod(rows: ListRow[], start: string, end: string): ListRow[] {
  return rows
    .filter((r) => r.joined_on >= start && r.joined_on <= end)
    .sort((a, b) => (a.joined_on < b.joined_on ? 1 : a.joined_on > b.joined_on ? -1 : a.name.localeCompare(b.name)));
}

export type StatusBreakdown = { paid: number; dueSoon: number; overdue: number; total: number; paidUpPct: number | null };

/** How many students are in each fee status. The statuses themselves come from the app's fee rules (lib/fees.ts). */
export function feeStatusBreakdown(rows: ListRow[]): StatusBreakdown {
  const paid = rows.filter((r) => r.status === "paid").length;
  const dueSoon = rows.filter((r) => r.status === "due_soon").length;
  const overdue = rows.filter((r) => r.status === "overdue").length;
  return { paid, dueSoon, overdue, total: rows.length, paidUpPct: rows.length ? Math.round((paid / rows.length) * 100) : null };
}

// ---------- Attendance by batch, and students who need attention ----------

export type BatchAttendance = {
  batchId: string;
  name: string;
  students: number;
  present: number;
  absent: number;
  total: number;
  pct: number | null; // null when the batch has no marks in the period
  sessionDays: number;
};

/** One row per batch, lowest attendance first (batches with no marks last). */
export function attendanceByBatch(rows: ListRow[], marks: AttendanceMark[]): BatchAttendance[] {
  const batchOf = new Map(rows.map((r) => [r.id, r.batch_id]));
  const acc = new Map<string, BatchAttendance & { days: Set<string> }>();
  for (const r of rows) {
    if (!acc.has(r.batch_id)) acc.set(r.batch_id, { batchId: r.batch_id, name: r.batchName, students: 0, present: 0, absent: 0, total: 0, pct: null, sessionDays: 0, days: new Set() });
    acc.get(r.batch_id)!.students++;
  }
  for (const m of marks) {
    const b = acc.get(batchOf.get(m.student_id) ?? "");
    if (!b) continue;
    if (m.status === "present") b.present++;
    else if (m.status === "absent") b.absent++;
    else continue;
    b.days.add(m.date);
  }
  return [...acc.values()]
    .map(({ days, ...b }) => ({ ...b, total: b.present + b.absent, pct: b.present + b.absent ? Math.round((b.present / (b.present + b.absent)) * 100) : null, sessionDays: days.size }))
    .sort((a, b) => (a.pct === null ? 1 : b.pct === null ? -1 : a.pct - b.pct) || a.name.localeCompare(b.name));
}

export const LOW_ATTENDANCE_PCT = 60; // below this share of sessions present
export const MIN_MARKS_TO_JUDGE = 3; // fewer marks than this is too little to say anything

export type LowAttendance = { id: string; name: string; batchName: string; present: number; total: number; pct: number };

/** Students whose attendance in the period is below LOW_ATTENDANCE_PCT, worst first. */
export function lowAttendanceStudents(rows: ListRow[], marks: AttendanceMark[], limit = 8): LowAttendance[] {
  const tally = new Map<string, { present: number; total: number }>();
  for (const m of marks) {
    if (m.status !== "present" && m.status !== "absent") continue;
    const t = tally.get(m.student_id) ?? { present: 0, total: 0 };
    t.total++;
    if (m.status === "present") t.present++;
    tally.set(m.student_id, t);
  }
  const out: LowAttendance[] = [];
  for (const r of rows) {
    const t = tally.get(r.id);
    if (!t || t.total < MIN_MARKS_TO_JUDGE) continue;
    const pct = Math.round((t.present / t.total) * 100);
    if (pct < LOW_ATTENDANCE_PCT) out.push({ id: r.id, name: r.name, batchName: r.batchName, present: t.present, total: t.total, pct });
  }
  return out.sort((a, b) => a.pct - b.pct || b.total - a.total || a.name.localeCompare(b.name)).slice(0, limit);
}
