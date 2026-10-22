// God powers: shape the land, spawn life, bless and curse, start and end wars, unleash disasters.
// Brush powers work on a circle of tiles; tap powers act on whatever is under the finger.
import type { Sim } from './sim';
import { St, UF, T, Job } from './units';
import { SPECIES, SPECIES_BY_KEY } from './species';
import { BIOMES, B, SEA, Tree, TICKS_PER_YEAR, R, Deco } from './defs';
import { TECHS } from './tech';
import { BT } from './entities';
import * as nature from './nature';
import * as civ from './city';
import * as realm from './kingdom';
import * as war from './war';
import * as people from './people';
import * as life from './life';
import * as faith from './culture';
import { placeTribe } from './setup';

export type PowerKind = 'brush' | 'tap' | 'spawn' | 'drag';
export interface Power { id: string; name: string; cat: string; kind: PowerKind; desc: string; r?: number; icon: string; color?: number }

const P = (id: string, name: string, cat: string, kind: PowerKind, icon: string, desc: string, r?: number): Power => ({ id, name, cat, kind, icon, desc, r });

export const CATEGORIES = [
  { id: 'look', name: 'Look' }, { id: 'land', name: 'Land' }, { id: 'life', name: 'Life' }, { id: 'beasts', name: 'Beasts' },
  { id: 'sky', name: 'Weather' }, { id: 'ruin', name: 'Ruin' }, { id: 'gods', name: 'Blessings' }, { id: 'realms', name: 'Realms' },
];

