import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AmbientBackground } from "@/components/shell/AmbientBackground";
import { Providers } from "@/components/shell/Providers";
import { TopNav } from "@/components/shell/TopNav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quantscope — US stock & options scanner", template: "%s · Quantscope" },
  description: "Search any US stock, read option chains with greeks, scan the market, and simulate what your investment would be worth.",
};

export const viewport: Viewport = {
  themeColor: "#05060a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <AmbientBackground />
        <Providers>
          <TopNav />
          <main className="relative z-10 mx-auto w-full max-w-[1400px] px-3 pb-24 sm:px-5">{children}</main>
          <footer className="relative z-10 mx-auto max-w-[1400px] px-5 pb-10 text-xs text-faint">
            <div className="hairline mb-6" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>Market data by Massive. Prices may be delayed or end-of-day depending on your data plan.</p>
              <p>For information only — not investment advice.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
