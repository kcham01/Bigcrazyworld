// Fixed game content: biomes, trees, ores, resources. Colours are 0xRRGGBB.

export const TICKS_PER_YEAR = 240;
export const TICKS_PER_SEASON = 60;
export const SEA = 0.5;            // height below this is water (unless filled)
export const DEEP = 0.40;          // below this: deep water (boats only)
export const HILL = 0.70;          // above: hills/mountains
export const PEAK = 0.84;          // above: high mountains

export const enum Season { Spring, Summer, Autumn, Winter }
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

export const enum B {
  DeepOcean, Ocean, Beach, Grass, Forest, Jungle, Desert, Savanna, Taiga, Tundra, Snow, Swamp,
  Hills, Mountain, Peak, Volcanic, Lava, Enchanted, Corrupted, Crystal, Mushroom, Candy, Prehistoric,
  Wasteland, Ice, Badlands, COUNT,
}

export const enum Tree {
  None, Oak, Pine, Palm, JungleTree, Birch, Dead, Crystal, Mushroom, Lollipop, Fern, Cactus, Acacia, SnowPine,
  Willow, Glowtree, Corrupt, COUNT,
}

export interface BiomeDef {
  id: B; key: string; name: string;
  c1: number; c2: number;          // two ground colours mixed by per-tile noise
  water?: boolean; deep?: boolean;
  fert: number;                    // 0..1 crop/forage fertility
  vegMax: number;                  // 0..255 forage that regrows
  trees: Tree[]; treeDensity: number;
  move: number;                    // movement cost multiplier (1 = normal)
  cold?: boolean; hot?: boolean; magic?: boolean; spreads?: boolean; harsh?: boolean;
  habitable: number;               // 0..1 how good for settling
}

