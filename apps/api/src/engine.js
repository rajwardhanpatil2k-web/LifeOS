const { toInstant, fromInstant } = require("./time");

const MAX_SHIFT_MIN = 12 * 60;
const DEFAULT_GAP_MIN = 5;

/**
 * @typedef {object} PlanItem
 * @property {string} id
 * @property {string} scheduledAt
 * @property {string} [plannedAt]
 * @property {number} [durationMin]
 * @property {number} [minDurationMin]
 * @property {string} [status]
 * @property {number|string|null} [startedAt]
 * @property {"fixed"|"soft"|"free"} [movable]
 * @property {string} [anchor]
 * @property {string} [alertLevel]
 * @property {string} [category]
 * @property {string} [title]
 * @property {{type: string, target: string, minGapMin?: number}[]} [deps]
 */

function clone(item) {
  return { ...item, deps: (item.deps || []).map((dep) => ({ ...dep })) };
}

function isFixed(item) {
  return item.movable === "fixed" || item.anchor === "fixed";
}

function isFinished(item) {
  return item.status === "done" || item.status === "skipped" || Boolean(item.startedAt);
}

function blocks(conflicts) {
  return conflicts.some((conflict) => conflict.severity === "block");
}

function conflict(severity, code, item, message) {
  return { severity, code, itemId: item?.id || "", message };
}

function place(item, date, tz) {
  const start = toInstant(date, item.scheduledAt, tz);
  const durationMin = Number(item.durationMin) || 0;
  return {
    ...clone(item),
    durationMin,
    start: start.instant,
    end: start.exists ? start.instant + durationMin * 60 * 1000 : null,
    exists: start.exists,
    dropped: false,
  };
}

function stamp(item, tz) {
  const local = fromInstant(item.start, tz);
  item.scheduledAt = local.hhmm;
  item.localDate = local.date;
  item.end = item.start + item.durationMin * 60 * 1000;
  return local;
}

function expandSelection(items, intent) {
  if (intent.scope === "selected" || intent.scope === "named") {
    const ids = new Set((intent.targetIds || []).map(String));
    let grew = true;
    while (grew) {
      grew = false;
      for (const item of items) {
        for (const dep of item.deps || []) {
          if (dep.type === "blocks") continue;
          if (!["before", "with", "after"].includes(dep.type)) continue;
          if (ids.has(String(item.id)) || ids.has(String(dep.target))) {
            if (!ids.has(String(item.id))) {
              ids.add(String(item.id));
              grew = true;
            }
            if (!ids.has(String(dep.target))) {
              ids.add(String(dep.target));
              grew = true;
            }
          }
        }
      }
    }
    return ids;
  }
  return new Set(items.map((item) => String(item.id)));
}

function violationPairs(list) {
  const pairs = new Set();
  for (const item of list) {
    for (const dep of item.deps || []) {
      if (dep.type !== "blocks") continue;
      const target = list.find((other) => String(other.id) === String(dep.target));
      if (target && target.start >= item.start) pairs.add(`${item.id}->${target.id}`);
    }
  }
  return pairs;
}

function empty(items, conflicts, options = []) {
  return {
    ok: false,
    changes: [],
    conflicts,
    dropped: [],
    options,
    preview: { items: items.map(clone) },
  };
}

function changesOf(original, proposal) {
  const changes = [];
  for (const next of proposal) {
    const prev = original.find((item) => String(item.id) === String(next.id));
    if (!prev || next.dropped) continue;
    if (prev.scheduledAt === next.scheduledAt && (prev.durationMin || 0) === next.durationMin) continue;
    changes.push({
      id: next.id,
      from: prev.scheduledAt,
      to: next.scheduledAt,
      fromDuration: prev.durationMin || 0,
      durationMin: next.durationMin,
    });
  }
  return changes;
}

/**
 * Pure. No database, no Date.now(), no randomness.
 * @param {PlanItem[]} items
 * @param {{type?: string, scope?: string, offsetMin?: number, targetIds?: string[], resolution?: string, at?: string}} intent
 * @param {{now: number, tz: string, date: string, bedAt: number, windDownMin?: number, gapMin?: number}} ctx
 */
