import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { composeEndCallCue, composeStartCallCue } from "./voiceAgent";
import { durationOf, explicitDurationMin, snoozeDelayMs } from "./taskCallConfig";
import { planTaskCalls } from "./taskCallPlanner";

const { TaskReminderModule } = NativeModules;

const available = Platform.OS === "android" && !!TaskReminderModule;
const speechEmitter = available ? new NativeEventEmitter(TaskReminderModule) : null;

export function isTaskAlertsAvailable() {
  return available;
}

export async function setTaskAlertsPausedUntil(untilMs) {
  if (!available || !TaskReminderModule.setPausedUntil) return false;
  return TaskReminderModule.setPausedUntil(Number(untilMs) || 0);
}

export async function syncTaskAlerts(items, { voiceAlerts = true, name = "Raj", pausedUntil = 0 } = {}) {
  if (!available) return false;
  await TaskReminderModule.setEnabled(true);
  if (TaskReminderModule.setPausedUntil) {
    await TaskReminderModule.setPausedUntil(Number(pausedUntil) > Date.now() ? Number(pausedUntil) : 0);
  }

  if (!Array.isArray(items) || items.length === 0) {
    if (TaskReminderModule.replaceTaskCalls) await TaskReminderModule.replaceTaskCalls([]);
    else await TaskReminderModule.cancelAll();
    return true;
  }

  let endGaveUpIds = [];
  if (TaskReminderModule.getEndGaveUpIds) {
    const raw = await TaskReminderModule.getEndGaveUpIds();
    endGaveUpIds = Array.isArray(raw) ? raw.map((id) => String(id)) : [];
  }
  const planned = planTaskCalls(items, {
    voiceAlerts: voiceAlerts !== false,
    name,
    pausedUntil,
    endGaveUpIds,
  });

  if (TaskReminderModule.replaceTaskCalls) {
    await TaskReminderModule.replaceTaskCalls(planned);
    return true;
  }

  await TaskReminderModule.cancelAll();
  for (const reminder of planned) {
    try {
      await TaskReminderModule.scheduleReminder(
        reminder.id,
        reminder.title,
        reminder.spokenText,
        reminder.alertLevel,
        reminder.at
      );
    } catch (_err) {
      // one bad schedule shouldn't drop the rest of the day
    }
  }
  return true;
}

function callPayload(item, phase) {
  return {
    id: String(item._id || item.id || "preview"),
    title: String(item.title || "Task"),
    spokenText: phase === "end" ? composeEndCallCue(item) : composeStartCallCue(item),
    alertLevel: item.alertLevel || "normal",
    phase: phase === "end" ? "end" : "start",
    durationMin: explicitDurationMin(item),
    domain: item.domain || "",
  };
}

export async function snoozeTaskCall(item, { phase = "start", minutes } = {}) {
  if (!available || !TaskReminderModule.snoozeCall) return false;
  const payload = callPayload(item, phase);
  const delay = snoozeDelayMs(phase, minutes);
  return TaskReminderModule.snoozeCall(
    payload.id,
    payload.title,
    payload.spokenText,
    payload.alertLevel,
    payload.phase,
    payload.durationMin,
    payload.domain,
    delay,
    true
  );
}

export async function clearTaskCallOverride(itemId) {
  if (!available || !TaskReminderModule.clearOverride || !itemId) return false;
  return TaskReminderModule.clearOverride(String(itemId));
}

export async function testTaskAlert(items, name = "Raj") {
  if (!available) return false;
  const next = (items || []).find(
    (item) => item.status === "pending" && item.alarmMode !== "scan_dismiss"
  );
  const sample = next || {
    _id: "preview",
    title: "Easy run and strength",
    scheduledAt: "06:30",
    domain: "fitness",
    alertLevel: "normal",
    durationMin: 45,
    key: "workout",
    steps: [{ label: "Run 20 to 25 minutes, easy pace.", done: false }],
  };
  const spokenText = composeStartCallCue(sample, name);
  if (TaskReminderModule.alertNowCall) {
    return TaskReminderModule.alertNowCall(
      String(sample._id || "preview"),
      String(sample.title || "Task"),
      spokenText,
      sample.alertLevel || "normal",
      "start",
      durationOf(sample),
      sample.domain || ""
    );
  }
  return TaskReminderModule.alertNow(String(sample.title), spokenText, sample.alertLevel || "normal");
}

