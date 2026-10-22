"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { rupees, todayString } from "@/lib/fees";
import { fetchAll } from "@/lib/fetchAll";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { buildRows, type ListRow, type StudentRow } from "@/lib/studentList";
import {
  DASHBOARD_PERIODS, admissionsInPeriod, attendanceByBatch, feeStatusBreakdown, lowAttendanceStudents, paymentsInPeriod,
  periodStart, summarizeAttendance, summarizeDashboard,
  type AttendanceMark, type DashboardPeriod, type PaymentWithDate,
} from "@/lib/dashboard";
import { button, buttonLight, td, th } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorBox from "@/components/ErrorBox";
import FeeStatusBadge from "@/components/FeeStatusBadge";
import Icon from "@/components/ui/Icon";
import LoadingState from "@/components/ui/LoadingState";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import PeriodSelect from "@/components/dashboard/PeriodSelect";
import FeeStatusCard from "@/components/dashboard/FeeStatusCard";
import { BatchAttendanceCard, NeedsAttentionCard } from "@/components/dashboard/BatchAttendance";
import { useNotifications } from "@/components/NotificationsProvider";
import { formatTime, shortDate, whenText } from "@/lib/events";

const SHOW_OVERDUE = 6;

const short = (d: string, withYear = false) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export default function DashboardPage() {
  const guard = useSessionGuard();
  const { events, eventsState } = useNotifications();
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentWithDate[]>([]);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [marks, setMarks] = useState<AttendanceMark[] | null>(null);
  const [marksError, setMarksError] = useState("");
  const latestMarks = useRef(0); // ignore an answer that arrives after you picked another period

  // Students and payments: loaded once. They do not change with the period.
  const load = useCallback(async () => {
    setError("");
    setRows(null);
    const db = createClient();
    const day = todayString();
    const [s, p] = await Promise.all([
      db.from("students").select("id,name,coach,monthly_fee,joined_on,batch_id,batches(name)"),
      fetchAll<PaymentWithDate>((from, to) => db.from("fee_payments").select("student_id,amount,paid_on").order("id").range(from, to)),
    ]);
    if (s.error || p.error) {
      if (await guard(s.error ?? p.error)) return;
      return setError("Couldn't load the dashboard. Please try again.");
    }
    setPayments(p.data);
    setToday(day);
    setRows(buildRows(s.data as unknown as StudentRow[], p.data, day));
  }, [guard]);

  // Attendance marks for the chosen period: read again whenever the period changes.
  const loadMarks = useCallback(async () => {
    if (!today) return;
    const mine = ++latestMarks.current;
    setMarksError("");
    setMarks(null);
    const start = periodStart(period, today);
    // Read in pages: six months of marks can be far more than the 1,000 rows one request returns.
    const { data, error: err } = await fetchAll<AttendanceMark>((from, to) =>
      createClient().from("attendance").select("student_id,status,date").gte("date", start).lte("date", today).order("id").range(from, to),
    );
    if (mine !== latestMarks.current) return;
    if (err) {
      if (await guard(err)) return;
      return setMarksError("Couldn't load attendance. Please try again.");
    }
    setMarks(data);
  }, [period, today, guard]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadMarks();
  }, [loadMarks]);

  const start = today ? periodStart(period, today) : "";
  const periodLabel = DASHBOARD_PERIODS.find((p) => p.value === period)!.label;
  const periodText = period === "today" ? "Today" : `${periodLabel}: ${short(start)} to ${short(today, true)}`;

  const base = useMemo(() => (rows ? summarizeDashboard(rows, []) : null), [rows]); // totals and the overdue list (as of today)
  const breakdown = useMemo(() => (rows ? feeStatusBreakdown(rows) : null), [rows]);
  const collected = useMemo(() => (today ? paymentsInPeriod(payments, start, today) : null), [payments, start, today]);
  const admissions = useMemo(() => (rows && today ? admissionsInPeriod(rows, start, today) : []), [rows, start, today]);
  const attendance = useMemo(() => (marks && base ? summarizeAttendance(marks, base.students) : null), [marks, base]);
  const byBatch = useMemo(() => (rows && marks ? attendanceByBatch(rows, marks) : null), [rows, marks]);
  const low = useMemo(() => (rows && marks ? lowAttendanceStudents(rows, marks) : []), [rows, marks]);

  // The attendance card's words depend on the period.
  let attValue: React.ReactNode = <span className="text-base font-normal text-slate-600">Loading…</span>;
  let attHint: React.ReactNode = undefined;
  if (marksError) {
    attValue = "—";
    attHint = (
      <>
        {marksError}{" "}
        <button onClick={loadMarks} className="font-medium underline">
          Retry
        </button>
      </>
    );
  } else if (attendance && base) {
    if (period === "today") {
      attValue = `${attendance.present} present`;
      attHint = attendance.total === 0 ? `Not marked yet today (${base.students} students)` : `${attendance.absent} absent · ${attendance.notMarked} not marked yet`;
    } else if (attendance.total === 0) {
      attValue = "—";
      attHint = "No attendance recorded in this period";
    } else {
      attValue = `${attendance.presentPct}% present`;
      attHint = `${attendance.present} present · ${attendance.absent} absent across ${attendance.sessionDays} day${attendance.sessionDays === 1 ? "" : "s"}`;
    }
  }

  const names = admissions.slice(0, 3).map((r) => r.name.split(" ")[0]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={today ? `Your academy at a glance. Period: ${periodText}.` : "Your academy at a glance."}
        actions={<PeriodSelect value={period} onChange={setPeriod} />}
      />

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && rows === null && <LoadingState label="Loading your dashboard…" />}

      {rows && rows.length === 0 && (
        <Card>
          <EmptyState
            icon="users"
            title="No students yet"
            action={
              <Link href="/students/new" className={button}>
                <Icon name="plus" className="h-4 w-4" />
                Add your first student
              </Link>
            }
          >
            Add a student to start tracking attendance and fees. You can create a batch on the same page.
          </EmptyState>
        </Card>
      )}

      {rows && base && breakdown && collected && rows.length > 0 && (
        <div className="space-y-6">
          <p className="-mt-2 text-xs text-slate-500">
            The period applies to new admissions, attendance and fees collected. Total students, outstanding fees and fee status are always as of today.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Total students" icon="users" value={base.students} hint={`${base.batches} batch${base.batches === 1 ? "" : "es"} · now`} />
            <StatCard
              label="New admissions"
              icon="plus"
              tone="good"
              value={admissions.length}
              hint={
                admissions.length === 0
                  ? "No new students in this period"
                  : `${names.join(", ")}${admissions.length > 3 ? ` and ${admissions.length - 3} more` : ""} joined`
              }
            />
            <StatCard label="Attendance" icon="userCheck" tone="good" value={attValue} hint={attHint} />
            <StatCard
              label="Fees collected"
              icon="rupee"
              tone="good"
              value={rupees(collected.total)}
              hint={collected.count === 0 ? "No payments recorded in this period" : `From ${collected.count} payment${collected.count === 1 ? "" : "s"} in this period`}
            />
            <StatCard
              label="Outstanding fees"
              icon="rupee"
              tone={base.overdue.length > 0 ? "bad" : "neutral"}
              value={rupees(base.totalOutstanding)}
              hint={
                base.studentsOwing === 0
                  ? "Nothing outstanding · now"
                  : `${base.studentsOwing} student${base.studentsOwing === 1 ? "" : "s"} owe fees · now`
              }
            />
            <FeeStatusCard breakdown={breakdown} />
          </div>

          {/* Two columns that each fill their height: the last card in each column grows, so there are no gaps. */}
          <div className="grid items-stretch gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Card
                flush
                title="Overdue fees"
                description="Unpaid fees past their due date, largest first."
                actions={
                  <Link href="/students?status=overdue" className="text-sm font-medium text-emerald-800 hover:underline">
                    See all overdue
                  </Link>
                }
              >
                {base.overdue.length === 0 ? (
                  <EmptyState icon="checkCircle" title="No overdue fees">
                    Every student is paid up or still within their due date.
                  </EmptyState>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">Students with overdue fees</caption>
                        <thead className="border-b border-slate-200 bg-slate-50">
                          <tr>
                            <th scope="col" className={th}>Student</th>
                            <th scope="col" className={th + " text-right"}>Outstanding</th>
                            <th scope="col" className={th}>Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {base.overdue.slice(0, SHOW_OVERDUE).map((r) => (
                            <tr key={r.id} className="hover:bg-slate-50">
                              <td className={td}>
                                <Link href={`/students/${r.id}`} className="flex items-center gap-3 rounded-md">
                                  <Avatar name={r.name} size="sm" />
                                  <span>
                                    <span className="block font-medium text-slate-900 hover:text-emerald-800">{r.name}</span>
                                    <span className="block text-xs text-slate-500">{r.batchName}</span>
                                  </span>
                                </Link>
                              </td>
                              <td className={td + " text-right font-medium tabular-nums text-slate-900"}>{rupees(r.owed)}</td>
                              <td className={td}>
                                <FeeStatusBadge status={r.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {base.overdue.length > SHOW_OVERDUE && (
                      <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                        Showing {SHOW_OVERDUE} of {base.overdue.length} overdue students.{" "}
                        <Link href="/students?status=overdue" className="font-medium text-emerald-800 hover:underline">
                          See everyone
                        </Link>
                      </p>
                    )}
                  </>
                )}
              </Card>

              {marksError ? (
                <Card className="flex-1" title="Attendance by batch">
                  <p className="text-sm text-red-800">
                    {marksError}{" "}
                    <button onClick={loadMarks} className="font-medium underline">
                      Retry
                    </button>
                  </p>
                </Card>
              ) : byBatch === null ? (
                <Card className="flex-1" title="Attendance by batch">
                  <LoadingState label="Loading attendance…" />
                </Card>
              ) : (
                <BatchAttendanceCard className="flex-1" batches={byBatch} periodText={periodText} />
              )}
            </div>

            <div className="flex flex-col gap-6">
              <Card title="Quick actions" description="The two jobs staff do most.">
                <div className="flex flex-col gap-2">
                  <Link href="/students/new" className={button}>
                    <Icon name="plus" className="h-4 w-4" />
                    Add student
                  </Link>
                  <Link href="/attendance" className={buttonLight}>
                    <Icon name="calendarCheck" className="h-4 w-4" />
                    Mark attendance
                  </Link>
                </div>
              </Card>

              <Card
                className="flex-1"
                title="Upcoming events"
                actions={
                  <Link href="/events" className="text-sm font-medium text-emerald-800 hover:underline">
                    All events
                  </Link>
                }
              >
                {eventsState === "missing" ? (
                  <p className="text-sm text-slate-600">Events aren&apos;t set up yet. Open the Events page to see the one-time setup.</p>
                ) : eventsState === "error" ? (
                  <p className="text-sm text-slate-600">Events couldn&apos;t be loaded just now.</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No upcoming events.{" "}
                    <Link href="/events" className="font-medium text-emerald-800 hover:underline">
                      Add one
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {events.slice(0, 5).map((e) => (
                      <li key={e.id}>
                        <Link href="/events" className="block rounded-lg hover:bg-slate-50">
                          <span className="block text-sm font-medium text-slate-900">{e.title}</span>
                          <span className="block text-xs text-slate-600">
                            {whenText(e.event_date, today || e.event_date)} ({shortDate(e.event_date)})
                            {e.event_time ? ` · ${formatTime(e.event_time)}` : ""}
                            {` · ${e.batches?.name ?? "All batches"}`}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {/* Needs attention uses the full width */}
            {marksError ? (
              <Card title="Needs attention">
                <p className="text-sm text-slate-600">Attendance could not be loaded.</p>
              </Card>
            ) : marks === null ? (
              <Card title="Needs attention">
                <LoadingState label="Loading attendance…" />
              </Card>
            ) : (
              <NeedsAttentionCard students={low} anyMarks={marks.length > 0} />
            )}
        </div>
      )}
    </div>
  );
}
