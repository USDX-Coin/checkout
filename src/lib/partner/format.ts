// Format angka khusus halaman partner (USDX-548), mengikuti Figma.
//
// `formatIDR` yang sudah ada membulatkan ke rupiah utuh ("Rp 1.009.000") dan itu benar untuk
// nominal tagihan. Tapi desain menampilkan dua angka yang TIDAK boleh dibulatkan begitu:
//
//   - KURS  → "Rp 16.582,50 / USDX". Membulatkannya jadi "Rp 16.583" mengubah harga yang
//             dikunci, dan itu angka yang dipakai customer untuk memeriksa hitungannya sendiri.
//   - ASET  → "60,606060 USDX". Enam desimal adalah presisi on-chain USDX; memotongnya membuat
//             jumlah yang tampil berbeda dari jumlah yang benar-benar dikirim.
//
// Keduanya sengaja TIDAK memakai `Number` untuk hal lain selain menampilkan — nominal otoritatif
// tetap string desimal dari backend.

/** Kurs dengan 2 desimal, gaya Indonesia: `"16582.5"` → `"Rp 16.582,50"`. */
export function formatRateIdr(value: string | null | undefined): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `Rp ${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}`;
}

/**
 * Jumlah USDX dengan 6 desimal, gaya Indonesia: `"60.60606"` → `"60,606060"`.
 *
 * Tanpa satuan — pemanggil yang menambahkan " USDX", karena satuannya bagian dari kalimat di
 * desain ("Kamu terima 60,606060 USDX").
 */
export function formatUsdxAmount(value: string | null | undefined): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  }).format(n);
}

/**
 * Jam:menit WIB untuk baris "Rp 1.009.000 diterima 09:28".
 *
 * Pemisahnya dirakit sendiri, bukan diserahkan ke locale: `id-ID` memformat waktu dengan TITIK
 * ("09.28"), sedangkan desain memakai titik dua. Perbedaan sekecil itu tak terlihat sampai
 * seseorang membandingkan layar dengan Figma — jadi ia dikunci di sini.
 */
export function formatWibTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  if (!hour || !minute) return null;
  return `${hour}:${minute}`;
}

/** Hitungan mundur bergaya desain: `"23 : 47"` (dengan spasi), bukan `"23:47"`. */
export function formatSpacedCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm} : ${ss}`;
}

/** Alamat wallet + rantai: `"0x1f2e…93a4 · Polygon"`. Rantai ditulis dengan huruf awal kapital. */
export function formatDestination(address: string | null | undefined, chain: string | null | undefined): string | null {
  if (!address) return null;
  const short =
    address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  if (!chain) return short;
  const chainLabel = chain.charAt(0).toUpperCase() + chain.slice(1);
  return `${short} · ${chainLabel}`;
}
