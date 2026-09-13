import { Platform, PermissionsAndroid, AppState } from "react-native";
import { getCameraPermissionsAsync, requestCameraPermissionsAsync } from "expo-camera";
import * as Notifications from "expo-notifications";
import { ensureNotificationSetup } from "./notifications";
import {
  isWakeAlarmAvailable,
  canScheduleExactAlarms,
  openExactAlarmSettings,
  canUseFullScreenIntent,
  openFullScreenIntentSettings,
  areNotificationsEnabled,
  isIgnoringBatteryOptimizations,
  requestIgnoreBatteryOptimizations,
  openAppSettings,
  openNotificationSettings,
} from "./wakeAlarm";

async function requestAndroidPermission(permission) {
  if (Platform.OS !== "android" || !permission) return false;
  try {
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (_e) {
    return false;
  }
}

export async function requestCameraAccess() {
  if (Platform.OS === "android") {
    await requestAndroidPermission(PermissionsAndroid.PERMISSIONS.CAMERA);
  }
  const result = await requestCameraPermissionsAsync().catch(() => null);
  return result?.granted === true;
}

export async function requestNotificationAccess() {
  if (Platform.OS === "android" && Platform.Version >= 33) {
    await requestAndroidPermission(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  }
  return ensureNotificationSetup().catch(() => false);
}

export async function getPermissionStatus() {
  const camera = await getCameraPermissionsAsync().catch(() => ({ granted: false, canAskAgain: true }));
  let notifications = false;
  if (isWakeAlarmAvailable()) {
    notifications = await areNotificationsEnabled().catch(() => false);
  } else {
    const existing = await Notifications.getPermissionsAsync().catch(() => ({ status: "undetermined" }));
    notifications = existing?.status === "granted";
  }
  const exactAlarms = await canScheduleExactAlarms().catch(() => true);
  const fullScreen = await canUseFullScreenIntent().catch(() => true);
  const battery = await isIgnoringBatteryOptimizations().catch(() => true);

  return {
    camera: !!camera?.granted,
    cameraCanAsk: camera?.canAskAgain !== false,
    notifications: !!notifications,
    exactAlarms: !!exactAlarms,
    fullScreen: !!fullScreen,
    battery: !!battery,
    nativeAlarm: isWakeAlarmAvailable(),
  };
}

// Dialogs only — never jump into system Settings on launch. Those pages steal
// the Activity and cancel the camera/notification prompts. Exact-alarm and
// battery toggles live on the Permissions screen instead.
export async function requestStartupPermissionDialogs() {
  if (AppState.currentState !== "active") return;
  await requestNotificationAccess();
  await requestCameraAccess();
}

export async function ensureWakePermissions() {
  return requestStartupPermissionDialogs();
}

export { openExactAlarmSettings, openFullScreenIntentSettings, requestIgnoreBatteryOptimizations, openAppSettings, openNotificationSettings };
