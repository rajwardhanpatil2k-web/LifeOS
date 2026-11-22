// Future days arm real calls only. Info lines stay on screen, they do not
// take an alarm slot. Today keeps its current set, including info.
function finished(item) {
  return item && (item.status === "done" || item.status === "skipped");
}

export function itemsToArm(horizon, todayItems, todayDate) {
  const days = horizon && Array.isArray(horizon.days) ? horizon.days : null;
  const liveToday = new Map(
    (todayItems || []).map((item) => [String(item._id || item.key || ""), item])
  );
  if (!days || days.length === 0) {
    return (todayItems || [])
      .filter((item) => !finished(item))
      .map((item) => ({ ...item, planDate: item.planDate || todayDate }));
  }
  const today = horizon.today || todayDate;
  const rows = [];
  for (const day of days) {
    for (const item of day.items || []) {
      const live = day.date === today ? liveToday.get(String(item._id || item.key || "")) : null;
      const row = live ? { ...item, ...live, planDate: day.date } : { ...item, planDate: day.date };
      if (finished(row)) continue;
      if (day.date !== today && row.alertLevel === "info") continue;
      rows.push(row);
    }
  }
  return rows;
}
