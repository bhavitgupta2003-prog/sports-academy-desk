"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ErrorBox from "@/components/ErrorBox";
import { button, card } from "@/lib/ui";
import { rupees } from "@/lib/fees";

type Row = { id: string; name: string; coach: string; monthly_fee: number; batches: { name: string } | null };

export default function StudentsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const { data, error: err } = await createClient()
      .from("students")
      .select("id,name,coach,monthly_fee,batches(name)")
      .order("name");
    if (err) return setError("Couldn't load students. Please try again.");
    setRows(data as unknown as Row[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Students</h1>
        <Link href="/students/new" className={button}>
          Add student
        </Link>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && rows === null && <p className="text-sm text-slate-500">Loading…</p>}
      {rows && rows.length === 0 && (
        <div className={card}>
          <p className="font-medium">No students yet. Get started in 3 steps:</p>
          <ol className="mt-2 list-decimal pl-5 text-sm text-slate-600">
            <li>Click “Add student” (you can create a batch on that page).</li>
            <li>Open Attendance and mark who is present.</li>
            <li>Open a student to record a fee payment.</li>
          </ol>
        </div>
      )}
      {rows && rows.length > 0 && (
        <div className={card + " overflow-x-auto p-0"}>
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Batch</th>
                <th className="px-4 py-2">Coach</th>
                <th className="px-4 py-2">Monthly fee</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/students/${r.id}`} className="font-medium text-emerald-700 underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{r.batches?.name}</td>
                  <td className="px-4 py-2">{r.coach}</td>
                  <td className="px-4 py-2">{rupees(Number(r.monthly_fee))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
