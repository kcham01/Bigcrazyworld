// The tech tree: nine eras from stone tools to starships. Research comes from people, scholars,
// libraries and contact with other peoples (ideas spread along trade routes and borders).
export const ERAS = ['Stone Age', 'Bronze Age', 'Iron Age', 'Middle Ages', 'Age of Gunpowder', 'Industrial Age', 'Modern Age', 'Atomic Age', 'Space Age'];
export const ERA_SHORT = ['Stone', 'Bronze', 'Iron', 'Medieval', 'Gunpowder', 'Industrial', 'Modern', 'Atomic', 'Space'];

export interface TechDef { key: string; name: string; era: number; needs: string[]; cost: number; desc: string; }

const t = (key: string, name: string, era: number, needs: string[], desc: string): TechDef => ({ key, name, era, needs, cost: Math.round(40 * Math.pow(1.85, era)), desc });

export const TECHS: TechDef[] = [
  t('fire', 'Fire', 0, [], 'Warmth, cooking and the first stories told at night.'),
  t('foraging', 'Foraging', 0, [], 'Berries, roots and nuts.'),
  t('stonetools', 'Stone tools', 0, ['fire'], 'Axes and picks of chipped stone. Unlocks mines.'),
  t('hunting', 'Hunting', 0, ['foraging'], 'Spears and traps for big game.'),
  t('pottery', 'Pottery', 0, ['fire'], 'Pots to store grain and brew drink.'),
  t('agriculture', 'Agriculture', 0, ['foraging', 'stonetools'], 'Fields of grain. Towns can finally grow.'),
  t('husbandry', 'Animal husbandry', 0, ['hunting'], 'Tame sheep, cows, pigs and chickens.'),
  t('sailing', 'Sailing', 0, ['stonetools'], 'Rafts and fishing boats. Unlocks docks.'),
  t('mysticism', 'Mysticism', 0, ['fire'], 'Spirits, shrines and the first priests.'),
  t('bronze', 'Bronze working', 1, ['stonetools', 'pottery'], 'Bronze swords and armour. Unlocks smithies and barracks.'),
  t('writing', 'Writing', 1, ['pottery'], 'Records and letters. Unlocks libraries.'),
  t('wheel', 'The wheel', 1, ['husbandry'], 'Carts and roads.'),
  t('masonry', 'Masonry', 1, ['stonetools'], 'Stone houses and city walls.'),
  t('riding', 'Horseback riding', 1, ['husbandry'], 'Riders and the first cavalry. Unlocks stables.'),
  t('calendar', 'Calendar', 1, ['agriculture', 'mysticism'], 'Better harvests, festivals on time.'),
  t('trade', 'Trade', 1, ['wheel', 'writing'], 'Markets, caravans and warehouses.'),
  t('iron', 'Iron working', 2, ['bronze'], 'Iron swords and mail.'),
  t('math', 'Mathematics', 2, ['writing'], 'Numbers for builders and astronomers.'),
  t('philosophy', 'Philosophy', 2, ['writing', 'mysticism'], 'Big questions. Unlocks mage academies.'),
  t('currency', 'Currency', 2, ['trade'], 'Coins, taxes and palaces.'),
  t('construction', 'Construction', 2, ['masonry', 'wheel'], 'Towers, wonders and bridges over the sea.'),
  t('archery', 'Archery', 2, ['hunting', 'bronze'], 'Longbows and archer companies.'),
  t('seafaring', 'Seafaring', 2, ['sailing', 'bronze'], 'Galleys that cross open sea. Lighthouses.'),
  t('feudalism', 'Feudalism', 3, ['iron', 'construction'], 'Lords, vassals and manors.'),
  t('steel', 'Steel', 3, ['iron', 'math'], 'Plate armour and fine blades.'),
  t('engineering', 'Engineering', 3, ['construction', 'math'], 'Castles, catapults and trebuchets.'),
  t('theology', 'Theology', 3, ['philosophy'], 'Cathedrals and crusades.'),
  t('astronomy', 'Astronomy', 3, ['math', 'calendar'], 'Maps of the sky.'),
  t('chivalry', 'Chivalry', 3, ['riding', 'feudalism'], 'Knights in shining armour.'),
  t('medicine', 'Medicine', 3, ['philosophy'], 'Hospitals and herbal cures. Plagues hurt less.'),
  t('gunpowder', 'Gunpowder', 4, ['steel', 'engineering'], 'Muskets and cannons. Walls stop being enough.'),
  t('printing', 'Printing', 4, ['theology', 'engineering'], 'Books for everyone. Universities.'),
  t('banking', 'Banking', 4, ['currency', 'printing'], 'Loans and wealth.'),
  t('navigation', 'Navigation', 4, ['astronomy', 'seafaring'], 'Galleons sail anywhere.'),
  t('physics', 'Physics', 4, ['printing', 'astronomy'], 'How the world really works.'),
  t('steam', 'Steam power', 5, ['physics'], 'Engines and steamships.'),
  t('railroad', 'Railroads', 5, ['steam'], 'Rails tie the cities together.'),
  t('industry', 'Industrialisation', 5, ['steam', 'banking'], 'Factories and smoke.'),
  t('rifling', 'Rifling', 5, ['gunpowder', 'industry'], 'Rifles and artillery.'),
  t('electricity', 'Electricity', 5, ['physics'], 'Light at night.'),
  t('sanitation', 'Sanitation', 5, ['medicine', 'industry'], 'Clean water: plagues fade.'),
  t('combustion', 'Combustion', 6, ['railroad', 'electricity'], 'Cars and tanks.'),
  t('flight', 'Flight', 6, ['combustion'], 'Aeroplanes and bombers.'),
  t('radio', 'Radio', 6, ['electricity'], 'News travels at the speed of light.'),
  t('massproduction', 'Mass production', 6, ['industry', 'electricity'], 'Apartment blocks and machine guns.'),
  t('antibiotics', 'Antibiotics', 6, ['sanitation'], 'Most diseases become curable.'),
  t('fission', 'Nuclear fission', 7, ['physics', 'massproduction'], 'Atomic power. And atomic bombs.'),
  t('rocketry', 'Rocketry', 7, ['flight', 'radio'], 'Missiles and the first satellites.'),
  t('computers', 'Computers', 7, ['radio', 'massproduction'], 'Thinking machines.'),
  t('genetics', 'Genetics', 7, ['antibiotics', 'computers'], 'Read and rewrite the code of life.'),
  t('spaceflight', 'Spaceflight', 8, ['rocketry', 'computers'], 'Launch pads and orbit.'),
  t('fusion', 'Fusion', 8, ['fission', 'computers'], 'Limitless clean power.'),
  t('ai', 'Artificial minds', 8, ['computers', 'genetics'], 'Machines that think for themselves.'),
  t('starship', 'Starships', 8, ['spaceflight', 'fusion'], 'A ship to leave this world behind.'),
];
export const TECH_BY_KEY: Record<string, TechDef> = Object.fromEntries(TECHS.map(x => [x.key, x]));

/** weapon/armour tier for an era: 0 club, 1 bronze, 2 iron, 3 steel/knight, 4 musket, 5 rifle, 6 modern, 7 atomic, 8 laser */
export const WEAPON_NAMES = ['Club', 'Bronze sword', 'Iron sword', 'Steel blade', 'Musket', 'Rifle', 'Machine gun', 'Assault rifle', 'Laser rifle'];
export const RANGED_NAMES = ['Sling', 'Short bow', 'Bow', 'Longbow', 'Musket', 'Rifle', 'Machine gun', 'Assault rifle', 'Laser rifle'];
export const ARMOR_NAMES = ['Hides', 'Bronze', 'Mail', 'Plate', 'Breastplate', 'Uniform', 'Helmet and vest', 'Kevlar', 'Power armour'];
