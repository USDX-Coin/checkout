"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { isRateLimited } from "@/lib/api/errors";

// Central 429 RATE_LIMITED handling (USDX-252). The mint throughput throttle
// (5 req/detik per user, conventions.md § Rate Limiting) can surface on the
// status-tracker poll (GET /v2/mint/{id}) or the pay mutation (POST /pay). A
// QueryCache / MutationCache onError shows one debounced toast — central, dan
// jalan untuk query maupun mutation. Single-locale (ID). Tidak pernah logout.
const RATE_LIMIT_TOAST_DEBOUNCE_MS = 3_000;

function makeRateLimitHandler() {
  let lastShownAt = 0;
  return (error: unknown) => {
    if (!isRateLimited(error)) return;
    const now = Date.now();
    if (now - lastShownAt < RATE_LIMIT_TOAST_DEBOUNCE_MS) return;
    lastShownAt = now;
    toast.error("Terlalu banyak permintaan, coba lagi sebentar.");
  };
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const onRateLimit = makeRateLimitHandler();
    return new QueryClient({
      queryCache: new QueryCache({ onError: onRateLimit }),
      mutationCache: new MutationCache({ onError: onRateLimit }),
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: false,
          // Jangan retry throttle — cuma nambah beban; poll mundur ke Retry-After.
          retry: (failureCount, error) => !isRateLimited(error) && failureCount < 1,
        },
      },
    });
  });

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
