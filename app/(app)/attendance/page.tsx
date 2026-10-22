"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AddBatch from "@/components/AddBatch";
import ErrorBox from "@/components/ErrorBox";
import { card, errorText, input, label } from "@/lib/ui";
import { isValidDate, todayString } from "@/lib/fees";
import { validateRecordDate } from "@/lib/validation";
import { useSessionGuard } from "@/lib/useSessionGuard";

type Batch = { id: string; name: string };
type Student = { id: string; name: string };

export default function AttendancePage() {
  const guard = useSessionGuard();
  const [ready, setReady] = useState(false); // true once batch/date are read from the address bar
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState("");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const latestLoad = useRef(0); // lets us ignore answers that arrive after you changed batch/date

  const dateError = ready ? validateRecordDate(date, todayString(), "attendance") : null;

  // Read the batch and date from the address bar (so Back from a student page restores them).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("date") ?? "";
    setDate(isValidDate(d) ? d : todayString()); // a future date from the address bar is shown with a warning, not changed
    setBatchId(q.get("batch") ?? "");
    setReady(true);
  }, []);

  // Keep the address bar in step with the choices.
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams();
    if (batchId) q.set("batch", batchId);
    if (date) q.set("date", date);
    window.history.replaceState(null, "", q.toString() ? `/attendance?${q}` : "/attendance");
  }, [ready, batchId, date]);

  const loadBatches = useCallback(
    async (selectId?: string) => {
      const { data, error: err } = await createClient().from("batches").select("id,name").order("name");
      if (err) {
        if (await guard(err)) return;
        return setError("Couldn't load batches. Please try again.");
      }
      setError("");
      setBatches(data);
      setBatchId((cur) => selectId ?? (cur && data.some((b) => b.id === cur) ? cur : ""));
    },
    [guard],
  );

  const loadStudents = useCallback(async () => {
    const mine = ++latestLoad.current;
    setSaveError("");
    setNotice("");
    if (!ready || !batchId || validateRecordDate(date, todayString(), "attendance")) {
      setStudents(null);
      setLoadingStudents(false);
      return;
    }
    setLoadingStudents(true);
    const db = createClient();
    const { data: s, error: e1 } = await db.from("students").select("id,name").eq("batch_id", batchId).order("name");
    if (mine !== latestLoad.current) return;
    if (e1) {
      setLoadingStudents(false);
      if (await guard(e1)) return;
      return setError("Couldn't load students. Please try again.");
    }
    const ids = s.map((x) => x.id);
    const { data: a, error: e2 } = ids.length
      ? await db.from("attendance").select("student_id,status").eq("date", date).in("student_id", ids)
      : { data: [], error: null };
    if (mine !== latestLoad.current) return;
    if (e2) {
      setLoadingStudents(false);
      if (await guard(e2)) return;
      return setError("Couldn't load attendance. Please try again.");
    }
    setError("");
    setStudents(s);
    setMarks(Object.fromEntries((a ?? []).map((r) => [r.student_id, r.status])));
    setLoadingStudents(false);
  }, [ready, batchId, date, guard]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);
  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  async function mark(student: Student, status: "present" | "absent") {
    const problem = validateRecordDate(date, todayString(), "attendance"); // re-check at click time
    if (problem) return setSaveError(problem);
    const mine = latestLoad.current;
    setSaveError("");
    setNotice("");
    setSaving((s) => ({ ...s, [student.id]: true }));
    const { error: err } = await createClient()
      .from("attendance")
      .upsert({ student_id: student.id, date, status }, { onConflict: "student_id,date" });
    setSaving((s) => {
      const n = { ...s };
      delete n[student.id];
      return n;
    });
    if (err) {
      if (await guard(err)) return;
      return setSaveError(`Could not save attendance for ${student.name}. Nothing was changed. Please try again.`);
    }
    if (mine !== latestLoad.current) return; // you moved to another batch/date while this was saving
    setMarks((m) => ({ ...m, [student.id]: status }));
    setNotice(`Saved: ${student.name} marked ${status} on ${date}.`);
  }

  const retry = () => {
    setError("");
    loadBatches();
    loadStudents();
  };

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">Attendance</h1>
      {error && <ErrorBox message={error} onRetry={retry} />}
      {!error && batches === null && (
        <p role="status" className="text-sm text-slate-500">
          Loading batches…
        </p>
      )}
      {batches && batches.length === 0 && (
        <div className={card + " mb-4"}>
          <p className="mb-2 text-sm">You have no batches yet. Add one to begin:</p>
          <AddBatch onAdded={(id) => loadBatches(id)} />
        </div>
      )}
      {batches && batches.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="batch">Batch</label>
            <select id="batch" className={input} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              <option value="">Select a batch…</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="date">Date</label>
            <input
              id="date"
              className={input}
              type="date"
              max={todayString()}
              value={date}
              aria-invalid={!!dateError}
              onChange={(e) => setDate(e.target.value)}
            />
            {dateError && <p role="alert" className={errorText}>{dateError}</p>}
          </div>
        </div>
      )}

      {saveError && <p role="alert" className="mb-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
      {notice && <p role="status" className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {loadingStudents && (
        <p role="status" className="text-sm text-slate-500">
          Loading students and attendance…
        </p>
      )}
      {!loadingStudents && batchId && !dateError && students && students.length === 0 && (
        <p className="text-sm text-slate-600">No students in this batch yet. Add them from the Students page.</p>
      )}
      {!loadingStudents && students && students.length > 0 && (
        <ul className={card + " divide-y p-0"}>
          {students.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <Link
                href={`/students/${s.id}?from=attendance&batch=${batchId}&date=${date}`}
                className="text-sm font-medium text-emerald-700 underline"
              >
                {s.name}
              </Link>
              <span className="flex items-center gap-2">
                {saving[s.id] && <span role="status" className="text-xs text-slate-500">Saving…</span>}
                {(["present", "absent"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => mark(s, st)}
                    disabled={!!saving[s.id]}
                    aria-pressed={marks[s.id] === st}
                    className={`rounded-md border px-3 py-1.5 text-sm capitalize disabled:opacity-50 ${
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
