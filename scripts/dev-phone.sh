#!/usr/bin/env bash
# Run Metro for the physical Android phone on the same Wi-Fi / hotspot.
# Terminal 1: npm run monitor
# Terminal 2: npm run dev:phone
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "$IP" ]]; then
  IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
fi
if [[ -z "$IP" ]]; then
  echo "Could not detect LAN IP. Set EXPO_PUBLIC_API_URL manually." >&2
  exit 1
fi

export EXPO_PUBLIC_API_URL="http://${IP}:4000"
echo "Phone API URL: $EXPO_PUBLIC_API_URL"
echo "Metro URL on phone: exp://${IP}:8081"
echo ""
echo "Open the Life OS dev-client app on the phone and connect to Metro."
echo "If you only have the release APK installed, build/install the debug dev client instead:"
echo "  cd apps/mobile/android && ./gradlew assembleDebug"
echo ""

cd "$ROOT/apps/mobile"
exec npx expo start --dev-client --lan --clear