export async function setTaskCallUiVisible(visible) {
  if (!available || !TaskReminderModule.setCallUiVisible) return false;
  return TaskReminderModule.setCallUiVisible(!!visible);
}

export async function speakTaskPrompt(text) {
  if (!available || !TaskReminderModule.speakPrompt || !text) return false;
  try {
    await TaskReminderModule.speakPrompt(String(text));
  } catch (_e) {
    return false;
  }
  return true;
}

export async function cancelSpeakPrompt() {
  if (!available) return false;
  if (TaskReminderModule.cancelSpeak) return TaskReminderModule.cancelSpeak();
  return true;
}

export async function silenceTaskAlert() {
  if (!available) return false;
  if (TaskReminderModule.silenceAlert) return TaskReminderModule.silenceAlert();
  return TaskReminderModule.stopAlert();
}

export async function stopTaskAlert() {
  if (!available) return false;
  return TaskReminderModule.stopAlert();
}

export async function cancelTaskAlerts() {
  if (!available) return false;
  return TaskReminderModule.cancelAll();
}

export async function isTaskCallRinging() {
  if (!available || !TaskReminderModule.isRinging) return false;
  return TaskReminderModule.isRinging();
}

export async function getActiveTaskCall() {
  if (!available || !TaskReminderModule.getActiveCall) return null;
  return TaskReminderModule.getActiveCall();
}

export function subscribeTaskCallSpeech(handler) {
  if (!speechEmitter) return () => {};
  const sub = speechEmitter.addListener("TaskCallSpeech", handler);
  return () => sub.remove();
}

export function subscribeTaskCallAutoSkip(handler) {
  if (!speechEmitter) return () => {};
  const sub = speechEmitter.addListener("TaskCallAutoSkip", handler);
  return () => sub.remove();
}

export function subscribeTaskCallDismiss(handler) {
  if (!speechEmitter) return () => {};
  const sub = speechEmitter.addListener("TaskCallDismissed", handler);
  return () => sub.remove();
}

export async function peekPendingTaskCallAutoSkips() {
  if (!available || !TaskReminderModule.peekPendingAutoSkips) return [];
  try {
    const rows = await TaskReminderModule.peekPendingAutoSkips();
    return Array.isArray(rows) ? rows : [];
  } catch (_e) {
    return [];
  }
}

export async function ackTaskCallAutoSkip(itemId) {
  if (!available || !TaskReminderModule.ackAutoSkip || !itemId) return false;
  return TaskReminderModule.ackAutoSkip(String(itemId));
}

export async function noteTaskCallUnanswered(call) {
  if (!available || !TaskReminderModule.noteUnanswered || !call?.itemId) return false;
  return TaskReminderModule.noteUnanswered(
    String(call.itemId),
    String(call.title || "Task"),
    String(call.spokenText || ""),
    String(call.alertLevel || "normal"),
    call.phase === "end" ? "end" : "start",
    Number(call.durationMin) || 0,
    String(call.domain || "")
  );
}

export async function clearEndGaveUp(itemId) {
  if (!available || !TaskReminderModule.clearEndGaveUp || !itemId) return false;
  return TaskReminderModule.clearEndGaveUp(String(itemId));
}

export async function startTaskCallListening() {
  if (!available || !TaskReminderModule.startListening) return false;
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (!granted) return false;
  }
  return TaskReminderModule.startListening();
}

export async function stopTaskCallListening() {
  if (!available || !TaskReminderModule.stopListening) return false;
  return TaskReminderModule.stopListening();
}

// Opens a fresh call session so a previous Ready/Snooze cannot keep the mic shut.
export async function armAlarmSession() {
  if (!available || !TaskReminderModule.armAlarmSession) return false;
  return TaskReminderModule.armAlarmSession();
}

// Stops ringtone, TTS, and speech recognition, then drops the call overlay.
// Safe to call twice: native work no-ops once the session is already closed.
export async function stopAlarmSession() {
  if (!available) return false;
  if (TaskReminderModule.stopAlarmSession) return TaskReminderModule.stopAlarmSession();
  await cancelSpeakPrompt().catch(() => {});
  await stopTaskCallListening().catch(() => {});
  return stopTaskAlert();
}
