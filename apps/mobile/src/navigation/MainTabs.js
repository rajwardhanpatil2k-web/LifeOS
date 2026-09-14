import { memo, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../hooks/useTheme";
import TodayScreen from "../screens/TodayScreen";
import EditScheduleScreen from "../screens/EditScheduleScreen";
import WeekScreen from "../screens/WeekScreen";
import DayDetailScreen from "../screens/DayDetailScreen";
import InsightsScreen from "../screens/InsightsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import PermissionsScreen from "../screens/PermissionsScreen";

const Tab = createBottomTabNavigator();
const TodayStack = createNativeStackNavigator();
const WeekStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

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

function useStackScreenOptions() {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      headerStyle: {
        backgroundColor: colors.bg,
        elevation: 0,
        shadowOpacity: 0,
        borderBottomColor: colors.line,
        borderBottomWidth: 1,
      },
      headerTitleStyle: { color: colors.text, fontWeight: "700" },
      headerTintColor: colors.text,
    }),
    [colors]
  );
}

const TodayStackScreen = memo(function TodayStackScreen() {
  const screenOptions = useStackScreenOptions();
  return (
    <TodayStack.Navigator screenOptions={screenOptions}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} options={{ title: "Today" }} />
      <TodayStack.Screen name="EditSchedule" component={EditScheduleScreen} options={{ title: "Edit schedule" }} />
    </TodayStack.Navigator>
  );
});

const WeekStackScreen = memo(function WeekStackScreen() {
  const screenOptions = useStackScreenOptions();
  return (
    <WeekStack.Navigator screenOptions={screenOptions}>
      <WeekStack.Screen name="Week" component={WeekScreen} options={{ title: "Week" }} />
      <WeekStack.Screen name="DayDetail" component={DayDetailScreen} options={{ title: "Day" }} />
    </WeekStack.Navigator>
  );
});

const SettingsStackScreen = memo(function SettingsStackScreen() {
  const screenOptions = useStackScreenOptions();
  return (
    <SettingsStack.Navigator screenOptions={screenOptions}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStack.Screen name="Permissions" component={PermissionsScreen} options={{ title: "Permissions" }} />
    </SettingsStack.Navigator>
  );
});

function MainTabs() {
  const { colors } = useTheme();
  const screenOptions = useMemo(
    () =>
      ({ route }) => ({
        headerStyle: {
          backgroundColor: colors.bg,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomColor: colors.line,
          borderBottomWidth: 1,
        },
        headerTitleStyle: { color: colors.text, fontWeight: "700" },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.bgSoft,
          borderTopColor: colors.line,
          height: 58,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: "600" },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, focused }) => <TabIcon routeName={route.name} color={color} focused={focused} />,
      }),
    [colors]
  );

  return (
    <Tab.Navigator lazy screenOptions={screenOptions}>
      <Tab.Screen name="Today" component={TodayStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Week" component={WeekStackScreen} options={{ headerShown: false }} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Settings" component={SettingsStackScreen} options={{ headerShown: false }} />
    </Tab.Navigator>
  );
}

export default memo(MainTabs);
