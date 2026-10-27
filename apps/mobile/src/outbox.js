import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, isNetworkError } from "./api";

const KEY = "lifeos.outbox.v1";

export function clientStamp(op, itemId) {
  return {
    clientId: `${op}-${itemId || "item"}-${Date.now()}`,
    clientAt: Date.now(),
  };
}

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

async function writeQueue(queue) {
  await AsyncStorage.setItem(KEY, JSON.stringify(queue));
}

export async function clearOutbox() {
  await writeQueue([]);
}

export async function enqueue(entry) {
  const queue = await readQueue();
  if (entry.clientId && queue.some((row) => row.clientId === entry.clientId)) return queue;
  queue.push(entry);
  await writeQueue(queue);
  return queue;
}

export async function drainOutbox() {
  const queue = await readQueue();
  const remain = [];
  for (let i = 0; i < queue.length; i += 1) {
    const entry = queue[i];
    try {
      await api(entry.path, { method: "POST", body: JSON.stringify(entry.body || {}) });
    } catch (err) {
      if (isNetworkError(err)) {
        remain.push(...queue.slice(i));
        break;
      }
    }
  }
  await writeQueue(remain);
  return remain.length;
}

export async function postOrQueue({ path, body, optimistic }) {
  try {
    return await api(path, { method: "POST", body: JSON.stringify(body) });
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueue({ path, body, clientId: body.clientId });
    if (!optimistic) throw err;
    return { ...optimistic, queued: true };
  }
}
