import { useCallback, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useDispatch, useSelector } from "react-redux";
import { fetchWeek } from "../store";
import { FOCUS_DOMAINS } from "../theme";
import { useTheme } from "../hooks/useTheme";

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WeekScreen({ navigation }) {
  const dispatch = useDispatch();
  const week = useSelector((s) => s.today.week);
  const { colors, domainMeta } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Refetch on every focus so switching tabs after midnight shows the new day.
  useFocusEffect(
    useCallback(() => {
      dispatch(fetchWeek());
    }, [dispatch])
  );

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.sectionLabel}>Last 7 days · tap a day to see the full schedule</Text>
      {(week?.days || []).map((day) => {
        const pct = day.itemCount ? Math.round((day.completed / day.itemCount) * 100) : 0;
        const byDomain = (day.score && day.score.byDomain) || {};
        return (
          <Pressable
            key={day.date}
            style={styles.card}
            onPress={() => navigation.navigate("DayDetail", { date: day.date })}
          >
            <View style={styles.top}>
              <View style={styles.dayLine}>
                <Text style={styles.day}>{NAMES[day.weekday]}</Text>
                <Text style={styles.date}>{day.date}</Text>
              </View>
              <Text style={styles.pct}>{pct}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.dots}>
              {FOCUS_DOMAINS.map((dom) => {
                const b = byDomain[dom];
                const filled = b && b.total > 0 && b.done >= b.total;
                const partial = b && b.done > 0 && !filled;
                const meta = domainMeta(dom);
                return (
                  <View key={dom} style={styles.dotWrap}>
                    <View
                      style={[
                        styles.dot,
                        filled && { backgroundColor: meta.color, borderColor: meta.color },
                        partial && { borderColor: meta.color },
                      ]}
                    />
                    <Text style={styles.dotLabel}>{meta.label}</Text>
                  </View>
                );
              })}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    sectionLabel: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 12 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 15, marginBottom: 10 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 },
    dayLine: { flexDirection: "row", alignItems: "baseline", gap: 6 },
    day: { color: colors.text, fontSize: 15, fontWeight: "700" },
    date: { color: colors.muted2, fontSize: 11 },
    pct: { color: colors.gold, fontSize: 13, fontWeight: "700" },
    track: { height: 6, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden", marginBottom: 10 },
    fill: { height: "100%", backgroundColor: colors.gold, borderRadius: 4 },
    dots: { flexDirection: "row", gap: 14 },
    dotWrap: { flexDirection: "row", alignItems: "center", gap: 5 },
    dot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.muted2 },
    dotLabel: { color: colors.muted2, fontSize: 10.5 },
  });
}
