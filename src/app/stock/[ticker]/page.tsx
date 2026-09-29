import { StockOverview } from "@/components/stock/StockOverview";

export default async function Page({ params }: PageProps<"/stock/[ticker]">) {
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  return <StockOverview ticker={ticker} />;
}
