<p align="center"><img src="web/icon.png" width="128" alt="Big Crazy World icon: a little pixel planet with a castle on top"></p>

# Big Crazy World

A god game for Android. Raise continents, seed them with life, and watch peoples settle, farm, trade, pray, fight and fall over thousands of years.

- **A living world:** continents, mountains, rivers that run to the sea, seasons, ice ages and ages of magic. Grass regrows, forests spread, fire burns, lava flows.
- **Animals that evolve:** herds breed and hunt, drift apart into new subspecies on islands, and clever enough animals wake up as a new thinking people.
- **Eight peoples:** humans, elves, dwarves, orcs, goblins, lizardfolk, avians and the undead, each with their own look, buildings, language and ways.
- **Towns that grow by themselves:** from a camp fire to a skyline. Farms, mines, roads and bridges, walls, temples, markets and wonders, built in the style of each people and each age.
- **Nine ages of history:** from the Stone Age to the Space Age, ending with colony ships to the stars.
- **Realms with a history:** rulers, heirs and family lines, religions and schisms, alliances and royal marriages, wars with sieges and peace deals, vassals, coalitions against giants, and rebellions.
- **Godly powers:** shape the land, spawn life, bless, curse, possess a creature, start wars or make peace, drop meteors and atomic bombs, start plagues, raise volcanoes.
- **A chronicle of everything:** heroes, prophets, wars and the fall of empires, with graphs and family ties.

## Install

Download `BigCrazyWorld.apk` from the [**results** branch](../../tree/results) (the newest build is always there), open it on your phone, and allow the install when Android asks.

## Building

The game is TypeScript, drawn with WebGL 2, inside a small Android app. Every push to `main` builds the APK on GitHub Actions, runs a long simulation test, plays the game on an Android emulator, and puts the APK, screenshots and logs on the `results` branch.

To work on it on a computer: `npm install`, then `node tools/build.mjs` and open `build/web/index.html` through any local web server. `node tools/build.mjs --tests && node build/tests/run.js 200` runs 200 years of history in the terminal.
