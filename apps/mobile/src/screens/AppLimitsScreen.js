import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { getPermissionStatus, requestIgnoreBatteryOptimizations } from "../ensureWakePermissions";
import { useTheme } from "../hooks/useTheme";
import {
  displayUsedMs,
  formatLimitMinutes,
  formatRemainingClock,
  formatSpent,
  LIMIT_PRESETS,
  stepLimitMinutes,
  usageSummary,
} from "../appLimitMath";
import { openAccessibilitySettings, openOverlaySettings, openUsageAccessSettings } from "../appLimits";
import { changeAppLimit, hydrateAppLimits, refreshAppLimits, removeAppLimit } from "../appLimitSlice";

export default function AppLimitsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const status = useSelector((s) => s.appLimits.status);
  const available = useSelector((s) => s.appLimits.available);
  const limits = useSelector((s) => s.appLimits.limits);
  const permissions = useSelector((s) => s.appLimits.permissions);
  const foreground = useSelector((s) => s.appLimits.foreground);
  const usageFetchedAt = useSelector((s) => s.appLimits.usageFetchedAt);
  const error = useSelector((s) => s.appLimits.error);
  const [now, setNow] = useState(Date.now());
  const [battery, setBattery] = useState(true);

  useEffect(() => {
    if (status === "idle") dispatch(hydrateAppLimits());
  }, [dispatch, status]);

  useFocusEffect(
    useCallback(() => {
      if (status !== "ready") return undefined;
      dispatch(refreshAppLimits());
      getPermissionStatus()
        .then((next) => setBattery(!!next?.battery))
        .catch(() => {});
      const refreshId = setInterval(() => dispatch(refreshAppLimits()), 5000);
      const clockId = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        clearInterval(refreshId);
        clearInterval(clockId);
      };
    }, [dispatch, status])
  );

  const watching = !!(permissions.usage && (permissions.accessibility || permissions.overlay));

  if (status !== "ready") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Each limit is the total time that app can be open today, across every visit. At midnight the count starts
          over. While the app is open, the time left sits at the top of the screen. YouTube opened in Chrome counts as Chrome.
        </Text>
        {!available ? (
          <Text style={styles.note}>
            {Platform.OS === "ios"
              ? "On iPhone, set this in Settings, then Screen Time, then App Limits."
              : "Rebuild Life OS onto the phone to turn the watcher on, then open this screen again."}
          </Text>
        ) : null}
      </View>

      {available ? (
        <>
          <Text style={styles.sectionLabel}>Access</Text>
          <View style={styles.card}>
            <Text style={[styles.hint, styles.hintTight]}>
              Usage access counts today's time. App limits access is what keeps the block working all day after you leave Life OS. Display over other apps is the backup that draws the countdown.
            </Text>
            <AccessRow
              styles={styles}
              colors={colors}
              title="Usage access"
              detail="How long each app has been open today."
              allowed={permissions.usage}
              onPress={() => openUsageAccessSettings().catch(() => {})}
            />
            <AccessRow
              styles={styles}
              colors={colors}
              title="App limits access"
              detail="Sees which app you opened, using the app name only, so the countdown and the block can run."
              allowed={permissions.accessibility}
              onPress={() => openAccessibilitySettings().catch(() => {})}
            />
            <AccessRow
              styles={styles}
              colors={colors}
              title="Display over other apps"
              detail="Draws the countdown, and blocks the app if App limits access is off."
              allowed={permissions.overlay}
              onPress={() => openOverlaySettings().catch(() => {})}
            />
            <AccessRow
              styles={styles}
              colors={colors}
              title="Unrestricted battery"
              detail="Stops the phone from pausing the countdown in the background."
              allowed={battery}
              last
              onPress={async () => {
                if (battery) return;
                await requestIgnoreBatteryOptimizations().catch(() => {});
              }}
            />
          </View>

          {!watching ? (
            <Text style={styles.warning}>
              Allow usage access, and either App limits access or display over other apps, so Life OS can close an app when its time is up.
            </Text>
          ) : limits.length > 0 ? (
            <Text style={styles.saved}>Limits are active for today.</Text>
          ) : null}

          <Text style={styles.sectionLabel}>Today</Text>
          {limits.length === 0 ? (
            <View style={styles.card}>
              <Text style={[styles.hint, styles.hintTight]}>
                No apps are limited yet. Add Instagram or YouTube and set a daily time.
              </Text>
            </View>
          ) : (
            limits.map((item) => (
              <LimitCard
                key={item.packageName}
                item={item}
                colors={colors}
                styles={styles}
                usedMs={displayUsedMs(item, { foreground, usageFetchedAt, now })}
                onChange={(limitMinutes) => {
                  if (limitMinutes === item.limitMinutes) return;
                  dispatch(changeAppLimit({ packageName: item.packageName, limitMinutes }));
                }}
                onRemove={() => {
                  Alert.alert("Remove limit", `Remove the daily limit for ${item.label}?`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => dispatch(removeAppLimit(item.packageName)) },
                  ]);
                }}
              />
            ))
          )}

          <Pressable style={styles.saveBtn} onPress={() => navigation.navigate("AppLimitPicker")}>
            <Text style={styles.saveBtnText}>Add an app</Text>
          </Pressable>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

