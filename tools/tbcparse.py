"""Reads Wowhead's TBC item tooltips (the HTML wowsims ships in assets/item_data) into item data:
slot, type, armor, stats, sockets, set, requirements and the tooltip lines the app shows.
Shared by gen_data.py for items, gems, enchant items and consumables."""
import html
import json
import re

# Wowhead's <!--statN--> codes for the white primary-stat lines
STAT_CODE = {'3': 'agi', '4': 'str', '5': 'int', '6': 'spi', '7': 'sta'}
# Wowhead's <!--rtgN--> codes on the green rating lines
RTG_CODE = {'12': 'def', '13': 'dodge', '14': 'parry', '15': 'block', '16': 'hit', '17': 'rhit', '18': 'shit',
            '19': 'crit', '20': 'rcrit', '21': 'scrit', '28': 'haste', '29': 'rhaste', '30': 'shaste',
            '31': 'hit', '32': 'crit', '35': 'res', '36': 'haste', '37': 'exp'}
RES = {'Arcane': 'arcres', 'Fire': 'fireres', 'Frost': 'frostres', 'Nature': 'natres', 'Shadow': 'shadres'}
WEAPON_SUB = {0: 'axe', 1: 'axe', 2: 'bow', 3: 'gun', 4: 'mace', 5: 'mace', 6: 'polearm', 7: 'sword', 8: 'sword',
              10: 'staff', 13: 'fist', 14: 'misc', 15: 'dagger', 16: 'thrown', 18: 'crossbow', 19: 'wand', 20: 'fishing'}
ARMOR_SUB = {1: 'cloth', 2: 'leather', 3: 'mail', 4: 'plate', 6: 'shield', 7: 'libram', 8: 'idol', 9: 'totem'}
INV = {'Head': 'head', 'Neck': 'neck', 'Shoulder': 'shoulder', 'Back': 'back', 'Chest': 'chest', 'Robe': 'chest',
       'Wrist': 'wrist', 'Hands': 'hands', 'Waist': 'waist', 'Legs': 'legs', 'Feet': 'feet', 'Finger': 'finger',
       'Trinket': 'trinket', 'Main Hand': 'weapon', 'One-Hand': 'weapon', 'Two-Hand': 'weapon', 'Off Hand': 'weapon',
       'Held In Off-hand': 'weapon', 'Ranged': 'ranged', 'Thrown': 'ranged', 'Relic': 'ranged',
       'Shirt': 'shirt', 'Tabard': 'tabard'}
CLASS = {'Warrior': 'warrior', 'Paladin': 'paladin', 'Druid': 'druid', 'Hunter': 'hunter', 'Rogue': 'rogue',
         'Priest': 'priest', 'Shaman': 'shaman', 'Mage': 'mage', 'Warlock': 'warlock'}


def load_tooltips(path):
    tips = {}
    with open(path, encoding='utf-8') as f:
        next(f)
        for row in f:
            parts = row.rstrip('\n').split(',', 2)
            if len(parts) < 3 or not parts[0].isdigit():
                continue
            try:
                tips[int(parts[0])] = json.loads(parts[2])
            except Exception:
                pass
    return tips


def clean(s):
    s = re.sub(r'<[^>]+>', '', s)
    return re.sub(r'\s+', ' ', html.unescape(s).replace('\xa0', ' ')).strip()


def add(st, k, v):
    if v:
        st[k] = st.get(k, 0) + v


