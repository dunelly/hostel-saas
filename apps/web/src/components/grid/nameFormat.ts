function stripTrailingIndex(name: string) {
  return name.replace(/\s*\(\d+\)\s*$/, "").trim();
}

export function formatCompactGuestName(name: string, guestIndex?: number | null) {
  const normalized = stripTrailingIndex(name);
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || name;

  const first = parts[0];
  const last = parts[parts.length - 1];
  const compact = `${first} ${last.charAt(0).toUpperCase()}.`;
  return guestIndex && guestIndex > 0 ? `${compact} (${guestIndex})` : compact;
}

export function getStayNights(checkIn: string, checkOut: string) {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 1;
  return Math.max(1, Math.round((end - start) / 86400000));
}

export function formatStayNights(checkIn: string, checkOut: string) {
  const nights = getStayNights(checkIn, checkOut);
  return `${nights} Night${nights === 1 ? "" : "s"}`;
}
