import { ensureNotificationSetup, syncTodayReminders } from "./notifications";
import { syncTaskAlerts, cancelTaskAlerts, isTaskAlertsAvailable } from "./taskAlerts";
import { syncVoiceCues, cancelVoiceCues, isVoiceAgentAvailable } from "./voiceAgent";

// Central place to arm today's push + incoming task calls. On Android the native
// TaskAlertService (looping call + TTS) is the primary path; Expo notifications
// are a visual backup on the lock screen.
export async function syncDayReminders(items, { voiceAlerts = true, name = "Raj", pausedUntil = 0 } = {}) {
  if (isTaskAlertsAvailable()) {
    await syncTaskAlerts(items, { voiceAlerts: voiceAlerts !== false, name, pausedUntil });
    if (isVoiceAgentAvailable()) await cancelVoiceCues().catch(() => {});
    return;
  }

  await syncTodayReminders(items, { name, pausedUntil });

  if (isVoiceAgentAvailable()) {
    await syncVoiceCues(items, { enabled: voiceAlerts !== false, name });
  }
}

export async function cancelDayReminders() {
  if (isTaskAlertsAvailable()) await cancelTaskAlerts().catch(() => {});
  if (isVoiceAgentAvailable()) await cancelVoiceCues().catch(() => {});
}

export async function ensureRemindersReady() {
  return ensureNotificationSetup();
}
