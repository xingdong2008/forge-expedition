import { describe, expect, it } from 'vitest';
import { Game } from '../cocos/assets/scripts/game/game';
import { MemoryStorage } from '../cocos/assets/scripts/game/storage';
import type { Enemy, Item } from '../cocos/assets/scripts/game/types';

const stationary = { x: 0, y: 0 };
const newGame = (roll = 0.5) => new Game(new MemoryStorage(), () => roll);

function passWave(game: Game): void {
  const run = game.data.run!;
  run.secondsLeft = 0.01;
  run.spawnTimer = 99;
  game.update(0.05, stationary);
}

function reachPreparation(game: Game, target = 3): void {
  while (game.data.run?.wave !== target || game.data.run.phase !== 'prepare') {
    passWave(game);
  }
}

function defeatBoss(game: Game): void {
  const run = game.data.run!;
  expect(run.wave).toBe(10);
  for (let i = 0; i < 25; i++) game.update(0.05, stationary);
  const boss = run.enemies.find(enemy => enemy.kind === 'boss')!;
  boss.x = run.x;
  boss.y = run.y;
  boss.hp = 1;
  expect(game.cast('aoe')).toBe(true);
  expect(run.phase).toBe('result');
  expect(run.success).toBe(true);
}

function failRun(game: Game): void {
  const run = game.data.run!;
  const enemy: Enemy = { id: 'fatal', kind: 'boss', x: run.x, y: run.y, hp: 100, maxHp: 100, attackTimer: 0, specialTimer: 99 };
  run.enemies.push(enemy);
  run.hp = 1;
  run.attackTimer = 99;
  game.update(0.05, stationary);
  expect(run.phase).toBe('result');
}

describe('game progression', () => {
  it('requires the three-wave tutorial before normal mode', () => {
    const game = newGame();
    expect(game.startRun('normal')).toBe(false);
    expect(game.startRun('tutorial')).toBe(true);
    expect(game.data.run?.secondsLeft).toBe(60);
    passWave(game); passWave(game); passWave(game);
    expect(game.data.run?.phase).toBe('result');
    expect(game.data.run?.success).toBe(true);
    expect(game.finishResult()).toBe(true);
    expect(game.data.unlocked).toContain('normal');
  });

  it('offers preparation on waves 3, 6 and 9, without forging in the run', () => {
    const game = newGame();
    game.data.unlocked.push('normal');
    game.startRun('normal');
    for (const target of [3, 6, 9]) {
      reachPreparation(game, target);
      expect(game.data.run?.secondsLeft).toBe(45);
      expect(game.craft('weapon', 1)).toBe(false);
      expect(game.continueRun()).toBe(true);
    }
    expect(game.data.run?.wave).toBe(10);
    expect(game.data.run?.spawnWarnings.some(w => w.enemy.kind === 'boss')).toBe(true);
  });

  it('fails when the 120-second Boss phase expires', () => {
    const game = newGame();
    game.data.unlocked.push('normal');
    game.startRun('normal');
    for (const wave of [3, 6, 9]) { reachPreparation(game, wave); game.continueRun(); }
    expect(game.data.run?.secondsLeft).toBe(120);
    game.data.run!.secondsLeft = 0.01;
    game.update(0.05, stationary);
    expect(game.data.run?.success).toBe(false);
    expect(game.data.run?.choices).toHaveLength(2);
  });

  it('unlocks hard from early normal Boss but requires full hard clear for nightmare', () => {
    const normal = newGame();
    normal.data.unlocked.push('normal');
    normal.startRun('normal');
    reachPreparation(normal);
    expect(normal.challengeBoss()).toBe(true);
    defeatBoss(normal);
    normal.finishResult();
    expect(normal.data.unlocked).toContain('hard');

    const earlyHard = newGame();
    earlyHard.data.unlocked.push('hard');
    earlyHard.startRun('hard');
    reachPreparation(earlyHard);
    earlyHard.challengeBoss();
    defeatBoss(earlyHard);
    earlyHard.finishResult();
    expect(earlyHard.data.unlocked).not.toContain('nightmare');

    const fullHard = newGame();
    fullHard.data.unlocked.push('hard');
    fullHard.startRun('hard');
    for (const wave of [3, 6, 9]) { reachPreparation(fullHard, wave); fullHard.continueRun(); }
    defeatBoss(fullHard);
    fullHard.finishResult();
    expect(fullHard.data.unlocked).toContain('nightmare');
  });
});

