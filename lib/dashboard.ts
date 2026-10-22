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
