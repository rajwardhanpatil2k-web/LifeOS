export const DARK_COLORS = {
  bg: "#0a0b0d",
  bgSoft: "#12141a",
  card: "#15181e",
  card2: "#1a1e25",
  line: "rgba(255,255,255,0.08)",
  text: "#f2f4f7",
  muted: "#8d95a3",
  muted2: "#5c6472",
  gold: "#d4af6a",
  success: "#6bc9a0",
  danger: "#d98b73",
};

export const LIGHT_COLORS = {
  bg: "#f6f4ef",
  bgSoft: "#ece7dd",
  card: "#ffffff",
  card2: "#faf7f1",
  line: "rgba(20,20,26,0.10)",
  text: "#21232a",
  muted: "#5c6472",
  muted2: "#8b8f99",
  gold: "#a3761f",
  success: "#238a63",
  danger: "#b8523a",
};

// Kept as a fixed-dark alias for screens that are intentionally never
// theme-aware (the wake alarm screen — it should always stay high-contrast
// dark regardless of the app-wide setting, same as a phone's lock screen).
export const colors = DARK_COLORS;

export function getColors(mode) {
  return mode === "light" ? LIGHT_COLORS : DARK_COLORS;
}

export const FOCUS_DOMAINS = ["skin", "hair", "fitness", "learning"];

// Domain accents get a slightly deeper/more saturated variant in light mode
// so they keep enough contrast against a white card instead of washing out.
const DOMAIN_ACCENTS = {
  skin: { label: "Skin", dark: "#e3a98f", light: "#c15f3e" },
  hair: { label: "Hair", dark: "#cf9a4c", light: "#96691c" },
  fitness: { label: "Workout", dark: "#5fb8a6", light: "#1f7d68" },
  learning: { label: "Study", dark: "#8aa8e6", light: "#3457a6" },
};

export function domainMeta(domain, mode = "dark") {
  const entry = DOMAIN_ACCENTS[domain];
  if (entry) return { label: entry.label, color: mode === "light" ? entry.light : entry.dark };
  const muted2 = getColors(mode).muted2;
  if (domain === "career") return { label: "Office", color: muted2 };
  if (domain === "ops") return { label: "Extra", color: muted2 };
  if (domain === "health") return { label: "Health", color: muted2 };
  return { label: domain || "Task", color: muted2 };
}

export const SCHEDULE_DOMAINS = [
  { key: "fitness", label: "Workout" },
  { key: "skin", label: "Skin" },
  { key: "hair", label: "Hair" },
  { key: "learning", label: "Study" },
  { key: "health", label: "Health" },
  { key: "career", label: "Office" },
  { key: "ops", label: "Extra" },
];
