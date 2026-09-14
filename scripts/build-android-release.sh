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

find_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi
  local candidate
  for candidate in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/opt/homebrew/opt/openjdk@17" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/Applications/Android Studio.app/Contents/jre/Contents/Home" \
    "/usr/local/opt/openjdk@17"
  do
    if [[ -x "${candidate}/bin/java" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  if command -v /usr/libexec/java_home >/dev/null 2>&1; then
    /usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home 2>/dev/null
    return 0
  fi
  return 1
}

JAVA_HOME="$(find_java_home)" || {
  echo "No JDK found. Install Temurin 17 or Android Studio, then retry." >&2
  exit 1
}
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

if [[ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]]; then
  if [[ -d "$HOME/Library/Android/sdk" ]]; then
    export ANDROID_HOME="$HOME/Library/Android/sdk"
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  fi
fi

SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
PROPS="$ROOT/apps/mobile/android/local.properties"
if [[ -n "$SDK_DIR" && ! -f "$PROPS" ]]; then
  printf 'sdk.dir=%s\n' "$SDK_DIR" > "$PROPS"
fi

export EXPO_PUBLIC_API_URL="$URL"
echo "Building Life OS release APK → $EXPO_PUBLIC_API_URL"
echo "JAVA_HOME=$JAVA_HOME"
"$JAVA_HOME/bin/java" -version

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
