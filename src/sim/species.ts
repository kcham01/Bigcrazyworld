// Every kind of creature. Thinking races build civilisations; animals live, breed, graze and hunt;
// monsters and titans are trouble. Any animal can become a thinking race (evolution or a god's spark).
import { B } from './defs';

export type Kind = 'people' | 'animal' | 'monster' | 'sea' | 'flyer' | 'titan';
export type Diet = 'herb' | 'carn' | 'omni' | 'none';

export interface SpeciesDef {
  id: number; key: string; name: string; plural: string; kind: Kind; diet: Diet;
  sprite: string;           // sprite set in the atlas
  hp: number; atk: number; def: number; speed: number; range?: number;
  life: number; adult: number; litter: number; breed: number;  // years; litter size; births per adult per year
  size: number;             // 1 = person sized (for drawing and collisions)
  homes: B[];               // where they like to live (spawning, settling)
  swim?: 0 | 1 | 2;         // 1 can swim, 2 lives in water only
  fly?: boolean;
  sapient?: boolean;        // builds civilisations
  tame?: 'livestock' | 'mount' | 'pet' | 'war';  // can be domesticated
  meat?: number;            // food when hunted
  prey?: boolean;           // hunted by carnivores
  hostile?: boolean;        // attacks people on sight
  undead?: boolean; magic?: boolean; noBreed?: boolean;
  color: number;            // base fur/skin colour (genes shift the hue)
  perks?: string[];         // for thinking races: shown in the encyclopedia and used by the AI
  build?: 'human' | 'elf' | 'dwarf' | 'orc' | 'goblin' | 'lizard' | 'avian' | 'undead' | 'beast';
  desc: string;
}

let nextId = 0;
const sp = (d: Omit<SpeciesDef, 'id'>): SpeciesDef => ({ ...d, id: nextId++ });
const ALL_LAND = [B.Grass, B.Forest, B.Savanna, B.Hills, B.Taiga, B.Jungle];

