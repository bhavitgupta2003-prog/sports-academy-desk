// Shared Tailwind class names so every screen looks the same.
// Change a look here once and every page follows.

export const input =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/25 disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-red-500";

export const button =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60";

export const buttonLight =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

/** A white panel WITH padding. */
export const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
/** A white panel with NO padding (for tables that run edge to edge). */
export const cardFlush = "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm";

export const label = "mb-1.5 block text-sm font-medium text-slate-700";
export const errorText = "mt-1.5 text-sm text-red-700";
export const linkText = "font-medium text-emerald-800 hover:underline";

/** Table pieces, shared by every table. */
export const th = "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500";
export const td = "px-4 py-3";
