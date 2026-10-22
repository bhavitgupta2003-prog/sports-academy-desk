"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AddBatch from "@/components/AddBatch";
import ErrorBox from "@/components/ErrorBox";
import { button, card, errorText, input, label } from "@/lib/ui";

type Batch = { id: string; name: string };

export default function NewStudentPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [f, setF] = useState({ name: "", batch_id: "", coach: "", parent_name: "", parent_phone: "", monthly_fee: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadBatches = useCallback(async (selectId?: string) => {
    setLoadError("");
    const { data, error } = await createClient().from("batches").select("id,name").order("name");
    if (error) return setLoadError("Couldn't load batches. Please try again.");
    setBatches(data);
    if (selectId) setF((p) => ({ ...p, batch_id: selectId }));
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = "Enter the student's name.";
    if (!f.batch_id) errs.batch_id = "Choose a batch (or add one below).";
    if (!f.coach.trim()) errs.coach = "Enter the coach's name.";
    if (!/^\+?[0-9 ]{10,14}$/.test(f.parent_phone.trim())) errs.parent_phone = "Enter a valid phone number (10 digits).";
    const fee = Number(f.monthly_fee);
    if (f.monthly_fee.trim() === "" || isNaN(fee) || fee < 0) errs.monthly_fee = "Enter the monthly fee as a number, e.g. 3000.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setSaveError("");
    const { error } = await createClient().from("students").insert({
      name: f.name.trim(),
      batch_id: f.batch_id,
      coach: f.coach.trim(),
      parent_name: f.parent_name.trim() || null,
      parent_phone: f.parent_phone.trim(),
      monthly_fee: fee,
    });
    setBusy(false);
    if (error) return setSaveError("Could not save the student. Please try again.");
    router.push("/students");
  }

  if (loadError) return <ErrorBox message={loadError} onRetry={() => loadBatches()} />;

  return (
    <div className="max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Add student</h1>
      <form onSubmit={save} className={card + " space-y-4"}>
        <div>
          <label className={label}>Student name</label>
          <input className={input} value={f.name} onChange={set("name")} />
          {errors.name && <p className={errorText}>{errors.name}</p>}
        </div>
        <div>
          <label className={label}>Batch</label>
          <select className={input} value={f.batch_id} onChange={set("batch_id")}>
            <option value="">Select a batch…</option>
            {batches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          {errors.batch_id && <p className={errorText}>{errors.batch_id}</p>}
        </div>
        <div>
          <label className={label}>Coach</label>
          <input className={input} value={f.coach} onChange={set("coach")} />
          {errors.coach && <p className={errorText}>{errors.coach}</p>}
        </div>
        <div>
          <label className={label}>Parent name (optional)</label>
          <input className={input} value={f.parent_name} onChange={set("parent_name")} />
        </div>
        <div>
          <label className={label}>Parent phone</label>
          <input className={input} value={f.parent_phone} onChange={set("parent_phone")} />
          {errors.parent_phone && <p className={errorText}>{errors.parent_phone}</p>}
        </div>
        <div>
          <label className={label}>Monthly fee (Rs)</label>
          <input className={input} inputMode="decimal" value={f.monthly_fee} onChange={set("monthly_fee")} />
          {errors.monthly_fee && <p className={errorText}>{errors.monthly_fee}</p>}
        </div>
        {saveError && <p className={errorText}>{saveError}</p>}
        <button className={button} disabled={busy}>
          Save student
        </button>
      </form>
      <div className={card + " mt-4"}>
        <p className="mb-2 text-sm font-medium">Need a new batch?</p>
        <AddBatch onAdded={(id) => loadBatches(id)} />
      </div>
    </div>
  );
}
