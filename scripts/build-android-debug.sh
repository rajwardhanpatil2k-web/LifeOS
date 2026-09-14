#!/usr/bin/env bash
# Dev-client APK for local phone testing with Metro (npm run dev:phone).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [[ -z "$IP" ]]; then
  IP="$(ifconfig | awk '/inet / && $2 != "127.0.0.1" { print $2; exit }')"
fi
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-http://${IP:-127.0.0.1}:4000}"

find_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  do
    if [[ -x "${candidate}/bin/java" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  /usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null
}

JAVA_HOME="$(find_java_home)"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

if [[ -d "$HOME/Library/Android/sdk" ]]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

PROPS="$ROOT/apps/mobile/android/local.properties"
if [[ -n "${ANDROID_HOME:-}" && ! -f "$PROPS" ]]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$PROPS"
fi

echo "Building debug dev-client APK → API $EXPO_PUBLIC_API_URL"
cd "$ROOT/apps/mobile/android"
./gradlew assembleDebug -PreactNativeArchitectures=armeabi-v7a,arm64-v8a

APK="$ROOT/apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "APK ready: $APK"
echo "Serve: cd \"$(dirname "$APK")\" && python3 -m http.server 8765"
echo "Then: npm run monitor  +  npm run dev:phone"
