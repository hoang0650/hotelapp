/**
 * Checkout quotes come from POST /rooms/calculate-checkout-total.
 * The client displays that quote and must not recompute early/late surcharges.
 */

export const HOTEL_OFFSET = '+07:00';

export type StayRateType = 'hourly' | 'daily' | 'nightly' | 'weekly' | 'monthly' | string;

export interface StayPriceDetails {
  rateType?: StayRateType;
  days?: number;
  nights?: number;
  weeks?: number;
  months?: number;
  basePrice?: number;
  dailyBasePrice?: number;
  firstHourPrice?: number;
  additionalHoursCount?: number;
  additionalHoursPrice?: number;
  durationInHours?: number;
  totalHours?: number;
  remainingMinutes?: number;
  gracePeriodMinutes?: number;
  earlyCheckinHours?: number;
  earlyCheckinSurcharge?: number;
  lateCheckoutHours?: number;
  lateCheckoutSurcharge?: number;
  holidaySurchargeAmount?: number;
  holidaySurchargePercent?: number;
  weekendSurchargeAmount?: number;
  weekendSurchargePercent?: number;
  /** Checkout deadline as a real instant (ISO) or offset string. */
  deadline?: string | Date;
  roomTotal?: number;
  hours?: number;
  hourlyPrice?: number;
  note?: string;
  /** Legacy nested breakdown some invoice getters still read. */
  breakdown?: any;
}

export interface CheckoutServiceInput {
  serviceId?: string;
  _id?: string;
  name?: string;
  serviceName?: string;
  price?: number;
  quantity?: number;
  totalPrice?: number;
}

export interface CalculateCheckoutRequest {
  roomId: string;
  rateType: StayRateType;
  checkInTime: Date | string;
  checkOutTime: Date | string;
  services?: CheckoutServiceInput[];
  additionalCharges?: number;
  discount?: number;
}

export interface CheckoutQuote {
  roomId?: string;
  rateType?: StayRateType;
  roomTotal?: number;
  totalPrice?: number;
  servicesTotal?: number;
  additionalCharges?: number;
  discount?: number;
  grandTotal?: number;
  totalAmount?: number;
  priceDetails?: StayPriceDetails;
  products?: any[];
  metadata?: {
    priceDetails?: StayPriceDetails;
    products?: any[];
    [key: string]: any;
  };
  durationInHours?: number;
  invoice?: any;
}

export interface PriceDetailLine {
  label: string;
  amount: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Serialize a real instant.
 * - Date -> toISOString() (true UTC instant).
 * - String that already has Z or a numeric offset -> the same instant via toISOString().
 * - Naive wall clock (datetime-local) -> hotel offset +07:00, never a fake Z.
 */
export function toRealInstantIso(value: Date | string | null | undefined): string {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString();
  }

  const raw = String(value).trim();
  if (!raw) return '';

  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return raw;
  }

  const normalized = raw.replace(' ', 'T');
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?/);
  if (match) {
    const seconds = match[2] ?? '00';
    const fraction = match[3] ? `.${match[3].padEnd(3, '0')}` : '';
    return `${match[1]}:${seconds}${fraction}${HOTEL_OFFSET}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return raw;
}

/** Clock digits the user picked, labeled as Vietnam time rather than Z. */
export function pickedClockToHotelOffset(value: Date | string | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return toRealInstantIso(value);
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  const hh = String(value.getHours()).padStart(2, '0');
  const mm = String(value.getMinutes()).padStart(2, '0');
  const ss = String(value.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${HOTEL_OFFSET}`;
}

export function showLateCheckoutLine(details: StayPriceDetails | null | undefined): boolean {
  return Number(details?.lateCheckoutHours || 0) > 0;
}

export function priceDetailsFromQuote(quote: CheckoutQuote | null | undefined): StayPriceDetails | null {
  if (!quote) return null;
  return (
    quote.priceDetails ||
    quote.metadata?.priceDetails ||
    quote.invoice?.metadata?.priceDetails ||
    quote.invoice?.priceDetails ||
    null
  );
}

