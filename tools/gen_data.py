#!/usr/bin/env python3
"""Builds the game data the app ships with.

  python3 tools/gen_data.py <wowsims-tbc> <ltc> <cmangos tbc-db dump .sql> <mangos-tbc>

Sources (not stored in this repo):
  wowsims/tbc   (MIT)    Wowhead's tooltips for every TBC item (assets/item_data), item/gem/enchant stats used to
                          check the tooltip parser, race and class base stats, talent tree layouts
  oppahansi/ltc (GPL-3)  talent names, rank descriptions and talent icons
  cmangos tbc-db (GPL-2) item classes for consumables, the battle/guardian/flask table (spell_elixir),
                          creature data for raid bosses (level, swing timer, damage)
  cmangos mangos-tbc (GPL-2) boss scripts, for the spell ids of boss abilities

Writes web/data/{items,gems,enchants,consumables,bosses}.json (loaded by the app at start) and
src/data/{bases,talents}.json (bundled), plus web/talents/*.jpg.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tbcparse as P  # noqa: E402
import sqlrows        # noqa: E402

SIMS, LTC, SQL, MANGOS = sys.argv[1:5]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web', 'data')
SRC = os.path.join(ROOT, 'src', 'data')
os.makedirs(WEB, exist_ok=True)
os.makedirs(SRC, exist_ok=True)
JUNK = re.compile(r'^(?:Monster - |QA|Test |TEST |\[PH\]|Deprecated|zz|OLD|Unused|NPC Equip)|\bTEST\b|\(test\)', re.I)

tips = P.load_tooltips(os.path.join(SIMS, 'assets/item_data/all_item_tooltips.csv'))

# ================================================================== wowsims structured data (for checks and merges)
STAT_KEYS = {
    'Strength': 'str', 'Agility': 'agi', 'Stamina': 'sta', 'Intellect': 'int', 'Spirit': 'spi',
    'SpellPower': 'sp', 'HealingPower': 'heal', 'MP5': 'mp5', 'SpellHit': 'shit', 'SpellCrit': 'scrit',
    'SpellHaste': 'shaste', 'SpellPenetration': 'spen', 'AttackPower': 'ap', 'MeleeHit': 'hit',
    'MeleeCrit': 'crit', 'MeleeHaste': 'haste', 'ArmorPenetration': 'arp', 'Expertise': 'exp',
    'Armor': 'armor', 'RangedAttackPower': 'rap', 'Defense': 'def', 'Block': 'block',
    'BlockValue': 'bv', 'Dodge': 'dodge', 'Parry': 'parry', 'Resilience': 'res', 'Health': 'hp',
    'ArcaneResistance': 'arcres', 'FireResistance': 'fireres', 'FrostResistance': 'frostres',
    'NatureResistance': 'natres', 'ShadowResistance': 'shadres', 'FeralAttackPower': 'fap',
    'Mana': 'mana', 'ArcaneSpellPower': 'arcsp', 'FireSpellPower': 'firesp', 'FrostSpellPower': 'frostsp',
    'HolySpellPower': 'holysp', 'NatureSpellPower': 'natsp', 'ShadowSpellPower': 'shadsp',
}


def ws_stats(s):
    out = {}
    for name, val in re.findall(r'stats\.(\w+):\s*(-?[\d.]+)', s or ''):
        k = STAT_KEYS.get(name)
        if k:
            v = float(val)
            out[k] = int(v) if v == int(v) else v
    return out


def ws_block(line, name):
    m = re.search(name + r':\s*stats\.Stats\{([^}]*)\}', line)
    return m.group(1) if m else ''


ws_items = {}
for line in open(os.path.join(SIMS, 'sim/core/items/all_items.go')).read().splitlines():
    line = line.strip()
    if line.startswith('{Name:'):
        m = re.search(r'\bID:\s*(\d+)', line)
        ph = re.search(r'Phase:\s*(\d+)', line)
        ws_items[int(m.group(1))] = {'st': ws_stats(ws_block(line, 'Stats')), 'ph': int(ph.group(1)) if ph else None}

# ================================================================== items
USE_RE = re.compile(r'^(Use|Equip|Chance on hit): .*?(?:Increases|increases|Increases your) ?(?:your )?(dodge rating|defense rating|block rating|shield block rating|parry rating|armor|agility|stamina|block value|maximum health|resilience rating)(?: of your shield)? by (\d+)(?: for (\d+) sec)?', re.I)
FX_KEY = {'dodge rating': 'dodge', 'defense rating': 'def', 'block rating': 'block', 'shield block rating': 'block',
          'parry rating': 'parry', 'armor': 'armor', 'agility': 'agi', 'stamina': 'sta', 'block value': 'bv',
          'maximum health': 'hp', 'resilience rating': 'res'}


def effects(lines):
    """On-use and proc effects a tank cares about, from the green tooltip lines."""
    out = []
    for l in lines:
        if l[0] != 'g':
            continue
        t = l[1]
        if not (t.startswith('Use:') or 'chance' in t.lower() or 'for ' in t):
            continue
        m = USE_RE.search(t)
        if not m:
            continue
        kind, stat, amt, dur = m.group(1), m.group(2).lower(), int(m.group(3)), m.group(4)
        cd = re.search(r'\((\d+) (Min|Sec)s? Cooldown\)', t)
        e = {'kind': 'use' if kind == 'Use' else 'proc', 'stat': FX_KEY[stat], 'amount': amt}
        if dur:
            e['dur'] = int(dur)
        if cd:
            e['cd'] = int(cd.group(1)) * (60 if cd.group(2) == 'Min' else 1)
        if e['kind'] == 'proc' or dur:
            out.append(e)
    return out


FX_OVERRIDES = {
    34473: [{'kind': 'proc', 'stat': 'dodge', 'amount': 152, 'dur': 10, 'cd': 30, 'note': 'when a hit drops you below 35% health'}],
    38289: [{'kind': 'use', 'stat': 'bv', 'amount': 200, 'dur': 20, 'cd': 120}],
    29387: [{'kind': 'use', 'stat': 'bv', 'amount': 200, 'dur': 20, 'cd': 120}],
    23040: [{'kind': 'use', 'stat': 'bv', 'amount': 235, 'dur': 20, 'cd': 120}],
    30629: [{'kind': 'use', 'stat': 'def', 'amount': 165, 'dur': 15, 'cd': 180}],
    30300: [{'kind': 'use', 'stat': 'block', 'amount': 125, 'dur': 15, 'cd': 90}],
}

eq_ids = {int(x) for x in open(os.path.join(SIMS, 'assets/item_data/all_equippable_item_ids.csv')).read().split()[1:] if x.isdigit()}
# wowsims' list leaves out most grey, white and green gear; the cmangos item table has every item in the game
_c, _r = sqlrows.table(SQL, 'item_template')
_ix = {c: i for i, c in enumerate(_c)}
for _row in _r:
    if _row[_ix['class']] in ('2', '4') and _row[_ix['InventoryType']] not in ('0', '4', '18', '19', '24', '27', '28'):
        eq_ids.add(int(_row[_ix['entry']]))
eq_ids = sorted(eq_ids)
items, sets, checks = [], {}, {'compared': 0, 'differ': 0}
for iid in eq_ids:
    t = tips.get(iid)
    if not t or JUNK.search(t.get('name', '')):
        continue
    it = P.parse_item(iid, t)
    if not it:
        continue
    ws = ws_items.get(iid)
    if ws:
        checks['compared'] += 1
        # wowsims has the healing values the game uses in 2.4; everything else agrees with the tooltips
        if 'heal' in ws['st']:
            it['st']['heal'] = ws['st']['heal']
        diff = {k for k in set(ws['st']) | set(it['st']) if k not in ('rap', 'heal') and abs(ws['st'].get(k, 0) - it['st'].get(k, 0)) > 0.01}
        if diff:
            checks['differ'] += 1
        if ws['ph']:
            it['ph'] = ws['ph']
    fx = FX_OVERRIDES.get(iid) or effects(it['tt'])
    if fx:
        it['fx'] = fx
    if 'setId' in it:
        sets[it['setId']] = {'n': it.pop('setName'), 'p': it.pop('setPieces'), 'b': it.pop('setBonus')}
    for k in ('setName', 'setPieces', 'setBonus'):
        it.pop(k, None)
    items.append(it)
items.sort(key=lambda i: i['id'])


def set_bonus_stats(text):
    """plain stat set bonuses ('+35 Resilience Rating.', 'Increases attack power by 40.') -> stats; conditional ones stay text"""
    t = text.strip()
    if re.match(r'^Increases your armor by (\d+) in Bear Form and Dire Bear Form\.?$', t):
        return {'beararmor': int(re.match(r'^Increases your armor by (\d+)', t).group(1))}
    if re.match(r'^\+\d+ [A-Za-z ]+\.?$', t):
        return P.bonus_stats(t)
    if re.search(r'when|chance|your next|ability|Shout|pet|fighting|against|Form|while|for \d+ sec', t, re.I):
        return {}
    st = {}
    P.green_stats('Equip: ' + t, st)
    return st


BRACKETS = re.compile(r'\[([^\[\]]*)\]\[([^\[\]]*)\]')      # Wowhead's "[Blood][the Martyr]" (Horde/Alliance names)


def unbracket(t):
    return BRACKETS.sub(lambda m: m.group(1) + '/' + m.group(2), t) if isinstance(t, str) else t


for it in items:
    it['tt'] = [[unbracket(x) for x in line] for line in it['tt']]
for sv in sets.values():
    sv['b'] = [[n, unbracket(t)] for n, t in sv['b']]

nb = 0
for sid, sv in sets.items():
    out = []
    for n, text in sv['b']:
        st = set_bonus_stats(text)
        out.append([n, text, st] if st else [n, text])
        nb += bool(st)
    sv['b'] = out
print('items', len(items), 'sets', len(sets), 'stat set bonuses', nb, 'checked against wowsims', checks)

# ================================================================== gems
gems = []
for gid in [int(x) for x in open(os.path.join(SIMS, 'assets/item_data/all_gem_ids.csv')).read().split()[1:] if x.isdigit()]:
    t = tips.get(gid)
    if not t or JUNK.search(t.get('name', '')):
        continue
    g = P.parse_gem(gid, t)
    if g:
        gems.append(g)
gems.sort(key=lambda g: (g['c'], g['n']))
print('gems', len(gems))

# ================================================================== enchants
ench = {}


def put(e):
    key = e['n']
    old = ench.get(key)
    if old and old['st'] != e['st'] and e['st'] and old['st']:
        # same name, different effect (the five Lesser Arcanum of Voracity): keep each one
        ench[key + '#' + json.dumps(e['st'], sort_keys=True)] = e
        return
    if old and old.get('src') == 'item' and e.get('src') != 'item':
        return
    if old and old.get('rep') and not e.get('rep'):
        return
    ench[key] = e


for iid, t in sorted(tips.items()):
    nm = t.get('name', '')
    if JUNK.search(nm) or 'mount' in nm.lower():
        continue
    txt = P.clean(t['tooltip'])
    use = re.search(r'Use: (.*?)(?:Max Stack|Sell Price|Dropped by|$)', txt)
    if nm.startswith('Formula: Enchant'):
        m = re.search(r'(?:Teaches (?:you )?how to|Learn how to) ([^.]*\.)\s*(.*?)(?:Sell Price|$)', txt)
        if not m:
            continue
        body = m.group(2).strip() or ('Permanently ' + m.group(1))
        name, src = nm.replace('Formula: ', ''), 'formula'
    elif nm.startswith('Enchant ') and use:
        body, name, src = use.group(1), nm, 'item'
    elif use and re.match(r'(?:Permanently|Attaches)', use.group(1)) and not re.search(r'mount|fishing|lure|stealth|spurs', use.group(1), re.I) \
            and not nm.startswith(('Formula', 'Pattern', 'Plans', 'Schematic', 'Design', 'Recipe', 'Manual')):
        body, name, src = use.group(1), nm, 'kit'
    else:
        continue
    slots = P.ench_slots(name, body)
    if not slots:
        continue
    req = P.ench_req(body)
    m = re.search(r'can only be attached to level (\d+) and higher items', body, re.I)
    if m:
        req = int(m.group(1))
    tx = re.sub(r'\s*(?:Requires a level \d+ or higher item|Only us[e]?able on items level \d+ and above|Can only be attached to level \d+ and higher items)\.?', ' ', body)
    tx = re.sub(r'\s+', ' ', re.sub(r'\.(?=[A-Z])', '. ', tx)).strip()
    e = {'id': iid, 'n': name, 'sl': slots, 'st': P.ench_stats(tx), 'req': req, 'src': src, 'tx': tx, 'ic': t.get('icon', '')}
    cl = re.search(r'Classes: (Warrior|Paladin|Druid|Hunter|Rogue|Priest|Shaman|Mage|Warlock)', txt)
    if cl:
        e['cl'] = cl.group(1).lower()
    prof = re.search(r'Requires (Enchanting|Leatherworking|Tailoring|Blacksmithing|Engineering) \((\d+)\)', txt)
    if prof:
        e['prof'] = f'{prof.group(1)} ({prof.group(2)})'
    rep = re.search(r"Requires ([A-Z][\w' ]+?) - (Friendly|Honored|Revered|Exalted)", txt)
    if rep:
        e['rep'] = re.sub(r'^Level \d+(?:Requires )?', '', f'{rep.group(1)} - {rep.group(2)}').strip()
    if re.search(r"only the enchanter's rings", body, re.I):
        e['prof'] = 'Enchanters only'
    put(e)

# scopes only go on bows, guns and crossbows; the generic slot table already says 'ranged'
PROC = {'Enchant Weapon - Executioner', 'Enchant Weapon - Deathfrost', 'Enchant Weapon - Battlemaster', 'Enchant Weapon - Crusader', 'Enchant Weapon - Mongoose', 'Enchant Weapon - Spellsurge',
        'Enchant Weapon - Fiery Weapon', 'Enchant Weapon - Icy Chill', 'Enchant Weapon - Lifestealing', 'Enchant Weapon - Unholy',
        'Enchant Weapon - Demonslaying', 'Enchant Weapon - Lesser Beastslayer', 'Enchant Weapon - Lesser Elemental Slayer',
        'Enchant Weapon - Minor Beastslayer', 'Enchant Ring - Striking'}
OVERRIDE = {
    'Enchant Ring - Healing Power': {'heal': 20, 'sp': 7}, 'Arcanum of Focus': {'sp': 8, 'heal': 8},
    'Power of the Scourge': {'sp': 15, 'heal': 15, 'scrit': 14}, 'Resilience of the Scourge': {'heal': 31, 'sp': 11, 'mp5': 5},
    'Zandalar Signet of Mojo': {'sp': 18, 'heal': 18}, 'Zandalar Signet of Serenity': {'heal': 33},
    'Enchant Gloves - Healing Power': {'heal': 30, 'sp': 10}, 'Enchant Weapon - Healing Power': {'heal': 55, 'sp': 19},
    'Enchant Weapon - Spell Power': {'sp': 30, 'heal': 30}, 'Enchant Gloves - Fire Power': {'firesp': 20},
    'Enchant Gloves - Frost Power': {'frostsp': 20}, 'Enchant Gloves - Shadow Power': {'shadsp': 20},
    "Enchant Weapon - Winter's Might": {'frostsp': 7}, 'Enchant Cloak - Lesser Shadow Resistance': {'shadres': 10},
    'Enchant Chest - Lesser Mana': {'mana': 20}, 'Enchant Chest - Minor Mana': {'mana': 5},
    'Enchant Shield - Resilience': {'res': 12}, 'Heavy Armor Kit': {'armor': 24}, 'Rugged Armor Kit': {'armor': 40},
    'Thick Armor Kit': {'armor': 32}, 'Light Armor Kit': {'armor': 8}, 'Medium Armor Kit': {'armor': 16},
    'Enchant Gloves - Riding Skill': {}, 'Enchant Gloves - Herbalism': {}, 'Enchant Gloves - Mining': {},
    'Stabilized Eternium Scope': {'rcrit': 28},
}
TEXT_FIX = {'Enchant Shield - Resilience': 'Permanently enchant a shield to increase resilience rating by 12.'}
for n, e in ench.items():
    if n in PROC:
        e['st'] = {}
    if n in OVERRIDE:
        e['st'] = OVERRIDE[n]
    if n in TEXT_FIX:
        e['tx'] = TEXT_FIX[n]
    if n.startswith('Enchant Ring'):
        e['req'] = 35
        e['prof'] = 'Enchanters only'

# enchants the tooltip data leaves out: trainer-taught recipes (no recipe item) and a few TBC ones.
# (slot, name, stats, item level needed, wowhead spell id or 0, text)
MANUAL = [
    ('shield', 'Enchant Shield - Tough Shield', {'bv': 18}, 35, 27944, 'Permanently enchant a shield to increase block value by 18.'),
    ('chest', 'Enchant Chest - Restore Mana Prime', {'mp5': 6}, 35, 33991, 'Permanently enchant a piece of chest armor to restore 6 mana every 5 seconds.'),
    # Classic trainer recipes (stats unchanged in TBC)
    ('wrist', 'Enchant Bracer - Minor Health', {'hp': 5}, 0, 0, ''), ('wrist', 'Enchant Bracer - Minor Stamina', {'sta': 1}, 0, 0, ''),
    ('wrist', 'Enchant Bracer - Minor Agility', {'agi': 1}, 0, 0, ''), ('wrist', 'Enchant Bracer - Lesser Stamina', {'sta': 3}, 0, 0, ''),
    ('wrist', 'Enchant Bracer - Lesser Intellect', {'int': 3}, 0, 0, ''), ('wrist', 'Enchant Bracer - Stamina', {'sta': 5}, 0, 0, ''),
    ('wrist', 'Enchant Bracer - Strength', {'str': 5}, 0, 0, ''), ('wrist', 'Enchant Bracer - Spirit', {'spi': 5}, 0, 0, ''),
    ('wrist', 'Enchant Bracer - Intellect', {'int': 5}, 0, 0, ''), ('wrist', 'Enchant Bracer - Greater Strength', {'str': 7}, 0, 0, ''),
    ('chest', 'Enchant Chest - Minor Health', {'hp': 5}, 0, 0, ''), ('chest', 'Enchant Chest - Lesser Health', {'hp': 15}, 0, 0, ''),
    ('chest', 'Enchant Chest - Health', {'hp': 25}, 0, 0, ''), ('chest', 'Enchant Chest - Greater Health', {'hp': 35}, 0, 0, ''),
    ('chest', 'Enchant Chest - Superior Health', {'hp': 50}, 0, 0, ''), ('chest', 'Enchant Chest - Mana', {'mana': 30}, 0, 0, ''),
    ('chest', 'Enchant Chest - Greater Mana', {'mana': 50}, 0, 0, ''), ('chest', 'Enchant Chest - Superior Mana', {'mana': 65}, 0, 0, ''),
    ('chest', 'Enchant Chest - Minor Stats', {'str': 1, 'agi': 1, 'sta': 1, 'int': 1, 'spi': 1}, 0, 0, ''),
    ('chest', 'Enchant Chest - Lesser Stats', {'str': 2, 'agi': 2, 'sta': 2, 'int': 2, 'spi': 2}, 0, 0, ''),
    ('chest', 'Enchant Chest - Stats', {'str': 3, 'agi': 3, 'sta': 3, 'int': 3, 'spi': 3}, 0, 0, ''),
    ('back', 'Enchant Cloak - Minor Resistance', {'arcres': 1, 'fireres': 1, 'frostres': 1, 'natres': 1, 'shadres': 1}, 0, 0, ''),
    ('back', 'Enchant Cloak - Minor Protection', {'armor': 10}, 0, 0, ''), ('back', 'Enchant Cloak - Lesser Protection', {'armor': 20}, 0, 0, ''),
    ('back', 'Enchant Cloak - Lesser Fire Resistance', {'fireres': 5}, 0, 0, ''), ('back', 'Enchant Cloak - Defense', {'armor': 30}, 0, 0, ''),
    ('back', 'Enchant Cloak - Resistance', {'arcres': 3, 'fireres': 3, 'frostres': 3, 'natres': 3, 'shadres': 3}, 0, 0, ''),
    ('back', 'Enchant Cloak - Fire Resistance', {'fireres': 7}, 0, 0, ''), ('back', 'Enchant Cloak - Greater Defense', {'armor': 50}, 0, 0, ''),
    ('feet', 'Enchant Boots - Minor Speed', {}, 0, 0, 'Permanently enchant boots to give a slight movement speed increase.'),
    ('feet', 'Enchant Boots - Lesser Agility', {'agi': 3}, 0, 0, ''), ('feet', 'Enchant Boots - Lesser Stamina', {'sta': 3}, 0, 0, ''),
    ('feet', 'Enchant Boots - Stamina', {'sta': 5}, 0, 0, ''), ('feet', 'Enchant Boots - Agility', {'agi': 5}, 0, 0, ''),
    ('hands', 'Enchant Gloves - Agility', {'agi': 5}, 0, 0, ''), ('hands', 'Enchant Gloves - Strength', {'str': 5}, 0, 0, ''),
    ('hands', 'Enchant Gloves - Minor Haste', {}, 0, 0, 'Permanently enchant gloves to increase attack speed slightly.'),
    ('shield', 'Enchant Shield - Minor Stamina', {'sta': 1}, 0, 0, ''), ('shield', 'Enchant Shield - Lesser Stamina', {'sta': 3}, 0, 0, ''),
    ('shield', 'Enchant Shield - Lesser Spirit', {'spi': 3}, 0, 0, ''), ('shield', 'Enchant Shield - Spirit', {'spi': 5}, 0, 0, ''),
    ('shield', 'Enchant Shield - Greater Spirit', {'spi': 7}, 0, 0, ''),
    ('2h', 'Enchant 2H Weapon - Minor Impact', {}, 0, 0, 'Permanently enchant a two-handed melee weapon to do +2 damage.'),
    ('2h', 'Enchant 2H Weapon - Lesser Impact', {}, 0, 0, 'Permanently enchant a two-handed melee weapon to do +3 damage.'),
    ('2h', 'Enchant 2H Weapon - Impact', {}, 0, 0, 'Permanently enchant a two-handed melee weapon to do +5 damage.'),
    ('2h', 'Enchant 2H Weapon - Greater Impact', {}, 0, 0, 'Permanently enchant a two-handed melee weapon to do +7 damage.'),
    ('weapon', 'Enchant Weapon - Minor Striking', {}, 0, 0, 'Permanently enchant a melee weapon to do 1 additional point of damage.'),
    ('weapon', 'Enchant Weapon - Lesser Striking', {}, 0, 0, 'Permanently enchant a melee weapon to do 2 additional points of damage.'),
    ('weapon', 'Enchant Weapon - Striking', {}, 0, 0, 'Permanently enchant a melee weapon to do 3 additional points of damage.'),
    ('weapon', 'Enchant Weapon - Greater Striking', {}, 0, 0, 'Permanently enchant a melee weapon to do 4 additional points of damage.'),
]
STAT_WORDS = {'hp': 'health', 'sta': 'Stamina', 'agi': 'Agility', 'str': 'Strength', 'int': 'Intellect', 'spi': 'Spirit', 'mana': 'mana',
              'armor': 'armor', 'fireres': 'fire resistance'}
for slot, name, st, req, spell, text in MANUAL:
    if name in ench:
        continue
    if not text:
        if len(st) == 5 and 'str' in st:
            text = f'Permanently increases all stats by {st["str"]}.'
        elif len(st) == 5:
            text = f'Permanently increases all resistances by {st["arcres"]}.'
        else:
            k, v = next(iter(st.items()))
            text = f'Permanently increases {STAT_WORDS.get(k, k)} by {v}.'
    put({'id': spell, **({'spell': 1} if spell else {}), 'n': name, 'sl': [slot], 'st': st, 'req': req, 'src': 'trainer', 'tx': text, 'ic': 'trade_engraving'})

NICE = {'str': 'Strength', 'agi': 'Agility', 'sta': 'Stamina', 'int': 'Intellect', 'spi': 'Spirit'}
by_base = {}
for e in ench.values():
    by_base.setdefault(e['n'], []).append(e)
for n, group in by_base.items():
    if len(group) > 1:
        for e in group:
            e['n'] = f"{n} ({', '.join(f'+{v} {NICE.get(k, k)}' for k, v in e['st'].items())})"
enchants = sorted(ench.values(), key=lambda e: (e['sl'][0], e['n']))
import zlib  # noqa: E402
for e in enchants:
    # the app's own enchant key, from the name so it stays the same when the data is rebuilt (ids from different
    # sources can collide); saved characters store it
    e['k'] = zlib.crc32(e['n'].encode()) & 0x3fffffff
assert len({e['k'] for e in enchants}) == len(enchants), 'enchant key collision'

# wowsims' enchant ids -> our keys, so characters saved by earlier versions keep their enchants
alias = {}
ws_names = {}
ws_eff = {}             # the game's enchant (SpellItemEnchantment) id, used in item links
for line in open(os.path.join(SIMS, 'sim/core/items/all_enchants.go')).read().splitlines():
    line = line.strip()
    if line.startswith('{ID:'):
        wid = int(re.search(r'\bID:\s*(\d+)', line).group(1))
        nm = re.search(r'Name:\s*"([^"]+)"', line).group(1)
        ws_names[wid] = nm
        m_eff = re.search(r'EffectID:\s*(\d+)', line)
        if m_eff:
            ws_eff[wid] = int(m_eff.group(1))


def norm(n):
    n = n.lower()
    n = re.sub(r'^(chest|bracer|gloves|cloak|boots|shield|weapon|2h weapon|ring) - ', lambda m: 'enchant ' + m.group(1) + ' - ', n)
    return {'major defense': 'enchant bracer - major defense', 'savagery': 'enchant 2h weapon - savagery',
            'sunfire': 'enchant weapon - sunfire', 'soulfrost': 'enchant weapon - soulfrost',
            'deathfrost': 'enchant weapon - deathfrost', 'enchant gloves - major agility': 'enchant gloves - superior agility'}.get(n, n)


by_name = {e['n'].lower(): e for e in enchants}
for wid, nm in ws_names.items():
    e = by_name.get(norm(nm))
    if e:
        alias[wid] = e['k']
        if wid in ws_eff:
            e['eff'] = ws_eff[wid]
    else:
        print('  no enchant for wowsims', wid, nm)
print('enchants', len(enchants), 'aliases', len(alias))

# ================================================================== consumables (cmangos item classes + tooltips)
cols, rows = sqlrows.table(SQL, 'item_template')
ix = {c: i for i, c in enumerate(cols)}
_, el = sqlrows.table(SQL, 'spell_elixir')
elix = {int(r[0]): int(r[1]) for r in el}
cons = {}
for r in rows:
    if r[ix['class']] != '0':
        continue
    sub, sp, iid = int(r[ix['subclass']]), int(r[ix['spellid_1']]), int(r[ix['entry']])
    t = tips.get(iid)
    if not t or JUNK.search(t.get('name', '')) or t.get('name', '').startswith('Flaskataur'):   # unreleased test flasks
        continue
    txt = P.clean(t['tooltip'])
    m = re.search(r'Use: (.*?)(?:\(\d+ (?:Min|Sec|Hour)s? Cooldown\)|Max Stack|Sell Price|Requires|$)', txt)
    use = (m.group(1) if m else '').strip()
    cat, where = None, ''
    if sp in elix:
        mask = elix[sp]
        cat = {1: 'battle', 2: 'guardian', 3: 'flask', 7: 'flask', 11: 'flask'}.get(mask)
        if mask == 7:
            where = 'Only works in Blade\'s Edge Mountains, Gruul\'s Lair and Magtheridon\'s Lair (Unstable Flask).'
        if mask == 11:
            where = 'Only works in Tempest Keep, Serpentshrine Cavern, Hyjal, Black Temple and Sunwell Plateau (Shattrath Flask).'
    elif sub == 5 and re.search(r'well fed', txt, re.I):
        cat = 'food'
    elif sub == 4 and t['name'].startswith('Scroll of'):
        cat = 'scroll'
    elif sub == 1 and re.search(r'for \d+ (?:sec|min)', use) and re.search(r'armor|Stamina|Strength|Agility|maximum health|dodge|defense|block', use, re.I):
        cat = 'potion'
    if not cat:
        continue
    st = P.consumable_stats(use)
    dur = re.search(r'for (\d+) (sec|min|hour|hours|hrs?)\b', use)
    c = {'id': iid, 'n': t['name'], 'c': cat, 'q': int(t.get('quality', 1)), 'ic': t.get('icon', ''), 'st': st,
         'tx': re.sub(r'\s*(?:Counts as both a Battle and Guardian elixir|(?:Battle|Guardian) Elixir)\.', '', use).strip(), 'rl': int(r[ix['RequiredLevel']] or 0)}
    if where:
        c['where'] = where
    if cat == 'scroll':
        c['g'] = re.sub(r'\s+[IVX]+$', '', t['name'])          # scrolls of different kinds stack
    if cat == 'potion' and dur:
        c['dur'] = int(dur.group(1)) * (60 if dur.group(2).startswith('min') else 1)
    if cat == 'food' and re.search(r'stamina', use, re.I) is None and not st:
        continue
    key = (cat, t['name'])
    if key not in cons or (st and not cons[key]['st']):
        cons[key] = c
consumables = sorted(cons.values(), key=lambda c: (c['c'], c['n']))
from collections import Counter  # noqa: E402
print('consumables', Counter(c['c'] for c in consumables))

# ================================================================== bosses
from bosses import BOSSES  # noqa: E402  (hand-written list with notes: tools/bosses.py)
cols, rows = sqlrows.table(SQL, 'creature_template')
cix = {c: i for i, c in enumerate(cols)}
crt = {int(r[cix['Entry']]): r for r in rows}
_, cls_rows = sqlrows.table(SQL, 'creature_template_classlevelstats')
cls_stats = {(int(r[0]), int(r[1])): r for r in cls_rows}
script_dir = os.path.join(MANGOS, 'src/game/AI/ScriptDevAI/scripts')
spell_consts = {}
for dp, _dn, fns in os.walk(script_dir):
    for fn in fns:
        if fn.endswith('.cpp') or fn.endswith('.h'):
            for name, sid in re.findall(r'\b(SPELL_[A-Z0-9_]+)\s*=\s*(\d+)', open(os.path.join(dp, fn), errors='replace').read()):
                spell_consts.setdefault((fn, name), int(sid))
                spell_consts.setdefault(('*', name), int(sid))
bosses = []
for b in BOSSES:
    r = crt.get(b['entry'])
    if not r:
        print('  missing creature', b['entry'], b['n'])
        continue
    lvl = int(r[cix['MaxLevel']])
    rank = int(r[cix['Rank']])
    level = 73 if rank == 3 else lvl                                    # bosses ("??") fight as level 73
    swing = int(r[cix['MeleeBaseAttackTime']]) / 1000
    cl = int(r[cix['UnitClass']])
    exp = int(r[cix['Expansion']])
    st = cls_stats.get((min(level, 73), cl))
    dmg = None
    if st and float(r[cix['DamageMultiplier']]) > 0:
        base = float(st[6 if exp >= 1 else 5])
        var = float(r[cix['DamageVariance']])
        mult = float(r[cix['DamageMultiplier']])
        ap = float(st[7])
        dmg = [round(base * (1 - var / 2) * mult + ap / 14), round(base * (1 + var / 2) * mult + ap / 14)]
    if b.get('dmg') == 'none':
        dmg = None
    abil = []
    for a in b.get('abilities', []):
        sid = a.get('id') or (spell_consts.get((b['script'], a['const'])) if a.get('const') else None)
        if a.get('const') and not sid:
            print('  no spell id for', b['n'], a['const'])
        abil.append({k: v for k, v in (('n', a['n']), ('id', sid), ('d', a.get('d', ''))) if v})
    bosses.append({'id': b['entry'], 'n': b['n'], 'raid': b['raid'], 'lvl': level, 'swing': swing, 'dmg': dmg,
                   'note': b.get('note', ''), 'ab': abil, **({'adds': b['adds']} if b.get('adds') else {}),
                   **({'dw': 1} if b.get('dw') else {}), **({'phase': b['phase']} if b.get('phase') else {})})
print('bosses', len(bosses))

# ================================================================== base stats and talents (unchanged sources)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen_talents.py')).read())

json.dump({'items': items, 'sets': sets}, open(os.path.join(WEB, 'items.json'), 'w'), separators=(',', ':'))
json.dump(gems, open(os.path.join(WEB, 'gems.json'), 'w'), separators=(',', ':'))
json.dump({'list': enchants, 'alias': alias}, open(os.path.join(WEB, 'enchants.json'), 'w'), separators=(',', ':'))
json.dump(consumables, open(os.path.join(WEB, 'consumables.json'), 'w'), separators=(',', ':'))
json.dump(bosses, open(os.path.join(WEB, 'bosses.json'), 'w'), separators=(',', ':'))
for f in ('items', 'gems', 'enchants', 'consumables', 'bosses'):
    print(f, os.path.getsize(os.path.join(WEB, f + '.json')) // 1024, 'KB')
