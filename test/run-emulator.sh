#!/bin/bash
# Runs on the GitHub emulator: install, start, tap through every screen.
cd "$(dirname "$0")/.."
mkdir -p test/shots
exec > >(tee test/emulator.log) 2>&1
set -x
PKG=app.tbcrushcalc
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell settings put global hide_error_dialogs 1
adb shell settings put secure immersive_mode_confirmations confirmed
sleep 15
adb logcat -c
adb install -r out/TBCrushCalc.apk || exit 1
adb shell am start -W -n $PKG/.MainActivity --ez devtools true
sleep 10
timeout 900 node test/android.js 2>&1 | tee test/play.log
adb logcat -d -v time | grep -iE "tbcrushcalc|chromium|webview|AndroidRuntime|FATAL|lowmemory|lmkd|renderer|am_kill|am_proc_died" > test/logcat.log
adb shell dumpsys activity exit-info $PKG > test/exit-info.log
exit 0
