import type { Metadata } from "next";
import { ScannerView } from "@/components/scanner/ScannerView";

export const metadata: Metadata = { title: "Market scanner" };

export default function Page() {
  return (
    <div className="pt-8 sm:pt-12">
      <ScannerView />
    </div>
  );
}
