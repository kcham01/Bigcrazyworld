// Shapes of everything that isn't a creature or a tile: subspecies, cultures, religions, cities,
// buildings, kingdoms, characters, wars, armies, history.
import { R } from './defs';
import { Job } from './units';

export interface Subspecies {
  id: number; species: number; name: string; latin: string;
  genome: Float32Array; hue: number;      // genome mean, kept up to date each year
  pop: number; peak: number; born: number; died: number; parent: number; region: number;
  sapient: boolean; uplifted?: boolean; notes: string[];
}

export interface Values { war: number; faith: number; trade: number; learn: number; art: number; nature: number; xeno: number; honor: number; }

export interface Culture {
  id: number; name: string; lang: number; species: number; values: Values; traditions: string[];
  parent: number; born: number; color: number; alive: boolean; pop: number; style: number;
}

export interface Religion {
  id: number; name: string; deity: string; deityTitle: string; type: string; tenets: string[];
  founder: number; born: number; holyCity: number; color: number; parent: number; alive: boolean; followers: number; symbol: number;
}

export const enum BT {
  Hearth, Tent, Hut, House, Manor, Granary, Warehouse, Barn, LumberCamp, Mine, Smithy, Barracks, Stable, Temple, Library, Market,
  Tavern, Dock, Wall, Gate, Tower, Castle, Palace, Monument, Wonder, Academy, Hospital, Factory, PowerPlant, Highrise, Airport, LaunchPad,
  Lighthouse, University, Graveyard, Shrine, Bridge, COUNT,
}

export interface BuildingDef {
  type: BT; key: string; name: string; w: number; h: number;
  cost: Partial<Record<R, number>>; work: number; hp: number;
  era: number; tech?: string; minPop: number; housing?: number; storage?: boolean;
  jobs?: Partial<Record<Job, number>>; max?: number; desc: string; capitalOnly?: boolean; coastal?: boolean; military?: boolean;
}

