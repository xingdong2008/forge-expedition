import { describe, expect, it } from 'vitest';
import { Game } from '../cocos/assets/scripts/game/game';
import { MemoryStorage } from '../cocos/assets/scripts/game/storage';
import { itemStat, MONSTERS } from '../cocos/assets/scripts/game/config';
import { burn, ELEMENT_RULES, freshStatus, stun } from '../cocos/assets/scripts/game/elements';
import type { Enemy, WeaponElement, WeaponKind } from '../cocos/assets/scripts/game/types';

const idle={x:0,y:0};
function setup(element: WeaponElement='none', kind: WeaponKind='dagger', tutorial=true) {
  const storage=new MemoryStorage(); const game=new Game(storage,()=>.5);
  const weapon=game.data.items[0];weapon.element=element;weapon.weaponKind=kind;
  game.data.unlocked.push('normal');game.startRun(tutorial?'tutorial':'normal');
  const run=game.data.run!;run.spawnTimer=999;
  return {game,run,weapon,storage};
}
const enemy=(id='target',kind:Enemy['kind']='grunt',x=505,y=270,hp=10000):Enemy=>({id,kind,x,y,hp,maxHp:hp,attackTimer:999,specialTimer:999});
function advance(game:Game,seconds:number) { for(let elapsed=0;elapsed<seconds-1e-8;elapsed+=.01)game.update(Math.min(.01,seconds-elapsed),idle); }
function hit(element:WeaponElement,kind:WeaponKind) {
  const ctx=setup(element,kind);const target=enemy();ctx.run.enemies=[target];ctx.game.update(.01,idle);ctx.run.attackTimer=999;if(kind==='bow')ctx.game.update(.01,idle);return {...ctx,target};
}

describe('craft enchantment selection',()=>{
  it.each([[0,'thunder'],[.02999,'thunder'],[.03,'fire'],[.05999,'fire'],[.06,'poison'],[.08999,'poison'],[.09,'earth'],[.11999,'earth'],[.12,'none'],[.99,'none']] as const)('roll %s creates %s only on new weapons',(roll,element)=>{
    const storage=new MemoryStorage();const game=new Game(storage,()=>roll);game.grantForgeTestSupply();
    expect(game.craft('weapon',1,'bow')).toBe(true);
    const item=game.data.items.at(-1)!;expect(item.element).toBe(element);game.data.protectionTime=30;
    game.forge(item.id,true);expect(item.element).toBe(element);
    expect(new Game(storage).data.items.find(i=>i.id===item.id)?.element).toBe(element);
    game.craft('armor',1);expect(game.data.items.at(-1)?.element).toBeUndefined();
  });
});