# ------------------------------------------------------------------ bonus text ("+6 Stamina and +5 Dodge Rating")
# longest phrases first; each maps to one or more stat keys
PHRASES = [
    ('manaperfive', ['mp5']), ('healthperfive', ['hp5']), ('shadowfrostsp', ['shadsp', 'frostsp']), ('arcanefiresp', ['arcsp', 'firesp']),
    ('allresistances', ['arcres', 'fireres', 'frostres', 'natres', 'shadres']),
    ('spell critical', ['scrit']), ('spell haste', ['shaste']), ('spell hit', ['shit']),
    ('spell damage and healing', ['sp', 'heal']), ('healing and spell damage', ['sp', 'heal']),
    ('damage and healing', ['sp', 'heal']), ('spell power', ['sp', 'heal']),
    ('shield block rating', ['block']), ('shield block value', ['bv']), ('block value', ['bv']), ('block rating', ['block']),
    ('defense rating', ['def']), ('defense', ['def']), ('dodge rating', ['dodge']), ('parry rating', ['parry']),
    ('spell critical strike rating', ['scrit']), ('spell critical rating', ['scrit']), ('spell crit rating', ['scrit']),
    ('spell hit rating', ['shit']), ('spell haste rating', ['shaste']), ('spell penetration', ['spen']),
    ('ranged critical strike rating', ['rcrit']), ('ranged hit rating', ['rhit']),
    ('critical strike rating', ['crit']), ('critical rating', ['crit']), ('crit rating', ['crit']),
    ('hit rating', ['hit']), ('haste rating', ['haste']), ('resilience rating', ['res']), ('resilience', ['res']),
    ('expertise rating', ['exp']), ('ranged attack power', ['rap']), ('attack power', ['ap', 'rap']),
    ('mana per5', ['mp5']), ('mp5', ['mp5']), ('mana regen', ['mp5']), ('health per5', ['hp5']),
    ('all stats', ['str', 'agi', 'sta', 'int', 'spi']), ('all resistances', list(RES.values())),
    ('resist all', list(RES.values())), ('all resistance', list(RES.values())),
    ('arcane resistance', ['arcres']), ('fire resistance', ['fireres']), ('frost resistance', ['frostres']),
    ('nature resistance', ['natres']), ('shadow resistance', ['shadres']),
    ('shadow and frost spell power', ['shadsp', 'frostsp']), ('arcane and fire spell power', ['arcsp', 'firesp']),
    ('healing', ['heal']), ('spell damage', ['sp']),
    ('strength', ['str']), ('agility', ['agi']), ('stamina', ['sta']), ('intellect', ['int']), ('spirit', ['spi']),
    ('armor', ['armor']), ('health', ['hp']), ('mana', ['mana']),
]


def _phrase(words):
    for ph, keys in PHRASES:
        if words == ph:
            return keys
    return None


def bonus_stats(text):
    """'+6 Critical Rating and +5 Dodge Rating' -> {'crit': 6, 'dodge': 5}. Percentages and effects that
    aren't plain stats ('Minor Run Speed Increase', '3% Increased Critical Damage') are skipped."""
    st = {}
    t = text.lower().replace('&', ' and ').strip().rstrip('.')
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'(?:every|per) 5 sec(?:onds|s|\.)?', 'per5', t)
    # entries start at each number; pieces without a number belong to the entry before them
    pieces = re.split(r'\s*(?:,|\band\b)\s*|\s+(?=[+-]?\d)', t)
    entries = []
    for pc in pieces:
        pc = pc.strip()
        if not pc:
            continue
        if re.match(r'^[+-]?\d', pc):
            entries.append(pc)
        elif entries:
            entries[-1] += ' and ' + pc
    healing_named = 'healing' in t
    for e in entries:
        m = re.match(r'^([+-]?\d+)(%?)\s*(.*)$', e)
        if not m or m.group(2) == '%':
            continue
        val, words = int(m.group(1)), m.group(3).strip()
        words = re.sub(r'^(?:to |additional )', '', words)
        keys = _phrase(words)
        while keys is None and ' and ' in words:      # 'spell damage and minor run speed increase' -> 'spell damage'
            words = words.rsplit(' and ', 1)[0]
            keys = _phrase(words)
        if keys is None:
            continue
        if keys == ['sp'] and not healing_named:       # TBC "spell damage" gems and bonuses raise healing too (as wowsims)
            keys = ['sp', 'heal']
        for k in keys:
            add(st, k, val)
    return st


