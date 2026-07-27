/**
 * Cấu hình 6 gói giá PHHotel + phí bổ sung (thị trường VN).
 * Dùng chung cho trang /pricing và quản lý gói giá.
 */

export interface RecommendedPricingPackage {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlyDiscount: number;
  monthlyDuration: number;
  yearlyDuration: number;
  duration: number;
  features: string[];
  permissions: string[];
  maxUsers: number; // 0 = unlimited
  maxRooms: number; // 0 = unlimited
  isContactOnly?: boolean;
  contactLabel?: string;
  qrPaymentFeature?: boolean;
  otaManagementFeature?: boolean;
  emailManagementFeature?: boolean;
  electricManagementFeature?: boolean;
  paypalPaymentFeature?: boolean;
  cryptoPaymentFeature?: boolean;
  draftInvoiceFeature?: boolean;
  exportInvoiceFeature?: boolean;
  aiChatboxFeature?: boolean;
  hotelNotificationFeature?: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface AdditionalFeeItem {
  titleKey: string;
  descKey: string;
  priceLabelKey: string;
  icon: string;
}

/** Thứ tự hiển thị chuẩn trên /pricing */
export const RECOMMENDED_PACKAGE_ORDER: string[] = [
  'Dùng Thử',
  'Khởi Đầu',
  'Vận Hành',
  'Tăng Trưởng',
  'AI Pro',
  'Chuỗi / Enterprise'
];

export const RECOMMENDED_PRICING_PACKAGES: RecommendedPricingPackage[] = [
  {
    name: 'Dùng Thử',
    description:
      'Dùng thử miễn phí cho homestay/nhà nghỉ muốn trải nghiệm PHHotel. Tối đa 8 phòng, phù hợp demo vận hành cơ bản.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyDiscount: 0,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'service_management',
      'calendar',
      'qr_payment'
    ],
    permissions: ['view', 'edit'],
    maxUsers: 2,
    maxRooms: 8,
    qrPaymentFeature: true,
    draftInvoiceFeature: true,
    isActive: true,
    sortOrder: 1
  },
  {
    name: 'Khởi Đầu',
    description:
      'Gói cơ bản cho homestay/nhà nghỉ ≤ 20 phòng: quản lý phòng, OCR check-in, QR SePay, lịch đặt phòng.',
    monthlyPrice: 299000,
    yearlyPrice: 2990000,
    yearlyDiscount: 17,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'service_management',
      'calendar',
      'bank_transfer_history',
      'qr_payment'
    ],
    permissions: ['view', 'edit', 'manage'],
    maxUsers: 5,
    maxRooms: 20,
    qrPaymentFeature: true,
    draftInvoiceFeature: true,
    hotelNotificationFeature: true,
    isActive: true,
    sortOrder: 2
  },
  {
    name: 'Vận Hành',
    description:
      'Gói phổ biến cho KS 20–50 phòng: giao ca, báo cáo tài chính, nhân sự, hóa đơn điện tử và thông báo thanh toán.',
    monthlyPrice: 699000,
    yearlyPrice: 6990000,
    yearlyDiscount: 17,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'service_management',
      'calendar',
      'bank_transfer_history',
      'qr_payment',
      'shift_handover',
      'staff_management',
      'revenue_chart',
      'financial_summary_report'
    ],
    permissions: ['view', 'edit', 'manage'],
    maxUsers: 15,
    maxRooms: 50,
    qrPaymentFeature: true,
    draftInvoiceFeature: true,
    exportInvoiceFeature: true,
    emailManagementFeature: true,
    hotelNotificationFeature: true,
    isActive: true,
    sortOrder: 3
  },
  {
    name: 'Tăng Trưởng',
    description:
      'Cho KS có OTA và bán phòng qua MXH: đồng bộ OTA, bot Zalo/Fanpage/Telegram, Sale Agent dẫn cọc và AI Chatbox mức nhẹ.',
    monthlyPrice: 1490000,
    yearlyPrice: 14900000,
    yearlyDiscount: 17,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'hotel_management',
      'service_management',
      'calendar',
      'bank_transfer_history',
      'qr_payment',
      'shift_handover',
      'staff_management',
      'revenue_chart',
      'financial_summary_report',
      'ota_management',
      'fanpage_messages',
      'zalo_messages',
      'telegram_messages'
    ],
    permissions: ['view', 'edit', 'delete', 'manage'],
    maxUsers: 30,
    maxRooms: 100,
    qrPaymentFeature: true,
    otaManagementFeature: true,
    draftInvoiceFeature: true,
    exportInvoiceFeature: true,
    emailManagementFeature: true,
    hotelNotificationFeature: true,
    aiChatboxFeature: true,
    isActive: true,
    sortOrder: 4
  },
  {
    name: 'AI Pro',
    description:
      'AI Agent vận hành đầy đủ: OpenClaw, AI Chatbox nội bộ, Tuya điện phòng, Visa/PayPal và quota AI cao cho KS ≤ 200 phòng.',
    monthlyPrice: 2990000,
    yearlyPrice: 29900000,
    yearlyDiscount: 17,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'hotel_management',
      'company_management',
      'user_management',
      'service_management',
      'calendar',
      'bank_transfer_history',
      'qr_payment',
      'visa_payment',
      'shift_handover',
      'staff_management',
      'revenue_chart',
      'financial_summary_report',
      'ota_management',
      'fanpage_messages',
      'zalo_messages',
      'telegram_messages',
      'electric_management',
      'email_admin'
    ],
    permissions: ['view', 'edit', 'delete', 'manage'],
    maxUsers: 50,
    maxRooms: 200,
    qrPaymentFeature: true,
    otaManagementFeature: true,
    draftInvoiceFeature: true,
    exportInvoiceFeature: true,
    emailManagementFeature: true,
    hotelNotificationFeature: true,
    aiChatboxFeature: true,
    electricManagementFeature: true,
    paypalPaymentFeature: true,
    isActive: true,
    sortOrder: 5
  },
  {
    name: 'Chuỗi / Enterprise',
    description:
      'Đa cơ sở, không giới hạn phòng/user theo thỏa thuận, SLA riêng, training dedicated và tùy biến tích hợp. Liên hệ để nhận báo giá.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyDiscount: 0,
    monthlyDuration: 1,
    yearlyDuration: 12,
    duration: 1,
    features: [
      'room_management',
      'hotel_management',
      'company_management',
      'user_management',
      'service_management',
      'staff_management',
      'pricing_management',
      'ota_management',
      'revenue_chart',
      'financial_summary_report',
      'shift_handover',
      'bank_transfer_history',
      'calendar',
      'email_admin',
      'qr_payment',
      'visa_payment',
      'electric_management',
      'fanpage_messages',
      'zalo_messages',
      'telegram_messages'
    ],
    permissions: ['view', 'edit', 'delete', 'manage'],
    maxUsers: 0,
    maxRooms: 0,
    isContactOnly: true,
    contactLabel: 'Liên hệ',
    qrPaymentFeature: true,
    otaManagementFeature: true,
    draftInvoiceFeature: true,
    exportInvoiceFeature: true,
    emailManagementFeature: true,
    hotelNotificationFeature: true,
    aiChatboxFeature: true,
    electricManagementFeature: true,
    paypalPaymentFeature: true,
    cryptoPaymentFeature: true,
    isActive: true,
    sortOrder: 6
  }
];

