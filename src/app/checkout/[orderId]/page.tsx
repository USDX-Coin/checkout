// Halaman Checkout (`mint.usdx.co.id/checkout/{orderId}`).
// Scaffold (USDX-223). Implementasi penuh = USDX-224:
//   - render dari GET /api/v2/mint/{id} (refresh-safe)
//   - Countdown, Pesanan #, Total Pembayaran, Data Pelanggan, Wallet Tujuan
//   - pilih VA(+bank)/QRIS + biaya layanan → POST /api/v2/mint/{id}/pay
//   - instruksi bayar inline + status tracker polling sampai COMPLETED
// Detail UI: sot/phase-2/week2.md § Halaman Checkout & Ringkasan (layar 3).

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold text-primary-700">Minting USDX</h1>
      <p className="text-muted-foreground">
        Pesanan <span className="font-mono">#{orderId}</span>
      </p>
      <p className="rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Halaman checkout sedang dibangun (USDX-224).
      </p>
    </main>
  );
}
