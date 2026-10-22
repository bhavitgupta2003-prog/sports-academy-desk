// Round initials for a person's name (decorative; the name is always shown next to it).
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export default function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-xs";
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-white ${dims}`}>
      {initials(name)}
    </span>
  );
}
