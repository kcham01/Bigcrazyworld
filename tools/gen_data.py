#!/usr/bin/env python3
"""Builds the game data the app ships with (src/data/*.json and web/talents/*.png).

Sources (not stored in this repo, pass their folders as arguments):
  wowsims/tbc  (MIT)   item, gem and enchant stats, item tooltips from Wowhead, talent tree layouts,
                       race and class base stats
  oppahansi/ltc (GPL-3) talent names, rank descriptions and talent icons

  python3 tools/gen_data.py <wowsims-tbc folder> <ltc folder>
"""
import csv, html, json, os, re, sys

csv.field_size_limit(1 << 30)
SIMS, LTC = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'data')
os.makedirs(OUT, exist_ok=True)

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
SLOT = {'Head': 'head', 'Neck': 'neck', 'Shoulder': 'shoulder', 'Back': 'back', 'Chest': 'chest',
        'Wrist': 'wrist', 'Hands': 'hands', 'Waist': 'waist', 'Legs': 'legs', 'Feet': 'feet',
        'Finger': 'finger', 'Trinket': 'trinket', 'Weapon': 'weapon', 'Ranged': 'ranged'}
CLASS = {'Warrior': 'warrior', 'Paladin': 'paladin', 'Druid': 'druid', 'Hunter': 'hunter', 'Rogue': 'rogue',
         'Priest': 'priest', 'Shaman': 'shaman', 'Mage': 'mage', 'Warlock': 'warlock'}
TANKS = {'warrior', 'paladin', 'druid'}


def parse_stats(s):
    out = {}
    for name, val in re.findall(r'stats\.(\w+):\s*(-?[\d.]+)', s or ''):
        k = STAT_KEYS.get(name)
        if k:
            v = float(val)
            out[k] = int(v) if v == int(v) else v
    return out


def field(line, name):
    m = re.search(name + r':\s*("(?:[^"\\]|\\.)*"|[^,}]+(?:\{[^}]*\})?)', line)
    if not m:
        return None
    v = m.group(1).strip()
    if v.startswith('"'):
        return json.loads(v)
    return v


def block(line, name):
    m = re.search(name + r':\s*stats\.Stats\{([^}]*)\}', line)
    return m.group(1) if m else ''


def enum_tail(v, prefix):
    if not v:
        return None
    m = re.search(prefix + r'(\w+)', v)
    return m.group(1) if m else None


# ---------------------------------------------------------------- tooltips
tips = {}
with open(os.path.join(SIMS, 'assets/item_data/all_item_tooltips.csv'), encoding='utf-8') as f:
    next(f)
    for row in f:
        parts = row.rstrip('\n').split(',', 2)
        if len(parts) < 3:
            continue
        try:
            tips[int(parts[0])] = json.loads(parts[2])
        except Exception:
            pass


def clean(s):
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('\xa0', ' ').strip()


