import { configureStore, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api, isNetworkError } from "./api";
import { drainOutbox, enqueue, postOrQueue, clientStamp } from "./outbox";
import { loadPlanCache, savePlanCache } from "./planCache";
import { clearEndGaveUp, getActiveTaskCall, isTaskCallRinging, setTaskAlertsPausedUntil, stopTaskAlert } from "./taskAlerts";
import { AI_MUTE_GRACE_MS, AI_MUTE_LEASE_MS } from "./taskCallConfig";
import authReducer from "./authSlice";
import shiftReducer from "./shiftSlice";
import workoutReducer from "./workoutSlice";
import appLimitsReducer from "./appLimitSlice";

let mutationEpoch = 0;
let inflightMutations = 0;

function noteMutationStart() {
  inflightMutations += 1;
  mutationEpoch += 1;
}

function noteMutationEnd() {
  inflightMutations = Math.max(0, inflightMutations - 1);
}

export const fetchToday = createAsyncThunk("today/fetch", async (_, { dispatch }) => {
  const epoch = mutationEpoch;
  const cached = await loadPlanCache();
  if (cached?.today) dispatch(showCachedPlan(cached));
  try {
    await drainOutbox();
    const data = await api("/api/today");
    let horizon = null;
    try {
      horizon = await api("/api/horizon?days=3");
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
    await savePlanCache({ today: data, horizon: horizon || cached?.horizon || null });
    return { data, epoch, horizon: horizon || cached?.horizon || null, offline: false };
  } catch (err) {
    if (cached?.today && isNetworkError(err)) {
      return { data: cached.today, epoch, horizon: cached.horizon || null, offline: true };
    }
    throw err;
  }
});
export const fetchWeek = createAsyncThunk("today/week", async () => api("/api/week"));
function resolveItemId(arg) {
  if (typeof arg === "string") return String(arg);
  if (arg && arg.itemId != null) return String(arg.itemId);
  return "";
}

function currentIstHhmm() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(/\u202f/g, " ");
}

function scorePlan(items) {
  const list = items || [];
  const actionable = list.filter((i) => i.alertLevel !== "info");
  const total = actionable.length;
  const completed = actionable.filter((i) => i.status === "done").length;
  const skipped = list.filter((i) => i.status === "skipped").length;
  const overall = total ? Math.round((completed / total) * 100) : 0;
  const byDomain = {};
  for (const item of list) {
    if (!byDomain[item.domain]) byDomain[item.domain] = { done: 0, total: 0 };
    if (item.alertLevel !== "info") {
      byDomain[item.domain].total += 1;
      if (item.status === "done") byDomain[item.domain].done += 1;
    }
  }
  return { overall, completed, total, skipped, byDomain };
}

function nextAction(items, hhmm = currentIstHhmm()) {
  const pending = (items || []).filter((i) => i.status === "pending");
  if (!pending.length) return null;
  const due = pending.filter((i) => i.scheduledAt <= hhmm);
  return due.length ? due[0] : pending[0];
}

function planMetaAfterItems(items) {
  return { score: scorePlan(items), next: nextAction(items) };
}

function buildOptimisticPayload(data, updatedItem) {
  const items = (data?.items || []).map((row) => (sameItem(row, updatedItem) ? updatedItem : row));
  return { ...planMetaAfterItems(items), item: updatedItem };
}

function mergeTodayPayload(local, server) {
  if (!local?.items || !server?.items) return server;
  const localById = new Map(local.items.map((row) => [String(row._id), row]));
  const mergedItems = server.items.map((serverItem) => {
    const local = localById.get(String(serverItem._id));
    if (!local) return serverItem;
    if (local.status !== "pending" && serverItem.status === "pending") {
      return {
        ...serverItem,
        status: local.status,
        steps: local.steps,
        skippedReason: local.skippedReason,
        startedAt: local.startedAt,
      };
    }
    return serverItem;
  });
  const hhmm = currentIstHhmm();
  return {
    ...server,
    items: mergedItems,
    ...planMetaAfterItems(mergedItems, hhmm),
  };
}

function currentItem(getState, itemId) {
  const data = getState().today.data;
  const item = (data?.items || []).find((row) => String(row._id) === String(itemId));
  return { data, item };
}

function stopRingingItem(itemId) {
  getActiveTaskCall()
    .then((active) => {
      if (active && String(active.itemId) === String(itemId)) return stopTaskAlert();
      return false;
    })
    .catch(() => {});
}

