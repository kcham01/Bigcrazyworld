<p align="center">
  <img src="docs/tbcrushcalc-banner.png" alt="TBCrushCalc: gear planner and crush / crit cap calculator for Burning Crusade tanks" width="100%">
</p>

<p align="center">
  <a href="https://github.com/kcham01/TBCrushCalc/raw/results/TBCrushCalc.apk"><img alt="Download the APK" src="https://img.shields.io/badge/Download-APK-ffd100?style=for-the-badge&logo=android&logoColor=000&labelColor=b5893a"></a>
  <a href="https://github.com/kcham01/TBCrushCalc/issues/new?title=Bug:%20&labels=bug"><img alt="Report a bug" src="https://img.shields.io/badge/Report-a%20bug-8a1410?style=for-the-badge&logo=github&logoColor=fff&labelColor=2c1d0a"></a>
  <a href="https://github.com/kcham01/TBCrushCalc/issues/new?title=Idea:%20&labels=enhancement"><img alt="Suggest a feature" src="https://img.shields.io/badge/Suggest-a%20feature-1eff00?style=for-the-badge&logo=github&logoColor=000&labelColor=2c1d0a"></a>
  <br>
  <a href="https://www.reddit.com/r/classicwow/submit?url=https%3A%2F%2Fgithub.com%2Fkcham01%2FTBCrushCalc&title=TBCrushCalc%3A%20a%20crush%20cap%20and%20gear%20planner%20app%20for%20TBC%20tanks"><img alt="Share on Reddit" src="https://img.shields.io/badge/Share-r%2Fclassicwow-ff4500?style=for-the-badge&logo=reddit&logoColor=fff&labelColor=2c1d0a"></a>
  <a href="https://twitter.com/intent/tweet?text=Uncrushable%20yet%3F%20TBCrushCalc%2C%20a%20crush%20cap%20and%20gear%20planner%20for%20TBC%20tanks&url=https%3A%2F%2Fgithub.com%2Fkcham01%2FTBCrushCalc"><img alt="Share on X" src="https://img.shields.io/badge/Share-on%20X-e9e2d0?style=for-the-badge&logo=x&logoColor=000&labelColor=2c1d0a"></a>
  <a href="https://github.com/kcham01/TBCrushCalc"><img alt="Star on GitHub" src="https://img.shields.io/github/stars/kcham01/TBCrushCalc?style=for-the-badge&logo=github&label=Star&color=a335ee&labelColor=2c1d0a"></a>
</p>

**TBCrushCalc**<sup><sub> (calc is short for calculator btw)</sub></sup> is an Android app for Burning Crusade tanks. Put your gear on a character pane like the one in the game, spend your talent points, pick your raid buffs, and it tells you whether a raid boss can still land crushing blows and crits on you, and what would fix it.

It covers protection warriors, protection paladins and feral druids, with every TBC item, gem and enchant from phase 1 to phase 5.

<p align="center">
  <img src="docs/screens/character.jpg" alt="Character pane" width="24%">
  <img src="docs/screens/item.jpg" alt="Item tooltip with sockets" width="24%">
  <img src="docs/screens/talents.jpg" alt="Talent tree" width="24%">
  <img src="docs/screens/caps.jpg" alt="Crush cap and attack table" width="24%">
</p>

## What it does

