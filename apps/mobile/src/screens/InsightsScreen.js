import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { fetchInsightReport, fetchInsights, setInsightDate, setInsightPeriod } from "../store";
import { useTheme } from "../hooks/useTheme";
import { useStaleFocusRefresh } from "../hooks/useStaleFocusRefresh";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function shiftDate(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pctText(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

export default function InsightsScreen() {
  const dispatch = useDispatch();
  const { period, date, stats, report, loading, reportLoading, error, aiEnabled } = useSelector(
    (s) => s.insights
  );
  const { colors, domainMeta } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const refreshInsights = useCallback(async () => {
    await dispatch(fetchInsights({ period, date }));
  }, [dispatch, period, date]);

  const refreshReport = useCallback(async () => {
    if (report) return;
    await dispatch(fetchInsightReport({ period, date }));
  }, [dispatch, period, date, report]);

  useEffect(() => {
    dispatch(fetchInsights({ period, date }));
    if (!report) dispatch(fetchInsightReport({ period, date }));
  }, [dispatch, period, date]);

  useStaleFocusRefresh(refreshInsights, 90000, Boolean(stats));
  useStaleFocusRefresh(refreshReport, 300000, Boolean(stats) && !report);

  const goPeriod = (delta) => {
    if (!stats) return;
    const target = delta < 0 ? shiftDate(stats.start, -1) : shiftDate(stats.end, 1);
    if (delta > 0 && target > localToday()) return;
    dispatch(setInsightDate(target));
  };

  const atLatest = !stats || stats.end >= localToday();

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ padding: 16, paddingBottom: 44 }}>
      <View style={styles.toggle}>
        {["week", "month"].map((option) => (
          <Pressable
            key={option}
            style={[styles.toggleBtn, period === option && styles.toggleBtnActive]}
            onPress={() => dispatch(setInsightPeriod(option))}
          >
            <Text style={[styles.toggleText, period === option && styles.toggleTextActive]}>
              {option === "week" ? "Week" : "Month"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.navRow}>
        <Pressable style={styles.navBtn} onPress={() => goPeriod(-1)} hitSlop={8}>
          <Text style={styles.navBtnText}>‹</Text>
        </Pressable>
        <View style={styles.periodLabelWrap}>
          <Text style={styles.periodLabel}>{stats ? stats.label : "Loading…"}</Text>
          {!atLatest ? (
            <Pressable onPress={() => dispatch(setInsightDate(null))} hitSlop={6}>
              <Text style={styles.nowBtnText}>Jump to now</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.navBtn, atLatest && styles.navBtnDisabled]}
          disabled={atLatest}
          onPress={() => goPeriod(1)}
          hitSlop={8}
        >
          <Text style={styles.navBtnText}>›</Text>
        </Pressable>
      </View>

      {loading && !stats ? <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {stats && stats.daysTracked === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Nothing tracked in {stats.label}</Text>
          <Text style={styles.hint}>
            Once you start checking items off in the Today tab, this screen fills in with adherence,
            streaks, the routines you keep dropping, and a written review of the period.
          </Text>
        </View>
      ) : null}

      {stats && stats.daysTracked > 0 ? (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Adherence on finished days</Text>
            <Text style={styles.heroValue}>{pctText(stats.settled.adherence)}</Text>
            <Text style={styles.heroSub}>
              {stats.settled.completed} of {stats.settled.total} tasks · {stats.daysSettled} day
              {stats.daysSettled === 1 ? "" : "s"} counted
            </Text>
            <View style={styles.heroTrack}>
              <View style={[styles.heroFill, { width: `${stats.settled.adherence || 0}%` }]} />
            </View>
            <View style={styles.tileRow}>
              <Tile
                styles={styles}
                label="Streak"
                value={`${stats.streaks.current}d`}
                sub={`best ${stats.streaks.longest}d`}
              />
              <Tile
                styles={styles}
                label={`Days ≥${stats.streaks.threshold}%`}
                value={`${stats.streaks.greenDays}`}
                sub={`of ${stats.streaks.settledDays}`}
              />
              <Tile
                styles={styles}
                label="Skipped"
                value={`${stats.totals.skipped}`}
                sub={`${stats.totals.pending} untouched`}
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Coach review</Text>
          <View style={styles.card}>
            {reportLoading && !report ? (
              <View style={styles.reportLoading}>
                <ActivityIndicator color={colors.gold} />
                <Text style={styles.hintTight}>Reading your {period}…</Text>
              </View>
            ) : report ? (
              <>
                <Text style={styles.verdict}>{report.verdict}</Text>
                <Text style={styles.summary}>{report.summary}</Text>

                {report.wins?.length ? (
                  <ReportList styles={styles} title="Working" items={report.wins} tone="success" />
                ) : null}
                {report.leaks?.length ? (
                  <ReportList styles={styles} title="Leaking" items={report.leaks} tone="danger" />
                ) : null}
                {report.actions?.length ? (
                  <ReportList styles={styles} title="Do next" items={report.actions} tone="gold" />
                ) : null}

                <View style={styles.reportFoot}>
                  <Text style={styles.footNote}>
                    {report.aiUnavailable
                      ? aiEnabled
                        ? "AI unreachable — showing raw numbers."
                        : "No OpenAI key configured."
                      : report.stale
                      ? "Showing last saved review."
                      : report.cached
                      ? "Saved review."
                      : "Fresh review."}
                  </Text>
                  <Pressable
                    style={styles.refreshBtn}
                    disabled={reportLoading}
                    onPress={() => dispatch(fetchInsightReport({ period, date, refresh: true }))}
                  >
                    <Text style={styles.refreshText}>
                      {reportLoading ? "Rewriting…" : "Rewrite"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={styles.hint}>No review yet.</Text>
            )}
          </View>

          {stats.momentum.delta !== null || stats.punctuality.avgLateMin !== null ? (
            <>
              <Text style={styles.sectionLabel}>Trend & timing</Text>
              <View style={styles.card}>
                {stats.momentum.delta !== null ? (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Momentum</Text>
                    <Text style={styles.rowValue}>
                      {pctText(stats.momentum.firstHalfAdherence)} →{" "}
                      {pctText(stats.momentum.secondHalfAdherence)}
                      <Text
                        style={[
                          styles.delta,
                          stats.momentum.delta > 0 && { color: colors.success },
                          stats.momentum.delta < 0 && { color: colors.danger },
                        ]}
                      >
                        {"  "}
                        {stats.momentum.delta > 0 ? "+" : ""}
                        {stats.momentum.delta}
                      </Text>
                    </Text>
                  </View>
                ) : null}
                {stats.punctuality.avgLateMin !== null ? (
                  <>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Average delay</Text>
                      <Text style={styles.rowValue}>
                        {stats.punctuality.avgLateMin > 0
                          ? `${stats.punctuality.avgLateMin} min late`
                          : `${Math.abs(stats.punctuality.avgLateMin)} min early`}
                      </Text>
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.rowLabel}>Within 15 min of plan</Text>
                      <Text style={styles.rowValue}>{pctText(stats.punctuality.onTimeRate)}</Text>
                    </View>
                  </>
                ) : null}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>By area</Text>
          <View style={styles.card}>
            {stats.byDomain.map((entry) => {
              const meta = domainMeta(entry.domain);
              return (
                <View key={entry.domain} style={styles.barRow}>
                  <View style={styles.barHead}>
                    <Text style={styles.barLabel}>{meta.label}</Text>
                    <Text style={styles.barValue}>
                      {pctText(entry.adherence)}
                      <Text style={styles.barCount}>
                        {"  "}
                        {entry.done}/{entry.total}
                      </Text>
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${entry.adherence || 0}%`, backgroundColor: meta.color },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>By weekday</Text>
          <View style={styles.card}>
            <Text style={styles.hintTight}>
              Where the week actually breaks down. Lowest day is marked.
            </Text>
            {(() => {
              const rated = stats.byWeekday.filter((w) => w.adherence !== null);
              const worst = rated.length
                ? rated.reduce((a, b) => (b.adherence < a.adherence ? b : a))
                : null;
              return stats.byWeekday.map((entry) => {
                const isWorst = worst && entry.weekday === worst.weekday && rated.length > 1;
                return (
                  <View key={entry.weekday} style={styles.barRow}>
                    <View style={styles.barHead}>
                      <Text style={styles.barLabel}>
                        {WEEKDAY_SHORT[entry.weekday]}
                        {isWorst ? <Text style={styles.worstTag}>  weakest</Text> : null}
                      </Text>
                      <Text style={styles.barValue}>{pctText(entry.adherence)}</Text>
                    </View>
                    <View style={styles.track}>
                      <View
                        style={[
                          styles.fill,
                          { width: `${entry.adherence || 0}%` },
                          isWorst && { backgroundColor: colors.danger },
                        ]}
                      />
                    </View>
                  </View>
                );
              });
            })()}
          </View>

          <Text style={styles.sectionLabel}>Day by day</Text>
          <View style={styles.card}>
            <View style={styles.spark}>
              {stats.timeline.map((day) => (
                <View key={day.date} style={styles.sparkCol}>
                  <View style={styles.sparkTrack}>
                    <View
                      style={[
                        styles.sparkFill,
                        { height: `${Math.max(day.adherence || 0, 2)}%` },
                        day.isToday && { backgroundColor: colors.success },
                        (day.adherence || 0) < 50 && !day.isToday && { backgroundColor: colors.danger },
                      ]}
                    />
                  </View>
                  <Text style={styles.sparkLabel}>{day.date.slice(-2)}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.sectionLabel}>Weakest routines</Text>
          <View style={styles.card}>
            {stats.items.slice(0, 8).map((item) => {
              const meta = domainMeta(item.domain);
              return (
                <View key={item.key} style={styles.itemRow}>
                  <View style={[styles.itemDot, { backgroundColor: meta.color }]} />
                  <View style={styles.itemBody}>
                    <Text style={styles.itemTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.itemMeta}>
                      done {item.done}/{item.total}
                      {item.skipped ? ` · skipped ${item.skipped}` : ""}
                      {item.avgLateMin !== null ? ` · ${item.avgLateMin} min late` : ""}
                    </Text>
                  </View>
                  <Text style={styles.itemPct}>{pctText(item.adherence)}</Text>
                </View>
              );
            })}
          </View>

          {stats.skipReasons.length ? (
            <>
              <Text style={styles.sectionLabel}>Why you skipped</Text>
              <View style={styles.card}>
                {stats.skipReasons.map((entry) => (
                  <View key={entry.reason} style={styles.row}>
                    <Text style={styles.rowLabel}>{entry.reason}</Text>
                    <Text style={styles.rowValue}>×{entry.count}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Tile({ styles, label, value, sub }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileSub}>{sub}</Text>
    </View>
  );
}

function ReportList({ styles, title, items, tone }) {
  return (
    <View style={styles.reportBlock}>
      <Text style={[styles.reportTitle, styles[`tone_${tone}`]]}>{title}</Text>
      {items.map((line, idx) => (
        <View key={`${title}-${idx}`} style={styles.bulletRow}>
          <View style={[styles.bullet, styles[`bullet_${tone}`]]} />
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    sectionLabel: {
      color: colors.muted2,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 10,
    },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      padding: 16,
      marginBottom: 22,
    },
    hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    hintTight: { color: colors.muted2, fontSize: 12, lineHeight: 17, marginBottom: 12 },
    error: { color: colors.danger, fontSize: 12.5, textAlign: "center", marginVertical: 14 },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginBottom: 8 },

    toggle: { flexDirection: "row", gap: 10, marginBottom: 14 },
    toggleBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 11,
      alignItems: "center",
    },
    toggleBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
    toggleText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
    toggleTextActive: { color: "#1a1508", fontWeight: "700" },

    navRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    navBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: "center",
      justifyContent: "center",
    },
    navBtnDisabled: { opacity: 0.3 },
    navBtnText: { color: colors.text, fontSize: 18, lineHeight: 20, fontWeight: "600" },
    periodLabelWrap: { alignItems: "center", gap: 3 },
    periodLabel: { color: colors.text, fontSize: 15, fontWeight: "700" },
    nowBtnText: { color: colors.gold, fontSize: 10.5, fontWeight: "700" },

    heroCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      padding: 18,
      marginBottom: 22,
    },
    heroLabel: {
      color: colors.muted2,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    heroValue: { color: colors.text, fontSize: 40, fontWeight: "800", marginTop: 4 },
    heroSub: { color: colors.muted, fontSize: 12.5, marginTop: 2 },
    heroTrack: {
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.line,
      overflow: "hidden",
      marginTop: 14,
    },
    heroFill: { height: "100%", backgroundColor: colors.gold, borderRadius: 4 },
    tileRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    tile: {
      flex: 1,
      backgroundColor: colors.card2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    tileValue: { color: colors.text, fontSize: 19, fontWeight: "800" },
    tileLabel: { color: colors.muted, fontSize: 10.5, marginTop: 3 },
    tileSub: { color: colors.muted2, fontSize: 10, marginTop: 1 },

    reportLoading: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
    verdict: { color: colors.gold, fontSize: 15.5, fontWeight: "700", lineHeight: 21 },
    summary: { color: colors.text, fontSize: 13.5, lineHeight: 20, marginTop: 10 },
    reportBlock: { marginTop: 16 },
    reportTitle: {
      fontSize: 10.5,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.7,
      marginBottom: 7,
    },
    tone_success: { color: colors.success },
    tone_danger: { color: colors.danger },
    tone_gold: { color: colors.gold },
    bulletRow: { flexDirection: "row", gap: 9, marginBottom: 6, alignItems: "flex-start" },
    bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6.5 },
    bullet_success: { backgroundColor: colors.success },
    bullet_danger: { backgroundColor: colors.danger },
    bullet_gold: { backgroundColor: colors.gold },
    bulletText: { color: colors.muted, fontSize: 13, lineHeight: 19, flex: 1 },
    reportFoot: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 18,
      paddingTop: 13,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    footNote: { color: colors.muted2, fontSize: 11 },
    refreshBtn: {
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    refreshText: { color: colors.muted, fontSize: 11.5, fontWeight: "600" },

    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 7,
    },
    rowLabel: { color: colors.muted, fontSize: 13, flex: 1, textTransform: "capitalize" },
    rowValue: { color: colors.text, fontSize: 13, fontWeight: "600" },
    delta: { fontSize: 12, fontWeight: "700" },

    barRow: { marginBottom: 13 },
    barHead: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginBottom: 6,
    },
    barLabel: { color: colors.text, fontSize: 13, fontWeight: "600" },
    barValue: { color: colors.text, fontSize: 12.5, fontWeight: "700" },
    barCount: { color: colors.muted2, fontSize: 11, fontWeight: "400" },
    worstTag: { color: colors.danger, fontSize: 10, fontWeight: "700" },
    track: { height: 6, borderRadius: 4, backgroundColor: colors.line, overflow: "hidden" },
    fill: { height: "100%", backgroundColor: colors.gold, borderRadius: 4 },

    spark: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 96 },
    sparkCol: { flex: 1, alignItems: "center" },
    sparkTrack: {
      width: "100%",
      height: 74,
      backgroundColor: colors.line,
      borderRadius: 3,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    sparkFill: { width: "100%", backgroundColor: colors.gold, borderRadius: 3 },
    sparkLabel: { color: colors.muted2, fontSize: 8.5, marginTop: 4 },

    itemRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    itemDot: { width: 7, height: 7, borderRadius: 4 },
    itemBody: { flex: 1 },
    itemTitle: { color: colors.text, fontSize: 13, fontWeight: "600" },
    itemMeta: { color: colors.muted2, fontSize: 11, marginTop: 2 },
    itemPct: { color: colors.text, fontSize: 13, fontWeight: "700" },
  });
}
