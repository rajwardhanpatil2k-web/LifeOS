#!/usr/bin/env bash
# Local dev on Android emulator: API via 10.0.2.2, Metro via expo run:android.
#
# Terminal 1: npm run monitor
# Terminal 2: npm run dev:emulator
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# Emulator loopback to the host machine (where monitor serves :4000).
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://10.0.2.2:4000}"

if ! curl -sf --max-time 2 "http://127.0.0.1:4000/health" >/dev/null; then
  echo "API is not up on :4000. In another terminal run: npm run monitor" >&2
  exit 1
fi

if [[ ! -x "$ANDROID_HOME/emulator/emulator" ]]; then
  echo "Emulator not installed. Run: npm run android:emulator:setup" >&2
  exit 1
fi

AVD="${ANDROID_AVD:-Pixel_7_Pro}"
if ! adb devices | grep -qE 'emulator-[0-9]+\s+device'; then
  echo "Starting AVD $AVD …"
  nohup "$ANDROID_HOME/emulator/emulator" -avd "$AVD" -netdelay none -netspeed full >/tmp/lifeos-emulator.log 2>&1 &
  echo "Waiting for emulator (boot can take 1–2 min) …"
  adb wait-for-device
  for _ in $(seq 1 90); do
    boot="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    if [[ "$boot" == "1" ]]; then
      break
    fi
    sleep 2
  done
fi

echo "API for app: $EXPO_PUBLIC_API_URL"
echo "Building / installing dev client and starting Metro …"
cd "$ROOT/apps/mobile"
exec npx expo run:android