import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  DEFAULT_LIMIT_MINUTES,
  clampLimitMinutes,
  mergeUsage,
  sanitizeLimits,
} from "./appLimitMath";
import { getAppLimitState, isAppLimitAvailable, listInstalledApps, setNativeLimits } from "./appLimits";

const STORAGE_KEY = "lifeos.appLimits.v1";

const EMPTY_PERMISSIONS = { usage: false, overlay: false, accessibility: false };

function withUsage(limits, source) {
  const byPackage = new Map((source || []).map((item) => [item.packageName, item]));
  return sanitizeLimits(limits).map((item) => ({
    ...item,
    usedMs: Math.max(0, Number(byPackage.get(item.packageName)?.usedMs) || 0),
  }));
}

function usageMapFrom(limits) {
  const usage = {};
  for (const item of limits || []) usage[item.packageName] = Math.max(0, Number(item.usedMs) || 0);
  return usage;
}

function normalizeRemote(remote) {
  const limits = withUsage(remote?.limits, remote?.limits);
  return {
    limits,
    permissions: {
      usage: !!remote?.permissions?.usage,
      overlay: !!remote?.permissions?.overlay,
      accessibility: !!remote?.permissions?.accessibility,
    },
    foreground: typeof remote?.foreground === "string" && remote.foreground ? remote.foreground : null,
  };
}

function toStored(limits) {
  return sanitizeLimits(limits).map(({ packageName, label, limitMinutes }) => ({ packageName, label, limitMinutes }));
}

async function readStored() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeLimits(JSON.parse(raw));
  } catch (_e) {
    return [];
  }
}

// Native writes are serialized. A refresh that started earlier must not
// land after a newer limit and put the old number back on the phone.
let writeChain = Promise.resolve();

function exclusive(task) {
  const run = writeChain.catch(() => {}).then(task);
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

async function writeCurrent(getState) {
  const slim = toStored(getState().appLimits.limits);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  if (!isAppLimitAvailable()) return null;
  const remote = await setNativeLimits(slim);
  return normalizeRemote(remote);
}

const initialState = {
  status: "idle",
  available: false,
  revision: 0,
  limits: [],
  permissions: EMPTY_PERMISSIONS,
  foreground: null,
  usageFetchedAt: 0,
  apps: [],
  appsStatus: "idle",
  error: "",
};

export const hydrateAppLimits = createAsyncThunk("appLimits/hydrate", async () => {
  return exclusive(async () => {
    const stored = await readStored();
    if (!isAppLimitAvailable()) {
      return {
        available: false,
        limits: stored.map((item) => ({ ...item, usedMs: 0 })),
        permissions: EMPTY_PERMISSIONS,
        foreground: null,
      };
    }
    let remote = normalizeRemote(await getAppLimitState());
    if (remote.limits.length === 0 && stored.length > 0) {
      remote = normalizeRemote(await setNativeLimits(stored));
    } else if (remote.limits.length > 0) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toStored(remote.limits))).catch(() => {});
    }
    return { available: true, ...remote };
  });
});

export const persistAppLimits = createAsyncThunk("appLimits/persist", async (_, { getState }) => {
  return exclusive(() => writeCurrent(getState));
});

export const addAppLimit = createAsyncThunk("appLimits/add", async ({ packageName, label }, { dispatch, getState }) => {
  dispatch(limitAdded({ packageName, label, limitMinutes: DEFAULT_LIMIT_MINUTES }));
  return exclusive(() => writeCurrent(getState));
});

export const changeAppLimit = createAsyncThunk(
  "appLimits/change",
  async ({ packageName, limitMinutes }, { dispatch, getState }) => {
    dispatch(limitMinutesSet({ packageName, limitMinutes: clampLimitMinutes(limitMinutes) }));
    return exclusive(() => writeCurrent(getState));
  }
);

export const removeAppLimit = createAsyncThunk("appLimits/remove", async (packageName, { dispatch, getState }) => {
  dispatch(limitRemoved(packageName));
  return exclusive(() => writeCurrent(getState));
});

export const refreshAppLimits = createAsyncThunk("appLimits/refresh", async () => {
  if (!isAppLimitAvailable()) return null;
  return normalizeRemote(await getAppLimitState());
});

