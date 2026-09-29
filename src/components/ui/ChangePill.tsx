import clsx from "clsx";
import { fmtPct } from "@/lib/format";

export function ChangePill({ value, className, size = "sm" }: { value: number | null | undefined; className?: string; size?: "sm" | "md" }) {
  if (value == null || !Number.isFinite(value)) return <span className={clsx("chip", className)}>—</span>;
  return (
    <span className={clsx("chip num", value >= 0 ? "pill-up" : "pill-down", size === "md" && "h-7 px-2 text-sm", className)}>{fmtPct(value)}</span>
  );
}
