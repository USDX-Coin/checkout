// Resolve token tautan partner → sesi checkout (USDX-548).
//
// ⚠️ ENDPOINT INI BELUM ADA. Ia lingkup USDX-547 (repo `backend`) dan belum ter-merge saat PR
// ini dibuka. Yang ada di sini adalah pemanggilnya, dibentuk mengikuti kolom yang SUDAH ada di
// database (`partner_checkout_sessions` + `partner_branding`, migrasi 0076) dan kontrak partner
// (`sot/api/partner-mint.yaml`). Bentuk JSON yang diharapkan ditulis lengkap di deskripsi PR
// (§ Backend Integration Notes) supaya USDX-547 bisa mencocokkannya, bukan menebaknya.
//
// Kenapa POST dan bukan GET: token adalah kredensial. GET menaruhnya di path/query, dan path
// masuk access log server, proxy, dan CDN. POST menaruhnya di body — tidak ter-log secara
// default, tidak ikut ke `Referer`, tidak nyangkut di riwayat.
//
// Backend membandingkan HASH-nya (`token_hash`), bukan tokennya. Sisi halaman tidak menyimpan
// token mentah sama sekali (lihat `@/lib/partner/entry`).

import { apiFetch } from "./client";
import { isApiError } from "./errors";
import type { PartnerCheckoutSession } from "@/lib/partner/types";

export const PARTNER_SESSION_RESOLVE_PATH = "/api/v2/checkout/partner-session/resolve";

/**
 * SATU pesan untuk SEMUA kegagalan resolve.
 *
 * Ini disengaja. Membedakan "tautan tidak dikenal" dari "tautan kedaluwarsa" dari "tautan ini
 * milik pesanan lain" memberi tahu pemegang tautan acak apakah suatu pesanan ADA — orakel yang
 * cukup untuk memetakan pesanan orang lain dengan menebak. Halaman ini tidak punya kepentingan
 * apa pun untuk membedakannya di depan customer; yang membedakan cukup backend, di log-nya
 * sendiri.
 */
export const PARTNER_SESSION_REJECTED_MESSAGE =
  "Tautan pembayaran ini tidak berlaku. Silakan kembali ke halaman pemesanan dan ulangi prosesnya.";

/** Kegagalan resolve — sengaja tanpa sebab yang bisa dibaca customer. */
export class PartnerSessionRejectedError extends Error {
  constructor() {
    super(PARTNER_SESSION_REJECTED_MESSAGE);
    this.name = "PartnerSessionRejectedError";
  }
}

export function isPartnerSessionRejected(error: unknown): error is PartnerSessionRejectedError {
  return error instanceof PartnerSessionRejectedError;
}

/**
 * Tukar token tautan → sesi. Token hanya lewat di BODY, sekali.
 *
 * Semua kegagalan (401/403/404/410/422/500, jaringan mati, body tak berbentuk sesi) diratakan
 * jadi `PartnerSessionRejectedError`. 429 sengaja TIDAK diratakan: itu throttle, bukan sesi
 * tak berlaku, dan menyembunyikannya akan menyuruh customer mengulang tautan yang sebenarnya
 * masih sah.
 */
export async function resolvePartnerSession(token: string): Promise<PartnerCheckoutSession> {
  let raw: unknown;
  try {
    raw = await apiFetch<unknown>(PARTNER_SESSION_RESOLVE_PATH, {
      method: "POST",
      body: { token },
    });
  } catch (error) {
    if (isApiError(error) && error.status === 429) throw error;
    throw new PartnerSessionRejectedError();
  }

  const session = asPartnerSession(raw);
  if (!session) throw new PartnerSessionRejectedError();
  return session;
}

/** Body → sesi, atau `null` kalau bentuknya tak memenuhi minimum yang dibutuhkan halaman. */
function asPartnerSession(raw: unknown): PartnerCheckoutSession | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (typeof r.orderId !== "string" || !r.orderId) return null;
  if (typeof r.sessionToken !== "string" || !r.sessionToken) return null;
  if (typeof r.expiresAt !== "string" || !r.expiresAt) return null;
  if (r.model !== "VA" && r.model !== "USDX" && r.model !== "NEUTRAL") return null;

  const branding = r.branding;
  return {
    orderId: r.orderId,
    model: r.model,
    status: typeof r.status === "string" ? (r.status as PartnerCheckoutSession["status"]) : "OPENED",
    sessionToken: r.sessionToken,
    expiresAt: r.expiresAt,
    returnUrl: typeof r.returnUrl === "string" ? r.returnUrl : null,
    cancelUrl: typeof r.cancelUrl === "string" ? r.cancelUrl : null,
    branding: branding && typeof branding === "object" ? asBranding(branding) : null,
  };
}

function asBranding(raw: object): PartnerCheckoutSession["branding"] {
  const b = raw as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  return {
    displayName: str(b.displayName) ?? "",
    logoUrl: str(b.logoUrl),
    faviconUrl: str(b.faviconUrl),
    primaryColor: str(b.primaryColor),
    accentColor: str(b.accentColor),
    supportEmail: str(b.supportEmail),
    footerText: str(b.footerText),
    allowedReturnOrigins: Array.isArray(b.allowedReturnOrigins)
      ? b.allowedReturnOrigins.filter((o): o is string => typeof o === "string")
      : [],
  };
}
