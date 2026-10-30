export type Difficulty = 'tutorial' | 'normal' | 'hard' | 'nightmare';
export type ItemKind = 'weapon' | 'armor' | 'ore' | 'hide' | 'hp' | 'mp' | 'luck' | 'quality';
export type GearKind = 'weapon' | 'armor';
export type WeaponKind = 'dagger' | 'longsword' | 'bow' | 'hammer';
export type WeaponElement = 'none' | 'thunder' | 'poison' | 'fire' | 'ice' | 'wind' | 'earth';
export type Phase = 'battle' | 'prepare' | 'result';
export type EnemyKind = 'grunt' | 'ranger' | 'charger' | 'elite' | 'boss';

export interface Item {
  id: string;
  kind: ItemKind;
  tier: number;
  level: number;
  attempts: number;
  /** Missing on legacy saves; interpreted as the original short sword. */
  weaponKind?: WeaponKind;
  /** Ice/wind remain legacy reserved values; the four live elements are in elements.ts. */
  element?: WeaponElement;
}

export interface CombatStatus {
  stun: number;
  immunity: number;
  burns: { dps: number; remaining: number }[];
  poisonClock: number;
  poisonDamage: number;
}
export interface PoisonGround {
  owner: string;
  friendly: boolean;
  x: number; y: number;
  radius: number; dps: number; remaining: number;
}
export interface EarthStrike {
  friendly: boolean;
  damage: number;
  age: number;
  hitIds: string[];
  spikes: { x: number; y: number; delay: number; radius: number }[];
}

export interface Enemy {
  status?: CombatStatus;
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  specialTimer: number;
}

export interface SpawnWarning {
  enemy: Enemy;
  remaining: number;
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
  status?: CombatStatus;
  poisonGrounds?: PoisonGround[];
  earthStrikes?: EarthStrike[];
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
  spawnWarnings: SpawnWarning[];
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
