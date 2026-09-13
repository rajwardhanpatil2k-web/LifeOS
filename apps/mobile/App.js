import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Provider, useDispatch, useSelector } from "react-redux";
import { store, fetchSettings, fetchToday } from "./src/store";
import { useTheme } from "./src/hooks/useTheme";
import TodayScreen from "./src/screens/TodayScreen";
import EditScheduleScreen from "./src/screens/EditScheduleScreen";
import WeekScreen from "./src/screens/WeekScreen";
import DayDetailScreen from "./src/screens/DayDetailScreen";
import InsightsScreen from "./src/screens/InsightsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import PermissionsScreen from "./src/screens/PermissionsScreen";
import WakeAlarmScreen from "./src/screens/WakeAlarmScreen";
import TaskIncomingCallScreen from "./src/screens/TaskIncomingCallScreen";
import { WAKE_DEEP_LINK_PATH } from "./src/wakeAlarmConfig";
import { TASK_CALL_DEEP_LINK_PATH } from "./src/taskCallConfig";
import { requestStartupPermissionDialogs } from "./src/ensureWakePermissions";
import { isWakeAlarmAvailable, isWakeAlarmRinging, scheduleDailyWakeAlarm } from "./src/wakeAlarm";
import { isVoiceAgentAvailable, cancelVoiceCues, speakNow } from "./src/voiceAgent";
import { getActiveTaskCall, isTaskAlertsAvailable, isTaskCallRinging } from "./src/taskAlerts";
import { ensureRemindersReady, syncDayReminders } from "./src/reminderSync";

const navigationRef = createNavigationContainerRef();

async function openWakeAlarmIfRinging() {
  if (!isWakeAlarmAvailable() || !navigationRef.isReady()) return;
  try {
    if (await isWakeAlarmRinging()) navigationRef.navigate("WakeAlarm");
  } catch (_e) {
    // native module missing or activity not ready yet
  }
}

async function openTaskCallIfRinging() {
  if (!isTaskAlertsAvailable() || !navigationRef.isReady()) return;
  try {
    if (!(await isTaskCallRinging())) return;
    const active = await getActiveTaskCall();
    if (!active?.itemId) return;
    navigationRef.navigate("TaskCall", active);
  } catch (_e) {
    // native module missing or activity not ready yet
  }
}

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const WeekStack = createNativeStackNavigator();
const TodayStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

// lifeos://wake-alarm — the native alarm's full-screen intent / status-bar
// tap both launch the app on this URI so the ringing screen opens directly,
// cold start or not, without any custom native-to-JS bridging.
const linking = {
  prefixes: [Linking.createURL("/"), "lifeos://"],
  config: {
    screens: {
      Main: "",
      WakeAlarm: WAKE_DEEP_LINK_PATH,
      TaskCall: TASK_CALL_DEEP_LINK_PATH,
    },
  },
};

function TodayStackScreen({ colors }) {
  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0, borderBottomColor: colors.line, borderBottomWidth: 1 },
    headerTitleStyle: { color: colors.text, fontWeight: "700" },
    headerTintColor: colors.text,
  };
  return (
    <TodayStack.Navigator screenOptions={stackHeaderOptions}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} options={{ title: "Today" }} />
      <TodayStack.Screen name="EditSchedule" component={EditScheduleScreen} options={{ title: "Edit schedule" }} />
    </TodayStack.Navigator>
  );
}

function WeekStackScreen({ colors }) {
  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0, borderBottomColor: colors.line, borderBottomWidth: 1 },
    headerTitleStyle: { color: colors.text, fontWeight: "700" },
    headerTintColor: colors.text,
  };
  return (
    <WeekStack.Navigator screenOptions={stackHeaderOptions}>
      <WeekStack.Screen name="Week" component={WeekScreen} options={{ title: "Week" }} />
      <WeekStack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: "Day" }} />
    </WeekStack.Navigator>
  );
}

function SettingsStackScreen({ colors }) {
  const stackHeaderOptions = {
    headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0, borderBottomColor: colors.line, borderBottomWidth: 1 },
    headerTitleStyle: { color: colors.text, fontWeight: "700" },
    headerTintColor: colors.text,
  };
  return (
    <SettingsStack.Navigator screenOptions={stackHeaderOptions}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStack.Screen name="Permissions" component={PermissionsScreen} options={{ title: "Permissions" }} />
    </SettingsStack.Navigator>
  );
}