function forgetEndCall(itemId) {
  if (itemId) clearEndGaveUp(itemId).catch(() => {});
}

export const completeItem = createAsyncThunk("today/complete", async (itemIdOrPayload, { getState }) => {
  const itemId = String(
    (typeof itemIdOrPayload === "string" ? itemIdOrPayload : itemIdOrPayload?.itemId) || ""
  );
  const source = typeof itemIdOrPayload === "object" ? itemIdOrPayload.source : undefined;
  const stamp = clientStamp("complete", itemId);
  const { data, item } = currentItem(getState, itemId);
  stopRingingItem(itemId);
  forgetEndCall(itemId);
  const updated =
    item
      ? {
          ...item,
          status: "done",
          steps: (item.steps || []).map((step) => ({ ...step, done: true })),
        }
      : null;
  return postOrQueue({
    path: `/api/items/${itemId}/complete`,
    body: { ...stamp, source, date: data?.date },
    optimistic: item && updated ? buildOptimisticPayload(data, updated) : null,
  });
});
export const markItemReady = createAsyncThunk("today/ready", async (itemId) => {
  forgetEndCall(itemId);
  return api(`/api/items/${itemId}/ready`, { method: "POST", body: JSON.stringify({ source: "task_call" }) });
});
export const snoozeItem = createAsyncThunk("today/snooze", async ({ itemId, minutes = 5 }) =>
  api(`/api/items/${itemId}/snooze`, { method: "POST", body: JSON.stringify({ minutes, source: "task_call" }) })
);
export const remindLaterItem = createAsyncThunk("today/remindLater", async ({ itemId, minutes = 15 }) => {
  forgetEndCall(itemId);
  return api(`/api/items/${itemId}/remind-later`, { method: "POST", body: JSON.stringify({ minutes, source: "task_call" }) });
});
export const skipItem = createAsyncThunk("today/skip", async (itemIdOrPayload, { getState }) => {
  const itemId = resolveItemId(itemIdOrPayload);
  const reason =
    typeof itemIdOrPayload === "object" && itemIdOrPayload?.reason
      ? String(itemIdOrPayload.reason)
      : "skipped";
  const stamp = clientStamp("skip", itemId);
  const { data, item } = currentItem(getState, itemId);
  stopRingingItem(itemId);
  forgetEndCall(itemId);
  const updated = item ? { ...item, status: "skipped", skippedReason: reason } : null;
  const body = { ...stamp, reason, date: data?.date };
  if (item && updated) {
    return postOrQueue({
      path: `/api/items/${itemId}/skip`,
      body,
      optimistic: buildOptimisticPayload(data, updated),
    });
  }
  await enqueue({
    path: `/api/items/${itemId}/skip`,
    body,
    clientId: stamp.clientId,
  });
  drainOutbox().catch(() => {});
  return {
    queued: true,
    item: { _id: itemId, status: "skipped", skippedReason: reason },
    score: data?.score,
    next: data?.next,
  };
});
export const undoItem = createAsyncThunk("today/undo", async (itemId, { getState }) => {
  const stamp = clientStamp("undo", itemId);
  forgetEndCall(itemId);
  const { data, item } = currentItem(getState, itemId);
  const updated = item
    ? {
        ...item,
        status: "pending",
        skippedReason: undefined,
        startedAt: undefined,
        steps: (item.steps || []).map((step) => ({ ...step, done: false })),
      }
    : null;
  return postOrQueue({
    path: `/api/items/${itemId}/undo`,
    body: { ...stamp, date: data?.date },
    optimistic: item && updated ? buildOptimisticPayload(data, updated) : null,
  });
});
export const toggleStep = createAsyncThunk("today/step", async ({ itemId, stepKey }, { getState }) => {
  const stamp = clientStamp("step", `${itemId}-${stepKey}`);
  const { data, item } = currentItem(getState, itemId);
  const steps = (item?.steps || []).map((step) =>
    step.key === stepKey ? { ...step, done: !step.done } : step
  );
  const allDone = steps.length > 0 && steps.every((step) => step.done);
  const status = allDone ? "done" : item?.status === "done" ? "pending" : item?.status;
  const updated = item ? { ...item, steps, status } : null;
  return postOrQueue({
    path: `/api/items/${itemId}/steps/${stepKey}`,
    body: { ...stamp, date: data?.date },
    optimistic: item && updated ? buildOptimisticPayload(data, updated) : null,
  });
});
// `order` is the new id sequence for whichever subset of today's items was
// just dragged — the server reassigns them across their own existing time
// slots, so nothing outside that subset is touched.
export const reorderItems = createAsyncThunk("today/reorder", async (order) =>
  api("/api/today/reorder", { method: "POST", body: JSON.stringify({ order }) })
);
export const updateItemSchedule = createAsyncThunk("today/updateSchedule", async ({ itemId, scheduledAt, title, durationMin }) =>
  api(`/api/items/${itemId}/schedule`, {
    method: "PATCH",
    body: JSON.stringify({ scheduledAt, title, durationMin }),
  })
);
export const addTodayItem = createAsyncThunk("today/addItem", async (payload) =>
  api("/api/today/items", { method: "POST", body: JSON.stringify(payload) })
);
export const addVoiceTask = createAsyncThunk("today/voiceTask", async (payload) => {
  const transcript = typeof payload === "string" ? payload : payload?.transcript;
  const itemIds = typeof payload === "object" && Array.isArray(payload?.itemIds) ? payload.itemIds : [];
  return api("/api/tasks/voice", { method: "POST", body: JSON.stringify({ transcript, itemIds }) });
});
export const pauseFocus = createAsyncThunk("today/pauseFocus", async ({ durationMin, reason, until } = {}) =>
  api("/api/focus/pause", { method: "POST", body: JSON.stringify({ durationMin, reason, until }) })
);
export const resumeFocus = createAsyncThunk("today/resumeFocus", async () =>
  api("/api/focus/resume", { method: "POST", body: "{}" })
);
export const extendFocus = createAsyncThunk("today/extendFocus", async ({ minutes = 30 } = {}) =>
  api("/api/focus/extend", { method: "POST", body: JSON.stringify({ minutes }) })
);
export const removeTodayItem = createAsyncThunk("today/removeItem", async (itemId) =>
  api(`/api/items/${itemId}`, { method: "DELETE", body: "{}" })
);
export const fetchDay = createAsyncThunk("day/fetch", async (date) => api(`/api/day/${date}`));
export const fetchSettings = createAsyncThunk("settings/fetch", async () => api("/api/settings"));
// Numbers first, narration second. The stats call is instant and free, so the
// charts render immediately while the written review (which may need an
// OpenAI round trip on a cold cache) loads behind its own flag.
export const fetchInsights = createAsyncThunk("insights/stats", async ({ period, date } = {}) => {
  const params = new URLSearchParams({ period: period || "month" });
  if (date) params.set("date", date);
  return api(`/api/insights?${params.toString()}`);
});
export const fetchInsightReport = createAsyncThunk(
  "insights/report",
  async ({ period, date, refresh } = {}) => {
    const params = new URLSearchParams({ period: period || "month" });
    if (date) params.set("date", date);
    if (refresh) params.set("refresh", "1");
    return api(`/api/insights/report?${params.toString()}`);
  }
);
export const updateSettings = createAsyncThunk("settings/update", async (settings) =>
  api("/api/settings", { method: "PUT", body: JSON.stringify(settings) })
);