export const POWERS: Power[] = [
  P('inspect', 'Inspect', 'look', 'tap', 'eye', 'Tap anything to learn about it.'),
  P('follow', 'Follow', 'look', 'tap', 'follow', 'Tap a creature and the camera follows it.'),
  P('favorite', 'Favourite', 'look', 'tap', 'star', 'Mark a creature as a favourite: you hear about its life, and it gets a grave when it dies.'),
  // land
  P('raise', 'Raise land', 'land', 'brush', 'raise', 'Lift the ground: sea becomes shore, hills become mountains.', 3),
  P('lower', 'Lower land', 'land', 'brush', 'lower', 'Sink the ground: land floods, mountains wear down.', 3),
  P('sea', 'Sea', 'land', 'brush', 'sea', 'Flood an area with shallow sea.', 3),
  P('ground', 'Grassland', 'land', 'brush', 'grass', 'Fertile grassland.', 3),
  P('forest', 'Forest', 'land', 'brush', 'forest', 'Plant a forest.', 3),
  P('jungle', 'Jungle', 'land', 'brush', 'jungle', 'Thick, hot jungle.', 3),
  P('desert', 'Desert', 'land', 'brush', 'desert', 'Dry sand and cactus.', 3),
  P('snow', 'Snow', 'land', 'brush', 'snow', 'Cold snowfields.', 3),
  P('swamp', 'Swamp', 'land', 'brush', 'swamp', 'Wet, muddy swamp.', 3),
  P('mountain', 'Mountain', 'land', 'brush', 'mountain', 'Rocky mountains, rich in ore.', 2),
  P('river', 'River', 'land', 'drag', 'river', 'Draw a river. People can ford it, and build bridges.', 1),
  P('road', 'Road', 'land', 'drag', 'road', 'Lay a road. Travel is faster on roads.', 1),
  P('enchanted', 'Enchanted grove', 'land', 'brush', 'enchanted', 'Magical forest where elves love to live.', 3),
  P('corrupted', 'Corruption', 'land', 'brush', 'corrupt', 'Blighted land that spreads. The dead walk here.', 3),
  P('candy', 'Candy land', 'land', 'brush', 'candy', 'Sweet, strange and fertile.', 3),
  P('crystal', 'Crystal fields', 'land', 'brush', 'crystal', 'Crystal spires and golems.', 3),
  P('mushroom', 'Mushroom forest', 'land', 'brush', 'mushroom', 'Giant mushrooms. Goblins like it.', 3),
  P('prehistoric', 'Primeval jungle', 'land', 'brush', 'prehistoric', 'Ferns and dinosaurs.', 3),
  P('wasteland', 'Wasteland', 'land', 'brush', 'waste', 'Dead, empty land.', 3),
  P('ore', 'Ore', 'land', 'brush', 'ore', 'Seed the ground with metal, gold and gems.', 2),
  P('trees', 'Grow trees', 'land', 'brush', 'tree', 'Trees grow where you touch.', 2),
  P('clear', 'Clear', 'land', 'brush', 'axe', 'Remove trees, ruins and rubble.', 2),
  // life (thinking races first)
  ...['human', 'elf', 'dwarf', 'orc', 'goblin', 'lizard', 'avian', 'undead'].map(k => P('spawn:' + k, SPECIES_BY_KEY[k].plural, 'life', 'spawn', 'sp:' + k, SPECIES_BY_KEY[k].desc)),
  P('tribe', 'Tribe', 'life', 'tap', 'tribe', 'Drop a whole tribe of the last people you chose, ready to settle.'),
  ...['sheep', 'cow', 'pig', 'chicken', 'horse', 'camel', 'deer', 'rabbit', 'wolf', 'bear', 'fox', 'croc', 'elephant', 'raptor', 'trex', 'bronto', 'fish', 'shark', 'whale', 'crow'].map(k => P('spawn:' + k, SPECIES_BY_KEY[k].plural, 'beasts', 'spawn', 'sp:' + k, SPECIES_BY_KEY[k].desc)),
  ...['dragon', 'demon', 'ghost', 'slime', 'golem', 'treant', 'sandworm', 'kraken', 'alien', 'zombie', 'titan', 'serpent'].map(k => P('spawn:' + k, SPECIES_BY_KEY[k].name, 'beasts', 'spawn', 'sp:' + k, SPECIES_BY_KEY[k].desc)),
  // weather
  P('rain', 'Rain', 'sky', 'brush', 'rain', 'Rain puts out fires and makes grass and crops grow.', 5),
  P('fire', 'Fire', 'sky', 'brush', 'fire', 'Set things alight.', 1),
  P('lightning', 'Lightning', 'sky', 'tap', 'bolt', 'A bolt from the sky.'),
  P('tornado', 'Tornado', 'sky', 'tap', 'tornado', 'A twister that wanders and wrecks.'),
  P('blizzard', 'Blizzard', 'sky', 'brush', 'snowflake', 'Freezing snow: water turns to ice.', 5),
  P('drought', 'Drought', 'sky', 'brush', 'sun', 'Dries the land: grass dies back, fields wither.', 5),
  // ruin
  P('meteor', 'Meteor', 'ruin', 'tap', 'meteor', 'A falling star. Leaves a crater and rare ore.'),
  P('quake', 'Earthquake', 'ruin', 'tap', 'quake', 'Shakes buildings down.'),
  P('volcano', 'Volcano', 'ruin', 'tap', 'volcano', 'Raises a volcano that pours out lava.'),
  P('flood', 'Flood', 'ruin', 'tap', 'flood', 'Washes over low land near water.'),
  P('bomb', 'Bomb', 'ruin', 'tap', 'bomb', 'A big explosion.'),
  P('nuke', 'Atomic bomb', 'ruin', 'tap', 'nuke', 'Destroys everything around and leaves a wasteland.'),
  P('plague', 'Plague', 'ruin', 'tap', 'plague', 'Starts an outbreak of a new disease in a town.'),
  P('zombify', 'Walking dead', 'ruin', 'tap', 'zombie', 'The dead rise around here.'),
  P('madness', 'Madness', 'ruin', 'brush', 'mad', 'Creatures go mad and attack everyone.', 2),
  P('erase', 'Smite', 'ruin', 'brush', 'smite', 'Removes creatures and buildings under the brush.', 1),
  // blessings and curses
  P('bless', 'Blessing', 'gods', 'brush', 'bless', 'Stronger, healthier, happier.', 2),
  P('curse', 'Curse', 'gods', 'brush', 'curse', 'Weaker and unlucky.', 2),
  P('heal', 'Heal', 'gods', 'brush', 'heal', 'Heals wounds and cures disease.', 3),
  P('spark', 'Spark of mind', 'gods', 'tap', 'spark', 'Animals of this kind wake up and become a thinking people.'),
  P('hero', 'Make hero', 'gods', 'tap', 'hero', 'Turn a person into a hero.'),
  P('immortal', 'Immortality', 'gods', 'tap', 'ankh', 'This creature will never die of old age.'),
  P('fertility', 'Fertility', 'gods', 'brush', 'heart', 'More children in these towns.', 4),
  P('inspire', 'Inspiration', 'gods', 'tap', 'idea', 'A flash of genius: the realm makes a discovery.'),
  P('harvest', 'Good harvest', 'gods', 'brush', 'wheat', 'Crops ripen at once.', 4),
  P('gold', 'Treasure', 'gods', 'tap', 'coin', 'Gives a town gold, stone and metal.'),
  // realms
  P('peace', 'Peace', 'realms', 'tap', 'dove', 'Tap a town: its realm makes peace with all its enemies.'),
  P('war', 'War', 'realms', 'tap', 'swords', 'Tap a town, then another: their realms go to war.'),
  P('alliance', 'Alliance', 'realms', 'tap', 'hands', 'Tap a town, then another: their realms become allies.'),
  P('rebel', 'Revolt', 'realms', 'tap', 'fist', 'Tap a town: it rises up and declares independence.'),
  P('crown', 'Crown', 'realms', 'tap', 'crown', 'Tap a person: they become ruler of their realm.'),
  P('faith', 'Prophet', 'realms', 'tap', 'temple', 'Tap a person: they found a new religion.'),
  P('tech', 'Gift of knowledge', 'realms', 'tap', 'book', 'Tap a town: its realm learns the next idea.'),
  P('patron', 'Patron', 'realms', 'tap', 'shield', 'Tap a town: watch over its realm. You hear its news and it is spared random disasters.'),
];
export const POWER_BY_ID: Record<string, Power> = Object.fromEntries(POWERS.map(p => [p.id, p]));

