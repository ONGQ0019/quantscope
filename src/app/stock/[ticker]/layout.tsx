import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockHeader } from "@/components/stock/StockHeader";
import { TICKER_RE } from "@/lib/server/http";

export async function generateMetadata({ params }: LayoutProps<"/stock/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: decodeURIComponent(ticker).toUpperCase() };
}

export default async function StockLayout({ children, params }: LayoutProps<"/stock/[ticker]">) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  if (!TICKER_RE.test(ticker)) notFound();
  return (
    <div className="pt-6 sm:pt-10">
      <StockHeader ticker={ticker} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