def parse_tooltip(t):
    """Wowhead's tooltip HTML -> a list of [style, text] lines plus a few structured bits."""
    h = t.get('tooltip', '')
    info = {}
    m = re.search(r'Dropped by: ([^<]+)', h)
    if m:
        info['drop'] = html.unescape(m.group(1)).strip()
    m = re.search(r'Drop Chance: ([\d.]+%)', h)
    if m:
        info['chance'] = m.group(1)
    # set: name, pieces, bonuses
    m = re.search(r'<a href="/item-set=(\d+)" class="q">([^<]+)</a> \(0/(\d+)\)', h)
    if m:
        info['setId'] = int(m.group(1))
        info['setName'] = html.unescape(m.group(2))
        info['setPieces'] = [int(x) for x in re.findall(r'<!--si(\d+)-->', h)]
        info['setBonus'] = [[int(n), clean(txt)] for n, txt in re.findall(r'\((\d+)\) Set\s*:\s*(.*?)</span>', h, re.S)]
        h = h[:h.index(m.group(0))]  # set listing is rendered separately
    h = re.sub(r'<div class="whtt-sellprice">.*?</div>', '', h, flags=re.S)
    h = re.sub(r'<div class="whtt-extra[^"]*">.*?</div>', '', h, flags=re.S)
    h = re.sub(r'<th><b class="q0 whtt-extra">[^<]*</b></th>', '', h)
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
    # left/right rows (slot | type, damage | speed)
    def lr(mm):
        return '<br>@@LR@@' + clean(mm.group(1)) + '||' + clean(mm.group(2)) + '<br>'
    h = re.sub(r'<table width="100%"><tr>\s*<td>(.*?)</td>\s*<th>(.*?)</th>\s*</tr></table>', lr, h, flags=re.S)
    h = re.sub(r'<a href="/items/gems[^"]*" class="socket-(\w+) q0">[^<]*</a>', r'<br>@@SOCK@@\1<br>', h)
    parts = re.split(r'<br\s*/?>|</?div[^>]*>|</?table[^>]*>|</?tr>|</?td>', h)
    lines = []
    first = True
    for p in parts:
        if '@@LR@@' in p:
            a, b = p.split('@@LR@@', 1)[1].split('||', 1)
            lines.append(['lr', a, b])
            continue
        if '@@SOCK@@' in p:
            lines.append(['sock', p.split('@@SOCK@@', 1)[1].strip()])
            continue
        cls = 'w'
        if 'class="q2"' in p:
            cls = 'g'
        elif 'class="q0' in p:
            cls = 'q0'
        elif re.search(r'class="q"', p):
            cls = 'y'
        txt = clean(p)
        if not txt:
            continue
        if first and txt == t.get('name'):
            first = False
            continue
        first = False
        if txt.startswith('Item Level') or txt.startswith('Durability') or txt.startswith('Sell Price') or txt.startswith('Phase '):
            continue
        if txt.startswith('Classes:'):
            cls = 'w'
        lines.append([cls, txt])
    info['lines'] = lines
    return info


# on-use / proc effects a tank cares about, read from the green lines
USE_RE = re.compile(r'^(Use|Equip|Chance on hit): .*?(?:Increases|increases|Increases your) ?(?:your )?(dodge rating|defense rating|block rating|shield block rating|parry rating|armor|agility|stamina|block value|maximum health|resilience rating)(?: of your shield)? by (\d+)(?: for (\d+) sec)?', re.I)


def effects(lines):
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
        key = {'dodge rating': 'dodge', 'defense rating': 'def', 'block rating': 'block', 'shield block rating': 'block',
               'parry rating': 'parry', 'armor': 'armor', 'agility': 'agi', 'stamina': 'sta', 'block value': 'bv',
               'maximum health': 'hp', 'resilience rating': 'res'}[stat]
        cd = re.search(r'\((\d+) (Min|Sec)s? Cooldown\)', t)
        e = {'kind': 'use' if kind == 'Use' else 'proc', 'stat': key, 'amount': amt}
        if dur:
            e['dur'] = int(dur)
        if cd:
            e['cd'] = int(cd.group(1)) * (60 if cd.group(2) == 'Min' else 1)
        if e['kind'] == 'proc' or dur:
            out.append(e)
    return out


