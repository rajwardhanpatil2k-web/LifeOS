import { NativeModules, Platform } from "react-native";

const { WakeAlarmModule } = NativeModules;

// WakeAlarmModule only exists on Android after the custom dev client build
// (see android/app/src/main/java/com/raj/lifeos/wakealarm). It's simply
// absent in Expo Go / iOS, so every call here degrades to a safe no-op.
const available = Platform.OS === "android" && !!WakeAlarmModule;

export function isWakeAlarmAvailable() {
  return available;
}

function parseHHMM(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export async function scheduleDailyWakeAlarm(scheduledAtHHMM) {
  if (!available) return false;
  const parsed = parseHHMM(scheduledAtHHMM);
  if (!parsed) return false;
  return WakeAlarmModule.scheduleDailyAlarm(parsed.hour, parsed.minute);
}

export async function cancelWakeAlarm() {
  if (!available) return false;
  return WakeAlarmModule.cancelAlarm();
}

export async function stopWakeAlarmRinging() {
  if (!available) return false;
  return WakeAlarmModule.stopRinging();
}

export async function isWakeAlarmRinging() {
  if (!available) return false;
  return WakeAlarmModule.isRinging();
}

export function nextWakeMillis(scheduledAtHHMM, now = Date.now()) {
  const parsed = parseHHMM(scheduledAtHHMM);
  if (!parsed) return -1;
  const date = new Date(now);
  date.setHours(parsed.hour, parsed.minute, 0, 0);
  if (date.getTime() < now + 2_000) date.setDate(date.getDate() + 1);
  return date.getTime();
}

export async function canScheduleExactAlarms() {
  if (!available) return true;
  return WakeAlarmModule.canScheduleExactAlarms();
}

export async function openExactAlarmSettings() {
  if (!available) return false;
  return WakeAlarmModule.openExactAlarmSettings();
}

export async function ringNow() {
  if (!available) return false;
  return WakeAlarmModule.ringNow();
}

export async function canUseFullScreenIntent() {
  if (!available) return true;
  return WakeAlarmModule.canUseFullScreenIntent();
}

export async function openFullScreenIntentSettings() {
  if (!available) return false;
  return WakeAlarmModule.openFullScreenIntentSettings();
}

export async function getNextAlarmAt() {
  if (!available) return -1;
  const value = await WakeAlarmModule.getNextAlarmAt();
  return typeof value === "number" ? value : -1;
}

export async function getAlarmInfo() {
  if (!available) return { hour: -1, minute: -1, enabled: false, nextAt: -1 };
  const info = await WakeAlarmModule.getAlarmInfo();
  return {
    hour: info?.hour ?? -1,
    minute: info?.minute ?? -1,
    enabled: !!info?.enabled,
    nextAt: typeof info?.nextAt === "number" ? info.nextAt : -1,
  };
}

export function formatAlarmInfo(info) {
  if (!info || !info.enabled || info.hour < 0 || info.hour > 23) return null;
  const clock = `${String(info.hour).padStart(2, "0")}:${String(info.minute).padStart(2, "0")}`;
  if (!info.nextAt || info.nextAt < 0) return clock;
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = dateFmt.format(new Date());
  const alarmDay = dateFmt.format(new Date(info.nextAt));
  return alarmDay === today ? `today ${clock}` : `tomorrow ${clock}`;
}

export function formatNextAlarm(ms) {
  if (!ms || ms < 0) return null;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = dateFmt.format(new Date());
  const alarmDay = dateFmt.format(new Date(ms));
  return alarmDay === today ? `today ${clock}` : `tomorrow ${clock}`;
}

export async function areNotificationsEnabled() {
  if (!available) return true;
  return WakeAlarmModule.areNotificationsEnabled();
}

export async function isIgnoringBatteryOptimizations() {
  if (!available) return true;
  return WakeAlarmModule.isIgnoringBatteryOptimizations();
}

export async function requestIgnoreBatteryOptimizations() {
  if (!available) return false;
  return WakeAlarmModule.requestIgnoreBatteryOptimizations();
}

export async function openAppSettings() {
  if (!available) return false;
  return WakeAlarmModule.openAppSettings();
}

export async function openNotificationSettings() {
  if (!available) return false;
  return WakeAlarmModule.openNotificationSettings();
}