function LimitCard({ item, colors, styles, usedMs, onChange, onRemove }) {
  const summary = usageSummary(item.limitMinutes, usedMs);
  const subtitle = summary.blocked
    ? `Blocked for today · ${formatSpent(summary.usedMs)} used`
    : `${formatRemainingClock(summary.remainingMs)} left · ${formatSpent(summary.usedMs)} used`;
  return (
    <View style={styles.card}>
      <View style={styles.limitHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.label.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.limitCopy}>
          <Text style={styles.limitTitle} numberOfLines={1}>
            {item.label}
          </Text>
          <Text style={[styles.limitSub, summary.blocked && { color: colors.danger }]}>{subtitle}</Text>
        </View>
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(summary.fraction * 100)}%`,
              backgroundColor: summary.blocked || summary.fraction > 0.9 ? colors.danger : colors.gold,
            },
          ]}
        />
      </View>
      <View style={styles.stepper}>
        <Pressable
          style={styles.stepBtn}
          onPress={() => onChange(stepLimitMinutes(item.limitMinutes, -1))}
          accessibilityLabel={`Decrease ${item.label} by 5 minutes`}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <Text style={styles.stepValue}>{formatLimitMinutes(item.limitMinutes)}</Text>
        <Pressable
          style={styles.stepBtn}
          onPress={() => onChange(stepLimitMinutes(item.limitMinutes, 1))}
          accessibilityLabel={`Increase ${item.label} by 5 minutes`}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </Pressable>
      </View>
      <View style={styles.presets}>
        {LIMIT_PRESETS.map((minutes) => {
          const active = item.limitMinutes === minutes;
          return (
            <Pressable
              key={minutes}
              style={[styles.preset, active && styles.presetActive]}
              onPress={() => onChange(minutes)}
            >
              <Text style={[styles.presetText, active && styles.presetTextActive]}>{formatLimitMinutes(minutes)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function AccessRow({ styles, colors, title, detail, allowed, onPress, last }) {
  return (
    <Pressable style={[styles.row, last && styles.rowLast]} onPress={onPress}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={[styles.rowStatus, { color: allowed ? colors.success : colors.danger }]}>{allowed ? "Allowed" : "Fix"}</Text>
    </Pressable>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40 },
    loading: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
    sectionLabel: {
      color: colors.muted2,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 18,
      marginBottom: 22,
    },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 0 },
    hintTight: { marginBottom: 8 },
    note: { color: colors.gold, fontSize: 13, lineHeight: 19, marginTop: 14 },
    warning: { color: colors.gold, fontSize: 13, lineHeight: 19, marginTop: -6, marginBottom: 18 },
    saved: { color: colors.success, fontSize: 13, lineHeight: 19, marginTop: -6, marginBottom: 18 },
    error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 12 },
    saveBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 22 },
    saveBtnText: { color: "#1a1508", fontWeight: "700", fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    rowLast: { borderBottomWidth: 0, paddingBottom: 0 },
    rowBody: { flex: 1 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
    rowDetail: { color: colors.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
    rowStatus: { fontSize: 13, fontWeight: "700" },
    limitHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.line,
    },
    avatarText: { color: colors.gold, fontWeight: "700", fontSize: 15 },
    limitCopy: { flex: 1 },
    limitTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
    limitSub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
    remove: { color: colors.danger, fontSize: 13, fontWeight: "700" },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      marginTop: 14,
      overflow: "hidden",
    },
    fill: { height: 4, borderRadius: 2 },
    stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 16 },
    stepBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card2,
    },
    stepBtnText: { color: colors.text, fontSize: 22, fontWeight: "600", lineHeight: 24 },
    stepValue: { color: colors.gold, fontSize: 20, fontWeight: "700", minWidth: 88, textAlign: "center" },
    presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
    preset: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    presetActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    presetText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
    presetTextActive: { color: "#1a1508", fontWeight: "700" },
  });
}