export const SPECIES: SpeciesDef[] = [
  // ---- thinking races
  sp({ key: 'human', name: 'Human', plural: 'Humans', kind: 'people', diet: 'omni', sprite: 'human', hp: 30, atk: 4, def: 0, speed: 0.09, life: 70, adult: 16, litter: 1, breed: 0.32, size: 1, homes: [B.Grass, B.Savanna, B.Hills, B.Forest], sapient: true, color: 0xe8b796, build: 'human', perks: ['Quick learners', 'At home anywhere', 'Good traders'], desc: 'Restless, curious and quick to learn. Humans settle almost anywhere and climb the ages fastest.' }),
  sp({ key: 'elf', name: 'Elf', plural: 'Elves', kind: 'people', diet: 'herb', sprite: 'elf', hp: 26, atk: 4, def: 0, speed: 0.1, range: 5, life: 320, adult: 40, litter: 1, breed: 0.1, size: 1, homes: [B.Forest, B.Enchanted, B.Jungle], sapient: true, magic: true, color: 0xf2d5c4, build: 'elf', perks: ['Live for centuries', 'Deadly archers', 'Forest dwellers', 'Gifted in magic'], desc: 'Ancient forest folk who live for centuries, shoot true and remember every slight.' }),
  sp({ key: 'dwarf', name: 'Dwarf', plural: 'Dwarves', kind: 'people', diet: 'omni', sprite: 'dwarf', hp: 40, atk: 5, def: 2, speed: 0.075, life: 180, adult: 30, litter: 1, breed: 0.14, size: 0.85, homes: [B.Hills, B.Mountain, B.Tundra], sapient: true, color: 0xd99a78, build: 'dwarf', perks: ['Master miners', 'Fine smiths', 'Tough as stone'], desc: 'Stout miners and smiths who dig deep for gold, mithril and grudges.' }),
  sp({ key: 'orc', name: 'Orc', plural: 'Orcs', kind: 'people', diet: 'carn', sprite: 'orc', hp: 42, atk: 6, def: 1, speed: 0.095, life: 50, adult: 12, litter: 1, breed: 0.45, size: 1.1, homes: [B.Savanna, B.Badlands, B.Grass, B.Volcanic], sapient: true, color: 0x6f9a4a, build: 'orc', perks: ['Fierce warriors', 'Breed fast', 'Love a raid'], desc: 'Strong, fast-breeding and fond of war. Orc hordes can sweep a continent.' }),
  sp({ key: 'goblin', name: 'Goblin', plural: 'Goblins', kind: 'people', diet: 'omni', sprite: 'goblin', hp: 18, atk: 3, def: 0, speed: 0.105, life: 40, adult: 10, litter: 2, breed: 0.4, size: 0.75, homes: [B.Swamp, B.Badlands, B.Hills, B.Mushroom], sapient: true, color: 0x8fbf4a, build: 'goblin', perks: ['Many and quick', 'Sneaky thieves', 'Sharp hagglers'], desc: 'Small, many and sly. Goblin towns are full of thieves, tinkers and merchants.' }),
  sp({ key: 'lizard', name: 'Lizardfolk', plural: 'Lizardfolk', kind: 'people', diet: 'carn', sprite: 'lizard', hp: 34, atk: 5, def: 1, speed: 0.09, life: 80, adult: 14, litter: 2, breed: 0.22, size: 1, homes: [B.Swamp, B.Jungle, B.Prehistoric], swim: 1, sapient: true, color: 0x4f9a6a, build: 'lizard', perks: ['Swimmers', 'Love the heat', 'Hate the cold'], desc: 'Cold-blooded swamp people who swim like fish and wither in the cold.' }),
  sp({ key: 'avian', name: 'Avian', plural: 'Avians', kind: 'people', diet: 'omni', sprite: 'avian', hp: 22, atk: 4, def: 0, speed: 0.11, range: 4, life: 60, adult: 14, litter: 1, breed: 0.25, size: 0.95, homes: [B.Hills, B.Mountain, B.Savanna], fly: true, sapient: true, color: 0xc9a46a, build: 'avian', perks: ['Fly over water and walls', 'Sharp eyes', 'Light bones'], desc: 'Bird folk of the cliffs. They glide over rivers, seas and city walls.' }),
  sp({ key: 'undead', name: 'Undead', plural: 'Undead', kind: 'people', diet: 'none', sprite: 'undead', hp: 28, atk: 5, def: 1, speed: 0.07, life: 9999, adult: 0, litter: 0, breed: 0, size: 1, homes: [B.Corrupted, B.Wasteland], undead: true, noBreed: true, sapient: true, hostile: true, color: 0x9fb39a, build: 'undead', perks: ['Never eat or sleep', 'Grow by raising the dead', 'Feared by all'], desc: 'The risen dead. They do not eat, breed or rest, and every corpse is a recruit.' }),

  // ---- farm and wild animals
  sp({ key: 'sheep', name: 'Sheep', plural: 'Sheep', kind: 'animal', diet: 'herb', sprite: 'sheep', hp: 10, atk: 0, def: 0, speed: 0.06, life: 12, adult: 1, litter: 1, breed: 1.2, size: 0.8, homes: [B.Grass, B.Hills, B.Tundra], tame: 'livestock', meat: 30, prey: true, color: 0xf2f0e8, desc: 'Fluffy, tasty and easy to herd. The first animal most peoples tame.' }),
  sp({ key: 'cow', name: 'Cow', plural: 'Cows', kind: 'animal', diet: 'herb', sprite: 'cow', hp: 20, atk: 1, def: 0, speed: 0.05, life: 18, adult: 2, litter: 1, breed: 0.7, size: 1.1, homes: [B.Grass, B.Savanna], tame: 'livestock', meat: 60, prey: true, color: 0x8a5a3a, desc: 'Big, calm grazers. A herd of cows feeds a town.' }),
  sp({ key: 'pig', name: 'Boar', plural: 'Boars', kind: 'animal', diet: 'omni', sprite: 'pig', hp: 16, atk: 3, def: 0, speed: 0.07, life: 12, adult: 1, litter: 3, breed: 0.8, size: 0.85, homes: [B.Forest, B.Swamp, B.Jungle], tame: 'livestock', meat: 40, prey: true, color: 0x7a5546, desc: 'Wild pigs of the woods. Tamed, they become fat farm pigs.' }),
  sp({ key: 'chicken', name: 'Chicken', plural: 'Chickens', kind: 'animal', diet: 'herb', sprite: 'chicken', hp: 4, atk: 0, def: 0, speed: 0.06, life: 6, adult: 0.5, litter: 3, breed: 1.5, size: 0.5, homes: [B.Grass, B.Jungle, B.Savanna], tame: 'livestock', meat: 10, prey: true, color: 0xf4efe0, desc: 'Lays eggs, runs in circles, tastes great.' }),
  sp({ key: 'horse', name: 'Horse', plural: 'Horses', kind: 'animal', diet: 'herb', sprite: 'horse', hp: 22, atk: 2, def: 0, speed: 0.14, life: 25, adult: 2, litter: 1, breed: 0.5, size: 1.2, homes: [B.Grass, B.Savanna, B.Tundra], tame: 'mount', meat: 50, prey: true, color: 0x8a6240, desc: 'Fast runners of the plains. Tamed horses carry riders, knights and cavalry charges.' }),
  sp({ key: 'camel', name: 'Camel', plural: 'Camels', kind: 'animal', diet: 'herb', sprite: 'camel', hp: 24, atk: 1, def: 0, speed: 0.1, life: 30, adult: 3, litter: 1, breed: 0.4, size: 1.2, homes: [B.Desert, B.Badlands, B.Savanna], tame: 'mount', meat: 50, prey: true, color: 0xc9a46a, desc: 'Desert walkers that carry caravans and riders across the sands.' }),
  sp({ key: 'deer', name: 'Deer', plural: 'Deer', kind: 'animal', diet: 'herb', sprite: 'deer', hp: 14, atk: 1, def: 0, speed: 0.12, life: 15, adult: 1, litter: 1, breed: 0.9, size: 1, homes: [B.Forest, B.Taiga, B.Grass, B.Enchanted], meat: 35, prey: true, color: 0xa8743f, desc: 'Shy forest grazers and the favourite prey of wolves and hunters.' }),
  sp({ key: 'rabbit', name: 'Rabbit', plural: 'Rabbits', kind: 'animal', diet: 'herb', sprite: 'rabbit', hp: 4, atk: 0, def: 0, speed: 0.11, life: 6, adult: 0.4, litter: 4, breed: 2, size: 0.45, homes: [B.Grass, B.Forest, B.Tundra, B.Candy], meat: 8, prey: true, color: 0xc8b49a, desc: 'They breed like, well, rabbits.' }),
  sp({ key: 'wolf', name: 'Wolf', plural: 'Wolves', kind: 'animal', diet: 'carn', sprite: 'wolf', hp: 20, atk: 5, def: 0, speed: 0.12, life: 14, adult: 1.5, litter: 3, breed: 0.6, size: 0.9, homes: [B.Forest, B.Taiga, B.Tundra, B.Hills], tame: 'war', meat: 25, color: 0x8c8f96, desc: 'Pack hunters. Orcs ride the biggest ones into battle.' }),
  sp({ key: 'bear', name: 'Bear', plural: 'Bears', kind: 'animal', diet: 'omni', sprite: 'bear', hp: 50, atk: 9, def: 2, speed: 0.08, life: 30, adult: 3, litter: 2, breed: 0.3, size: 1.4, homes: [B.Forest, B.Taiga, B.Mountain], meat: 70, color: 0x6a4a32, desc: 'Big, strong and grumpy. Leave the honey alone.' }),
  sp({ key: 'fox', name: 'Fox', plural: 'Foxes', kind: 'animal', diet: 'carn', sprite: 'fox', hp: 9, atk: 3, def: 0, speed: 0.12, life: 10, adult: 1, litter: 3, breed: 0.8, size: 0.6, homes: [B.Forest, B.Grass, B.Tundra], meat: 10, prey: true, color: 0xd9732e, desc: 'Clever little hunters of rabbits and chickens.' }),
  sp({ key: 'croc', name: 'Crocodile', plural: 'Crocodiles', kind: 'animal', diet: 'carn', sprite: 'croc', hp: 40, atk: 9, def: 3, speed: 0.06, life: 60, adult: 5, litter: 4, breed: 0.3, size: 1.3, homes: [B.Swamp, B.Jungle], swim: 1, meat: 40, hostile: true, color: 0x4a6a3a, desc: 'Lurks in rivers and swamps. Very patient, very hungry.' }),
  sp({ key: 'elephant', name: 'Mammoth', plural: 'Mammoths', kind: 'animal', diet: 'herb', sprite: 'mammoth', hp: 90, atk: 10, def: 4, speed: 0.06, life: 60, adult: 10, litter: 1, breed: 0.15, size: 2, homes: [B.Tundra, B.Savanna, B.Snow], tame: 'war', meat: 150, prey: true, color: 0x8a6a52, desc: 'Woolly giants. Tamed ones carry war towers into battle.' }),
  sp({ key: 'raptor', name: 'Raptor', plural: 'Raptors', kind: 'animal', diet: 'carn', sprite: 'raptor', hp: 26, atk: 8, def: 1, speed: 0.15, life: 20, adult: 2, litter: 3, breed: 0.5, size: 1.1, homes: [B.Prehistoric, B.Jungle], meat: 30, hostile: true, color: 0x6f8f3a, desc: 'Clever, fast pack hunters from a forgotten age.' }),
  sp({ key: 'trex', name: 'Tyrannosaur', plural: 'Tyrannosaurs', kind: 'monster', diet: 'carn', sprite: 'trex', hp: 220, atk: 26, def: 5, speed: 0.09, life: 40, adult: 6, litter: 2, breed: 0.12, size: 2.8, homes: [B.Prehistoric], meat: 250, hostile: true, color: 0x5f7a3a, desc: 'The king of the primeval jungle. Villages near its range rarely last.' }),
  sp({ key: 'bronto', name: 'Brontosaur', plural: 'Brontosaurs', kind: 'animal', diet: 'herb', sprite: 'bronto', hp: 260, atk: 14, def: 6, speed: 0.04, life: 90, adult: 10, litter: 1, breed: 0.1, size: 3, homes: [B.Prehistoric, B.Swamp], meat: 400, prey: true, color: 0x7a8a6a, desc: 'A gentle walking hill that eats whole trees.' }),

  // ---- sea life
  sp({ key: 'fish', name: 'Fish', plural: 'Fish', kind: 'sea', diet: 'herb', sprite: 'fish', hp: 3, atk: 0, def: 0, speed: 0.07, life: 5, adult: 0.5, litter: 6, breed: 1.5, size: 0.4, homes: [B.Ocean], swim: 2, meat: 6, prey: true, color: 0x9fc8e8, desc: 'Schools of fish feed coastal towns and sharks alike.' }),
  sp({ key: 'shark', name: 'Shark', plural: 'Sharks', kind: 'sea', diet: 'carn', sprite: 'shark', hp: 40, atk: 10, def: 2, speed: 0.12, life: 30, adult: 3, litter: 2, breed: 0.3, size: 1.5, homes: [B.Ocean, B.DeepOcean], swim: 2, meat: 40, hostile: true, color: 0x6f7f8f, desc: 'Circles shipwrecks and swimmers.' }),
  sp({ key: 'whale', name: 'Whale', plural: 'Whales', kind: 'sea', diet: 'herb', sprite: 'whale', hp: 200, atk: 4, def: 4, speed: 0.06, life: 90, adult: 10, litter: 1, breed: 0.1, size: 3.5, homes: [B.DeepOcean], swim: 2, meat: 300, prey: true, color: 0x4a5f7a, desc: 'Peaceful giants of the deep sea, hunted by daring whalers.' }),
  sp({ key: 'kraken', name: 'Kraken', plural: 'Krakens', kind: 'titan', diet: 'carn', sprite: 'kraken', hp: 900, atk: 40, def: 8, speed: 0.06, life: 900, adult: 50, litter: 0, breed: 0, size: 4, homes: [B.DeepOcean], swim: 2, noBreed: true, hostile: true, color: 0x8a3f6a, desc: 'A sea monster that drags whole ships under.' }),
  sp({ key: 'serpent', name: 'World Serpent', plural: 'World Serpents', kind: 'titan', diet: 'carn', sprite: 'serpent', hp: 1600, atk: 50, def: 10, speed: 0.07, life: 5000, adult: 0, litter: 0, breed: 0, size: 5, homes: [B.DeepOcean], swim: 2, noBreed: true, hostile: true, color: 0x2f8a6a, desc: 'Jörmungandr. It grows with every creature it eats and shrinks when wounded.' }),

  // ---- flyers and monsters
  sp({ key: 'crow', name: 'Crow', plural: 'Crows', kind: 'flyer', diet: 'omni', sprite: 'crow', hp: 3, atk: 0, def: 0, speed: 0.13, life: 8, adult: 0.5, litter: 2, breed: 1, size: 0.45, homes: [B.Forest, B.Grass, B.Wasteland], fly: true, color: 0x2a2a33, desc: 'Follows armies and feasts on battlefields.' }),
  sp({ key: 'dragon', name: 'Dragon', plural: 'Dragons', kind: 'titan', diet: 'carn', sprite: 'dragon', hp: 700, atk: 40, def: 8, speed: 0.13, range: 4, life: 1200, adult: 80, litter: 1, breed: 0.01, size: 3.5, homes: [B.Mountain, B.Peak, B.Volcanic], fly: true, hostile: true, magic: true, color: 0xc0392b, desc: 'Ancient fire-breathers that sleep in mountain lairs on gold and eggs.' }),
  sp({ key: 'demon', name: 'Demon', plural: 'Demons', kind: 'monster', diet: 'carn', sprite: 'demon', hp: 80, atk: 14, def: 3, speed: 0.1, life: 999, adult: 0, litter: 0, breed: 0, size: 1.3, homes: [B.Volcanic, B.Corrupted], noBreed: true, hostile: true, magic: true, color: 0xb03a2e, desc: 'Crawls out of the burning places and corrupts the land.' }),
  sp({ key: 'ghost', name: 'Ghost', plural: 'Ghosts', kind: 'monster', diet: 'none', sprite: 'ghost', hp: 30, atk: 6, def: 5, speed: 0.08, life: 300, adult: 0, litter: 0, breed: 0, size: 1, homes: [B.Corrupted, B.Wasteland], fly: true, undead: true, noBreed: true, hostile: true, color: 0xcfe0f0, desc: 'Restless spirits that haunt ruins and battlefields.' }),
  sp({ key: 'slime', name: 'Slime', plural: 'Slimes', kind: 'monster', diet: 'omni', sprite: 'slime', hp: 18, atk: 3, def: 0, speed: 0.05, life: 30, adult: 1, litter: 2, breed: 0.5, size: 0.8, homes: [B.Swamp, B.Mushroom, B.Candy], hostile: true, color: 0x6fd36a, desc: 'Wobbles about, eats anything, splits in two.' }),
  sp({ key: 'golem', name: 'Golem', plural: 'Golems', kind: 'monster', diet: 'none', sprite: 'golem', hp: 160, atk: 16, def: 8, speed: 0.04, life: 2000, adult: 0, litter: 0, breed: 0, size: 2, homes: [B.Crystal, B.Mountain], noBreed: true, magic: true, color: 0x8fb3c8, desc: 'Living crystal. Slow, patient and nearly unbreakable.' }),
  sp({ key: 'treant', name: 'Treant', plural: 'Treants', kind: 'monster', diet: 'none', sprite: 'treant', hp: 140, atk: 12, def: 6, speed: 0.035, life: 3000, adult: 0, litter: 0, breed: 0, size: 2.2, homes: [B.Enchanted, B.Forest], noBreed: true, magic: true, color: 0x5a7a3a, desc: 'Walking trees that plant forests and punish woodcutters.' }),
  sp({ key: 'titan', name: 'Colossus', plural: 'Colossi', kind: 'titan', diet: 'none', sprite: 'colossus', hp: 1400, atk: 45, def: 10, speed: 0.05, life: 5000, adult: 0, litter: 0, breed: 0, size: 5, homes: [B.Hills, B.Mountain], noBreed: true, hostile: true, color: 0xa89b8a, desc: 'A stone giant from the dawn of the world. Mountains tremble when it walks.' }),
  sp({ key: 'sandworm', name: 'Sandworm', plural: 'Sandworms', kind: 'titan', diet: 'carn', sprite: 'sandworm', hp: 600, atk: 35, def: 6, speed: 0.08, life: 2000, adult: 0, litter: 0, breed: 0, size: 4, homes: [B.Desert, B.Badlands], noBreed: true, hostile: true, color: 0xb08a5a, desc: 'Swims through sand and swallows caravans whole.' }),
  sp({ key: 'alien', name: 'Alien', plural: 'Aliens', kind: 'monster', diet: 'omni', sprite: 'alien', hp: 40, atk: 10, def: 2, speed: 0.1, range: 6, life: 200, adult: 0, litter: 0, breed: 0, size: 0.9, homes: [B.Wasteland], noBreed: true, hostile: true, color: 0x7fe07a, desc: 'Visitors from the stars, armed with ray guns and bad manners.' }),
  sp({ key: 'zombie', name: 'Zombie', plural: 'Zombies', kind: 'monster', diet: 'carn', sprite: 'zombie', hp: 24, atk: 4, def: 0, speed: 0.05, life: 60, adult: 0, litter: 0, breed: 0, size: 1, homes: [B.Wasteland, B.Corrupted], undead: true, noBreed: true, hostile: true, color: 0x7f9f6a, desc: 'Every bite makes another. A zombie plague can end a kingdom.' }),
];

export const SPECIES_BY_KEY: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map(s => [s.key, s]));
export const PEOPLE = SPECIES.filter(s => s.kind === 'people');
export const ALL_LAND_HOMES = ALL_LAND;
