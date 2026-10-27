import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api } from "./api";

export const confirmShift = createAsyncThunk("shift/confirm", async (token) => {
  return api("/api/shifts/confirm", { method: "POST", body: JSON.stringify({ token }) });
});

export const undoShift = createAsyncThunk("shift/undo", async (shiftId) => {
  return api(`/api/shifts/${shiftId}/undo`, { method: "POST", body: "{}" });
});

const shiftSlice = createSlice({
  name: "shift",
  initialState: { undo: null },
  reducers: {
    offerUndo(state, action) {
      state.undo = action.payload;
    },
    clearUndo(state) {
      state.undo = null;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(undoShift.fulfilled, (state) => {
      state.undo = null;
    });
  },
});

export const { offerUndo, clearUndo } = shiftSlice.actions;
export default shiftSlice.reducer;
