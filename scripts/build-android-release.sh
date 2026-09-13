#!/usr/bin/env bash
# Standalone Life OS APK (no Metro). Install this on the phone as the home-screen app.
# Usage:
#   npm run android:release
#   npm run android:release -- https://your-service.onrender.com
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_URL="$(node -e "console.log(require('$ROOT/apps/mobile/src/productionApiUrl.js'))")"
URL="${1:-${EXPO_PUBLIC_API_URL:-$DEFAULT_URL}}"
URL="${URL%/}"

if [[ ! "$URL" =~ ^https?:// ]]; then
  echo "EXPO_PUBLIC_API_URL must be an http(s) URL. Got: $URL" >&2
  exit 1
fi

export EXPO_PUBLIC_API_URL="$URL"
echo "Building Life OS release APK → $EXPO_PUBLIC_API_URL"

cd "$ROOT/apps/mobile/android"
./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a

APK="$ROOT/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
echo ""
echo "APK ready:"
echo "  $APK"
echo ""
echo "Install on the phone (same Wi-Fi, unknown sources allowed):"
echo "  cd \"$(dirname "$APK")\" && python3 -m http.server 8765"
echo "  then open http://<this-mac-lan-ip>:8765/app-release.apk on the phone."
