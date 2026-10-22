import Icon from "./Icon";

// The app's name with a simple mark. (Our own simple mark, not copied from anywhere.)
export default function Brand({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
        <Icon name="pulse" className="h-5 w-5" />
      </span>
      <span className="text-[15px] font-semibold leading-tight tracking-tight">
        Sports Academy
        <br />
        Desk
      </span>
    </span>
  );
}
