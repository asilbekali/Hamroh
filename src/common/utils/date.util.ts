import { BadRequestException } from '@nestjs/common';

export type ReportPeriod = 'month' | 'quarter' | 'year';

/** Parses `YYYY-MM-DD` (or a full ISO string) into a UTC midnight Date. */
export function toDateOnly(value: string | Date): Date {
  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid date: ${String(value)}`);
  }

  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    ),
  );
}

/** Formats a Date as `YYYY-MM-DD` using its UTC parts. */
export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(value: Date): number {
  const day = value.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Whole years elapsed since `birthDate`, as of `reference`. */
export function calculateAge(birthDate: Date, reference = new Date()): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - birthDate.getUTCMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && reference.getUTCDate() < birthDate.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

/** Converts `"HH:mm"` into minutes past midnight. */
export function timeToMinutes(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);

  if (!match) {
    throw new BadRequestException(
      `Invalid time "${time}". Use 24-hour HH:mm, e.g. 12:00`,
    );
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/** True when [aStart, aEnd) and [bStart, bEnd) share any minute. */
export function minuteRangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Inclusive-exclusive [from, to) window ending now, used by the reports. */
export function periodRange(period: ReportPeriod, reference = new Date()) {
  const to = new Date(reference);
  const from = new Date(reference);

  switch (period) {
    case 'month':
      from.setUTCMonth(from.getUTCMonth() - 1);
      break;
    case 'quarter':
      from.setUTCMonth(from.getUTCMonth() - 3);
      break;
    case 'year':
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      break;
  }

  return { from, to };
}

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  month: 'Oylik (1 oy)',
  quarter: 'Choraklik (3 oy)',
  year: 'Yillik (1 yil)',
};
