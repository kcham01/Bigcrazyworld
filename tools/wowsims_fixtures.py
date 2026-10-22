#!/usr/bin/env python3
"""Extracts wowsims/tbc's three tank reference characters (gear, talents, race, buffs, consumables) and the
final character stats wowsims computed for them, into tests/fixtures/wowsims.json. tests/run.ts rebuilds
the same characters in the app's engine and checks it gets the same numbers.

  python3 tools/wowsims_fixtures.py <wowsims-tbc>
"""
import json
import os
import re
import sys

SIMS = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAT_ORDER = ['str', 'agi', 'sta', 'int', 'spi', 'sp', 'heal', 'arcsp', 'firesp', 'frostsp', 'holysp', 'natsp', 'shadsp', 'mp5',
              'shit', 'scrit', 'shaste', 'spen', 'ap', 'hit', 'crit', 'haste', 'arp', 'exp', 'mana', 'energy', 'rage', 'armor', 'rap',
              'def', 'block', 'bv', 'dodge', 'parry', 'res', 'hp', 'arcres', 'fireres', 'frostres', 'natres', 'shadres', 'fap']


def camel(s):
    return s[0].lower() + s[1:]


def talents(src, var):
    body = re.search(r'var %s = &proto\.\w+Talents\{(.*?)\n\}' % var, src, re.S).group(1)
    out = {}
    for k, v in re.findall(r'(\w+):\s*(\d+|true)', body):
        out[camel(k)] = 1 if v == 'true' else int(v)
    return out


def gear(src, var):
    body = re.search(r'var %s = items\.EquipmentSpecFromJsonString\(`(.*?)`\)' % var, src, re.S).group(1)
    return json.loads(body)['items']


def final_stats(path):
    s = open(path).read()
    block = re.search(r'character_stats_results: \{.*?value: \{(.*?)\n \}', s, re.S).group(1)
    vals = [float(x) for x in re.findall(r'final_stats: ([-\d.e+]+)', block)]
    return dict(zip(STAT_ORDER, vals))


specs = []
d = open(os.path.join(SIMS, 'sim/druid/tank/presets.go')).read()
specs.append({
    'name': 'wowsims Feral Tank (Tauren, P1)', 'cls': 'druid', 'race': 'tauren', 'gear': gear(d, 'P1Gear'), 'talents': talents(d, 'StandardTalents'),
    'buffs': {'brill': 1, 'motw': 2, 'bshout': 2, 'lotp': 1, 'goa': 2, 'manaspring': 1, 'braided': 1, 'soe': 2, 'kings': 1, 'might': 2, 'urage': 1},
    'cons': {'battle': 'Elixir of Major Agility', 'food': 'Grilled Mudfish', 'scrolls': ['Scroll of Strength V', 'Scroll of Agility V']},
    'abil': {'bear': True},
    'expect': final_stats(os.path.join(SIMS, 'sim/druid/tank/TestFeralTank.results')),
})
w = open(os.path.join(SIMS, 'sim/warrior/protection/presets.go')).read()
specs.append({
    'name': 'wowsims Protection Warrior (Orc, P1)', 'cls': 'warrior', 'race': 'orc', 'gear': gear(w, 'P1Gear'), 'talents': talents(w, 'ImpaleProtTalents'),
    'buffs': {'brill': 1, 'motw': 2, 'bshout': 2, 'lotp': 1, 'goa': 1, 'soe': 2, 'kings': 1, 'might': 2, 'urage': 1, 'cshout': 1},  # the warrior's own shout is Commanding (presets.go)
    'cons': {'battle': 'Elixir of Mastery', 'guardian': 'Gift of Arthas'},
    'abil': {'defstance': True},
    'expect': final_stats(os.path.join(SIMS, 'sim/warrior/protection/TestProtectionWarrior.results')),
})
p = open(os.path.join(SIMS, 'sim/paladin/protection/presets.go')).read()
specs.append({
    'name': 'wowsims Protection Paladin (Blood Elf, P4)', 'cls': 'paladin', 'race': 'bloodelf', 'gear': gear(p, 'Phase4Gear'), 'talents': talents(p, 'defaultProtTalents'),
    'buffs': {'brill': 1, 'motw': 2, 'fort': 1, 'wrathair': 1, 'manaspring': 1, 'kings': 1, 'wisdom': 2, 'might': 2},
    'cons': {'flask': 'Flask of Blinding Light', 'food': 'Blackened Basilisk'},
    'abil': {'rf': True},
    'expect': final_stats(os.path.join(SIMS, 'sim/paladin/protection/TestProtection.results')),
})
os.makedirs(os.path.join(ROOT, 'tests', 'fixtures'), exist_ok=True)
json.dump(specs, open(os.path.join(ROOT, 'tests', 'fixtures', 'wowsims.json'), 'w'), indent=1)
print('wrote', len(specs), 'reference characters')
