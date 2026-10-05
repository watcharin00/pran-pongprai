// All player-facing Thai text. Keyed records are typed against the data ids,
// so adding content to src/data without a Thai name is a compile error.
import type {
  CropId,
  MaterialId,
  MealId,
  MonsterId,
  PartId,
  SkillId,
  WeaponId,
  WeaponType,
  ZoneId,
} from '../data/types';

export const materials = {
  hide: 'หนังมอสส์ฟาง',
  fang: 'เขี้ยวมอสส์ฟาง',
  ore: 'แร่เหล็ก',
  herb: 'สมุนไพร',
  scale: 'เกล็ดถ่านหิน',
  horn: 'เขาซินเดอร์',
  etail: 'หางเพลิง',
  core: 'แก่นเพลิง',
  yam: 'มันหวาน',
  pepper: 'พริกเพลิง',
  seed_herb: 'เมล็ดหญ้ายา',
  seed_yam: 'หัวพันธุ์มันหวาน',
  seed_pepper: 'เมล็ดพริกเพลิง',
  fert: 'ปุ๋ยซาก',
} satisfies Record<MaterialId, string>;

export const rarity = { 1: 'หายาก', 2: 'หายากมาก' } as const;

export const monsters = {
  mossfang: {
    name: 'มอสส์ฟาง',
    parts: { head: 'หัว' },
    attacks: { bite: 'กัด', pounce: 'กระโจน' },
  },
  cinderhorn: {
    name: 'ซินเดอร์ฮอร์น',
    parts: { head: 'เขา', tail: 'หาง' },
    attacks: { stomp: 'กระทืบ', flameRing: 'วงไฟรอบตัว', charge: 'พุ่งชน' },
  },
} satisfies Record<MonsterId, { name: string; parts: Partial<Record<PartId, string>>; attacks: Record<string, string> }>;

export const weaponTypes = {
  sword: 'ดาบ',
  hammer: 'ค้อน',
  greatsword: 'ดาบใหญ่',
  spear: 'หอก',
  bow: 'ธนู',
} satisfies Record<WeaponType, string>;

export const weapons = {
  bone: { name: 'ดาบกระดูก', desc: 'อาวุธเริ่มต้น' },
  fangblade: { name: 'ดาบเขี้ยวมอสส์', desc: 'ฟันเร็ว ตัดหางได้ดี' },
  mossmaul: { name: 'ค้อนหินมอสส์', desc: 'ตีหัวซ้ำจนมอนมึน' },
  cleaver: { name: 'ดาบใหญ่ถ่านเพลิง', desc: 'ต้องหักเขาและตัดหางซินเดอร์ฮอร์น' },
  coreblade: { name: 'ดาบแก่นเพลิง', desc: 'ต้องใช้วัสดุหายาก' },
  bamboospear: { name: 'หอกไม้ไผ่', desc: 'ระยะยาวกว่าดาบ แทงต่อเนื่อง' },
  bamboobow: { name: 'ธนูไม้ไผ่', desc: 'ยิงจากระยะไกล แต่ทำลายชิ้นส่วนช้า' },
  redcrossbow: { name: 'หน้าไม้ผาแดง', desc: 'ยิงช้าแต่แรง ลูกดอกทะลุได้ 1 ตัว' },
} satisfies Record<WeaponId, { name: string; desc: string }>;

