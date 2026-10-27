function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr || "").split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  if (!Number.isFinite(dt.getTime())) return null;
  const month = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${month}-${day}`;
}

function horizonDates(today, days = 3) {
  const count = Math.min(3, Math.max(1, Math.floor(Number(days) || 3)));
  const dates = [];
  for (let i = 0; i < count; i += 1) {
    const date = addDays(today, i);
    if (date) dates.push(date);
  }
  return dates;
}

module.exports = { addDays, horizonDates };
