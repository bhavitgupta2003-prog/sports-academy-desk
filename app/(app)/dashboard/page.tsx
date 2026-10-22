"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { rupees, todayString } from "@/lib/fees";
import { fetchAll } from "@/lib/fetchAll";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { buildRows, type PaymentRow, type StudentRow } from "@/lib/studentList";
import { summarizeDashboard, type DashboardSummary } from "@/lib/dashboard";
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

const SHOW_OVERDUE = 6;

export default function DashboardPage() {
  const guard = useSessionGuard();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [today, setToday] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setSummary(null);
    const db = createClient();
    const day = todayString();
    const [s, p, a] = await Promise.all([
      db.from("students").select("id,name,coach,monthly_fee,joined_on,batch_id,batches(name)"),
      fetchAll<PaymentRow>((from, to) => db.from("fee_payments").select("student_id,amount").order("id").range(from, to)),
      db.from("attendance").select("student_id,status").eq("date", day),
    ]);
    if (s.error || p.error || a.error) {
      if (await guard(s.error ?? p.error ?? a.error)) return;
      return setError("Couldn't load the dashboard. Please try again.");
    }
    const rows = buildRows(s.data as unknown as StudentRow[], p.data as PaymentRow[], day);
    setToday(day);
    setSummary(summarizeDashboard(rows, a.data));
  }, [guard]);

  useEffect(() => {
    load();
  }, [load]);

  const dateLabel = today
    ? new Date(today + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";

  return (
    <div>
      <PageHeader title="Dashboard" description={dateLabel ? `Your academy today, ${dateLabel}.` : "Your academy at a glance."} />

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && summary === null && <LoadingState label="Loading your dashboard…" />}

      {summary && summary.students === 0 && (
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

      {summary && summary.students > 0 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Total students"
              icon="users"
              value={summary.students}
              hint={`${summary.batches} batch${summary.batches === 1 ? "" : "es"}`}
            />
            <StatCard
              label="Today's attendance"
              icon="userCheck"
              tone="good"
              value={`${summary.present} present`}
              hint={
                summary.present + summary.absent === 0
                  ? `Not marked yet today (${summary.students} students)`
                  : `${summary.absent} absent · ${summary.notMarked} not marked yet`
              }
            />
            <StatCard
              label="Outstanding fees"
              icon="rupee"
              tone={summary.overdue.length > 0 ? "bad" : "neutral"}
              value={rupees(summary.totalOutstanding)}
              hint={
                summary.studentsOwing === 0
                  ? "Nothing outstanding"
                  : `${summary.studentsOwing} student${summary.studentsOwing === 1 ? "" : "s"} owe fees`
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card
                flush
                title="Overdue fees"
                description="Unpaid fees past their due date, largest first."
                actions={
                  <Link href="/students" className="text-sm font-medium text-emerald-800 hover:underline">
                    All students
                  </Link>
                }
              >
                {summary.overdue.length === 0 ? (
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
                          {summary.overdue.slice(0, SHOW_OVERDUE).map((r) => (
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
                    {summary.overdue.length > SHOW_OVERDUE && (
                      <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                        Showing {SHOW_OVERDUE} of {summary.overdue.length} overdue students.{" "}
                        <Link href="/students" className="font-medium text-emerald-800 hover:underline">
                          See everyone
                        </Link>
                      </p>
                    )}
                  </>
                )}
              </Card>
            </div>

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
          </div>
        </div>
      )}
    </div>
  );
}
