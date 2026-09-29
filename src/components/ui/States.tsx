import { AlertCircle, Lock } from "lucide-react";
import { ApiError } from "@/lib/client/fetcher";

export function ErrorState({ error, what = "this data" }: { error: unknown; what?: string }) {
  const e = error instanceof ApiError ? error : null;
  if (e?.code === "NOT_ENTITLED") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-4 text-sm">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted" />
        <div>
          <p className="font-medium text-ink">Your Massive plan doesn&apos;t include {what}.</p>
          <p className="mt-1 text-muted">
            Upgrade at{" "}
            <a className="text-accent hover:underline" href="https://massive.com/pricing" target="_blank" rel="noreferrer">
              massive.com/pricing
            </a>{" "}
            and it will appear here automatically.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-subtle p-4 text-sm">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-down" />
      <div>
        <p className="font-medium text-ink">Couldn&apos;t load {what}.</p>
        <p className="mt-1 text-muted">{e?.message ?? (error instanceof Error ? error.message : "Unknown error")}</p>
      </div>
    </div>
  );
}