# green "Equip:" sentences that are plain stats
GREEN = [
    (r'Increases damage and healing done by magical spells and effects by up to (\d+)', ['sp', 'heal']),
    (r'Increases healing done by up to (\d+) and damage done by up to (\d+) for all magical spells and effects', None),
    (r'Increases healing done by spells and effects by up to (\d+)', ['heal']),
    (r'Increases attack power by (\d+) in Cat, Bear, Dire Bear, and Moonkin forms only', ['fap']),
    (r'Increases attack power by (\d+)\.?$', ['ap', 'rap']),
    (r'Increases ranged attack power by (\d+)', ['rap']),
    (r'Restores (\d+) mana per 5 sec', ['mp5']),
    (r'Restores (\d+) health per 5 sec', ['hp5']),
    (r'Increases the block value of your shield by (\d+)', ['bv']),
    (r'Increases your spell penetration by (\d+)', ['spen']),
    (r"Your attacks ignore (\d+) of your opponent's armor", ['arp']),
    (r'Increases damage done by (Arcane|Fire|Frost|Holy|Nature|Shadow) spells and effects by up to (\d+)', 'school'),
    (r'Increases your (critical strike|spell critical strike|hit|spell hit|dodge|parry|block|expertise|resilience) rating by (\d+)', 'rating'),
    (r'Increases defense rating by (\d+)', ['def']),
    (r'Improves your (resilience) rating by (\d+)', 'rating'),
    (r'\+(\d+) All Resistances', list(RES.values())),
]
SCHOOL_SP = {'Arcane': 'arcsp', 'Fire': 'firesp', 'Frost': 'frostsp', 'Holy': 'holysp', 'Nature': 'natsp', 'Shadow': 'shadsp'}
RATING_WORD = {'critical strike': 'crit', 'spell critical strike': 'scrit', 'hit': 'hit', 'spell hit': 'shit', 'dodge': 'dodge',
               'parry': 'parry', 'block': 'block', 'expertise': 'exp', 'resilience': 'res'}


def green_stats(text, st):
    """Adds the stats of one green 'Equip:' line (rating lines use Wowhead's rtg codes). True if it was a stat line."""
    m = re.search(r'<!--rtg(\d+)-->(-?\d+)', text)
    if m and m.group(1) in RTG_CODE:
        add(st, RTG_CODE[m.group(1)], int(m.group(2)))
        return True
    t = clean(text)
    t = re.sub(r'^Equip: ', '', t)
    for pat, keys in GREEN:
        mm = re.search(pat, t)
        if not mm:
            continue
        if keys is None:
            add(st, 'heal', int(mm.group(1)))
            add(st, 'sp', int(mm.group(2)))
        elif keys == 'school':
            add(st, SCHOOL_SP[mm.group(1)], int(mm.group(2)))
        elif keys == 'rating':
            add(st, RATING_WORD[mm.group(1)], int(mm.group(2)))
        else:
            for k in keys:
                add(st, k, int(mm.group(1)))
        return True
    return False


# ------------------------------------------------------------------ display lines
def parse_lines(t):
    """Wowhead's tooltip HTML -> [style, text] lines (w white, g green, q0 grey, y gold, lr left|right, sock color)
    plus drop source and set info."""
    h = t.get('tooltip', '')
    info = {}
    m = re.search(r'Dropped by: ([^<]+)', h)
    if m:
        info['drop'] = html.unescape(m.group(1)).strip()
    m = re.search(r'Drop Chance: ([\d.]+%)', h)
    if m:
        info['chance'] = m.group(1)
    m = re.search(r'<a href="/item-set=(\d+)" class="q">([^<]+)</a> \(0/(\d+)\)', h)
    if m:
        info['setId'] = int(m.group(1))
        info['setName'] = html.unescape(m.group(2))
        info['setPieces'] = [int(x) for x in re.findall(r'<!--si(\d+)-->', h)]
        info['setBonus'] = [[int(n), clean(txt)] for n, txt in re.findall(r'\((\d+)\) Set\s*:\s*(.*?)</span>', h, re.S)]
        h = h[:h.index(m.group(0))]
    h = re.sub(r'<div class="whtt-sellprice">.*?</div>', '', h, flags=re.S)
    h = re.sub(r'<div class="whtt-extra[^"]*">.*?</div>', '', h, flags=re.S)
    h = re.sub(r'<th><b class="q0 whtt-extra">[^<]*</b></th>', '', h)
    h = re.sub(r'<!--.*?-->', '', h, flags=re.S)

    def lr(mm):
        return '<br>@@LR@@' + clean(mm.group(1)) + '||' + clean(mm.group(2)) + '<br>'
    h = re.sub(r'<table width="100%"><tr>\s*<td>(.*?)</td>\s*<th>(.*?)</th>\s*</tr></table>', lr, h, flags=re.S)
    h = re.sub(r'<a href="/items/gems[^"]*" class="socket-(\w+) q0">[^<]*</a>', r'<br>@@SOCK@@\1<br>', h)
    parts = re.split(r'<br\s*/?>|</?div[^>]*>|</?table[^>]*>|</?tr>|</?td>', h)
    lines, first = [], True
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
        if txt.startswith(('Item Level', 'Durability', 'Sell Price', 'Phase ')):
            continue
        if txt.startswith('Classes:'):
            cls = 'w'
        lines.append([cls, txt])
    info['lines'] = lines
    return info


