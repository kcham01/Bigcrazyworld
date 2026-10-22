#!/bin/bash
# Puts the APK, screenshots and logs on the "results" branch
mkdir -p results
cp out/BigCrazyWorld.apk results/ 2>/dev/null || true
cp -r test/shots results/ 2>/dev/null || true
cp test/*.log test/*.json results/ 2>/dev/null || true
echo "build $GITHUB_RUN_NUMBER of $GITHUB_SHA" > results/RUN.txt
[ -f out/BigCrazyWorld.apk ] && echo "apk built" >> results/RUN.txt || echo "no apk" >> results/RUN.txt
cd results
git init -q
git checkout -q -b results
git add -A
git -c user.name="Big Crazy World build" -c user.email="build@users.noreply.github.com" commit -qm "Results of build $GITHUB_RUN_NUMBER"
git push -qf "https://x-access-token:$TOKEN@github.com/$GITHUB_REPOSITORY" results
