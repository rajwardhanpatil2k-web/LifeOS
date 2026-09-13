import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";

export default function FocusMeter({ pct, label = "of the 4, today" }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.wrap}>
      <Text style={styles.pct}>{clamped}%</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%` }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { minWidth: 78 },
    pct: { color: colors.text, fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    track: {
      height: 5,
      borderRadius: 4,
      backgroundColor: colors.line,
      marginTop: 6,
      overflow: "hidden",
    },
    fill: { height: "100%", backgroundColor: colors.gold, borderRadius: 4 },
    label: { color: colors.muted2, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 5 },
  });
}
