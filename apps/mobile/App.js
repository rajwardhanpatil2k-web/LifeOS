import { useMemo } from "react";
import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Provider } from "react-redux";
import { store } from "./src/store";
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
    </>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ThemedApp />
    </Provider>
  );
}
