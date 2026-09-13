import { Platform } from "react-native";
import PRODUCTION_API_URL from "./productionApiUrl";

// `10.0.2.2` only resolves inside the Android *emulator* — on a real device
// (connected over Wi-Fi to the Metro dev server) there is no such alias, so
// requests to it just fail with a generic network error. When running on a
// physical device, set EXPO_PUBLIC_API_URL to the dev machine's LAN IP when
// starting Metro, e.g.:
//   EXPO_PUBLIC_API_URL=http://192.168.0.157:4000 npx expo start --dev-client
const DEFAULT_DEV_HOST =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000";

function trimUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function resolveApiUrl() {
  const fromEnv = trimUrl(process.env.EXPO_PUBLIC_API_URL);
  if (fromEnv) return fromEnv;
  const fromProd = trimUrl(PRODUCTION_API_URL);
  if (!__DEV__ && fromProd) return fromProd;
  if (__DEV__) return DEFAULT_DEV_HOST;
  return fromProd || DEFAULT_DEV_HOST;
}

export const API_URL = resolveApiUrl();

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

export async function api(path, options = {}) {
  const attempts = __DEV__ ? 1 : RETRY_MS.length + 1;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        ...options,
      });
      if (!res.ok) {
        const text = await res.text();
        if (isRetryableStatus(res.status) && i < attempts - 1) {
          await sleep(RETRY_MS[i] || 10000);
          continue;
        }
        throw new Error(text || `Request failed ${res.status}`);
      }
      return res.json();
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
