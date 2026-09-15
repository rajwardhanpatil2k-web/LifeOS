import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useDispatch, useSelector } from "react-redux";
import { fetchSettings, fetchToday } from "../store";
import { loadApiUrl } from "../apiConfig";
import { isWakeAlarmAvailable, isWakeAlarmRinging, scheduleDailyWakeAlarm, cancelWakeAlarm, nextWakeMillis } from "../wakeAlarm";
import { isVoiceAgentAvailable, cancelVoiceCues, speakNow } from "../voiceAgent";
import { isTaskAlertsAvailable, getActiveTaskCall, isTaskCallRinging, stopTaskAlert, setTaskAlertsPausedUntil } from "../taskAlerts";
import { ensureRemindersReady, syncDayReminders } from "../reminderSync";
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef();

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function isTaskCallRoute() {
  if (!navigationRef.isReady()) return false;
  try {
    return navigationRef.getCurrentRoute()?.name === "TaskCall";
  } catch (_e) {
    return false;
  }
}

async function callIsLive() {
  try {
    return await isTaskCallRinging();
  } catch (_e) {
    return false;
  }
}

async function openWakeAlarmIfRinging() {
  if (!isWakeAlarmAvailable() || !navigationRef.isReady()) return;
  try {
    if (await isWakeAlarmRinging()) navigationRef.navigate("WakeAlarm");
  } catch (_e) {}
}

async function openTaskCallIfRinging() {
  if (!isTaskAlertsAvailable() || !navigationRef.isReady()) return;
  try {
    if (isTaskCallRoute()) return;
    if (!(await isTaskCallRinging())) return;
    const active = await getActiveTaskCall();
    if (!active?.itemId) return;
    navigationRef.navigate("TaskCall", active);
  } catch (_e) {}
}

export default function AppBackgroundSync() {
  const dispatch = useDispatch();
  const wakeTarget = useSelector((s) => s.settings.wakeTarget);
  const settingsHydrated = useSelector((s) => s.settings.hydrated);
  const voiceAlerts = useSelector((s) => s.settings.voiceAlerts);
  const userName = useSelector((s) => s.settings.name);
  const todayItems = useSelector((s) => s.today.data?.items);
  const focusBlock = useSelector((s) => s.today.data?.focusBlock);
  const pausedUntil = focusBlock?.active && focusBlock?.until ? Date.parse(focusBlock.until) : 0;
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    loadApiUrl().then(() => {
      if (cancelled) return;
      dispatch(fetchSettings());
      ensureRemindersReady().catch(() => {});
      dispatch(fetchToday());
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!settingsHydrated || !Array.isArray(todayItems)) return undefined;
    const until = Number.isFinite(pausedUntil) && pausedUntil > Date.now() ? pausedUntil : 0;
    const timer = setTimeout(async () => {
      try {
        if (await callIsLive()) return;
        if (until) stopTaskAlert().catch(() => {});
        await setTaskAlertsPausedUntil(until).catch(() => {});
        await syncDayReminders(todayItems, { voiceAlerts, name: userName, pausedUntil: until }).catch(() => {});
      } catch (_e) {
        if (await callIsLive()) return;
        syncDayReminders(todayItems, { voiceAlerts, name: userName, pausedUntil: until }).catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [settingsHydrated, todayItems, voiceAlerts, userName, pausedUntil]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      const wasBackground = appState.current.match(/inactive|background/);
      if (wasBackground && next === "active") {
        openWakeAlarmIfRinging();
        openTaskCallIfRinging();
        if (!isTaskCallRoute()) dispatch(fetchToday());
      }
      appState.current = next;
    });
    const interval = setInterval(() => {
      if (!isTaskCallRoute()) dispatch(fetchToday());
    }, REFRESH_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [dispatch]);

  useEffect(() => {
    if (!isVoiceAgentAvailable() || voiceAlerts === false || isTaskAlertsAvailable()) return undefined;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const spokenText = notification.request.content.data?.spokenText;
      if (typeof spokenText === "string" && spokenText.trim()) {
        speakNow(spokenText).catch(() => {});
      }
    });
    return () => sub.remove();
  }, [voiceAlerts]);

  useEffect(() => {
    if (!settingsHydrated || !isWakeAlarmAvailable() || !wakeTarget) return;
    const until = Number.isFinite(pausedUntil) && pausedUntil > Date.now() ? pausedUntil : 0;
    const nextWake = nextWakeMillis(wakeTarget);
    if (until && nextWake > 0 && nextWake < until) {
      cancelWakeAlarm().catch(() => {});
      return;
    }
    scheduleDailyWakeAlarm(wakeTarget).catch(() => {});
  }, [settingsHydrated, wakeTarget, pausedUntil]);

  useEffect(() => {
    if (!settingsHydrated) return;
    if (!voiceAlerts) cancelVoiceCues().catch(() => {});
  }, [settingsHydrated, voiceAlerts]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data || {};
      if (!data.itemId || (data.kind !== "task_call" && !data.phase)) return;
      if (!navigationRef.isReady()) return;
      navigationRef.navigate("TaskCall", {
        itemId: String(data.itemId),
        phase: data.phase === "end" ? "end" : "start",
        title: data.title,
        domain: data.domain,
        alertLevel: data.alertLevel,
        durationMin: data.durationMin,
      });
    });
    return () => sub.remove();
  }, []);

  return null;
}

export { openWakeAlarmIfRinging, openTaskCallIfRinging };
