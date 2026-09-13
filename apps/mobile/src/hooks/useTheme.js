import { useMemo } from "react";
import { useSelector } from "react-redux";
import { domainMeta as domainMetaFor, getColors } from "../theme";

// Single source of truth for "what does the app look like right now" — mode
// lives in Redux (settingsSlice), persisted server-side like wake/home time,
// so every screen just asks this hook instead of importing a static palette.
export function useTheme() {
  const mode = useSelector((s) => s.settings.themeMode) || "dark";
  return useMemo(
    () => ({
      mode,
      colors: getColors(mode),
      domainMeta: (domain) => domainMetaFor(domain, mode),
    }),
    [mode]
  );
}
