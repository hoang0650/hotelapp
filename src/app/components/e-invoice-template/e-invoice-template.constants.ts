/**
 * Phân loại mẫu/ký hiệu hóa đơn điện tử theo:
 * - Nghị định 123/2020/NĐ-CP (sửa đổi NĐ 70/2025/NĐ-CP) — Điều 11 HĐĐT khởi tạo từ MTT
 * - Thông tư 78/2021/TT-BTC — Điều 4 ký hiệu mẫu số & ký hiệu hóa đơn
 *
 * Khách sạn bán trực tiếp cho khách lẻ: ưu tiên mẫu số 1 (GTGT) + ký hiệu có chữ M (MTT).
 * Ví dụ ký hiệu: C25MAA — C: có mã CQT, 25: năm 2025, M: máy tính tiền.
 */

export type InvoicePatternCode = '1' | '2' | '3' | '4' | '5' | '6' | 'unknown';
export type InvoiceSeriesKind = 'T' | 'D' | 'L' | 'M' | 'N' | 'B' | 'G' | 'H' | 'unknown';
export type TaxAuthorityCodeType = 'C' | 'K' | 'unknown';
export type TemplateComplianceLevel = 'recommended' | 'acceptable' | 'warning' | 'not_suitable';
export type TemplateFilterMode = 'all' | 'recommended' | 'mtt' | 'vat';

export interface InvoiceTemplateMeta {
  patternCode: InvoicePatternCode;
  patternLabelKey: string;
  seriesKind: InvoiceSeriesKind;
  seriesKindLabelKey: string;
  taxCodeType: TaxAuthorityCodeType;
  invoiceYear: string;
  isCashRegister: boolean;
  isHotelRecommended: boolean;
  complianceLevel: TemplateComplianceLevel;
  complianceNoteKey: string;
  recommendationScore: number;
}

const PATTERN_LABEL_KEYS: Record<string, string> = {
  '1': 'E_INVOICE_TEMPLATE.PATTERN.VAT',
  '2': 'E_INVOICE_TEMPLATE.PATTERN.SALES',
  '3': 'E_INVOICE_TEMPLATE.PATTERN.PUBLIC_ASSET',
  '4': 'E_INVOICE_TEMPLATE.PATTERN.NATIONAL_RESERVE',
  '5': 'E_INVOICE_TEMPLATE.PATTERN.OTHER',
  '6': 'E_INVOICE_TEMPLATE.PATTERN.WAREHOUSE',
  unknown: 'E_INVOICE_TEMPLATE.PATTERN.UNKNOWN'
};

const SERIES_KIND_LABEL_KEYS: Record<string, string> = {
  T: 'E_INVOICE_TEMPLATE.SERIES_KIND.T',
  D: 'E_INVOICE_TEMPLATE.SERIES_KIND.D',
  L: 'E_INVOICE_TEMPLATE.SERIES_KIND.L',
  M: 'E_INVOICE_TEMPLATE.SERIES_KIND.M',
  N: 'E_INVOICE_TEMPLATE.SERIES_KIND.N',
  B: 'E_INVOICE_TEMPLATE.SERIES_KIND.B',
  G: 'E_INVOICE_TEMPLATE.SERIES_KIND.G',
  H: 'E_INVOICE_TEMPLATE.SERIES_KIND.H',
  unknown: 'E_INVOICE_TEMPLATE.SERIES_KIND.UNKNOWN'
};

function extractPatternCode(templateCode: string): InvoicePatternCode {
  const raw = String(templateCode || '').trim();
  const match = raw.match(/^([1-6])\b/) || raw.match(/(?:^|[^0-9])([1-6])(?:[^0-9]|$)/);
  const code = match?.[1];
  if (code === '1' || code === '2' || code === '3' || code === '4' || code === '5' || code === '6') {
    return code;
  }
  return 'unknown';
}