function sumBreakdown(details: StayPriceDetails | null): number {
  if (!details) return 0;
  const days = Number(details.days || 0);
  const nights = Number(details.nights || 0);
  const weeks = Number(details.weeks || 0);
  const months = Number(details.months || 0);
  const base = Number(details.basePrice || 0);
  const dailyBase = Number(details.dailyBasePrice || 0);
  let total = 0;

  if (details.rateType === 'hourly') {
    total += Number(details.firstHourPrice || 0) + Number(details.additionalHoursPrice || 0);
  } else if (details.rateType === 'nightly') {
    total += nights * base + days * dailyBase;
  } else if (details.rateType === 'weekly') {
    total += weeks * base;
  } else if (details.rateType === 'monthly') {
    total += months * base;
  } else if (days > 0 && base > 0) {
    total += days * base;
  }

  total += Number(details.earlyCheckinSurcharge || 0);
  if (showLateCheckoutLine(details)) {
    total += Number(details.lateCheckoutSurcharge || 0);
  }
  total += Number(details.holidaySurchargeAmount || 0);
  total += Number(details.weekendSurchargeAmount || 0);
  return Math.round(total);
}

function hasStayBreakdown(details: StayPriceDetails | null): boolean {
  if (!details) return false;
  const days = Number(details.days || 0);
  const nights = Number(details.nights || 0);
  const weeks = Number(details.weeks || 0);
  const months = Number(details.months || 0);
  const base = Number(details.basePrice || 0);
  if (details.rateType === 'hourly') {
    return Number(details.firstHourPrice || 0) > 0 || Number(details.additionalHoursPrice || 0) > 0;
  }
  if (details.rateType === 'nightly') return (nights > 0 && base > 0) || days > 0;
  if (details.rateType === 'weekly') return weeks > 0 && base > 0;
  if (details.rateType === 'monthly') return months > 0 && base > 0;
  return days > 0 && base > 0;
}

/** Room charge only. Manual phụ thu / khuyến mãi and services stay outside this number. */
export function roomChargeFromQuote(quote: CheckoutQuote | null | undefined): number {
  if (!quote) return 0;
  const details = priceDetailsFromQuote(quote);
  const summed = sumBreakdown(details);
  if (details && isFiniteNumber(details.roomTotal)) return Math.round(details.roomTotal);
  // Prefer the stay breakdown so a grand total that includes services is not shown as the room charge.
  if (hasStayBreakdown(details) && summed > 0) return summed;

  if (isFiniteNumber(quote.roomTotal)) {
    const services = isFiniteNumber(quote.servicesTotal) ? quote.servicesTotal : 0;
    if (summed > 0 && services > 0 && Math.abs(quote.roomTotal - (summed + services)) < 1) {
      return summed;
    }
    return Math.round(quote.roomTotal);
  }

  if (summed > 0) return summed;

  if (
    isFiniteNumber(quote.totalPrice) &&
    !isFiniteNumber(quote.servicesTotal) &&
    !isFiniteNumber(quote.grandTotal) &&
    !isFiniteNumber(quote.totalAmount)
  ) {
    return Math.round(quote.totalPrice);
  }
  return 0;
}

/**
 * Live checkout total. Room and services come from the server quote;
 * phụ thu and khuyến mãi stay as the amounts the cashier typed.
 */
export function applyManualAdjustments(
  roomCharge: number,
  servicesTotal: number,
  additionalCharges: number,
  discount: number,
  advancePayment: number
): { totalPrice: number; remainingAmount: number } {
  const totalPrice = Number(roomCharge || 0) + Number(additionalCharges || 0) + Number(servicesTotal || 0);
  const remainingAmount = totalPrice - Number(advancePayment || 0) - Number(discount || 0);
  return { totalPrice, remainingAmount };
}

