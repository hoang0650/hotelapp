export function parseHourMinute(timeStr: string): { hour: number; minute: number } {
  const parts = String(timeStr || '12:00').split(':');
  return {
    hour: parseInt(parts[0], 10) || 0,
    minute: parseInt(parts[1], 10) || 0
  };
}

export function atClockTime(base: Date, timeStr: string): Date {
  const { hour, minute } = parseHourMinute(timeStr);
  const date = new Date(base);
  date.setHours(hour, minute, 0, 0);
  return date;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Hạn checkout đầu tiên: lần endTime kế tiếp sau thời điểm check-in. */
export function getFirstCheckoutDeadline(checkIn: Date, endTimeStr: string): Date {
  const deadline = atClockTime(checkIn, endTimeStr);
  if (checkIn.getTime() >= deadline.getTime()) {
    deadline.setDate(deadline.getDate() + 1);
  }
  return deadline;
}

export function calculateLateCheckoutFee(
  checkOut: Date,
  deadline: Date,
  hourlyFee: number
): { hours: number; amount: number; deadline: Date } {
  const fee = Number(hourlyFee) || 0;
  if (!checkOut || !deadline || fee <= 0) {
    return { hours: 0, amount: 0, deadline };
  }
  const lateMs = checkOut.getTime() - deadline.getTime();
  if (lateMs <= 0) {
    return { hours: 0, amount: 0, deadline };
  }
  const hours = Math.ceil(lateMs / (1000 * 60 * 60));
  return { hours, amount: hours * fee, deadline };
}

/** Ngày đêm: 1 ngày luôn hết hạn vào endTime ngày kế tiếp sau check-in. */
export function calculateDailyLateCheckout(
  checkIn: Date,
  checkOut: Date,
  paidDays: number,
  dailyCheckOutTime: string,
  hourlyFee: number
): { hours: number; amount: number; deadline: Date } {
  const firstDeadline = getFirstCheckoutDeadline(checkIn, dailyCheckOutTime || '12:00');
  const deadline = addDays(firstDeadline, Math.max(0, Number(paidDays || 1) - 1));
  return calculateLateCheckoutFee(checkOut, deadline, hourlyFee);
}

/**
 * Qua đêm: hạn đêm đầu = endTime kế tiếp.
 * Nếu đã tách thêm ngày, hạn cuối = hạn đêm đầu + extraDailyDays (phụ thu theo giá ngày).
 */
export function calculateNightlyLateCheckout(
  checkIn: Date,
  checkOut: Date,
  nightlyEndTime: string,
  extraDailyDays: number,
  nightlyHourlyFee: number,
  dailyCheckOutTime: string,
  dailyHourlyFee: number
): { hours: number; amount: number; deadline: Date } {
  const firstNightEnd = getFirstCheckoutDeadline(checkIn, nightlyEndTime || '12:00');
  const extraDays = Math.max(0, Number(extraDailyDays) || 0);
  if (extraDays > 0) {
    const deadline = atClockTime(addDays(firstNightEnd, extraDays), dailyCheckOutTime || nightlyEndTime || '12:00');
    return calculateLateCheckoutFee(checkOut, deadline, dailyHourlyFee || nightlyHourlyFee);
  }
  return calculateLateCheckoutFee(checkOut, firstNightEnd, nightlyHourlyFee);
}
