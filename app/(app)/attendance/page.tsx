"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AddBatch from "@/components/AddBatch";
import ErrorBox from "@/components/ErrorBox";
import { card, input, label } from "@/lib/ui";
import { todayString } from "@/lib/fees";

type Batch = { id: string; name: string };
type Student = { id: string; name: string };

export default function AttendancePage() {
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

  const loadBatches = useCallback(async (selectId?: string) => {
    const { data, error: err } = await createClient().from("batches").select("id,name").order("name");
    if (err) return setError("Couldn't load batches. Please try again.");
    setError("");
    setBatches(data);
    if (selectId) setBatchId(selectId);
  }, []);

  const loadStudents = useCallback(async () => {
    if (!batchId || !date) return setStudents(null);
    const db = createClient();
    const { data: s, error: e1 } = await db.from("students").select("id,name").eq("batch_id", batchId).order("name");
    if (e1) return setError("Couldn't load students. Please try again.");
    const ids = s.map((x) => x.id);
    const { data: a, error: e2 } = ids.length
      ? await db.from("attendance").select("student_id,status").eq("date", date).in("student_id", ids)
      : { data: [], error: null };
    if (e2) return setError("Couldn't load attendance. Please try again.");
    setError("");
    setStudents(s);
    setMarks(Object.fromEntries((a ?? []).map((r) => [r.student_id, r.status])));
  }, [batchId, date]);

  useEffect(() => {
    setDate(todayString());
  }, []);
  useEffect(() => {
    loadBatches();
  }, [loadBatches]);
  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  async function mark(studentId: string, status: "present" | "absent") {
    setSaveError("");
    const { error: err } = await createClient()
      .from("attendance")
      .upsert({ student_id: studentId, date, status }, { onConflict: "student_id,date" });
    if (err) return setSaveError("Could not save that mark. Please try again.");
    setMarks((m) => ({ ...m, [studentId]: status }));
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">Attendance</h1>
      {error && <ErrorBox message={error} onRetry={() => { loadBatches(); loadStudents(); }} />}
      {batches && batches.length === 0 && (
        <div className={card + " mb-4"}>
          <p className="mb-2 text-sm">You have no batches yet. Add one to begin:</p>
          <AddBatch onAdded={(id) => loadBatches(id)} />
        </div>
      )}
      {batches && batches.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Batch</label>
            <select className={input} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Select a batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Date</label>
            <input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      )}
      {saveError && <p className="mb-2 text-sm text-red-600">{saveError}</p>}
      {batchId && students && students.length === 0 && (
        <p className="text-sm text-slate-600">No students in this batch yet. Add them from the Students page.</p>
      )}
      {students && students.length > 0 && (
        <ul className={card + " divide-y p-0"}>
          {students.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium">{s.name}</span>
              <span className="flex gap-2">
                {(["present", "absent"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => mark(s.id, st)}
                    className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                      marks[s.id] === st
                        ? st === "present" ? "border-emerald-600 bg-emerald-600 text-white" : "border-red-600 bg-red-600 text-white"
                        : "border-slate-300 bg-white hover:bg-slate-100"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