function plan(items, intent, ctx) {
  const tz = ctx.tz;
  const date = ctx.date;
  const gapMs = (ctx.gapMin == null ? DEFAULT_GAP_MIN : ctx.gapMin) * 60 * 1000;
  const cutoff = ctx.bedAt - (ctx.windDownMin || 0) * 60 * 1000;
  const kind = intent?.type || "shift";

  if (kind === "pause" || kind === "resume" || kind === "extend") {
    return { ok: true, changes: [], conflicts: [], dropped: [], options: [], preview: { items: items.map(clone) } };
  }

  const offset = Number(intent?.offsetMin);
  if (kind === "shift" && (!Number.isFinite(offset) || offset === 0 || Math.abs(offset) > MAX_SHIFT_MIN)) {
    return empty(items, [conflict("block", "rejected", null, "Shift must be between 1 minute and 12 hours.")]);
  }

  const proposal = items.map((item) => place(item, date, tz));
  const selected = expandSelection(proposal, intent || {});
  const conflicts = [];
  const options = [];
  const beforePairs = violationPairs(proposal);

  for (const item of proposal) {
    if (!selected.has(String(item.id)) || isFinished(item) || isFixed(item)) continue;
    const delta = kind === "reschedule" ? null : offset * 60 * 1000;
    const nextStart = kind === "reschedule" ? toInstant(date, intent.at, tz).instant : item.start + delta;
    if (!Number.isFinite(nextStart)) {
      conflicts.push(conflict("block", "rejected", item, "That time is not on today's plan."));
      continue;
    }
    if (nextStart < ctx.now) {
      conflicts.push(conflict("block", "past", item, "Cannot move into the past."));
      continue;
    }
    const local = fromInstant(nextStart, tz);
    if (local.date !== date) {
      conflicts.push(conflict("block", "midnight", item, `This would push ${item.title || "this item"} to tomorrow.`));
      continue;
    }
    item.start = nextStart;
    item.durationMin = item.durationMin;
    stamp(item, tz);
  }

  for (const item of proposal) {
    for (const dep of item.deps || []) {
      const target = proposal.find((other) => String(other.id) === String(dep.target));
      if (!target || isFinished(item) || isFixed(item)) continue;
      const gap = (dep.minGapMin || 0) * 60 * 1000;
      if (dep.type === "before" && target.start - item.start < gap) {
        const local = fromInstant(target.start - gap, tz);
        if (local.date !== date || target.start - gap < ctx.now) {
          conflicts.push(conflict("block", "dependency", item, "The earlier item would leave today or move into the past."));
        } else {
          item.start = target.start - gap;
          stamp(item, tz);
        }
      }
      if (dep.type === "after" && item.start < target.end + gap) {
        const local = fromInstant(target.end + gap, tz);
        if (local.date !== date) {
          conflicts.push(conflict("block", "midnight", item, `This would push ${item.title || "this item"} to tomorrow.`));
        } else {
          item.start = target.end + gap;
          stamp(item, tz);
        }
      }
    }
  }

  const afterPairs = violationPairs(proposal);
  for (const pair of afterPairs) {
    if (!beforePairs.has(pair)) {
      conflicts.push(conflict("block", "blocks", null, "This move would break a rule that keeps these apart."));
      return empty(items, conflicts);
    }
  }

  for (const item of proposal) {
    if (isFixed(item) || isFinished(item)) continue;
    const original = items.find((row) => String(row.id) === String(item.id));
    const originalPlace = original ? place(original, date, tz) : null;
    for (const fixed of proposal) {
      if (!isFixed(fixed) || String(fixed.id) === String(item.id)) continue;
      const overlaps = item.start < fixed.end && fixed.start < item.end;
      const overlappedBefore = originalPlace
        && originalPlace.start < fixed.end
        && fixed.start < originalPlace.end;
      if (overlaps && !overlappedBefore) {
        conflicts.push(conflict("block", "fixed", fixed, "A fixed item stays where it is."));
      }
    }
  }

  const ordered = [...proposal].filter((item) => !isFinished(item)).sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const minStart = prev.end + gapMs;
    if (cur.start >= minStart) continue;
    if (isFixed(cur)) {
      conflicts.push(conflict("block", "fixed", cur, "A fixed item stays where it is."));
      continue;
    }
    if (isFixed(prev) && cur.start < prev.end) {
      conflicts.push(conflict("block", "fixed", prev, "A fixed item stays where it is."));
      continue;
    }
    const local = fromInstant(minStart, tz);
    if (local.date !== date) {
      conflicts.push(conflict("block", "midnight", cur, `This would push ${cur.title || "this item"} to tomorrow.`));
      continue;
    }
    cur.start = minStart;
    stamp(cur, tz);
  }

  const overflowing = proposal.filter((item) => item.end > cutoff && !isFinished(item) && !isFixed(item) && selected.has(String(item.id)));
  if (overflowing.length && !intent.resolution) {
    options.push("compress", "skip");
    for (const item of overflowing) {
      conflicts.push(conflict("block", "cutoff", item, "This would run into the bedtime window."));
    }
  } else if (intent.resolution === "compress") {
    for (const item of overflowing) {
      const maxDurMin = Math.floor((cutoff - item.start) / 60000);
      const minDur = item.minDurationMin == null ? item.durationMin : item.minDurationMin;
      if (maxDurMin < minDur) {
        conflicts.push(conflict("block", "min_duration", item, "Compressing would go below the minimum length."));
        if (!options.includes("skip")) options.push("skip");
      } else if (maxDurMin < item.durationMin) {
        item.durationMin = maxDurMin;
        item.end = item.start + maxDurMin * 60 * 1000;
      }
    }
  } else if (intent.resolution === "skip") {
    const droppable = [...overflowing].sort((a, b) => Number(b.category === "study") - Number(a.category === "study"));
    for (const item of droppable) {
      if (item.alertLevel === "non_negotiable") {
        conflicts.push(conflict("block", "cutoff", item, "A protected item would run into bedtime."));
        continue;
      }
      item.dropped = true;
    }
  }

  for (const item of proposal) {
    if ((item.category === "workout" || item.domain === "fitness") && item.scheduledAt >= "21:00" && selected.has(String(item.id))) {
      conflicts.push(conflict("warn", "late", item, `${item.title || "Workout"} now starts at ${item.scheduledAt}.`));
    }
  }

  const dropped = proposal.filter((item) => item.dropped).map((item) => ({ id: item.id, title: item.title || "" }));
  const ok = !blocks(conflicts);
  return {
    ok,
    changes: ok ? changesOf(items, proposal) : [],
    conflicts,
    dropped: ok ? dropped : [],
    options,
    preview: {
      items: proposal.map((item) => ({
        id: item.id,
        scheduledAt: item.scheduledAt,
        durationMin: item.durationMin,
        status: item.dropped ? "skipped" : item.status || "pending",
        plannedAt: item.plannedAt || items.find((orig) => orig.id === item.id)?.scheduledAt,
      })),
    },
  };
}

