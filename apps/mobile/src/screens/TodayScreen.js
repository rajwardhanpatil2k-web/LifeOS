import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { completeItem, fetchToday, reorderItems, skipItem, toggleStep, undoItem, resumeFocus, extendFocus } from "../store";
import { FOCUS_DOMAINS, AI_COLOR } from "../theme";
import { useTheme } from "../hooks/useTheme";
import { useStaleFocusRefresh } from "../hooks/useStaleFocusRefresh";
import FocusMeter from "../components/FocusRing";
import DraggableList from "../components/DraggableList";
import AiTaskComposer from "../components/AiTaskComposer";
import { ensureRemindersReady } from "../reminderSync";
import { formatClock12, formatIsoClock12 } from "../formatTime";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOUBLE_TAP_MS = 350;

export default function TodayScreen({ navigation }) {
  const dispatch = useDispatch();
  const data = useSelector((s) => s.today.data);
  const loading = useSelector((s) => s.today.loading);
  const error = useSelector((s) => s.today.error);
  const focusBlock = data?.focusBlock;
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const { colors, domainMeta } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    ensureRemindersReady()
      .then(setRemindersEnabled)
      .catch(() => setRemindersEnabled(false));
  }, []);

  useEffect(() => {
    if (!navigation || data?.weekday == null) return;
    navigation.setOptions({ title: `Today: ${WEEKDAY_NAMES[data.weekday]}` });
  }, [navigation, data?.weekday]);

  const refreshToday = useCallback(() => dispatch(fetchToday()), [dispatch]);
  useStaleFocusRefresh(refreshToday, 45000);

  const onReorder = useCallback((order) => dispatch(reorderItems(order)), [dispatch]);
  const keyExtractor = useCallback((item) => item._id, []);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds([]);
      return !on;
    });
  }, []);

  const toggleSelected = useCallback((itemId) => {
    const id = String(itemId);
    setSelectedIds((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectMode(false);
  }, []);

  const renderItem = useCallback(
    ({ item, isDragging, dragHandleProps }) => (
      <ItemCard
        item={item}
        isDragging={isDragging}
        dragHandleProps={selectMode ? undefined : dragHandleProps}
        styles={styles}
        domainMeta={domainMeta}
        selectMode={selectMode}
        selected={selectedSet.has(String(item._id))}
        onToggleSelect={() => toggleSelected(item._id)}
      />
    ),
    [styles, domainMeta, selectMode, selectedSet, toggleSelected]
  );

  const focusStats = useMemo(() => {
    if (!data?.items) return { focusPct: 0, focusDone: 0, focusTotal: 0 };
    const focusItems = data.items.filter((i) => FOCUS_DOMAINS.includes(i.domain));
    const focusDone = focusItems.filter((i) => i.status === "done").length;
    const focusPct = focusItems.length ? Math.round((focusDone / focusItems.length) * 100) : 0;
    return { focusPct, focusDone, focusTotal: focusItems.length };
  }, [data?.items]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }
  if (error && !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!data) return null;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      removeClippedSubviews
    >
      <View style={styles.hero}>
        <FocusMeter pct={focusStats.focusPct} label={`${focusStats.focusDone}/${focusStats.focusTotal} of the 4`} />
        <View style={styles.heroBody}>
          <Text style={styles.heroKicker}>{data.next ? "Do this next" : "Focus"}</Text>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {data.next ? data.next.title : "Everything for today is done."}
          </Text>
          {data.next ? (
            <Text style={styles.heroMeta}>
              {formatClock12(data.next.scheduledAt)} · {domainMeta(data.next.domain).label}
            </Text>
          ) : null}
          <Text style={styles.heroDate}>
            {data.date} · {data.dayType}
          </Text>
        </View>
      </View>

      {!remindersEnabled ? (
        <Text style={styles.reminderWarning}>
          Reminders are off — enable notifications for Life OS in system settings to get alerts.
        </Text>
      ) : null}

      <Pressable style={styles.editScheduleBtn} onPress={() => navigation.navigate("EditSchedule")}>
        <Text style={styles.editScheduleBtnText}>Edit schedule & add tasks</Text>
        <Text style={styles.editScheduleBtnHint}>Adjust times · add extras for today</Text>
      </Pressable>
      <AiTaskComposer selectedIds={selectedIds} onConsumed={clearSelection} />
      {focusBlock?.active ? (
        <View style={styles.focusChip}>
          <View style={styles.focusChipCopy}>
            <Text style={styles.focusChipTitle}>Silent until {formatIsoClock12(focusBlock.until)}</Text>
            <Text style={styles.focusChipHint}>
              {focusBlock.reason ? `${focusBlock.reason} · ` : ""}alarms come back slot by slot
            </Text>
          </View>
          <Pressable style={styles.focusChipGhost} onPress={() => dispatch(extendFocus({ minutes: 30 }))}>
            <Text style={styles.focusChipGhostText}>+30 min</Text>
          </Pressable>
          <Pressable style={styles.focusChipPrimary} onPress={() => dispatch(resumeFocus())}>
            <Text style={styles.focusChipPrimaryText}>I'm back</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.sectionRow}>
        <Text style={styles.sectionLabel}>Today, in order</Text>
        <Pressable onPress={toggleSelectMode} hitSlop={8}>
          <Text style={styles.selectToggle}>{selectMode ? "Done" : "Select"}</Text>
        </Pressable>
      </View>
      <Text style={styles.dragHint}>
        {selectMode
          ? selectedIds.length
            ? `${selectedIds.length} selected · Ask AI why you're skipping them`
            : "Tap tasks to select, then Ask AI to skip them with a reason."
          : "Hold ⠿ to drag and reorder — times swap to match. Dashed = optional. Double-tap a step to undo the whole item."}
      </Text>
      <DraggableList
        items={data.items}
        keyExtractor={keyExtractor}
        onReorder={onReorder}
        renderItem={renderItem}
      />
    </ScrollView>
  );
}

const ItemCard = memo(function ItemCard({
  item,
  isDragging,
  dragHandleProps,
  styles,
  domainMeta,
  selectMode,
  selected,
  onToggleSelect,
}) {
  const dispatch = useDispatch();
  const meta = domainMeta(item.domain);
  const isOptional = item.alertLevel === "info";
  const isAi = item.source === "ai" || item.carryForward;
  const lastTapRef = useRef(0);

  const onStepPress = useCallback(
    (step) => {
      const now = Date.now();
      const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
      lastTapRef.current = now;
      if (isDoubleTap && item.status !== "pending") {
        lastTapRef.current = 0;
        dispatch(undoItem(item._id));
        return;
      }
      dispatch(toggleStep({ itemId: item._id, stepKey: step.key }));
    },
    [dispatch, item._id, item.status]
  );

  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: isAi ? AI_COLOR : meta.color },
        isOptional && styles.cardOptional,
        isAi && styles.cardAi,
        selected && styles.cardSelected,
        item.status !== "pending" && styles.faded,
        isDragging && styles.cardDragging,
      ]}
    >
      <View style={styles.cardHeadRow}>
        <View style={styles.badgeRow}>
          {selectMode && item.status === "pending" ? (
            <Pressable onPress={onToggleSelect} style={[styles.selectDot, selected && styles.selectDotOn]} hitSlop={8}>
              {selected ? <Text style={styles.selectDotCheck}>✓</Text> : null}
            </Pressable>
          ) : null}
          <View style={[styles.badge, { backgroundColor: (isAi ? AI_COLOR : meta.color) + "29" }]}>
            <Text style={[styles.badgeText, { color: isAi ? AI_COLOR : meta.color }]}>{meta.label}</Text>
          </View>
          {isOptional ? (
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeText}>Optional</Text>
            </View>
          ) : null}
          {isAi ? (
            <View style={styles.queueBadge}>
              <Text style={styles.queueBadgeText}>AI</Text>
            </View>
          ) : null}
          {item.locked || item.key === "tomorrow-prep" ? (
            <View style={styles.alwaysBadge}>
              <Text style={styles.alwaysBadgeText}>Always</Text>
            </View>
          ) : null}
        </View>
        {selectMode || !dragHandleProps ? null : (
          <View {...dragHandleProps} style={styles.dragHandle}>
            <Text style={styles.dragHandleText}>⠿</Text>
          </View>
        )}
      </View>
      <Pressable onPress={selectMode && item.status === "pending" ? onToggleSelect : undefined}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardTime}>
          {formatClock12(item.scheduledAt)} · {item.durationMin}m
        </Text>
      </Pressable>
      {(item.steps || []).map((step) => (
        <Pressable key={step.key} style={styles.stepRow} onPress={() => onStepPress(step)}>
          <View style={[styles.dot, step.done && styles.dotDone]}>
            {step.done ? <Text style={styles.dotCheck}>✓</Text> : null}
          </View>
          <Text style={[styles.step, step.done && styles.stepDone]}>{step.label}</Text>
        </Pressable>
      ))}
      {item.status === "pending" && !selectMode ? (
        <View style={styles.row}>
          <Pressable style={styles.btnDone} onPress={() => dispatch(completeItem(item._id))}>
            <Text style={styles.btnDoneText}>Mark done</Text>
          </Pressable>
          <Pressable style={styles.btnSkip} onPress={() => dispatch(skipItem(item._id))}>
            <Text style={styles.btnSkipText}>Skip</Text>
          </Pressable>
        </View>
      ) : item.status === "pending" ? null : (
        <View style={styles.row}>
          <Text style={[styles.statusTag, item.status === "done" ? styles.statusDone : styles.statusSkipped]}>
            {item.status === "skipped" && item.skippedReason ? `skipped · ${item.skippedReason}` : item.status}
          </Text>
          <Pressable style={styles.btnUndo} onPress={() => dispatch(undoItem(item._id))}>
            <Text style={styles.btnUndoText}>Undo</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
    error: { color: colors.danger, padding: 20, textAlign: "center" },

    hero: {
      flexDirection: "row",
      gap: 16,
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 20,
      padding: 18,
      marginBottom: 22,
      alignItems: "center",
    },
    heroBody: { flex: 1 },
    heroKicker: { color: colors.gold, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
    heroTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginBottom: 3 },
    heroMeta: { color: colors.muted, fontSize: 12.5 },
    heroDate: { color: colors.muted2, fontSize: 11, marginTop: 6 },

    reminderWarning: { color: colors.muted2, fontSize: 11.5, marginBottom: 14, fontStyle: "italic" },

    editScheduleBtn: {
      backgroundColor: colors.card2,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      padding: 14,
      marginBottom: 18,
    },
    editScheduleBtnText: { color: colors.gold, fontSize: 14, fontWeight: "700", marginBottom: 2 },
    editScheduleBtnHint: { color: colors.muted2, fontSize: 11.5 },

    focusChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(109,140,255,0.10)",
      borderWidth: 1,
      borderColor: "rgba(109,140,255,0.45)",
      borderRadius: 14,
      padding: 14,
      marginBottom: 18,
    },
    focusChipCopy: { flex: 1 },
    focusChipTitle: { color: "#6d8cff", fontSize: 14, fontWeight: "700", marginBottom: 2 },
    focusChipHint: { color: colors.muted2, fontSize: 11.5 },
    focusChipGhost: { paddingVertical: 8, paddingHorizontal: 8 },
    focusChipGhostText: { color: "#6d8cff", fontWeight: "700", fontSize: 12 },
    focusChipPrimary: { backgroundColor: "#6d8cff", borderRadius: 9, paddingVertical: 8, paddingHorizontal: 12 },
    focusChipPrimaryText: { color: "#0a0b12", fontWeight: "800", fontSize: 12 },

    sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
    sectionLabel: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
    selectToggle: { color: colors.gold, fontSize: 12, fontWeight: "700" },
    dragHint: { color: colors.muted2, fontSize: 10.5, fontStyle: "italic", marginBottom: 10 },
    cardSelected: { borderColor: "rgba(109,140,255,0.55)", backgroundColor: "rgba(109,140,255,0.08)" },
    selectDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: "rgba(109,140,255,0.7)",
      marginBottom: 6,
      alignItems: "center",
      justifyContent: "center",
    },
    selectDotOn: { backgroundColor: "#6d8cff", borderColor: "#6d8cff" },
    selectDotCheck: { color: "#0a0b12", fontSize: 11, fontWeight: "800" },

    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderLeftWidth: 3,
      borderRadius: 16,
      padding: 15,
      marginBottom: 12,
    },
    cardOptional: { borderStyle: "dashed", backgroundColor: colors.bgSoft },
    cardAi: {
      backgroundColor: "rgba(109,140,255,0.10)",
      borderColor: "rgba(109,140,255,0.45)",
    },
    cardDragging: { borderColor: colors.gold, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    faded: { opacity: 0.5 },
    cardHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    badgeRow: { flexDirection: "row", gap: 6, alignItems: "center" },
    badge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 },
    badgeText: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
    optionalBadge: { alignSelf: "flex-start", borderRadius: 6, borderWidth: 1, borderColor: colors.muted2, borderStyle: "dashed", paddingHorizontal: 6, paddingVertical: 2, marginBottom: 6 },
    optionalBadgeText: { fontSize: 9.5, fontWeight: "700", color: colors.muted2, textTransform: "uppercase", letterSpacing: 0.4 },
    queueBadge: {
      alignSelf: "flex-start",
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(109,140,255,0.5)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 6,
    },
    queueBadgeText: { fontSize: 9.5, fontWeight: "700", color: "#6d8cff", textTransform: "uppercase", letterSpacing: 0.4 },
    alwaysBadge: {
      alignSelf: "flex-start",
      borderRadius: 6,
      borderWidth: 1,
      borderColor: "rgba(232,185,74,0.55)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      marginBottom: 6,
    },
    alwaysBadgeText: { fontSize: 9.5, fontWeight: "700", color: colors.gold, textTransform: "uppercase", letterSpacing: 0.4 },
    dragHandle: { paddingHorizontal: 10, paddingVertical: 4, marginTop: -4 },
    dragHandleText: { color: colors.muted2, fontSize: 16, fontWeight: "700" },
    cardTitle: { color: colors.text, fontSize: 15.5, fontWeight: "600", marginBottom: 2 },
    cardTime: { color: colors.muted, fontSize: 12 },

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
  });
}