const b = (d: BuildingDef) => d;
export const BUILDINGS: BuildingDef[] = [
  b({ type: BT.Hearth, key: 'hearth', name: 'Town hall', w: 2, h: 2, cost: {}, work: 10, hp: 400, era: 0, minPop: 0, storage: true, housing: 4, max: 1, desc: 'The heart of a town: food and goods are stored here.' }),
  b({ type: BT.Tent, key: 'tent', name: 'Tent', w: 1, h: 1, cost: { [R.Wood]: 1 }, work: 6, hp: 40, era: 0, minPop: 0, housing: 3, desc: 'A first shelter.' }),
  b({ type: BT.Hut, key: 'hut', name: 'Hut', w: 2, h: 2, cost: { [R.Wood]: 4 }, work: 14, hp: 100, era: 0, minPop: 0, housing: 5, desc: 'A simple family home.' }),
  b({ type: BT.House, key: 'house', name: 'House', w: 2, h: 2, cost: { [R.Wood]: 4, [R.Stone]: 4 }, work: 22, hp: 200, era: 1, tech: 'masonry', minPop: 12, housing: 8, desc: 'A sturdy home for a growing family.' }),
  b({ type: BT.Manor, key: 'manor', name: 'Manor', w: 3, h: 2, cost: { [R.Wood]: 8, [R.Stone]: 12, [R.Gold]: 4 }, work: 40, hp: 320, era: 3, tech: 'feudalism', minPop: 60, housing: 14, desc: 'Homes for the well-off.' }),
  b({ type: BT.Granary, key: 'granary', name: 'Granary', w: 2, h: 2, cost: { [R.Wood]: 6 }, work: 18, hp: 160, era: 0, tech: 'agriculture', minPop: 14, storage: true, max: 2, desc: 'Stores the harvest so food lasts the winter.' }),
  b({ type: BT.Warehouse, key: 'warehouse', name: 'Warehouse', w: 2, h: 2, cost: { [R.Wood]: 8, [R.Stone]: 4 }, work: 22, hp: 200, era: 1, tech: 'trade', minPop: 40, storage: true, max: 2, desc: 'More storage for wood, stone and metal.' }),
  b({ type: BT.Barn, key: 'barn', name: 'Barn', w: 2, h: 2, cost: { [R.Wood]: 6 }, work: 16, hp: 150, era: 0, tech: 'husbandry', minPop: 16, jobs: { [Job.Herder]: 2 }, max: 2, desc: 'Keeps tame animals: milk, wool, eggs and meat.' }),
  b({ type: BT.LumberCamp, key: 'lumber', name: 'Lumber camp', w: 2, h: 1, cost: { [R.Wood]: 3 }, work: 10, hp: 100, era: 0, minPop: 18, storage: true, max: 1, desc: 'Woodcutters bring their logs here.' }),
  b({ type: BT.Mine, key: 'mine', name: 'Mine', w: 2, h: 2, cost: { [R.Wood]: 6 }, work: 18, hp: 200, era: 0, tech: 'stonetools', minPop: 20, storage: true, max: 2, desc: 'A shaft into the hills for stone, metal, gold and gems.' }),
  b({ type: BT.Smithy, key: 'smithy', name: 'Smithy', w: 2, h: 2, cost: { [R.Wood]: 4, [R.Stone]: 6 }, work: 24, hp: 220, era: 1, tech: 'bronze', minPop: 24, jobs: { [Job.Smith]: 2 }, max: 1, desc: 'Turns metal into weapons, armour and tools.' }),
  b({ type: BT.Barracks, key: 'barracks', name: 'Barracks', w: 3, h: 2, cost: { [R.Wood]: 8, [R.Stone]: 8 }, work: 30, hp: 300, era: 1, tech: 'bronze', minPop: 35, max: 1, military: true, desc: 'Trains soldiers faster and makes them tougher.' }),
  b({ type: BT.Stable, key: 'stable', name: 'Stable', w: 3, h: 2, cost: { [R.Wood]: 10 }, work: 24, hp: 200, era: 1, tech: 'riding', minPop: 40, max: 1, military: true, desc: 'Breeds horses and camels for riders and cavalry.' }),
  b({ type: BT.Temple, key: 'temple', name: 'Temple', w: 2, h: 3, cost: { [R.Wood]: 6, [R.Stone]: 10, [R.Gold]: 2 }, work: 36, hp: 260, era: 1, tech: 'mysticism', minPop: 30, jobs: { [Job.Priest]: 2 }, max: 1, desc: 'Priests pray, preach and spread the faith.' }),
  b({ type: BT.Library, key: 'library', name: 'Library', w: 2, h: 2, cost: { [R.Wood]: 6, [R.Stone]: 8 }, work: 30, hp: 200, era: 1, tech: 'writing', minPop: 30, jobs: { [Job.Scholar]: 3 }, max: 1, desc: 'Scholars study here and discover new ideas.' }),
  b({ type: BT.Market, key: 'market', name: 'Market', w: 3, h: 2, cost: { [R.Wood]: 10, [R.Stone]: 4 }, work: 24, hp: 180, era: 1, tech: 'trade', minPop: 40, jobs: { [Job.Merchant]: 3 }, max: 1, desc: 'Merchants trade here and send caravans to other towns.' }),
  b({ type: BT.Tavern, key: 'tavern', name: 'Tavern', w: 2, h: 2, cost: { [R.Wood]: 8 }, work: 18, hp: 150, era: 1, tech: 'pottery', minPop: 50, max: 1, desc: 'Makes people happier. Also where heroes and thieves meet.' }),
  b({ type: BT.Dock, key: 'dock', name: 'Docks', w: 2, h: 2, cost: { [R.Wood]: 10 }, work: 24, hp: 200, era: 0, tech: 'sailing', minPop: 20, coastal: true, jobs: { [Job.Fisher]: 3, [Job.Sailor]: 2 }, max: 1, desc: 'Fishing boats and ships to cross the sea.' }),
  b({ type: BT.Wall, key: 'wall', name: 'Wall', w: 1, h: 1, cost: { [R.Stone]: 2 }, work: 8, hp: 600, era: 1, tech: 'masonry', minPop: 50, military: true, desc: 'Keeps enemies out until they bring siege engines.' }),
  b({ type: BT.Gate, key: 'gate', name: 'Gate', w: 1, h: 1, cost: { [R.Stone]: 3, [R.Wood]: 2 }, work: 10, hp: 700, era: 1, tech: 'masonry', minPop: 50, military: true, desc: 'Lets friends in and keeps enemies out.' }),
  b({ type: BT.Tower, key: 'tower', name: 'Tower', w: 1, h: 1, cost: { [R.Stone]: 6 }, work: 16, hp: 900, era: 2, tech: 'construction', minPop: 60, military: true, desc: 'Archers shoot from the walls.' }),
  b({ type: BT.Castle, key: 'castle', name: 'Castle', w: 3, h: 3, cost: { [R.Stone]: 40, [R.Wood]: 10, [R.Gold]: 8 }, work: 120, hp: 3000, era: 3, tech: 'engineering', minPop: 80, max: 1, military: true, desc: 'The seat of a lord. Very hard to take.' }),
  b({ type: BT.Palace, key: 'palace', name: 'Palace', w: 3, h: 3, cost: { [R.Stone]: 30, [R.Gold]: 20, [R.Gems]: 4 }, work: 120, hp: 1500, era: 2, tech: 'currency', minPop: 70, max: 1, capitalOnly: true, desc: 'Where the ruler lives. Makes the realm more stable.' }),
  b({ type: BT.Monument, key: 'monument', name: 'Monument', w: 2, h: 2, cost: { [R.Stone]: 20, [R.Gold]: 6 }, work: 60, hp: 800, era: 1, tech: 'masonry', minPop: 60, max: 1, desc: 'A statue of a great ruler or hero.' }),
  b({ type: BT.Wonder, key: 'wonder', name: 'Wonder', w: 4, h: 4, cost: { [R.Stone]: 80, [R.Gold]: 40, [R.Gems]: 10 }, work: 400, hp: 4000, era: 2, tech: 'construction', minPop: 120, max: 1, capitalOnly: true, desc: 'A marvel of the age. Brings fame, faith and visitors.' }),
  b({ type: BT.Academy, key: 'academy', name: 'Mage academy', w: 3, h: 3, cost: { [R.Stone]: 24, [R.Gold]: 10, [R.Mithril]: 2 }, work: 80, hp: 600, era: 2, tech: 'philosophy', minPop: 70, jobs: { [Job.Mage]: 3 }, max: 1, desc: 'Trains mages with elemental staffs.' }),
  b({ type: BT.Hospital, key: 'hospital', name: 'Hospital', w: 3, h: 2, cost: { [R.Stone]: 16, [R.Gold]: 6 }, work: 50, hp: 400, era: 3, tech: 'medicine', minPop: 60, jobs: { [Job.Healer]: 3 }, max: 1, desc: 'Healers cure the sick and stop plagues spreading.' }),
  b({ type: BT.Factory, key: 'factory', name: 'Factory', w: 3, h: 3, cost: { [R.Stone]: 30, [R.Metal]: 20 }, work: 100, hp: 800, era: 5, tech: 'industry', minPop: 100, jobs: { [Job.Smith]: 6 }, max: 2, desc: 'Mass-produces weapons, tools and goods. Smoky.' }),
  b({ type: BT.PowerPlant, key: 'power', name: 'Power plant', w: 3, h: 3, cost: { [R.Stone]: 40, [R.Metal]: 30 }, work: 120, hp: 900, era: 6, tech: 'electricity', minPop: 150, max: 1, desc: 'Electricity for the whole city.' }),
  b({ type: BT.Highrise, key: 'highrise', name: 'Apartment block', w: 2, h: 2, cost: { [R.Stone]: 20, [R.Metal]: 12 }, work: 60, hp: 600, era: 6, tech: 'massproduction', minPop: 150, housing: 30, desc: 'Packs many families into a small space.' }),
  b({ type: BT.Airport, key: 'airport', name: 'Airfield', w: 4, h: 3, cost: { [R.Stone]: 50, [R.Metal]: 40, [R.Fuel]: 20 }, work: 140, hp: 1000, era: 6, tech: 'flight', minPop: 180, max: 1, military: true, desc: 'Planes for trade and bombing raids.' }),
  b({ type: BT.LaunchPad, key: 'launchpad', name: 'Launch pad', w: 4, h: 4, cost: { [R.Metal]: 120, [R.Fuel]: 80, [R.Gems]: 20 }, work: 500, hp: 2000, era: 8, tech: 'spaceflight', minPop: 250, max: 1, capitalOnly: true, desc: 'Sends rockets, and maybe a whole people, to the stars.' }),
  b({ type: BT.Lighthouse, key: 'lighthouse', name: 'Lighthouse', w: 1, h: 1, cost: { [R.Stone]: 10 }, work: 30, hp: 400, era: 2, tech: 'seafaring', minPop: 40, coastal: true, max: 1, desc: 'Guides ships home. Fewer wrecks.' }),
  b({ type: BT.University, key: 'university', name: 'University', w: 3, h: 3, cost: { [R.Stone]: 30, [R.Gold]: 16 }, work: 90, hp: 600, era: 4, tech: 'printing', minPop: 100, jobs: { [Job.Scholar]: 6 }, max: 1, desc: 'A great centre of learning.' }),
  b({ type: BT.Graveyard, key: 'graveyard', name: 'Graveyard', w: 2, h: 2, cost: { [R.Stone]: 2 }, work: 8, hp: 100, era: 0, tech: 'mysticism', minPop: 40, max: 1, desc: 'The dead rest here. Mostly.' }),
  b({ type: BT.Shrine, key: 'shrine', name: 'Shrine', w: 1, h: 1, cost: { [R.Wood]: 2, [R.Stone]: 1 }, work: 10, hp: 80, era: 0, tech: 'mysticism', minPop: 10, jobs: { [Job.Priest]: 1 }, max: 1, desc: 'A small holy place.' }),
  b({ type: BT.Bridge, key: 'bridge', name: 'Bridge', w: 1, h: 1, cost: { [R.Wood]: 2 }, work: 8, hp: 300, era: 0, minPop: 0, desc: 'Crosses rivers and straits.' }),
];

