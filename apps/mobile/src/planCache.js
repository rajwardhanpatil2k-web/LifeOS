import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "lifeos.plan.v1";

export async function loadPlanCache() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.today) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

export async function clearPlanCache() {
  await AsyncStorage.removeItem(KEY);
}

export async function savePlanCache(payload) {
  if (!payload || !payload.today) return;
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      today: payload.today,
      horizon: payload.horizon || null,
      savedAt: payload.savedAt || Date.now(),
    })
  );
}
