import type { Doc } from "@/convex/_generated/dataModel";

export type TimetableEntry = Doc<"timetableEntries">;
export type Reminder = Doc<"reminders">;

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "16:00" → "4:00 PM" */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "16:00" → minutes since midnight */
export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 100 → "1 hr 40 min", 45 → "45 min" */
export function formatMinutes(total: number): string {
  if (total <= 0) return "0 min";
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} hr`;
  return `${hrs} hr ${mins} min`;
}

/* ------------------------- XP & levels (Study Buddy) ------------------------- */

export const LEVEL_TITLES = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Scholar",
  "Dean of Studies",
  "Headmaster",
] as const;

/** 1 XP per focused minute. Level L starts at 100·(L−1)² XP. */
export function levelForXp(xp: number) {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(safeXp / 100)) + 1;
  const floor = 100 * (level - 1) ** 2;
  const next = 100 * level ** 2;
  const span = next - floor;
  const into = safeXp - floor;
  return {
    level,
    floor,
    next,
    into,
    span,
    progress: Math.min(100, (into / span) * 100),
    title:
      LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)] ??
      LEVEL_TITLES[LEVEL_TITLES.length - 1],
  };
}

export function romanNumeral(n: number): string {
  if (n <= 0 || n > 3999) return String(n);
  const map: Array<[number, string]> = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = n;
  let out = "";
  for (const [value, symbol] of map) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}
