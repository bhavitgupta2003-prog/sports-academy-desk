"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ErrorBox from "@/components/ErrorBox";
import FeeStatusBadge from "@/components/FeeStatusBadge";
import { button, buttonLight, cardFlush, input, label, td, th } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import LoadingState from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import { rupees, todayString } from "@/lib/fees";
import { fetchAll } from "@/lib/fetchAll";
import { useSessionGuard } from "@/lib/useSessionGuard";
import { buildRows, filterRows, noFilters, type Filters, type ListRow, type PaymentRow, type StudentRow } from "@/lib/studentList";

export default function StudentsPage() {
  const guard = useSessionGuard();
  const [notice, setNotice] = useState("");
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<Filters>(noFilters);

  const load = useCallback(async () => {
    setError("");
    setRows(null);
    const db = createClient();
    const [s, p] = await Promise.all([
      db.from("students").select("id,name,coach,monthly_fee,joined_on,batch_id,batches(name)").order("name"),
      fetchAll<PaymentRow>((from, to) => db.from("fee_payments").select("student_id,amount").order("id").range(from, to)),
    ]);
    if (s.error || p.error) {
      if (await guard(s.error ?? p.error)) return;
      return setError("Couldn't load students. Please try again.");
    }
    setRows(buildRows(s.data as unknown as StudentRow[], p.data as PaymentRow[], todayString()));
  }, [guard]);

  useEffect(() => {
    // After Add student we arrive with ?added=1: show a success message once, then tidy the address.
    if (new URLSearchParams(window.location.search).get("added") === "1") {
      setNotice("Student added successfully.");
      window.history.replaceState(null, "", "/students");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const batches = useMemo(() => {
    const m = new Map<string, string>();
    rows?.forEach((r) => m.set(r.batch_id, r.batchName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = useMemo(() => (rows ? filterRows(rows, filters) : []), [rows, filters]);
  const filtering = filters.search.trim() !== "" || filters.batchId !== "" || filters.status !== "all";

  return (
    <div>
      <PageHeader
        title="Students"
        description="Everyone enrolled, with fees and fee status. Search or filter to find someone quickly."
        actions={
          <Link href="/students/new" className={button}>
            <Icon name="plus" className="h-4 w-4" />
            Add student
          </Link>
        }
      />

      {notice && <Notice tone="success" className="mb-4">{notice}</Notice>}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && rows === null && <LoadingState label="Loading students…" />}

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
            Get started in 3 steps: add a student (you can create a batch on that page), mark attendance, then record a fee payment from a student page.
          </EmptyState>
        </Card>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="search">Search by name</label>
              <div className="relative">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="search"
                  className={input + " pl-9"}
                  placeholder="Type a name…"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className={label} htmlFor="batch">Batch</label>
              <select id="batch" className={input} value={filters.batchId} onChange={(e) => setFilters((f) => ({ ...f, batchId: e.target.value }))}>
                <option value="">All batches</option>
                {batches.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="status">Fee status</label>
              <select
                id="status"
                className={input}
                value={filters.status}
                onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as Filters["status"] }))}
              >
                <option value="all">All</option>
                <option value="paid">Paid</option>
                <option value="due_soon">Due soon</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </div>

          <p className="mb-2 text-sm text-slate-600" role="status">
            Showing {shown.length} of {rows.length} student{rows.length === 1 ? "" : "s"}.
          </p>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon="search"
                title="No students match the selected filters"
                action={
                  filtering && (
                    <button className={buttonLight} onClick={() => setFilters(noFilters)}>
                      Clear filters
                    </button>
                  )
                }
              >
                Try a different name, batch or fee status.
              </EmptyState>
            </Card>
          ) : (
            <div className={cardFlush}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Students with their fees and fee status</caption>
                  <thead className="border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th scope="col" className={th}>Student</th>
                      <th scope="col" className={th}>Batch</th>
                      <th scope="col" className={th}>Coach</th>
                      <th scope="col" className={th + " text-right"}>Monthly fee</th>
                      <th scope="col" className={th + " text-right"}>Outstanding</th>
                      <th scope="col" className={th}>Fee status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className={td}>
                          <Link href={`/students/${r.id}`} className="flex items-center gap-3 rounded-md">
                            <Avatar name={r.name} />
                            <span className="font-medium text-slate-900 hover:text-emerald-800 hover:underline">{r.name}</span>
                          </Link>
                        </td>
                        <td className={td + " text-slate-700"}>{r.batchName}</td>
                        <td className={td + " text-slate-700"}>{r.coach}</td>
                        <td className={td + " text-right tabular-nums text-slate-700"}>{rupees(r.monthly_fee)}</td>
                        <td className={td + " text-right font-medium tabular-nums text-slate-900"}>
                          {r.owed < 0 ? `${rupees(-r.owed)} ahead` : rupees(r.owed)}
                        </td>
                        <td className={td}>
                          <FeeStatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
