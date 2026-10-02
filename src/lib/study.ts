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

export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

export const ACCEPTED_IMAGE_EXTENSIONS =
  ".png,.jpg,.jpeg,.webp,.gif,.bmp,.avif,.heic,.heif";

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    image.src = url;
  });
}

/**
 * Turn any uploaded image (png, jpg, webp, screenshots…) into a downscaled
 * base64 JPEG plus a small thumbnail, so a page photo is cheap to store and
 * still legible to the model.
 */
export async function prepareNoteImage(file: File): Promise<{
  data: string;
  thumb: string;
}> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files can be attached as notes.");
  }
  const image = await loadImageElement(file);

  const render = (maxEdge: number, quality: number): string => {
    const scale = Math.min(
      1,
      maxEdge / Math.max(image.width || 1, image.height || 1),
    );
    const width = Math.max(1, Math.round((image.width || 1) * scale));
    const height = Math.max(1, Math.round((image.height || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not process the image.");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
  };

  return { data: render(1400, 0.72), thumb: render(240, 0.6) };
}

/** Convex file storage allows 32 MiB per file; stay comfortably under it. */
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
