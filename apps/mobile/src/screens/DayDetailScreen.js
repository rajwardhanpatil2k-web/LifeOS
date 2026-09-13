import { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { completeItem, fetchDay, skipItem, toggleStep, undoItem } from "../store";
import { useTheme } from "../hooks/useTheme";
import { formatClock12 } from "../formatTime";

const NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function DayDetailScreen({ route }) {
  const { date } = route.params;
  const dispatch = useDispatch();
  const { data, loading, error } = useSelector((s) => s.day);
  const { colors, domainMeta } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useFocusEffect(
    useCallback(() => {
      dispatch(fetchDay(date));
    }, [dispatch, date])
  );

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!data || data.date !== date) return null;

  const dayName = NAMES[data.weekday] || "";
  const pct = data.score?.total
    ? Math.round((data.score.completed / data.score.total) * 100)
    : null;

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={styles.header}>
        <Text style={styles.dayName}>{dayName}</Text>
        <Text style={styles.dateText}>{data.date}</Text>
        {data.isToday ? (
          <Text style={styles.tagToday}>Today</Text>
        ) : data.isPreview ? (
          <Text style={styles.tagPreview}>Preview — this day hasn't happened yet</Text>
        ) : pct !== null ? (
          <Text style={styles.tagPast}>{pct}% completed</Text>
        ) : null}
      </View>

      {data.items.map((item) => (
        <DayItem
          key={item._id || item.key}
          item={item}
          interactive={data.isToday}
          dispatch={dispatch}
          styles={styles}
          domainMeta={domainMeta}
        />
      ))}
    </ScrollView>
  );
}

function DayItem({ item, interactive, dispatch, styles, domainMeta }) {
  const meta = domainMeta(item.domain);
  const mark = item.status === "done" ? "✓ Done" : item.status === "skipped" ? "– Skipped" : null;
  return (
    <View style={[styles.card, { borderLeftColor: meta.color }, item.status !== "pending" && styles.faded]}>
      <View style={styles.topRow}>
        <Text style={styles.time}>{formatClock12(item.scheduledAt)}</Text>
        <View style={[styles.badge, { backgroundColor: meta.color + "29" }]}>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      <Text style={styles.title}>{item.title}</Text>

      {(item.steps || []).map((step) =>
        interactive ? (
          <Pressable
            key={step.key}
            style={styles.stepRow}
            onPress={() => dispatch(toggleStep({ itemId: item._id, stepKey: step.key }))}
          >
            <View style={[styles.dot, step.done && styles.dotDone]}>
              {step.done ? <Text style={styles.dotCheck}>✓</Text> : null}
            </View>
            <Text style={[styles.step, step.done && styles.stepDone]}>{step.label}</Text>
          </Pressable>
        ) : (
          <View key={step.key} style={styles.stepRow}>
            <View style={[styles.dot, step.done && styles.dotDone]}>
              {step.done ? <Text style={styles.dotCheck}>✓</Text> : null}
            </View>
            <Text style={[styles.step, step.done && styles.stepDone]}>{step.label}</Text>
          </View>
        )
      )}

      {interactive ? (
        item.status === "pending" ? (
          <View style={styles.row}>
            <Pressable style={styles.btnDone} onPress={() => dispatch(completeItem(item._id))}>
              <Text style={styles.btnDoneText}>Mark done</Text>
            </Pressable>
            <Pressable style={styles.btnSkip} onPress={() => dispatch(skipItem(item._id))}>
              <Text style={styles.btnSkipText}>Skip</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={[styles.statusTag, item.status === "done" ? styles.statusDone : styles.statusSkipped]}>
              {item.status}
            </Text>
            <Pressable style={styles.btnUndo} onPress={() => dispatch(undoItem(item._id))}>
              <Text style={styles.btnUndoText}>Undo</Text>
            </Pressable>
          </View>
        )
      ) : mark ? (
        <Text style={[styles.markText, item.status === "done" ? styles.statusDone : styles.statusSkipped]}>
          {mark}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
    error: { color: colors.danger, padding: 20, textAlign: "center" },

    header: { marginBottom: 18 },
    dayName: { color: colors.text, fontSize: 22, fontWeight: "800" },
    dateText: { color: colors.muted2, fontSize: 12.5, marginTop: 2 },
    tagToday: { color: colors.gold, fontSize: 12, fontWeight: "700", marginTop: 8 },
    tagPreview: { color: colors.muted, fontSize: 12, fontStyle: "italic", marginTop: 8 },
    tagPast: { color: colors.muted, fontSize: 12, marginTop: 8 },

    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 3,
      borderRadius: 16,
      padding: 15,
      marginBottom: 12,
    },
    faded: { opacity: 0.6 },
    topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    time: { color: colors.muted, fontSize: 12.5, fontWeight: "700" },
    badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    title: { color: colors.text, fontSize: 15.5, fontWeight: "600", marginBottom: 4 },

    stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 9 },
    dot: {
      width: 15,
      height: 15,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.muted2,
      marginTop: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dotDone: { backgroundColor: colors.success, borderColor: colors.success },
    dotCheck: { color: colors.bg, fontSize: 9, fontWeight: "700" },
    step: { color: colors.muted, fontSize: 13, flex: 1, lineHeight: 18 },
    stepDone: { color: colors.muted2, textDecorationLine: "line-through" },

    row: { flexDirection: "row", gap: 8, marginTop: 13, alignItems: "center", justifyContent: "space-between" },
    btnDone: { backgroundColor: colors.gold, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
    btnDoneText: { color: "#1a1508", fontWeight: "700", fontSize: 12.5 },
    btnSkip: { borderWidth: 1, borderColor: colors.line, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 },
    btnSkipText: { color: colors.muted, fontWeight: "600", fontSize: 12.5 },
    statusTag: { fontSize: 11, textTransform: "capitalize" },
    statusDone: { color: colors.success },
    statusSkipped: { color: colors.danger },
    btnUndo: { borderWidth: 1, borderColor: colors.line, borderStyle: "dashed", borderRadius: 9, paddingVertical: 6, paddingHorizontal: 12 },
    btnUndoText: { color: colors.muted, fontWeight: "600", fontSize: 11.5 },
    markText: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  });
}