# ------------------------------------------------------------------ one item
def parse_item(iid, t):
    """Everything the app needs about one equippable item, or None for things a tank can't wear."""
    h = t.get('tooltip', '')
    it = {'id': iid, 'n': t.get('name', ''), 'q': int(t.get('quality', 1)), 'ic': t.get('icon', '')}
    m = re.search(r'<!--ilvl-->(\d+)', h)
    it['il'] = int(m.group(1)) if m else 0
    m = re.search(r'whtt-extra">Phase (\d+)<', h)
    it['ph'] = int(m.group(1)) if m else 1
    m = re.search(r'<!--rlvl-->(\d+)', h)
    if m:
        it['rl'] = int(m.group(1))
    m = re.search(r'<table width="100%"><tr><td>([^<]*)</td>', h)
    inv = m.group(1).strip() if m else ''
    slot = INV.get(inv)
    if not slot:
        return None
    m = re.search(r'<!--scstart(-?\d+):(-?\d+)-->', h)
    cls_, sub = (int(m.group(1)), int(m.group(2))) if m else (4, 0)
    it['s'] = slot
    if slot in ('shirt', 'tabard'):
        return None
    if cls_ == 2:                                   # weapons
        wt = WEAPON_SUB.get(sub)
        if wt in (None, 'wand', 'fishing', 'misc'):
            return None
        if inv in ('Ranged', 'Thrown'):
            it['s'] = 'ranged'
            it['rt'] = wt
        else:
            it['wt'] = wt
            it['ht'] = {'Main Hand': 'mh', 'Off Hand': 'oh', 'One-Hand': '1h', 'Two-Hand': '2h'}[inv]
    elif cls_ == 4:
        a = ARMOR_SUB.get(sub)
        if a in ('cloth', 'leather', 'mail', 'plate'):
            it['at'] = a
        elif a == 'shield':
            it['s'], it['wt'], it['ht'] = 'weapon', 'shield', 'oh'
        elif a in ('libram', 'idol', 'totem'):
            if a == 'totem':
                return None
            it['s'], it['rt'] = 'ranged', a
        elif inv == 'Held In Off-hand':
            it['s'], it['wt'], it['ht'] = 'weapon', 'offhand', 'oh'
    if re.search(r'<br>Unique(?:-Equipped)?(?:<| \()', h):
        it['u'] = 1
    mc = re.search(r'Classes: (.*?)</div>', h)
    if mc:
        it['cl'] = [CLASS[c] for c in re.findall(r'class="c\d+">(\w+)</a>', mc.group(1)) if c in CLASS]
        if not set(it['cl']) & {'warrior', 'paladin', 'druid'}:
            return None
    # stats
    st = {}
    m = re.search(r'<!--amr-->(\d+) Armor', h)
    if m:
        add(st, 'armor', int(m.group(1)))
    m = re.search(r'<br>(\d+) Block<br>', h)
    if m:
        add(st, 'bv', int(m.group(1)))
    for code, val in re.findall(r'<!--stat(\d+)-->([+-]\d+)', h):
        if code in STAT_CODE:
            add(st, STAT_CODE[code], int(val))
    for val, school in re.findall(r'<br>\+(\d+) (Arcane|Fire|Frost|Nature|Shadow) Resistance', h):
        add(st, RES[school], int(val))
    for g in re.findall(r'<span class="q2">(Equip: .*?)</span>', h):
        green_stats(g, st)
    it['st'] = st
    socks = re.findall(r'class="socket-(\w+) q0"', h)
    if socks:
        it['so'] = socks
        m = re.search(r'Socket Bonus: (.*?)</span>', h)
        if m:
            sb = bonus_stats(clean(m.group(1)))
            if sb:
                it['sb'] = sb
    m = re.search(r'<!--dmg-->([\d,]+) - ([\d,]+)', h)
    sp = re.search(r'<!--spd-->([\d.]+)', h)
    if m and sp:
        it['dmg'] = [float(m.group(1).replace(',', '')), float(m.group(2).replace(',', '')), float(sp.group(1))]
    info = parse_lines(t)
    it['tt'] = info['lines']
    for k in ('drop', 'chance', 'setId', 'setName', 'setPieces', 'setBonus'):
        if k in info:
            it[k] = info[k]
    return it


