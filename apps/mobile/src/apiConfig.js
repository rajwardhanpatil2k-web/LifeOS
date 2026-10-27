import { NativeModules, Platform } from "react-native";
import PRODUCTION_API_URL from "./productionApiUrl";
import { normalizeServerUrl, serverUrlProblem } from "./serverUrl";

const { WakeAlarmModule } = NativeModules;
const PREF_KEY = "apiUrl";
const DEFAULT_DEV_HOST =
  Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://127.0.0.1:4000";

function trimUrl(value) {
  return normalizeServerUrl(value);
}

function bakedUrl() {
  const fromEnv = trimUrl(process.env.EXPO_PUBLIC_API_URL);
  if (fromEnv) return fromEnv;
  const fromProd = trimUrl(PRODUCTION_API_URL);
  if (!__DEV__ && fromProd) return fromProd;
  if (__DEV__) return DEFAULT_DEV_HOST;
  return fromProd || DEFAULT_DEV_HOST;
}

let current = bakedUrl();

function releaseBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__ === false;
}

export function getApiUrl() {
  return current;
}

export function setApiUrl(url) {
  const next = trimUrl(url);
  if (!next) return current;
  if (serverUrlProblem(next, { release: releaseBuild() })) return current;
  current = next;
  return current;
}

export async function loadApiUrl() {
  try {
    if (WakeAlarmModule?.getPref) {
      const saved = await WakeAlarmModule.getPref(PREF_KEY);
      if (saved) current = trimUrl(saved);
    }
  } catch (_e) {
    // first launch, keep baked URL
  }
  return current;
}

export async function saveApiUrl(url) {
  const problem = serverUrlProblem(url, { release: releaseBuild() });
  if (problem) throw new Error(problem);
  const next = setApiUrl(url);
  try {
    if (WakeAlarmModule?.setPref) {
      await WakeAlarmModule.setPref(PREF_KEY, next);
    }
  } catch (_e) {
    // still use it for this session
  }
  return next;
}
