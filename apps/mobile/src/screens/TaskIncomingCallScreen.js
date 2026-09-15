import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { colors, domainMeta } from "../theme";
import { completeItem, fetchToday, markItemReady, remindLaterItem, snoozeItem } from "../store";
import {
  cancelSpeakPrompt,
  clearTaskCallOverride,
  setTaskCallUiVisible,
  silenceTaskAlert,
  snoozeTaskCall,
  speakTaskPrompt,
  startTaskCallListening,
  stopTaskAlert,
  stopTaskCallListening,
  subscribeTaskCallSpeech,
} from "../taskAlerts";
import { END_FOLLOWUP_MIN, START_SNOOZE_MIN } from "../taskCallConfig";
import { formatClock12 } from "../formatTime";
import { resolveCallDelay } from "../taskCallPlanner";
import {
  composeCompletePrompt,
  composeReadyPrompt,
  interpretCallReplies,
  interpretDeferMinutes,
} from "../voiceAgent";

function truthyParam(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export default function TaskIncomingCallScreen({ navigation, route }) {
  const dispatch = useDispatch();
  const params = route.params || {};
  const itemId = params.itemId ? String(params.itemId) : "";
  const phase = params.phase === "end" ? "end" : "start";
  const todayItems = useSelector((s) => s.today.data?.items || []);
  const item = todayItems.find((row) =>
    String(row._id) === itemId || row.originKey === itemId || row.key === itemId
  );
  const title = item?.title || params.title || "Task";
  const domain = item?.domain || params.domain || "";
  const scheduledAt = item?.scheduledAt || "";
  const durationMin = Number(item?.durationMin || params.durationMin) || 0;
  const accent = domainMeta(domain).color;
  const isPreview = !itemId || itemId === "preview";

  const [stage, setStage] = useState(truthyParam(params.pickedUp) ? "confirm" : "ringing");
  const [heard, setHeard] = useState("");
  const [busy, setBusy] = useState(false);
  const [voicePhase, setVoicePhase] = useState("idle");
  const finished = useRef(false);
  const sessionRef = useRef(0);
  const promptRef = useRef("");
  const voicePhaseRef = useRef(voicePhase);
  voicePhaseRef.current = voicePhase;
  const listenTimer = useRef(null);
  const confirmStarted = useRef(false);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const hangUp = useCallback(() => {
    sessionRef.current += 1;
    stopTaskCallListening().catch(() => {});
    cancelSpeakPrompt().catch(() => {});
    setVoicePhase("idle");
    if (finished.current) return;
    finished.current = true;
    const goMain = () => {
      if (goMain.done) return;
      goMain.done = true;
      try {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      } catch (_e) {
        if (navigation.canGoBack()) navigation.goBack();
      }
    };
    stopTaskAlert().catch(() => {}).finally(goMain);
    setTimeout(goMain, 900);
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setTaskCallUiVisible(true).catch(() => {});
    const sub = AppState.addEventListener("change", (next) => {
      if (finished.current) return;
      if (next === "active") setTaskCallUiVisible(true).catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!item) return;
    if (item.status === "done" || item.status === "skipped") hangUp();
  }, [item, hangUp]);

  useEffect(() => {
    return () => {
      if (listenTimer.current) clearTimeout(listenTimer.current);
      stopTaskCallListening().catch(() => {});
    };
  }, []);

  const beginListening = useCallback(async (session) => {
    if (finished.current || session !== sessionRef.current) return;
    if (stageRef.current !== "confirm") return;
    setHeard("");
    setVoicePhase("listening");
    try {
      await startTaskCallListening();
    } catch (_e) {
      listenTimer.current = setTimeout(() => {
        if (!finished.current && stageRef.current === "confirm") beginListening(sessionRef.current);
      }, 900);
    }
  }, []);

  useEffect(() => {
    if (stage !== "confirm") return undefined;
    if (confirmStarted.current) return undefined;
    confirmStarted.current = true;
    const session = sessionRef.current;
    const prompt = phase === "end" ? composeCompletePrompt({ title }) : composeReadyPrompt({ title });
    promptRef.current = prompt;
    setHeard("");
    setVoicePhase("speaking");
    (async () => {
      await silenceTaskAlert().catch(() => {});
      if (finished.current || session !== sessionRef.current) return;
      await speakTaskPrompt(prompt).catch(() => {});
      if (finished.current || session !== sessionRef.current) return;
      await new Promise((resolve) => {
        listenTimer.current = setTimeout(resolve, 1100);
      });
      if (finished.current || session !== sessionRef.current) return;
      await beginListening(session);
    })();
    // Speak/listen once per pickup. Re-running when today data refreshes
    // cancels TTS and leaves the call silent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beginListening, stage]);

  const enterConfirm = useCallback(() => {
    if (finished.current) return;
    silenceTaskAlert().catch(() => {});
    if (stageRef.current === "confirm") return;
    stageRef.current = "confirm";
    setStage("confirm");
  }, []);

  useEffect(() => {
    if (truthyParam(params.pickedUp)) enterConfirm();
  }, [enterConfirm, params.pickedUp]);

  const rejectCall = useCallback(async (overrideMinutes) => {
    if (finished.current) return;
    setBusy(true);
    const requested = Number(overrideMinutes) > 0
      ? Number(overrideMinutes)
      : phase === "end"
        ? END_FOLLOWUP_MIN
        : START_SNOOZE_MIN;
    const resolved = resolveCallDelay(todayItems, { itemId, minutes: requested });
    const minutes = resolved.minutes;
    const payload = item || { _id: itemId, title, domain, durationMin, alertLevel: params.alertLevel };
    snoozeTaskCall(payload, { phase, minutes, items: todayItems }).catch(() => {});
    if (!isPreview && itemId) {
      try {
        if (phase === "end") await dispatch(remindLaterItem({ itemId, minutes })).unwrap();
        else await dispatch(snoozeItem({ itemId, minutes })).unwrap();
      } catch (_e) {}
    }
    hangUp();
  }, [dispatch, domain, durationMin, hangUp, item, itemId, isPreview, params.alertLevel, phase, title, todayItems]);

  const acceptReady = useCallback(async () => {
    if (finished.current) return;
    setBusy(true);
    if (!isPreview && itemId) {
      try {
        await dispatch(markItemReady(itemId)).unwrap();
        await clearTaskCallOverride(itemId);
      } catch (_e) {}
    }
    hangUp();
  }, [dispatch, hangUp, itemId, isPreview]);

  const acceptComplete = useCallback(async () => {
    if (finished.current) return;
    setBusy(true);
    if (!isPreview && itemId) {
      try {
        await dispatch(completeItem({ itemId, source: "task_call" })).unwrap();
        await clearTaskCallOverride(itemId);
        dispatch(fetchToday());
      } catch (_e) {}
    }
    hangUp();
  }, [dispatch, hangUp, itemId, isPreview]);

  useEffect(() => {
    return subscribeTaskCallSpeech((event) => {
      if (stageRef.current !== "confirm" || finished.current) return;
      if (event?.type === "ready") {
        setVoicePhase("listening");
        return;
      }
      const text = event?.text || "";
      const alternatives = Array.isArray(event?.alternatives) ? event.alternatives : [];
      if (event?.type === "partial" || event?.type === "result") setHeard(text);
      if (event?.type === "error") {
        if (voicePhaseRef.current === "speaking") return;
        listenTimer.current = setTimeout(() => {
          if (!finished.current && stageRef.current === "confirm") beginListening(sessionRef.current);
        }, 800);
        return;
      }
      if (event?.type !== "result") return;
      if (voicePhaseRef.current === "speaking") return;
      const meaning = interpretCallReplies(
        [text, ...alternatives],
        phase === "end" ? "complete" : "ready",
        promptRef.current
      );
      const deferMin = interpretDeferMinutes([text, ...alternatives].filter(Boolean).join(" "));
      if (meaning === "ready") acceptReady();
      else if (meaning === "snooze") rejectCall(deferMin || undefined);
      else if (meaning === "complete") acceptComplete();
      else if (meaning === "remind") rejectCall(deferMin || undefined);
      else {
        listenTimer.current = setTimeout(() => {
          if (!finished.current && stageRef.current === "confirm") beginListening(sessionRef.current);
        }, 400);
      }
    });
  }, [acceptComplete, acceptReady, beginListening, busy, phase, rejectCall]);

  const subtitle = phase === "end"
    ? "Time's up — did you finish?"
    : "Incoming task call";
  const confirmTitle = phase === "end" ? "Is this task completed?" : "Are you ready?";
  const confirmHint = phase === "end"
    ? "Say “done”, or “remind me” to ring again in 15 minutes."
    : "Say “ready” to start, or “not now” to snooze 5 minutes.";

  return (
    <View style={styles.page}>
      <Text style={styles.kicker}>{phase === "end" ? "TASK CHECK-IN" : "INCOMING CALL"}</Text>
      <View style={[styles.avatar, { borderColor: accent }]}>
        <Ionicons name={phase === "end" ? "checkmark-done" : "call"} size={36} color={accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{stage === "confirm" ? confirmTitle : subtitle}</Text>
      <Text style={styles.meta}>
        {[formatClock12(scheduledAt), durationMin ? `${durationMin} min` : "", domainMeta(domain).label].filter(Boolean).join("  ·  ")}
      </Text>

      {stage === "confirm" ? (
        <>
          <Text style={styles.hint}>{confirmHint}</Text>
          {heard ? (
            <Text style={styles.heard}>“{heard}”</Text>
          ) : (
            <Text style={styles.listening}>
              {voicePhase === "speaking" ? "Speaking…" : voicePhase === "listening" ? "Listening…" : ""}
            </Text>
          )}
          <View style={styles.row}>
            <CallButton
              color={colors.danger}
              icon="time-outline"
              label={phase === "end" ? "Remind in 15m" : "Not now"}
              disabled={busy}
              onPress={() => rejectCall()}
            />
            <CallButton
              color={colors.success}
              icon={phase === "end" ? "checkmark" : "walk-outline"}
              label={phase === "end" ? "Completed" : "I'm ready"}
              disabled={busy}
              onPress={phase === "end" ? acceptComplete : acceptReady}
            />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <CallButton color={colors.danger} icon="call" iconStyle={styles.rejectIcon} label="Reject" disabled={busy} onPress={() => rejectCall()} />
          <CallButton color={colors.success} icon="call" label="Answer" disabled={busy} onPress={enterConfirm} />
        </View>
      )}
    </View>
  );
}

function CallButton({ color, icon, label, onPress, disabled, iconStyle }) {
  return (
    <Pressable
      style={styles.action}
      onPress={onPress}
      disabled={disabled}
      hitSlop={16}
    >
      <View style={[styles.actionCircle, { backgroundColor: color, opacity: disabled ? 0.55 : 1 }]}>
        <Ionicons name={icon} size={28} color="#0a0b0d" style={iconStyle} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#0c0e12",
    padding: 24,
    paddingTop: 72,
    alignItems: "center",
  },
  kicker: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 28,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#15181e",
    marginBottom: 20,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    color: "#d7b48a",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 10,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    marginBottom: 36,
  },
  hint: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  listening: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 28,
  },
  heard: {
    color: colors.text,
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 28,
    textAlign: "center",
  },
  row: {
    marginTop: "auto",
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 36,
  },
  action: { alignItems: "center", minWidth: 110 },
  actionCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  rejectIcon: { transform: [{ rotate: "135deg" }] },
  actionLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
