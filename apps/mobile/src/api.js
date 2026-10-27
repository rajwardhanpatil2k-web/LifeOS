import { getApiUrl, setApiUrl } from "./apiConfig";
import { serverUrlProblem } from "./serverUrl";

const RETRY_MS = [2500, 6000, 10000];
// Render's free tier can take ~30-50s to wake; one attempt gets this long.
const REQUEST_TIMEOUT_MS = 45000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

export function isNetworkError(err) {
  const msg = String(err && err.message ? err.message : err);
  return /network request failed|timeout|timed out|failed to fetch|ECONN|ENOTFOUND|502|503|504/i.test(msg);
}

function isRetryableError(err) {
  return isNetworkError(err);
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

let authToken = "";
let onUnauthorized = () => {};

export function setAuthToken(token) {
  authToken = token ? String(token) : "";
}

export function setUnauthorizedHandler(handler) {
  onUnauthorized = typeof handler === "function" ? handler : () => {};
}

export function apiUrl() {
  return getApiUrl();
}

export const API_URL = getApiUrl();

export async function testApiConnection(url) {
  const base = String(url || getApiUrl()).trim().replace(/\/$/, "");
  const problem = serverUrlProblem(base, { release: typeof __DEV__ !== "undefined" && __DEV__ === false });
  if (problem) throw new Error(problem);
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
  const method = String(options.method || "GET").toUpperCase();
  let lastError;
  for (let i = 0; i < attempts; i++) {
    // Without a timeout a stalled connection leaves the UI on a spinner
    // forever (e.g. the AI sheet stuck on "On it…").
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, REQUEST_TIMEOUT_MS)
      : null;
    try {
      const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
      if (authToken && path !== "/api/auth/login") headers.Authorization = `Bearer ${authToken}`;
      const res = await fetch(`${getApiUrl()}${path}`, {
        ...options,
        headers,
        ...(controller ? { signal: controller.signal } : {}),
      });
      const text = await res.text();
      if (res.status === 401 && path !== "/api/auth/login") {
        setAuthToken("");
        onUnauthorized();
        throw new Error("Sign in required.");
      }
      if (!res.ok) {
        if (isRetryableStatus(res.status) && i < attempts - 1) {
          await sleep(RETRY_MS[i] || 10000);
          continue;
        }
        let message = text;
        let errJson = null;
        try {
          errJson = parseBody(text, res.headers.get("content-type"));
          message = errJson?.error || text;
        } catch (parseErr) {
          message = parseErr.message || text;
        }
        const failure = new Error(message || `Request failed ${res.status}`);
        failure.details = errJson;
        throw failure;
      }
      return parseBody(text, res.headers.get("content-type"));
    } catch (err) {
      let failure = err;
      if (timedOut) {
        failure = new Error("The server took too long to answer. It may be waking up — try again in a moment.");
      }
      lastError = failure;
      // A timed-out write may already have been applied on the server, so only
      // reads are safe to resend. Delete-all is never retried.
      const retryable = method === "DELETE" ? false : timedOut ? method === "GET" : isRetryableError(failure);
      if (retryable && i < attempts - 1) {
        await sleep(RETRY_MS[i] || 10000);
        continue;
      }
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}
