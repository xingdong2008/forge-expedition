import type { CombatStatus, EnemyKind, WeaponElement, WeaponKind } from './types';

export const ENCHANTMENTS = ['thunder', 'fire', 'poison', 'earth'] as const;
export const ENCHANT_CHANCE = 0.12;
export const ELEMENT_COLORS: Record<WeaponElement, string> = {
  none: '#ffe1a0', thunder: '#c68aff', fire: '#ff654c', poison: '#80dc68', earth: '#f1c452', ice: '#87d9fa', wind: '#b9e8d8',
};
export const ELEMENT_RULES: Record<WeaponKind, { stun: number; burnRate: number; burnSeconds: number; stacks: number; poisonRadius: number; poisonSeconds: number; poisonRate: number; spikes: number; reach: number; earthRate: number }> = {
  dagger: { stun: .15, burnRate: .08, burnSeconds: 2, stacks: 3, poisonRadius: 18, poisonSeconds: 2, poisonRate: .10, spikes: 1, reach: 65, earthRate: .15 },
  longsword: { stun: .35, burnRate: .12, burnSeconds: 3, stacks: 1, poisonRadius: 40, poisonSeconds: 3, poisonRate: .12, spikes: 3, reach: 130, earthRate: .25 },
  bow: { stun: .5, burnRate: .18, burnSeconds: 3, stacks: 1, poisonRadius: 30, poisonSeconds: 4, poisonRate: .14, spikes: 2, reach: 80, earthRate: .25 },
  hammer: { stun: .7, burnRate: .15, burnSeconds: 4, stacks: 1, poisonRadius: 55, poisonSeconds: 4, poisonRate: .15, spikes: 3, reach: 100, earthRate: .40 },
};
export const MONSTER_ELEMENTS: Record<EnemyKind, WeaponElement> = { grunt: 'poison', ranger: 'thunder', charger: 'fire', elite: 'earth', boss: 'fire' };
export const freshStatus = (): CombatStatus => ({ stun: 0, immunity: 0, burns: [], poisonClock: 0, poisonDamage: 0 });
export function stun(status: CombatStatus, seconds: number): void {
  if (status.immunity > 0) return;
  status.stun = seconds; status.immunity = seconds + 1;
}
export function burn(status: CombatStatus, dps: number, seconds: number, maxStacks: number): void {
  if (maxStacks === 1 && status.burns.length) {
    const strongest = Math.max(dps, ...status.burns.map(b => b.dps));
    status.burns = [{ dps: strongest, remaining: Math.max(seconds, ...status.burns.map(b => b.remaining)) }];
  } else if (status.burns.length < maxStacks) status.burns.push({ dps, remaining: seconds });
  else {
    const weakest = status.burns.reduce((a, b) => a.dps < b.dps || (a.dps === b.dps && a.remaining < b.remaining) ? a : b);
    weakest.dps = Math.max(weakest.dps, dps); weakest.remaining = Math.max(weakest.remaining, seconds);
  }
}
