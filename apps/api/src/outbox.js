// A repeated client id is already applied. A later client clock for the same
// item field wins; an older one is recorded and ignored.
function shouldApply(latest, incoming) {
  if (!incoming || !incoming.clientId) return { apply: true };
  if (latest && String(latest.clientId) === String(incoming.clientId)) {
    return { apply: false, duplicate: true };
  }
  const incomingAt = Number(incoming.clientAt) || 0;
  const latestAt = latest ? Number(latest.clientAt) || 0 : 0;
  if (latest && latestAt > incomingAt) return { apply: false, stale: true };
  return { apply: true };
}

module.exports = { shouldApply };
