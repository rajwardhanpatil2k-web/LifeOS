const { resolveDeferItem } = require("./focusBlock");

function isProtected(item) {
  return !item || item.alarmMode === "scan_dismiss";
}

function isSkippable(item) {
  return item && item.status === "pending" && !isProtected(item);
}

function normalizeSkipReason(raw, fallback = "busy") {
  const text = String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/[.,]+$/g, "")
    .trim();
  if (!text) return fallback;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseSkipReason(transcript) {
  const raw = String(transcript || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";

  const because = raw.match(
    /\b(?:because(?: of)?|since|due to|as i(?:['’]?m| am)|while(?: i(?:['’]?m| am))?)\s+(.+)$/i
  );
  if (because) {
    const reason = cleanReasonTail(because[1]);
    if (reason) return normalizeSkipReason(reason);
  }

  const busy = raw.match(
    /\b(?:busy (?:with|in|at|doing)|visiting|attending|going (?:to|for)|i(?:['’]?m| am) (?:at|doing))\s+(.+)$/i
  );
  if (busy) {
    const reason = cleanReasonTail(busy[1]);
    if (reason) return normalizeSkipReason(reason);
  }

  if (/\bganesh\b/i.test(raw)) return "Ganesh Chaturthi";
  if (/\b(festival|puja|pooja)\b/i.test(raw)) return "festival";
  if (/\bmeeting\b/i.test(raw)) return "meeting";
  if (/\b(family|relatives)\b/i.test(raw)) return "family";
  return "";
}

function cleanReasonTail(value) {
  return String(value || "")
    .replace(/\b(skip(?:ping)? (all|everything|these|them|this|the rest).*)/i, "")
    .replace(/^(these|them|this|all|it|the rest)[,:]?\s+/i, "")
    .replace(/\b(for )?(the rest of )?(today|the day)\b/gi, "")
    .replace(/\bplease\b/gi, "")
    .replace(/[.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSkipTitleQuery(transcript) {
  const raw = String(transcript || "").replace(/\s+/g, " ").trim();
  const match = raw.match(
    /\bskip(?:ping)?(?: the)?\s+(.+?)(?:\s+(?:because|since|due to|today|for now|please).*)?$/i
  );
  if (!match) return "";
  const query = match[1]
    .replace(/\b(all|everything|the rest|remaining|today'?s|selected|these|them|this task|this|it|tasks?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return query.length >= 3 ? query : "";
}

function markSkipped(item, reason, skipped) {
  item.status = "skipped";
  item.skippedReason = reason;
  item.snoozeUntil = undefined;
  item.followUpUntil = undefined;
  item.heldUntil = undefined;
  item.holdReason = undefined;
  skipped.push(item);
}

function skipList(items, reason) {
  const skipped = [];
  const reasonText = normalizeSkipReason(reason);
  for (const item of items || []) {
    if (!isSkippable(item)) continue;
    markSkipped(item, reasonText, skipped);
  }
  return { skipped, reason: reasonText };
}

function skipRemainingToday(plan, reason) {
  const pending = (plan.items || []).filter(isSkippable);
  const kept = (plan.items || []).filter((item) => item.status === "pending" && isProtected(item));
  return { ...skipList(pending, reason || "busy today"), scope: "today", kept };
}

function skipSelected(plan, itemIds, reason) {
  const ids = new Set((itemIds || []).map((id) => String(id)));
  const selected = (plan.items || []).filter(
    (item) => ids.has(String(item._id)) || ids.has(String(item.originKey || "")) || ids.has(String(item.key || ""))
  );
  const kept = selected.filter(isProtected);
  return { ...skipList(selected, reason || "busy"), scope: "selected", kept };
}

function skipNamed(plan, titleQuery, reason) {
  const item = resolveDeferItem(plan, titleQuery);
  if (!item || !isSkippable(item)) {
    return { skipped: [], reason: normalizeSkipReason(reason || "busy"), scope: "named", kept: [] };
  }
  return { ...skipList([item], reason || "busy"), scope: "named", kept: [] };
}

function previewForSkip({ skipped, reason, scope, kept }) {
  const count = (skipped || []).length;
  let title = "Nothing to skip";
  if (scope === "today" && count) {
    title = `Skipped ${count} remaining task${count === 1 ? "" : "s"}`;
  } else if (scope === "named" && count) {
    title = `Skipped ${skipped[0].title}`;
  } else if (count === 1) {
    title = `Skipped ${skipped[0].title}`;
  } else if (count) {
    title = `Skipped ${count} tasks`;
  }
  const keptBit = kept?.length
    ? ` Kept ${kept.map((item) => item.title).join(", ")}.`
    : "";
  return {
    title,
    reason: reason || "",
    scheduledAt: "",
    step: `${reason || "Busy"}.${keptBit}`,
    count,
  };
}

function detectSkipScope(transcript, itemIds) {
  const lower = String(transcript || "").toLowerCase().replace(/['’]/g, "");
  const hasSelection = Array.isArray(itemIds) && itemIds.length > 0;
  const skipAll = /\b(skip (all|everything|the rest|remaining)|not doing (any|anything|the rest)|wont do (any|anything|these)|will not do (any|anything|these)|cancel (all |today.?s )?tasks|day off|off today|rest of (the )?day|skip today)\b/.test(lower);
  const skipThese = /\b(skip (these|them|the selected|selected)|skip this|skip it)\b/.test(lower);
  const skipWord = /\bskip(ping)?\b/.test(lower);
  const notDoing = /\b(not doing|wont do|will not do|not going to do|cant do)\b/.test(lower);
  const busyEvent = /\b(busy with|visiting|attending|ganesh|festival|meeting|family|relatives)\b/.test(lower);
  const titleQuery = parseSkipTitleQuery(transcript);

  if (skipAll) return { scope: "today", titleQuery: "" };
  if (/\b(ganesh|chaturthi|festival|puja|pooja)\b/.test(lower)) {
    return { scope: hasSelection ? "selected" : "today", titleQuery: "" };
  }
  if (hasSelection && (skipThese || skipWord || notDoing || busyEvent)) {
    return { scope: "selected", titleQuery: "" };
  }
  if (skipThese) return { scope: hasSelection ? "selected" : "named", titleQuery: "" };
  if (skipWord && titleQuery) return { scope: "named", titleQuery };
  if (skipWord || notDoing) return { scope: hasSelection ? "selected" : "today", titleQuery: "" };
  return null;
}

module.exports = {
  isProtected,
  isSkippable,
  normalizeSkipReason,
  parseSkipReason,
  parseSkipTitleQuery,
  skipRemainingToday,
  skipSelected,
  skipNamed,
  previewForSkip,
  detectSkipScope,
};
