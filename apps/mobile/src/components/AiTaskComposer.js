import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch } from "react-redux";
import { addVoiceTask, beginAiMute, endAiMute, fetchToday } from "../store";
import { isNetworkError } from "../api";
import { confirmShift, offerUndo } from "../shiftSlice";
import { clearTaskCallOverride } from "../taskAlerts";
import { AI_MUTE_RENEW_MS } from "../taskCallConfig";
import { formatClock12 } from "../formatTime";
import { useTheme } from "../hooks/useTheme";
import {
  armAlarmSession,
  startTaskCallListening,
  stopTaskCallListening,
  subscribeTaskCallSpeech,
} from "../taskAlerts";

const AI_COLOR = "#6d8cff";

export default function AiTaskComposer({ selectedIds = [], onConsumed }) {
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [pendingShift, setPendingShift] = useState(null);
  const adding = useRef(false);
  const submitRef = useRef(null);
  const closeTimer = useRef(null);
  const micOn = useRef(false);
  const spoken = useRef("");
  const selectedCount = selectedIds.length;

  const remember = useCallback((text) => {
    const next = String(text || "").trim();
    if (!next) return spoken.current;
    const prev = spoken.current.trim();
    const combined = !prev || next.startsWith(prev) ? next : `${prev} ${next}`;
    spoken.current = combined;
    setHeard(combined);
    return combined;
  }, []);

  const close = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    adding.current = false;
    micOn.current = false;
    spoken.current = "";
    stopTaskCallListening().catch(() => {});
    setOpen(false);
    setPhase("idle");
    setHeard("");
    setError("");
    setPreview(null);
    setPendingShift(null);
  }, []);

  const submit = useCallback(
    async (transcript) => {
      const text = String(transcript || "").trim();
      if (text.length < 3 || adding.current) return;
      adding.current = true;
      setPhase("saving");
      setError("");
      try {
        const result = await dispatch(addVoiceTask({ transcript: text, itemIds: selectedIds })).unwrap();
        setPreview(result.preview || result.parsed || result.item);
        if (result.intent === "ai_declined") {
          setError(result.error || "I can't advise on that.");
          setPhase("ai_declined");
          adding.current = false;
          return;
        }
        if (result.needsConfirm && result.shift?.token) {
          setPendingShift(result.shift);
          setPhase("confirm");
          adding.current = false;
          return;
        }
        if (result.intent === "shift_tasks" && Array.isArray(result.shifted)) {
          await Promise.all(result.shifted.map((row) => clearTaskCallOverride(row.id).catch(() => {})));
        }
        setPhase(result.intent || "done");
        if (result.intent === "skip_tasks") onConsumed?.();
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(close, 1400);
      } catch (err) {
        adding.current = false;
        setError(isNetworkError(err) ? "Cloud AI needs a network connection." : err.message || "I couldn't do that.");
        setPhase("error");
      }
    },
    [close, dispatch, onConsumed, selectedIds]
  );
  submitRef.current = submit;

  const listen = useCallback(async () => {
    setError("");
    setPhase("listening");
    micOn.current = true;
    try {
      // A finished task call leaves the native session "dismissed", which makes
      // the recognizer refuse to start and swallow every event. Re-arm first.
      await armAlarmSession().catch(() => {});
      const started = await startTaskCallListening();
      if (!micOn.current) return;
      // false = mic permission missing or recognizer unavailable. Don't leave
      // the sheet stuck on "Listening…" — fall back to typing.
      if (started === false) {
        micOn.current = false;
        setPhase("type");
      }
    } catch (_e) {
      micOn.current = false;
      setPhase("type");
    }
  }, []);

  const micOff = useCallback(async () => {
    micOn.current = false;
    await stopTaskCallListening().catch(() => {});
    const text = spoken.current.trim() || heard.trim();
    if (text.length < 3) {
      setPhase("ready");
      setError("I didn't catch enough. Turn the mic on and say the whole thing.");
      return;
    }
    submitRef.current?.(text);
  }, [heard]);

  useEffect(() => {
    if (!open) return undefined;
    // Task reminders stay quiet the whole time this sheet is open. The mic
    // stays off until the user turns it on, so a pause is not sent early.
    dispatch(beginAiMute());
    setPhase("ready");
    const renew = setInterval(() => dispatch(beginAiMute()), AI_MUTE_RENEW_MS);
    const unsub = subscribeTaskCallSpeech((event) => {
      if (adding.current || !micOn.current) return;
      const text = event?.text || "";
      if (event?.type === "partial" || event?.type === "result") remember(text);
      if (event?.type === "error") return;
      // The recognizer stops on its own after a pause. Keep it open so the
      // rest of the sentence is kept until Mic off.
      if (event?.type === "result" && micOn.current) {
        startTaskCallListening().catch(() => {});
      }
    });
    return () => {
      clearInterval(renew);
      unsub();
      micOn.current = false;
      stopTaskCallListening().catch(() => {});
      dispatch(endAiMute());
    };
  }, [dispatch, open, remember]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    []
  );

  useEffect(() => () => stopTaskCallListening().catch(() => {}), []);

  return (
    <>
      <Pressable style={styles.launch} onPress={() => setOpen(true)}>
        <Ionicons name="sparkles" size={16} color={AI_COLOR} />
        <View style={styles.launchCopy}>
          <Text style={styles.launchTitle}>Ask AI</Text>
          <Text style={styles.launchHint}>
            {selectedCount
              ? `Skip ${selectedCount} selected, skip the rest of today, or add a task`
              : "Add a task, pause alarms, skip today, or remind me later"}
          </Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetKicker}>AI</Text>
            <Text style={styles.sheetTitle}>
              {phase === "listening"
                ? "Mic is on"
                : phase === "ready"
                  ? "Mic is off"
                : phase === "saving"
                  ? "On it…"
                  : phase === "pause_focus" || phase === "extend_focus"
                    ? "Alarms paused"
                    : phase === "resume_focus"
                      ? "Alarms back on"
                      : phase === "defer_task"
                        ? "I'll alert you"
                        : phase === "confirm"
                        ? "Check this first"
                        : phase === "ai_declined"
                          ? "I can't advise on that"
                        : phase === "skip_tasks"
                          ? "Skipped"
                          : phase === "shift_tasks"
                            ? "Schedule updated"
                            : phase === "add_task" || phase === "done"
                              ? "Added for today"
                              : "What should I do?"}
            </Text>
            <Text style={styles.sheetHint}>
              {selectedCount
                ? `Say why you're skipping the ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} — festival, meeting, visiting work.`
                : "Turn the mic on, say the whole request, then turn it off. Task reminders stay quiet while this is open."}
            </Text>
            {heard ? <Text style={styles.heard}>“{heard}”</Text> : null}
            {preview ? (
              <Text style={styles.preview}>
                {preview.title}
                {preview.reason ? ` · ${preview.reason}` : ""}
                {!preview.reason && preview.scheduledAt && phase !== "pause_focus" && phase !== "extend_focus" && phase !== "resume_focus"
                  ? ` · ${formatClock12(preview.scheduledAt)}`
                  : ""}
              </Text>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {phase === "saving" ? <ActivityIndicator color={AI_COLOR} style={{ marginTop: 12 }} /> : null}

            {phase === "ready" || phase === "listening" || phase === "type" || phase === "error" ? (
              <TextInput
                style={styles.input}
                placeholder="Remind me to take the cream at 9:56"
                placeholderTextColor={colors.muted2}
                value={heard}
                onChangeText={(value) => {
                  spoken.current = value;
                  setHeard(value);
                }}
              />
            ) : null}

            <View style={styles.actions}>
              <Pressable style={styles.ghost} onPress={close}>
                <Text style={styles.ghostText}>Close</Text>
              </Pressable>
              {phase === "ready" || phase === "type" || phase === "error" ? (
                <Pressable style={styles.primary} onPress={listen}>
                  <Text style={styles.primaryText}>Mic on</Text>
                </Pressable>
              ) : null}
              {phase === "listening" ? (
                <Pressable style={styles.primary} onPress={micOff}>
                  <Text style={styles.primaryText}>Mic off</Text>
                </Pressable>
              ) : null}
              {phase === "ready" || phase === "type" || phase === "error" ? (
                <Pressable style={styles.secondary} onPress={() => submit(spoken.current || heard)}>
                  <Text style={styles.secondaryText}>Send</Text>
                </Pressable>
              ) : null}
              {phase === "confirm" ? (
                <Pressable
                  style={styles.primary}
                  onPress={async () => {
                    if (!pendingShift?.token || adding.current) return;
                    adding.current = true;
                    setPhase("saving");
                    try {
                      const applied = await dispatch(confirmShift(pendingShift.token)).unwrap();
                      const ids = (applied && pendingShift.changes) || [];
                      await Promise.all(ids.map((row) => clearTaskCallOverride(row.id).catch(() => {})));
                      dispatch(offerUndo({
                        shiftId: applied.shiftId,
                        until: new Date(applied.undoUntil).getTime(),
                      }));
                      await dispatch(fetchToday());
                      if (preview?.title?.startsWith("Skip")) onConsumed?.();
                      close();
                    } catch (err) {
                      adding.current = false;
                      setError(err.message || "Could not apply that.");
                      setPhase("confirm");
                    }
                  }}
                >
                  <Text style={styles.primaryText}>Confirm</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    launch: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: "rgba(109,140,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(109,140,255,0.45)",
      borderRadius: 14,
      padding: 14,
      marginBottom: 18,
    },
    launchCopy: { flex: 1 },
    launchTitle: { color: AI_COLOR, fontSize: 14, fontWeight: "700", marginBottom: 2 },
    launchHint: { color: colors.muted2, fontSize: 11.5 },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 20,
      paddingBottom: 32,
    },
    sheetKicker: { color: AI_COLOR, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 },
    sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 8 },
    sheetHint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 },
    heard: { color: colors.text, fontStyle: "italic", marginBottom: 8 },
    preview: { color: AI_COLOR, fontWeight: "700", marginBottom: 8 },
    error: { color: colors.danger, fontSize: 12.5, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      marginTop: 4,
    },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 18 },
    ghost: { paddingVertical: 10, paddingHorizontal: 12 },
    ghostText: { color: colors.muted, fontWeight: "600" },
    secondary: { paddingVertical: 10, paddingHorizontal: 12 },
    secondaryText: { color: AI_COLOR, fontWeight: "700" },
    primary: { backgroundColor: AI_COLOR, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
    primaryText: { color: "#0a0b12", fontWeight: "800" },
  });
}