export interface Building {
  id: number; type: BT; city: number; x: number; y: number; w: number; h: number;
  hp: number; maxHp: number; built: number; alive: boolean; era: number; style: number; born: number; name?: string;
}

export interface City {
  id: number; name: string; kingdom: number; x: number; y: number; founded: number; alive: boolean;
  culture: number; religion: number; species: number;
  pop: number; adults: number; soldiers: number; housing: number; tiles: number;
  buildings: number[]; stock: Float32Array; jobsWant: Int16Array; jobsHave: Int16Array;
  fields: number[]; fieldTarget: number; plan: { type: BT; x: number; y: number } | null;
  happy: number; unrest: number; loyalty: number; fervor: number; crime: number;
  capital: boolean; port: number; lastAttacked: number; siege: number; plague: number;
  equip: number;       // weapons and armour stockpile level 0..1
  festival: number;    // ticks of festival left
  governor: number;    // character id
  walls: boolean; wallBuilt: boolean;
  famine: number; growth: number; history: number[];
  originKingdom: number; conquered: number;
  faithShare: Map<number, number>;   // religion → share of people
  members: number[];   // unit indices, rebuilt by the census
  queue: number[];     // wall/gate tiles still to build
  style: number;       // building look (species build style)
  coastal: boolean; boats: number; tame: number; magic: number; kids: number;
  ruler: number;       // unit index of the local lord (governor) or -1
  radius: number;      // how far the town may claim land
}

