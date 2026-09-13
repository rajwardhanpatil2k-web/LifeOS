import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors } from "../theme";
import { WAKE_HOLD_MS, WAKE_QR_VALUE } from "../wakeAlarmConfig";
import { stopWakeAlarmRinging } from "../wakeAlarm";
import { api } from "../api";

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

export default function WakeAlarmScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [heldMs, setHeldMs] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const lastSeenAt = useRef(0);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission, requestPermission]);

  // Wake-up-by-design: the whole point is you can't back out of this screen,
  // you have to actually walk to the code and hold it there.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const finish = useCallback(async () => {
    if (dismissed) return;
    setDismissed(true);
    try {
      await stopWakeAlarmRinging();
    } catch (_e) {
      // best effort — the foreground service will still time out eventually
    }
    autoCompleteWakeItem();
    navigation.goBack();
  }, [dismissed, navigation]);

  useEffect(() => {
    if (dismissed) return;
    const interval = setInterval(() => {
      const seenRecently = Date.now() - lastSeenAt.current < GRACE_MS;
      setHeldMs((prev) => {
        const next = seenRecently ? Math.min(prev + TICK_MS, WAKE_HOLD_MS) : 0;
        if (next >= WAKE_HOLD_MS) finish();
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [dismissed, finish]);

  const onBarcodeScanned = useCallback(({ data }) => {
    if (data === WAKE_QR_VALUE) {
      lastSeenAt.current = Date.now();
    }
  }, []);

  const pct = Math.min(100, Math.round((heldMs / WAKE_HOLD_MS) * 100));
  const secondsLeft = Math.max(0, Math.ceil((WAKE_HOLD_MS - heldMs) / 1000));

  return (
    <View style={styles.page}>
      <Text style={styles.title}>⏰ Wake up</Text>
      <Text style={styles.subtitle}>
        Hold the wake QR code in the camera for 15 seconds, without looking away, to silence the alarm.
      </Text>

      <View style={styles.cameraWrap}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
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
        {heldMs > 0 ? `Holding steady · ${secondsLeft}s left` : "Point the camera at the wake code"}
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
