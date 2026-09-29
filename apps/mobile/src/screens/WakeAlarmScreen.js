import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useDispatch } from "react-redux";
import { colors } from "../theme";
import { WAKE_HOLD_MS, WAKE_QR_VALUE } from "../wakeAlarmConfig";
import { markWakeAlarmDismissed, stopWakeAlarmRinging } from "../wakeAlarm";
import { resetToMain } from "../navigation/AppBackgroundSync";
import { api } from "../api";
import { fetchToday } from "../store";

// Called straight against the API (not through Redux) since this screen can
// be the very first thing that mounts on a cold start from the lock screen —
// there's no guarantee the store has today's data loaded yet.
async function autoCompleteWakeItem() {
  try {
    const today = await api("/api/today");
    const wakeItem = today.items.find(
      (item) => item.alarmMode === "scan_dismiss" && item.status === "pending"
    );
    if (wakeItem) {
      await api(`/api/items/${wakeItem._id}/complete`, {
        method: "POST",
        body: JSON.stringify({ source: "wake_alarm_scan" }),
      });
    }
  } catch (_e) {
    // best effort — worst case the user just marks "Wake" done manually
  }
}

const TICK_MS = 200;
const GRACE_MS = 700; // tolerate brief camera-frame gaps without resetting progress

function goHome(navigation) {
  // Deep-link cold starts (`lifeos://wake-alarm`) have no back stack, so
  // goBack() is a no-op. Reset the root navigator onto Today instead.
  if (resetToMain()) return;
  try {
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    return;
  } catch (_e) {}
  try {
    if (navigation.canGoBack()) navigation.goBack();
  } catch (_e) {}
}

export default function WakeAlarmScreen({ navigation }) {
  const dispatch = useDispatch();
  const [permission, requestPermission] = useCameraPermissions();
  const [heldMs, setHeldMs] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastSeenAt = useRef(0);
  const finishing = useRef(false);

  const asked = useRef(false);
  const lastScanAt = useRef(0);

  useEffect(() => {
    if (asked.current || !permission || permission.granted || permission.canAskAgain === false) return;
    asked.current = true;
    requestPermission();
  }, [permission, requestPermission]);

  // Wake-up-by-design: the whole point is you can't back out of this screen,
  // you have to actually walk to the code and hold it there.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const finish = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    markWakeAlarmDismissed();
    setDismissed(true);

    const leave = () => goHome(navigation);

    // Never await native/API work before leaving — a hung bridge or a
    // production API retry would freeze this screen at 100%.
    stopWakeAlarmRinging().catch(() => {}).finally(leave);
    setTimeout(leave, 250);
    setTimeout(() => {
      try {
        const state = navigation.getState();
        const route = state?.routes?.[state.index]?.name;
        if (route !== "Main") leave();
      } catch (_e) {
        leave();
      }
    }, 900);

    autoCompleteWakeItem()
      .then(() => dispatch(fetchToday()))
      .catch(() => {});
  }, [dispatch, navigation]);

  useEffect(() => {
    if (dismissed) return undefined;
    const interval = setInterval(() => {
      const seenRecently = Date.now() - lastSeenAt.current < GRACE_MS;
      setHeldMs((prev) => (seenRecently ? Math.min(prev + TICK_MS, WAKE_HOLD_MS) : 0));
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [dismissed]);

  useEffect(() => {
    if (heldMs >= WAKE_HOLD_MS) finish();
  }, [heldMs, finish]);

  const onBarcodeScanned = useCallback(({ data }) => {
    if (finishing.current) return;
    const now = Date.now();
    if (now - lastScanAt.current < 150) return;
    lastScanAt.current = now;
    if (data === WAKE_QR_VALUE) {
      lastSeenAt.current = now;
    }
  }, []);

  const pct = Math.min(100, Math.round((heldMs / WAKE_HOLD_MS) * 100));
  const secondsLeft = Math.max(0, Math.ceil((WAKE_HOLD_MS - heldMs) / 1000));

  return (
    <View style={styles.page}>
      <Text style={styles.title}>⏰ Wake up</Text>
      <Text style={styles.subtitle}>
        {dismissed
          ? "Alarm off. Opening Today…"
          : "Hold the wake QR code in the camera for 15 seconds, without looking away, to silence the alarm."}
      </Text>

      <View style={styles.cameraWrap}>
        {dismissed ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>You're up.</Text>
          </View>
        ) : permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            active={!dismissed}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onBarcodeScanned}
          />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>
              Camera access is required to scan the wake code.
            </Text>
          </View>
        )}
        <View style={styles.frame} />
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressLabel}>
        {dismissed
          ? "Taking you home"
          : heldMs > 0
            ? `Holding steady · ${secondsLeft}s left`
            : "Point the camera at the wake code"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#1a0806", padding: 20, paddingTop: 60 },
  title: { color: colors.text, fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  subtitle: { color: "#f1b3ab", fontSize: 14, textAlign: "center", marginBottom: 22, lineHeight: 20 },
  cameraWrap: {
    flex: 1,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: colors.danger,
    marginBottom: 20,
  },
  permissionBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  permissionText: { color: colors.text, textAlign: "center", fontSize: 14 },
  frame: {
    position: "absolute",
    top: "20%",
    left: "15%",
    right: "15%",
    bottom: "20%",
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 16,
  },
  progressTrack: { height: 10, borderRadius: 6, backgroundColor: "#3a1512", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.gold },
  progressLabel: { color: colors.text, textAlign: "center", marginTop: 12, fontSize: 13, fontWeight: "600" },
});