// ------------------------------------------------------------------ helpers
function tilesIn(sim: Sim, x: number, y: number, r: number, fn: (i: number, d: number) => void) {
  const w = sim.world;
  const r2 = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > r2 + 0.5) continue;
    const nx = Math.floor(x) + dx, ny = Math.floor(y) + dy;
    if (!w.inb(nx, ny)) continue;
    fn(ny * w.w + nx, Math.sqrt(d2) / Math.max(0.5, r));
  }
}

/** keep a tile consistent after its height or biome changed */
function fixTile(sim: Sim, i: number, keepBiome = false) {
  const w = sim.world;
  const wasWater = w.isWater(i), wasWalk = w.walkable(i);
  if (!keepBiome) w.biome[i] = w.biomeFor(i);
  const water = w.isWater(i);
  if (water) {
    w.tree[i] = 0; w.field[i] = 0; w.road[i] = w.road[i] >= 2 && w.bld[i] ? w.road[i] : 0; w.fire[i] = 0; w.deco[i] = 0;
    if (w.bld[i]) { const b = sim.buildings[w.bld[i] - 1]; if (b && b.type !== BT.Bridge) civ.destroyBuilding(sim, b.id, 'sunk beneath the waves'); }
    w.river[i] = 0;
  }
  if (water !== wasWater || w.walkable(i) !== wasWalk) w.regionsStale = true;
  w.markDirty(i);
}

