import { describe, expect, it } from 'vitest';
import { Game } from '../cocos/assets/scripts/game/game';
import { itemStat, salePrice } from '../cocos/assets/scripts/game/config';
import { MemoryStorage } from '../cocos/assets/scripts/game/storage';

function prepare() {
  const game = new Game(new MemoryStorage(), () => 0.99);
  game.data.unlocked.push('normal'); game.startRun('normal');
  for(let i=0;i<3;i++) { game.data.run!.secondsLeft=0.001; game.update(0.01,{x:0,y:0}); }
  return game;
}

describe('v1.3 preparation sales', () => {
  it('sells spare protected weapons into run gold, clears references and persists', () => {
    const game=prepare(); const run=game.data.run!;
    expect(run.phase).toBe('prepare');
    const weapon={...run.bag.find(item=>item.kind==='weapon')!,id:'spare'};
    run.bag.push(weapon); run.safeIds.push(weapon.id);
    const gold=run.lootGold;
    expect(game.sellRunItem(weapon.id)).toBe(true);
    expect(run.lootGold).toBe(gold+salePrice(weapon));
    expect(run.safeIds).not.toContain(weapon.id);
    expect(run.bag.some(item=>item.id===weapon.id)).toBe(false);
    expect(game.sellRunItem(weapon.id)).toBe(false);
    expect(game.data.gold).toBe(0);
  });
  it('requires swapping equipped weapons first and disallows armor and combat sales', () => {
    const game=prepare(); const run=game.data.run!;
    expect(game.sellRunItem(run.weaponId!)).toBe(false);
    expect(game.sellRunItem(run.armorId!)).toBe(false);
    const spare={...run.bag.find(item=>item.kind==='weapon')!,id:'spare'};
    run.bag.push(spare); game.equipRun(spare.id);
    expect(game.sellRunItem('i1')).toBe(true);
    run.bag.push({...spare,id:'another'}); game.continueRun();
    expect(game.sellRunItem('another')).toBe(false);
  });
  it('loses preparation sale proceeds on abandonment', () => {
    const game=prepare(); const run=game.data.run!;
    run.bag.push({...run.bag[0],kind:'weapon',id:'spare'});
    game.sellRunItem('spare'); expect(run.lootGold).toBeGreaterThan(0);
    game.abandonRun(); expect(game.data.gold).toBe(0);
  });
});

describe('unlimited weapon forging', () => {
  it('continues past +10 and +100 with increased attack and retains progress on reload', () => {
    const storage=new MemoryStorage(); const game=new Game(storage,()=>0.99);
    game.grantForgeTestSupply(); const weapon=game.data.items[0]; weapon.tier=4;
    for(const level of [10,100,1000]) {
      weapon.level=level; const before=itemStat(weapon);
      expect(game.forgeOdds(weapon).upgrade).toBeGreaterThan(0);
      expect(game.forge(weapon.id)).toBe(true);
      expect(weapon.level).toBe(level+1); expect(itemStat(weapon)).toBe(before+3);
    }
    expect(new Game(storage).data.items[0].level).toBe(1001);
  });
  it('keeps rising break risk and the ten-attempt protection cycle', () => {
    const game=new Game(new MemoryStorage(),()=>0.99); game.grantForgeTestSupply();
    const weapon=game.data.items[0]; const risk=game.forgeOdds(weapon).break;
    for(let i=0;i<9;i++) game.forge(weapon.id);
    expect(game.forgeOdds(weapon).break).toBeGreaterThan(risk);
    game.forge(weapon.id);
    expect(game.data.protectionTime).toBe(30); expect(game.forgeOdds(weapon).break).toBe(0);
    expect(Object.values(game.forgeOdds(weapon,true)).reduce((a,b)=>a+b,0)).toBe(100);
    for(let i=0;i<601;i++) game.tickForge(0.05);
    expect(game.data.protectionTime).toBe(0); expect(game.forgeOdds(weapon).break).toBe(30);
  });
});