function sameItem(left, right) {
  if (!left || !right) return false;
  if (left._id && right._id && String(left._id) === String(right._id)) return true;
  if (left.originKey && right.originKey && left.originKey === right.originKey) return true;
  if (left.key && right.key && left.key === right.key) return true;
  return false;
}

function applyItemUpdate(state, action) {
  if (!state.data) return;
  state.data.score = action.payload.score;
  state.data.next = action.payload.next;
  state.data.items = state.data.items.map((item) =>
    sameItem(item, action.payload.item) ? action.payload.item : item
  );
}

function applyItemUpdateClearingAction(state, action) {
  state.itemActionId = null;
  applyItemUpdate(state, action);
}

function applyOptimisticFromItem(state, updatedItem) {
  if (!state.data || !updatedItem) return;
  applyItemUpdate(state, { payload: buildOptimisticPayload(state.data, updatedItem) });
}

function optimisticCompleteItem(item) {
  return {
    ...item,
    status: "done",
    steps: (item.steps || []).map((step) => ({ ...step, done: true })),
  };
}

function optimisticSkipItem(item, reason = "skipped") {
  return { ...item, status: "skipped", skippedReason: reason };
}

function optimisticUndoItem(item) {
  return {
    ...item,
    status: "pending",
    skippedReason: undefined,
    startedAt: undefined,
    steps: (item.steps || []).map((step) => ({ ...step, done: false })),
  };
}

