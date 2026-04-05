const SYDNEY_TIME_ZONE = "Australia/Sydney";

const dateTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23"
});

const labelFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "UTC",
  month: "short",
  day: "numeric"
});

function pad(value) {
  return `${value}`.padStart(2, "0");
}

export function getSydneyParts(date = new Date()) {
  return dateTimeFormatter.formatToParts(date).reduce((parts, part) => {
    if (part.type !== "literal") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {});
}

export function toDateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function shiftDateKey(dateKey, dayDelta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayDelta);
  return date.toISOString().slice(0, 10);
}

export function getSydneyDateKey(date = new Date()) {
  const parts = getSydneyParts(date);
  return toDateKey(parts.year, parts.month, parts.day);
}

export function getOperationalDayKey(date = new Date(), resetHour = 17) {
  const parts = getSydneyParts(date);
  const baseKey = toDateKey(parts.year, parts.month, parts.day);
  return Number(parts.hour) < resetHour
    ? shiftDateKey(baseKey, -1)
    : baseKey;
}

export function getWeekStartKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex);
  return date.toISOString().slice(0, 10);
}

export function getWeeklyTaskKey(date = new Date()) {
  return getWeekStartKey(getSydneyDateKey(date));
}

export function buildRecentWeekBuckets(count = 8, date = new Date()) {
  const currentWeekStart = getWeekStartKey(getSydneyDateKey(date));
  return Array.from({ length: count }, (_entry, index) => {
    const startKey = shiftDateKey(currentWeekStart, index * -7);
    const endKey = shiftDateKey(startKey, 6);
    return {
      key: startKey,
      startKey,
      endKey,
      label: `${labelFormatter.format(new Date(`${startKey}T00:00:00Z`))} - ${labelFormatter.format(new Date(`${endKey}T00:00:00Z`))}`
    };
  }).reverse();
}

export function compareDateKeys(left, right) {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function getSydneyTimeZoneLabel() {
  return "5:00 PM Australia/Sydney";
}

export function getWeeklyResetLabel() {
  return "Weekly team tasks reset every Monday at 12:00 AM Australia/Sydney.";
}
