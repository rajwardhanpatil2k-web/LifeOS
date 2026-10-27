import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { useTheme } from "../hooks/useTheme";
import { clearWorkout, loadWorkoutPlan, respondSuggestion, saveWorkout } from "../workoutSlice";

function todayISO() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

export default function WorkoutScreen({ route }) {
  const { itemId, title, weekday, steps } = route.params || {};
  const dispatch = useDispatch();
  const { plan, loading, saving, error, result } = useSelector((state) => state.workout);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const stepList = Array.isArray(steps) ? steps.join(",") : "";
  const clientId = useRef(`${itemId || "workout"}-${Date.now()}`);
  const [painFlag, setPainFlag] = useState(null);
  const [soreness, setSoreness] = useState(0);
  const [sleepOk, setSleepOk] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    dispatch(loadWorkoutPlan({ weekday, steps: stepList ? stepList.split(",") : [] }));
    return () => {
      dispatch(clearWorkout());
    };
  }, [dispatch, weekday, stepList]);

  const ready = painFlag !== null && sleepOk !== null;

  function updateDraft(key, patch) {
    setDrafts((current) => ({ ...current, [key]: { reps: "", weight: "", rpe: "", ...(current[key] || {}), ...patch } }));
  }

  async function onSave() {
    if (!ready || saving) return;
    const sets = [];
    for (const exercise of plan?.exercises || []) {
      const draft = drafts[exercise.key];
      if (!draft || draft.reps === "" || draft.rpe === "") continue;
      sets.push({
        exerciseKey: exercise.key,
        reps: Number(draft.reps),
        weightKg: draft.weight === "" ? 0 : Number(draft.weight),
        rpe: Number(draft.rpe),
        isWarmup: false,
        painFlag: false,
      });
    }
    await dispatch(saveWorkout({
      date: todayISO(),
      planItemId: itemId,
      clientId: clientId.current,
      checkin: { painFlag, soreness0to4: soreness, sleepOk },
      sets,
    }));
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title || "Workout"}</Text>
      <Text style={styles.note}>{plan?.painLine}</Text>

      <Text style={styles.label}>Pain today</Text>
      <View style={styles.row}>
        <Pressable style={[styles.choice, painFlag === false && styles.choiceOn]} onPress={() => setPainFlag(false)}>
          <Text style={styles.choiceText}>No</Text>
        </Pressable>
        <Pressable style={[styles.choice, painFlag === true && styles.choiceOn]} onPress={() => setPainFlag(true)}>
          <Text style={styles.choiceText}>Yes</Text>
        </Pressable>
      </View>
      {painFlag ? <Text style={styles.note}>{plan?.painLine}</Text> : null}

      <Text style={styles.label}>Soreness, 0 to 4</Text>
      <View style={styles.row}>
        {[0, 1, 2, 3, 4].map((value) => (
          <Pressable key={value} style={[styles.choice, soreness === value && styles.choiceOn]} onPress={() => setSoreness(value)}>
            <Text style={styles.choiceText}>{value}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Slept okay</Text>
      <View style={styles.row}>
        <Pressable style={[styles.choice, sleepOk === true && styles.choiceOn]} onPress={() => setSleepOk(true)}>
          <Text style={styles.choiceText}>Yes</Text>
        </Pressable>
        <Pressable style={[styles.choice, sleepOk === false && styles.choiceOn]} onPress={() => setSleepOk(false)}>
          <Text style={styles.choiceText}>No</Text>
        </Pressable>
      </View>

      {loading ? <ActivityIndicator color={colors.gold} style={{ marginVertical: 16 }} /> : null}
      {(plan?.exercises || []).map((exercise) => {
        const draft = drafts[exercise.key] || {};
        const open = openKey === exercise.key;
        return (
          <View key={exercise.key} style={styles.card}>
            <Text style={styles.cardTitle}>{exercise.name}</Text>
            <Text style={styles.note}>{exercise.safetyNote}</Text>
            {exercise.last ? (
              <Text style={styles.meta}>
                Last time {exercise.last.date}: {exercise.last.weightKg ? `${exercise.last.weightKg} kg, ` : ""}
                {exercise.last.reps} reps, RPE {exercise.last.rpe}
              </Text>
            ) : (
              <Text style={styles.meta}>No earlier session for this exercise.</Text>
            )}
            {exercise.suggestion ? <Text style={styles.meta}>{exercise.suggestion.reason}</Text> : null}
            {exercise.restSec ? <Text style={styles.meta}>Rest about {Math.round(exercise.restSec / 60) || 1} min.</Text> : null}
            <Pressable onPress={() => setOpenKey(open ? "" : exercise.key)}>
              <Text style={styles.link}>{open ? "Hide why" : "Why this?"}</Text>
            </Pressable>
            {open ? (
              <View>
                {exercise.why ? <Text style={styles.meta}>{exercise.why}</Text> : null}
                {(exercise.cues || []).map((cue) => (
                  <Text key={cue} style={styles.meta}>{cue}</Text>
                ))}
                {(exercise.mistakes || []).map((line) => (
                  <Text key={line} style={styles.meta}>{line}</Text>
                ))}
                {exercise.substitutes?.length ? (
                  <Text style={styles.meta}>Option, your choice: {exercise.substitutes.join(" or ")}. The planned exercise stays.</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.row}>
              <TextInput style={styles.input} keyboardType="number-pad" placeholder="Reps" placeholderTextColor={colors.muted2} value={draft.reps || ""} onChangeText={(reps) => updateDraft(exercise.key, { reps })} />
              <TextInput style={styles.input} keyboardType="decimal-pad" placeholder="Kg" placeholderTextColor={colors.muted2} value={draft.weight || ""} onChangeText={(weight) => updateDraft(exercise.key, { weight })} />
              <TextInput style={styles.input} keyboardType="number-pad" placeholder="RPE" placeholderTextColor={colors.muted2} value={draft.rpe || ""} onChangeText={(rpe) => updateDraft(exercise.key, { rpe })} />
            </View>
          </View>
        );
      })}

      {plan?.fatigue ? <Text style={styles.note}>{plan.fatigue.reason}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result?.warnings?.map((line) => (
        <Text key={line} style={styles.note}>{line}</Text>
      ))}
      {result?.painLine ? <Text style={styles.note}>{result.painLine}</Text> : null}
      {(result?.suggestions || []).map((suggestion) => (
        <View key={suggestion._id} style={styles.card}>
          <Text style={styles.meta}>{suggestion.reason}</Text>
          <View style={styles.row}>
            <Pressable style={styles.choice} onPress={() => dispatch(respondSuggestion({ id: suggestion._id, action: "accept" }))}>
              <Text style={styles.choiceText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.choice} onPress={() => dispatch(respondSuggestion({ id: suggestion._id, action: "dismiss" }))}>
              <Text style={styles.choiceText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ))}
      {result?.queued ? (
        <Text style={styles.meta}>Saved on this phone. It will send when you’re back online.</Text>
      ) : null}
      {result?.planChanged === false && !result?.queued ? (
        <Text style={styles.meta}>Saved. Today’s plan is unchanged.</Text>
      ) : null}

      <Pressable style={[styles.save, (!ready || saving) && styles.saveOff]} onPress={onSave} disabled={!ready || saving}>
        <Text style={styles.saveText}>{saving ? "Saving" : result ? "Saved" : "Save session"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    content: { padding: 16, paddingBottom: 40 },
    title: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
    label: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 14, marginBottom: 8 },
    note: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
    meta: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
    link: { color: colors.gold, fontSize: 13, fontWeight: "700", marginTop: 8 },
    row: { flexDirection: "row", gap: 8, marginTop: 8 },
    choice: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
    choiceOn: { borderColor: colors.gold },
    choiceText: { color: colors.text, fontWeight: "600" },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 12, marginTop: 14 },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
    input: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 9, color: colors.text, paddingHorizontal: 10, paddingVertical: 8 },
    error: { color: colors.danger, marginTop: 12 },
    save: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 18 },
    saveOff: { opacity: 0.45 },
    saveText: { color: "#1a1508", fontWeight: "700" },
  });
}
