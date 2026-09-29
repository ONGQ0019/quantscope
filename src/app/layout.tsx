import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Providers } from "@/components/shell/Providers";
import { TopNav } from "@/components/shell/TopNav";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Quantscope — US stock & options research", template: "%s · Quantscope" },
  description: "Search any US stock, read option chains with greeks, scan the market, and simulate what your investment would be worth.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <TopNav />
          <main className="mx-auto w-full max-w-[1320px] px-4 pb-24 sm:px-6">{children}</main>
          <footer className="mx-auto max-w-[1320px] px-4 pb-10 text-xs text-faint sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
              <p>Market data by Massive. Prices may be delayed or end-of-day depending on your data plan.</p>
              <p>For information only. Not investment advice.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
