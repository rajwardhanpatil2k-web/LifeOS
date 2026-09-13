import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { addTodayItem, removeTodayItem, updateItemSchedule } from "../store";
import { SCHEDULE_DOMAINS } from "../theme";
import { useTheme } from "../hooks/useTheme";
import TimeStepper from "../components/TimeStepper";

export default function EditScheduleScreen() {
  const dispatch = useDispatch();
  const { data, loading } = useSelector((s) => s.today);
  const { colors, domainMeta } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [draftTimes, setDraftTimes] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime] = useState("12:00");
  const [newDomain, setNewDomain] = useState("ops");
  const [wheelActive, setWheelActive] = useState(false);
  const [newDuration, setNewDuration] = useState("30");

  const items = useMemo(() => {
    if (!data?.items) return [];
    return [...data.items].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [data?.items]);

  useEffect(() => {
    const next = {};
    for (const item of items) next[item._id] = item.scheduledAt;
    setDraftTimes(next);
  }, [items]);

  const saveTime = useCallback(
    async (itemId, scheduledAt) => {
      const item = items.find((i) => i._id === itemId);
      if (!item || item.scheduledAt === scheduledAt) return;
      setSavingId(itemId);
      try {
        await dispatch(updateItemSchedule({ itemId, scheduledAt })).unwrap();
      } catch (err) {
        Alert.alert("Could not save time", err.message || "Try again.");
        setDraftTimes((prev) => ({ ...prev, [itemId]: item.scheduledAt }));
      } finally {
        setSavingId(null);
      }
    },
    [dispatch, items]
  );

  const onTimeChange = (itemId, scheduledAt) => {
    setDraftTimes((prev) => ({ ...prev, [itemId]: scheduledAt }));
    saveTime(itemId, scheduledAt);
  };

  const onAddTask = async () => {
    const title = newTitle.trim();
    if (!title) {
      Alert.alert("Add a title", "What is this task?");
      return;
    }
    const durationMin = Number(newDuration);
    setAdding(true);
    try {
      await dispatch(
        addTodayItem({
          title,
          scheduledAt: newTime,
          domain: newDomain,
          durationMin: Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 30,
        })
      ).unwrap();
      setNewTitle("");
      setNewTime("12:00");
      setNewDomain("ops");
      setNewDuration("30");
    } catch (err) {
      Alert.alert("Could not add task", err.message || "Try again.");
    } finally {
      setAdding(false);
    }
  };

  const onRemove = (item) => {
    Alert.alert("Remove task?", item.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => dispatch(removeTodayItem(item._id)).catch(() => {}),
      },
    ]);
  };

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      scrollEnabled={!wheelActive}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={styles.hint}>
        Adjust each task's time for today. Scroll a wheel to move fast — minutes are 1-minute steps, so 2:47 is a quick flick. Changes save as you set them. Add one-off extras at the bottom.
      </Text>

      <Text style={styles.sectionLabel}>Today's tasks</Text>
      {items.map((item) => {
        const meta = domainMeta(item.domain);
        const isCustom = String(item.key || "").startsWith("custom-") || item.source === "ai";
        const pinned = item.locked || item.key === "tomorrow-prep";
        const locked = item.status !== "pending";
        return (
          <View key={item._id} style={[styles.rowCard, locked && styles.rowCardLocked]}>
            <View style={styles.rowMain}>
              <View style={styles.rowHead}>
                <View style={[styles.badge, { backgroundColor: meta.color + "29" }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
                {pinned ? <Text style={styles.pinnedTag}>Always</Text> : null}
                {locked ? <Text style={styles.statusTag}>{item.status}</Text> : null}
                {isCustom && !pinned ? (
                  <Pressable onPress={() => onRemove(item)} hitSlop={8}>
                    <Text style={styles.removeBtn}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.rowMeta}>
                {item.durationMin}m{pinned ? " · time only" : ""}
              </Text>
            </View>
            <View style={styles.timeWrap}>
              {savingId === item._id ? (
                <ActivityIndicator color={colors.gold} size="small" style={{ marginTop: 12 }} />
              ) : (
                <TimeStepper
                  compact
                  value={draftTimes[item._id] || item.scheduledAt}
                  onScrollActive={setWheelActive}
                  onChange={(value) => {
                    if (locked) return;
                    onTimeChange(item._id, value);
                  }}
                />
              )}
            </View>
          </View>
        );
      })}

      <Text style={styles.sectionLabel}>Add extra task</Text>
      <View style={styles.addCard}>
        <TextInput
          style={styles.input}
          placeholder="Task name"
          placeholderTextColor={colors.muted2}
          value={newTitle}
          onChangeText={setNewTitle}
        />
        <View style={styles.addTimeRow}>
          <Text style={styles.addTimeLabel}>Time</Text>
          <TimeStepper compact value={newTime} onChange={setNewTime} onScrollActive={setWheelActive} />
        </View>
        <Text style={styles.addTimeLabel}>Category</Text>
        <View style={styles.domainRow}>
          {SCHEDULE_DOMAINS.map((d) => (
            <Pressable
              key={d.key}
              style={[styles.domainChip, newDomain === d.key && styles.domainChipActive]}
              onPress={() => setNewDomain(d.key)}
            >
              <Text style={[styles.domainChipText, newDomain === d.key && styles.domainChipTextActive]}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.addTimeLabel}>Duration (minutes)</Text>
        <TextInput
          style={styles.input}
          placeholder="30"
          placeholderTextColor={colors.muted2}
          keyboardType="number-pad"
          value={newDuration}
          onChangeText={setNewDuration}
        />
        <Pressable style={[styles.addBtn, adding && styles.addBtnDisabled]} disabled={adding} onPress={onAddTask}>
          <Text style={styles.addBtnText}>{adding ? "Adding…" : "Add to today"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 18 },
    sectionLabel: {
      color: colors.muted2,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 10,
      marginTop: 8,
    },
    rowCard: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
      alignItems: "flex-start",
    },
    rowCardLocked: { opacity: 0.55 },
    rowMain: { flex: 1, minWidth: 0 },
    rowHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" },
    badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    statusTag: { color: colors.muted2, fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
    pinnedTag: { color: colors.gold, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    removeBtn: { color: colors.danger, fontSize: 11, fontWeight: "700", marginLeft: "auto" },
    rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: "600", marginBottom: 2 },
    rowMeta: { color: colors.muted, fontSize: 11.5 },
    timeWrap: { paddingTop: 2 },
    addCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
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
    addTimeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    addTimeLabel: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
    domainRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    domainChip: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    domainChipActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    domainChipText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
    domainChipTextActive: { color: "#1a1508", fontWeight: "700" },
    addBtn: { backgroundColor: colors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 4 },
    addBtnDisabled: { opacity: 0.5 },
    addBtnText: { color: "#1a1508", fontWeight: "700", fontSize: 14 },
  });
}