function optimisticToggleStep(item, stepKey) {
  const steps = (item.steps || []).map((step) =>
    step.key === stepKey ? { ...step, done: !step.done } : step
  );
  const allDone = steps.length > 0 && steps.every((step) => step.done);
  const status = allDone ? "done" : item.status === "done" ? "pending" : item.status;
  return { ...item, steps, status };
}

function applyScheduleUpdate(state, action) {
  if (!state.data) return;
  state.data.items = action.payload.items;
  state.data.score = action.payload.score;
  state.data.next = action.payload.next;
  if ("focusBlock" in action.payload) state.data.focusBlock = action.payload.focusBlock;
}

// The day-detail screen can also mark today's items done/skipped/undone —
// keep its own cached copy in sync too (no-op for a non-today day, since its
// item ids won't match anything the user is actually interacting with).
function applyItemUpdateToDay(state, action) {
  if (!state.data || state.data.isToday === false) return;
  state.data.score = action.payload.score;
  state.data.next = action.payload.next;
  state.data.items = state.data.items.map((item) =>
    sameItem(item, action.payload.item) ? action.payload.item : item
  );
}

const todayMutationThunks = [
  completeItem,
  markItemReady,
  snoozeItem,
  remindLaterItem,
  skipItem,
  undoItem,
  toggleStep,
  reorderItems,
  updateItemSchedule,
  addTodayItem,
  addVoiceTask,
  pauseFocus,
  resumeFocus,
  extendFocus,
  removeTodayItem,
  updateSettings,
];

