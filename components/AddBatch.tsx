"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { button, input } from "@/lib/ui";

// Small inline form to create a batch (e.g. "Under-12 Cricket, Mon/Wed 5pm").
export default function AddBatch({ onAdded }: { onAdded: (id: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return setError("Type a batch name first.");
    setBusy(true);
    setError("");
    const { data, error: err } = await createClient().from("batches").insert({ name: name.trim() }).select("id").single();
    setBusy(false);
    if (err || !data) return setError("Could not add the batch. Please try again.");
    setName("");
    onAdded(data.id);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input className={input} placeholder="New batch name, e.g. Batch A" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className={button} onClick={add} disabled={busy}>
          Add batch
        </button>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