# ------------------------------------------------------------------ gems
GEM_COLOR = {'Red': 'red', 'Yellow': 'yellow', 'Blue': 'blue', 'Red or Yellow': 'orange', 'Red or Blue': 'purple',
             'Yellow or Blue': 'green', 'Blue or Yellow': 'green', 'Yellow or Red': 'orange', 'Blue or Red': 'purple', 'Red, Yellow or Blue': 'prismatic', 'Red, Blue, or Yellow': 'prismatic',
             'Red, Blue or Yellow': 'prismatic', 'Red, Yellow, or Blue': 'prismatic'}


def parse_gem(gid, t):
    h = t.get('tooltip', '')
    g = {'id': gid, 'n': t.get('name', ''), 'q': int(t.get('quality', 2)), 'ic': t.get('icon', '')}
    m = re.search(r'whtt-extra">Phase (\d+)<', h)
    g['ph'] = int(m.group(1)) if m else 1
    if 'meta gem slot' in h:
        g['c'] = 'meta'
    else:
        m = re.search(r'Matches an? ([A-Za-z ,]+?) Socket', h)
        if not m:
            return None
        g['c'] = GEM_COLOR.get(m.group(1).strip())
        if not g['c']:
            return None
    m = re.search(r'<!--eistats--><br />\s*(?:<span class="q1">)?(.*?)(?:</span>)?(?:<!--gemConditions-->|</td>)', h, re.S)
    if not m:
        return None
    g['tx'] = clean(m.group(1))
    g['st'] = bonus_stats(g['tx'])
    cond = re.search(r'<!--gemConditions--><div class="q0">(.*?)</div>', h, re.S)
    if cond:
        g['req'] = [clean(x) for x in re.split(r'<br\s*/?>', cond.group(1)) if clean(x)]
    if re.search(r'<br>Unique(?:-Equipped)?(?:<| \()', h):
        g['u'] = 1
    m = re.search(r'Requires <a href="/skill=\d+"[^>]*>([^<]+)</a> \((\d+)\)', h)
    if m:
        g['prof'] = f'{m.group(1)} ({m.group(2)})'
    return g


# ------------------------------------------------------------------ enchants
ENCH_SLOT_NAME = {'Cloak': ['back'], 'Bracer': ['wrist'], 'Boots': ['feet'], 'Gloves': ['hands'], 'Chest': ['chest'],
                  'Shield': ['shield'], 'Weapon': ['weapon'], '2H Weapon': ['2h'], 'Ring': ['finger']}
ENCH_SLOT_TEXT = [
    (r'head, chest, shoulders, legs, hands or feet', ['head', 'chest', 'shoulder', 'legs', 'hands', 'feet']),
    (r'chest, legs, hands or feet', ['chest', 'legs', 'hands', 'feet']),
    (r'leg or head slot', ['legs', 'head']), (r'head slot', ['head']), (r'shoulder slot', ['shoulder']),
    (r'pants', ['legs']), (r'pair of gloves|gloves', ['hands']), (r'cloak', ['back']), (r'bracers?', ['wrist']),
    (r'boots', ['feet']), (r'chest armor', ['chest']), (r'shield', ['shield']),
    (r'two.handed melee weapon|2h weapon|two.handed weapon', ['2h']), (r'melee weapon|a weapon|your weapon', ['weapon']),
    (r'ring', ['finger']), (r'bow or gun|bow, gun|ranged weapon|scope', ['ranged']),
]
# text after "to increase ..." etc -> stats; done with the same phrase table, reordered as "<n> <stat>" pairs
ENCH_PATTERNS = [
    (r'(?:increase|increases|increasing|give|gives|grant|grants|add|adds|restore|restores|attach .*? to increase)\b(.*)', None),
]


