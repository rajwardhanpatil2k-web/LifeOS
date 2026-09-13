import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { composeEndCallCue, composeStartCallCue } from "./voiceAgent";
import { durationOf, END_FOLLOWUP_MIN, START_SNOOZE_MIN } from "./taskCallConfig";
import { planTaskCalls, resolveCallDelay } from "./taskCallPlanner";

const { TaskReminderModule } = NativeModules;

const available = Platform.OS === "android" && !!TaskReminderModule;
const speechEmitter = available ? new NativeEventEmitter(TaskReminderModule) : null;

export function isTaskAlertsAvailable() {
  return available;
}

export async function syncTaskAlerts(items, { voiceAlerts = true, name = "Raj" } = {}) {
  if (!available) return false;
  await TaskReminderModule.setEnabled(true);

  if (!Array.isArray(items) || items.length === 0) {
    if (TaskReminderModule.replaceTaskCalls) await TaskReminderModule.replaceTaskCalls([]);
    else await TaskReminderModule.cancelAll();
    return true;
  }

  const planned = planTaskCalls(items, { voiceAlerts: voiceAlerts !== false, name });

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
    durationMin: durationOf(item),
    domain: item.domain || "",
  };
}

export async function snoozeTaskCall(item, { phase = "start", minutes, items = [] } = {}) {
  if (!available || !TaskReminderModule.snoozeCall) return false;
  const requested = Number(minutes) > 0 ? Number(minutes) : phase === "end" ? END_FOLLOWUP_MIN : START_SNOOZE_MIN;
  const resolved = resolveCallDelay(items, { itemId: item?._id || item?.id, minutes: requested });
  const payload = callPayload(item, phase);
  const delay = resolved.delayMs;
  return TaskReminderModule.snoozeCall(
    payload.id,
    payload.title,
    payload.spokenText,
    payload.alertLevel,
    payload.phase,
    payload.durationMin,
    payload.domain,
    delay
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
  return TaskReminderModule.speakPrompt(String(text));
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

export async function startTaskCallListening() {
  if (!available || !TaskReminderModule.startListening) return false;
  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
  }
  return TaskReminderModule.startListening();
}

export async function stopTaskCallListening() {
  if (!available || !TaskReminderModule.stopListening) return false;
  return TaskReminderModule.stopListening();
}
