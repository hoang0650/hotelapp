/**
 * Chuẩn hóa URL ảnh blog (Google Drive share link → URL dùng được cho thẻ <img>).
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url || !/drive\.google\.com|docs\.google\.com/i.test(url)) {
    return null;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/** Link Google Drive dạng xem/share → URL trực tiếp cho <img>. */
export function toGoogleDriveDirectImageUrl(url: string): string | null {
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) {
    return null;
  }
  // lh3 ổn định hơn uc?export=view với thẻ <img> (ít bị chặn hotlink)
  return `https://lh3.googleusercontent.com/d/${fileId}=w2000`;
}

export function resolveBlogImageUrl(urlOrId: string | null | undefined, apiBaseUrl: string): string {
  if (!urlOrId) {
    return '';
  }

  const trimmed = String(urlOrId).trim();
  if (!trimmed) {
    return '';
  }

  const driveDirect = toGoogleDriveDirectImageUrl(trimmed);
  if (driveDirect) {
    return driveDirect;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const base = String(apiBaseUrl || '').replace(/\/$/, '');
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('/files/')) {
    return `${base}${trimmed}`;
  }

  return `${base}/files/${trimmed}`;
}

/** Khi lưu bài viết: giữ path nội bộ; chỉ đổi link Drive share sang direct. */
export function normalizeBlogImageForSave(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  return toGoogleDriveDirectImageUrl(url) || String(url).trim();
}

/**
 * Đưa URL tuyệt đối của API về path portable (/assets/... hoặc /files/...).
 * Giữ nguyên URL ngoài (CDN, Drive direct, data:).
 */
export function toPortableBlogImageUrl(url: string | null | undefined, apiBaseUrl: string): string {
  if (!url) {
    return '';
  }
  let next = normalizeBlogImageForSave(url);
  if (!next) {
    return '';
  }

  const base = String(apiBaseUrl || '').replace(/\/$/, '');
  if (base && next.startsWith(base + '/')) {
    const path = next.slice(base.length);
    if (path.startsWith('/assets/') || path.startsWith('/files/')) {
      return path;
    }
  }

  try {
    const parsed = new URL(next);
    if (parsed.pathname.startsWith('/assets/') || parsed.pathname.startsWith('/files/')) {
      const apiHost = base ? new URL(base).host : '';
      if (!apiHost || parsed.host === apiHost) {
        return parsed.pathname;
      }
    }
  } catch {
    // relative / blob — giữ nguyên sau normalize
  }

  return next;
}

/** Rewrite mọi src ảnh trong HTML sang URL tuyệt đối (editor preview / public view). */
export function rewriteBlogHtmlImageUrls(html: string | null | undefined, apiBaseUrl: string): string {
  if (!html) {
    return '';
  }
  return html.replace(/\bsrc\s*=\s*(["'])([^"']+)\1/gi, (_match, quote: string, src: string) => {
    const resolved = resolveBlogImageUrl(src, apiBaseUrl);
    return `src=${quote}${resolved || src}${quote}`;
  });
}

/** Chuẩn hóa src ảnh trong HTML trước khi lưu DB (portable path + Drive direct). */
export function normalizeBlogHtmlImageUrlsForSave(
  html: string | null | undefined,
  apiBaseUrl: string
): string {
  if (!html) {
    return '';
  }
  return html.replace(/\bsrc\s*=\s*(["'])([^"']+)\1/gi, (_match, quote: string, src: string) => {
    const portable = toPortableBlogImageUrl(src, apiBaseUrl);
    return `src=${quote}${portable || src}${quote}`;
  });
}