def ench_stats(text):
    """Turns enchant sentences ('increase Agility by 12', 'give 12 Stamina', 'adds 16 defense rating and 17 dodge rating',
    'increasing healing by up to 66, spell damage by up to 22, and Stamina by 20') into stats."""
    t = text.lower()
    t = re.sub(r'requires a level \d+ or higher item.*', '', t)
    t = re.sub(r'only us[e]?able on items level \d+ and above.*', '', t)
    t = re.sub(r'does not stack.*', '', t)
    t = t.replace('+', ' ')
    t = re.sub(r'mana (?:every|per) 5 sec(?:onds|s)?\.?', 'manaperfive', t)
    t = re.sub(r'health (?:every|per) 5 sec(?:onds|s)?\.?', 'healthperfive', t)
    t = re.sub(r'resistance to all (?:5 )?(?:magic )?schools(?: of magic)?', 'allresistances', t)
    t = re.sub(r'the armor on a pair of gloves', 'armor', t)
    t = re.sub(r'(?:add|adds) up to (\d+) damage to frost and shadow spells', r'\1 shadowfrostsp', t)
    t = re.sub(r'(?:add|adds) up to (\d+) damage to fire and arcane spells', r'\1 arcanefiresp', t)
    t = re.sub(r'(\d+) health and manaperfive', r'\1 healthperfive and \1 manaperfive', t)
    t = re.sub(r'\bincreased\b', 'increase', t)
    pairs = []
    # "<stat words> by (up to) N"
    for m in re.finditer(r'(?:the )?([a-z][a-z ]*?)\s+(?:of an item [^.]*?\s+)?by (?:up to )?(\d+)', t):
        words = re.sub(r'^(?:.*\b(?:increase|increases|increasing|improve|improves|the effect of your|the effects of your|your)\s+)', '', m.group(1)).strip()
        pairs.append((int(m.group(2)), words))
    # "N <stat words>"
    for m in re.finditer(r'(\d+)\s+(?:additional\s+)?([a-z][a-z ]*?)(?=\s*(?:,|\band\b|\bto\b|\.|$|\bfor\b|\bwhen\b|\bon\b))', t):
        pairs.append((int(m.group(1)), m.group(2).strip()))
    st = {}
    seen = set()
    for val, words in pairs:
        words = re.sub(r'\b(?:the wearer\'s|wearer\'s|your|points? of|to all|all magic schools)\b', lambda x: 'all' if 'all' in x.group(0) else '', words).strip()
        words = re.sub(r'\s+', ' ', words)
        words = {'resistance to all': 'all resistances', 'resistance to all magic schools': 'all resistances', 'resistance all': 'all resistances',
                 'resistance': '', 'all resistances': 'all resistances', 'all stats': 'all stats', 'stats': 'all stats',
                 'resistances': 'all resistances', 'hit points': 'health', 'additional armor': 'armor', 'mana every 5 seconds': 'mana per5',
                 'mana per5': 'mana per5', 'health per5': 'health per5',
                 'damage and healing': 'spell damage and healing', 'healing spells': 'healing', 'damage spells': 'spell damage',
                 'damage to frost and shadow spells': 'shadow and frost spell power', 'damage to fire and arcane spells': 'arcane and fire spell power',
                 'shield block value': 'block value', 'block rating': 'block rating', 'agility': 'agility'}.get(words, words)
        if words == 'hp5mp5':
            add(st, 'hp5', val); add(st, 'mp5', val); continue
        for ph, keys in PHRASES:
            if words == ph or words.endswith(' ' + ph) and len(words) - len(ph) < 12:
                key = (ph, val)
                if key in seen:
                    break
                seen.add(key)
                for k in keys:
                    add(st, k, val)
                break
    if 'sp' in st and 'heal' not in st and 'healing' not in t:
        st['heal'] = st['sp']
    return st


