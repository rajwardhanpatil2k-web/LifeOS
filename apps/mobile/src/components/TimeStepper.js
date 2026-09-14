import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../hooks/useTheme";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const PERIODS = ["AM", "PM"];
const LOOPS = 3;

function parse(value) {
  const [h, m] = (value || "06:00").split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 6, m: Number.isFinite(m) ? m : 0 };
}

function format(h, m) {
  return `${String(wrap(h, 24)).padStart(2, "0")}:${String(wrap(m, 60)).padStart(2, "0")}`;
}

function wrap(n, max) {
  return ((n % max) + max) % max;
}

function hour12(h24) {
  return h24 % 12 || 12;
}

function to24(h12, period) {
  if (period === "AM") return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

function TimeStepper({ value, onChange, label, compact = false, onScrollActive }) {
  const { colors } = useTheme();
  const itemHeight = compact ? 26 : 36;
  const styles = useMemo(() => createStyles(colors, compact, itemHeight), [colors, compact, itemHeight]);
  const { h, m } = parse(value);
  const period = h >= 12 ? "PM" : "AM";

  const onHourChange = useCallback(
    (i) => onChange(format(to24(i + 1, period), m)),
    [onChange, period, m]
  );
  const onMinuteChange = useCallback((i) => onChange(format(h, i)), [onChange, h]);
  const onPeriodChange = useCallback(
    (i) => onChange(format(to24(hour12(h), PERIODS[i]), m)),
    [onChange, h, m]
  );

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Wheel
          items={HOURS}
          index={hour12(h) - 1}
          itemHeight={itemHeight}
          styles={styles}
          onScrollActive={onScrollActive}
          onChange={onHourChange}
        />
        <Text style={styles.colon}>:</Text>
        <Wheel
          items={MINUTES}
          index={m}
          itemHeight={itemHeight}
          styles={styles}
          onScrollActive={onScrollActive}
          onChange={onMinuteChange}
        />
        <Wheel
          items={PERIODS}
          index={period === "PM" ? 1 : 0}
          itemHeight={itemHeight}
          styles={styles}
          onScrollActive={onScrollActive}
          onChange={onPeriodChange}
        />
      </View>
    </View>
  );
}

export default memo(TimeStepper);

const Wheel = memo(function Wheel({ items, index, onChange, itemHeight, styles, onScrollActive }) {
  const ref = useRef(null);
  const count = items.length;
  const lastIndex = useRef(index);
  const ignoreSync = useRef(false);
  const ready = useRef(false);
  const data = useMemo(() => {
    const out = [];
    for (let i = 0; i < LOOPS; i += 1) out.push(...items);
    return out;
  }, [items]);

  const midLoop = Math.floor(LOOPS / 2);
  const yFor = useCallback((i) => (midLoop * count + i) * itemHeight, [count, itemHeight]);

  const scrollToIndex = useCallback(
    (i, animated) => {
      ref.current?.scrollTo({ y: yFor(i), animated });
    },
    [yFor]
  );

  useEffect(() => {
    if (ignoreSync.current) {
      ignoreSync.current = false;
      lastIndex.current = index;
      return;
    }
    lastIndex.current = index;
    if (ready.current) scrollToIndex(index, false);
  }, [index, scrollToIndex]);

  const indexFromY = useCallback(
    (y) => {
      const raw = Math.round(y / itemHeight);
      return ((raw % count) + count) % count;
    },
    [count, itemHeight]
  );

  const settle = useCallback(
    (y) => {
      const local = indexFromY(y);
      const target = yFor(local);
      if (Math.abs(y - target) > 1) {
        ref.current?.scrollTo({ y: target, animated: false });
      }
      if (local !== lastIndex.current) {
        lastIndex.current = local;
        ignoreSync.current = true;
        onChange(local);
      }
      onScrollActive?.(false);
    },
    [indexFromY, onChange, onScrollActive, yFor]
  );

  return (
    <View style={styles.col}>
      <View style={styles.wheel} collapsable={false}>
        <View pointerEvents="none" style={styles.selectionBand} />
        <ScrollView
          ref={ref}
          nestedScrollEnabled
          removeClippedSubviews
          showsVerticalScrollIndicator={false}
          snapToInterval={itemHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          scrollEventThrottle={32}
          onLayout={() => {
            if (!ready.current) {
              ready.current = true;
              scrollToIndex(index, false);
            }
          }}
          onScrollBeginDrag={() => onScrollActive?.(true)}
          onScrollEndDrag={(e) => {
            if (!e.nativeEvent.velocity || Math.abs(e.nativeEvent.velocity.y) < 0.05) {
              settle(e.nativeEvent.contentOffset.y);
            }
          }}
          onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        >
          <View style={{ height: itemHeight }} />
          {data.map((label, i) => (
            <View key={`${label}-${i}`} style={styles.wheelItem}>
              <Text style={styles.valueMuted}>{label}</Text>
            </View>
          ))}
          <View style={{ height: itemHeight }} />
        </ScrollView>
      </View>
    </View>
  );
});

function createStyles(colors, compact, itemHeight) {
  return StyleSheet.create({
    wrap: { alignItems: compact ? "flex-end" : "center" },
    label: { color: colors.muted2, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: compact ? 2 : 4 },
    col: { alignItems: "center", width: compact ? 44 : 64 },
    wheel: {
      height: itemHeight * 3,
      width: "100%",
      overflow: "hidden",
    },
    selectionBand: {
      position: "absolute",
      left: 0,
      right: 0,
      top: itemHeight,
      height: itemHeight,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.line,
      zIndex: 1,
    },
    wheelItem: {
      height: itemHeight,
      alignItems: "center",
      justifyContent: "center",
    },
    valueMuted: {
      color: colors.muted,
      fontSize: compact ? 16 : 24,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    colon: { color: colors.text, fontSize: compact ? 20 : 30, fontWeight: "800", marginHorizontal: compact ? 0 : 2 },
  });
}