/** Chuẩn hóa tên gói để so khớp order (NFC, khoảng trắng, dấu /). */
export function normalizePricingPackageName(name: string | undefined | null): string {
  return String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
}

/**
 * Alias / keyword → thứ tự hiển thị (0-based).
 * Khớp cả tên DB lệch khoảng trắng / không dấu / viết tắt.
 */
const PACKAGE_ORDER_ALIASES: Array<{ match: string | RegExp; index: number }> = [
  { match: /dung\s*thu|trial|free\s*trial/, index: 0 },
  { match: /khoi\s*dau|starter|basic/, index: 1 },
  { match: /van\s*hanh|operations|operation/, index: 2 },
  { match: /tang\s*truong|growth/, index: 3 },
  { match: /ai\s*pro|aipro/, index: 4 },
  { match: /chuoi|enterprise|chain/, index: 5 }
];

const NORMALIZED_PACKAGE_ORDER = RECOMMENDED_PACKAGE_ORDER.map((name) =>
  normalizePricingPackageName(name)
);

export function resolveRecommendedPackageOrderIndex(pkg: {
  name?: string;
  sortOrder?: number | null;
}): number {
  const normalized = normalizePricingPackageName(pkg?.name);
  const exact = NORMALIZED_PACKAGE_ORDER.indexOf(normalized);
  if (exact >= 0) {
    return exact;
  }

  for (const alias of PACKAGE_ORDER_ALIASES) {
    if (typeof alias.match === 'string') {
      if (normalized === alias.match || normalized.includes(alias.match)) {
        return alias.index;
      }
    } else if (alias.match.test(normalized)) {
      return alias.index;
    }
  }

  if (typeof pkg?.sortOrder === 'number' && Number.isFinite(pkg.sortOrder) && pkg.sortOrder > 0) {
    return Math.max(0, Math.floor(pkg.sortOrder) - 1);
  }

  return 999;
}

export function isRecommendedSellerPackage(pkg: { name?: string }): boolean {
  return resolveRecommendedPackageOrderIndex(pkg) === 2; // Vận Hành
}

export function sortPackagesByRecommendedOrder<
  T extends { name?: string; sortOrder?: number | null; monthlyPrice?: number | null }
>(packages: T[]): T[] {
  return [...(packages || [])].sort((a, b) => {
    const ai = resolveRecommendedPackageOrderIndex(a);
    const bi = resolveRecommendedPackageOrderIndex(b);
    if (ai !== bi) {
      return ai - bi;
    }
    const priceA = Number(a?.monthlyPrice);
    const priceB = Number(b?.monthlyPrice);
    if (Number.isFinite(priceA) && Number.isFinite(priceB) && priceA !== priceB) {
      return priceA - priceB;
    }
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'vi');
  });
}

export const FEATURE_PREVIEW_LIMIT = 5;