# ---------------------------------------------------------------- items
items = []
src = open(os.path.join(SIMS, 'sim/core/items/all_items.go')).read()
for line in src.splitlines():
    line = line.strip()
    if not line.startswith('{Name:'):
        continue
    iid = int(field(line, 'ID'))
    allow = [CLASS[c] for c in re.findall(r'Class_Class(\w+)', re.search(r'ClassAllowlist: \[\]proto.Class\{([^}]*)\}', line).group(1))] if 'ClassAllowlist' in line else None
    if allow and not (set(allow) & TANKS):
        continue
    typ = SLOT[enum_tail(field(line, 'Type'), 'ItemType_ItemType')]
    rtype = enum_tail(field(line, 'RangedWeaponType'), 'RangedWeaponType_RangedWeaponType')
    if rtype in ('Wand', 'Totem'):
        continue
    it = {
        'id': iid, 'n': field(line, 'Name'), 's': typ,
        'q': {'Junk': 0, 'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Epic': 4, 'Legendary': 5, 'Artifact': 6}[enum_tail(field(line, 'Quality'), 'ItemQuality_ItemQuality')],
        'il': int(field(line, 'Ilvl') or 0), 'ph': int(field(line, 'Phase') or 0),
        'st': parse_stats(block(line, 'Stats')),
    }
    at = enum_tail(field(line, 'ArmorType'), 'ArmorType_ArmorType')
    if at:
        it['at'] = at.lower()
    wt = enum_tail(field(line, 'WeaponType'), 'WeaponType_WeaponType')
    if wt:
        it['wt'] = wt.lower()
    ht = enum_tail(field(line, 'HandType'), 'HandType_HandType')
    if ht:
        it['ht'] = {'MainHand': 'mh', 'OffHand': 'oh', 'OneHand': '1h', 'TwoHand': '2h'}[ht]
    if rtype:
        it['rt'] = rtype.lower()
    if 'Unique: true' in line:
        it['u'] = 1
    if allow:
        it['cl'] = allow
    socks = re.search(r'GemSockets: \[\]proto.GemColor\{([^}]*)\}', line)
    if socks:
        it['so'] = [c.lower() for c in re.findall(r'GemColor_GemColor(\w+)', socks.group(1))]
    sb = parse_stats(block(line, 'SocketBonus'))
    if sb:
        it['sb'] = sb
    dmin, dmax, spd = field(line, 'WeaponDamageMin'), field(line, 'WeaponDamageMax'), field(line, 'SwingSpeed')
    if dmin:
        it['dmg'] = [float(dmin), float(dmax), float(spd)]
    t = tips.get(iid)
    if t:
        it['ic'] = t.get('icon', '')
        tt = parse_tooltip(t)
        it['tt'] = tt['lines']
        for k in ('drop', 'chance', 'setId', 'setName', 'setPieces', 'setBonus'):
            if k in tt:
                it[k] = tt[k]
        fx = effects(tt['lines'])
        if fx:
            it['fx'] = fx
    else:
        it['ic'] = ''
    items.append(it)

FX_OVERRIDES = {
    34473: [{'kind': 'proc', 'stat': 'dodge', 'amount': 152, 'dur': 10, 'cd': 30, 'note': 'when a hit drops you below 35% health'}],
    38289: [{'kind': 'use', 'stat': 'bv', 'amount': 200, 'dur': 20, 'cd': 120}],
    29387: [{'kind': 'use', 'stat': 'bv', 'amount': 200, 'dur': 20, 'cd': 120}],
    23040: [{'kind': 'use', 'stat': 'bv', 'amount': 235, 'dur': 20, 'cd': 120}],
    30629: [{'kind': 'use', 'stat': 'def', 'amount': 165, 'dur': 15, 'cd': 180}],
    30300: [{'kind': 'use', 'stat': 'block', 'amount': 125, 'dur': 15, 'cd': 90}],
}
for it in items:
    if it['id'] in FX_OVERRIDES:
        it['fx'] = FX_OVERRIDES[it['id']]

# sets are stored once
sets = {}
for it in items:
    if 'setId' in it:
        sid = it['setId']
        sets[sid] = {'n': it.pop('setName'), 'p': it.pop('setPieces'), 'b': it.pop('setBonus')}
    else:
        for k in ('setName', 'setPieces', 'setBonus'):
            it.pop(k, None)

# ---------------------------------------------------------------- gems
gems = []
for line in open(os.path.join(SIMS, 'sim/core/items/all_gems.go')).read().splitlines():
    line = line.strip()
    if not line.startswith('{Name:'):
        continue
    gid = int(field(line, 'ID'))
    g = {'id': gid, 'n': field(line, 'Name'),
         'q': {'Uncommon': 2, 'Rare': 3, 'Epic': 4, 'Common': 1}.get(enum_tail(field(line, 'Quality'), 'ItemQuality_ItemQuality'), 2),
         'c': enum_tail(field(line, 'Color'), 'GemColor_GemColor').lower(), 'ph': int(field(line, 'Phase') or 0),
         'st': parse_stats(block(line, 'Stats'))}
    if 'Unique: true' in line:
        g['u'] = 1
    t = tips.get(gid)
    if t:
        g['ic'] = t.get('icon', '')
        h = t.get('tooltip', '')
        m = re.search(r'<!--egstats--><!--eistats--><br />(.*?)(?:<!--gemConditions-->|</td>)', h, re.S)
        if m:
            g['tx'] = clean(m.group(1))
        cond = re.findall(r'<div class="q0">(Requires[^<]*)</div>', h)
        if cond:
            g['req'] = [html.unescape(c) for c in cond]
    gems.append(g)

