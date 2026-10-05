// All player-facing Thai text. Keyed records are typed against the data ids,
// so adding content to src/data without a Thai name is a compile error.
import type {
  ArmorId,
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
  hide: 'หนังหมาใน',
  fang: 'เขี้ยวหมาใน',
  ore: 'แร่เหล็ก',
  herb: 'สมุนไพร',
  scale: 'หนังกระทิง',
  horn: 'เขากระทิง',
  etail: 'หางเพลิง',
  core: 'แก่นเพลิง',
  feather: 'ขนไก่ป่า',
  fowlmeat: 'เนื้อไก่ป่า',
  boarhide: 'หนังหมูป่า',
  tusk: 'เขี้ยวหมูป่า',
  bristle: 'แผงขนหมูป่า',
  boarmeat: 'เนื้อหมูป่า',
  tigerpelt: 'หนังเสือ',
  tigerfang: 'เขี้ยวเสือ',
  tigertail: 'หางเสือ',
  tigereye: 'ตาเสือ',
  yam: 'มันหวาน',
  pepper: 'พริกเพลิง',
  lemongrass: 'ตะไคร้',
  rice: 'ข้าวเหนียว',
  seed_herb: 'เมล็ดหญ้ายา',
  seed_yam: 'หัวพันธุ์มันหวาน',
  seed_pepper: 'เมล็ดพริกเพลิง',
  seed_lemongrass: 'เหง้าตะไคร้',
  seed_rice: 'เมล็ดข้าวเหนียว',
  fert: 'ปุ๋ยซาก',
} satisfies Record<MaterialId, string>;

export const rarity = { 1: 'หายาก', 2: 'หายากมาก' } as const;

export const monsters = {
  junglefowl: {
    name: 'ไก่ป่า',
    parts: { head: 'หงอน' },
    attacks: { peck: 'จิก', flutter: 'บินกระพือ' },
    tip: 'ตัวเล็กแต่ไว ตีหงอนจากด้านหน้าเพื่อเอาขนไก่ ระวังบินกระพือพุ่งเข้าหา',
  },
  dhole: {
    name: 'หมาใน',
    parts: { head: 'หัว' },
    attacks: { bite: 'กัด', pounce: 'กระโจน' },
    tip: 'มาเป็นฝูง ตีหัวจากด้านหน้าให้แตกเพื่อเอาเขี้ยว เห็นย่อตัวแล้วกลิ้งออกด้านข้างก่อนกระโจน',
  },
  boar: {
    name: 'หมูป่า',
    parts: { head: 'เขี้ยว', tail: 'แผงขน' },
    attacks: { gore: 'ขวิด', charge: 'พุ่งชน' },
    tip: 'หันตัวช้า อ้อมไปด้านหลังตีแผงขนได้ง่าย พุ่งชนยาวมาก กลิ้งออกด้านข้างอย่ากลิ้งถอยหลัง',
  },
  gaur: {
    name: 'กระทิงผาแดง',
    parts: { head: 'เขา', tail: 'หาง' },
    attacks: { stomp: 'กระทืบ', flameRing: 'วงไฟรอบตัว', charge: 'พุ่งชน' },
    tip: 'หักเขาจากด้านหน้า ตัดหางเพลิงจากด้านหลัง วงไฟเตือนนานที่สุด ออกจากวงให้ทัน โกรธเมื่อเลือดเหลือครึ่ง',
  },
  tiger: {
    name: 'เสือโคร่ง',
    parts: { head: 'เขี้ยว', tail: 'หาง' },
    attacks: { claw: 'ตะปบ', pounce: 'กระโจน', roar: 'คำราม' },
    tip: 'เจ้าป่าตัวจริง กระโจนไกลและคำรามเป็นวงกว้าง กินต้มยำไก่ป่าและใส่เกราะก่อนไป ตาเสือดรอป 25%',
  },
} satisfies Record<MonsterId, { name: string; parts: Partial<Record<PartId, string>>; attacks: Record<string, string>; tip: string }>;