const todaySlice = createSlice({
  name: "today",
  initialState: {
    loading: false,
    error: null,
    data: null,
    week: null,
    horizon: null,
    offline: false,
    itemActionId: null,
  },
  reducers: {
    showCachedPlan(state, action) {
      if (state.data) return;
      state.data = action.payload.today;
      state.horizon = action.payload.horizon || state.horizon;
      state.offline = true;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchToday.pending, (state, action) => {
        state.latestFetchId = action.meta.requestId;
        if (!state.data) state.loading = true;
        state.error = null;
      })
      .addCase(fetchToday.fulfilled, (state, action) => {
        state.loading = false;
        if (state.latestFetchId !== action.meta.requestId) return;
        if (action.payload.epoch !== mutationEpoch || inflightMutations > 0) return;
        state.data = state.data
          ? mergeTodayPayload(state.data, action.payload.data)
          : action.payload.data;
        state.offline = action.payload.offline === true;
        if (action.payload.horizon) state.horizon = action.payload.horizon;
      })
      .addCase(completeItem.pending, (state, action) => {
        const itemId = resolveItemId(action.meta.arg);
        state.itemActionId = itemId || null;
        const item = (state.data?.items || []).find((row) => String(row._id) === itemId);
        if (item) applyOptimisticFromItem(state, optimisticCompleteItem(item));
      })
      .addCase(skipItem.pending, (state, action) => {
        const itemId = resolveItemId(action.meta.arg);
        const reason =
          typeof action.meta.arg === "object" && action.meta.arg?.reason
            ? String(action.meta.arg.reason)
            : "skipped";
        state.itemActionId = itemId || null;
        const item = (state.data?.items || []).find((row) => String(row._id) === itemId);
        if (item) applyOptimisticFromItem(state, optimisticSkipItem(item, reason));
      })
      .addCase(undoItem.pending, (state, action) => {
        const itemId = resolveItemId(action.meta.arg);
        state.itemActionId = itemId || null;
        const item = (state.data?.items || []).find((row) => String(row._id) === itemId);
        if (item) applyOptimisticFromItem(state, optimisticUndoItem(item));
      })
      .addCase(toggleStep.pending, (state, action) => {
        const { itemId, stepKey } = action.meta.arg || {};
        state.itemActionId = itemId ? String(itemId) : null;
        const item = (state.data?.items || []).find((row) => String(row._id) === String(itemId));
        if (item && stepKey) applyOptimisticFromItem(state, optimisticToggleStep(item, stepKey));
      })
      .addCase(completeItem.rejected, (state) => {
        state.itemActionId = null;
      })
      .addCase(skipItem.rejected, (state) => {
        state.itemActionId = null;
      })
      .addCase(undoItem.rejected, (state) => {
        state.itemActionId = null;
      })
      .addCase(toggleStep.rejected, (state) => {
        state.itemActionId = null;
      })
      .addCase(fetchToday.rejected, (state, action) => {
        if (state.latestFetchId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchWeek.fulfilled, (state, action) => {
        state.week = action.payload;
      })
      .addCase(completeItem.fulfilled, applyItemUpdateClearingAction)
      .addCase(markItemReady.fulfilled, applyItemUpdate)
      .addCase(snoozeItem.fulfilled, applyItemUpdate)
      .addCase(remindLaterItem.fulfilled, applyItemUpdate)
      .addCase(skipItem.fulfilled, applyItemUpdateClearingAction)
      .addCase(undoItem.fulfilled, applyItemUpdateClearingAction)
      .addCase(toggleStep.fulfilled, applyItemUpdateClearingAction)
      .addCase(reorderItems.fulfilled, (state, action) => {
        if (!state.data) return;
        state.data.items = action.payload.items;
        state.data.score = action.payload.score;
        state.data.next = action.payload.next;
      })
      .addCase(updateItemSchedule.fulfilled, applyScheduleUpdate)
      .addCase(addTodayItem.fulfilled, applyScheduleUpdate)
      .addCase(addVoiceTask.fulfilled, applyScheduleUpdate)
      .addCase(pauseFocus.fulfilled, applyScheduleUpdate)
      .addCase(resumeFocus.fulfilled, applyScheduleUpdate)
      .addCase(extendFocus.fulfilled, applyScheduleUpdate)
      .addCase(removeTodayItem.fulfilled, applyScheduleUpdate)
      .addCase(updateSettings.fulfilled, (state, action) => {
        // A wake-time change reschedules today's still-pending items too.
        if (state.data && action.payload.today) {
          state.data.items = action.payload.today.items;
          state.data.score = action.payload.today.score;
          state.data.next = action.payload.today.next;
        }
      })
      .addMatcher(
        (action) => todayMutationThunks.some((thunk) => action.type === thunk.pending.type),
        () => {
          noteMutationStart();
        }
      )
      .addMatcher(
        (action) =>
          todayMutationThunks.some(
            (thunk) => action.type === thunk.fulfilled.type || action.type === thunk.rejected.type
          ),
        () => {
          noteMutationEnd();
        }
      );
  },
});

export const { showCachedPlan } = todaySlice.actions;

const daySlice = createSlice({
  name: "day",
  initialState: {
    loading: false,
    error: null,
    data: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDay.pending, (state, action) => {
        state.latestFetchId = action.meta.requestId;
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDay.fulfilled, (state, action) => {
        if (state.latestFetchId !== action.meta.requestId) return;
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchDay.rejected, (state, action) => {
        if (state.latestFetchId !== action.meta.requestId) return;
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(completeItem.fulfilled, applyItemUpdateToDay)
      .addCase(markItemReady.fulfilled, applyItemUpdateToDay)
      .addCase(snoozeItem.fulfilled, applyItemUpdateToDay)
      .addCase(remindLaterItem.fulfilled, applyItemUpdateToDay)
      .addCase(skipItem.fulfilled, applyItemUpdateToDay)
      .addCase(undoItem.fulfilled, applyItemUpdateToDay)
      .addCase(toggleStep.fulfilled, applyItemUpdateToDay);
  },
});

const settingsSlice = createSlice({
  name: "settings",
  initialState: {
    loading: false,
    saving: false,
    error: null,
    wakeTarget: "06:00",
    homeTarget: "19:30",
    sleepTarget: "22:30",
    prepTarget: "20:00",
    themeMode: "dark",
    voiceAlerts: true,
    aiEnabled: true,
    name: "Raj",
    hydrated: false,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        if (!state.hydrated) state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.hydrated = true;
        state.wakeTarget = action.payload.wakeTarget;
        state.homeTarget = action.payload.homeTarget;
        state.sleepTarget = action.payload.sleepTarget;
        state.prepTarget = action.payload.prepTarget || "20:00";
        state.themeMode = action.payload.themeMode || "dark";
        state.voiceAlerts = action.payload.voiceAlerts !== false;
        state.aiEnabled = action.payload.aiEnabled !== false;
        state.name = action.payload.name || "Raj";
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(updateSettings.pending, (state, action) => {
        state.saving = true;
        state.error = null;
        // Theme flips should feel instant — apply it locally right away
        // instead of waiting on the round trip, then reconcile on fulfilled.
        if (action.meta.arg.themeMode) state.themeMode = action.meta.arg.themeMode;
        if (typeof action.meta.arg.voiceAlerts === "boolean") state.voiceAlerts = action.meta.arg.voiceAlerts;
        if (typeof action.meta.arg.aiEnabled === "boolean") state.aiEnabled = action.meta.arg.aiEnabled;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.saving = false;
        state.hydrated = true;
        state.wakeTarget = action.payload.wakeTarget;
        state.homeTarget = action.payload.homeTarget;
        state.sleepTarget = action.payload.sleepTarget;
        state.prepTarget = action.payload.prepTarget || "20:00";
        state.themeMode = action.payload.themeMode || "dark";
        state.voiceAlerts = action.payload.voiceAlerts !== false;
        state.aiEnabled = action.payload.aiEnabled !== false;
        state.name = action.payload.name || "Raj";
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message;
      });
  },
});

const insightsSlice = createSlice({
  name: "insights",
  initialState: {
    period: "month",
    date: null,
    loading: false,
    error: null,
    stats: null,
    aiEnabled: false,
    report: null,
    reportLoading: false,
    reportError: null,
  },
  reducers: {
    setInsightPeriod(state, action) {
      if (state.period === action.payload) return;
      state.period = action.payload;
      // Different period means the cached numbers and narration no longer
      // describe what's on screen — clear both so nothing stale flashes.
      state.stats = null;
      state.report = null;
      state.reportError = null;
    },
    setInsightDate(state, action) {
      state.date = action.payload;
      state.stats = null;
      state.report = null;
      state.reportError = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchInsights.pending, (state) => {
        if (!state.stats) state.loading = true;
        state.error = null;
      })
      .addCase(fetchInsights.fulfilled, (state, action) => {
        const requested = action.meta.arg?.period || "month";
        const requestedDate = action.meta.arg?.date || null;
        if (requested !== state.period || requestedDate !== (state.date || null)) return;
        state.loading = false;
        state.stats = action.payload.stats;
        state.aiEnabled = action.payload.aiEnabled;
      })
      .addCase(fetchInsights.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchInsightReport.pending, (state) => {
        if (!state.report) state.reportLoading = true;
        state.reportError = null;
      })
      .addCase(fetchInsightReport.fulfilled, (state, action) => {
        const requested = action.meta.arg?.period || "month";
        const requestedDate = action.meta.arg?.date || null;
        if (requested !== state.period || requestedDate !== (state.date || null)) return;
        state.reportLoading = false;
        state.report = action.payload.report;
        state.stats = action.payload.stats;
        state.aiEnabled = action.payload.aiEnabled;
      })
      .addCase(fetchInsightReport.rejected, (state, action) => {
        state.reportLoading = false;
        state.reportError = action.error.message;
      });
  },
});

export const { setInsightPeriod, setInsightDate } = insightsSlice.actions;

// Local, short-lived "the user is talking to the AI" mute. Separate from the
// server-side focus block: nothing is persisted, and it only gates task calls.
const aiMuteSlice = createSlice({
  name: "aiMute",
  initialState: { until: 0 },
  reducers: {
    setAiMuteUntil(state, action) {
      state.until = Number(action.payload) > 0 ? Number(action.payload) : 0;
    },
    expireAiMute(state) {
      if (state.until && state.until <= Date.now()) state.until = 0;
    },
  },
});

export const { setAiMuteUntil, expireAiMute } = aiMuteSlice.actions;

// Opening (or renewing) the AI sheet: stop anything ringing right now and
// hold off native task calls immediately. Don't wait for the 500ms debounced
// resync in AppBackgroundSync — an alarm due this second would still ring.
export const beginAiMute = createAsyncThunk("aiMute/begin", async (_arg, { dispatch }) => {
  const until = Date.now() + AI_MUTE_LEASE_MS;
  dispatch(setAiMuteUntil(until));
  try {
    if (await isTaskCallRinging()) await stopTaskAlert();
  } catch (_e) {
    // best effort
  }
  await setTaskAlertsPausedUntil(until).catch(() => {});
  return until;
});

// Sheet closed: keep a short grace window, then AppBackgroundSync's expiry
// timer clears it and replans, so alarms that came due while the user was
// talking ring one at a time instead of all at once.
export const endAiMute = createAsyncThunk("aiMute/end", async (_arg, { dispatch }) => {
  const until = Date.now() + AI_MUTE_GRACE_MS;
  dispatch(setAiMuteUntil(until));
  return until;
});

export const store = configureStore({
  reducer: {
    today: todaySlice.reducer,
    day: daySlice.reducer,
    settings: settingsSlice.reducer,
    insights: insightsSlice.reducer,
    aiMute: aiMuteSlice.reducer,
    auth: authReducer,
    shift: shiftReducer,
    workout: workoutReducer,
    appLimits: appLimitsReducer,
  },
});