# dedupe gems by name+stats (wowsims has some duplicate ids)
seen = set()
gems2 = []
for g in sorted(gems, key=lambda g: (g['n'], -g['id'])):
    key = (g['n'], json.dumps(g['st'], sort_keys=True))
    if key in seen:
        continue
    seen.add(key)
    gems2.append(g)
gems = gems2

# ---------------------------------------------------------------- enchants
enchants = []
for line in open(os.path.join(SIMS, 'sim/core/items/all_enchants.go')).read().splitlines():
    line = line.strip()
    if not line.startswith('{ID:'):
        continue
    eid = int(field(line, 'ID'))
    allow = [CLASS[c] for c in re.findall(r'Class_Class(\w+)', re.search(r'ClassAllowlist: \[\]proto.Class\{([^}]*)\}', line).group(1))] if 'ClassAllowlist' in line else None
    if allow and not (set(allow) & TANKS):
        continue
    e = {'id': eid, 'eff': int(field(line, 'EffectID')), 'n': field(line, 'Name'),
         's': SLOT.get(enum_tail(field(line, 'ItemType'), 'ItemType_ItemType'), ''),
         'q': {'Common': 1, 'Uncommon': 2, 'Rare': 3, 'Epic': 4}.get(enum_tail(field(line, 'Quality'), 'ItemQuality_ItemQuality'), 2),
         'st': parse_stats(block(line, 'Bonus'))}
    if 'IsSpellID: true' in line:
        e['spell'] = 1
    if allow:
        e['cl'] = allow
    if 'EnchantType_EnchantTypeShield' in line:
        e['shield'] = 1
    if 'EnchantType_EnchantTypeTwoHand' in line:
        e['twohand'] = 1
    t = tips.get(eid)
    if t and 'spell' not in e:
        e['ic'] = t.get('icon', '')
    enchants.append(e)

# ---------------------------------------------------------------- base stats
def base_stats(path, cls):
    s = open(path).read()
    out = {}
    named = {}
    for name, body in re.findall(r'(\w+) := stats\.Stats\{(.*?)\n\t\}', s, re.S):
        named[name] = body
    for race, rest in re.findall(r'BaseStatsKey\{Race: proto\.Race_Race(\w+), Class: proto\.Class_Class\w+\}\] = (stats\.Stats\{.*?\n\t\}|\w+)', s, re.S):
        body = named[rest] if not rest.startswith('stats.Stats') else rest
        vals = {}
        for k, v, _c in re.findall(r"stats\.(\w+):\s*([-\d.]+)(?:\s*\*\s*core\.(\w+))?", body):
            vals[k] = float(v)
        dodge = re.search(r'stats\.Dodge:\s*([-\d.]+)', body)
        r = race.replace('10', '').replace('30', '')
        out[r.lower()] = {'hp': vals.get('Health', 0), 'str': vals.get('Strength', 0), 'agi': vals.get('Agility', 0),
                          'sta': vals.get('Stamina', 0), 'int': vals.get('Intellect', 0), 'spi': vals.get('Spirit', 0),
                          'dodge': float(dodge.group(1)) if dodge else 0}
    return out

bases = {
    'warrior': base_stats(os.path.join(SIMS, 'sim/warrior/warrior.go'), 'warrior'),
    'paladin': base_stats(os.path.join(SIMS, 'sim/paladin/paladin.go'), 'paladin'),
    'druid': base_stats(os.path.join(SIMS, 'sim/druid/druid.go'), 'druid'),
}

# ---------------------------------------------------------------- talents
ltc = os.path.join(LTC, 'app/src/main/java/com/oppahansi/ltc/utils/')


