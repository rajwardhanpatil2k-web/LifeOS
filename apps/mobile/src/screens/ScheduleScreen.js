import { useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useDispatch } from "react-redux";
import { useTheme } from "../hooks/useTheme";
import { api } from "../api";
import { fetchToday, fetchWeek } from "../store";

export default function ScheduleScreen() {
  const dispatch = useDispatch();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function exportSchedule() {
    setBusy(true);
    setErrors([]);
    setMessage("");
    try {
      const file = await api("/api/schedule");
      const text = JSON.stringify(file, null, 2);
      setDraft(text);
      await Share.share({ message: text });
    } catch (err) {
      if (err?.message !== "User did not share") setMessage(err.message || "Could not export the schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function importSchedule() {
    setBusy(true);
    setErrors([]);
    setMessage("");
    try {
      const body = JSON.parse(draft);
      const result = await api("/api/schedule/import", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setMessage(`Saved. ${result.days} days updated, including ${result.plansUpdated} open day${result.plansUpdated === 1 ? "" : "s"}.`);
      dispatch(fetchToday());
      dispatch(fetchWeek());
    } catch (err) {
      if (err instanceof SyntaxError) {
        setErrors(["That is not valid JSON. Use the exported file and change only the values."]);
      } else {
        const list = err.details && Array.isArray(err.details.errors) ? err.details.errors : [];
        setErrors(list.length ? list : [err.message || "Could not save the schedule."]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Export the week, edit the file, then paste it here and import. Finished tasks stay as they are.
        A problem in the file is listed below and nothing is saved until the file is valid.
      </Text>
      <Pressable style={styles.button} disabled={busy} onPress={exportSchedule}>
        <Text style={styles.buttonText}>{busy ? "Working…" : "Export the week"}</Text>
      </Pressable>
      <TextInput
        style={styles.input}
        multiline
        value={draft}
        onChangeText={setDraft}
        placeholder="Paste the schedule file here"
        placeholderTextColor={colors.muted2}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable style={[styles.button, !draft.trim() && styles.buttonOff]} disabled={busy || !draft.trim()} onPress={importSchedule}>
        <Text style={styles.buttonText}>Import and save</Text>
      </Pressable>
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {errors.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.err}>{line}</Text>
      ))}
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40 },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    button: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 14 },
    buttonOff: { opacity: 0.4 },
    buttonText: { color: "#1a1508", fontWeight: "700", fontSize: 14 },
    input: {
      minHeight: 220,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      fontSize: 12,
      marginBottom: 14,
      textAlignVertical: "top",
    },
    ok: { color: colors.success, fontSize: 13, lineHeight: 18, marginTop: 8 },
    err: { color: colors.danger, fontSize: 13, lineHeight: 18, marginTop: 8 },
  });
}
