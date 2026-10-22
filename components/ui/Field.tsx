import type { ReactNode } from "react";
import { errorText, label as labelClass } from "@/lib/ui";

// A label, the input you pass in, an optional hint, and an error message under it.
export default function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${htmlFor}-error`} role="alert" className={errorText}>
          {error}
        </p>
      )}
    </div>
  );
}