const TAB_ICONS = {
  Today: { focused: "sunny", idle: "sunny-outline" },
  Week: { focused: "calendar", idle: "calendar-outline" },
  Insights: { focused: "stats-chart", idle: "stats-chart-outline" },
  Settings: { focused: "settings", idle: "settings-outline" },
};

function TabIcon({ routeName, color, focused }) {
  const names = TAB_ICONS[routeName];
  return <Ionicons name={focused ? names.focused : names.idle} size={20} color={color} />;
}

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.bg, elevation: 0, shadowOpacity: 0, borderBottomColor: colors.line, borderBottomWidth: 1 },
        headerTitleStyle: { color: colors.text, fontWeight: "700" },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.bgSoft, borderTopColor: colors.line, height: 58, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: "600" },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, focused }) => <TabIcon routeName={route.name} color={color} focused={focused} />,
      })}
    >
      <Tab.Screen name="Today" children={() => <TodayStackScreen colors={colors} />} options={{ headerShown: false }} />
      <Tab.Screen name="Week" children={() => <WeekStackScreen colors={colors} />} options={{ headerShown: false }} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Settings" children={() => <SettingsStackScreen colors={colors} />} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function ThemedApp() {
  const dispatch = useDispatch();
  const { mode, colors } = useTheme();
  const wakeTarget = useSelector((s) => s.settings.wakeTarget);
  const settingsHydrated = useSelector((s) => s.settings.hydrated);
  const voiceAlerts = useSelector((s) => s.settings.voiceAlerts);
  const userName = useSelector((s) => s.settings.name);
  const todayItems = useSelector((s) => s.today.data?.items);
  const appState = useRef(AppState.currentState);

  // Load the persisted theme (and other settings) before the rest of the UI
  // needs it — themeMode defaults to "dark" until this resolves.
  useEffect(() => {
    dispatch(fetchSettings());
    ensureRemindersReady().catch(() => {});
    dispatch(fetchToday());
  }, [dispatch]);

  // Keep push + spoken reminders armed even if the user never opens Today.
  useEffect(() => {
    if (!settingsHydrated || !Array.isArray(todayItems)) return;
    syncDayReminders(todayItems, { voiceAlerts, name: userName }).catch(() => {});
  }, [settingsHydrated, todayItems, voiceAlerts, userName]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        dispatch(fetchToday());
      }
      appState.current = next;
    });
    const interval = setInterval(() => dispatch(fetchToday()), REFRESH_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [dispatch]);

  // Foreground backup when native task alerts aren't in the build yet.
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

  // Wake time is the only source of truth for the native alarm. Wait until
  // settings have loaded — the Redux default is 06:00 and scheduling that
  // on first mount used to overwrite whatever the user just saved.
  useEffect(() => {
    if (!settingsHydrated || !isWakeAlarmAvailable() || !wakeTarget) return;
    scheduleDailyWakeAlarm(wakeTarget).catch(() => {});
  }, [settingsHydrated, wakeTarget]);

  useEffect(() => {
    if (!settingsHydrated) return;
    if (!voiceAlerts) cancelVoiceCues().catch(() => {});
  }, [settingsHydrated, voiceAlerts]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        openWakeAlarmIfRinging();
        openTaskCallIfRinging();
      }
    });
    return () => sub.remove();
  }, []);

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

  const navTheme = {
    ...DefaultTheme,
    dark: mode === "dark",
    colors: {
      ...DefaultTheme.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.line,
      primary: colors.gold,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      linking={linking}
      onReady={() => {
        openWakeAlarmIfRinging();
        openTaskCallIfRinging();
        setTimeout(() => {
          requestStartupPermissionDialogs().catch(() => {});
        }, 800);
      }}
    >
      <StatusBar style={mode === "light" ? "dark" : "light"} />
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main" component={MainTabs} />
        <RootStack.Screen
          name="WakeAlarm"
          component={WakeAlarmScreen}
          options={{
            presentation: "fullScreenModal",
            gestureEnabled: false,
            animation: "fade",
          }}
        />
        <RootStack.Screen
          name="TaskCall"
          component={TaskIncomingCallScreen}
          options={{
            presentation: "fullScreenModal",
            gestureEnabled: false,
            animation: "fade",
          }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ThemedApp />
    </Provider>
  );
}
