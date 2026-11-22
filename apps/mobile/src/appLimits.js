import { NativeModules, Platform } from "react-native";

const { AppLimitModule } = NativeModules;

export function isAppLimitAvailable() {
  return Platform.OS === "android" && AppLimitModule != null;
}

export function getAppLimitState() {
  if (!isAppLimitAvailable()) return Promise.resolve(null);
  return AppLimitModule.getState();
}

export function setNativeLimits(limits) {
  if (!isAppLimitAvailable()) return Promise.resolve(null);
  return AppLimitModule.setLimits(limits);
}

export function listInstalledApps() {
  if (!isAppLimitAvailable()) return Promise.resolve([]);
  return AppLimitModule.listApps();
}

export function openUsageAccessSettings() {
  if (!isAppLimitAvailable()) return Promise.resolve(false);
  return AppLimitModule.openUsageAccess();
}

export function openOverlaySettings() {
  if (!isAppLimitAvailable()) return Promise.resolve(false);
  return AppLimitModule.openOverlaySettings();
}

export function openAccessibilitySettings() {
  if (!isAppLimitAvailable()) return Promise.resolve(false);
  return AppLimitModule.openAccessibilitySettings();
}