export function productsFromServer(source: any): any[] | null {
  if (!source) return null;
  const candidates = [
    source.products,
    source.invoice?.products,
    source.metadata?.products,
    source.invoice?.metadata?.products
  ];
  for (const list of candidates) {
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return null;
}

export function metadataPriceDetailsFromServer(source: any): StayPriceDetails | null {
  if (!source) return null;
  return (
    source.metadata?.priceDetails ||
    source.invoice?.metadata?.priceDetails ||
    source.priceDetails ||
    source.invoice?.priceDetails ||
    null
  );
}

export function normalizePrintedInvoice(invoice: any): any {
  if (!invoice) return invoice;
  const products = productsFromServer(invoice);
  const priceDetails = metadataPriceDetailsFromServer(invoice);
  return {
    ...invoice,
    products: products || invoice.products || [],
    priceDetails: priceDetails || invoice.priceDetails || null,
    metadata: {
      ...(invoice.metadata || {}),
      ...(priceDetails ? { priceDetails } : {})
    }
  };
}

export function applyServerInvoice(localInvoice: any, response: any): any {
  const backendInvoice = response?.invoice || null;
  const products =
    productsFromServer(response) ||
    productsFromServer(backendInvoice) ||
    localInvoice?.products ||
    [];
  const priceDetails =
    metadataPriceDetailsFromServer(response) ||
    metadataPriceDetailsFromServer(localInvoice);

  const merged: any = {
    ...(localInvoice || {}),
    ...(backendInvoice || {}),
    id: backendInvoice?._id || backendInvoice?.id || response?.invoiceId || localInvoice?.id,
    invoiceNumber:
      backendInvoice?.invoiceNumber ||
      response?.invoiceNumber ||
      localInvoice?.invoiceNumber,
    products
  };

  if (priceDetails) {
    merged.priceDetails = priceDetails;
    merged.metadata = {
      ...(localInvoice?.metadata || {}),
      ...(backendInvoice?.metadata || {}),
      ...(response?.metadata || {}),
      priceDetails
    };
  } else if (response?.metadata || backendInvoice?.metadata) {
    merged.metadata = {
      ...(localInvoice?.metadata || {}),
      ...(backendInvoice?.metadata || {}),
      ...(response?.metadata || {})
    };
  }

  const room =
    (isFiniteNumber(response?.roomTotal) ? response.roomTotal : undefined) ??
    (isFiniteNumber(backendInvoice?.roomTotal) ? backendInvoice.roomTotal : undefined) ??
    (priceDetails && isFiniteNumber(priceDetails.roomTotal) ? priceDetails.roomTotal : undefined);
  if (room != null) {
    merged.roomTotal = room;
    merged.roomPrice = room;
    merged.roomAmount = room;
  }

  return merged;
}

function money(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value || 0));
}

/** Informational breakdown. Late checkout is omitted when lateCheckoutHours is 0. */
export function priceDetailLines(details: StayPriceDetails | null | undefined): PriceDetailLine[] {
  if (!details) return [];
  const lines: PriceDetailLine[] = [];
  const days = Number(details.days || 0);
  const nights = Number(details.nights || 0);
  const weeks = Number(details.weeks || 0);
  const months = Number(details.months || 0);
  const base = Number(details.basePrice || 0);
  const dailyBase = Number(details.dailyBasePrice || 0);

  if (details.rateType === 'hourly') {
    if (Number(details.firstHourPrice || 0) > 0) {
      lines.push({ label: 'Giờ đầu tiên', amount: Number(details.firstHourPrice) });
    }
    if (Number(details.additionalHoursCount || 0) > 0) {
      lines.push({
        label: `${details.additionalHoursCount} giờ tiếp theo`,
        amount: Number(details.additionalHoursPrice || 0)
      });
    }
  } else if (details.rateType === 'nightly') {
    if (nights > 0) {
      lines.push({ label: `${nights} đêm × ${money(base)} đ/đêm`, amount: nights * base });
    }
    if (days > 0) {
      lines.push({ label: `${days} ngày × ${money(dailyBase)} đ/ngày`, amount: days * dailyBase });
    }
  } else if (details.rateType === 'weekly') {
    if (weeks > 0) {
      lines.push({ label: `${weeks} tuần × ${money(base)} đ/tuần`, amount: weeks * base });
    }
  } else if (details.rateType === 'monthly') {
    if (months > 0) {
      lines.push({ label: `${months} tháng × ${money(base)} đ/tháng`, amount: months * base });
    }
  } else if (days > 0) {
    lines.push({ label: `${days} ngày × ${money(base)} đ/ngày`, amount: days * base });
  }

  if (Number(details.holidaySurchargeAmount || 0) > 0) {
    lines.push({
      label: `Phụ thu ngày lễ (${details.holidaySurchargePercent || 0}%)`,
      amount: Number(details.holidaySurchargeAmount)
    });
  }
  if (Number(details.weekendSurchargeAmount || 0) > 0) {
    lines.push({
      label: `Phụ thu cuối tuần (${details.weekendSurchargePercent || 0}%)`,
      amount: Number(details.weekendSurchargeAmount)
    });
  }
  if (Number(details.earlyCheckinHours || 0) > 0) {
    lines.push({
      label: `Phụ thu check-in sớm (${details.earlyCheckinHours} giờ)`,
      amount: Number(details.earlyCheckinSurcharge || 0)
    });
  }
  if (showLateCheckoutLine(details)) {
    lines.push({
      label: `Phụ thu check-out trễ (${details.lateCheckoutHours} giờ)`,
      amount: Number(details.lateCheckoutSurcharge || 0)
    });
  }
  return lines;
}
