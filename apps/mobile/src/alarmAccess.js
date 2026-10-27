import { AI_MUTE_LEASE_MS } from "./taskCallConfig.js";

// What the phone can still do when a permission is missing. Exact delivery,
// the lock-screen scanner, and overnight timing each have a weaker path.
export function accessNotes(status) {
  if (!status) return [];
  const notes = [];
  if (status.notifications === false) {
    notes.push({
      id: "notifications",
      tone: "blocked",
      text: "Notifications are off, so alarms cannot ring while the app is closed.",
    });
  }
  if (status.exactAlarms === false) {
    notes.push({
      id: "exact",
      tone: "degraded",
      text: "Exact alarms are off. Reminders can still be set, but Android may deliver them late.",
    });
  }
  if (status.fullScreen === false) {
    notes.push({
      id: "fullScreen",
      tone: "degraded",
      text: "Full-screen alerts are off. The lock screen shows a notification you can tap, instead of opening the scanner.",
    });
  }
  if (status.battery === false) {
    notes.push({
      id: "battery",
      tone: "degraded",
      text: "Battery optimization is on. The phone may delay an alarm after it has been idle.",
    });
  }
  return notes;
}

// A focus pause mutes task calls. It does not cancel the wake alarm, even
// when the pause covers the next wake time.
export function shouldCancelWakeAlarm(_input) {
  return false;
}

export function muteLeaseEndsAt(startedAt) {
  return Number(startedAt) + AI_MUTE_LEASE_MS;
}

export function aiMuteHolds(until, now) {
  return Number(until) > Number(now);
}
