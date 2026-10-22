#!/bin/bash
# Runs on the GitHub emulator: install, start, play.
cd "$(dirname "$0")/.."
mkdir -p test/shots
exec > >(tee test/emulator.log) 2>&1
set -x
PKG=app.bigcrazyworld
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell settings put global hide_error_dialogs 1
sleep 15
adb logcat -c
adb install -r out/BigCrazyWorld.apk || exit 1
adb shell am start -W -n $PKG/.MainActivity --ez devtools true
sleep 10
timeout 1500 node test/android.js 2>&1 | tee test/play.log
adb logcat -d -v time -s chromium:* AndroidRuntime:* > test/logcat.log
exit 0
