"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { button, input } from "@/lib/ui";
import { useSessionGuard } from "@/lib/useSessionGuard";
import Notice from "@/components/ui/Notice";
import { ButtonSpinner } from "@/components/ui/LoadingState";

// Small inline form to create a batch (e.g. "Under-12 Cricket, Mon/Wed 5pm").
export default function AddBatch({ onAdded }: { onAdded: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const guard = useSessionGuard();

  async function add() {
    if (busy) return;
    if (!name.trim()) return setError("Type a batch name first.");
    setBusy(true);
    setError("");
    setDone("");
    const { data, error: err } = await createClient().from("batches").insert({ name: name.trim() }).select("id").single();
    setBusy(false);
    if (err || !data) {
      if (err && (await guard(err))) return;
      return setError("Could not add the batch. What you typed is still here. Please try again.");
    }
    setDone(`Batch "${name.trim()}" added.`);
    setName("");
    onAdded(data.id);
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="new-batch" className="sr-only">
          New batch name
        </label>
        <input id="new-batch" className={input} placeholder="New batch name, e.g. Batch A" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className={button + " shrink-0"} onClick={add} disabled={busy}>
          {busy && <ButtonSpinner />}
          {busy ? "Adding…" : "Add batch"}
        </button>
      </div>
      {error && <Notice tone="error" className="mt-3">{error}</Notice>}
      {done && <Notice tone="success" className="mt-3">{done}</Notice>}
    </div>
  );
}
