function seedAction(existing, incoming) {
  const rows = existing || [];
  if (incoming.version === "raj-v1") return rows.length ? "skip" : "insert";
  if (rows.some((row) => row.version === incoming.version)) return "skip";
  return "insert-draft";
}

module.exports = { seedAction };
