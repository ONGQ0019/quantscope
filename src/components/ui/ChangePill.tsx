import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { fmtPct } from "@/lib/format";

export function ChangePill({ value, className, size = "sm" }: { value: number | null | undefined; className?: string; size?: "sm" | "md" }) {
  if (value == null || !Number.isFinite(value)) return <span className={clsx("chip", className)}>—</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx("chip num font-medium", up ? "pill-up" : "pill-down", size === "md" && "px-2.5 py-1 text-sm", className)}>
      <Icon className={size === "md" ? "size-4" : "size-3"} strokeWidth={2.4} />
      {fmtPct(value)}
    </span>
  );
}