export const skills = {
  whirl: { name: 'หมุนฟัน', desc: 'ฟันรอบตัว โดนทุกตัวที่อยู่ใกล้ (×1.5)' },
  dash: { name: 'พุ่งแทง', desc: 'พุ่งทะลุไปข้างหน้า อมตะระหว่างพุ่ง (×2)' },
  slam: { name: 'ทุบพื้น', desc: 'ง้างแล้วทุบแรง ทำให้มึนเร็ว ทำลายชิ้นส่วนดี (×3.2)' },
  crosscut: { name: 'ฟันไขว้', desc: 'ฟันไขว้สองครั้งตรงหน้า ทำลายชิ้นส่วนดี (×1.7 ×2)' },
  sweep: { name: 'เหวี่ยงค้อน', desc: 'เหวี่ยงรอบตัววงกว้าง สะสมความมึน (×1.8)' },
  quake: { name: 'ทุบสะท้าน', desc: 'ง้างนานแล้วทุบให้พื้นสะเทือน มึนเร็วมาก (×2.8)' },
  cleave: { name: 'ฟันผ่าหนัก', desc: 'ง้างแล้วฟันลงตรงหน้า ทำลายชิ้นส่วนแรง (×3)' },
  coreburst: { name: 'ระเบิดเพลิง', desc: 'ง้างแล้วระเบิดเปลวไฟวงใหญ่ (×4.2)' },
  thrust: { name: 'แทงสามที', desc: 'แทงเป็นเส้นตรงสามครั้งติด (×1.1 ×3)' },
  pierce: { name: 'แทงทะลวง', desc: 'ง้างแล้วแทงยาวทะลุทุกตัวในแนว (×3.4)' },
  volley: { name: 'ยิงกระจาย', desc: 'ยิงลูกศรสามดอกเป็นรูปพัด (×1.2 ต่อดอก)' },
  pin: { name: 'ยิงตรึง', desc: 'ยิงแรงหนึ่งดอก สะสมความมึน (×2.6)' },
  piercer: { name: 'ศรเจาะ', desc: 'ลูกศรทะลุได้ 3 ตัว ทำลายชิ้นส่วนดี (×2.4)' },
  bolt: { name: 'ดอกทะลวง', desc: 'ลูกดอกแรงพุ่งทะลุทุกตัวในแนว (×4)' },
} satisfies Record<SkillId, { name: string; desc: string }>;

export const crops = {
  herb: { name: 'หญ้ายา', source: 'เก็บสมุนไพรในป่า' },
  yam: { name: 'มันหวาน', source: 'ล่ามอสส์ฟาง' },
  pepper: { name: 'พริกเพลิง', source: 'ล่าซินเดอร์ฮอร์น' },
} satisfies Record<CropId, { name: string; source: string }>;

export const meals = {
  stew: { name: 'สตูมันหวานเนื้อมอส', desc: 'พลังชีวิตสูงสุด +30' },
  spicy: { name: 'ข้าวผัดพริกเพลิง', desc: 'พลังโจมตี +20%' },
  tea: { name: 'ชาหญ้ายา', desc: 'ความอึดฟื้นเร็ว กลิ้งเปลืองน้อยลง' },
} satisfies Record<MealId, { name: string; desc: string }>;

export const zones = {
  village: 'หมู่บ้านพราน',
  forest: 'ป่ามอสส์',
  bridge: 'สะพานไม้',
  canyon: 'หุบผาแดง',
} satisfies Record<ZoneId, string>;

export const game = {
  title: 'พรานพงไพร',
  canvasLabel: 'โลกของเกม ลากนิ้วด้านซ้ายเพื่อเดิน',
};

export const hud = {
  goal: 'เป้าหมาย',
  auto: 'AUTO',
  menu: 'เมนู',
  close: 'ปิด',
  drinkPotion: 'ดื่มยา',
  attack: 'โจมตี',
  dodge: 'กลิ้ง',
  enraged: ' · โกรธ',
  stunned: ' · มึน',
  partBroken: ' แตกแล้ว',
  knockedOut: 'หมดสติ... กำลังกลับหมู่บ้าน',
  keyboardHint: { move: 'เดิน', attack: 'ตี', skills: 'สกิล', dodge: 'กลิ้ง', potion: 'ยา', auto: 'AUTO', menu: 'เมนู' },
};

/** Labels on the attack button when it turns into the context button. */
export const context = {
  forge: 'ตีอาวุธ',
  kitchen: 'ทำอาหาร',
  plant: 'ปลูก',
  farm: 'แปลงผัก',
};

/** World-space name labels shown near village stations. */
export const places = {
  forge: 'โรงตีเหล็ก',
  kitchen: 'โรงครัว',
  farm: 'แปลงผัก',
  farmRipe: (n: number) => `แปลงผัก · พร้อมเก็บ ${n}`,
};

/** Floating text above entities. */
export const floats = {
  stunned: 'มึน!',
  enraged: 'โกรธ!',
  broken: 'แตก!',
  hunted: 'ล่าสำเร็จ!',
  dodged: 'หลบ!',
  tired: 'เหนื่อย',
  harvested: 'เก็บเกี่ยว!',
  planted: (crop: string) => `ปลูก${crop}`,
};