export const enum Gov { Tribe, Chiefdom, Monarchy, Empire, Republic, Theocracy, Horde, Democracy, Dictatorship, Federation, Necrocracy, COUNT }
export const GOV_NAMES = ['Tribe', 'Chiefdom', 'Kingdom', 'Empire', 'Republic', 'Theocracy', 'Horde', 'Democracy', 'Dictatorship', 'Federation', 'Dread Dominion'];

export interface Relation { opinion: number; status: 'peace' | 'war' | 'truce' | 'alliance' | 'vassal' | 'overlord'; since: number; truce: number; trade: boolean; marriage: boolean; grievances: number; }

export interface Kingdom {
  id: number; name: string; short: string; color: number; color2: number; banner: number[];
  capital: number; cities: number[]; founded: number; fell: number; alive: boolean;
  ruler: number; heir: number; dynasty: number; gov: Gov; laws: Set<string>;
  culture: number; religion: number; species: number;
  techs: Set<string>; research: number; researching: string; era: number;
  gold: number; relations: Map<number, Relation>; contacts: Set<number>;
  wars: number[]; overlord: number; stability: number; weariness: number; prestige: number;
  pop: number; soldiers: number; strength: number; peakPop: number; peakCities: number;
  favored: boolean; history: number[]; age: number; goldenAge: number; capitalMoved: number;
  ambition: 'expand' | 'consolidate' | 'conquer' | 'faith' | 'trade' | 'learn';
}

export interface Character {
  id: number; uid: number; name: string; family: string; species: number; culture: number; religion: number;
  female: boolean; born: number; died: number; death: string; kingdom: number; city: number;
  titles: string[]; deeds: number[]; father: number; mother: number; spouse: number; children: number[];
  traits: number; fame: number; kills: number; dynasty: number; hero?: { abilities: string[]; level: number };
}

export interface Dynasty { id: number; name: string; founder: number; kingdom: number; members: number[]; born: number; rulers: number; }

export interface War {
  id: number; name: string; attacker: number; defender: number; attackers: number[]; defenders: number[];
  goal: string; target: number; started: number; ended: number; active: boolean; score: number;
  battles: number; deaths: [number, number]; winner: number; cause: string; peace?: string;
}

export interface Army {
  id: number; kingdom: number; war: number; general: number; members: number[]; target: number;
  x: number; y: number; state: 'gather' | 'march' | 'siege' | 'battle' | 'retreat' | 'home' | 'disband';
  path: Int32Array | null; pathPos: number; born: number; strength: number; tx: number; ty: number; stuck: number; naval: boolean;
}

export interface HEvent {
  id: number; tick: number; kind: string; text: string; x: number; y: number;
  k?: number; k2?: number; c?: number; ch?: number; w?: number; r?: number; s?: number; imp: number;
}

export interface Band { id: number; sub: number; culture: number; leader: number; kingdom: number; members: number; tx: number; ty: number; age: number; alive: boolean; colonyOf: number; }
