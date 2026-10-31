import {
  applyManualAdjustments,
  applyServerInvoice,
  pickedClockToHotelOffset,
  priceDetailLines,
  roomChargeFromQuote,
  showLateCheckoutLine,
  toRealInstantIso
} from './checkout-quote';

describe('checkout quote', () => {
  const screenshotQuote = {
    roomTotal: 390000,
    servicesTotal: 25000,
    priceDetails: {
      rateType: 'daily' as const,
      days: 1,
      basePrice: 350000,
      earlyCheckinHours: 2,
      earlyCheckinSurcharge: 40000,
      lateCheckoutHours: 0,
      lateCheckoutSurcharge: 0,
      deadline: '2026-10-31T05:00:00.000Z'
    },
    products: [
      { name: 'Tiền phòng', price: 390000, quantity: 1, totalPrice: 390000 },
      { name: 'nước suối', price: 10000, quantity: 1, totalPrice: 10000 },
      { name: 'ô long', price: 15000, quantity: 1, totalPrice: 15000 }
    ],
    metadata: {
      priceDetails: {
        rateType: 'daily' as const,
        days: 1,
        basePrice: 350000,
        earlyCheckinHours: 2,
        earlyCheckinSurcharge: 40000,
        lateCheckoutHours: 0,
        lateCheckoutSurcharge: 0,
        deadline: '2026-10-31T05:00:00.000Z'
      }
    }
  };

  it('uses the server room charge for the daily screenshot stay', () => {
    expect(roomChargeFromQuote(screenshotQuote)).toBe(390000);
    expect(showLateCheckoutLine(screenshotQuote.priceDetails)).toBeFalse();
    const totals = applyManualAdjustments(390000, 25000, 0, 0, 0);
    expect(totals.totalPrice).toBe(415000);
    expect(totals.remainingAmount).toBe(415000);
  });

  it('hides the late-checkout line only when lateCheckoutHours is 0', () => {
    expect(showLateCheckoutLine({ lateCheckoutHours: 0, lateCheckoutSurcharge: 420000 })).toBeFalse();
    expect(showLateCheckoutLine({ lateCheckoutHours: 21 })).toBeTrue();
    expect(showLateCheckoutLine(null)).toBeFalse();
    const lines = priceDetailLines(screenshotQuote.priceDetails);
    expect(lines.some(line => line.label.includes('check-out trễ'))).toBeFalse();
    expect(lines.some(line => line.label.includes('check-in sớm'))).toBeTrue();
  });

  it('keeps manual phụ thu and khuyến mãi outside the room quote', () => {
    const totals = applyManualAdjustments(390000, 25000, 10000, 5000, 20000);
    expect(totals.totalPrice).toBe(425000);
    expect(totals.remainingAmount).toBe(400000);
  });

  it('serializes real instants and never labels a Vietnam wall clock as Z', () => {
    const instant = new Date('2026-10-30T03:40:11.000Z');
    expect(toRealInstantIso(instant)).toBe('2026-10-30T03:40:11.000Z');

    const wall = toRealInstantIso('2026-10-30T10:40:11');
    expect(wall.endsWith('+07:00')).toBeTrue();
    expect(wall.includes('Z')).toBeFalse();
    expect(new Date(wall).toISOString()).toBe('2026-10-30T03:40:11.000Z');

    expect(toRealInstantIso('2026-10-31T08:20:13+07:00')).toBe('2026-10-31T01:20:13.000Z');
  });

  it('sends a picked clock with a +07:00 offset', () => {
    const picked = new Date(2026, 9, 30, 10, 40, 11);
    const iso = pickedClockToHotelOffset(picked);
    expect(iso).toBe('2026-10-30T10:40:11+07:00');
    expect(iso.endsWith('Z')).toBeFalse();
  });

  it('prints the invoice from the server products and metadata.priceDetails', () => {
    const local = {
      invoiceNumber: 'LOCAL',
      products: [{ name: 'Tiền phòng', price: 810000, quantity: 1 }],
      roomTotal: 810000
    };
    const response = {
      invoiceNumber: 'SRV-1',
      products: screenshotQuote.products,
      metadata: { priceDetails: screenshotQuote.metadata.priceDetails },
      roomTotal: 390000
    };
    const printed = applyServerInvoice(local, response);
    expect(printed.products).toEqual(screenshotQuote.products);
    expect(printed.products[0].price).toBe(390000);
    expect(printed.metadata.priceDetails.lateCheckoutHours).toBe(0);
    expect(printed.metadata.priceDetails.days).toBe(1);
    expect(printed.metadata.priceDetails.earlyCheckinHours).toBe(2);
    expect(printed.metadata.priceDetails.deadline).toBe('2026-10-31T05:00:00.000Z');
    expect(printed.roomTotal).toBe(390000);
    expect(printed.invoiceNumber).toBe('SRV-1');
  });

  it('reads room charge from priceDetails when roomTotal is absent', () => {
    expect(roomChargeFromQuote({
      priceDetails: {
        rateType: 'daily',
        days: 1,
        basePrice: 350000,
        earlyCheckinHours: 2,
        earlyCheckinSurcharge: 40000,
        lateCheckoutHours: 0,
        lateCheckoutSurcharge: 420000
      }
    })).toBe(390000);
  });

  it('sums hourly, nightly, weekly and monthly breakdowns from the server', () => {
    expect(roomChargeFromQuote({
      priceDetails: { rateType: 'hourly', firstHourPrice: 80000, additionalHoursCount: 2, additionalHoursPrice: 100000 }
    })).toBe(180000);
    expect(roomChargeFromQuote({
      priceDetails: { rateType: 'nightly', nights: 1, basePrice: 250000, days: 1, dailyBasePrice: 350000 }
    })).toBe(600000);
    expect(roomChargeFromQuote({
      priceDetails: { rateType: 'weekly', weeks: 2, basePrice: 2000000 }
    })).toBe(4000000);
    expect(roomChargeFromQuote({
      priceDetails: { rateType: 'monthly', months: 1, basePrice: 7000000 }
    })).toBe(7000000);
  });
});
