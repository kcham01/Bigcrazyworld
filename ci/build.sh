#!/bin/bash
# Builds the app and the APK (run by .github/workflows/build.yml)
set -e
mkdir -p test out
exec > >(tee test/build.log) 2>&1
export VERSION_NAME="$(tr -d '[:space:]' < VERSION)"
echo "== TBCrushCalc $VERSION_NAME, build ${VERSION_CODE:-?}"
npm ci --no-audit --no-fund
npx tsc --noEmit -p .
node tools/icon.mjs
node tools/build.mjs --tests
node build/tests/run.js | tee test/engine.log
grep -q "errors 0" test/engine.log
node tools/build.mjs --prod
rm -rf android/app/src/main/assets/game && mkdir -p android/app/src/main/assets/game
cp -r build/web/. android/app/src/main/assets/game/
rm -f android/app/src/main/assets/game/*.map
# signing: the repository's secret key if it is set (so new versions install over old ones), else a throw-away key
export BCW_KEYSTORE_FILE="${RUNNER_TEMP:-/tmp}/tbcc-release.jks"
if [ -n "$KEYSTORE_B64" ] && [ -n "$BCW_KEYSTORE_PASSWORD" ]; then
  export BCW_KEYSTORE_PASSWORD="$(printf '%s' "$BCW_KEYSTORE_PASSWORD" | tr -d '[:space:]')"
  printf '%s' "$KEYSTORE_B64" | tr -d '[:space:]' | base64 -d > "$BCW_KEYSTORE_FILE"
  echo "signing with the repository key"
else
  echo "!! No BCW_KEYSTORE secret: signing with a throw-away key (uninstall the old app before installing this one)"
  export BCW_KEYSTORE_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  keytool -genkeypair -keystore "$BCW_KEYSTORE_FILE" -storepass "$BCW_KEYSTORE_PASSWORD" -keypass "$BCW_KEYSTORE_PASSWORD" -alias bigcrazyworld -keyalg EC -groupname secp256r1 -validity 10000 -dname "CN=TBCrushCalc" >/dev/null
fi
cd android
gradle --no-daemon --stacktrace assembleRelease
cd ..
rm -f "$BCW_KEYSTORE_FILE"
cp android/app/build/outputs/apk/release/app-release.apk out/TBCrushCalc.apk
ls -la out
