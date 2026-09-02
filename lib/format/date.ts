const MONTHS: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const WESTERN_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function westernDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => WESTERN_DIGITS[digit] ?? digit);
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function displayDate(year: number, month: number, day: number) {
  return validDateParts(year, month, day) ? `${pad(day)}/${pad(month)}/${year}` : null;
}

export function formatStoredDate(value: string) {
  const normalized = westernDigits(value.trim());
  let match = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return displayDate(Number(match[3]), Number(match[2]), Number(match[1])) ?? value;

  match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) return displayDate(Number(match[1]), Number(match[2]), Number(match[3])) ?? value;

  match = normalized.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b/);
  if (match) return displayDate(Number(match[3]), MONTHS[match[1]], Number(match[2])) ?? value;

  return value;
}

export function formatUploadDateTime(value: Date) {
  const hour = value.getHours();
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(hour12)}:${pad(value.getMinutes())} ${period}`;
}