export const menu = {
  tabs: { bag: 'กระเป๋า', forge: 'ตีอาวุธ', kitchen: 'ครัว', farm: 'แปลงผัก' },
  inVillage: 'อยู่ในหมู่บ้าน ใช้งานได้',
  notInVillage: 'กลับหมู่บ้านก่อน จึงจะใช้เมนูนี้ได้',
  skills: 'สกิล',
  partsTitle: 'ชิ้นส่วน',
  partsHelp: 'ตีจากด้านหน้าโดนหัว/เขา อ้อมไปด้านหลังโดนหาง',
  cooldown: (s: number) => `คูลดาวน์ ${s} วิ`,
  materials: 'วัสดุ',
  log: 'บันทึก',
  // bag
  filters: { all: 'ทั้งหมด', gear: 'อุปกรณ์', material: 'วัสดุ', seed: 'เมล็ด' },
  slots: { weapon: 'อาวุธ', head: 'หมวก', body: 'เสื้อ', charm: 'เครื่องราง' },
  slotEmpty: 'ว่าง',
  slotSoon: 'ยังไม่มีชุดเกราะ',
  stats: { attack: 'พลังโจมตี', hp: 'HP สูงสุด', stamina: 'ความอึด', potions: 'ยา' },
  bagEmpty: 'ยังไม่มีของในหมวดนี้',
  bagHelp: 'แตะไอเท็มเพื่อดูว่าได้มาจากไหนและใช้ทำอะไร',
  have: (n: number) => `มี ${n}`,
  sourcesTitle: 'ได้จาก',
  usesTitle: 'ใช้ทำ',
  noSource: 'ยังไม่มีแหล่งที่มา',
  noUse: 'ยังไม่มีสูตรที่ใช้',
  source: {
    part: (part: string, mon: string) => `ทำลาย${part}${mon}`,
    carve: (mon: string) => `ล่า${mon}`,
    bonus: (mon: string, pct: number) => `ล่า${mon} (${pct}%)`,
    rare: (mon: string, pct: number) => `ล่า${mon} (หายาก ${pct}%)`,
    crop: (crop: string) => `ปลูก${crop}`,
    gather: { herb: 'เก็บสมุนไพรในป่า', ore: 'ขุดแร่ (หินประกายฟ้า)' },
    gatherChance: (what: string, pct: number) => `${what} (${pct}%)`,
  },
  use: {
    weapon: (w: string) => `ตี${w}`,
    meal: (m: string) => m,
    potion: 'ปรุงยาฟื้นพลัง',
    plant: (crop: string) => `ปลูก${crop}`,
    fertilizer: 'ใส่แปลงผักให้โตเร็ว 2 เท่า',
  },
  weaponStats: (type: string, dmg: number, speed: string) => `${type} · พลัง ${dmg} · ${speed}`,
  potionDesc: (heal: number) => `ฟื้น HP ${heal} · ปรุงจากสมุนไพรที่โรงตีเหล็ก`,
  newGame: 'เริ่มเกมใหม่',
  confirmNewGame: 'กดอีกครั้งเพื่อยืนยัน',
  // forge
  equipped: 'กำลังใช้',
  equip: 'เปลี่ยนมาใช้',
  craft: 'ตีอาวุธ',
  weaponMeta: (type: string, dmg: number, speed: string, desc: string) => `${type} · พลัง ${dmg} · ${speed} · ${desc}`,
  speed: { fast: 'เร็ว', mid: 'กลาง', slow: 'ช้า' },
  potionName: 'ยาฟื้นพลัง',
  potionMeta: (heal: number, have: number) => `ฟื้น HP ${heal} · มีอยู่ ${have} ขวด`,
  brew: 'ปรุงยา',
  // kitchen
  currentMeal: 'มื้อนี้:',
  mealLeft: (time: string) => `เหลือ ${time}`,
  mealRule: 'กินได้ทีละมื้อ บัฟอยู่ 5 นาที',
  cookAndEat: 'ทำแล้วกิน',
  eating: 'กินอยู่',
  // farm
  farmInVillage: 'แตะแปลงเพื่อปลูกหรือเก็บเกี่ยวได้จากตรงนี้เลย',
  farmNotInVillage: 'กลับหมู่บ้านก่อน จึงจะปลูกได้ (พืชยังโตต่อระหว่างที่คุณออกล่า)',
  seedToPlant: 'เมล็ดที่จะปลูก',
  growInfo: (crop: string, time: string, source: string) => `${crop} โตใน ${time} · หาเมล็ดจากการ${source}`,
  useFert: (have: number) => `ใส่ปุ๋ยซาก โตเร็วขึ้น 2 เท่า (มี ${have})`,
  plantAllHelp: 'ปลูกทุกแปลงที่ว่างในครั้งเดียว',
  plantAll: 'ปลูกทั้งหมด',
  plotEmpty: 'ว่าง',
  plotTapToPlant: 'แตะเพื่อปลูก',
  plotRipe: 'พร้อมเก็บ',
  plotLeft: (time: string) => `อีก ${time}`,
};