describe('retention and warehouse', () => {
  it('keeps only three protected items and one chosen equipment on failure', () => {
    const game = newGame();
    game.startRun('tutorial');
    const run = game.data.run!;
    const lost: Item = { id: 'lost', kind: 'ore', tier: 1, level: 0, attempts: 0 };
    run.bag.push(lost);
    failRun(game);
    expect(game.retainedItems(0)).toHaveLength(3);
    expect(game.retainedItems(0).some(item => item.id === lost.id)).toBe(false);
    expect(game.finishResult(null)).toBe(false);
    expect(game.finishResult(0)).toBe(true);
    expect(game.data.items.some(item => item.id === lost.id)).toBe(false);
    expect(game.data.items.filter(item => item.kind === 'weapon')).toHaveLength(2);
  });

  it('permanently loses an unprotected equipped weapon after failure', () => {
    const game = newGame();
    game.startRun('tutorial');
    game.data.run!.safeIds = [];
    failRun(game);
    expect(game.finishResult(1)).toBe(true);
    expect(game.data.items.some(item => item.id === 'i1')).toBe(false);
    expect(game.data.items.some(item => item.kind === 'armor')).toBe(true);
  });

  it('caps weapon and armor storage independently at twenty slots', () => {
    const game = newGame();
    game.data.gold = 100_000;
    for (let i = 0; i < 15; i++) expect(game.buySlot('weapon')).toBe(true);
    expect(game.data.capacity.weapon).toBe(20);
    expect(game.data.capacity.armor).toBe(5);
    expect(game.buySlot('weapon')).toBe(false);
    expect(game.slotPrice('weapon')).toBe(0);
  });

  it('restores active runs from the storage adapter', () => {
    const storage = new MemoryStorage();
    const game = new Game(storage);
    game.startRun('tutorial');
    game.data.run!.hp = 48;
    game.persist();
    const resumed = new Game(storage);
    expect(resumed.data.run?.phase).toBe('battle');
    expect(resumed.data.run?.hp).toBe(48);
  });
});

