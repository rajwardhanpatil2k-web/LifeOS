#!/usr/bin/env bash
# iOS Simulator — good for Today UI; task-call alarms are Android-only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! curl -sf --max-time 2 "http://127.0.0.1:4000/health" >/dev/null; then
  echo "API is not up on :4000. In another terminal run: npm run monitor" >&2
  exit 1
fi

export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://127.0.0.1:4000}"

DEVICE="${IOS_SIM:-iPhone 16 Pro}"
open -a Simulator >/dev/null 2>&1 || true
xcrun simctl boot "$DEVICE" 2>/dev/null || true

echo "API for app: $EXPO_PUBLIC_API_URL"
cd "$ROOT/apps/mobile"
exec npx expo run:ios --device "$DEVICE"