const def = (d: BiomeDef) => d;
export const BIOMES: BiomeDef[] = [
  def({ id: B.DeepOcean, key: 'deep', name: 'Deep ocean', c1: 0x1b3f73, c2: 0x1d4378, water: true, deep: true, fert: 0, vegMax: 0, trees: [], treeDensity: 0, move: 99, habitable: 0 }),
  def({ id: B.Ocean, key: 'ocean', name: 'Shallow sea', c1: 0x2b6aa8, c2: 0x2e70ae, water: true, fert: 0, vegMax: 0, trees: [], treeDensity: 0, move: 6, habitable: 0 }),
  def({ id: B.Beach, key: 'beach', name: 'Beach', c1: 0xe3cf8f, c2: 0xd9c381, fert: 0.25, vegMax: 40, trees: [Tree.Palm], treeDensity: 0.03, move: 1.1, habitable: 0.6 }),
  def({ id: B.Grass, key: 'grass', name: 'Grassland', c1: 0x5fa83f, c2: 0x6bb446, fert: 1, vegMax: 230, trees: [Tree.Oak, Tree.Birch], treeDensity: 0.06, move: 1, habitable: 1 }),
  def({ id: B.Forest, key: 'forest', name: 'Forest', c1: 0x3f8a33, c2: 0x48963a, fert: 0.8, vegMax: 200, trees: [Tree.Oak, Tree.Oak, Tree.Birch], treeDensity: 0.5, move: 1.3, habitable: 0.75 }),
  def({ id: B.Jungle, key: 'jungle', name: 'Jungle', c1: 0x2d7a2b, c2: 0x358a2f, fert: 0.85, vegMax: 255, trees: [Tree.JungleTree, Tree.JungleTree, Tree.Palm], treeDensity: 0.6, move: 1.6, hot: true, habitable: 0.55 }),
  def({ id: B.Desert, key: 'desert', name: 'Desert', c1: 0xe0c27a, c2: 0xd6b56d, fert: 0.08, vegMax: 25, trees: [Tree.Cactus], treeDensity: 0.02, move: 1.2, hot: true, harsh: true, habitable: 0.2 }),
  def({ id: B.Savanna, key: 'savanna', name: 'Savanna', c1: 0xb5b04f, c2: 0xa9a548, fert: 0.6, vegMax: 160, trees: [Tree.Acacia], treeDensity: 0.04, move: 1, hot: true, habitable: 0.8 }),
  def({ id: B.Taiga, key: 'taiga', name: 'Taiga', c1: 0x4a7a55, c2: 0x52845b, fert: 0.45, vegMax: 130, trees: [Tree.Pine, Tree.Pine, Tree.SnowPine], treeDensity: 0.45, move: 1.3, cold: true, habitable: 0.55 }),
  def({ id: B.Tundra, key: 'tundra', name: 'Tundra', c1: 0x9aa98c, c2: 0x8f9e82, fert: 0.15, vegMax: 70, trees: [Tree.SnowPine], treeDensity: 0.02, move: 1.2, cold: true, harsh: true, habitable: 0.3 }),
  def({ id: B.Snow, key: 'snow', name: 'Snowfield', c1: 0xeef3f7, c2: 0xe2e9ef, fert: 0.02, vegMax: 10, trees: [Tree.SnowPine], treeDensity: 0.01, move: 1.6, cold: true, harsh: true, habitable: 0.1 }),
  def({ id: B.Swamp, key: 'swamp', name: 'Swamp', c1: 0x4d6b3d, c2: 0x56763f, fert: 0.5, vegMax: 190, trees: [Tree.Willow, Tree.Dead], treeDensity: 0.2, move: 1.8, habitable: 0.3 }),
  def({ id: B.Hills, key: 'hills', name: 'Hills', c1: 0x7d9a5a, c2: 0x86a262, fert: 0.55, vegMax: 140, trees: [Tree.Pine, Tree.Oak], treeDensity: 0.12, move: 1.4, habitable: 0.7 }),
  def({ id: B.Mountain, key: 'mountain', name: 'Mountains', c1: 0x8a8580, c2: 0x7d7873, fert: 0.05, vegMax: 30, trees: [Tree.Pine], treeDensity: 0.04, move: 2.4, habitable: 0.15 }),
  def({ id: B.Peak, key: 'peak', name: 'High peaks', c1: 0xdfe3e8, c2: 0xc9ced4, fert: 0, vegMax: 0, trees: [], treeDensity: 0, move: 3.5, cold: true, harsh: true, habitable: 0 }),
  def({ id: B.Volcanic, key: 'volcanic', name: 'Volcanic rock', c1: 0x3b3534, c2: 0x463e3b, fert: 0.1, vegMax: 15, trees: [Tree.Dead], treeDensity: 0.01, move: 1.5, hot: true, harsh: true, habitable: 0.1 }),
  def({ id: B.Lava, key: 'lava', name: 'Lava', c1: 0xff6a1a, c2: 0xffa22e, fert: 0, vegMax: 0, trees: [], treeDensity: 0, move: 99, hot: true, harsh: true, habitable: 0 }),
  def({ id: B.Enchanted, key: 'enchanted', name: 'Enchanted grove', c1: 0x55b38a, c2: 0x62c29a, fert: 1, vegMax: 255, trees: [Tree.Glowtree, Tree.Birch], treeDensity: 0.3, move: 1, magic: true, habitable: 0.9 }),
  def({ id: B.Corrupted, key: 'corrupted', name: 'Corrupted land', c1: 0x55345e, c2: 0x5f3a69, fert: 0.15, vegMax: 60, trees: [Tree.Corrupt, Tree.Dead], treeDensity: 0.2, move: 1.3, magic: true, spreads: true, harsh: true, habitable: 0.15 }),
  def({ id: B.Crystal, key: 'crystal', name: 'Crystal fields', c1: 0x9fd7e8, c2: 0xb1e1ef, fert: 0.3, vegMax: 60, trees: [Tree.Crystal], treeDensity: 0.18, move: 1.2, magic: true, habitable: 0.4 }),
  def({ id: B.Mushroom, key: 'mushroom', name: 'Mushroom forest', c1: 0x8a6a8f, c2: 0x96769b, fert: 0.6, vegMax: 180, trees: [Tree.Mushroom], treeDensity: 0.3, move: 1.2, magic: true, habitable: 0.6 }),
  def({ id: B.Candy, key: 'candy', name: 'Candy land', c1: 0xf2a6c8, c2: 0xf7b8d4, fert: 0.7, vegMax: 200, trees: [Tree.Lollipop], treeDensity: 0.15, move: 1, magic: true, habitable: 0.8 }),
  def({ id: B.Prehistoric, key: 'prehistoric', name: 'Primeval jungle', c1: 0x4f8f2c, c2: 0x5a9c33, fert: 0.9, vegMax: 255, trees: [Tree.Fern, Tree.Fern, Tree.JungleTree], treeDensity: 0.45, move: 1.5, hot: true, habitable: 0.5 }),
  def({ id: B.Wasteland, key: 'wasteland', name: 'Wasteland', c1: 0x77705f, c2: 0x6b6555, fert: 0.03, vegMax: 15, trees: [Tree.Dead], treeDensity: 0.02, move: 1.2, harsh: true, habitable: 0.1 }),
  def({ id: B.Ice, key: 'ice', name: 'Sea ice', c1: 0xcfe6f2, c2: 0xc2dcea, fert: 0, vegMax: 0, trees: [], treeDensity: 0, move: 1.8, cold: true, harsh: true, habitable: 0 }),
  def({ id: B.Badlands, key: 'badlands', name: 'Badlands', c1: 0xc0784a, c2: 0xb36e43, fert: 0.1, vegMax: 30, trees: [Tree.Cactus, Tree.Dead], treeDensity: 0.02, move: 1.3, hot: true, harsh: true, habitable: 0.25 }),
];

