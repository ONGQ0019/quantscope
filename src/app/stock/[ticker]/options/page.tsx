import type { Metadata } from "next";
import { OptionsView } from "@/components/options/OptionsView";

export async function generateMetadata({ params }: PageProps<"/stock/[ticker]/options">): Promise<Metadata> {
  return { title: `${decodeURIComponent((await params).ticker).toUpperCase()} options` };
}

export default async function Page({ params }: PageProps<"/stock/[ticker]/options">) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  return <OptionsView ticker={ticker} />;
}
