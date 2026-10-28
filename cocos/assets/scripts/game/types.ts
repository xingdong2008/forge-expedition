export type Difficulty = 'tutorial' | 'normal' | 'hard' | 'nightmare';
export type ItemKind = 'weapon' | 'armor' | 'ore' | 'hide' | 'hp' | 'mp' | 'luck' | 'quality';
export type GearKind = 'weapon' | 'armor';
export type Phase = 'battle' | 'prepare' | 'result';
export type EnemyKind = 'grunt' | 'ranger' | 'charger' | 'elite' | 'boss';

export interface Item {
  id: string;
  kind: ItemKind;
  tier: number;
  level: number;
  attempts: number;
}

export interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  specialTimer: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttl: number;
  damage: number;
  friendly: boolean;
}

export interface RunState {
  difficulty: Difficulty;
  phase: Phase;
  wave: number;
  completedWaves: number;
  secondsLeft: number;
  hp: number;
  mp: number;
  x: number;
  y: number;
  bag: Item[];
  safeIds: string[];
  weaponId: string | null;
  armorId: string | null;
  enemies: Enemy[];
  projectiles: Projectile[];
  spawnTimer: number;
  attackTimer: number;
  aoeCooldown: number;
  shieldCooldown: number;
  shieldTime: number;
  lootGold: number;
  bossRewardWave: number;
  bossEarly: boolean;
  success: boolean | null;
  choices: Item[];
}

export interface SaveData {
  version: 1;
  forgeTestSupplyClaimed?: boolean;
  nextId: number;
  gold: number;
  capacity: Record<GearKind, number>;
  items: Item[];
  weaponId: string | null;
  armorId: string | null;
  unlocked: Difficulty[];
  forgeMeter: number;
  protectionTime: number;
  run: RunState | null;
}

export interface StorageAdapter {
  load(): string | null;
  save(value: string): void;
}

export interface ForgeOdds {
  break: number;
  downgrade: number;
  same: number;
  upgrade: number;
}

export interface InputState {
  x: number;
  y: number;
}