describe('weapon effects and control immunity',()=>{
  it.each(['dagger','longsword','bow','hammer'] as const)('%s applies configured stun and burn without the +120 test bonus',kind=>{
    const lightning=hit('thunder',kind);expect(lightning.target.status?.stun).toBeCloseTo(ELEMENT_RULES[kind].stun);
    const fire=hit('fire',kind);const base=fire.target.hp;advance(fire.game,.5);
    expect(base-fire.target.hp).toBeCloseTo(itemStat(fire.weapon)*ELEMENT_RULES[kind].burnRate*.5,6);
    expect(fire.target.status?.burns).toHaveLength(1);
  });
  it('stops movement and attacks, then grants a full second of immunity; Boss duration halves',()=>{
    const ctx=hit('thunder','longsword');const x=ctx.target.x;ctx.target.attackTimer=0;const hp=ctx.run.hp;
    advance(ctx.game,.2);expect(ctx.target.x).toBe(x);expect(ctx.run.hp).toBe(hp);
    ctx.run.attackTimer=0;ctx.game.update(.01,idle);expect(ctx.target.status!.stun).toBeLessThan(.2);
    advance(ctx.game,.15);expect(ctx.target.status!.stun).toBe(0);expect(ctx.target.status!.immunity).toBeGreaterThan(.9);
    const boss=setup('thunder','hammer');const target=enemy('boss','boss',505);boss.run.enemies=[target];boss.game.update(.01,idle);
    expect(target.status!.stun).toBeCloseTo(.35);
  });
  it('caps dagger burn at 3 layers and refreshes a stronger single burn',()=>{
    const {game,run,target,weapon}=hit('fire','dagger');
    for(let i=0;i<4;i++){run.attackTimer=0;game.update(.01,idle);}run.attackTimer=999;
    expect(target.status!.burns).toHaveLength(3);const before=target.hp;advance(game,.5);
    expect(before-target.hp).toBeCloseTo(itemStat(weapon)*.08*3*.5,6);
    const s=freshStatus();burn(s,20,3,1);burn(s,4,2,1);expect(s.burns).toEqual([{dps:20,remaining:3}]);
  });
  it('bow effects wait for impact, do not transfer to a different target, and snapshot damage',()=>{
    const {game,run,weapon}=setup('fire','bow');const target=enemy('far','grunt',800);run.enemies=[target];game.update(.01,idle);
    expect(target.status!.burns).toHaveLength(0);expect(game.arrows).toHaveLength(1);
    const attack=itemStat(weapon);weapon.level=100;run.attackTimer=999;advance(game,.4);
    expect(target.status!.burns[0].dps).toBeCloseTo(attack*.18);
    const lost=setup('poison','bow');lost.run.enemies=[enemy('old','grunt',800)];lost.game.update(.01,idle);lost.run.attackTimer=999;
    lost.run.enemies=[enemy('new','grunt',700)];advance(lost.game,1);
    expect(lost.run.poisonGrounds).toHaveLength(0);expect(lost.run.enemies[0].hp).toBe(10000);
  });
  it('none and reserved legacy ice/wind add no combat effects',()=>{
    for(const element of ['none','ice','wind'] as const){const c=hit(element,'dagger');const hp=c.target.hp;advance(c.game,1);expect(c.target.hp).toBe(hp);expect(c.run.poisonGrounds).toHaveLength(0);expect(c.run.earthStrikes).toHaveLength(0);}
  });
});

describe('poison ground and earth strikes',()=>{
  it.each(['dagger','longsword','bow','hammer'] as const)('%s poison uses its radius, duration and damage',kind=>{
    const {game,run,target,weapon}=hit('poison',kind);const rule=ELEMENT_RULES[kind];
    expect(run.poisonGrounds![0]).toMatchObject({radius:rule.poisonRadius,remaining:rule.poisonSeconds});
    const hp=target.hp;advance(game,.49);expect(target.hp).toBe(hp);advance(game,.01);
    expect(hp-target.hp).toBeCloseTo(itemStat(weapon)*rule.poisonRate*.5,6);
    expect(run.hp).toBe(100);
  });
  it('takes highest overlapping poison, caps owned pools, stops exposure on exit',()=>{
    const {game,run,target,weapon}=hit('poison','dagger');
    for(let i=0;i<4;i++){run.attackTimer=0;game.update(.01,idle);}run.attackTimer=999;
    expect(run.poisonGrounds).toHaveLength(3);
    target.status!.poisonClock=0;target.status!.poisonDamage=0;
    const hp=target.hp;advance(game,.5);expect(hp-target.hp).toBeCloseTo(itemStat(weapon)*.1*.5,6);
    target.x=850;const after=target.hp;advance(game,.5);expect(target.hp).toBe(after);
  });
  it('poison kills award loot only once and stops at expiry',()=>{
    const {game,run,target}=hit('poison','bow');target.hp=.1;advance(game,.5);
    expect(run.enemies).toHaveLength(0);expect(run.lootGold).toBe(MONSTERS.grunt.gold);
    advance(game,4);expect(run.poisonGrounds).toHaveLength(0);expect(run.lootGold).toBe(MONSTERS.grunt.gold);
  });
  it.each(['dagger','longsword','bow','hammer'] as const)('%s earth damages each target at most once per attack',kind=>{
    const {game,run,weapon}=setup('earth',kind);const rule=ELEMENT_RULES[kind];
    const a=enemy('a','grunt',500),b=enemy('b','grunt',520);run.enemies=[a,b];game.update(.01,idle);run.attackTimer=999;
    expect(run.earthStrikes![0].spikes).toHaveLength(rule.spikes);
    const strike=run.earthStrikes![0];a.x=strike.spikes[0].x;a.y=strike.spikes[0].y;const before=a.hp;
    advance(game,.04);expect(before-a.hp).toBeCloseTo(itemStat(weapon)*rule.earthRate,6);
    const once=a.hp;for(const spike of strike.spikes){a.x=spike.x;a.y=spike.y;advance(game,.08);}
    expect(a.hp).toBeCloseTo(once,6);
    expect(strike.hitIds.filter(id=>id==='a')).toHaveLength(1);
  });
});

