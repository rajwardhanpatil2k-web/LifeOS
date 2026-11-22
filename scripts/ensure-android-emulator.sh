#!/usr/bin/env bash
# Installs emulator + the Pixel 7 Pro system image if missing from ANDROID_HOME.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"

AVAIL_KB="$(df -k "$ANDROID_HOME" 2>/dev/null | awk 'NR==2 { print $4 }')"
MIN_MB=8000
if [[ -n "$AVAIL_KB" && "$AVAIL_KB" -lt $((MIN_MB * 1024)) ]]; then
  echo "Need about ${MIN_MB} MB free on the disk that holds Android SDK." >&2
  echo "Free space under $ANDROID_HOME (now ~$((AVAIL_KB / 1024)) MB), then re-run: npm run android:emulator:setup" >&2
  echo "Or use a physical phone: npm run monitor + npm run dev:phone" >&2
  exit 1
fi

find_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi
  for candidate in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
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

SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [[ ! -x "$SDKMANAGER" ]]; then
  echo "Installing Android SDK command-line tools into $ANDROID_HOME …"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/cmdline-tools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
  unzip -q "$TMP/cmdline-tools.zip" -d "$TMP"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"
  mv "$TMP/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
fi

echo "Accepting SDK licenses (if prompted) …"
yes | "$SDKMANAGER" --sdk_root="$ANDROID_HOME" --licenses >/dev/null 2>&1 || true

PKGS=(
  "platform-tools"
  "emulator"
  "platforms;android-36"
  "system-images;android-36;google_apis_playstore;arm64-v8a"
)

need_any=false
for pkg in "${PKGS[@]}"; do
  case "$pkg" in
    emulator)
      [[ -x "$ANDROID_HOME/emulator/emulator" ]] || need_any=true
      ;;
    system-images*)
      [[ -d "$ANDROID_HOME/$pkg" ]] || need_any=true
      ;;
    platforms*)
      [[ -d "$ANDROID_HOME/$pkg" ]] || need_any=true
      ;;
    *) ;;
  esac
done

if [[ "$need_any" == true ]]; then
  echo "Downloading emulator + Android 36 (Play Store, arm64) — can take several minutes …"
  "$SDKMANAGER" --sdk_root="$ANDROID_HOME" "${PKGS[@]}"
else
  echo "Emulator packages already present."
fi

if [[ ! -x "$ANDROID_HOME/emulator/emulator" ]]; then
  echo "Emulator binary still missing. Open Android Studio → SDK Manager → Android SDK →"
  echo "  install “Android Emulator” and “Google Play ARM 64 v8a System Image” (API 36)." >&2
  exit 1
fi

echo "Ready. AVD: Pixel_7_Pro"