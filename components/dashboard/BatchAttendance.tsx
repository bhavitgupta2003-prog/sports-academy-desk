import Link from "next/link";
import { td, th } from "@/lib/ui";
import { LOW_ATTENDANCE_PCT, MIN_MARKS_TO_JUDGE, type BatchAttendance, type LowAttendance } from "@/lib/dashboard";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

// Attendance rate for each batch in the chosen period, lowest first.
export function BatchAttendanceCard({ batches, periodText, className = "" }: { batches: BatchAttendance[]; periodText: string; className?: string }) {
  const anyMarks = batches.some((b) => b.total > 0);
  return (
    <Card flush className={className} title="Attendance by batch" description={`${periodText}. Lowest attendance first.`}>
      {!anyMarks ? (
        <EmptyState icon="calendarCheck" title="No attendance recorded in this period">
          Mark attendance from the Attendance page and it will show up here.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Attendance rate for each batch in the chosen period</caption>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th scope="col" className={th}>Batch</th>
                <th scope="col" className={th + " text-right"}>Students</th>
                <th scope="col" className={th + " text-right"}>Present</th>
                <th scope="col" className={th + " text-right"}>Absent</th>
                <th scope="col" className={th + " text-right"}>Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.batchId}>
                  <td className={td + " font-medium text-slate-900"}>{b.name}</td>
                  <td className={td + " text-right tabular-nums text-slate-700"}>{b.students}</td>
                  <td className={td + " text-right tabular-nums text-slate-700"}>{b.present}</td>
                  <td className={td + " text-right tabular-nums text-slate-700"}>{b.absent}</td>
                  <td className={td + " text-right"}>
                    {b.pct === null ? (
                      <span className="text-slate-500">No marks</span>
                    ) : (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span aria-hidden="true" className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 sm:block">
                          <span className={`block h-full ${b.pct < LOW_ATTENDANCE_PCT ? "bg-red-600" : "bg-emerald-600"}`} style={{ width: `${b.pct}%` }} />
                        </span>
                        <span className="font-medium tabular-nums text-slate-900">{b.pct}%</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Students whose attendance in the period is below the cut-off.
export function NeedsAttentionCard({ students, anyMarks }: { students: LowAttendance[]; anyMarks: boolean }) {
  return (
    <Card flush title="Needs attention" description={`Attendance below ${LOW_ATTENDANCE_PCT}% (at least ${MIN_MARKS_TO_JUDGE} marks) in this period.`}>
      {!anyMarks ? (
        <EmptyState icon="calendarCheck" title="Nothing to judge yet">
          There is no attendance recorded in this period.
        </EmptyState>
      ) : students.length === 0 ? (
        <EmptyState icon="checkCircle" title="No one is below the cut-off">
          Every student with enough marks is at {LOW_ATTENDANCE_PCT}% or better.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => (
            <li key={s.id}>
              <Link href={`/students/${s.id}`} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 hover:bg-slate-50">
                <Avatar name={s.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{s.name}</span>
                  <span className="block truncate text-xs text-slate-500">{s.batchName}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-red-800">{s.pct}%</span>
                  <span className="block text-xs tabular-nums text-slate-500">{s.present} of {s.total}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