def parse_java(fn, key):
    body = open(os.path.join(ltc, fn)).read()
    body = body[body.index('{', body.index(key)):]
    stack, root, i = [], None, 0
    while i < len(body):
        c = body[i]
        if c == '{':
            new = []
            if stack:
                stack[-1].append(new)
            else:
                root = new
            stack.append(new)
        elif c == '}':
            stack.pop()
            if not stack:
                break
        elif c == '"':
            j = i + 1
            while body[j] != '"' or body[j - 1] == '\\':
                j += 1
            stack[-1].append(body[i + 1:j].replace('\\"', '"'))
            i = j
        i += 1
    return root


names = parse_java('TalentNames.java', 'TALENT_NAMES =')[1]      # [class][tree][pos], TBC = index 1
icons = parse_java('TalentIcons.java', 'TALENT_TREE_TALENT_ICONS =')  # [class][tree][pos] (expansion handled below)
descs = parse_java('RankDescriptionsTbc.java', 'RANK_DESCRIPTIONS =')
LTC_CLASS = {'druid': 0, 'paladin': 3, 'warrior': 8}


def ts_talents(cls):
    s = open(os.path.join(SIMS, f'ui/core/talents/{cls}.ts')).read()
    trees = []
    for tree in re.split(r"\n\t\{\n\t\tname: ", s)[1:]:
        tname = re.match(r"'([^']+)'", tree).group(1)
        bg = re.search(r"backgroundUrl: '([^']+)'", tree)
        ts = []
        for t in re.findall(r"\{\n\t\t\t\t(?://)?fieldName: '(\w+)',\n\t\t\t\tlocation: \{\n\t\t\t\t\trowIdx: (\d+),\n\t\t\t\t\tcolIdx: (\d+),\n\t\t\t\t\},\n(?:\t\t\t\tprereqLocation: \{\n\t\t\t\t\trowIdx: (\d+),\n\t\t\t\t\tcolIdx: (\d+),\n\t\t\t\t\},\n)?\t\t\t\tspellIds: \[([\d, ]*)\],\n\t\t\t\tmaxPoints: (\d+),", tree):
            f, r, c, pr, pc, sp, mp = t
            d = {'f': f, 'r': int(r), 'c': int(c), 'max': int(mp), 'spells': [int(x) for x in sp.split(',') if x.strip()]}
            if pr:
                d['req'] = [int(pr), int(pc)]
            ts.append(d)
        trees.append({'name': tname, 'talents': ts})
    return trees


talents = {}
icon_dir = os.path.join(ROOT, 'web', 'talents')
os.makedirs(icon_dir, exist_ok=True)
res = os.path.join(LTC, 'app/src/main/res/drawable-xxhdpi')
from PIL import Image
for cls in ('warrior', 'paladin', 'druid'):
    trees = ts_talents(cls)
    ci = LTC_CLASS[cls]
    for ti, tree in enumerate(trees):
        nm, ds, ic = names[ci][ti], descs[ci][ti], icons[1][ci][ti]
        for t in tree['talents']:
            pos = t['r'] * 4 + t['c']
            t['n'] = nm[pos]
            t['d'] = [x for x in ds[pos] if x]
            icon = ic[pos]
            t['ic'] = icon
            src = os.path.join(res, icon + '.png')
            dst = os.path.join(icon_dir, icon + '.jpg')
            if os.path.exists(src) and not os.path.exists(dst):
                Image.open(src).convert('RGB').resize((56, 56), Image.LANCZOS).save(dst, quality=86, optimize=True)
            if not os.path.exists(src):
                print('missing talent icon', cls, t['n'], icon)
        talents[cls] = trees

json.dump({'items': items, 'sets': sets}, open(os.path.join(OUT, 'items.json'), 'w'), separators=(',', ':'))
json.dump(gems, open(os.path.join(OUT, 'gems.json'), 'w'), separators=(',', ':'))
json.dump(enchants, open(os.path.join(OUT, 'enchants.json'), 'w'), separators=(',', ':'))
json.dump(bases, open(os.path.join(OUT, 'bases.json'), 'w'), indent=1)
json.dump(talents, open(os.path.join(OUT, 'talents.json'), 'w'), separators=(',', ':'))
print('items', len(items), 'sets', len(sets), 'gems', len(gems), 'enchants', len(enchants))
for c, t in talents.items():
    print(c, [(tr['name'], len(tr['talents'])) for tr in t])
