// Turns the deterministic numbers from insights.js into a written review,
// cached per period so reopening the tab costs nothing.
//
// The model is handed a compact digest of already-computed stats and told
// explicitly not to do arithmetic. Tone is "firm coach": name the actual leak,
// no vague encouragement, every action concrete enough to act on tomorrow.

const crypto = require("crypto");
const { InsightReport } = require("./models");
const { chatJson, isAiEnabled } = require("./ai");

const SYSTEM_PROMPT = `You are Raj's accountability coach inside Life OS, a personal life-tracking app.
He is working on four priorities: skin care, hair care, workout/fitness, and study (DSA + system design).

You will receive ALREADY-COMPUTED statistics. Rules:
- Never invent, recompute, or estimate a number. Only cite figures present in the input.
- Be direct and specific. Name the exact routine item that is leaking, not "consistency" in general.
- No therapy-speak, no empty praise, no exclamation marks. Talk like a coach who has seen the data.
- Wins: at most 3, only genuine ones backed by the numbers. If there are none, say so plainly in the
  summary and return an empty list.
- Leaks: at most 4 — the worst offenders only, each with the number that proves it. Do not list
  everything that is imperfect; rank by damage and stop.
- Actions: 2-4 concrete, small changes for the next period. Prefer shrinking a task over dropping it
  (e.g. "cut study to 15 focused minutes on Thursdays" beats "study more").
- verdict: one short blunt line, max 12 words, that he'll see at the top.
- Write in second person ("you"). Keep the summary under 90 words.`;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "wins", "leaks", "actions"],
  properties: {
    verdict: { type: "string" },
    summary: { type: "string" },
    wins: { type: "array", items: { type: "string" } },
    leaks: { type: "array", items: { type: "string" } },
    actions: { type: "array", items: { type: "string" } },
  },
};

function pct(value) {
  return value === null || value === undefined ? "no data" : `${value}%`;
}

function signed(value) {
  if (value === null || value === undefined) return "no data";
  return value > 0 ? `+${value}` : String(value);
}

// Compact, token-cheap rendering of the stats. Only the fields worth
// commenting on — the full payload still goes to the app for the charts.
function buildDigest(stats) {
  const lines = [];
  lines.push(`Period: ${stats.label} (${stats.period}), ${stats.start} to ${stats.end}`);
  lines.push(`Days tracked: ${stats.daysTracked} (${stats.daysSettled} finished)`);
  lines.push(`Adherence on finished days: ${pct(stats.settled.adherence)} (${stats.settled.completed}/${stats.settled.total} tasks)`);
  lines.push(`Skipped tasks: ${stats.totals.skipped}. Never touched: ${stats.totals.pending}`);
  lines.push(`Streak: ${stats.streaks.current} days now, best ${stats.streaks.longest}; ${stats.streaks.greenDays}/${stats.streaks.settledDays} days hit the ${stats.streaks.threshold}% bar`);

  if (stats.momentum.delta !== null) {
    lines.push(
      `Momentum: first half ${pct(stats.momentum.firstHalfAdherence)} vs second half ${pct(stats.momentum.secondHalfAdherence)} (${signed(stats.momentum.delta)} points)`
    );
  }

  if (stats.punctuality.avgLateMin !== null) {
    lines.push(
      `Punctuality: average ${stats.punctuality.avgLateMin} min vs scheduled time, ${pct(stats.punctuality.onTimeRate)} within 15 min (${stats.punctuality.measured} timed tasks)`
    );
  }

  if (stats.byDomain.length) {
    lines.push(
      "By area: " +
        stats.byDomain.map((d) => `${d.domain} ${pct(d.adherence)} (${d.done}/${d.total})`).join(", ")
    );
  }

  if (stats.byWeekday.length) {
    lines.push(
      "By weekday: " +
        stats.byWeekday.map((w) => `${w.name.slice(0, 3)} ${pct(w.adherence)}`).join(", ")
    );
  }

  const weakest = stats.items.filter((i) => i.adherence !== null && i.adherence < 100).slice(0, 8);
  if (weakest.length) {
    lines.push(
      "Weakest routines: " +
        weakest
          .map((i) => {
            const late = i.avgLateMin !== null ? `, avg ${i.avgLateMin} min late` : "";
            return `"${i.title}" ${pct(i.adherence)} (done ${i.done}/${i.total}, skipped ${i.skipped}${late})`;
          })
          .join("; ")
    );
  }

  const perfect = stats.items.filter((i) => i.adherence === 100 && i.total > 1);
  if (perfect.length) {
    lines.push(`Perfect routines: ${perfect.map((i) => `"${i.title}" (${i.done}/${i.total})`).join(", ")}`);
  }

  if (stats.skipReasons.length) {
    lines.push(
      "Reasons given when skipping: " +
        stats.skipReasons.map((s) => `"${s.reason}" x${s.count}`).join(", ")
    );
  }

  return lines.join("\n");
}

