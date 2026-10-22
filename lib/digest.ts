import { monthsOverdue, outstanding } from "./fees";

// The only data sent to the AI: counts and balances, no phone numbers or parent names.
export type Digest = {
  windowDays: number;
  totals: { students: number; totalOutstanding: number; batches: number };
  students: {
    label: string; // first name + last initial, e.g. "Aarav K."
    batch: string;
    sessions: number;
    present: number;
    attendancePct: number | null;
    outstanding: number;
    monthsOverdue: number;
  }[];
};

type S = { id: string; name: string; monthly_fee: number; joined_on: string; batches: { name: string } | null };
type A = { student_id: string; status: string };
type P = { student_id: string; amount: number };

export function studentLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

export function buildDigest(students: S[], recentAttendance: A[], payments: P[], today: string, windowDays: number): Digest {
  const rows = students.map((s) => {
    const mine = recentAttendance.filter((a) => a.student_id === s.id);
    const present = mine.filter((a) => a.status === "present").length;
    const paid = payments.filter((p) => p.student_id === s.id).reduce((sum, p) => sum + Number(p.amount), 0);
    const owed = outstanding(Number(s.monthly_fee), s.joined_on, paid, today);
    return {
      label: studentLabel(s.name),
      batch: s.batches?.name ?? "No batch",
      sessions: mine.length,
      present,
      attendancePct: mine.length ? Math.round((present / mine.length) * 100) : null,
      outstanding: owed,
      monthsOverdue: monthsOverdue(Number(s.monthly_fee), owed),
    };
  });
  return {
    windowDays,
    totals: {
      students: rows.length,
      totalOutstanding: rows.reduce((sum, r) => sum + Math.max(0, r.outstanding), 0),
      batches: new Set(rows.map((r) => r.batch)).size,
    },
    students: rows,
  };
}
