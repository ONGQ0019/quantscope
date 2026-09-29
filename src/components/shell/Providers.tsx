"use client";

import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { ApiError, fetcher } from "@/lib/client/fetcher";
import { CommandPaletteProvider } from "./CommandPalette";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: false,
        dedupingInterval: 60_000,
        shouldRetryOnError: (err) => !(err instanceof ApiError && [400, 403, 404].includes(err.status)),
        errorRetryCount: 2,
        errorRetryInterval: 8000,
      }}
    >
      <CommandPaletteProvider>{children}</CommandPaletteProvider>
    </SWRConfig>
  );
}
