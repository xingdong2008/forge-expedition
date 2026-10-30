import { describe, expect, it } from 'vitest';
import { Game } from '../cocos/assets/scripts/game/game';
import { MemoryStorage } from '../cocos/assets/scripts/game/storage';
import { ARENA, SPAWN } from '../cocos/assets/scripts/game/config';
const idle = { x: 0, y: 0 };
function setup() { const storage = new MemoryStorage(); const game = new Game(storage, () => 0.5); game.startRun('tutorial'); game.data.run!.spawnTimer = 0; return { game, storage, run: game.data.run! }; }
describe('telegraphed random batches', () => {
  it('shows multiple warnings, with no enemies or damage until the full countdown ends', () => {
    const { game, run } = setup(); game.update(0.01, idle);
    expect(run.spawnWarnings).toHaveLength(3); expect(run.enemies).toHaveLength(0);
    const positions = run.spawnWarnings.map(w => ({ x: w.enemy.x, y: w.enemy.y }));
    positions.forEach((p, i) => {
      expect(p.x).toBeGreaterThanOrEqual(ARENA.left + SPAWN.margin);
      expect(p.x).toBeLessThanOrEqual(ARENA.right - SPAWN.margin);
      expect(p.y).toBeGreaterThanOrEqual(ARENA.top + SPAWN.margin);
      expect(p.y).toBeLessThanOrEqual(ARENA.bottom - SPAWN.margin);
      expect(Math.hypot(p.x-run.x,p.y-run.y)).toBeGreaterThanOrEqual(SPAWN.playerClearance);
      positions.slice(i+1).forEach(q=>expect(Math.hypot(p.x-q.x,p.y-q.y)).toBeGreaterThanOrEqual(SPAWN.spacing));
    });
    for(let i=0;i<23;i++) game.update(0.05,idle);
    expect(run.enemies).toHaveLength(0); expect(run.hp).toBe(100);
    game.update(0.05,idle);
    expect(run.spawnWarnings).toHaveLength(0); expect(run.enemies.map(e=>({x:e.x,y:e.y}))).toEqual(positions);
  });
  it('persists pending warnings and respects enemy capacity including reserved spawns', () => {
    const {game,storage,run}=setup(); game.update(0.01,idle); game.update(0.05,idle);game.persist();
    const resumed=new Game(storage,()=>0.5);
    expect(resumed.data.run!.spawnWarnings).toEqual(run.spawnWarnings);
    run.spawnTimer=0;game.update(0.01,idle);
    expect(run.spawnWarnings).toHaveLength(5);
    run.spawnTimer=0;game.update(0.01,idle);expect(run.spawnWarnings).toHaveLength(5);
  });
  it('clears pending spawns at wave transition and restores legacy saves', () => {
    const {game,storage,run}=setup();game.update(0.01,idle);run.secondsLeft=0.001;game.update(0.01,idle);
    expect(run.spawnWarnings).toHaveLength(0);expect(run.enemies).toHaveLength(0);
    const old=JSON.parse(storage.value!);delete old.run.spawnWarnings;storage.save(JSON.stringify(old));
    expect(new Game(storage).data.run!.spawnWarnings).toEqual([]);
  });
});
