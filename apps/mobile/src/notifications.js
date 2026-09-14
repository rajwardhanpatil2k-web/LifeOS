import * as Notifications from "expo-notifications";
import { AppState, Platform } from "react-native";
import { durationOf } from "./taskCallConfig";
import { formatClock12 } from "./formatTime";
import { planTaskCalls } from "./taskCallPlanner";

// Reminder tiers map 1:1 to the alertLevel already stored on each plan item
// (info | normal | important | non_negotiable). non_negotiable asks Android
// to bypass Do Not Disturb (works only once the user grants DND access in
// system settings) and asks iOS for a critical interruption level (only
// actually breaks silent mode with Apple's critical-alerts entitlement,
// which a personal/dev-client build doesn't have). Everything else behaves
// like a normal escalating notification.
const CHANNELS = {
  info: {
    id: "lifeos-info-v2",
    name: "Life OS · Info",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 100],
    bypassDnd: false,
  },
  normal: {
    id: "lifeos-normal-v2",
    name: "Life OS · Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 100, 200],
    bypassDnd: false,
  },
  important: {
    id: "lifeos-important-v2",
    name: "Life OS · Important",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300, 150, 300],
    bypassDnd: false,
  },
  non_negotiable: {
    id: "lifeos-nonneg-v2",
    name: "Life OS · Non-negotiable",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500, 200, 500],
    bypassDnd: true,
  },
};

const ANDROID_PRIORITY = {
  info: Notifications.AndroidNotificationPriority.DEFAULT,
  normal: Notifications.AndroidNotificationPriority.HIGH,
  important: Notifications.AndroidNotificationPriority.HIGH,
  non_negotiable: Notifications.AndroidNotificationPriority.MAX,
};

const INTERRUPTION_LEVEL = {
  info: "passive",
  normal: "active",
  important: "timeSensitive",
  non_negotiable: "critical",
};

const TITLE_PREFIX = {
  info: "",
  normal: "",
  important: "❗ ",
  non_negotiable: "⏰ ",
};

let handlerConfigured = false;

function configureHandler() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data || {};
      const isTaskCall = data.kind === "task_call" || !!data.phase;
      const appOpen = AppState.currentState === "active";
      if (isTaskCall && appOpen) {
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false };
    },
  });
}

// Call once on app start: sets up Android channels and asks for permission.
// Returns true if we're allowed to actually show notifications.
export async function ensureNotificationSetup() {
  configureHandler();

  if (Platform.OS === "android") {
    await Promise.all(
      Object.values(CHANNELS).map((channel) =>
        Notifications.setNotificationChannelAsync(channel.id, {
          name: channel.name,
          importance: channel.importance,
          vibrationPattern: channel.vibrationPattern,
          bypassDnd: channel.bypassDnd,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: "default",
          enableVibrate: true,
          lightColor: "#d4af6a",
        })
      )
    );
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
      allowCriticalAlerts: true,
    },
  });
  return requested.status === "granted";
}

// Ids we scheduled on the previous sync, so we can clear them before
// scheduling again. Cancel-then-reschedule keeps this idempotent no matter
// how often it's called (focus, foreground, interval, after every action).
let lastScheduledIds = [];

export async function syncTodayReminders(items, { name = "Raj", pausedUntil = 0 } = {}) {
  await Promise.all(
    lastScheduledIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    )
  );
  lastScheduledIds = [];

  if (!Array.isArray(items) || items.length === 0) return;

  const nextIds = [];
  const planned = planTaskCalls(items, { name, pausedUntil });

  for (const reminder of planned) {
    const item = reminder.item;
    const level = CHANNELS[item.alertLevel] ? item.alertLevel : "normal";
    const channel = CHANNELS[level];
    const identifier = reminder.phase === "end" ? `${reminder.id}-end` : reminder.id;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: `${TITLE_PREFIX[level]}${item.title}`,
          body:
            reminder.phase === "end"
              ? `Time's up · ${durationOf(item)} min`
              : `${formatClock12(item.scheduledAt)} · incoming task call`,
          data: {
            kind: "task_call",
            itemId: item._id,
            phase: reminder.phase,
            title: item.title,
            domain: item.domain,
            alertLevel: level,
            durationMin: durationOf(item),
            spokenText: reminder.spokenText,
          },
          sound: "default",
          interruptionLevel: INTERRUPTION_LEVEL[level],
          ...(Platform.OS === "android"
            ? { priority: ANDROID_PRIORITY[level], vibrate: channel.vibrationPattern }
            : {}),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.at),
          channelId: channel.id,
        },
      });
      nextIds.push(identifier);
    } catch (_err) {
      // best effort — one bad schedule shouldn't block the rest of today's reminders
    }
  }

  lastScheduledIds = nextIds;
}
