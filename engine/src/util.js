// Small helpers shared by every module.

const WEEKDAYS = { Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat' };

// Normalize Israeli and international numbers to WhatsApp's digits-only format (e.g. 972501234567).
export function normalizePhone(raw) {
  if (raw == null) return null;
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '972' + digits.slice(1);
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// Wall-clock parts of a moment in the client's time zone.
export function localParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, weekday: WEEKDAYS[p.weekday] };
}

// hours: { sun: ["09:00", "20:00"], ..., sat: null }
export function isWithin(hours, parts) {
  const range = hours?.[parts.weekday];
  return Array.isArray(range) && parts.hhmm >= range[0] && parts.hhmm < range[1];
}

export function render(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, key) => (vars[key] != null ? String(vars[key]) : match));
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
