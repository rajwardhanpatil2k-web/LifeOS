// Future days arm real calls only. Info lines stay on screen, they do not
// take an alarm slot. Today keeps its current set, including info.
export function itemsToArm(horizon, todayItems, todayDate) {
  const days = horizon && Array.isArray(horizon.days) ? horizon.days : null;
  if (!days || days.length === 0) {
    return (todayItems || []).map((item) => ({ ...item, planDate: item.planDate || todayDate }));
  }
  const today = horizon.today || todayDate;
  const rows = [];
  for (const day of days) {
    for (const item of day.items || []) {
      if (day.date !== today && item.alertLevel === "info") continue;
      rows.push({ ...item, planDate: day.date });
    }
  }
  return rows;
}
