// Halaman Checkout (`mint.usdx.co.id/checkout/{orderId}`) — USDX-224 (port USDX-202).
// Server component tipis; seluruh state datang dari GET /api/v2/mint/{id} via
// CheckoutContent (client, refresh-safe). orderId dibaca lewat useParams di dalamnya.
// Detail UI: sot/phase-2/week2.md § Halaman Checkout & Ringkasan (layar 3).

import { CheckoutContent } from "@/components/checkout/CheckoutContent";

export default function CheckoutPage() {
  return <CheckoutContent />;
}