export const loadInstalledApps = createAsyncThunk("appLimits/apps", async () => {
  if (!isAppLimitAvailable()) return [];
  const apps = await listInstalledApps();
  return (Array.isArray(apps) ? apps : [])
    .map((app) => ({
      packageName: app?.packageName,
      label: typeof app?.label === "string" && app.label.trim() ? app.label.trim() : app?.packageName,
    }))
    .filter((app) => app.packageName);
});

const appLimitSlice = createSlice({
  name: "appLimits",
  initialState,
  reducers: {
    limitAdded(state, action) {
      const next = sanitizeLimits([action.payload, ...state.limits]);
      const added = next.find((item) => item.packageName === action.payload.packageName);
      if (!added) return;
      if (state.limits.some((item) => item.packageName === added.packageName)) return;
      state.revision += 1;
      state.limits.push({ ...added, usedMs: 0 });
      state.error = "";
    },
    limitMinutesSet(state, action) {
      const packageName = action.payload?.packageName;
      const item = state.limits.find((row) => row.packageName === packageName);
      if (!item) return;
      const minutes = clampLimitMinutes(action.payload.limitMinutes);
      if (item.limitMinutes === minutes) return;
      state.revision += 1;
      item.limitMinutes = minutes;
      state.error = "";
    },
    limitRemoved(state, action) {
      const before = state.limits.length;
      state.limits = state.limits.filter((item) => item.packageName !== action.payload);
      if (state.limits.length === before) return;
      state.revision += 1;
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(hydrateAppLimits.pending, (state) => {
        if (state.status === "idle") state.status = "loading";
      })
      .addCase(hydrateAppLimits.fulfilled, (state, action) => {
        state.status = "ready";
        state.available = !!action.payload?.available;
        state.permissions = action.payload?.permissions || EMPTY_PERMISSIONS;
        state.foreground = action.payload?.foreground || null;
        state.usageFetchedAt = Date.now();
        state.error = "";
        if (state.revision === 0) {
          state.limits = action.payload?.limits || [];
        } else {
          state.limits = mergeUsage(state.limits, usageMapFrom(action.payload?.limits));
        }
      })
      .addCase(hydrateAppLimits.rejected, (state, action) => {
        if (action.meta?.condition) return;
        state.status = "ready";
        state.error = "Couldn't load app limits.";
      })
      .addCase(refreshAppLimits.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.permissions = action.payload.permissions;
        state.foreground = action.payload.foreground;
        state.usageFetchedAt = Date.now();
        state.limits = mergeUsage(state.limits, usageMapFrom(action.payload.limits));
      })
      .addCase(persistAppLimits.fulfilled, applyWrite)
      .addCase(addAppLimit.fulfilled, applyWrite)
      .addCase(changeAppLimit.fulfilled, applyWrite)
      .addCase(removeAppLimit.fulfilled, applyWrite)
      .addCase(persistAppLimits.rejected, noteWriteError)
      .addCase(addAppLimit.rejected, noteWriteError)
      .addCase(changeAppLimit.rejected, noteWriteError)
      .addCase(removeAppLimit.rejected, noteWriteError)
      .addCase(loadInstalledApps.pending, (state) => {
        if (state.appsStatus !== "ready") state.appsStatus = "loading";
      })
      .addCase(loadInstalledApps.fulfilled, (state, action) => {
        state.appsStatus = "ready";
        state.apps = action.payload || [];
      })
      .addCase(loadInstalledApps.rejected, (state) => {
        state.appsStatus = "error";
        state.error = "Couldn't read the apps on this phone.";
      });
  },
});

function applyWrite(state, action) {
  if (!action.payload) return;
  state.permissions = action.payload.permissions || state.permissions;
  state.foreground = action.payload.foreground;
  state.usageFetchedAt = Date.now();
  state.limits = mergeUsage(state.limits, usageMapFrom(action.payload.limits));
  state.error = "";
}

function noteWriteError(state) {
  state.error = "Couldn't save that limit on the phone.";
}

export const { limitAdded, limitMinutesSet, limitRemoved } = appLimitSlice.actions;
export default appLimitSlice.reducer;
