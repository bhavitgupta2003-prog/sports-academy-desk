// Filtering for the Attendance page. Works on what is already on screen: the students and today's marks.

export type AttendanceStatusFilter = "all" | "not_marked" | "marked" | "present" | "absent";

export const STATUS_FILTERS: { value: AttendanceStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_marked", label: "Not marked" },
  { value: "marked", label: "Marked" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
];

export type AttendanceCounts = Record<AttendanceStatusFilter, number>;

/** marks maps a student id to "present" or "absent". A student with no entry has not been marked. */
export function attendanceCounts(students: { id: string }[], marks: Record<string, string>): AttendanceCounts {
  const c: AttendanceCounts = { all: students.length, not_marked: 0, marked: 0, present: 0, absent: 0 };
  for (const s of students) {
    const m = marks[s.id];
    if (m === "present") {
      c.present++;
      c.marked++;
    } else if (m === "absent") {
      c.absent++;
      c.marked++;
    } else c.not_marked++;
  }
  return c;
}

/** Keeps the students that match BOTH the search text (part of the name, ignoring case) and the status. */
export function filterAttendance<T extends { id: string; name: string }>(
  students: T[],
  marks: Record<string, string>,
  f: { search: string; status: AttendanceStatusFilter },
): T[] {
  const q = f.search.trim().toLowerCase();
  return students.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q)) return false;
    const m = marks[s.id];
    switch (f.status) {
      case "not_marked": return m !== "present" && m !== "absent";
      case "marked": return m === "present" || m === "absent";
      case "present": return m === "present";
      case "absent": return m === "absent";
      default: return true;
    }
  });
}
