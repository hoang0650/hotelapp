/**
 * Cookie helpers — thay localStorage/sessionStorage cho prefs phía client.
 * Auth JWT vẫn qua httpOnly cookie (withCredentials) + memory.
 */

const DEFAULT_MAX_AGE_SEC = 365 * 24 * 60 * 60; // 1 năm

function cookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return undefined;
  }
  // Chia sẻ cookie giữa admin.phhotel.vn và phhotel.vn
  if (host.endsWith('phhotel.vn')) {
    return '.phhotel.vn';
  }
  return undefined;
}

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const encoded = encodeURIComponent(name);
    const parts = document.cookie.split(';');
    for (const part of parts) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey === name || rawKey === encoded) {
        return decodeURIComponent(rest.join('=') || '');
      }
    }
  } catch {}
  return null;
}

export function setCookie(
  name: string,
  value: string,
  options?: { maxAgeSec?: number; path?: string; sameSite?: 'Lax' | 'Strict' | 'None' }
): void {
  if (typeof document === 'undefined') return;
  try {
    const maxAge = options?.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
    const path = options?.path || '/';
    const sameSite = options?.sameSite || 'Lax';
    const domain = cookieDomain();
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
    if (typeof location !== 'undefined' && location.protocol === 'https:') {
      cookie += '; Secure';
    }
    if (domain) {
      cookie += `; Domain=${domain}`;
    }
    document.cookie = cookie;
  } catch {}
}

export function removeCookie(name: string): void {
  if (typeof document === 'undefined') return;
  try {
    const path = '/';
    const domain = cookieDomain();
    const base = `${encodeURIComponent(name)}=; Path=${path}; Max-Age=0; SameSite=Lax`;
    document.cookie = base;
    if (domain) {
      document.cookie = `${base}; Domain=${domain}`;
    }
    // Xóa cả bản không domain (cookie cũ)
    document.cookie = `${encodeURIComponent(name)}=; Path=${path}; Max-Age=0`;
  } catch {}
}
