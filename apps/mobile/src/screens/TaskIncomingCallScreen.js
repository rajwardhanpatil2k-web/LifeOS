import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch, useSelector } from "react-redux";
import { colors, domainMeta } from "../theme";
import { completeItem, markItemReady, remindLaterItem, snoozeItem } from "../store";
import {
  cancelSpeakPrompt,
  clearTaskCallOverride,
  isTaskCallRinging,
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
  const focusPaused = useSelector((s) => !!s.today.data?.focusBlock?.active);
  const item = todayItems.find((row) => String(row._id) === itemId);
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
  const listenTries = useRef(0);
  const stageRef = useRef(stage);
  const mountedAt = useRef(Date.now());
  stageRef.current = stage;

  const hangUp = useCallback(() => {
    sessionRef.current += 1;
    stopTaskCallListening().catch(() => {});
    cancelSpeakPrompt().catch(() => {});
    stopTaskAlert().catch(() => {});
    setTaskCallUiVisible(false).catch(() => {});
    setVoicePhase("idle");
    if (finished.current) return;
    finished.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  }, [navigation]);

  const leave = hangUp;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    setTaskCallUiVisible(true).catch(() => {});
    const sub = AppState.addEventListener("change", (next) => {
      if (finished.current) return;
      if (next === "active") setTaskCallUiVisible(true).catch(() => {});
      else if (stageRef.current === "ringing") setTaskCallUiVisible(false).catch(() => {});
    });
    return () => {
      sub.remove();
      if (!finished.current && stageRef.current === "ringing") {
        setTaskCallUiVisible(false).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (!item) return;
    if (item.status === "done" || item.status === "skipped") hangUp();
  }, [item, hangUp]);

  useEffect(() => {
    if (!focusPaused || finished.current) return;
    stopTaskAlert().catch(() => {});
    leave();
  }, [focusPaused, leave]);

  useEffect(() => {
    if (stage !== "ringing") return undefined;
    const interval = setInterval(async () => {
      try {
        if (Date.now() - mountedAt.current < 2500) return;
        if (!(await isTaskCallRinging()) && !finished.current && stageRef.current === "ringing") {
          if (focusPaused) {
            leave();
            return;
          }
          if (!isPreview && itemId) {
            try {
              if (phase === "end") dispatch(remindLaterItem({ itemId, minutes: END_FOLLOWUP_MIN }));
              else dispatch(snoozeItem({ itemId, minutes: START_SNOOZE_MIN }));
            } catch (_e) {
              // native already snoozed
            }
          }
          leave();
        }
      } catch (_e) {
        // native module missing in Expo Go
      }
    }, 900);
    return () => clearInterval(interval);
  }, [leave, stage, focusPaused, dispatch, itemId, isPreview, phase]);

  useEffect(() => {
    return () => {
      if (listenTimer.current) clearTimeout(listenTimer.current);
      stopTaskCallListening().catch(() => {});
    };
  }, []);

  const beginListening = useCallback(async (session) => {
    if (finished.current || session !== sessionRef.current) return;
    setHeard("");
    try {
      await startTaskCallListening();
    } catch (_e) {
      // buttons still work if the mic is denied
    }
  }, []);

  useEffect(() => {
    if (stage !== "confirm") return undefined;
    const session = sessionRef.current;
    let cancelled = false;
    stopTaskCallListening().catch(() => {});
    const prompt = phase === "end" ? composeCompletePrompt({ title }) : composeReadyPrompt({ title });
    promptRef.current = prompt;
    setHeard("");
    listenTries.current = 0;
    setVoicePhase("speaking");
    (async () => {
      await silenceTaskAlert().catch(() => {});
      if (cancelled || finished.current || session !== sessionRef.current) return;
      await speakTaskPrompt(prompt).catch(() => {});
      if (cancelled || finished.current || session !== sessionRef.current) return;
      await new Promise((resolve) => {
        listenTimer.current = setTimeout(resolve, 750);
      });
      if (cancelled || finished.current || session !== sessionRef.current) return;
      setVoicePhase("listening");
      await beginListening(session);
    })();
    return () => {
      cancelled = true;
      if (listenTimer.current) clearTimeout(listenTimer.current);
    };
  }, [beginListening, phase, stage, title]);

  const enterConfirm = useCallback(() => {
    if (finished.current || stageRef.current === "confirm") return;
    stageRef.current = "confirm";
    setStage("confirm");
    silenceTaskAlert().catch(() => {});
  }, []);

  const rejectCall = useCallback((overrideMinutes) => {
    if (busy || finished.current) return;
    setBusy(true);
    hangUp();
    const requested = Number(overrideMinutes) > 0
      ? Number(overrideMinutes)
      : phase === "end"
        ? END_FOLLOWUP_MIN
        : START_SNOOZE_MIN;
    const resolved = resolveCallDelay(todayItems, { itemId, minutes: requested });
    const minutes = resolved.minutes;
    const payload = item || { _id: itemId, title, domain, durationMin, alertLevel: params.alertLevel };
    snoozeTaskCall(payload, { phase, minutes, items: todayItems }).catch(() => {});
    if (isPreview) return;
    if (phase === "end") dispatch(remindLaterItem({ itemId, minutes }));
    else dispatch(snoozeItem({ itemId, minutes }));
  }, [busy, dispatch, domain, durationMin, hangUp, item, itemId, isPreview, params.alertLevel, phase, title, todayItems]);

  const acceptReady = useCallback(() => {
    if (busy || finished.current) return;
    setBusy(true);
    hangUp();
    if (isPreview) return;
    dispatch(markItemReady(itemId))
      .unwrap()
      .then(() => clearTaskCallOverride(itemId))
      .catch(() => {});
  }, [busy, dispatch, hangUp, itemId, isPreview]);

  const acceptComplete = useCallback(() => {
    if (busy || finished.current) return;
    setBusy(true);
    hangUp();
    if (isPreview) return;
    dispatch(completeItem({ itemId, source: "task_call" }))
      .unwrap()
      .then(() => clearTaskCallOverride(itemId))
      .catch(() => {});
  }, [busy, dispatch, hangUp, itemId, isPreview]);

  useEffect(() => {
    return subscribeTaskCallSpeech((event) => {
      if (stageRef.current !== "confirm" || busy || finished.current) return;
      if (event?.type === "ready") {
        setVoicePhase("listening");
        return;
      }
      const text = event?.text || "";
      const alternatives = Array.isArray(event?.alternatives) ? event.alternatives : [];
      if (event?.type === "partial" || event?.type === "result") setHeard(text);
      if (event?.type === "error") {
        if (voicePhaseRef.current === "speaking") return;
        if (listenTries.current >= 3) {
          setVoicePhase("idle");
          return;
        }
        listenTries.current += 1;
        listenTimer.current = setTimeout(() => {
          if (!finished.current && stageRef.current === "confirm") beginListening(sessionRef.current);
        }, 650);
        return;
      }
      if (event?.type !== "result") return;
      if (voicePhaseRef.current === "speaking") return;
      listenTries.current = 0;
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
    <Pressable style={styles.action} onPressIn={disabled ? undefined : onPress} disabled={disabled}>
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
