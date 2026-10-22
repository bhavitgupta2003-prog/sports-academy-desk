"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ErrorBox from "@/components/ErrorBox";
import FeeStatusBadge from "@/components/FeeStatusBadge";
import { button, buttonLight, card, input, label } from "@/lib/ui";
import { rupees, todayString } from "@/lib/fees";
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
      db.from("fee_payments").select("student_id,amount"),
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href="/students/new" className={button}>
          Add student
        </Link>
      </div>

      {notice && (
        <p role="status" className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && rows === null && (
        <p role="status" className="text-sm text-slate-500">
          Loading students…
        </p>
      )}

      {rows && rows.length === 0 && (
        <div className={card}>
          <p className="font-medium">No students yet. Get started in 3 steps:</p>
          <ol className="mt-2 list-decimal pl-5 text-sm text-slate-600">
            <li>Click “Add student” (you can create a batch on that page).</li>
            <li>Open Attendance and mark who is present.</li>
            <li>Open a student to record a fee payment.</li>
          </ol>
          <Link href="/students/new" className={button + " mt-4 inline-block"}>
            Add your first student
          </Link>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="search">Search by name</label>
              <input
                id="search"
                className={input}
                placeholder="Type a name…"
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              />
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
            <div className={card}>
              <p className="font-medium">No students match the selected filters.</p>
              <p className="mt-1 text-sm text-slate-600">Try a different name, batch or fee status.</p>
              {filtering && (
                <button className={buttonLight + " mt-3"} onClick={() => setFilters(noFilters)}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className={card + " overflow-x-auto p-0"}>
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Batch</th>
                    <th className="px-4 py-2">Coach</th>
                    <th className="px-4 py-2">Monthly fee</th>
                    <th className="px-4 py-2">Outstanding</th>
                    <th className="px-4 py-2">Fee status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link href={`/students/${r.id}`} className="font-medium text-emerald-700 underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{r.batchName}</td>
                      <td className="px-4 py-2">{r.coach}</td>
                      <td className="px-4 py-2">{rupees(r.monthly_fee)}</td>
                      <td className="px-4 py-2 font-medium">
                        {r.owed < 0 ? `${rupees(-r.owed)} ahead` : rupees(r.owed)}
                      </td>
                      <td className="px-4 py-2">
                        <FeeStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
