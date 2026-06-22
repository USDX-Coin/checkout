// Pembungkus fetch tipis untuk backend USDX (USDX-224, port dari app USDX-150).
// Auth = **bearer JWT** yang di-handoff dari `app` lewat URL hash (USDX-239,
// supersede cross-subdomain cookie): tiap request bawa `Authorization: Bearer
// <token>` dari `sessionStorage` (lihat `@/lib/auth/token`) — BUKAN cookie /
// `credentials:"include"`. Checkout tidak punya UI login; token datang dari
// redirect `app`. Kalau token tak ada / kedaluwarsa → 401 → halaman redirect balik
// ke `app` (lihat `useCheckout`).
//
// - Prepend `env.apiBaseUrl` agar request kena backend, bukan origin FE.
// - Unwrap envelope SoT `{ status, metadata, data }` → kembalikan `data`.
// - Throw `ApiError` (bentuk SoT `ErrorResponse`) untuk non-2xx.

import { env } from "@/lib/env";
import { getToken } from "@/lib/auth/token";

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = undefined) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface SoTSuccessEnvelope<T> {
  status: "success";
  metadata?: unknown;
  data: T;
}

interface SoTErrorEnvelope {
  status?: "error";
  error?: { code?: string; message?: string; details?: unknown };
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  // Bearer JWT dari sessionStorage (handoff `#token=` dari app, USDX-239).
  const token = getToken();
  if (token && !finalHeaders.has("Authorization")) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const err = (payload ?? {}) as SoTErrorEnvelope;
    throw new ApiError(
      response.status,
      err.error?.code ?? "UNKNOWN",
      err.error?.message ?? response.statusText ?? "Request failed",
      err.error?.details,
    );
  }

  // Toleransi handler yang belum migrasi ke envelope SoT.
  if (payload && typeof payload === "object" && "status" in (payload as object)) {
    return (payload as SoTSuccessEnvelope<T>).data;
  }
  return payload as T;
}
