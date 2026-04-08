/**
 * Calendar helpers using plain YYYY-MM-DD strings with UTC date arithmetic.
 * Matches API date boundaries and aligns Practitioner / Call Schedule admin views.
 */

export function parseYMD(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return new Date(Date.UTC(1970, 0, 1));
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatYMD(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr, delta) {
  const d = parseYMD(dateStr);
  d.setUTCDate(d.getUTCDate() + delta);
  return formatYMD(d);
}

/** Sunday (inclusive) through Saturday for the week containing baseDateStr. */
export function getSundayWeekRange(baseDateStr) {
  const d = parseYMD(baseDateStr);
  const dayOfWeek = d.getUTCDay();
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - dayOfWeek);
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: formatYMD(sunday), end: formatYMD(saturday) };
}

/** ISO week starting Sunday (YYYY-MM-DD) for the week containing dateStr. */
export function startOfWeekSundayUTC(dateStr) {
  const d = parseYMD(dateStr);
  const dayOfWeek = d.getUTCDay();
  const sunday = new Date(d);
  sunday.setUTCDate(d.getUTCDate() - dayOfWeek);
  return formatYMD(sunday);
}

export function getDatesInRange(startStr, endStr) {
  const dates = [];
  let cur = parseYMD(startStr);
  const end = parseYMD(endStr);
  while (cur <= end) {
    dates.push(formatYMD(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Today's date in America/Los_Angeles as YYYY-MM-DD. */
export function getPacificDateString() {
  const now = new Date();
  const pacificDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = pacificDateParts.find((p) => p.type === "year").value;
  const month = pacificDateParts.find((p) => p.type === "month").value;
  const day = pacificDateParts.find((p) => p.type === "day").value;
  return `${year}-${month}-${day}`;
}