describe('monster effects and lifecycle',()=>{
  it.each(['grunt','ranger','charger','elite','boss'] as const)('%s applies its effect in normal but not tutorial',kind=>{
    for(const tutorial of [true,false]){
      const {game,run}=setup('none','dagger',tutorial);const e=enemy('monster',kind,500);e.attackTimer=0;run.enemies=[e];run.attackTimer=999;
      game.update(.01,idle);const enabled=!tutorial;
      expect(run.poisonGrounds!.length>0).toBe(enabled&&kind==='grunt');
      expect(run.earthStrikes!.length>0).toBe(enabled&&kind==='elite');
      expect(run.status!.stun>0).toBe(enabled&&kind==='ranger');
      expect(run.status!.burns.length>0).toBe(enabled&&(kind==='charger'||kind==='boss'));
      if(kind==='charger'&&enabled){expect(run.status!.burns[0].dps).toBeCloseTo(1.4);expect(run.status!.burns[0].remaining).toBe(3);}
    }
  });
  it('player paralysis stops movement and auto attack; shield halves DoT without rounding inflation',()=>{
    const {game,run}=setup();run.enemies=[enemy()];stun(run.status!,.25);const x=run.x;
    game.update(.05,{x:1,y:0});expect(run.x).toBe(x);expect(run.enemies[0].hp).toBe(10000);
    run.attackTimer=999;run.shieldTime=3;burn(run.status!,2,1,1);const hp=run.hp;advance(game,1);expect(hp-run.hp).toBeCloseTo(1,6);
  });
  it('restores effect timers, ground ownership and already-hit earth targets; update(0) freezes',()=>{
    const {game,run,storage}=hit('earth','hammer');
    burn(run.status!,2,3,1);stun(run.status!,.25);run.poisonGrounds!.push({owner:'enemy',friendly:false,x:run.x,y:run.y,radius:28,dps:1,remaining:2});
    advance(game,.1);game.persist();const saved=JSON.stringify(run);game.update(0,idle);expect(JSON.stringify(run)).toBe(saved);
    const resumed=new Game(storage,()=>.5);expect(resumed.data.run).toEqual(run);
    advance(game,.2);advance(resumed,.2);expect(resumed.data.run).toEqual(run);
  });
  it('migrates old saves and clears effects at preparation, next wave and settlement',()=>{
    const c=setup('fire','dagger',false);delete c.run.status;delete c.run.poisonGrounds;delete c.run.earthStrikes;c.game.persist();
    const game=new Game(c.storage,()=>.5);const run=game.data.run!;expect(run.status).toEqual(freshStatus());
    burn(run.status!,1,3,1);run.wave=3;run.secondsLeft=.001;game.update(.01,idle);
    expect(run.phase).toBe('prepare');expect(run.status!.burns).toHaveLength(0);expect(run.earthStrikes).toHaveLength(0);
    game.continueRun();expect(run.status).toEqual(freshStatus());
    burn(run.status!,100,3,1);run.hp=.01;game.update(.01,idle);expect(run.phase).toBe('result');expect(run.status).toEqual(freshStatus());
  });
  it('elemental boss kill ends once and clears outstanding hazards',()=>{
    const {game,run}=setup('none','dagger',false);run.wave=10;run.attackTimer=999;const boss=enemy('boss','boss');boss.hp=.01;boss.status=freshStatus();burn(boss.status,10,3,1);run.enemies=[boss];
    run.poisonGrounds!.push({owner:'hero',friendly:true,x:505,y:270,radius:50,dps:50,remaining:4});
    game.update(.01,idle);expect(run.phase).toBe('result');expect(run.success).toBe(true);expect(run.lootGold).toBe(100);expect(run.poisonGrounds).toHaveLength(0);
    const gold=run.lootGold;advance(game,1);expect(run.lootGold).toBe(gold);
  });
});