- **Character pane.** All 17 equipment slots around your character, with item quality colours and Wowhead-style tooltips: sockets, socket bonuses, set bonuses, enchants, item level, required level, where it drops and a link to Wowhead. Stat panels for base stats, defenses, melee, ranged (warriors) and spells (paladins and druids).
- **Every TBC item.** All 14,000+ items a warrior, paladin or druid can wear, from level 1 greens to Sunwell epics. Filter by phase, required level and armor type, search by name or boss, and sort by how much avoidance each one adds. Set bonuses that give stats (Malorne's 1400 armor in bear form, PvP set resilience) count.
- **Gems and enchants.** Every gem for a socket (matching colours first) and every enchant, armor kit and arcanum for a slot. Enchants that can't go on an item stay in the list with the reason, such as "Requires a level 35 or higher item (this one is level 13)" or "Two-handed weapons only", plus the profession and reputation they need.
- **Talents.** The three trees as in the game, with the 61-point limit, rows unlocked every 5 points and prerequisite arrows.
- **Buffs.** Searchable drop-downs with every flask, battle elixir, guardian elixir, food, scroll and potion (a flask closes the elixir slots). Raid buffs, boss debuffs and world buffs as icon grids grouped by class: tap for on, tap again for the talented version, hold for details. Your stances and cooldowns and on-use trinkets switch on and off.
- **The fight.** Pick the boss from 66 TBC raid bosses: its level, swing speed, two-weapon attacks, hit size and abilities (with Wowhead links) come from the cmangos TBC server data.
- **Caps.** Your total against the crush cap with gear only, with your block cooldown, and with procs, for the boss you picked (and any "chance to hit" debuffs on it). It also shows:
  - the boss's attack table as a bar;
  - the damage you take: hit sizes after armor, blocks, crushes and crits, damage per second, effective health and hits to kill you;
  - the crit cap;
  - Illidan's Shear;
  - how much of each stat would close the gap;
  - where every percent, point of armor and block value comes from.
- **Block charges.** A simulation of the boss (two weapons and adds included) swinging at you while you press Holy Shield or Shield Block on cooldown. It shows whether the charges really cover you or run out.
- **Alts.** Save as many characters as you like, each with its own gear, talents, race, buffs, consumables and boss. Copy, rename or delete them, and share them as a text code.

## Checked against known numbers

Every build runs the engine against:

- the three wowsims/tbc reference tanks (Tauren feral druid, Orc protection warrior, Blood Elf protection paladin), rebuilt item by item: strength, agility, stamina, intellect, health, armor, defense, dodge, parry, block and attack power all match wowsims' results;
- the in-game values for naked Tauren and Night Elf druids (health, melee crit, spell crit);
- block value as the game server works it out (cmangos: shield and gear + Strength / 20 − 1, times talents, rounded down, for every class with a shield);
- known item, gem, enchant, flask and food stats, and the attack table, crit cap and Shear cap rules.

## Install

1. Download [TBCrushCalc.apk](https://github.com/kcham01/TBCrushCalc/raw/results/TBCrushCalc.apk) on your phone.
2. Open it and allow installing from your browser or file manager if Android asks.
3. It works offline. Item icons come from Wowhead, so they need a connection the first time.

## The maths, briefly

A boss swing is one roll, read in order: miss, dodge, parry, block, crit, crushing blow, hit. A level 73 boss takes 0.6% off each of your miss, dodge, parry and block, so your character sheet needs **102.4%** combined before crushing blows (15% of swings, at 150% damage) fall off the table.

Each defense point above 350 removes 0.04% of the boss's 5.6% crit chance. That means 490 defense for warriors and paladins, or 415 for a druid with 3/3 Survival of the Fittest. Resilience counts too.

## Building it yourself

```
npm ci
node tools/build.mjs          # the app, into build/web
node tools/build.mjs --tests && node build/tests/run.js
```

The APK is built by GitHub Actions (`.github/workflows/build.yml`). It is then tested by tapping through every screen on an Android emulator. The APK, screenshots and logs go on the `results` branch.

## Licence

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Credits

| Software / data | Used for | Licence |
| --- | --- | --- |
| [wowsims/tbc](https://github.com/wowsims/tbc) | Item tooltips, gems, enchants, base stats, talent layout, reference characters for the tests | MIT |
| [oppahansi/ltc](https://github.com/oppahansi/ltc) | Talent names, descriptions and icons | GPL-3.0 |
| [cmangos tbc-db](https://github.com/cmangos/tbc-db), [mangos-tbc](https://github.com/cmangos/mangos-tbc) | Every item, consumable and elixir type; boss levels, swing speeds and damage; boss ability ids; the block value formula | GPL-2.0 |
| [Wowhead](https://www.wowhead.com/tbc) | Item icons and item links | Linked, not copied |
| [Cinzel](https://fonts.google.com/specimen/Cinzel), [Inter](https://rsms.me/inter/) | Fonts | SIL OFL 1.1 |
| [esbuild](https://esbuild.github.io/), [TypeScript](https://www.typescriptlang.org/) | Building the app | MIT, Apache-2.0 |
| [AndroidX WebKit](https://developer.android.com/jetpack/androidx/releases/webkit) | Serving the app inside the APK | Apache-2.0 |

World of Warcraft and The Burning Crusade are trademarks or registered trademarks of Blizzard Entertainment, Inc. TBCrushCalc is a fan-made tool and is not made, endorsed or supported by Blizzard Entertainment.