function apply(items, planned) {
  if (!planned?.ok) return items.map(clone);
  const changes = new Map((planned.changes || []).map((change) => [String(change.id), change]));
  const dropped = new Set((planned.dropped || []).map((item) => String(item.id)));
  return items.map((item) => {
    const next = clone(item);
    next.plannedAt = item.plannedAt || item.scheduledAt;
    if (dropped.has(String(item.id))) {
      next.status = "skipped";
      next.skippedReason = "cutoff";
      return next;
    }
    const change = changes.get(String(item.id));
    if (!change) return next;
    next.scheduledAt = change.to;
    next.durationMin = change.durationMin;
    return next;
  });
}

function confirmOp(op, revision) {
  if (!op || op.planRevision !== revision) {
    return { ok: false, error: "plan changed, preview again" };
  }
  if (op.status === "applied") return { ok: true, idempotent: true, op };
  if (op.status !== "previewed") return { ok: false, error: "preview expired" };
  return { ok: true, idempotent: false, op: { ...op, status: "applied" } };
}

function undoShift(before, after, current) {
  const restored = [];
  const leftAlone = [];
  const items = current.map((item) => {
    const prev = before.find((row) => String(row.id) === String(item.id));
    const applied = after.find((row) => String(row.id) === String(item.id));
    if (!prev || !applied) return clone(item);
    const touched = item.scheduledAt !== applied.scheduledAt
      || item.status !== applied.status
      || Boolean(item.startedAt);
    if (touched) {
      leftAlone.push(item.id);
      return clone(item);
    }
    restored.push(item.id);
    return { ...clone(item), scheduledAt: prev.scheduledAt, durationMin: prev.durationMin };
  });
  return { items, restored, leftAlone };
}

module.exports = { plan, apply, confirmOp, undoShift, MAX_SHIFT_MIN, DEFAULT_GAP_MIN };
