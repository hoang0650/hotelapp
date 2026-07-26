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

  const driveDirect = toGoogleDriveDirectImageUrl(urlOrId);
  if (driveDirect) {
    return driveDirect;
  }

  if (urlOrId.startsWith('http://') || urlOrId.startsWith('https://')) {
    return urlOrId;
  }

  if (urlOrId.startsWith('/assets/') || urlOrId.startsWith('/files/')) {
    return `${apiBaseUrl}${urlOrId}`;
  }

  return `${apiBaseUrl}/files/${urlOrId}`;
}

/** Khi lưu bài viết: giữ path nội bộ; chỉ đổi link Drive share sang direct. */
export function normalizeBlogImageForSave(url: string | null | undefined): string {
  if (!url) {
    return '';
  }
  return toGoogleDriveDirectImageUrl(url) || url.trim();
}
