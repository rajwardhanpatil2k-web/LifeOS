export function normalizeServerUrl(url) {
  const trimmed = String(url || "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch (_err) {
    return trimmed;
  }
}

export function serverUrlProblem(url, { release = false } = {}) {
  const next = normalizeServerUrl(url);
  if (!next) return "Enter a server URL first.";
  let parsed;
  try {
    parsed = new URL(next);
  } catch (_err) {
    return "Enter a full server URL, including https://.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Enter an http or https server URL.";
  }
  if (release && parsed.protocol !== "https:") {
    return "A release build only accepts an https:// server.";
  }
  return "";
}
