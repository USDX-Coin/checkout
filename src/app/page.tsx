export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold text-primary-text">USDX Checkout</h1>
      <p className="max-w-md text-muted-foreground">
        Halaman pembayaran USDX diakses lewat tautan pesanan dari aplikasi —
        <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-sm">/checkout/&#123;orderId&#125;</code>.
      </p>
    </main>
  );
}
