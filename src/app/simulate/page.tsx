import type { Metadata } from "next";
import { SimulatorView } from "@/components/simulate/SimulatorView";

export const metadata: Metadata = { title: "Investment simulator" };

export default function Page() {
  return (
    <div className="pt-8 sm:pt-12">
      <SimulatorView initialTicker="AAPL" />
    </div>
  );
}
