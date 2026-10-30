import { describe, expect, it } from 'vitest';
import { Game } from '../cocos/assets/scripts/game/game';
import { MemoryStorage } from '../cocos/assets/scripts/game/storage';
import { COMBAT, WEAPONS, WEAPON_KINDS, itemStat, itemName } from '../cocos/assets/scripts/game/config';
import type { Enemy, Item, WeaponKind } from '../cocos/assets/scripts/game/types';

const idle = { x: 0, y: 0 };
const enemy = (id: string, x: number, y = 270, hp = 10000): Enemy => ({ id, kind: 'grunt', x, y, hp, maxHp: hp, attackTimer: 99, specialTimer: 99 });
function battle(kind: WeaponKind) {
  const game = new Game(new MemoryStorage(), () => 0.5);
  game.data.items[0].weaponKind = kind;
  game.startRun('tutorial');
  game.data.run!.spawnTimer = 99;
  return game;
}
const advance = (game: Game, ticks: number, dt = 0.01) => { for (let i = 0; i < ticks; i++) game.update(dt, idle); };

describe('weapon families', () => {
  it.each(WEAPON_KINDS)('%s uses its approved damage and attack interval', kind => {
    const game = battle(kind), run = game.data.run!, profile = WEAPONS[kind];
    const target = enemy('target', run.x + 10); run.enemies = [target];
    expect(itemStat(run.bag[0])).toBe(profile.attack);
    game.update(0.01, idle);
    expect(target.hp).toBe(10000 - COMBAT.bonusAttack - profile.attack);
    expect(run.attackTimer).toBe(profile.interval);
    advance(game, Math.round(profile.interval * 100) - 1);
    expect(target.hp).toBe(10000 - COMBAT.bonusAttack - profile.attack);
    advance(game, 2);
    expect(target.hp).toBe(10000 - 2 * (COMBAT.bonusAttack + profile.attack));
  });

  it.each(['dagger', 'longsword', 'hammer'] as const)('%s uses its own sector range', kind => {
    const game = battle(kind), run = game.data.run!, range = WEAPONS[kind].range;
    const inside = enemy('inside', run.x + range - 1);
    const outside = enemy('outside', run.x + range + 1);
    const behind = enemy('behind', run.x - range);
    const nearby = enemy('nearby', run.x + range - 4, run.y + 5);
    run.enemies = [inside, outside, behind, nearby];
    game.update(0.01, idle);
    expect(inside.hp).toBeLessThan(10000); expect(nearby.hp).toBeLessThan(10000);
    expect(outside.hp).toBe(10000); expect(behind.hp).toBe(10000);
    expect(game.arrows).toHaveLength(0); expect(game.slashes[0].range).toBe(range);
  });

  it('fires at a distant nearest target only, with travel time and no piercing', () => {
    const game = battle('bow'), run = game.data.run!;
    const near = enemy('near', 780), far = enemy('far', 860);
    run.enemies = [far, near]; game.update(0.01, idle);
    expect(game.arrows[0].targetId).toBe('near'); expect(near.hp).toBe(10000);
    expect(game.slashes).toHaveLength(0);
    advance(game, 50);
    expect(near.hp).toBe(10000 - 134); expect(far.hp).toBe(10000);
    expect(game.arrows).toHaveLength(0);
  });

  it('removes an arrow whose target died without switching targets', () => {
    const game = battle('bow'), run = game.data.run!;
    run.enemies = [enemy('first', 780), enemy('second', 860)]; game.update(0.01, idle);
    run.enemies.shift(); advance(game, 20);
    expect(game.arrows).toHaveLength(0); expect(run.enemies[0].hp).toBe(10000);
  });

  it('bow kills award gold once, and wave transitions clear flight', () => {
    const game = battle('bow'), run = game.data.run!;
    run.enemies = [enemy('victim', 780, 270, 1)]; advance(game, 50);
    expect(run.enemies).toHaveLength(0); expect(run.lootGold).toBe(3);
    run.enemies = [enemy('next', 860)]; run.attackTimer = 0; game.update(0.01, idle);
    expect(game.arrows).toHaveLength(1); run.secondsLeft = 0.001; game.update(0.01, idle);
    expect(game.arrows).toHaveLength(0); expect(run.wave).toBe(2);
  });

  it.each(WEAPON_KINDS)('crafts %s and keeps its kind and element through forging and saves', kind => {
    const storage = new MemoryStorage(), game = new Game(storage, () => 0.99);
    game.grantForgeTestSupply();
    expect(game.craft('weapon', 1, kind)).toBe(true);
    const item = game.data.items.at(-1)!;
    expect(item.weaponKind).toBe(kind); expect(item.element).toBe('none');
    expect(itemName(item)).toContain(WEAPONS[kind].label);
    item.element = 'ice'; expect(game.forge(item.id)).toBe(true);
    expect(itemStat(item)).toBe(WEAPONS[kind].attack + 3);
    game.equipCamp(item.id); game.startRun('tutorial');
    const restored = new Game(storage);
    expect(restored.data.run!.bag.find(x => x.id === item.id)).toMatchObject({ weaponKind: kind, element: 'ice', level: 1 });
  });

  it('honors capacity and camp-only crafting without consuming materials on rejection', () => {
    const game = new Game(new MemoryStorage()); game.grantForgeTestSupply();
    for (const kind of WEAPON_KINDS) expect(game.craft('weapon', 1, kind)).toBe(true);
    const ores = game.data.items.filter(x => x.kind === 'ore').length;
    expect(game.craft('weapon', 1, 'bow')).toBe(false);
    expect(game.data.items.filter(x => x.kind === 'ore')).toHaveLength(ores);
    game.startRun('tutorial'); expect(game.craft('weapon', 1, 'hammer')).toBe(false);
  });

  it('migrates legacy camp, bag and result weapons without losing growth', () => {
    const storage = new MemoryStorage(), game = new Game(storage);
    game.startRun('tutorial');
    const legacy: Item = { id: 'legacy', kind: 'weapon', tier: 3, level: 4, attempts: 9 };
    game.data.items.push({ ...legacy, id: 'camp' });
    game.data.run!.bag.push(legacy); game.data.run!.choices.push({ ...legacy, id: 'choice' });
    game.persist(); const restored = new Game(storage);
    for (const item of [restored.data.items.find(x => x.id === 'camp')!, restored.data.run!.bag.find(x => x.id === 'legacy')!, restored.data.run!.choices[0]]) {
      expect(item).toMatchObject({ weaponKind: 'dagger', element: 'none', tier: 3, level: 4, attempts: 9 });
    }
  });

  it.each(WEAPON_KINDS)('can generate %s as the death weapon choice', kind => {
    const roll = (WEAPON_KINDS.indexOf(kind) + 0.5) / 4;
    const game = new Game(new MemoryStorage(), () => roll); game.startRun('tutorial');
    const run = game.data.run!; run.wave = 10; run.secondsLeft = 0.001; run.spawnTimer = 99;
    game.update(0.01, idle); expect(run.choices[0].weaponKind).toBe(kind);
  });

  it('abandonment loses the bow, arrows and safe contents and grants a fresh short sword', () => {
    const game = battle('bow'), run = game.data.run!;
    run.bag[0].level = 9; run.enemies = [enemy('far', 850)]; game.update(0.01, idle);
    expect(game.arrows).toHaveLength(1); expect(game.abandonRun()).toBe(true);
    const starter = game.data.items.find(x => x.id === game.data.weaponId)!;
    expect(starter).toMatchObject({ weaponKind: 'dagger', tier: 1, level: 0, attempts: 0 });
    expect(game.arrows).toHaveLength(0); expect(game.data.unlocked).toEqual(['tutorial']);
  });
});
