import Notice from "@/components/ui/Notice";

// Shown when something could not be loaded. The optional Retry button runs the load again.
export default function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Notice
      tone="error"
      action={
        onRetry && (
          <button onClick={onRetry} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50">
            Retry
          </button>
        )
      }
    >
      {message}
    </Notice>
  );
}
