import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useDispatch } from "react-redux";
import { addVoiceTask } from "../store";
import { formatClock12 } from "../formatTime";
import { useTheme } from "../hooks/useTheme";
import {
  startTaskCallListening,
  stopTaskCallListening,
  subscribeTaskCallSpeech,
} from "../taskAlerts";

const AI_COLOR = "#6d8cff";

export default function AiTaskComposer() {
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [heard, setHeard] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const adding = useRef(false);
  const submitRef = useRef(null);

  const close = useCallback(() => {
    adding.current = false;
    stopTaskCallListening().catch(() => {});
    setOpen(false);
    setPhase("idle");
    setHeard("");
    setError("");
    setPreview(null);
  }, []);

  const submit = useCallback(
    async (transcript) => {
      const text = String(transcript || "").trim();
      if (text.length < 3 || adding.current) return;
      adding.current = true;
      setPhase("saving");
      setError("");
      try {
        const result = await dispatch(addVoiceTask(text)).unwrap();
        setPreview(result.preview || result.parsed || result.item);
        setPhase(result.intent || "done");
        setTimeout(close, 1400);
      } catch (err) {
        adding.current = false;
        setError(err.message || "I couldn't do that.");
        setPhase("error");
      }
    },
    [close, dispatch]
  );
  submitRef.current = submit;

  const listen = useCallback(async () => {
    setError("");
    setHeard("");
    setPhase("listening");
    try {
      await startTaskCallListening();
    } catch (_e) {
      setPhase("type");
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    listen();
    const unsub = subscribeTaskCallSpeech((event) => {
      if (adding.current) return;
      const text = event?.text || "";
      if (event?.type === "partial" || event?.type === "result") setHeard(text);
      if (event?.type === "error") {
        setPhase("type");
        return;
      }
      if (event?.type === "result" && text.trim()) submitRef.current?.(text);
    });
    return () => {
      unsub();
      stopTaskCallListening().catch(() => {});
    };
  }, [listen, open]);

  useEffect(() => () => stopTaskCallListening().catch(() => {}), []);

  return (
    <>
      <Pressable style={styles.launch} onPress={() => setOpen(true)}>
        <Ionicons name="sparkles" size={16} color={AI_COLOR} />
        <View style={styles.launchCopy}>
          <Text style={styles.launchTitle}>Ask AI</Text>
          <Text style={styles.launchHint}>Add a task, pause alarms, or remind me later</Text>
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetKicker}>AI</Text>
            <Text style={styles.sheetTitle}>
              {phase === "listening"
                ? "Listening…"
                : phase === "saving"
                  ? "On it…"
                  : phase === "pause_focus" || phase === "extend_focus"
                    ? "Alarms paused"
                    : phase === "resume_focus"
                      ? "Alarms back on"
                      : phase === "defer_task"
                        ? "I'll alert you"
                        : phase === "add_task" || phase === "done"
                          ? "Added for today"
                          : "What should I do?"}
            </Text>
            <Text style={styles.sheetHint}>
              Add a task, pause alarms while you’re out, or say “alert me after 30 minutes.” Missed slots come back one at a time.
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

            {phase === "type" || phase === "error" ? (
              <TextInput
                style={styles.input}
                placeholder="Don't disturb me for an hour, or laundry around 8 PM"
                placeholderTextColor={colors.muted2}
                value={heard}
                onChangeText={setHeard}
                autoFocus
              />
            ) : null}

            <View style={styles.actions}>
              <Pressable style={styles.ghost} onPress={close}>
                <Text style={styles.ghostText}>Close</Text>
              </Pressable>
              {phase === "listening" ? (
                <Pressable style={styles.secondary} onPress={() => setPhase("type")}>
                  <Text style={styles.secondaryText}>Type instead</Text>
                </Pressable>
              ) : null}
              {phase === "type" || phase === "error" ? (
                <Pressable style={styles.primary} onPress={() => submit(heard)}>
                  <Text style={styles.primaryText}>Send</Text>
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
