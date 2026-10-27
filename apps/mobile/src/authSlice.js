import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { api, setAuthToken } from "./api";
import { loadApiUrl } from "./apiConfig";
import { clearSession, loadSession, saveSession } from "./sessionStore";
import { clearPlanCache } from "./planCache";
import { clearOutbox } from "./outbox";

export const hydrateAuth = createAsyncThunk("auth/hydrate", async () => {
  await loadApiUrl().catch(() => {});
  const saved = await loadSession();
  if (!saved?.token) return null;
  setAuthToken(saved.token);
  return { username: saved.username || "" };
});

export const login = createAsyncThunk("auth/login", async ({ username, password }) => {
  const data = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  if (!data?.token) throw new Error("The server did not return a sign-in token.");
  await saveSession({ token: data.token, username: data.username || username, expiresAt: data.expiresAt });
  setAuthToken(data.token);
  return { username: data.username || username };
});

export const deleteMyData = createAsyncThunk("auth/deleteAll", async ({ password, phrase }) => {
  const result = await api("/api/data", {
    method: "DELETE",
    body: JSON.stringify({ password, phrase }),
  });
  setAuthToken("");
  await clearSession();
  await clearPlanCache().catch(() => {});
  await clearOutbox().catch(() => {});
  return result;
});

export const logout = createAsyncThunk("auth/logout", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } catch (_err) {
    // The local token is cleared either way.
  }
  setAuthToken("");
  await clearSession();
  return null;
});

const authSlice = createSlice({
  name: "auth",
  initialState: { status: "unknown", username: "" },
  reducers: {
    sessionExpired(state) {
      state.status = "guest";
      state.username = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAuth.fulfilled, (state, action) => {
        state.status = action.payload ? "authed" : "guest";
        state.username = action.payload?.username || "";
      })
      .addCase(hydrateAuth.rejected, (state) => {
        state.status = "guest";
        state.username = "";
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "authed";
        state.username = action.payload.username || "";
      })
      .addCase(logout.fulfilled, (state) => {
        state.status = "guest";
        state.username = "";
      })
      .addCase(logout.rejected, (state) => {
        state.status = "guest";
        state.username = "";
      })
      .addCase(deleteMyData.fulfilled, (state) => {
        state.status = "guest";
        state.username = "";
      });
  },
});

export const { sessionExpired } = authSlice.actions;
export default authSlice.reducer;
