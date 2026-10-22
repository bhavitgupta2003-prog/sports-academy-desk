// Works out the notifications from your real records each time the app opens. Nothing is stored or sent anywhere.
// The fee statuses come from the app's own fee rules; attendance uses the same cut-offs as the dashboard.

import { earliestUnpaidDueDate, monthsOverdue, rupees } from "./fees.ts";
import { LOW_ATTENDANCE_PCT, MIN_MARKS_TO_JUDGE, lowAttendanceStudents, periodStart, type AttendanceMark } from "./dashboard.ts";
import { daysUntil, formatTime, shortDate, whenText, type EventRow } from "./events.ts";
import type { ListRow } from "./studentList.ts";

export type NotificationKind = "fee_overdue" | "fee_due_soon" | "low_attendance" | "event";
export type Severity = "high" | "medium" | "info";

export type NotificationItem = {
  id: string; // stays the same while the situation is the same, so a dismissed one stays dismissed
  kind: NotificationKind;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
};

export const EVENT_LOOKAHEAD_DAYS = 7; // events within this many days (and today) are shown
export const ATTENDANCE_LOOKBACK = "month" as const; // low attendance is judged over the last month

/** First day of the attendance window used for the low-attendance notifications. */
export const attendanceWindowStart = (today: string) => periodStart(ATTENDANCE_LOOKBACK, today);

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
const KIND_RANK: Record<NotificationKind, number> = { fee_overdue: 0, fee_due_soon: 1, low_attendance: 2, event: 3 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildNotifications(input: { rows: ListRow[]; marks: AttendanceMark[]; events: EventRow[]; today: string }): NotificationItem[] {
  const { rows, marks, events, today } = input;
  const items: (NotificationItem & { order: number | string })[] = [];

  for (const r of rows) {
    if (r.status === "overdue") {
      const months = monthsOverdue(r.monthly_fee, r.owed);
      items.push({
        id: `fee_overdue:${r.id}:${months}`,
        kind: "fee_overdue",
        severity: "high",
        title: `${r.name}'s fee is overdue`,
        detail: `${rupees(r.owed)} outstanding · ${plural(months, "month")} overdue · ${r.batchName}`,
        href: `/students/${r.id}`,
        actionLabel: "Open student",
        order: -r.owed, // biggest balance first
      });
    } else if (r.status === "due_soon") {
      const due = earliestUnpaidDueDate(r.monthly_fee, r.joined_on, r.paid, today);
      if (!due) continue;
      items.push({
        id: `fee_due_soon:${r.id}:${due}`,
        kind: "fee_due_soon",
        severity: "medium",
        title: `${r.name}'s fee is due ${whenText(due, today)}`,
        detail: `${rupees(r.owed)} due on ${shortDate(due)} · ${r.batchName}`,
        href: `/students/${r.id}`,
        actionLabel: "Open student",
        order: due, // soonest first
      });
    }
  }

  for (const l of lowAttendanceStudents(rows, marks, 1000)) {
    items.push({
      id: `low_attendance:${l.id}:${today.slice(0, 7)}`, // asked again each month
      kind: "low_attendance",
      severity: "medium",
      title: `${l.name} has low attendance`,
      detail: `${l.pct}% present (${l.present} of ${l.total} sessions) in the last month · ${l.batchName}`,
      href: `/students/${l.id}`,
      actionLabel: "Open student",
      order: l.pct, // lowest first
    });
  }

  for (const e of events) {
    const days = daysUntil(e.event_date, today);
    if (days < 0 || days > EVENT_LOOKAHEAD_DAYS) continue;
    items.push({
      id: `event:${e.id}`,
      kind: "event",
      severity: days <= 1 ? "medium" : "info",
      title: e.title,
      detail: [whenText(e.event_date, today) + (days > 1 ? ` (${shortDate(e.event_date)})` : ""), formatTime(e.event_time), e.location, e.batches?.name ?? "All batches"].filter(Boolean).join(" · "),
      href: "/events",
      actionLabel: "Open events",
      order: `${e.event_date} ${e.event_time ?? "99:99"}`,
    });
  }

  return items
    .sort((a, b) => {
      if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (KIND_RANK[a.kind] !== KIND_RANK[b.kind]) return KIND_RANK[a.kind] - KIND_RANK[b.kind];
      if (typeof a.order === "number" && typeof b.order === "number" && a.order !== b.order) return a.order - b.order;
      if (typeof a.order === "string" && typeof b.order === "string" && a.order !== b.order) return a.order < b.order ? -1 : 1;
      return a.title.localeCompare(b.title);
    })
    .map(({ order, ...item }) => {
      void order;
      return item;
    });
}

export { LOW_ATTENDANCE_PCT, MIN_MARKS_TO_JUDGE };
