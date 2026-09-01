/**
 * Chuẩn hóa URL ảnh blog (Google Drive / MinIO CDN / path nội bộ).
 */

const DEFAULT_CDN_BASE = 'https://cdn.phhotel.vn';

export function getBlogCdnBaseUrl(cdnBaseUrl?: string): string {
  return String(cdnBaseUrl || DEFAULT_CDN_BASE).trim().replace(/\/$/, '') || DEFAULT_CDN_BASE;
}

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

function isFrontendAppHost(host: string): boolean {
  const h = String(host || '').toLowerCase();
  return h === 'admin.phhotel.vn' || h === 'www.phhotel.vn' || h === 'phhotel.vn';
}

/** admin.phhotel.vn/assets/... không có file upload — chuyển sang API. */
function rewriteFrontendHostedAssetUrl(url: string, apiBaseUrl: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || '';
    if (!path.startsWith('/assets/') && !path.startsWith('/files/')) {
      return null;
    }
    if (!isFrontendAppHost(parsed.host)) {
      return null;
    }
    const base = String(apiBaseUrl || 'https://api.phhotel.vn').replace(/\/$/, '');
    return `${base}${path}`;
  } catch {
    return null;
  }
}

function isCdnHost(host: string, cdnBaseUrl: string): boolean {
  try {
    const cdnHost = new URL(cdnBaseUrl).host.toLowerCase();
    return host.toLowerCase() === cdnHost;
  } catch {
    return /^cdn\.phhotel\.vn$/i.test(host);
  }
}

/** Path kiểu /phhotel/blog/x.jpg hoặc blog/x.jpg → absolute CDN URL. */
export function resolveMinioCdnUrl(urlOrPath: string, cdnBaseUrl?: string): string | null {
  const trimmed = String(urlOrPath || '').trim();
  if (!trimmed) {
    return null;
  }
  const cdn = getBlogCdnBaseUrl(cdnBaseUrl);

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (isCdnHost(parsed.host, cdn)) {
        return trimmed;
      }
    } catch {
      return null;
    }
    return null;
  }

  // /phhotel/blog|avatars/... hoặc blog/... | avatars/...
  if (
    /^\/?phhotel\//i.test(trimmed) ||
    /^\/?blog\//i.test(trimmed) ||
    /^\/?avatars\//i.test(trimmed)
  ) {
    const path = trimmed.replace(/^\/+/, '');
    const withBucket =
      path.startsWith('blog/') || path.startsWith('avatars/') ? `phhotel/${path}` : path;
    return `${cdn}/${withBucket}`;
  }

  return null;
}

export function resolveBlogImageUrl(
  urlOrId: string | null | undefined,
  apiBaseUrl: string,
  cdnBaseUrl?: string
): string {
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

  const cdnUrl = resolveMinioCdnUrl(trimmed, cdnBaseUrl);
  if (cdnUrl) {
    return cdnUrl;
  }

  const rewritten = rewriteFrontendHostedAssetUrl(trimmed, apiBaseUrl);
  if (rewritten) {
    return rewritten;
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

/** Khi lưu bài viết: giữ CDN absolute; Drive share → direct; path nội bộ giữ portable. */
export function normalizeBlogImageForSave(
  url: string | null | undefined,
  cdnBaseUrl?: string
): string {
  if (!url) {
    return '';
  }
  const drive = toGoogleDriveDirectImageUrl(url);
  if (drive) {
    return drive;
  }
  const cdn = resolveMinioCdnUrl(url, cdnBaseUrl);
  if (cdn) {
    return cdn;
  }
  return String(url).trim();
}

/**
 * Đưa URL tuyệt đối của API về path portable (/assets/... hoặc /files/...).
 * Giữ nguyên URL CDN MinIO / Drive / data:.
 */
export function toPortableBlogImageUrl(
  url: string | null | undefined,
  apiBaseUrl: string,
  cdnBaseUrl?: string
): string {
  if (!url) {
    return '';
  }
  let next = normalizeBlogImageForSave(url, cdnBaseUrl);
  if (!next) {
    return '';
  }

  // CDN absolute — giữ nguyên để public site load từ cdn.phhotel.vn
  if (resolveMinioCdnUrl(next, cdnBaseUrl)) {
    return resolveMinioCdnUrl(next, cdnBaseUrl) || next;
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
      if (isFrontendAppHost(parsed.host)) {
        return parsed.pathname;
      }
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
export function rewriteBlogHtmlImageUrls(
  html: string | null | undefined,
  apiBaseUrl: string,
  cdnBaseUrl?: string
): string {
  if (!html) {
    return '';
  }
  return html.replace(/\bsrc\s*=\s*(["'])([^"']+)\1/gi, (_match, quote: string, src: string) => {
    const resolved = resolveBlogImageUrl(src, apiBaseUrl, cdnBaseUrl);
    return `src=${quote}${resolved || src}${quote}`;
  });
}

/** Chuẩn hóa src ảnh trong HTML trước khi lưu DB (CDN absolute + portable path + Drive). */
export function normalizeBlogHtmlImageUrlsForSave(
  html: string | null | undefined,
  apiBaseUrl: string,
  cdnBaseUrl?: string
): string {
  if (!html) {
    return '';
  }
  return html.replace(/\bsrc\s*=\s*(["'])([^"']+)\1/gi, (_match, quote: string, src: string) => {
    const portable = toPortableBlogImageUrl(src, apiBaseUrl, cdnBaseUrl);
    return `src=${quote}${portable || src}${quote}`;
  });
}

/** Chọn URL ảnh từ response upload: CDN hoặc API, không dùng host admin. */
export function resolveUploadedMediaUrl(
  response: {
    absoluteUrl?: string;
    imageUrl?: string;
    filename?: string;
    imageId?: string;
  } | null | undefined,
  apiBaseUrl: string,
  cdnBaseUrl?: string
): string {
  if (!response) {
    return '';
  }
  const candidates = [
    response.absoluteUrl,
    response.imageUrl,
    response.filename ? `/assets/blog/${response.filename}` : '',
    response.imageId ? `/files/${response.imageId}` : ''
  ];
  for (const candidate of candidates) {
    const resolved = resolveBlogImageUrl(candidate, apiBaseUrl, cdnBaseUrl);
    if (resolved) {
      return resolved;
    }
  }
  return '';
}
