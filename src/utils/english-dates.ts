const MONTHS_EN = [
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

export function monthNameEnglish(monthIndex: number): string {
  return MONTHS_EN[monthIndex] ?? "";
}

export function ordinalEnglish(day: number): string {
  const mod10 = day % 10;
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}

/** e.g. "between March 1st and March 15th, 2026" */
export function formatInvoiceBodyBetweenPeriod(startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const sm = monthNameEnglish(s.getMonth());
  const em = monthNameEnglish(e.getMonth());
  const sd = ordinalEnglish(s.getDate());
  const ed = ordinalEnglish(e.getDate());
  const sy = s.getFullYear();
  const ey = e.getFullYear();
  if (sy === ey) {
    return `between ${sm} ${sd} and ${em} ${ed}, ${ey}`;
  }
  return `between ${sm} ${sd}, ${sy} and ${em} ${ed}, ${ey}`;
}

/** e.g. "Invoice - March 1st - March 15th, 2026" */
export function formatInvoiceEmailSubject(startMs: number, endMs: number): string {
  const s = new Date(startMs);
  const e = new Date(endMs);
  const sm = monthNameEnglish(s.getMonth());
  const em = monthNameEnglish(e.getMonth());
  const sd = ordinalEnglish(s.getDate());
  const ed = ordinalEnglish(e.getDate());
  const sy = s.getFullYear();
  const ey = e.getFullYear();
  if (sy === ey) {
    return `Invoice - ${sm} ${sd} - ${em} ${ed}, ${ey}`;
  }
  return `Invoice - ${sm} ${sd}, ${sy} - ${em} ${ed}, ${ey}`;
}