export const weaponTypes = {
  sword: 'ดาบ',
  hammer: 'ค้อน',
  greatsword: 'ดาบใหญ่',
  spear: 'หอก',
  bow: 'ธนู',
} satisfies Record<WeaponType, string>;

export const weapons = {
  bone: { name: 'ดาบกระดูก', desc: 'อาวุธเริ่มต้น' },
  fangblade: { name: 'ดาบเขี้ยวหมาใน', desc: 'ฟันเร็ว ตัดหางได้ดี' },
  mossmaul: { name: 'ตะลุมพุก', desc: 'ค้อนไม้หัวหิน ตีหัวซ้ำจนมอนมึน' },
  cleaver: { name: 'ดาบใหญ่เขากระทิง', desc: 'ต้องหักเขาและตัดหางกระทิงผาแดง' },
  coreblade: { name: 'ดาบแก่นเพลิง', desc: 'ต้องใช้วัสดุหายาก' },
  bamboospear: { name: 'หอกไม้ไผ่', desc: 'ระยะยาวกว่าดาบ แทงต่อเนื่อง' },
  bamboobow: { name: 'ธนูไม้ไผ่', desc: 'ยิงจากระยะไกล แต่ทำลายชิ้นส่วนช้า' },
  redcrossbow: { name: 'หน้าไม้เขี้ยวหมูป่า', desc: 'ยิงช้าแต่แรง ลูกดอกทะลุได้ 1 ตัว' },
  tuskaxe: { name: 'ขวานเขี้ยวหมูป่า', desc: 'หนักและทำให้มึนเร็ว ท่าประจำพุ่งขวิด' },
  tigerspear: { name: 'หอกเขี้ยวเสือ', desc: 'หอกของพรานใหญ่ แทงทะลวงสองครั้ง' },
  stripeblade: { name: 'ดาบลายพาดกลอน', desc: 'ดาบใหญ่ที่แรงที่สุด ต้องมีตาเสือ' },
} satisfies Record<WeaponId, { name: string; desc: string }>;

export const armor = {
  mosshood: { name: 'หมวกหนังหมาใน', desc: 'หมวกเบาจากหนังหมาใน' },
  mossvest: { name: 'เสื้อหนังหมาใน', desc: 'เสื้อหนังเย็บแน่น กันเขี้ยวได้ดี' },
  fangcharm: { name: 'เครื่องรางเขี้ยว', desc: 'ร้อยเขี้ยวกับสมุนไพร ทำให้ไม่เหนื่อยง่าย' },
  feathercharm: { name: 'เครื่องรางขนไก่ป่า', desc: 'เบาเหมือนขนนก วิ่งกลิ้งได้นานขึ้น' },
  boarhelm: { name: 'หมวกหนังหมูป่า', desc: 'หนังหนา มีเขี้ยวประดับ' },
  boarvest: { name: 'เสื้อหนังหมูป่า', desc: 'บุแผงขนกันกระแทก' },
  cinderhelm: { name: 'หมวกหนังกระทิง', desc: 'หนังกระทิงซ้อนกันหลายชั้น' },
  cindermail: { name: 'เกราะหนังกระทิง', desc: 'เกราะหนักจากหนังกระทิงและหางเพลิง' },
  emberamulet: { name: 'เครื่องรางแก่นเพลิง', desc: 'อุ่นอยู่ตลอดเวลา เพิ่มทุกอย่างเล็กน้อย' },
  tigerhood: { name: 'หมวกหนังเสือ', desc: 'หมวกของพรานผู้ล่าเสือได้' },
  tigercoat: { name: 'เสื้อหนังเสือ', desc: 'เบาแต่ทนทาน ลายพาดกลอนทั้งตัว' },
  tigereyecharm: { name: 'เครื่องรางตาเสือ', desc: 'ตาเสือเรืองแสงสีเขียว เพิ่มทุกอย่าง' },
} satisfies Record<ArmorId, { name: string; desc: string }>;

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
  gore: { name: 'พุ่งขวิด', desc: 'พุ่งชนแบบหมูป่า อมตะช่วงสั้น สะสมความมึน (×2.6)' },
  tigerlunge: { name: 'แทงพยัคฆ์', desc: 'ง้างแล้วแทงยาวสองครั้ง ทำลายชิ้นส่วนแรง (×2.6 ×2)' },
  stripestorm: { name: 'พายุพาดกลอน', desc: 'หมุนฟันวงใหญ่ ทำลายชิ้นส่วนดี (×3)' },
} satisfies Record<SkillId, { name: string; desc: string }>;

