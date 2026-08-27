// Metode bayar yang boleh muncul di halaman checkout partner (USDX-548).
//
// TIGA bank VA — Mandiri, BNI, BRI — dan TIDAK ADA QRIS. Bukan pilihan desain: provider di
// balik jalur partner menerbitkan virtual account saja
// (`backend/.../durianpay-snap-payment.provider.ts:250`, dan kontraknya menyatakannya terang-
// terangan di `sot/api/partner-mint.yaml` → "QRIS is not available"). Menawarkan QRIS di sini
// berarti menawarkan tombol yang pasti gagal setelah customer memilihnya.
//
// Daftar ini adalah SARINGAN, bukan sumber kebenaran: yang berwenang tetap `channels[]` dari
// backend (ia yang tahu bank mana sedang dimatikan untuk perawatan). Saringan ini memastikan
// backend yang keliru mengirim QRIS — atau bank di luar tiga ini — tidak berubah jadi pilihan
// yang bisa diklik di halaman partner.

import type { MintChannelOption, VaBank } from "@/types";

/** Bank VA yang didukung jalur partner (`MintCreate.payment_bank`). */
export const PARTNER_VA_BANKS = ["MANDIRI", "BNI", "BRI"] as const;

export type PartnerVaBank = (typeof PARTNER_VA_BANKS)[number];

export function isPartnerVaBank(bank: string | null | undefined): bank is PartnerVaBank {
  return !!bank && (PARTNER_VA_BANKS as readonly string[]).includes(bank);
}

/**
 * Channel dari backend → channel yang boleh ditampilkan di halaman partner.
 *
 * Membuang channel selain VA, membuang bank di luar tiga yang didukung, dan membuang VA yang
 * tak menyisakan satu bank pun (kartu tanpa isi cuma bikin customer mengklik jalan buntu).
 */
export function partnerChannels(channels: MintChannelOption[] | null | undefined): MintChannelOption[] {
  if (!channels) return [];
  return channels
    .filter((c) => c.channel === "VA")
    .map((c) => ({
      ...c,
      banks: (c.banks ?? []).filter((b: VaBank) => isPartnerVaBank(b)),
    }))
    .filter((c) => (c.banks?.length ?? 0) > 0);
}
