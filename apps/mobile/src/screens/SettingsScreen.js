import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { fetchSettings, fetchToday, updateSettings } from "../store";
import { deleteMyData, logout } from "../authSlice";
import { useTheme } from "../hooks/useTheme";
import TimeStepper from "../components/TimeStepper";
import {
  isWakeAlarmAvailable,
  ringNow,
  scheduleDailyWakeAlarm,
  getAlarmInfo,
  formatAlarmInfo,
  canScheduleExactAlarms,
} from "../wakeAlarm";
import { isVoiceAgentAvailable, speakNow, previewCue } from "../voiceAgent";
import { isTaskAlertsAvailable, testTaskAlert } from "../taskAlerts";
import { getApiUrl, saveApiUrl } from "../apiConfig";
import { api, testApiConnection } from "../api";
import { useStaleFocusRefresh } from "../hooks/useStaleFocusRefresh";

export default function SettingsScreen({ navigation }) {
  const dispatch = useDispatch();
  const { wakeTarget, homeTarget, prepTarget, themeMode, voiceAlerts, aiEnabled, name, loading, saving, error } = useSelector(
    (s) => s.settings
  );
  const nativeChecked = useRef(false);
  const todayItems = useSelector((s) => s.today.data?.items);
  const [wakeDraft, setWakeDraft] = useState(wakeTarget);
  const [homeDraft, setHomeDraft] = useState(homeTarget);
  const [prepDraft, setPrepDraft] = useState(prepTarget);
  const [savedMsg, setSavedMsg] = useState(false);
  const [nextAlarm, setNextAlarm] = useState(null);
  const [exactAlarms, setExactAlarms] = useState(true);
  const [wheelActive, setWheelActive] = useState(false);
  const [serverUrl, setServerUrl] = useState(getApiUrl());
  const [serverSaved, setServerSaved] = useState(false);
  const [serverSaving, setServerSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const refreshSettings = useCallback(async () => {
    await dispatch(fetchSettings());
    if (nativeChecked.current) return;
    nativeChecked.current = true;
    if (isWakeAlarmAvailable()) {
      getAlarmInfo()
        .then((info) => setNextAlarm(formatAlarmInfo(info)))
        .catch(() => setNextAlarm(null));
    }
    if (isWakeAlarmAvailable() || isTaskAlertsAvailable()) {
      canScheduleExactAlarms()
        .then(setExactAlarms)
        .catch(() => setExactAlarms(true));
    }
  }, [dispatch]);

  useStaleFocusRefresh(refreshSettings, 120000);

  useEffect(() => {
    setWakeDraft(wakeTarget);
  }, [wakeTarget]);

  useEffect(() => {
    setHomeDraft(homeTarget);
  }, [homeTarget]);

  useEffect(() => {
    setPrepDraft(prepTarget);
  }, [prepTarget]);

  const dirty = wakeDraft !== wakeTarget || homeDraft !== homeTarget || prepDraft !== prepTarget;

  const onSave = async () => {
    setSavedMsg(false);
    await dispatch(updateSettings({ wakeTarget: wakeDraft, homeTarget: homeDraft, prepTarget: prepDraft }));
    if (isWakeAlarmAvailable()) {
      await scheduleDailyWakeAlarm(wakeDraft).catch(() => -1);
      const info = await getAlarmInfo().catch(() => null);
      setNextAlarm(formatAlarmInfo(info));
      const exact = await canScheduleExactAlarms().catch(() => true);
      if (!exact) navigation.navigate("Permissions");
    }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  return (
    <ScrollView
      style={styles.page}
      scrollEnabled={!wheelActive}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>Switch between dark and light mode. Applies immediately, everywhere.</Text>
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, themeMode === "dark" && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ themeMode: "dark" }))}
          >
            <Text style={[styles.modeBtnText, themeMode === "dark" && styles.modeBtnTextActive]}>🌙 Dark</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, themeMode === "light" && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ themeMode: "light" }))}
          >
            <Text style={[styles.modeBtnText, themeMode === "light" && styles.modeBtnTextActive]}>☀️ Light</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Task alerts</Text>
      <Pressable
        style={styles.card}
        onLongPress={() => {
          if (isTaskAlertsAvailable()) testTaskAlert(todayItems, name).catch(() => {});
          else if (isVoiceAgentAvailable()) speakNow(previewCue(todayItems, name)).catch(() => {});
        }}
        delayLongPress={700}
      >
        <Text style={styles.hint}>
          When a task starts, Life OS rings like a call with Answer and Reject. Reject snoozes 5 minutes.
          Answer and say you're ready to start; at the end time it calls again to confirm you finished, or
          reminds you in 15 minutes. Long-press this card to test the full call now.
        </Text>
        {!isTaskAlertsAvailable() && !isVoiceAgentAvailable() ? (
          <Text style={styles.voiceNote}>
            Loud task alerts need a native rebuild of the Life OS dev client (not Expo Go alone).
          </Text>
        ) : null}
        {!exactAlarms && isWakeAlarmAvailable() ? (
          <Pressable onPress={() => navigation.navigate("Permissions")}>
            <Text style={styles.voiceNote}>
              Alarms & reminders permission is off — task alerts may be silent or late. Tap to fix →
            </Text>
          </Pressable>
        ) : null}
        <Text style={styles.addTimeLabel}>Voice narration</Text>
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, voiceAlerts && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ voiceAlerts: true }))}
          >
            <Text style={[styles.modeBtnText, voiceAlerts && styles.modeBtnTextActive]}>On</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, !voiceAlerts && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ voiceAlerts: false }))}
          >
            <Text style={[styles.modeBtnText, !voiceAlerts && styles.modeBtnTextActive]}>Off</Text>
          </Pressable>
        </View>
        <Text style={styles.addTimeLabel}>Cloud AI</Text>
        <Text style={styles.hint}>
          On, unclear requests can go to the model. Off, only clear local commands work: mute, shift, skip, add a task.
          Pain, injury, and supplement questions are declined either way.
        </Text>
        <View style={styles.modeToggle}>
          <Pressable
            style={[styles.modeBtn, aiEnabled !== false && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ aiEnabled: true }))}
          >
            <Text style={[styles.modeBtnText, aiEnabled !== false && styles.modeBtnTextActive]}>On</Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, aiEnabled === false && styles.modeBtnActive]}
            onPress={() => dispatch(updateSettings({ aiEnabled: false }))}
          >
            <Text style={[styles.modeBtnText, aiEnabled === false && styles.modeBtnTextActive]}>Off</Text>
          </Pressable>
        </View>
      </Pressable>

      <Text style={styles.sectionLabel}>Wake time</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Set the time you actually want to wake up. Morning items — workout, skin, breakfast — shift by the
          same amount around it.
        </Text>

        {loading && !wakeTarget ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.stepperWrap}>
            <TimeStepper value={wakeDraft} onChange={setWakeDraft} onScrollActive={setWheelActive} />
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>Home time (after office)</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Set the time you're actually home after office + commute. Evening walk, dinner and study shift with
          this instead of wake time. Study can compress earlier if it's tight, but your night skin/hair
          routine and sleep time never move.
        </Text>

        {loading && !homeTarget ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.stepperWrap}>
            <TimeStepper value={homeDraft} onChange={setHomeDraft} onScrollActive={setWheelActive} />
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>Tomorrow's food (evening)</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Every evening Life OS calls you with tomorrow's breakfast, fruit, and dinner list — oats, apple,
          banana, whatever is in season — so you can set it out tonight. This reminder stays on the plan.
          You can only change the time.
        </Text>

        {loading && !prepTarget ? (
          <ActivityIndicator color={colors.gold} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.stepperWrap}>
            <TimeStepper value={prepDraft} onChange={setPrepDraft} onScrollActive={setWheelActive} />
          </View>
        )}
      </View>

      <Pressable
        style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
        disabled={!dirty || saving}
        onPress={onSave}
      >
        <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save times"}</Text>
      </Pressable>

      {savedMsg ? (
        <Text style={styles.saved}>
          {nextAlarm ? `Saved — alarm armed for ${nextAlarm}.` : "Saved — today's schedule updated."}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>Permissions</Text>
      <Pressable style={styles.card} onPress={() => navigation.navigate("Permissions")}>
        <Text style={[styles.hint, { marginBottom: 8 }]}>
          Camera, notifications, exact alarms, and battery access. Grant these here if Android never asked.
        </Text>
        <Text style={styles.link}>Review permissions →</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Morning alarm</Text>
      <Pressable
        style={styles.card}
        onLongPress={() => {
          if (isWakeAlarmAvailable()) ringNow().catch(() => {});
        }}
        delayLongPress={700}
      >
        <Text style={[styles.hint, { marginBottom: nextAlarm ? 8 : 0 }]}>
          {isWakeAlarmAvailable()
            ? "The native scan-to-dismiss alarm follows the wake time above. Long-press this card to test it now."
            : "The native scan-to-dismiss alarm only runs in the custom dev-client build (not Expo Go)."}
        </Text>
        {nextAlarm ? <Text style={styles.link}>Armed for {nextAlarm}</Text> : null}
      </Pressable>

      <Text style={styles.sectionLabel}>Server</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Your Render backend URL. It must return JSON from /health — not a random website. Yours is
          https://lifeos-1vvx.onrender.com
        </Text>
        <Text style={styles.addTimeLabel}>Current: {getApiUrl()}</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://lifeos-1vvx.onrender.com"
          placeholderTextColor={colors.muted2}
          onChangeText={(value) => {
            setServerUrl(value);
            setServerError("");
          }}
        />
        <Pressable
          style={[styles.saveBtn, (serverSaving || !serverUrl.trim()) && styles.saveBtnDisabled]}
          disabled={serverSaving || !serverUrl.trim()}
          onPress={async () => {
            setServerSaving(true);
            setServerSaved(false);
            setServerError("");
            try {
              await testApiConnection(serverUrl);
              await saveApiUrl(serverUrl);
              await Promise.all([dispatch(fetchSettings()), dispatch(fetchToday())]);
              setServerSaved(true);
              setTimeout(() => setServerSaved(false), 2500);
            } catch (err) {
              setServerError(err.message || "Could not reach Life OS API.");
            } finally {
              setServerSaving(false);
            }
          }}
        >
          <Text style={styles.saveBtnText}>{serverSaving ? "Testing…" : "Test & save server"}</Text>
        </Pressable>
        {serverSaved ? <Text style={styles.saved}>Connected — using {getApiUrl()}.</Text> : null}
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      </View>

      <Text style={styles.sectionLabel}>Weekly schedule</Text>
      <Pressable style={styles.card} onPress={() => navigation.navigate("ScheduleFile")}>
        <Text style={styles.hint}>
          Download all seven days, change times and tasks in the file, then import it. The database updates from that file.
        </Text>
        <Text style={styles.link}>Edit the week from a file →</Text>
      </Pressable>

      <Text style={styles.sectionLabel}>Your data</Text>
      <View style={styles.card}>
        <Text style={styles.hint}>
          Download a copy of everything stored for this account. Password hashes and sign-in tokens are left out.
        </Text>
        <Pressable
          style={[styles.saveBtn, exporting && styles.saveBtnDisabled]}
          disabled={exporting}
          onPress={async () => {
            setExporting(true);
            setDeleteError("");
            try {
              const data = await api("/api/export");
              await Share.share({ message: JSON.stringify(data) });
            } catch (err) {
              if (err?.message && err.message !== "User did not share") setDeleteError(err.message);
            } finally {
              setExporting(false);
            }
          }}
        >
          <Text style={styles.saveBtnText}>{exporting ? "Preparing…" : "Export my data"}</Text>
        </Pressable>
        <Text style={styles.addTimeLabel}>Delete everything</Text>
        <Text style={styles.hint}>
          This removes the account, plans, logs, and sign-in sessions. Type your password and DELETE MY DATA.
        </Text>
        <TextInput
          style={styles.input}
          value={deletePassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Password"
          placeholderTextColor={colors.muted2}
          onChangeText={setDeletePassword}
        />
        <TextInput
          style={styles.input}
          value={deletePhrase}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE MY DATA"
          placeholderTextColor={colors.muted2}
          onChangeText={setDeletePhrase}
        />
        <Pressable
          style={[styles.saveBtn, deleting && styles.saveBtnDisabled]}
          disabled={deleting}
          onPress={async () => {
            setDeleting(true);
            setDeleteError("");
            try {
              await dispatch(deleteMyData({ password: deletePassword, phrase: deletePhrase })).unwrap();
            } catch (err) {
              setDeleteError(err.message || "Could not delete the data.");
              setDeleting(false);
            }
          }}
        >
          <Text style={styles.saveBtnText}>{deleting ? "Deleting…" : "Delete my data"}</Text>
        </Pressable>
        {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
      </View>

      <Pressable style={styles.card} onPress={() => dispatch(logout())}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
    </ScrollView>
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
    voiceNote: { color: colors.gold, fontSize: 12, lineHeight: 17, marginBottom: 14 },
    addTimeLabel: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
    stepperWrap: { alignItems: "center", marginBottom: 20 },
    saveBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 22 },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: { color: "#1a1508", fontWeight: "700", fontSize: 14 },
    saved: { color: colors.success, fontSize: 12.5, textAlign: "center", marginTop: 12, marginBottom: 12 },
    error: { color: colors.danger, fontSize: 12.5, textAlign: "center", marginTop: 12 },
    link: { color: colors.gold, fontSize: 13, fontWeight: "700" },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
      marginBottom: 14,
    },

    modeToggle: { flexDirection: "row", gap: 10 },
    modeBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: "center",
    },
    modeBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    modeBtnText: { color: colors.muted, fontWeight: "600", fontSize: 13.5 },
    modeBtnTextActive: { color: "#1a1508", fontWeight: "700" },
  });
}
