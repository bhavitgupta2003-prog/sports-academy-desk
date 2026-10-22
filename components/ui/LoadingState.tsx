// A small spinner with words. The words matter: screen readers read them.
export default function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-10 text-sm text-slate-600">
      <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-slate-300 border-t-emerald-700 motion-safe:animate-spin" />
      {label}
    </div>
  );
}

/** The same spinner, small, for use inside buttons. */
export function ButtonSpinner() {
  return <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin" />;
}
