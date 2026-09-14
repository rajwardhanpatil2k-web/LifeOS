import { getApiUrl, setApiUrl } from "./apiConfig";

const RETRY_MS = [2500, 6000, 10000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function isRetryableError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /network request failed|timeout|timed out|failed to fetch|ECONN|ENOTFOUND|502|503|504/i.test(msg);
}

function parseBody(text, contentType) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const looksJson =
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    (contentType && contentType.includes("application/json"));
  if (!looksJson) {
    if (trimmed.startsWith("<")) {
      throw new Error(
        `Server returned a web page, not Life OS JSON. Check Settings → Server URL (currently ${getApiUrl()}).`
      );
    }
    throw new Error(trimmed.slice(0, 180));
  }
  try {
    return JSON.parse(trimmed);
  } catch (_e) {
    throw new Error(`Bad JSON from server at ${getApiUrl()}.`);
  }
}

export function apiUrl() {
  return getApiUrl();
}

export const API_URL = getApiUrl();

export async function testApiConnection(url) {
  const base = String(url || getApiUrl()).trim().replace(/\/$/, "");
  if (!base) throw new Error("Enter a server URL first.");
  const res = await fetch(`${base}/health`);
  const text = await res.text();
  const data = parseBody(text, res.headers.get("content-type"));
  if (!res.ok) throw new Error(data?.error || `Health check failed (${res.status}).`);
  if (!data || data.service !== "life-os-api") {
    throw new Error("That URL is not your Life OS API. Use the Render URL from your dashboard.");
  }
  setApiUrl(base);
  return data;
}

export async function api(path, options = {}) {
  const attempts = __DEV__ ? 1 : RETRY_MS.length + 1;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${getApiUrl()}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      const text = await res.text();
      if (!res.ok) {
        if (isRetryableStatus(res.status) && i < attempts - 1) {
          await sleep(RETRY_MS[i] || 10000);
          continue;
        }
        let message = text;
        try {
          const errJson = parseBody(text, res.headers.get("content-type"));
          message = errJson?.error || text;
        } catch (parseErr) {
          message = parseErr.message || text;
        }
        throw new Error(message || `Request failed ${res.status}`);
      }
      return parseBody(text, res.headers.get("content-type"));
    } catch (err) {
      lastError = err;
      if (isRetryableError(err) && i < attempts - 1) {
        await sleep(RETRY_MS[i] || 10000);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
