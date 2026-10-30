import type { Difficulty, EnemyKind, GearKind, Item, ItemKind, WeaponKind, WeaponElement } from './types';

export const WEAPON_KINDS: WeaponKind[] = ['dagger', 'longsword', 'bow', 'hammer'];
export const WEAPONS: Record<WeaponKind, { label: string; attack: number; range: number; interval: number; glyph: string }> = {
  dagger: { label: '短剑', attack: 8, range: 58, interval: 0.5, glyph: '🗡' },
  longsword: { label: '长剑', attack: 20, range: 110, interval: 1.6, glyph: '⚔' },
  bow: { label: '弓箭', attack: 14, range: Infinity, interval: 1.2, glyph: '🏹' },
  hammer: { label: '锤子', attack: 32, range: 52, interval: 2, glyph: '⚒' },
};
export const ELEMENT_LABELS: Record<WeaponElement, string> = { none: '无属性', thunder: '雷', fire: '火', poison: '毒', ice: '冰', wind: '风', earth: '土' };
export const weaponKind = (item?: Item): WeaponKind => item?.weaponKind ?? 'dagger';
export const weaponProfile = (item?: Item) => WEAPONS[weaponKind(item)];
export const gearGlyph = (item: Item): string => item.kind === 'weapon' ? weaponProfile(item).glyph : '▣';
export function weaponSummary(item: Item): string {
  const p = weaponProfile(item);
  return `${p.interval}秒/次 · ${p.range === Infinity ? '全图单体' : `距离 ${p.range}`} · ${ELEMENT_LABELS[item.element ?? 'none']}`;
}

export const ARENA = { left: 74, right: 886, top: 56, bottom: 478 } as const;
export const RULES = {
  maxHp: 100, maxMp: 60, hpPotion: 35, mpPotion: 30,
  tutorialWaves: 3, tutorialSeconds: 60,
  timedWaveSeconds: 60, bossSeconds: 120, preparationSeconds: 45,
  safeSlots: 3, maxStorageSlots: 20,
  forgeProtectionSeconds: 30, forgeMeterTarget: 100, forgeMeterPerAttempt: 10,
} as const;
export const TIERS = ['残旧', '精良', '稀有', '史诗'] as const;
export const DIFFICULTIES: Record<Difficulty, { label: string; hp: number; damage: number; tierWeights: number[] }> = {
  tutorial: { label: '教学', hp: 0.65, damage: 0.55, tierWeights: [100, 0, 0, 0] },
  normal: { label: '普通', hp: 1, damage: 1, tierWeights: [70, 25, 5, 0] },
  hard: { label: '困难', hp: 1.4, damage: 1.25, tierWeights: [35, 45, 18, 2] },
  nightmare: { label: '噩梦', hp: 1.8, damage: 1.5, tierWeights: [10, 40, 40, 10] },
};

export const ITEM_LABELS: Record<ItemKind, string> = {
  weapon: '武器', armor: '护具', ore: '锻钢', hide: '韧革', hp: '生命药剂', mp: '魔力药剂', luck: '幸运粉尘', quality: '精炼晶核',
};

export function isGear(item: Item): item is Item & { kind: GearKind } {
  return item.kind === 'weapon' || item.kind === 'armor';
}

export function itemName(item: Item): string {
  if (!isGear(item)) return `${TIERS[item.tier - 1]}${ITEM_LABELS[item.kind]}`;
  const level = item.level > 0 ? ` +${item.level}` : item.level < 0 ? ` · 损耗${-item.level}` : '';
  return `${item.kind === 'weapon' && item.element && item.element !== 'none' ? ELEMENT_LABELS[item.element] + '·' : ''}${TIERS[item.tier - 1]}${item.kind === 'weapon' ? weaponProfile(item).label : '轻甲'}${level}`;
}

export function itemStat(item: Item | undefined): number {
  if (!item || !isGear(item)) return 0;
  return Math.max(1, item.kind === 'weapon' ? weaponProfile(item).attack + (item.tier - 1) * 4 + item.level * 3 : item.tier * 2 + item.level);
}

export function salePrice(item: Item): number {
  return isGear(item) ? Math.max(5, item.tier * 35 + item.level * 15) : item.tier * 8;
}

// Temporary combat verification boost; set bonusAttack to 0 for balance testing.
export const COMBAT = { bonusAttack: 120, meleeHalfAngle: Math.PI / 3,
  arrowSpeed: 900, slashSeconds: 0.28, coinSeconds: 1.2 } as const;

export const MONSTERS: Record<EnemyKind, {
  label: string; color: string; hp: number; attack: number; defense: number;
  speed: number; weight: number; gold: number; materialRolls: number;
  materialChance: number; rareChance: number;
}> = {
  grunt: { label: '绿·杂兵', color: '#86ac6c', hp: 22, attack: 8, defense: 0, speed: 58, weight: 55, gold: 3, materialRolls: 1, materialChance: 0.4, rareChance: 0.01 },
  ranger: { label: '紫·游猎', color: '#8878b0', hp: 30, attack: 10, defense: 2, speed: 43, weight: 25, gold: 6, materialRolls: 2, materialChance: 0.55, rareChance: 0.05 },
  charger: { label: '红·冲锋', color: '#c87562', hp: 48, attack: 14, defense: 5, speed: 85, weight: 15, gold: 9, materialRolls: 3, materialChance: 0.65, rareChance: 0.1 },
  elite: { label: '金·精英', color: '#d3a05c', hp: 120, attack: 20, defense: 12, speed: 53, weight: 5, gold: 20, materialRolls: 4, materialChance: 1, rareChance: 0.25 },
  boss: { label: '深红·首领', color: '#993e52', hp: 650, attack: 26, defense: 20, speed: 42, weight: 0, gold: 100, materialRolls: 6, materialChance: 1, rareChance: 1 },
};

export const SPAWN = { warningSeconds: 1.2, playerClearance: 100, spacing: 65, margin: 40 } as const;
