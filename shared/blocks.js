export const BLOCK = Object.freeze({
  AIR: 0,
  BEDROCK: 1,
  GRASS: 2,
  DIRT: 3,
  STONE: 4,
  SAND: 5,
  WATER: 6,
  LOG: 7,
  LEAVES: 8,
  COAL_ORE: 9,
  IRON_ORE: 10,
  PLANKS: 11,
});

const define = (id, name, mn, color, options = {}) => Object.freeze({
  id,
  name,
  mn,
  color,
  topColor: options.topColor ?? color,
  sideColor: options.sideColor ?? color,
  solid: options.solid ?? true,
  opaque: options.opaque ?? true,
  replaceable: options.replaceable ?? false,
  hardness: options.hardness ?? 0.5,
  placeable: options.placeable ?? true,
});

export const BLOCKS = Object.freeze([
  define(BLOCK.AIR, 'Air', 'Агаар', 0x000000, {
    solid: false, opaque: false, replaceable: true, hardness: Infinity, placeable: false,
  }),
  define(BLOCK.BEDROCK, 'Bedrock', 'Үндсэн чулуу', 0x282a2b, {
    hardness: Infinity, placeable: false,
  }),
  define(BLOCK.GRASS, 'Grass', 'Өвс', 0x6f9345, {
    topColor: 0x83ad51, sideColor: 0x6d7542, hardness: 0.35,
  }),
  define(BLOCK.DIRT, 'Dirt', 'Шороо', 0x77523a, { hardness: 0.4 }),
  define(BLOCK.STONE, 'Stone', 'Чулуу', 0x737978, { hardness: 1.1 }),
  define(BLOCK.SAND, 'Sand', 'Элс', 0xc5ae72, { hardness: 0.35 }),
  define(BLOCK.WATER, 'Water', 'Ус', 0x3a83ae, {
    solid: false, opaque: false, replaceable: true, hardness: Infinity, placeable: false,
  }),
  define(BLOCK.LOG, 'Log', 'Мод', 0x755033, {
    topColor: 0xa47a4f, sideColor: 0x68452c, hardness: 0.9,
  }),
  define(BLOCK.LEAVES, 'Leaves', 'Навч', 0x4f773f, {
    opaque: false, hardness: 0.2,
  }),
  define(BLOCK.COAL_ORE, 'Coal Ore', 'Нүүрсний хүдэр', 0x505452, { hardness: 1.4 }),
  define(BLOCK.IRON_ORE, 'Iron Ore', 'Төмрийн хүдэр', 0x8d7869, { hardness: 1.7 }),
  define(BLOCK.PLANKS, 'Planks', 'Банз', 0xb58752, {
    topColor: 0xc49a62, sideColor: 0xa87949, hardness: 0.7,
  }),
]);

export const HOTBAR_BLOCKS = Object.freeze([
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.SAND,
  BLOCK.LOG,
  BLOCK.PLANKS,
]);

export const blockDef = (id) => BLOCKS[id] || BLOCKS[BLOCK.AIR];
export const isSolid = (id) => blockDef(id).solid;
export const isOpaque = (id) => blockDef(id).opaque;
export const isLiquid = (id) => id === BLOCK.WATER;
export const isTargetable = (id) => id !== BLOCK.AIR && id !== BLOCK.WATER;
