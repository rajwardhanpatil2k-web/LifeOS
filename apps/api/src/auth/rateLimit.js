function createLoginLimiter({ limit = 5, windowMs = 60 * 1000, now = () => Date.now() } = {}) {
  const hits = new Map();

  function recent(ip) {
    const nowMs = now();
    const list = (hits.get(ip) || []).filter((at) => nowMs - at < windowMs);
    hits.set(ip, list);
    return list;
  }

  return {
    tooMany(ip) {
      return recent(ip || "unknown").length >= limit;
    },
    recordFailure(ip) {
      const list = recent(ip || "unknown");
      list.push(now());
      hits.set(ip || "unknown", list);
    },
  };
}

module.exports = { createLoginLimiter };
