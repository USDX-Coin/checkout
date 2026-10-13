import type { Metadata } from "next";
import { Providers } from "@/providers/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "USDX Checkout",
  description: "Pembayaran mint USDX",
  // File koin yang sama dengan landing (usdx.co.id) — satu sumber logo.
  icons: { icon: [{ url: "/image/logo-coin.png", type: "image/png" }] },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
