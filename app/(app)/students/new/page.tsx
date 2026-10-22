"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AddBatch from "@/components/AddBatch";
import ErrorBox from "@/components/ErrorBox";
import { button, buttonLight, input } from "@/lib/ui";
import Card from "@/components/ui/Card";
import Field from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";
import { ButtonSpinner } from "@/components/ui/LoadingState";
import Notice from "@/components/ui/Notice";
import PageHeader from "@/components/ui/PageHeader";
import { isValidDate, todayString } from "@/lib/fees";
import { findDuplicates } from "@/lib/validation";
import { useSessionGuard } from "@/lib/useSessionGuard";

type Batch = { id: string; name: string };
type Existing = { id: string; name: string; coach: string; batches: { name: string } | null };

export default function NewStudentPage() {
  const router = useRouter();
  const guard = useSessionGuard();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [f, setF] = useState({ name: "", batch_id: "", coach: "", parent_name: "", parent_phone: "", monthly_fee: "", joined_on: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicates, setDuplicates] = useState<Existing[] | null>(null); // set when the warning is showing

  const loadBatches = useCallback(async (selectId?: string) => {
    setLoadError("");
    const { data, error } = await createClient().from("batches").select("id,name").order("name");
    if (error) {
      if (await guard(error)) return;
      return setLoadError("Couldn't load batches. Please try again.");
    }
    setBatches(data);
    if (selectId) setF((p) => ({ ...p, batch_id: selectId }));
  }, [guard]);

  useEffect(() => {
    setF((p) => (p.joined_on ? p : { ...p, joined_on: todayString() }));
  }, []);
  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (k === "name") setDuplicates(null); // a different name needs a fresh check
    setF((p) => ({ ...p, [k]: e.target.value }));
  };

  // Step 1: check the form, then look for a student with the same name.
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Enter the student's name.";
    if (!f.batch_id) errs.batch_id = "Choose a batch (or add one below).";
    if (!f.coach.trim()) errs.coach = "Enter the coach's name.";
    if (!/^\+?[0-9 ]{10,14}$/.test(f.parent_phone.trim())) errs.parent_phone = "Enter a valid phone number (10 digits).";
    const fee = Number(f.monthly_fee);
    if (f.monthly_fee.trim() === "" || isNaN(fee) || fee < 0) errs.monthly_fee = "Enter the monthly fee as a number, e.g. 3000.";
    if (!isValidDate(f.joined_on)) errs.joined_on = "Choose the date the student joined.";
    else if (f.joined_on > todayString()) errs.joined_on = "The joining date can't be in the future.";
    setErrors(errs);
    setSaveError("");
    if (Object.keys(errs).length) return;

    setBusy(true);
    const { data, error } = await createClient().from("students").select("id,name,coach,batches(name)");
    if (error) {
      setBusy(false);
      if (await guard(error)) return;
      // Never pretend there is no duplicate when we could not check.
      return setSaveError("Couldn't check whether this student already exists, so nothing was saved. Please try again.");
    }
    const same = findDuplicates(data as unknown as Existing[], f.name);
    if (same.length > 0) {
      setBusy(false);
      return setDuplicates(same); // show the warning; the user decides
    }
    await insertStudent();
  }

  // Step 2: the actual save (also used by "Save anyway").
  async function insertStudent() {
    setBusy(true);
    setSaveError("");
    const { error } = await createClient().from("students").insert({
      name: f.name.trim(),
      batch_id: f.batch_id,
      coach: f.coach.trim(),
      parent_name: f.parent_name.trim() || null,
      parent_phone: f.parent_phone.trim(),
      monthly_fee: Number(f.monthly_fee),
      joined_on: f.joined_on,
    });
    if (error) {
      setBusy(false); // the form keeps everything you typed
      if (await guard(error)) return;
      return setSaveError("Could not save the student. Nothing was saved, and your details are still here. Please try again.");
    }
    router.push("/students?added=1");
  }

  const back = (
    <Link href="/students" className="inline-flex items-center gap-1.5 font-medium text-emerald-800 hover:underline">
      <Icon name="arrowLeft" className="h-4 w-4" />
      All students
    </Link>
  );

  if (loadError) {
    return (
      <div>
        <PageHeader title="Add student" back={back} />
        <ErrorBox message={loadError} onRetry={() => loadBatches()} />
      </div>
    );
  }

  // Props shared by inputs: a link to their error message and the red "invalid" look.
  const a11y = (k: string) => ({ "aria-invalid": !!errors[k], "aria-describedby": errors[k] ? `${k}-error` : undefined });

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={back}
        title="Add student"
        description="Fill in the details below. Fees are counted from the month the student joined."
      />
      <form onSubmit={save} noValidate className="space-y-6">
        <Card title="Student">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Student name" htmlFor="name" error={errors.name}>
                <input id="name" className={input} value={f.name} onChange={set("name")} autoComplete="off" {...a11y("name")} />
              </Field>
            </div>
            <Field label="Batch" htmlFor="batch_id" error={errors.batch_id} hint="Need a new one? Add it below the form.">
              <select id="batch_id" className={input} value={f.batch_id} onChange={set("batch_id")} {...a11y("batch_id")}>
                <option value="">Select a batch…</option>
                {batches?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Coach" htmlFor="coach" error={errors.coach}>
              <input id="coach" className={input} value={f.coach} onChange={set("coach")} {...a11y("coach")} />
            </Field>
          </div>
        </Card>

        <Card title="Parent or guardian">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parent name (optional)" htmlFor="parent_name">
              <input id="parent_name" className={input} value={f.parent_name} onChange={set("parent_name")} />
            </Field>
            <Field label="Parent phone" htmlFor="parent_phone" error={errors.parent_phone}>
              <input id="parent_phone" className={input} inputMode="tel" value={f.parent_phone} onChange={set("parent_phone")} {...a11y("parent_phone")} />
            </Field>
          </div>
        </Card>

        <Card title="Fees">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly fee (Rs)" htmlFor="monthly_fee" error={errors.monthly_fee}>
              <input id="monthly_fee" className={input} inputMode="decimal" value={f.monthly_fee} onChange={set("monthly_fee")} {...a11y("monthly_fee")} />
            </Field>
            <Field
              label="Joined on"
              htmlFor="joined_on"
              error={errors.joined_on}
              hint="Fees are counted from this month. Change it for students who joined earlier."
            >
              <input id="joined_on" className={input} type="date" max={todayString()} value={f.joined_on} onChange={set("joined_on")} {...a11y("joined_on")} />
            </Field>
          </div>
        </Card>

        {duplicates && (
          <Notice tone="warning">
            <p className="font-medium">
              {duplicates.length === 1 ? "A student with this name already exists:" : `${duplicates.length} students with this name already exist:`}
            </p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.name}
                  {d.batches?.name ? `, ${d.batches.name}` : ""}, coach {d.coach}
                </li>
              ))}
            </ul>
            <p className="mt-2">Two different students can share a name. If this is a new student, you can save anyway.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={button} disabled={busy} onClick={insertStudent}>
                {busy && <ButtonSpinner />}
                {busy ? "Saving…" : "Save anyway"}
              </button>
              <button type="button" className={buttonLight} disabled={busy} onClick={() => setDuplicates(null)}>
                Go back and edit
              </button>
            </div>
          </Notice>
        )}
        {saveError && <Notice tone="error">{saveError}</Notice>}

        {!duplicates && (
          <div className="flex flex-wrap items-center gap-3">
            <button className={button} disabled={busy}>
              {busy && <ButtonSpinner />}
              {busy ? "Saving…" : "Save student"}
            </button>
            <Link href="/students" className={buttonLight}>
              Cancel
            </Link>
          </div>
        )}
      </form>

      <div className="mt-8">
        <Card title="Need a new batch?" description="Add it here, and it will be selected for you.">
          <AddBatch onAdded={(id) => loadBatches(id)} />
        </Card>
      </div>
    </div>
  );
}
