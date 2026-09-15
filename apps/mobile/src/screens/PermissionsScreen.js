import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../hooks/useTheme";
import {
  getPermissionStatus,
  requestCameraAccess,
  requestMicrophoneAccess,
  requestNotificationAccess,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  requestIgnoreBatteryOptimizations,
  openAppSettings,
  openNotificationSettings,
} from "../ensureWakePermissions";

export default function PermissionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [status, setStatus] = useState(null);

  const refresh = useCallback(async () => {
    const next = await getPermissionStatus();
    setStatus(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const onCamera = async () => {
    if (status?.camera) return;
    const granted = await requestCameraAccess();
    if (!granted && status && !status.cameraCanAsk) await openAppSettings();
    await refresh();
  };

  const onMicrophone = async () => {
    if (status?.microphone) return;
    const granted = await requestMicrophoneAccess();
    if (!granted) await openAppSettings();
    await refresh();
  };

  const onNotifications = async () => {
    if (status?.notifications) return;
    const granted = await requestNotificationAccess();
    if (!granted) await openNotificationSettings();
    await refresh();
  };

  const onExact = async () => {
    if (status?.exactAlarms) return;
    await openExactAlarmSettings();
  };

  const onFullScreen = async () => {
    if (status?.fullScreen) return;
    await openFullScreenIntentSettings();
  };

  const onBattery = async () => {
    if (status?.battery) return;
    await requestIgnoreBatteryOptimizations();
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.card}>
        <Text style={[styles.hint, { marginBottom: 0 }]}>
          Android only shows each permission dialog once. If you previously dismissed it, tap the row to
          open the system page and allow it there.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Required for alarms & voice reminders</Text>
      <View style={styles.card}>
        <PermissionRow
          styles={styles}
          colors={colors}
          title="Camera"
          detail="Scan the wake QR to silence the morning alarm."
          allowed={status?.camera}
          onPress={onCamera}
        />
        <PermissionRow
          styles={styles}
          colors={colors}
          title="Microphone"
          detail="Needed so the task call can hear Ready / Not now after you answer."
          allowed={status?.microphone}
          onPress={onMicrophone}
        />
        <PermissionRow
          styles={styles}
          colors={colors}
          title="Notifications"
          detail="Needed so task alerts and the wake alarm can ring when the app is closed."
          allowed={status?.notifications}
          onPress={onNotifications}
          last={!status?.nativeAlarm}
        />
        {status?.nativeAlarm ? (
          <>
            <PermissionRow
              styles={styles}
              colors={colors}
              title="Alarms & reminders"
              detail="Lets Life OS fire task voice cues and the wake alarm at the exact time."
              allowed={status?.exactAlarms}
              onPress={onExact}
            />
            <PermissionRow
              styles={styles}
              colors={colors}
              title="Full-screen notifications"
              detail="Opens the scanner over the lock screen."
              allowed={status?.fullScreen}
              onPress={onFullScreen}
            />
            <PermissionRow
              styles={styles}
              colors={colors}
              title="Unrestricted battery"
              detail="Stops the phone from killing the alarm overnight."
              allowed={status?.battery}
              onPress={onBattery}
              last
            />
          </>
        ) : null}
      </View>

      <Pressable style={styles.saveBtn} onPress={() => openAppSettings()}>
        <Text style={styles.saveBtnText}>Open app settings</Text>
      </Pressable>
    </ScrollView>
  );
}

function PermissionRow({ styles, colors, title, detail, allowed, onPress, last }) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={[styles.rowStatus, { color: allowed ? colors.success : colors.gold }]}>
        {allowed ? "Allowed" : "Allow"}
      </Text>
    </Pressable>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    sectionLabel: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 12 },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 18,
      marginBottom: 22,
    },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 },
    saveBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 22 },
    saveBtnText: { color: "#1a1508", fontWeight: "700", fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
    rowBody: { flex: 1 },
    rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: "600", marginBottom: 3 },
    rowDetail: { color: colors.muted, fontSize: 12.5, lineHeight: 17 },
    rowStatus: { fontSize: 12.5, fontWeight: "700" },
  });
}