def ench_slots(name, text):
    m = re.match(r'(?:Formula: )?Enchant (2H Weapon|Cloak|Bracer|Boots|Gloves|Chest|Shield|Weapon|Ring)\b', name)
    if m:
        return ENCH_SLOT_NAME[m.group(1)]
    t = text.lower()
    for pat, slots in ENCH_SLOT_TEXT:
        if re.search(pat, t):
            return slots
    return []


def ench_req(text):
    m = re.search(r'requires a level (\d+) or higher item|only us[e]?able on items level (\d+) and above', text.lower())
    return int(m.group(1) or m.group(2)) if m else 0


# ------------------------------------------------------------------ consumables
SCHOOL_WORD = {'fire': 'firesp', 'frost': 'frostsp', 'shadow': 'shadsp', 'arcane': 'arcsp', 'nature': 'natsp', 'holy': 'holysp'}


def consumable_stats(use):
    """Stats from a consumable's 'Use:' text. Effects that only work against some creature types are skipped."""
    t = use
    t = re.sub(r'.*?well fed[^.]*?(?:and )?gain ', 'gain ', t, flags=re.I | re.S)
    if re.search(r'against (?:demons|undead|beasts|elementals|giants)', t, re.I):
        return {}
    st = {}
    lo = t.lower()
    # "gain 20 Stamina and Spirit" -> both
    lo = re.sub(r'(\d+) ([a-z]+) and ([a-z]+)\b(?! by)', r'\1 \2 and \1 \3', lo)
    m = re.search(r'spell damage caused by ([a-z, ]+?) spells by up to (\d+)', lo)
    if m:
        for sch in re.findall(r'(fire|frost|shadow|arcane|nature|holy)', m.group(1)):
            add(st, SCHOOL_WORD[sch], int(m.group(2)))
        lo = lo.replace(m.group(0), '')
    m = re.search(r'damage done by magical spells and effects by up to (\d+)', lo)
    if m:
        add(st, 'sp', int(m.group(1)))
        lo = lo.replace(m.group(0), '')
    m = re.search(r'prevents up to (\d+) damage done by a physical', lo)
    if m:
        add(st, 'flat', int(m.group(1)))
        lo = lo.replace(m.group(0), '')
    m = re.search(r'decreases your ([a-z ]+?) by (\d+)', lo)
    if m:
        for k, v in ench_stats('increases ' + m.group(1) + ' by ' + m.group(2)).items():
            add(st, k, -v)
        lo = lo.replace(m.group(0), '')
    lo = re.sub(r'all magical resistances', 'allresistances', lo)
    lo = re.sub(r'resistance to (shadow|fire|frost|nature|arcane)', r'\1 resistance', lo)
    for m in re.finditer(r'(?:spell )?(fire|frost|shadow|arcane|nature|holy) (?:spell )?damage (?:done )?by up to (\d+)', lo):
        add(st, SCHOOL_WORD[m.group(1)], int(m.group(2)))
    lo = re.sub(r'(?:spell )?(fire|frost|shadow|arcane|nature|holy) (?:spell )?damage (?:done )?by up to \d+', '', lo)
    m = re.search(r'healing spells (?:that you cast )?by up to (\d+)', lo)
    if m:
        add(st, 'heal', int(m.group(1)))
        lo = lo.replace(m.group(0), '')
    lo = re.sub(r'maximum health', 'health', lo)
    lo = re.sub(r'resistance to all (?:schools of magic|magic schools|schools)', 'allresistances', lo)
    # "strength and stamina by 18" -> "strength by 18 and stamina by 18"
    lo = re.sub(r'\b([a-z ]+?) and ([a-z ]+?) by (\d+)', lambda m: f'{m.group(1)} by {m.group(3)} and {m.group(2)} by {m.group(3)}'
                if len(m.group(1).split()) <= 3 and len(m.group(2).split()) <= 3 else m.group(0), lo)
    for k, v in ench_stats(lo).items():
        add(st, k, v)
    return st
