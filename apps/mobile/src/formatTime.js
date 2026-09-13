export function formatClock12(hhmm) {
  const [hRaw, mRaw] = String(hhmm || "").split(":");
  const hour = Number(hRaw);
  const minute = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return hhmm || "";
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}