describe('forging', () => {
  it('displays four odds that sum to one hundred and increase risk per attempt', () => {
    const game = newGame();
    const weapon = game.data.items.find(item => item.kind === 'weapon')!;
    expect(game.forgeOdds(weapon)).toEqual({ break: 5, downgrade: 10, same: 35, upgrade: 50 });
    weapon.attempts = 9;
    const odds = game.forgeOdds(weapon, true);
    expect(odds.break).toBe(30);
    expect(Object.values(odds).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('consumes material, destroys unprotected gear, and never destroys protected gear', () => {
    const broken = newGame(0);
    broken.data.items.push({ id: 'ore1', kind: 'ore', tier: 1, level: 0, attempts: 0 });
    expect(broken.forge('i1')).toBe(true);
    expect(broken.data.items.some(item => item.id === 'i1')).toBe(false);
    expect(broken.data.items.some(item => item.id === 'ore1')).toBe(false);

    const protectedGame = newGame(0);
    protectedGame.data.items.push({ id: 'ore2', kind: 'ore', tier: 1, level: 0, attempts: 0 });
    protectedGame.data.protectionTime = 0.05;
    protectedGame.data.forgeMeter = 100;
    expect(protectedGame.forgeOdds(protectedGame.data.items[0]).break).toBe(0);
    expect(protectedGame.forge('i1')).toBe(true);
    expect(protectedGame.data.items.some(item => item.id === 'i1')).toBe(true);
    protectedGame.tickForge(0.05);
    expect(protectedGame.data.protectionTime).toBe(0);
    expect(protectedGame.data.forgeMeter).toBe(0);
  });
});

describe('melee and monster rewards', () => {
  const target = (id: string, x: number, y: number, kind: Enemy['kind'] = 'grunt', hp = 500): Enemy =>
    ({ id, kind, x, y, hp, maxHp: hp, attackTimer: 99, specialTimer: 99 });

  it('hits only the forward melee sector, applies defense, and never fires a bullet', () => {
    const game = newGame(); game.startRun('tutorial');
    const run = game.data.run!; run.spawnTimer = 99;
    run.enemies = [target('front', 510, 270), target('armored', 525, 275, 'elite'),
      target('behind', 440, 270), target('far', 600, 270)];
    game.update(0.01, stationary);
    expect(run.enemies.map(e => e.hp)).toEqual([372, 384, 500, 500]);
    expect(run.projectiles).toHaveLength(0);
    expect(game.slashes).toHaveLength(1);
    const hp = run.enemies[0].hp;
    game.update(0.01, stationary);
    expect(run.enemies[0].hp).toBe(hp);
  });

  it('awards distinct gold and richer materials for elite kills, with floating text', () => {
    const rewards = (kind: Enemy['kind']) => {
      const game = newGame(0.5); game.startRun('tutorial');
      const run = game.data.run!; run.spawnTimer = 99;
      run.enemies = [target('victim', 520, 270, kind, 1)];
      const before = run.bag.length;
      game.update(0.01, stationary);
      expect(run.enemies).toHaveLength(0);
      expect(game.coinTexts[0].amount).toBe(run.lootGold);
      return { gold: run.lootGold, items: run.bag.length - before };
    };
    expect(rewards('grunt')).toEqual({ gold: 3, items: 0 });
    expect(rewards('ranger')).toEqual({ gold: 6, items: 2 });
    expect(rewards('charger')).toEqual({ gold: 9, items: 3 });
    expect(rewards('elite')).toEqual({ gold: 20, items: 4 });
  });

  it('selects monsters using configured weights even on the first wave', () => {
    for (const [roll, kind] of [[0.1, 'grunt'], [0.6, 'ranger'], [0.85, 'charger'], [0.98, 'elite']] as const) {
      const game = newGame(roll); game.startRun('tutorial');
      game.data.run!.spawnTimer = 0;
      game.update(0.01, stationary);
      expect(game.data.run!.enemies).toHaveLength(0);
      expect(game.data.run!.spawnWarnings[0].enemy.kind).toBe(kind);
    }
  });

  it('removes legacy friendly shots on resume and does not persist visual effects', () => {
    const storage = new MemoryStorage(); const game = new Game(storage);
    game.startRun('tutorial');
    game.data.run!.projectiles.push({ x: 0, y: 0, vx: 1, vy: 0, ttl: 1, damage: 1, friendly: false });
    game.persist(); const resumed = new Game(storage);
    expect(resumed.data.run!.projectiles).toHaveLength(0);
    expect(resumed.slashes).toHaveLength(0);
    expect(resumed.coinTexts).toHaveLength(0);
  });
});

 it('keeps all monsters in melee without creating ranged shots', () => {
   const game = newGame(); game.startRun('tutorial');
   const run = game.data.run!; run.attackTimer = 99; run.spawnTimer = 99;
   run.enemies = ['ranger', 'boss'].map((kind, i) => ({ id: `r${i}`, kind: kind as Enemy['kind'], x: run.x + 130, y: run.y, hp: 100, maxHp: 100, attackTimer: 0, specialTimer: 0 }));
   game.update(0.05, stationary);
   expect(run.projectiles).toHaveLength(0);
   expect(run.enemies.every(enemy => enemy.x < run.x + 130)).toBe(true);
 });