export const goals: readonly { title: string; desc: string }[] = [
  {
    title: 'ล่ามอสส์ฟางในป่า',
    desc: 'ออกทางเหนือของหมู่บ้าน ล่ามอสส์ฟาง เก็บเขี้ยว หนัง และแร่ (หินประกายฟ้า) แล้วกลับมาตีอาวุธ ระหว่างนั้นปลูกผักไว้ด้วย',
  },
  {
    title: 'กินสตูแล้วไปหุบผาแดง',
    desc: 'ทำสตูมันหวานเนื้อมอส (HP +30) แล้วข้ามสะพานทางตะวันออก ตีหัวซินเดอร์ฮอร์นจากด้านหน้าเพื่อหักเขา และอ้อมไปด้านหลังเพื่อตัดหาง',
  },
  {
    title: 'ปลูกพริกเพลิง ล่าหาแก่นเพลิง',
    desc: 'ซินเดอร์ฮอร์นให้เมล็ดพริกเพลิง ปลูกแล้วทำข้าวผัดพริกเพลิง (โจมตี +20%) แก่นเพลิงดรอป 25%',
  },
  { title: 'ครบทุกอาวุธแล้ว', desc: 'ลองล่าซินเดอร์ฮอร์นโดยไม่โดนตีเลยสักครั้ง' },
];

/** Toast / log messages. */
export const log = {
  welcome: 'ลากนิ้วด้านซ้ายเพื่อเดิน กดปุ่มส้มเพื่อตี',
  loaded: 'โหลดความคืบหน้าเดิมแล้ว',
  autoHint: 'AUTO เดินและตีให้ แต่การหลบท่าเป็นหน้าที่คุณ',
  itemCount: (name: string, n: number) => `${name} ×${n}`,
  stunned: (mon: string) => `${mon} มึนงง! รีบตีเลย`,
  enraged: (mon: string) => `${mon} โกรธแล้ว! ท่าเร็วขึ้น`,
  partBroken: (part: string, mon: string, got: string) => `ทำลาย${part}${mon} ได้ ${got}`,
  hunted: (mon: string, got: string) => `ล่า${mon}สำเร็จ ได้ ${got}`,
  rareDrop: (item: string) => `โชคดี! ได้ ${item}`,
  huntTimeout: (mon: string) => `หมดเวลา ${mon} หนีไปแล้ว`,
  knockedOut: 'หมดสติ! ชาวบ้านหามกลับหมู่บ้าน',
  noPotion: 'ยาหมด ปรุงเพิ่มที่โรงตีเหล็ก (สมุนไพร 2)',
  noSeed: (seed: string, source: string) => `ไม่มี${seed} หาได้จากการ${source}`,
  harvested: (crop: string, got: string) => `เก็บ${crop} ได้ ${got}`,
  gathered: (got: string) => `เก็บ ${got}`,
  herbSeedBonus: 'ได้เมล็ดหญ้ายาติดมาด้วย',
  plantedMany: (crop: string, n: number) => `ปลูก${crop} ${n} แปลง`,
  crafted: (weapon: string) => `ตี${weapon}สำเร็จ`,
  equipped: (weapon: string) => `เปลี่ยนมาใช้${weapon}`,
  brewed: 'ปรุงยา 1 ขวด',
  ate: (meal: string, desc: string) => `กิน${meal} ${desc}`,
  mealExpired: (meal: string) => `ฤทธิ์${meal}หมดแล้ว`,
};
