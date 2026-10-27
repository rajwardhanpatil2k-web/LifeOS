import { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Provider } from "react-redux";
import { store } from "./src/store";
import { hydrateAuth, sessionExpired } from "./src/authSlice";
import { clearUndo, undoShift } from "./src/shiftSlice";
import { fetchToday } from "./src/store";
import { clearSession } from "./src/sessionStore";
import { setUnauthorizedHandler } from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import { useTheme } from "./src/hooks/useTheme";
import MainTabs from "./src/navigation/MainTabs";
import AppBackgroundSync, { navigationRef, openWakeAlarmIfRinging, openTaskCallIfRinging } from "./src/navigation/AppBackgroundSync";
import WakeAlarmScreen from "./src/screens/WakeAlarmScreen";
import TaskIncomingCallScreen from "./src/screens/TaskIncomingCallScreen";
import { WAKE_DEEP_LINK_PATH } from "./src/wakeAlarmConfig";
import { TASK_CALL_DEEP_LINK_PATH } from "./src/taskCallConfig";
import { requestStartupPermissionDialogs } from "./src/ensureWakePermissions";

const RootStack = createNativeStackNavigator();

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

function UndoBar() {
  const dispatch = useDispatch();
  const undo = useSelector((s) => s.shift.undo);
  const visible = Boolean(undo && undo.until > Date.now());

  useEffect(() => {
    if (!undo?.until) return undefined;
    const wait = undo.until - Date.now();
    if (wait <= 0) {
      dispatch(clearUndo());
      return undefined;
    }
    const timer = setTimeout(() => dispatch(clearUndo()), wait);
    return () => clearTimeout(timer);
  }, [dispatch, undo]);

  if (!visible) return null;
  return (
    <View
      style={{
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 28,
        backgroundColor: "#1a1e25",
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Text style={{ color: "#f2f4f7", fontSize: 14, fontWeight: "600", flex: 1 }}>Schedule updated</Text>
      <Pressable
        onPress={() => {
          dispatch(undoShift(undo.shiftId))
            .unwrap()
            .then(() => dispatch(fetchToday()))
            .catch(() => dispatch(clearUndo()));
        }}
        hitSlop={8}
      >
        <Text style={{ color: "#d4af6a", fontSize: 14, fontWeight: "700" }}>Undo</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Dismiss"
        onPress={() => dispatch(clearUndo())}
        hitSlop={8}
        style={{ paddingHorizontal: 4 }}
      >
        <Text style={{ color: "#9aa3ad", fontSize: 20, fontWeight: "600", lineHeight: 22 }}>×</Text>
      </Pressable>
    </View>
  );
}

function ThemedApp() {
  const { mode, colors } = useTheme();

  const navTheme = useMemo(
    () => ({
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
    }),
    [mode, colors]
  );

  return (
    <>
      <AppBackgroundSync />
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
      <UndoBar />
    </>
  );
}

function Gate() {
  const dispatch = useDispatch();
  const status = useSelector((s) => s.auth.status);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession().catch(() => {});
      store.dispatch(sessionExpired());
    });
    dispatch(hydrateAuth());
  }, [dispatch]);

  if (status === "unknown") return <View style={{ flex: 1, backgroundColor: "#0a0b0d" }} />;
  if (status !== "authed") return <LoginScreen />;
  return <ThemedApp />;
}

export default function App() {
  return (
    <Provider store={store}>
      <Gate />
    </Provider>
  );
}
