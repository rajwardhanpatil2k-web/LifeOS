import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "./api";
import { postOrQueue } from "./outbox";

export const loadWorkoutPlan = createAsyncThunk("workout/plan", async ({ weekday, steps }) => {
  const query = new URLSearchParams({
    weekday: String(weekday ?? ""),
    steps: (steps || []).join(","),
  });
  return api(`/api/workouts/plan?${query}`);
});

export const saveWorkout = createAsyncThunk("workout/save", async (body) =>
  postOrQueue({
    path: "/api/workouts",
    body,
    optimistic: { queued: true, planChanged: false, session: { clientId: body?.clientId } },
  })
);

export const respondSuggestion = createAsyncThunk("workout/suggestion", async ({ id, action }) =>
  api(`/api/suggestions/${id}/${action}`, { method: "POST", body: "{}" })
);

const workoutSlice = createSlice({
  name: "workout",
  initialState: { plan: null, loading: false, saving: false, error: "", result: null },
  reducers: {
    clearWorkout(state) {
      state.plan = null;
      state.result = null;
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadWorkoutPlan.pending, (state) => {
        state.loading = true;
        state.error = "";
        state.result = null;
      })
      .addCase(loadWorkoutPlan.fulfilled, (state, action) => {
        state.loading = false;
        state.plan = action.payload;
      })
      .addCase(loadWorkoutPlan.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || "Could not load the session.";
      })
      .addCase(saveWorkout.pending, (state) => {
        state.saving = true;
        state.error = "";
      })
      .addCase(saveWorkout.fulfilled, (state, action) => {
        state.saving = false;
        state.result = action.payload;
      })
      .addCase(saveWorkout.rejected, (state, action) => {
        state.saving = false;
        state.error = action.error.message || "Could not save the session.";
      });
  },
});

export const { clearWorkout } = workoutSlice.actions;
export default workoutSlice.reducer;