function hashDigest(digest) {
  return crypto.createHash("sha1").update(digest).digest("hex").slice(0, 16);
}

// Shown when there's genuinely nothing to review, or when OpenAI is
// unreachable — the screen still renders with real numbers either way.
function fallbackReport(stats, reason) {
  const adherence = stats.settled.adherence;
  if (!stats.daysTracked) {
    return {
      verdict: "No data for this period yet.",
      summary: "Nothing was tracked in this period, so there is nothing to review. Open the Today tab and start checking items off.",
      wins: [],
      leaks: [],
      actions: ["Track a full day end to end so the next report has something to work with."],
      cached: false,
      aiUnavailable: true,
      reason,
    };
  }
  const worst = stats.items.find((i) => i.adherence !== null && i.adherence < 100);
  return {
    verdict: adherence === null ? "Not enough finished days yet." : `${adherence}% adherence this ${stats.period}.`,
    summary: `${stats.settled.completed} of ${stats.settled.total} tasks done across ${stats.daysSettled} finished days. Current streak ${stats.streaks.current} days, best ${stats.streaks.longest}.`,
    wins: stats.items.filter((i) => i.adherence === 100 && i.total > 1).slice(0, 3).map((i) => `${i.title}: ${i.done}/${i.total}`),
    leaks: worst ? [`${worst.title}: done ${worst.done}/${worst.total}`] : [],
    actions: [],
    cached: false,
    aiUnavailable: true,
    reason,
  };
}

async function getInsightReport(user, stats, { refresh = false } = {}) {
  const digest = buildDigest(stats);
  const statsHash = hashDigest(digest);

  const existing = await InsightReport.findOne({
    userId: user._id,
    period: stats.period,
    periodKey: stats.periodKey,
  }).lean();

  if (existing && existing.statsHash === statsHash && !refresh) {
    return {
      verdict: existing.verdict,
      summary: existing.summary,
      wins: existing.wins,
      leaks: existing.leaks,
      actions: existing.actions,
      model: existing.model,
      generatedAt: existing.updatedAt,
      cached: true,
    };
  }

  if (!isAiEnabled()) {
    return fallbackReport(stats, "no_api_key");
  }

  const result = await chatJson({
    system: SYSTEM_PROMPT,
    user: `Write the ${stats.period === "month" ? "monthly" : "weekly"} review from these statistics:\n\n${digest}`,
    schema: REPORT_SCHEMA,
    schemaName: "insight_report",
    maxTokens: 800,
  });

  if (!result) {
    // Serve a stale-but-real report over a generated fallback if we have one.
    if (existing) {
      return {
        verdict: existing.verdict,
        summary: existing.summary,
        wins: existing.wins,
        leaks: existing.leaks,
        actions: existing.actions,
        model: existing.model,
        generatedAt: existing.updatedAt,
        cached: true,
        stale: true,
      };
    }
    return fallbackReport(stats, "openai_unavailable");
  }

  const saved = await InsightReport.findOneAndUpdate(
    { userId: user._id, period: stats.period, periodKey: stats.periodKey },
    {
      userId: user._id,
      period: stats.period,
      periodKey: stats.periodKey,
      statsHash,
      verdict: result.data.verdict,
      summary: result.data.summary,
      // Hard caps regardless of what the model returns — the cards are a
      // glance, not a wall of text.
      wins: (result.data.wins || []).slice(0, 3),
      leaks: (result.data.leaks || []).slice(0, 4),
      actions: (result.data.actions || []).slice(0, 4),
      model: result.model,
      usage: result.usage || {},
    },
    { upsert: true, new: true }
  ).lean();

  return {
    verdict: saved.verdict,
    summary: saved.summary,
    wins: saved.wins,
    leaks: saved.leaks,
    actions: saved.actions,
    model: saved.model,
    generatedAt: saved.updatedAt,
    cached: false,
  };
}

module.exports = { getInsightReport, buildDigest };
