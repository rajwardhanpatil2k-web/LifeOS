import * as SecureStore from "expo-secure-store";

const KEY = "lifeos.session";

export async function saveSession(session) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function loadSession() {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch (_err) {
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(KEY);
}
