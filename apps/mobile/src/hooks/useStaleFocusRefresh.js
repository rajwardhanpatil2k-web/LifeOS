import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";

// Refetch when a tab gains focus, but skip if we already fetched recently.
// Keeps tab switches instant instead of blocking on network every time.
export function useStaleFocusRefresh(effect, staleMs = 60000, enabled = true) {
  const lastRun = useRef(0);
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const now = Date.now();
      if (busy.current) return undefined;
      if (lastRun.current !== 0 && now - lastRun.current < staleMs) return undefined;
      busy.current = true;
      lastRun.current = now;
      let cancelled = false;
      Promise.resolve(effect()).finally(() => {
        if (!cancelled) busy.current = false;
      });
      return () => {
        cancelled = true;
      };
    }, [effect, enabled, staleMs])
  );
}
