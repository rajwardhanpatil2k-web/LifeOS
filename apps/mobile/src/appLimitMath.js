// Daily app limits are a phone budget: N minutes of foreground time per
// local day. The native watcher enforces it. These helpers keep the
// settings screen and the tests on the same numbers.

export const MIN_LIMIT_MINUTES = 5;
export const MAX_LIMIT_MINUTES = 12 * 60;
export const LIMIT_STEP_MINUTES = 5;
export const DEFAULT_LIMIT_MINUTES = 60;
export const LIMIT_PRESETS = [15, 30, 60, 120, 180];
export const SELF_PACKAGE = "com.raj.lifeos";

// Installed copies of these float to the top of the picker. The list is
// only a shortcut — any other launchable app can be limited too.
export const SUGGESTED_PACKAGES = [
  "com.instagram.android",
  "com.google.android.youtube",
  "com.facebook.katana",
  "com.whatsapp",
  "com.zhiliaoapp.musically",
  "com.ss.android.ugc.trill",
  "com.twitter.android",
  "com.snapchat.android",
  "com.reddit.frontpage",
  "com.netflix.mediaclient",
  "com.spotify.music",
  "org.telegram.messenger",
  "com.google.android.apps.youtube.music",
  "com.instagram.barcelona",
  "com.linkedin.android",
  "com.android.chrome",
];

const SUGGESTED_RANK = new Map(SUGGESTED_PACKAGES.map((pkg, index) => [pkg, index]));

export function isPackageName(value) {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 200 &&
    value.includes(".") &&
    /^[A-Za-z0-9._]+$/.test(value)
  );
}

export function isSuggestedPackage(packageName) {
  return SUGGESTED_RANK.has(packageName);
}

export function clampLimitMinutes(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_LIMIT_MINUTES;
  return Math.min(MAX_LIMIT_MINUTES, Math.max(MIN_LIMIT_MINUTES, n));
}

export function stepLimitMinutes(current, direction) {
  const delta = direction < 0 ? -LIMIT_STEP_MINUTES : LIMIT_STEP_MINUTES;
  return clampLimitMinutes(clampLimitMinutes(current) + delta);
}

export function formatLimitMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatRemainingClock(ms) {
  const totalSec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

export function formatSpent(ms) {
  const value = Math.max(0, Number(ms) || 0);
  if (value > 0 && value < 60000) return "<1m";
  return formatLimitMinutes(Math.floor(value / 60000));
}

export function usageSummary(limitMinutes, usedMs) {
  const limitMs = clampLimitMinutes(limitMinutes) * 60 * 1000;
  const used = Math.max(0, Number(usedMs) || 0);
  const remainingMs = Math.max(0, limitMs - used);
  return {
    limitMs,
    usedMs: used,
    remainingMs,
    blocked: used >= limitMs,
    fraction: Math.max(0, Math.min(1, used / limitMs)),
  };
}

// The list counts down between native refreshes, but only for the app that
// is actually in front, and only for a few seconds. A stalled refresh must
// not keep draining the budget on screen after the user has left the app.
export function displayUsedMs(item, { foreground, usageFetchedAt, now } = {}) {
  const base = Math.max(0, Number(item?.usedMs) || 0);
  if (!foreground || foreground !== item?.packageName) return base;
  const fetchedAt = Number(usageFetchedAt) || 0;
  const at = Number(now) || 0;
  if (!fetchedAt || !at) return base;
  const extra = Math.max(0, at - fetchedAt);
  return base + Math.min(extra, 15000);
}

export function sanitizeLimits(list, selfPackage = SELF_PACKAGE) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const packageName = typeof item?.packageName === "string" ? item.packageName : "";
    if (!isPackageName(packageName) || packageName === selfPackage || seen.has(packageName)) continue;
    seen.add(packageName);
    const labelSource = typeof item?.label === "string" ? item.label.trim() : "";
    const label = (labelSource || packageName).slice(0, 80);
    out.push({
      packageName,
      label,
      limitMinutes: clampLimitMinutes(item?.limitMinutes),
    });
  }
  return out;
}

export function filterApps(apps, query, limits) {
  const taken = new Set((limits || []).map((item) => item.packageName));
  const q = String(query || "").trim().toLowerCase();
  return (apps || [])
    .filter((app) => app && isPackageName(app.packageName) && !taken.has(app.packageName))
    .filter((app) => {
      if (!q) return true;
      const label = String(app.label || "").toLowerCase();
      return label.includes(q) || app.packageName.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const ar = SUGGESTED_RANK.has(a.packageName) ? SUGGESTED_RANK.get(a.packageName) : 1000;
      const br = SUGGESTED_RANK.has(b.packageName) ? SUGGESTED_RANK.get(b.packageName) : 1000;
      if (ar !== br) return ar - br;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
}

export function mergeUsage(limits, usageByPackage) {
  const usage = usageByPackage || {};
  return (limits || []).map((item) => ({
    ...item,
    usedMs: Object.prototype.hasOwnProperty.call(usage, item.packageName)
      ? Math.max(0, Number(usage[item.packageName]) || 0)
      : Math.max(0, Number(item.usedMs) || 0),
  }));
}