export const crops = {
  herb: { name: 'หญ้ายา', source: 'เก็บสมุนไพรในป่า' },
  yam: { name: 'มันหวาน', source: 'ล่าหมาใน' },
  lemongrass: { name: 'ตะไคร้', source: 'ล่าไก่ป่า' },
  rice: { name: 'ข้าวเหนียว', source: 'ล่าหมูป่า' },
  pepper: { name: 'พริกเพลิง', source: 'ล่ากระทิงผาแดง' },
} satisfies Record<CropId, { name: string; source: string }>;

export const meals = {
  stew: { name: 'แกงป่ามันหวาน', desc: 'พลังชีวิตสูงสุด +30' },
  spicy: { name: 'ข้าวผัดพริกเพลิง', desc: 'พลังโจมตี +20%' },
  tea: { name: 'ชาหญ้ายา', desc: 'ความอึดฟื้นเร็ว กลิ้งเปลืองน้อยลง' },
  tomyum: { name: 'ต้มยำไก่ป่า', desc: 'ป้องกัน +15' },
  grill: { name: 'ข้าวเหนียวหมูป่าย่าง', desc: 'พลังชีวิตสูงสุด +20 โจมตี +10%' },
} satisfies Record<MealId, { name: string; desc: string }>;

export const zones = {
  village: 'หมู่บ้านพราน',
  forest: 'ป่าดงดิบ',
  bridge: 'สะพานไม้',
  canyon: 'หุบผาแดง',
  bamboo: 'ป่าไผ่',
  swamp: 'บึงจระเข้',
  limestone: 'ดอยหินปูน',
  deepwild: 'ป่าลึกช้างป่า',
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
  tabs: { bag: 'กระเป๋า', forge: 'ตีอาวุธ', kitchen: 'ครัว', farm: 'แปลงผัก', book: 'สมุดภาพ' },
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
  stats: { attack: 'พลังโจมตี', defense: 'ป้องกัน', hp: 'HP สูงสุด', stamina: 'ความอึด' },
  armorTitle: 'ชุดเกราะ',
  weaponsTitle: 'อาวุธ',
  armorMeta: (slot: string, def: number, hp: number, st: number) =>
    [slot, def ? `ป้องกัน ${def}` : '', hp ? `HP +${hp}` : '', st ? `ความอึด +${st}` : ''].filter(Boolean).join(' · '),
  reduction: (pct: number) => `ลดดาเมจ ${pct}%`,
  unequip: 'ถอด',
  wear: 'สวมใส่',
  craftArmor: 'ตีชุดเกราะ',
  upgrade: (lv: number) => `อัปเกรดเป็น +${lv}`,
  maxLevel: 'อัปเกรดสูงสุดแล้ว',
  upgradeHint: (max: number) => `อัปเกรดได้ถึง +${max} ขั้นสุดท้ายต้องใช้วัสดุหายาก`,
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
    upgrade: (w: string) => `อัปเกรด${w}`,
    meal: (m: string) => m,
    potion: 'ปรุงยาฟื้นพลัง',
    plant: (crop: string) => `ปลูก${crop}`,
    fertilizer: 'ใส่แปลงผักให้โตเร็ว 2 เท่า',
  },
  weaponStats: (type: string, dmg: number, speed: string) => `${type} · พลัง ${dmg} · ${speed}`,
  potionDesc: (heal: number) => `ฟื้น HP ${heal} · ปรุงจากสมุนไพรที่โรงตีเหล็ก`,
  newGame: 'เริ่มเกมใหม่',
  confirmNewGame: 'กดอีกครั้งเพื่อยืนยัน',
  // bestiary
  book: {
    progress: (n: number, total: number) => `บันทึกแล้ว ${n}/${total} ชนิด`,
    help: 'ล่าสำเร็จครั้งแรกเพื่อปลดล็อกข้อมูล แตะรูปเพื่อดูรายละเอียด',
    unknown: '???',
    lockedHint: (where: string) => `ยังไม่เคยล่า · พบได้ที่${where}`,
    hunted: (n: number) => `ล่าแล้ว ${n} ตัว`,
    where: 'พบที่',
    deepForest: 'ป่าลึกฝั่งตะวันออกของแม่น้ำ',
    hp: 'พลังชีวิต',
    huntTime: 'เวลาล่า',
    size: 'ขนาด',
    sizes: { small: 'เล็ก', medium: 'กลาง', large: 'ใหญ่' },
    rage: 'โกรธเมื่อเลือดเหลือครึ่ง',
    parts: 'ชิ้นส่วน',
    partHow: { head: 'ตีจากด้านหน้า', tail: 'อ้อมไปตีด้านหลัง' },
    attacks: 'ท่าโจมตี',
    shapes: { ring: 'วงรอบตัว', front: 'วงหน้าตัว', line: 'พุ่งเป็นเส้น' },
    attackMeta: (shape: string, warn: number, dmg: number) => `${shape} · เตือน ${warn} วิ · ดาเมจ ${dmg}`,
    drops: 'ของที่ได้จากซาก',
    chance: (pct: number) => `${pct}%`,
    tip: 'เคล็ดลับ',
  },
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
    title: 'ล่าหมาในกับไก่ป่า',
    desc: 'ออกทางเหนือของหมู่บ้าน ล่าหมาในและไก่ป่า เก็บเขี้ยว หนัง ขนไก่ และแร่ (หินประกายฟ้า) แล้วกลับมาตีอาวุธ ระหว่างนั้นปลูกผักไว้ด้วย',
  },
  {
    title: 'กินแกงป่าแล้วไปหุบผาแดง',
    desc: 'ทำแกงป่ามันหวาน (HP +30) แล้วข้ามสะพานทางตะวันออก ตีหัวกระทิงผาแดงจากด้านหน้าเพื่อหักเขา และอ้อมไปด้านหลังเพื่อตัดหาง',
  },
  {
    title: 'ปลูกพริกเพลิง ล่าหาแก่นเพลิง',
    desc: 'กระทิงผาแดงให้เมล็ดพริกเพลิง ปลูกแล้วทำข้าวผัดพริกเพลิง (โจมตี +20%) แก่นเพลิงดรอป 25%',
  },
  {
    title: 'ล่าเสือโคร่งในป่าลึก',
    desc: 'ข้ามสะพานเหนือไปป่าลึกฝั่งตะวันออก เสือโคร่งกระโจนไกลและคำรามเป็นวงกว้าง กินต้มยำไก่ป่า (ป้องกัน +15) ก่อนไป',
  },
  { title: 'พรานใหญ่แห่งพงไพร', desc: 'ลองล่าเสือโคร่งโดยไม่โดนตีเลยสักครั้ง' },
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
  upgraded: (weapon: string) => `อัปเกรดเป็น ${weapon} สำเร็จ`,
  equipped: (weapon: string) => `เปลี่ยนมาใช้${weapon}`,
  armorOn: (piece: string) => `สวม${piece}`,
  armorOff: (piece: string) => `ถอด${piece}`,
  armorCrafted: (piece: string) => `ตี${piece}สำเร็จ`,
  brewed: 'ปรุงยา 1 ขวด',
  ate: (meal: string, desc: string) => `กิน${meal} ${desc}`,
  mealExpired: (meal: string) => `ฤทธิ์${meal}หมดแล้ว`,
};

/** Weapon name with its upgrade level, e.g. "ดาบกระดูก +2". */
export const weaponName = (id: WeaponId, level: number): string => (level > 0 ? `${weapons[id].name} +${level}` : weapons[id].name);