function parseInvoiceSeries(invoiceSeries: string): {
  taxCodeType: TaxAuthorityCodeType;
  invoiceYear: string;
  seriesKind: InvoiceSeriesKind;
} {
  const series = String(invoiceSeries || '').trim().toUpperCase();
  if (series.length < 4) {
    return { taxCodeType: 'unknown', invoiceYear: '', seriesKind: 'unknown' };
  }

  const taxCodeType: TaxAuthorityCodeType =
    series.startsWith('C') ? 'C' : series.startsWith('K') ? 'K' : 'unknown';
  const invoiceYear = series.substring(1, 3);
  const kindChar = series[3]?.toUpperCase();
  const seriesKind: InvoiceSeriesKind =
    kindChar === 'T' || kindChar === 'D' || kindChar === 'L' || kindChar === 'M' ||
    kindChar === 'N' || kindChar === 'B' || kindChar === 'G' || kindChar === 'H'
      ? kindChar
      : 'unknown';

  return { taxCodeType, invoiceYear, seriesKind };
}

export function analyzeInvoiceTemplate(
  templateCode: string,
  invoiceSeries: string
): InvoiceTemplateMeta {
  const patternCode = extractPatternCode(templateCode);
  const { taxCodeType, invoiceYear, seriesKind } = parseInvoiceSeries(invoiceSeries);
  const isCashRegister = seriesKind === 'M';

  let complianceLevel: TemplateComplianceLevel = 'acceptable';
  let complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.GENERIC';
  let recommendationScore = 50;
  let isHotelRecommended = false;

  if (patternCode === '1' && isCashRegister && taxCodeType === 'C') {
    complianceLevel = 'recommended';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.HOTEL_VAT_MTT_C';
    recommendationScore = 100;
    isHotelRecommended = true;
  } else if (patternCode === '1' && isCashRegister) {
    complianceLevel = 'recommended';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.HOTEL_VAT_MTT';
    recommendationScore = 92;
    isHotelRecommended = true;
  } else if (patternCode === '2' && isCashRegister) {
    complianceLevel = 'acceptable';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.HOTEL_SALES_MTT';
    recommendationScore = 75;
    isHotelRecommended = true;
  } else if (patternCode === '1' && seriesKind === 'T') {
    complianceLevel = 'warning';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.VAT_NOT_MTT';
    recommendationScore = 35;
  } else if (patternCode === '1' && !isCashRegister && seriesKind !== 'unknown') {
    complianceLevel = 'warning';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.NOT_MTT';
    recommendationScore = 30;
  } else if (patternCode !== '1' && patternCode !== '2' && patternCode !== 'unknown') {
    complianceLevel = 'not_suitable';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.NOT_FOR_HOTEL';
    recommendationScore = 10;
  } else if (!isCashRegister && seriesKind !== 'unknown') {
    complianceLevel = 'warning';
    complianceNoteKey = 'E_INVOICE_TEMPLATE.COMPLIANCE.NOT_MTT';
    recommendationScore = 25;
  }

  return {
    patternCode,
    patternLabelKey: PATTERN_LABEL_KEYS[patternCode] || PATTERN_LABEL_KEYS['unknown'],
    seriesKind,
    seriesKindLabelKey: SERIES_KIND_LABEL_KEYS[seriesKind] || SERIES_KIND_LABEL_KEYS['unknown'],
    taxCodeType,
    invoiceYear,
    isCashRegister,
    isHotelRecommended,
    complianceLevel,
    complianceNoteKey,
    recommendationScore
  };
}

export function sortTemplatesByRecommendation<T extends { meta?: InvoiceTemplateMeta }>(templates: T[]): T[] {
  return [...templates].sort((a, b) => {
    const scoreDiff = (b.meta?.recommendationScore || 0) - (a.meta?.recommendationScore || 0);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return 0;
  });
}

export function pickHotelRecommendedTemplate<T extends { meta?: InvoiceTemplateMeta }>(
  templates: T[]
): T | null {
  if (!templates.length) {
    return null;
  }
  const sorted = sortTemplatesByRecommendation(templates);
  return sorted.find(t => t.meta?.isHotelRecommended) || sorted[0] || null;
}

export function filterTemplatesByMode<T extends { meta?: InvoiceTemplateMeta }>(
  templates: T[],
  mode: TemplateFilterMode
): T[] {
  switch (mode) {
    case 'recommended':
      return templates.filter(t => t.meta?.isHotelRecommended);
    case 'mtt':
      return templates.filter(t => t.meta?.isCashRegister);
    case 'vat':
      return templates.filter(t => t.meta?.patternCode === '1');
    default:
      return templates;
  }
}