function setBiomeBrush(sim: Sim, x: number, y: number, r: number, b: B) {
  const w = sim.world, bd = BIOMES[b];
  tilesIn(sim, x, y, r, (i) => {
    if (w.isWater(i)) { w.height[i] = SEA + 0.02 + sim.rng.f() * 0.02; }
    if (b === B.Mountain) w.height[i] = Math.max(w.height[i], 0.77 + sim.rng.f() * 0.05);
    else if (w.height[i] > 0.76) w.height[i] = 0.68;
    w.biome[i] = b;
    if (b === B.Snow) w.temp[i] = Math.min(w.temp[i], -14);
    if (b === B.Desert) { w.temp[i] = Math.max(w.temp[i], 24); w.moist[i] = Math.min(w.moist[i], 30); }
    if (b === B.Jungle) { w.temp[i] = Math.max(w.temp[i], 24); w.moist[i] = Math.max(w.moist[i], 180); }
    if (b === B.Swamp) w.moist[i] = 230;
    if (b === B.Grass || b === B.Forest) { w.temp[i] = Math.max(-2, Math.min(18, w.temp[i])); w.moist[i] = Math.max(w.moist[i], 100); }
    w.veg[i] = bd.vegMax;
    if (w.tree[i] && !bd.trees.includes(w.tree[i])) w.tree[i] = 0;
    if (!w.tree[i] && !w.bld[i] && !w.field[i] && !w.road[i] && bd.trees.length && sim.rng.chance(bd.treeDensity)) w.tree[i] = bd.trees[sim.rng.int(bd.trees.length)];
    fixTile(sim, i, true);
  });
}

function unitAt(sim: Sim, x: number, y: number, r = 1.2, filter?: (u: number) => boolean | undefined): number {
  let best = -1, bd = r * r;
  const U = sim.units;
  U.near(x, y, r + 1, (j) => {
    if (filter && !filter(j)) return;
    const d = (U.x[j] - x) ** 2 + (U.y[j] - y - 0.3) ** 2;
    if (d < bd) { bd = d; best = j; }
  });
  return best;
}
export function cityAt(sim: Sim, x: number, y: number): number {
  const w = sim.world;
  const i = w.tileAt(x, y);
  const o = w.owner[i] - 1;
  if (o >= 0 && sim.cities[o]?.alive) return o;
  return people.nearestCity(sim, x, y, 6);
}
export { unitAt };

// ------------------------------------------------------------------ apply a power
export interface PowerState { first?: number; race?: string; lastX?: number; lastY?: number; }

