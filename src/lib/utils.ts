import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Tampilkan IDR sebagai rupiah bulat (tanpa ,00 di belakang) biar bersih dibaca —
// nominal otoritatif tetap dari backend (string desimal); ini display-only.
// Pecahan dibulatkan KE BAWAH, sama seperti backend membulatkan total (`api/mint.yaml`
// § totalPayIdr: "desimal dibulatkan ke bawah"). Dengan pembulatan biasa, subtotal
// Rp 163.312,50 tampil Rp 163.313 sementara totalnya Rp 167.312 — rinciannya tidak
// menjumlah ke total yang ditagih (dev, 13 Okt 2026).
export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `Rp ${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.floor(value))}`;
}

// Kurs per USDX untuk dibaca manusia: angka bulat tanpa desimal ("Rp 16.200"), selain itu tepat
// dua desimal ("Rp 16.412,50"). Kurs TIDAK dibulatkan ke rupiah seperti `formatIDR` — membulatkan
// 16.412,50 jadi 16.413 mengubah harga yang dipakai orang untuk memeriksa hitungannya sendiri.
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const whole = Number.isInteger(value);
  return `Rp ${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(value)}`;
}

// Jumlah token untuk dibaca manusia. Figma menulis "62,092307 USDX": koma desimal Indonesia,
// tanpa nol berekor. `maximumFractionDigits: 6` mengikuti presisi yang dikirim backend; angka
// bulat tetap tampil bulat ("250 USDX", bukan "250,000000 USDX").
export function formatTokenAmount(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(n);
}

export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Waktu pembayaran diterima, dikunci ke WIB — user bisa membukanya dari zona waktu mana pun,
// tapi yang jadi rujukan saat cek mutasi/ops selalu jam Indonesia. Timestamp tak valid → null
// supaya pemanggil bisa menyembunyikan barisnya, bukan menampilkan "Invalid Date".
export function formatWibDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const text = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
  return `${text} WIB`;
}

// Countdown helper (mm:ss) untuk timer pembayaran di checkout.
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
