import type { Metadata } from "next";
import { SimulatorView } from "@/components/simulate/SimulatorView";

export async function generateMetadata({ params }: PageProps<"/stock/[ticker]/simulate">): Promise<Metadata> {
  return { title: `${decodeURIComponent((await params).ticker).toUpperCase()} simulator` };
}

export default async function Page({ params }: PageProps<"/stock/[ticker]/simulate">) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  return <SimulatorView initialTicker={ticker} embedded />;
}
