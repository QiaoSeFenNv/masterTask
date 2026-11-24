import { config } from "../config.ts";

/**
 * 逻辑日期：0 点切割，但 DAY_ROLLOVER_HOUR（默认 6）点之前算前一天。
 * 例：凌晨 3 点 → 仍算昨天的卡；早上 6:01 → 新的一天。
 */
export function logicalDate(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - config.dayRolloverHour * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.appTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

/** 在 YYYY-MM-DD 上加减天数 */
export function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/** 两个逻辑日期相差几天（b - a） */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86_400_000);
}

/** 连续天数：从最近一次抽卡往前数，遇到断档就停。今天没抽则从昨天开始算。 */
export function computeStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}