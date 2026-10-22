"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/fetchAll";
import { STATUS_FILTERS, attendanceCounts, filterAttendance, type AttendanceStatusFilter } from "@/lib/attendanceFilter";
import AddBatch from "@/components/AddBatch";
import ErrorBox from "@/components/ErrorBox";
import { buttonLight, input } from "@/lib/ui";
import Avatar from "@/components/ui/Avatar";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import LoadingState from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import { isValidDate, todayString } from "@/lib/fees";
import { validateRecordDate } from "@/lib/validation";
import { useSessionGuard } from "@/lib/useSessionGuard";

type Batch = { id: string; name: string };
type Student = { id: string; name: string; batchName?: string };
const ALL = "all"; // the "All batches" choice

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatusFilter>("all");
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
      setBatchId((cur) => selectId ?? (cur === ALL || (cur && data.some((b) => b.id === cur)) ? cur : ""));
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
    const isAll = batchId === ALL;
    let s: Student[];
    if (isAll) {
      // Every student in the academy, grouped by batch.
      const res = await db.from("students").select("id,name,batches(name)").order("name");
      if (mine !== latestLoad.current) return;
      if (res.error) {
        setLoadingStudents(false);
        if (await guard(res.error)) return;
        return setError("Couldn't load students. Please try again.");
      }
      s = (res.data as unknown as { id: string; name: string; batches: { name: string } | null }[])
        .map((x) => ({ id: x.id, name: x.name, batchName: x.batches?.name ?? "No batch" }))
        .sort((p, q) => (p.batchName ?? "").localeCompare(q.batchName ?? "") || p.name.localeCompare(q.name));
    } else {
      const res = await db.from("students").select("id,name").eq("batch_id", batchId).order("name");
      if (mine !== latestLoad.current) return;
      if (res.error) {
        setLoadingStudents(false);
        if (await guard(res.error)) return;
        return setError("Couldn't load students. Please try again.");
      }
      s = res.data;
    }
    const ids = s.map((x) => x.id);
    // For one batch, ask for just its students' marks; for all batches, read the day's marks in pages.
    const { data: a, error: e2 } = isAll
      ? await fetchAll<{ student_id: string; status: string }>((from, to) => db.from("attendance").select("student_id,status").eq("date", date).order("id").range(from, to))
      : ids.length
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

  const isAll = batchId === ALL;
  const batchName = isAll ? "All batches" : batches?.find((b) => b.id === batchId)?.name;
  const counts = attendanceCounts(students ?? [], marks);
  const shown = students ? filterAttendance(students, marks, { search, status: statusFilter }) : [];
  const filtering = search.trim() !== "" || statusFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Attendance" description="Choose a batch (or All batches) and a date, then mark each student present or absent. Each tap saves straight away. Use the filters to find who still needs marking." />

      {error && <ErrorBox message={error} onRetry={retry} />}
      {!error && batches === null && <LoadingState label="Loading batches…" />}

      {batches && batches.length === 0 && (
        <Card title="Add your first batch" description="Attendance is marked batch by batch, so start by creating one.">
          <AddBatch onAdded={(id) => loadBatches(id)} />
        </Card>
      )}

      {batches && batches.length > 0 && (
        <Card className="mb-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Batch" htmlFor="batch">
              <select id="batch" className={input} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Select a batch…</option>
                <option value={ALL}>All batches</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="date" error={dateError ?? undefined}>
              <input
                id="date"
                className={input}
                type="date"
                max={todayString()}
                value={date}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? "date-error" : undefined}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
        </Card>
      )}

      {saveError && <Notice tone="error" className="mb-4">{saveError}</Notice>}
      {notice && <Notice tone="success" className="mb-4">{notice}</Notice>}

      {batches && batches.length > 0 && !batchId && !dateError && (
        <Card>
          <EmptyState icon="calendarCheck" title="Select a batch to begin">
            Pick a batch above and its students will appear here.
          </EmptyState>
        </Card>
      )}

      {loadingStudents && <LoadingState label="Loading students and attendance…" />}

      {!loadingStudents && batchId && !dateError && students && students.length === 0 && (
        <Card>
          <EmptyState
            icon="users"
            title="No students in this batch yet"
            action={
              <Link href="/students/new" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-hover">
                <Icon name="plus" className="h-4 w-4" />
                Add a student
              </Link>
            }
          >
            Add students from the Students page, then come back to mark attendance.
          </EmptyState>
        </Card>
      )}

      {!loadingStudents && students && students.length > 0 && (
        <>
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filter by attendance status" className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  aria-pressed={statusFilter === f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                    statusFilter === f.value ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {f.label} <span className="tabular-nums">({counts[f.value]})</span>
                </button>
              ))}
            </div>
            <div className="relative lg:w-64">
              <label htmlFor="attendance-search" className="sr-only">
                Search students by name
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="attendance-search"
                className={input + " pl-9"}
                placeholder="Search by name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState
                icon={statusFilter === "not_marked" && !search.trim() ? "checkCircle" : "search"}
                title={statusFilter === "not_marked" && !search.trim() ? "Everyone is marked" : "No students match the filters"}
                action={
                  filtering && (
                    <button className={buttonLight} onClick={clearFilters}>
                      Clear filters
                    </button>
                  )
                }
              >
                {statusFilter === "not_marked" && !search.trim()
                  ? `Every student in ${batchName} has been marked for ${date}.`
                  : "Try a different name or status."}
              </EmptyState>
            </Card>
          ) : (
            <Card
              flush
              title={batchName}
              description={`${counts.marked} of ${counts.all} marked for ${date}${filtering ? ` · showing ${shown.length}` : ""}`}
            >
              <ul className="divide-y divide-slate-100">
                {shown.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <Link
                      href={`/students/${s.id}?from=attendance&batch=${batchId}&date=${date}`}
                      className="flex min-w-0 items-center gap-3 rounded-md"
                    >
                      <Avatar name={s.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900 hover:text-emerald-800 hover:underline">{s.name}</span>
                        {isAll && s.batchName && <span className="block truncate text-xs text-slate-500">{s.batchName}</span>}
                      </span>
                    </Link>
                    <span className="flex items-center gap-2">
                      {saving[s.id] && <span role="status" className="text-xs text-slate-600">Saving…</span>}
                      {(["present", "absent"] as const).map((st) => {
                        const on = marks[s.id] === st;
                        return (
                          <button
                            key={st}
                            onClick={() => mark(s, st)}
                            disabled={!!saving[s.id]}
                            aria-pressed={on}
                            className={`inline-flex min-h-10 min-w-28 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium capitalize shadow-sm disabled:opacity-60 ${
                              on
                                ? st === "present"
                                  ? "border-emerald-700 bg-emerald-700 text-white"
                                  : "border-red-700 bg-red-700 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <Icon name={st === "present" ? "checkCircle" : "xCircle"} className="h-4 w-4" />
                            {st}
                          </button>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