/** returns a short message for the UI, or '' */
export function applyPower(sim: Sim, id: string, x: number, y: number, r: number, st: PowerState): string {
  const w = sim.world, U = sim.units;
  if (!w.inb(Math.floor(x), Math.floor(y))) return '';
  const i0 = w.tileAt(x, y);
  if (id.startsWith('spawn:')) {
    const key = id.slice(6);
    const d = SPECIES_BY_KEY[key];
    if (d.sapient) st.race = key;
    const water = w.isWater(i0);
    if (d.swim === 2 && !water) return `${d.plural} need water.`;
    if (!d.swim && !d.fly && water && !w.walkable(i0)) return `${d.plural} can't live in the sea.`;
    if (key === 'titan' || key === 'serpent' || key === 'kraken' || key === 'dragon') { nature.spawnMonster(sim, key, x, y); return ''; }
    const sub = sim.baseSubspecies(d.id);
    const n = d.sapient ? 1 : d.kind === 'monster' ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const u = sim.spawn(sub, x + sim.rng.range(-0.4, 0.4), y + sim.rng.range(-0.4, 0.4), d.sapient ? { age: d.adult + sim.rng.range(0, 10) } : { age: d.adult + 0.5 });
      sim.fx.push({ kind: 'power', x: U.x[u], y: U.y[u], t: 0, life: 12, color: 0xfff2b0, size: 0.8 });
      if (U.flags[u] & UF.Undead && !d.sapient) U.flags[u] |= UF.Undead;
    }
    return '';
  }
  switch (id) {
    case 'raise': case 'lower': {
      const k = id === 'raise' ? 1 : -1;
      tilesIn(sim, x, y, r, (i, d) => {
        w.height[i] = Math.max(0.2, Math.min(0.95, w.height[i] + k * 0.02 * (1 - d * 0.6)));
        if (w.river[i] && k > 0 && w.height[i] > SEA + 0.1) w.river[i] = 0;
        fixTile(sim, i);
      });
      return '';
    }
    case 'sea': tilesIn(sim, x, y, r, (i) => { w.height[i] = Math.min(w.height[i], SEA - 0.03 - sim.rng.f() * 0.02); fixTile(sim, i); }); return '';
    case 'ground': setBiomeBrush(sim, x, y, r, B.Grass); return '';
    case 'forest': setBiomeBrush(sim, x, y, r, B.Forest); tilesIn(sim, x, y, r, (i) => { if (!w.bld[i] && !w.field[i] && !w.road[i] && sim.rng.chance(0.5)) { w.tree[i] = sim.rng.chance(0.7) ? Tree.Oak : Tree.Birch; w.markDirty(i); } }); return '';
    case 'jungle': setBiomeBrush(sim, x, y, r, B.Jungle); return '';
    case 'desert': setBiomeBrush(sim, x, y, r, B.Desert); return '';
    case 'snow': setBiomeBrush(sim, x, y, r, B.Snow); return '';
    case 'swamp': setBiomeBrush(sim, x, y, r, B.Swamp); return '';
    case 'mountain': setBiomeBrush(sim, x, y, r, B.Mountain); tilesIn(sim, x, y, r, (i) => { if (sim.rng.chance(0.15)) { w.ore[i] = [1, 1, 2, 3, 4, 5, 6][sim.rng.int(7)]; w.oreAmt[i] = 60; } }); return '';
    case 'enchanted': setBiomeBrush(sim, x, y, r, B.Enchanted); return '';
    case 'corrupted': setBiomeBrush(sim, x, y, r, B.Corrupted); return '';
    case 'candy': setBiomeBrush(sim, x, y, r, B.Candy); return '';
    case 'crystal': setBiomeBrush(sim, x, y, r, B.Crystal); return '';
    case 'mushroom': setBiomeBrush(sim, x, y, r, B.Mushroom); return '';
    case 'prehistoric': setBiomeBrush(sim, x, y, r, B.Prehistoric); return '';
    case 'wasteland': setBiomeBrush(sim, x, y, r, B.Wasteland); return '';
    case 'ore': tilesIn(sim, x, y, r, (i) => { if (!w.isWater(i) && sim.rng.chance(0.4)) { w.ore[i] = [1, 2, 3, 4, 5, 6, 7][sim.rng.int(7)]; w.oreAmt[i] = 80; w.markDirty(i); } }); return '';
    case 'trees': tilesIn(sim, x, y, r, (i) => { const bd = BIOMES[w.biome[i]]; if (!w.isWater(i) && !w.bld[i] && !w.road[i] && !w.field[i] && sim.rng.chance(0.5)) { w.tree[i] = bd.trees.length ? bd.trees[sim.rng.int(bd.trees.length)] : Tree.Oak; w.markDirty(i); } }); return '';
    case 'clear': tilesIn(sim, x, y, r, (i) => { w.tree[i] = 0; w.deco[i] = 0; w.fire[i] = 0; w.markDirty(i); }); return '';
    case 'river': {
      const lx = st.lastX ?? x, ly = st.lastY ?? y;
      line(lx, ly, x, y, (tx, ty) => { if (!w.inb(tx, ty)) return; const i = ty * w.w + tx; if (w.isWater(i)) return; if (w.bld[i]) return; w.river[i] = 2; w.tree[i] = 0; w.field[i] = 0; w.markDirty(i); });
      st.lastX = x; st.lastY = y;
      return '';
    }
    case 'road': {
      const lx = st.lastX ?? x, ly = st.lastY ?? y;
      line(lx, ly, x, y, (tx, ty) => { if (!w.inb(tx, ty)) return; const i = ty * w.w + tx; if (w.isWater(i) || w.bld[i]) return; w.road[i] = Math.max(w.road[i], 2); w.tree[i] = 0; w.markDirty(i); });
      st.lastX = x; st.lastY = y;
      return '';
    }
    // ---------------------------------------------------------------- weather
    case 'rain':
      tilesIn(sim, x, y, r, (i) => { if (w.fire[i]) { w.fire[i] = 0; w.markDirty(i); } if (!w.isWater(i)) { w.veg[i] = Math.min(255, w.veg[i] + 25); if (w.field[i] && w.field[i] < 240) w.field[i] = Math.min(240, w.field[i] + 10); } });
      if (sim.rng.chance(0.3)) sim.fx.push({ kind: 'flood', x, y, t: 0, life: 20, size: r * 0.6 });
      return '';
    case 'fire': tilesIn(sim, x, y, r, (i) => nature.ignite(sim, i, 160)); return '';
    case 'lightning': sim.fx.push({ kind: 'lightning', x, y, t: 0, life: 8 }); nature.ignite(sim, i0, 140); U.near(x, y, 1.5, (u) => sim.damage(u, 60, -1, 'struck by lightning')); return '';
    case 'tornado': nature.tornado(sim, x, y); return '';
    case 'blizzard':
      tilesIn(sim, x, y, r, (i) => { w.temp[i] = Math.max(-40, w.temp[i] - 4); if (w.isWater(i) && !w.isDeep(i) && w.temp[i] < -8) { w.biome[i] = B.Ice; w.regionsStale = true; } else if (!w.isWater(i) && w.temp[i] < -10 && w.biome[i] !== B.Snow) w.biome[i] = w.height[i] > 0.7 ? B.Snow : B.Tundra; w.fire[i] = 0; w.markDirty(i); });
      U.near(x, y, r, (u) => sim.damage(u, 2, -1, 'frozen'));
      return '';
    case 'drought': tilesIn(sim, x, y, r, (i) => { w.veg[i] = Math.max(0, w.veg[i] - 40); w.moist[i] = Math.max(0, w.moist[i] - 8); if (w.field[i]) w.field[i] = Math.max(2, w.field[i] - 30); w.markDirty(i); }); return '';
    // ---------------------------------------------------------------- ruin
    case 'meteor': nature.meteor(sim, x, y, 4); return '';
    case 'quake': nature.earthquake(sim, x, y, 12); return '';
    case 'volcano': {
      tilesIn(sim, x, y, 4, (i, d) => { w.height[i] = Math.max(w.height[i], 0.72 + (1 - d) * 0.12); w.biome[i] = B.Volcanic; w.tree[i] = 0; fixTile(sim, i, true); });
      nature.eruption(sim, x, y, 28);
      return '';
    }
    case 'flood': nature.flood(sim, x, y, 10); return '';
    case 'bomb': explode(sim, x, y, 3); return '';
    case 'nuke': {
      explode(sim, x, y, 9);
      tilesIn(sim, x, y, 14, (i, d) => { if (!w.isWater(i)) { if (d < 0.7) { w.biome[i] = B.Wasteland; w.tree[i] = sim.rng.chance(0.2) ? Tree.Dead : 0; w.veg[i] = 0; } else if (sim.rng.chance(0.5)) nature.ignite(sim, i, 120); } w.markDirty(i); });
      sim.fx.push({ kind: 'boom', x, y, t: 0, life: 70, size: 12 });
      sim.log('disaster', 'An atomic fire fell from the sky!', x, y, { imp: 2 });
      return '';
    }
    case 'plague': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town to start a plague there.';
      nature.outbreak(sim, c, 1.4);
      return '';
    }
    case 'zombify': {
      for (let k = 0; k < 6; k++) nature.raiseDead(sim, x + sim.rng.range(-2, 2), y + sim.rng.range(-2, 2), 0);
      return '';
    }
    case 'madness': U.near(x, y, r, (u) => { if (SPECIES[U.spec[u]].kind !== 'titan') { U.flags[u] |= UF.Mad; U.setTrait(u, T.Mad); } }); return '';
    case 'erase': {
      U.near(x, y, r, (u) => sim.kill(u, 'smitten by the gods'));
      tilesIn(sim, x, y, r, (i) => { if (w.bld[i]) civ.destroyBuilding(sim, w.bld[i] - 1, 'smitten by the gods'); });
      sim.fx.push({ kind: 'power', x, y, t: 0, life: 10, color: 0xffffff, size: r });
      return '';
    }
    // ---------------------------------------------------------------- blessings
    case 'bless': U.near(x, y, r, (u) => { U.setTrait(u, T.Blessed); U.flags[u] |= UF.Blessed; sim.express(u); U.hp[u] = U.maxHp[u]; }); sim.fx.push({ kind: 'power', x, y, t: 0, life: 16, color: 0xffe07a, size: r }); return '';
    case 'curse': U.near(x, y, r, (u) => { U.setTrait(u, T.Cursed); U.setTrait(u, T.Blessed, false); sim.express(u); U.maxHp[u] *= 0.7; U.atk[u] *= 0.7; }); sim.fx.push({ kind: 'power', x, y, t: 0, life: 16, color: 0x8f6fd0, size: r }); return '';
    case 'heal': U.near(x, y, r, (u) => { U.hp[u] = U.maxHp[u]; U.disease[u] = 0; U.hunger[u] = 0; }); sim.fx.push({ kind: 'power', x, y, t: 0, life: 16, color: 0x6fe08a, size: r }); return '';
    case 'spark': {
      const u = unitAt(sim, x, y, 2, (j) => !SPECIES[U.spec[j]].sapient && SPECIES[U.spec[j]].kind === 'animal');
      if (u < 0) return 'Tap an animal.';
      life.awaken(sim, U.sub[u]);
      return '';
    }
    case 'hero': {
      const u = unitAt(sim, x, y, 2, (j) => SPECIES[U.spec[j]].sapient);
      if (u < 0) return 'Tap a person.';
      U.level[u] = Math.max(U.level[u], 6); people.makeHero(sim, u);
      return '';
    }
    case 'immortal': {
      const u = unitAt(sim, x, y, 2);
      if (u < 0) return 'Tap a creature.';
      U.flags[u] |= UF.Immortal; U.setTrait(u, T.Longlived);
      sim.fx.push({ kind: 'power', x: U.x[u], y: U.y[u], t: 0, life: 20, color: 0xffe07a, size: 1 });
      return `${sim.unitName(u)} will not die of age or wounds.`;
    }
    case 'fertility': {
      const done = new Set<number>();
      tilesIn(sim, x, y, r, (i) => { const c = w.owner[i] - 1; if (c >= 0 && !done.has(c)) { done.add(c); const city = sim.cities[c]; for (const u of city.members) if (sim.rng.chance(0.3)) U.setTrait(u, T.Fertile); city.happy = Math.min(100, city.happy + 10); } });
      sim.fx.push({ kind: 'power', x, y, t: 0, life: 16, color: 0xff8fc8, size: r });
      return done.size ? '' : 'Use it on a town.';
    }
    case 'inspire': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      const k = sim.kingdoms[sim.cities[c].kingdom];
      const u = sim.cities[c].members[0];
      if (u !== undefined && k.researching) realm.inspiration(sim, k.id, u);
      k.research += 200;
      return `${k.name} had a flash of inspiration.`;
    }
    case 'harvest': tilesIn(sim, x, y, r, (i) => { if (w.field[i]) { w.field[i] = 250; w.markDirty(i); } w.veg[i] = Math.max(w.veg[i], BIOMES[w.biome[i]].vegMax); }); sim.fx.push({ kind: 'power', x, y, t: 0, life: 16, color: 0xf2c94c, size: r }); return '';
    case 'gold': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      const city = sim.cities[c];
      city.stock[R.Gold] += 100; city.stock[R.Stone] += 80; city.stock[R.Metal] += 50; city.stock[R.Wood] += 80; city.stock[R.Food] += 100;
      sim.fx.push({ kind: 'text', x: city.x + 1, y: city.y, t: 0, life: 40, color: 0xf2c94c, text: '+ treasure' });
      return `${city.name} received your treasure.`;
    }
    // ---------------------------------------------------------------- realms
    case 'peace': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      const k = sim.kingdoms[sim.cities[c].kingdom];
      for (const wid of [...k.wars]) war.endWar(sim, wid, -1, 'peace imposed by the gods');
      return k.wars.length ? '' : `${k.name} is at peace.`;
    }
    case 'war': case 'alliance': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      if (st.first === undefined || !sim.cities[st.first]?.alive) { st.first = c; return `Now tap a town of another realm.`; }
      const a = sim.cities[st.first].kingdom, b = sim.cities[c].kingdom;
      st.first = undefined;
      if (a === b) return 'Both towns belong to the same realm.';
      realm.meet(sim, a, b);
      if (id === 'war') { const wid = war.declare(sim, a, b, 'conquest', 'the will of the gods'); return wid < 0 ? 'They are already at war.' : ''; }
      for (const wid of [...sim.kingdoms[a].wars]) { const wr = sim.wars[wid]; if ((wr.attackers.includes(b) || wr.defenders.includes(b))) war.endWar(sim, wid, -1, 'the gods made them friends'); }
      realm.setStatus(sim, a, b, 'alliance'); realm.opinion(sim, a, b, 60);
      sim.log('alliance', `${sim.kingdoms[a].name} and ${sim.kingdoms[b].name} swore an alliance.`, x, y, { k: a, k2: b, imp: 1 });
      return '';
    }
    case 'rebel': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      const k = sim.kingdoms[sim.cities[c].kingdom];
      if (k.cities.length < 2) return 'A realm with only one town cannot split.';
      if (sim.cities[c].capital) return 'The capital will not rebel. Tap another town.';
      war.rebellion(sim, c, 'stirred up by the gods');
      return '';
    }
    case 'crown': {
      const u = unitAt(sim, x, y, 2, (j) => SPECIES[U.spec[j]].sapient && U.city[j] >= 0);
      if (u < 0) return 'Tap a person who lives in a town.';
      realm.crown(sim, sim.kingdoms[sim.unitKingdom(u)], u, 'usurper');
      return '';
    }
    case 'faith': {
      const u = unitAt(sim, x, y, 2, (j) => SPECIES[U.spec[j]].sapient && U.city[j] >= 0);
      if (u < 0) return 'Tap a person who lives in a town.';
      faith.foundReligion(sim, U.city[u], u);
      return '';
    }
    case 'tech': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      const k = sim.kingdoms[sim.cities[c].kingdom];
      if (!k.researching) return `${k.name} knows everything there is to know.`;
      k.research += 99999;
      realm.stepKingdoms(sim);
      return '';
    }
    case 'patron': {
      const c = cityAt(sim, x, y);
      if (c < 0) return 'Tap a town.';
      for (const k of sim.kingdoms) k.favored = false;
      const k = sim.kingdoms[sim.cities[c].kingdom];
      k.favored = true; sim.patron = k.id;
      return `You now watch over ${k.name}.`;
    }
    case 'tribe': {
      const key = st.race || 'human';
      if (w.isWater(i0)) return 'Tap land.';
      placeTribe(sim, key, 12, x, y);
      return '';
    }
    case 'favorite': {
      const u = unitAt(sim, x, y, 2);
      if (u < 0) return 'Tap a creature.';
      U.flags[u] ^= UF.Fav;
      if (U.flags[u] & UF.Fav) { people.makeNotable(sim, u); return `${sim.unitName(u)} is now a favourite.`; }
      return `${sim.unitName(u)} is no longer a favourite.`;
    }
  }
  return '';
}

function explode(sim: Sim, x: number, y: number, r: number) {
  const w = sim.world;
  sim.fx.push({ kind: 'boom', x, y, t: 0, life: 30, size: r });
  tilesIn(sim, x, y, r, (i, d) => {
    if (w.bld[i]) { const b = sim.buildings[w.bld[i] - 1]; b.hp -= b.maxHp * (1.2 - d); if (b.hp <= 0) civ.destroyBuilding(sim, b.id, 'blown up'); }
    w.tree[i] = 0;
    if (!w.isWater(i)) { w.deco[i] = d < 0.5 ? Deco.Crater : Deco.Ash; if (sim.rng.chance(0.3)) nature.ignite(sim, i, 100); }
    w.markDirty(i);
  });
  sim.units.near(x, y, r + 0.5, (u) => sim.kill(u, 'blown up'));
}

function line(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) fn(Math.floor(x0 + (x1 - x0) * k / n), Math.floor(y0 + (y1 - y0) * k / n));
}

export { TECHS, TICKS_PER_YEAR, Job, St };