export interface TreeDef { id: Tree; name: string; wood: number; fruit: number; }
export const TREES: TreeDef[] = [
  { id: Tree.None, name: '', wood: 0, fruit: 0 },
  { id: Tree.Oak, name: 'Oak', wood: 4, fruit: 1 },
  { id: Tree.Pine, name: 'Pine', wood: 4, fruit: 0 },
  { id: Tree.Palm, name: 'Palm', wood: 2, fruit: 2 },
  { id: Tree.JungleTree, name: 'Jungle tree', wood: 5, fruit: 2 },
  { id: Tree.Birch, name: 'Birch', wood: 3, fruit: 0 },
  { id: Tree.Dead, name: 'Dead tree', wood: 1, fruit: 0 },
  { id: Tree.Crystal, name: 'Crystal spire', wood: 0, fruit: 0 },
  { id: Tree.Mushroom, name: 'Giant mushroom', wood: 2, fruit: 3 },
  { id: Tree.Lollipop, name: 'Lollipop tree', wood: 1, fruit: 4 },
  { id: Tree.Fern, name: 'Tree fern', wood: 2, fruit: 1 },
  { id: Tree.Cactus, name: 'Cactus', wood: 1, fruit: 1 },
  { id: Tree.Acacia, name: 'Acacia', wood: 3, fruit: 0 },
  { id: Tree.SnowPine, name: 'Snowy pine', wood: 4, fruit: 0 },
  { id: Tree.Willow, name: 'Willow', wood: 3, fruit: 0 },
  { id: Tree.Glowtree, name: 'Glowtree', wood: 3, fruit: 2 },
  { id: Tree.Corrupt, name: 'Blight tree', wood: 1, fruit: 0 },
];

export const enum Ore { None, Stone, Copper, Iron, Coal, Gold, Gems, Mithril, Oil, COUNT }
export const ORE_NAMES = ['', 'Stone', 'Copper', 'Iron', 'Coal', 'Gold', 'Gems', 'Mithril', 'Oil'];
export const ORE_COLORS = [0, 0x9a948c, 0xc2733d, 0xa8a0a0, 0x2b2b2b, 0xf2c94c, 0x59d6c9, 0x9ad8ff, 0x1b1418];

export const enum R { Food, Wood, Stone, Metal, Gold, Gems, Mithril, Fuel, COUNT }
export const RES_NAMES = ['Food', 'Wood', 'Stone', 'Metal', 'Gold', 'Gems', 'Mithril', 'Fuel'];
export const RES_ICONS = ['🍞', '🪵', '🪨', '⚙️', '🪙', '💎', '✨', '🛢️'];
/** what mining an ore gives */
export const ORE_RES: number[] = [-1, R.Stone, R.Metal, R.Metal, R.Fuel, R.Gold, R.Gems, R.Mithril, R.Fuel];

/** small decorations on a tile */
export const enum Deco { None, Grave, Ruins, Crater, Wreck, Bones, Flowers, Fence, Monument, Skull, Ash, Rubble }
