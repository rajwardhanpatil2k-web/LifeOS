import { configureStore, createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "./api";

export const fetchToday = createAsyncThunk("today/fetch", async () => api("/api/today"));
export const fetchWeek = createAsyncThunk("today/week", async () => api("/api/week"));
export const completeItem = createAsyncThunk("today/complete", async (itemIdOrPayload) => {
  const itemId = typeof itemIdOrPayload === "string" ? itemIdOrPayload : itemIdOrPayload.itemId;
  const source = typeof itemIdOrPayload === "object" ? itemIdOrPayload.source : undefined;
  return api(`/api/items/${itemId}/complete`, {
    method: "POST",
    body: JSON.stringify(source ? { source } : {}),
  });
});
export const markItemReady = createAsyncThunk("today/ready", async (itemId) =>
  api(`/api/items/${itemId}/ready`, { method: "POST", body: JSON.stringify({ source: "task_call" }) })
);
export const snoozeItem = createAsyncThunk("today/snooze", async ({ itemId, minutes = 5 }) =>
  api(`/api/items/${itemId}/snooze`, { method: "POST", body: JSON.stringify({ minutes, source: "task_call" }) })
);
export const remindLaterItem = createAsyncThunk("today/remindLater", async ({ itemId, minutes = 15 }) =>
  api(`/api/items/${itemId}/remind-later`, { method: "POST", body: JSON.stringify({ minutes, source: "task_call" }) })
);
export const skipItem = createAsyncThunk("today/skip", async (itemId) =>
  api(`/api/items/${itemId}/skip`, { method: "POST", body: JSON.stringify({ reason: "skipped" }) })
);
export const undoItem = createAsyncThunk("today/undo", async (itemId) =>
  api(`/api/items/${itemId}/undo`, { method: "POST", body: "{}" })
);
export const toggleStep = createAsyncThunk("today/step", async ({ itemId, stepKey }) =>
  api(`/api/items/${itemId}/steps/${stepKey}`, { method: "POST", body: "{}" })
);
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
export const addVoiceTask = createAsyncThunk("today/voiceTask", async (transcript) =>
  api("/api/tasks/voice", { method: "POST", body: JSON.stringify({ transcript }) })
);
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

function applyItemUpdate(state, action) {
  if (!state.data) return;
  state.data.score = action.payload.score;
  state.data.next = action.payload.next;
  state.data.items = state.data.items.map((item) =>
    item._id === action.payload.item._id ? action.payload.item : item
  );
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
    item._id === action.payload.item._id ? action.payload.item : item
  );
}

const todaySlice = createSlice({
  name: "today",
  initialState: {
    loading: false,
    error: null,
    data: null,
    week: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchToday.pending, (state) => {
        if (!state.data) state.loading = true;
        state.error = null;
      })
      .addCase(fetchToday.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchToday.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      .addCase(fetchWeek.fulfilled, (state, action) => {
        state.week = action.payload;
      })
      .addCase(completeItem.fulfilled, applyItemUpdate)
      .addCase(markItemReady.fulfilled, applyItemUpdate)
      .addCase(snoozeItem.fulfilled, applyItemUpdate)
      .addCase(remindLaterItem.fulfilled, applyItemUpdate)
      .addCase(skipItem.fulfilled, applyItemUpdate)
      .addCase(undoItem.fulfilled, applyItemUpdate)
      .addCase(toggleStep.fulfilled, applyItemUpdate)
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
      });
  },
});

const daySlice = createSlice({
  name: "day",
  initialState: {
    loading: false,
    error: null,
    data: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDay.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDay.fulfilled, (state, action) => {
        state.loading = false;
        state.data = action.payload;
      })
      .addCase(fetchDay.rejected, (state, action) => {
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

export const store = configureStore({
  reducer: {
    today: todaySlice.reducer,
    day: daySlice.reducer,
    settings: settingsSlice.reducer,
    insights: insightsSlice.reducer,
  },
});
