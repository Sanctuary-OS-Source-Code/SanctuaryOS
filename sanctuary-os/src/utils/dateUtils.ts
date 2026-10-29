export type SanctuaryDateFormat = "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";

export const DATE_FORMAT_STORAGE_KEY = "sanctuary_date_format";

export function getStoredDateFormat(): SanctuaryDateFormat {
  try {
    if (typeof localStorage !== "undefined") {
      const saved = localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
      if (saved === "MM/DD/YYYY" || saved === "DD/MM/YYYY" || saved === "YYYY-MM-DD") {
        return saved;
      }
    }
  } catch {
    // ignore storage errors
  }
  return "MM/DD/YYYY";
}

const nativeToLocaleDateString = Date.prototype.toLocaleDateString;

export function formatSanctuaryDate(
  input: Date | string | number | null | undefined,
  explicitFormat?: SanctuaryDateFormat
): string {
  if (input === null || input === undefined || input === "") return "";
  const fmt = explicitFormat || getStoredDateFormat();

  let year: number;
  let month: number;
  let day: number;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return "";
    year = input.getFullYear();
    month = input.getMonth() + 1;
    day = input.getDate();
  } else if (typeof input === "number") {
    const d = new Date(input);
    if (isNaN(d.getTime())) return "";
    year = d.getFullYear();
    month = d.getMonth() + 1;
    day = d.getDate();
  } else {
    const trimmed = String(input).trim();
    if (!trimmed) return "";

    const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    const isoDateOnlyMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

    if (slashMatch) {
      const p1 = Number(slashMatch[1]);
      const p2 = Number(slashMatch[2]);
      year = Number(slashMatch[3]);
      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2;
      } else {
        month = p1;
        day = p2;
      }
    } else if (isoDateOnlyMatch) {
      year = Number(isoDateOnlyMatch[1]);
      month = Number(isoDateOnlyMatch[2]);
      day = Number(isoDateOnlyMatch[3]);
    } else {
      const parsed = new Date(trimmed);
      if (isNaN(parsed.getTime())) return trimmed;
      year = parsed.getFullYear();
      month = parsed.getMonth() + 1;
      day = parsed.getDate();
    }
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yyyy = String(year).padStart(4, "0");

  if (fmt === "DD/MM/YYYY") {
    return `${dd}/${mm}/${yyyy}`;
  }
  if (fmt === "YYYY-MM-DD") {
    return `${yyyy}-${mm}-${dd}`;
  }
  return `${mm}/${dd}/${yyyy}`;
}

let patchInstalled = false;

export function installGlobalDateFormatPatch(): void {
  if (patchInstalled) return;
  patchInstalled = true;
  Date.prototype.toLocaleDateString = function (
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (locales === undefined && options === undefined) {
      return formatSanctuaryDate(this);
    }
    return nativeToLocaleDateString.call(this, locales as any, options as any);
  };
}

installGlobalDateFormatPatch();

