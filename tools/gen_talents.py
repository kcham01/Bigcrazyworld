# Part of gen_data.py (run through exec there): race/class base stats from wowsims and the talent trees
# (wowsims layout + oppahansi/ltc names, rank texts and icons). Uses SIMS, LTC, SRC, ROOT from gen_data.py.
from PIL import Image


def base_stats(path):
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
        crit = re.search(r'stats\.MeleeCrit:\s*([-\d.]+)(\s*\*\s*core\.MeleeCritRatingPerCritChance)?', body)
        scrit = re.search(r'stats\.SpellCrit:\s*([-\d.]+)', body)
        r = race.replace('10', '').replace('30', '')
        out[r.lower()] = {
            'hp': vals.get('Health', 0), 'str': vals.get('Strength', 0), 'agi': vals.get('Agility', 0),
            'sta': vals.get('Stamina', 0), 'int': vals.get('Intellect', 0), 'spi': vals.get('Spirit', 0),
            'dodge': float(dodge.group(1)) if dodge else 0,
            'ap': vals.get('AttackPower', 0), 'mana': vals.get('Mana', 0),
            # melee crit in percent (wowsims stores it as rating or as percent * rating constant)
            'crit': (float(crit.group(1)) if crit and crit.group(2) else (float(crit.group(1)) / 22.08 if crit else 0)),
            'scrit': float(scrit.group(1)) / 22.08 if scrit else 0,
        }
    return out


bases = {
    'warrior': base_stats(os.path.join(SIMS, 'sim/warrior/warrior.go')),
    'paladin': base_stats(os.path.join(SIMS, 'sim/paladin/paladin.go')),
    'druid': base_stats(os.path.join(SIMS, 'sim/druid/druid.go')),
}
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


names = parse_java('TalentNames.java', 'TALENT_NAMES =')[1]
icons = parse_java('TalentIcons.java', 'TALENT_TREE_TALENT_ICONS =')
descs = parse_java('RankDescriptionsTbc.java', 'RANK_DESCRIPTIONS =')
LTC_CLASS = {'druid': 0, 'paladin': 3, 'warrior': 8}


def ts_talents(cls):
    s = open(os.path.join(SIMS, f'ui/core/talents/{cls}.ts')).read()
    trees = []
    for tree in re.split(r"\n\t\{\n\t\tname: ", s)[1:]:
        tname = re.match(r"'([^']+)'", tree).group(1)
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
for cls in ('warrior', 'paladin', 'druid'):
    trees = ts_talents(cls)
    ci = LTC_CLASS[cls]
    for ti, tree in enumerate(trees):
        nm, ds, ic = names[ci][ti], descs[ci][ti], icons[1][ci][ti]
        for t in tree['talents']:
            pos = t['r'] * 4 + t['c']
            t['n'] = nm[pos]
            t['d'] = [x for x in ds[pos] if x]
            t['ic'] = ic[pos]
            src = os.path.join(res, ic[pos] + '.png')
            dst = os.path.join(icon_dir, ic[pos] + '.jpg')
            if os.path.exists(src) and not os.path.exists(dst):
                Image.open(src).convert('RGB').resize((56, 56), Image.LANCZOS).save(dst, quality=86, optimize=True)
    talents[cls] = trees

json.dump(bases, open(os.path.join(SRC, 'bases.json'), 'w'), indent=1)
json.dump(talents, open(os.path.join(SRC, 'talents.json'), 'w'), separators=(',', ':'))
print('talents', {c: [len(t['talents']) for t in v] for c, v in talents.items()})
