import { ELEMENT_COLORS, ELEMENT_RULES, ENCHANTMENTS, ENCHANT_CHANCE, freshStatus, stun, burn } from './elements';
import { ARENA, SPAWN, COMBAT, MONSTERS, DIFFICULTIES, RULES, WEAPON_KINDS, WEAPONS, weaponKind, weaponProfile, isGear, itemStat, salePrice } from './config';
import type { Difficulty, Enemy, EnemyKind, ForgeOdds, GearKind, InputState, Item, ItemKind, RunState, SaveData, StorageAdapter, WeaponKind, WeaponElement } from './types';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Game {
  data: SaveData;
  messages: string[] = [];
  forgeColor = ELEMENT_COLORS.none;
  forgeAnimation = 0;
  forgeVisualKind: WeaponKind | 'armor' = 'dagger';
  heroTime = 0;
  heroMoving = false;
  // Visual events are transient: they never change settlement or save contents.
  slashes: { x: number; y: number; angle: number; ttl: number; range: number; weaponKind: WeaponKind; element?: WeaponElement }[] = [];
  // Locked single-target arrows; flight is transient and cleared on transitions.
  arrows: { x: number; y: number; angle: number; targetId: string; damage: number; element: WeaponElement; elementalAttack: number }[] = [];
  coinTexts: { x: number; y: number; amount: number; ttl: number }[] = [];
  private random: () => number;

  constructor(private storage: StorageAdapter, random: () => number = Math.random) {
    this.random = random;
    let loaded: SaveData | null = null;
    try {
      const raw = storage.load();
      loaded = raw ? JSON.parse(raw) as SaveData : null;
    } catch { /* A damaged save starts a fresh game. */ }
    this.data = loaded?.version === 1 ? loaded : this.newSave();
    // Discard legacy projectiles. New bow shots use transient locked arrows.
    if (this.data.run) { this.data.run.projectiles = []; this.data.run.spawnWarnings ??= []; this.initElements(this.data.run); }
    for (const item of [...this.data.items, ...(this.data.run?.bag ?? []), ...(this.data.run?.choices ?? [])]) {
      if (item.kind === 'weapon') {
        if (!WEAPON_KINDS.includes(item.weaponKind!)) item.weaponKind = 'dagger';
        item.element ??= 'none';
      }
    }
    this.ensureStarterGear();
    this.persist();
  }

  /** One-time development supply; remove UI entry calls before release. */
  grantForgeTestSupply(): void {
    if (this.data.forgeTestSupplyClaimed) return;
    for (const tier of [1, 2, 3, 4]) {
      for (let i = 0; i < 50; i++) {
        this.data.items.push(this.item('ore', tier), this.item('hide', tier));
      }
    }
    for (let i = 0; i < 50; i++) this.data.items.push(this.item('luck'), this.item('quality'));
    this.data.forgeTestSupplyClaimed = true;
    this.note('测试补给已入仓：各品质锻钢、韧革各 50，幸运粉尘、精炼晶核各 50。');
    this.persist();
  }

  private ensureStarterGear(): void {
    if (this.data.run) return;
    for (const kind of ['weapon', 'armor'] as const) {
      let gear = this.data.items.find(item => item.kind === kind);
      if (!gear) {
        gear = this.item(kind);
        this.data.items.push(gear);
        this.note(`已赠送基础${kind === 'weapon' ? '武器' : '护具'}。`);
      }
      const key = kind === 'weapon' ? 'weaponId' : 'armorId';
      if (!this.data.items.some(item => item.id === this.data[key] && item.kind === kind)) this.data[key] = gear.id;
    }
  }

  abandonRun(): boolean {
    if (!this.data.run || this.data.run.phase === 'result') return false;
    // Carried items were removed from the stash at deployment, so dropping the
    // entire run also discards protected items and gold without death rewards.
    this.data.run = null;
    this.slashes = []; this.arrows = []; this.coinTexts = [];
    this.ensureStarterGear();
    this.note('已放弃本局，全部随身物品及本局金币丢失。');
    this.persist();
    return true;
  }

  private newSave(): SaveData {
    return {
      version: 1, nextId: 5, gold: 0, capacity: { weapon: 5, armor: 5 },
      items: [
        { id: 'i1', kind: 'weapon', tier: 1, level: 0, attempts: 0 },
        { id: 'i2', kind: 'armor', tier: 1, level: 0, attempts: 0 },
        { id: 'i3', kind: 'hp', tier: 1, level: 0, attempts: 0 },
        { id: 'i4', kind: 'mp', tier: 1, level: 0, attempts: 0 },
      ],
      weaponId: 'i1', armorId: 'i2', unlocked: ['tutorial'],
      forgeMeter: 0, protectionTime: 0, run: null,
    };
  }

  persist(): void { this.storage.save(JSON.stringify(this.data)); }

  private note(message: string): void {
    this.messages.unshift(message);
    this.messages.length = Math.min(this.messages.length, 5);
  }

  private item(kind: ItemKind, tier = 1, subtype: WeaponKind = 'dagger'): Item {
    return { id: `i${this.data.nextId++}`, kind, tier, level: 0, attempts: 0,
      ...(kind === 'weapon' ? { weaponKind: subtype, element: 'none' as const } : {}) };
  }

  private rewardItem(kind: GearKind, tier: number): Item {
    const subtype = kind === 'weapon' ? WEAPON_KINDS[Math.floor(this.random() * WEAPON_KINDS.length)] : undefined;
    return this.item(kind, tier, subtype);
  }

  private weightedTier(difficulty: Difficulty, wave = 10): number {
    const weights = [...DIFFICULTIES[difficulty].tierWeights];
    if (wave < 6) { weights[3] = 0; weights[2] = Math.floor(weights[2] / 2); }
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = this.random() * total;
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll < 0) return i + 1;
    }
    return 1;
  }

  gearCount(kind: GearKind): number { return this.data.items.filter(item => item.kind === kind).length; }
  slotPrice(kind: GearKind): number { return this.data.capacity[kind] >= RULES.maxStorageSlots ? 0 : (this.data.capacity[kind] - 4) * 100; }

  buySlot(kind: GearKind): boolean {
    const cost = this.slotPrice(kind);
    if (!cost || this.data.gold < cost) return false;
    this.data.gold -= cost;
    this.data.capacity[kind]++;
    this.persist();
    return true;
  }

  equipCamp(id: string): boolean {
    if (this.data.run) return false;
    const item = this.data.items.find(entry => entry.id === id);
    if (!item || !isGear(item)) return false;
    if (item.kind === 'weapon') this.data.weaponId = id;
    else this.data.armorId = id;
    this.persist();
    return true;
  }

  startRun(difficulty: Difficulty): boolean {
    if (this.data.run || !this.data.unlocked.includes(difficulty)) return false;
    this.ensureStarterGear();
    const take = new Set([this.data.weaponId, this.data.armorId].filter(Boolean));
    for (const kind of ['hp', 'mp'] as const) {
      this.data.items.filter(item => item.kind === kind).slice(0, 2).forEach(item => take.add(item.id));
    }
    const bag = this.data.items.filter(item => take.has(item.id));
    this.data.items = this.data.items.filter(item => !take.has(item.id));
    let weaponId = this.data.weaponId;
    const armorId = this.data.armorId;
    if (!weaponId || !bag.some(item => item.id === weaponId)) {
      const starter = this.item('weapon');
      bag.push(starter);
      weaponId = starter.id;
    }
    this.data.weaponId = null;
    this.data.armorId = null;
    const run: RunState = {
      difficulty, phase: 'battle', wave: 1, completedWaves: 0,
      secondsLeft: difficulty === 'tutorial' ? RULES.tutorialSeconds : RULES.timedWaveSeconds,
      hp: RULES.maxHp, mp: RULES.maxMp, x: 480, y: 270, bag,
      safeIds: [weaponId, armorId].filter((id): id is string => !!id).slice(0, RULES.safeSlots),
      weaponId, armorId, enemies: [], spawnWarnings: [], projectiles: [], spawnTimer: 1.5,
      attackTimer: 0, aoeCooldown: 0, shieldCooldown: 0, shieldTime: 0,
      lootGold: 0, bossRewardWave: 10, bossEarly: false, success: null, choices: [],
    };
    this.slashes = [];
    this.arrows = [];
    this.coinTexts = [];
    this.initElements(run);
    this.data.run = run;
    this.note(difficulty === 'tutorial' ? '教学开始：移动并坚持三波。' : '怪物潮来袭，撑过倒计时！');
    this.persist();
    return true;
  }

  toggleSafe(id: string): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'prepare' || !run.bag.some(item => item.id === id)) return false;
    if (run.safeIds.includes(id)) run.safeIds = run.safeIds.filter(entry => entry !== id);
    else if (run.safeIds.length < RULES.safeSlots) run.safeIds.push(id);
    else return false;
    this.persist();
    return true;
  }

  equipRun(id: string): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'prepare') return false;
    const item = run.bag.find(entry => entry.id === id);
    if (!item || !isGear(item)) return false;
    if (item.kind === 'weapon') run.weaponId = id;
    else run.armorId = id;
    this.persist();
    return true;
  }

  useItem(kind: 'hp' | 'mp'): boolean {
    const run = this.data.run;
    if (!run || !['battle', 'prepare'].includes(run.phase)) return false;
    const index = run.bag.findIndex(item => item.kind === kind);
    if (index < 0 || (kind === 'hp' && run.hp >= RULES.maxHp) || (kind === 'mp' && run.mp >= RULES.maxMp)) return false;
    const [used] = run.bag.splice(index, 1);
    run.safeIds = run.safeIds.filter(id => id !== used.id);
    if (kind === 'hp') run.hp = Math.min(RULES.maxHp, run.hp + RULES.hpPotion);
    else run.mp = Math.min(RULES.maxMp, run.mp + RULES.mpPotion);
    this.note(kind === 'hp' ? '生命 +35' : '魔力 +30');
    this.persist();
    return true;
  }

  cast(skill: 'aoe' | 'shield'): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return false;
    if (skill === 'aoe') {
      if (run.mp < 20 || run.aoeCooldown > 0) return false;
      run.mp -= 20;
      run.aoeCooldown = 8;
      for (const enemy of [...run.enemies]) {
        if (distance(run.x, run.y, enemy.x, enemy.y) <= 140) {
          enemy.hp -= Math.max(1, 50 + this.weaponAttack(run) - MONSTERS[enemy.kind].defense);
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
      }
      this.note('火环爆发！');
    } else {
      if (run.mp < 25 || run.shieldCooldown > 0) return false;
      run.mp -= 25;
      run.shieldCooldown = 15;
      run.shieldTime = 3;
      this.note('护盾开启 3 秒');
    }
    this.persist();
    return true;
  }

  private weaponAttack(run: RunState): number { return COMBAT.bonusAttack + itemStat(run.bag.find(item => item.id === run.weaponId)); }
  private armorDefense(run: RunState): number { return itemStat(run.bag.find(item => item.id === run.armorId)); }

  private hurtPlayer(raw: number): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return;
    const damage = Math.max(1, Math.round((raw - this.armorDefense(run) * 0.35) * (run.shieldTime > 0 ? 0.5 : 1)));
    run.hp = Math.max(0, run.hp - damage);
    if (run.hp === 0) this.endRun(false);
  }

  private initElements(run: RunState): void {
    run.status ??= freshStatus(); run.poisonGrounds ??= []; run.earthStrikes ??= [];
    for (const enemy of run.enemies) enemy.status ??= freshStatus();
  }

  private clearElements(run: RunState): void {
    run.status = freshStatus(); run.poisonGrounds = []; run.earthStrikes = [];
    for (const enemy of run.enemies) enemy.status = freshStatus();
  }

  private statusAttack(enemy: Enemy, element: WeaponElement, kind: WeaponKind, attack: number): void {
    const status = enemy.status ??= freshStatus(); const rule = ELEMENT_RULES[kind];
    if (element === 'thunder') stun(status, rule.stun * (enemy.kind === 'boss' ? .5 : 1));
    if (element === 'fire') burn(status, attack * rule.burnRate, rule.burnSeconds, rule.stacks);
  }

  private groundAttack(element: WeaponElement, kind: WeaponKind, attack: number, hitX: number, hitY: number, x: number, y: number, angle: number): void {
    const rule = ELEMENT_RULES[kind];
    if (element === 'poison') this.poison('hero', true, hitX, hitY, rule.poisonRadius, attack * rule.poisonRate, rule.poisonSeconds);
    if (element === 'earth') this.earth(true, x, y, angle, rule.spikes, rule.reach, attack * rule.earthRate, kind === 'hammer' ? 27 : 18, kind === 'bow');
  }

  private poison(owner: string, friendly: boolean, x: number, y: number, radius: number, dps: number, remaining: number): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return;
    const grounds = run.poisonGrounds ??= [];
    while (grounds.filter(p => p.owner === owner).length >= 3) grounds.splice(grounds.findIndex(p => p.owner === owner), 1);
    if (!friendly) while (grounds.filter(p => !p.friendly).length >= 8) grounds.splice(grounds.findIndex(p => !p.friendly), 1);
    grounds.push({ owner, friendly, x, y, radius, dps, remaining });
  }

  private earth(friendly: boolean, x: number, y: number, angle: number, count: number, reach: number, damage: number, radius: number, fromImpact = false): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return;
    (run.earthStrikes ??= []).push({ friendly, damage, age: 0, hitIds: [], spikes: Array.from({ length: count }, (_, index) => {
      const d = fromImpact ? index * reach / Math.max(1, count - 1) : (index + 1) * reach / count;
      return { x: x + Math.cos(angle) * d, y: y + Math.sin(angle) * d, delay: index * .08, radius };
    }) });
  }

  /** Element damage does not retrigger elements or apply a per-frame minimum of 1. */
  private elementDamage(target: Enemy | RunState, damage: number): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle' || damage <= 0) return;
    if (target === run) {
      run.hp = Math.max(0, run.hp - damage * (run.shieldTime > 0 ? .5 : 1));
      if (run.hp <= 0) this.endRun(false);
    } else {
      const enemy = target as Enemy;
      if (!run.enemies.includes(enemy)) return;
      enemy.hp -= damage;
      if (enemy.hp <= 0) this.killEnemy(enemy);
    }
  }

  private tickElements(dt: number): void {
    const run = this.data.run!;
    // Damage and timed statuses are part of the saved run. Callers pause by not updating.
    for (const target of [run, ...run.enemies]) {
      if (run.phase !== 'battle') return;
      const status = target.status ??= freshStatus();
      status.stun = Math.max(0, status.stun - dt);
      status.immunity = Math.max(0, status.immunity - dt);
      let damage = 0;
      for (const flame of status.burns) { damage += flame.dps * Math.min(dt, flame.remaining); flame.remaining = Math.max(0, flame.remaining - dt); }
      status.burns = status.burns.filter(b => b.remaining > 1e-8);
      this.elementDamage(target, damage);
      if (run.phase !== 'battle') return;
      if (target !== run && !run.enemies.includes(target as Enemy)) continue;
      const grounds = run.poisonGrounds!.filter(p => p.friendly === (target !== run) && distance(target.x, target.y, p.x, p.y) <= p.radius);
      if (grounds.length) {
        // Integrate only actual exposure; overlapping pools contribute the strongest DPS.
        const exposure = Math.max(...grounds.map(p => Math.min(dt, p.remaining)));
        const dose = Math.max(...grounds.map(p => p.dps * Math.min(dt, p.remaining)));
        status.poisonClock += exposure; status.poisonDamage += dose;
        if (status.poisonClock >= .5 - 1e-8) {
          this.elementDamage(target, status.poisonDamage); status.poisonClock = 0; status.poisonDamage = 0;
        }
      } else { status.poisonClock = 0; status.poisonDamage = 0; }
    }
    if (run.phase !== 'battle') return;
    for (const pool of run.poisonGrounds!) pool.remaining -= dt;
    run.poisonGrounds = run.poisonGrounds!.filter(p => p.remaining > 1e-8);
    for (const strike of run.earthStrikes!) {
      strike.age += dt;
      for (const spike of strike.spikes) {
        if (strike.age < spike.delay || strike.age > spike.delay + .28) continue;
        const targets: (Enemy | RunState)[] = strike.friendly ? [...run.enemies] : [run];
        for (const target of targets) {
          const id = target === run ? 'hero' : (target as Enemy).id;
          if (strike.hitIds.includes(id) || distance(target.x, target.y, spike.x, spike.y) > spike.radius + 12) continue;
          strike.hitIds.push(id); this.elementDamage(target, strike.damage);
          if (run.phase !== 'battle') return;
        }
      }
    }
    run.earthStrikes = run.earthStrikes!.filter(s => s.age < s.spikes[s.spikes.length - 1].delay + .45);
  }

  private spawnEnemy(kind?: EnemyKind): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return;
    let x = 0, y = 0;
    let placed = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      x = ARENA.left + SPAWN.margin + this.random() * (ARENA.right - ARENA.left - SPAWN.margin * 2);
      y = ARENA.top + SPAWN.margin + this.random() * (ARENA.bottom - ARENA.top - SPAWN.margin * 2);
      // Randomized grid fallback also terminates for deterministic test RNGs.
      if (attempt >= 20) {
        const cell = (attempt - 20 + Math.floor(this.random() * 40)) % 40;
        x = ARENA.left + SPAWN.margin + (cell % 8) * (ARENA.right - ARENA.left - SPAWN.margin * 2) / 7;
        y = ARENA.top + SPAWN.margin + Math.floor(cell / 8) * (ARENA.bottom - ARENA.top - SPAWN.margin * 2) / 4;
      }
      if (distance(x, y, run.x, run.y) < SPAWN.playerClearance) continue;
      if ([...run.enemies, ...run.spawnWarnings.map(w => w.enemy)].some(e => distance(x, y, e.x, e.y) < SPAWN.spacing)) continue;
      placed = true; break;
    }
    if (!placed) return;
    const candidates = (Object.keys(MONSTERS) as EnemyKind[]).filter(key => MONSTERS[key].weight > 0);
    let roll = this.random() * candidates.reduce((sum, key) => sum + MONSTERS[key].weight, 0);
    const enemyKind = kind ?? candidates.find(key => (roll -= MONSTERS[key].weight) < 0) ?? 'grunt';
    const baseHp = MONSTERS[enemyKind].hp;
    const hp = Math.round(baseHp * DIFFICULTIES[run.difficulty].hp * (enemyKind === 'boss' ? 1 : 1 + (run.wave - 1) * 0.13));
    run.spawnWarnings.push({ remaining: SPAWN.warningSeconds, enemy: { id: `e${this.data.nextId++}`, kind: enemyKind, x, y, hp, maxHp: hp, attackTimer: 0.4, specialTimer: 2 } });
  }

  private killEnemy(enemy: Enemy): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle' || !run.enemies.some(entry => entry.id === enemy.id)) return;
    run.enemies = run.enemies.filter(entry => entry.id !== enemy.id);
    const rewardWave = enemy.kind === 'boss' ? (run.bossRewardWave ?? 10) : run.wave;
    const stats = MONSTERS[enemy.kind];
    const gold = enemy.kind === 'boss' ? Math.round(stats.gold * rewardWave / 10) : stats.gold;
    run.lootGold += gold;
    this.coinTexts.push({ x: enemy.x, y: enemy.y - 22, amount: gold, ttl: COMBAT.coinSeconds });
    const tier = this.weightedTier(run.difficulty, rewardWave);
    for (let i = 0; i < stats.materialRolls; i++) {
      if (this.random() < stats.materialChance) run.bag.push(this.item(this.random() < 0.5 ? 'ore' : 'hide', tier));
    }
    if (this.random() < stats.rareChance) run.bag.push(this.item(this.random() < 0.6 ? 'luck' : 'quality', tier));
    if (enemy.kind === 'boss') {
      run.bag.push(this.rewardItem(this.random() < 0.5 ? 'weapon' : 'armor', tier));
      this.endRun(true);
      return;
    }
    if (enemy.kind === 'elite' && this.random() < 0.28) run.bag.push(this.rewardItem(this.random() < 0.5 ? 'weapon' : 'armor', tier));
    if (this.random() < 0.07) run.bag.push(this.item(this.random() < 0.5 ? 'hp' : 'mp'));
  }

  private updateEnemies(dt: number): void {
    const run = this.data.run;
    if (!run) return;
    for (const enemy of [...run.enemies]) {
      if ((enemy.status?.stun ?? 0) > 0) continue;
      const dx = run.x - enemy.x;
      const dy = run.y - enemy.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const speed = MONSTERS[enemy.kind].speed;
      if (d > (enemy.kind === 'boss' ? 58 : 26)) {
        enemy.x += dx / d * speed * dt;
        enemy.y += dy / d * speed * dt;
      }
      enemy.attackTimer -= dt;
      enemy.specialTimer -= dt;
      if (d < (enemy.kind === 'boss' ? 72 : 30) && enemy.attackTimer <= 0) {
        const attack = MONSTERS[enemy.kind].attack * DIFFICULTIES[run.difficulty].damage;
        this.hurtPlayer(attack);
        if (run.phase === 'battle' && run.difficulty !== 'tutorial') {
          if (enemy.kind === 'ranger') stun(run.status!, .25);
          if (enemy.kind === 'charger' || enemy.kind === 'boss') burn(run.status!, attack * (enemy.kind === 'boss' ? .12 : .1), enemy.kind === 'boss' ? 4 : 3, 1);
          if (enemy.kind === 'grunt') this.poison(enemy.id, false, run.x, run.y, 28, attack * .1, 2);
          if (enemy.kind === 'elite') this.earth(false, enemy.x, enemy.y, Math.atan2(dy, dx), 3, 80, attack * .2, 18);
        }
        enemy.attackTimer = enemy.kind === 'boss' ? 1.2 : 1;
      }
      if (run.phase !== 'battle') return;
    }
  }

  update(dt: number, input: InputState): void {
    const run = this.data.run;
    if (!run || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    for (const effect of this.slashes) effect.ttl -= dt;
    for (const effect of this.coinTexts) { effect.ttl -= dt; effect.y -= dt * 25; }
    this.slashes = this.slashes.filter(effect => effect.ttl > 0);
    this.coinTexts = this.coinTexts.filter(effect => effect.ttl > 0);
    if (run.phase === 'prepare') {
      run.secondsLeft -= dt;
      if (run.secondsLeft <= 0) this.continueRun();
      return;
    }
    if (run.phase !== 'battle') return;
    this.initElements(run);
    const wasStunned = run.status!.stun > 0;
    this.tickElements(dt);
    if (run.phase !== 'battle') return;
    this.heroTime += dt;
    const magnitude = wasStunned ? 0 : Math.min(1, Math.hypot(input.x, input.y));
    this.heroMoving = magnitude > 0.05;
    if (magnitude > 0.05) {
      const speed = 165;
      run.x = clamp(run.x + input.x / Math.max(1, magnitude) * speed * dt, ARENA.left + 15, ARENA.right - 15);
      run.y = clamp(run.y + input.y / Math.max(1, magnitude) * speed * dt, ARENA.top + 15, ARENA.bottom - 15);
    }
    run.secondsLeft -= dt;
    run.mp = Math.min(RULES.maxMp, run.mp + dt * 0.45);
    run.aoeCooldown = Math.max(0, run.aoeCooldown - dt);
    run.shieldCooldown = Math.max(0, run.shieldCooldown - dt);
    run.shieldTime = Math.max(0, run.shieldTime - dt);
    run.attackTimer -= dt;
    const weapon = run.bag.find(item => item.id === run.weaponId && item.kind === 'weapon');
    const profile = weaponProfile(weapon);
    const nearest = run.enemies.filter(enemy => distance(run.x, run.y, enemy.x, enemy.y) <= profile.range)
      .sort((a, b) => distance(run.x, run.y, a.x, a.y) - distance(run.x, run.y, b.x, b.y))[0];
    if (!wasStunned && weapon && nearest && run.attackTimer <= 0) {
      const angle = Math.atan2(nearest.y - run.y, nearest.x - run.x);
      run.attackTimer = profile.interval;
      if (weaponKind(weapon) === 'bow') {
        this.arrows.push({ x: run.x, y: run.y, angle, targetId: nearest.id, damage: this.weaponAttack(run), element: weapon.element ?? 'none', elementalAttack: itemStat(weapon) });
      } else {
        this.slashes.push({ x: run.x, y: run.y, angle, ttl: COMBAT.slashSeconds, range: profile.range, weaponKind: weaponKind(weapon), element: weapon.element });
        this.groundAttack(weapon.element ?? 'none', weaponKind(weapon), itemStat(weapon), nearest.x, nearest.y, run.x, run.y, angle);
        for (const enemy of [...run.enemies]) {
          const offset = Math.atan2(enemy.y - run.y, enemy.x - run.x) - angle;
          const delta = Math.atan2(Math.sin(offset), Math.cos(offset));
          if (distance(run.x, run.y, enemy.x, enemy.y) <= profile.range && Math.abs(delta) <= COMBAT.meleeHalfAngle) {
            this.statusAttack(enemy, weapon.element ?? 'none', weaponKind(weapon), itemStat(weapon));
            enemy.hp -= Math.max(1, this.weaponAttack(run) - MONSTERS[enemy.kind].defense);
            if (enemy.hp <= 0) this.killEnemy(enemy);
            if (run.phase !== 'battle') break;
          }
        }
      }
    }
    // Flight is cosmetic geometry; damage applies once to the locked target only.
    for (const arrow of [...this.arrows]) {
      if (run.phase !== 'battle') break;
      const target = run.enemies.find(enemy => enemy.id === arrow.targetId);
      if (!target) { this.arrows = this.arrows.filter(entry => entry !== arrow); continue; }
      const dx = target.x - arrow.x, dy = target.y - arrow.y;
      const d = Math.hypot(dx, dy);
      arrow.angle = Math.atan2(dy, dx);
      if (d <= COMBAT.arrowSpeed * dt + 12) {
        this.arrows = this.arrows.filter(entry => entry !== arrow);
        this.statusAttack(target, arrow.element, 'bow', arrow.elementalAttack);
        this.groundAttack(arrow.element, 'bow', arrow.elementalAttack, target.x, target.y, target.x, target.y, arrow.angle);
        target.hp -= Math.max(1, arrow.damage - MONSTERS[target.kind].defense);
        if (target.hp <= 0) this.killEnemy(target);
      } else {
        arrow.x += dx / d * COMBAT.arrowSpeed * dt;
        arrow.y += dy / d * COMBAT.arrowSpeed * dt;
      }
    }
    if (run.phase !== 'battle') return;
    this.updateEnemies(dt);
    if (run.phase !== 'battle') return;
    for (const warning of run.spawnWarnings) warning.remaining -= dt;
    const ready = run.spawnWarnings.filter(w => w.remaining <= 0);
    run.spawnWarnings = run.spawnWarnings.filter(w => w.remaining > 0);
    run.enemies.push(...ready.map(w => w.enemy));
    if (run.wave < 10) {
      run.spawnTimer -= dt;
      const cap = run.difficulty === 'tutorial' ? 5 : 9 + run.wave;
      if (run.spawnTimer <= 0) {
        const count = Math.min(cap - run.enemies.length - run.spawnWarnings.length,
          (run.difficulty === 'tutorial' ? 2 : 3) + Math.floor(this.random() * (run.difficulty === 'tutorial' ? 2 : 3)));
        for (let i = 0; i < count; i++) this.spawnEnemy();
        run.spawnTimer = run.difficulty === 'tutorial' ? 3.3 : Math.max(1.15, 2.5 - run.wave * 0.12);
      }
    }
    if (run.phase !== 'battle') return;
    if (run.secondsLeft <= 0) {
      if (run.wave === 10) this.endRun(false);
      else this.completeWave();
    }
  }

  private completeWave(): void {
    const run = this.data.run;
    if (!run) return;
    run.completedWaves = run.wave;
    this.arrows = []; this.slashes = [];
    this.clearElements(run);
    run.enemies = [];
    run.spawnWarnings = [];
    run.projectiles = [];
    run.lootGold += run.difficulty === 'tutorial' ? 10 : 20;
    if (run.difficulty === 'tutorial' && run.wave === RULES.tutorialWaves) { this.endRun(true); return; }
    if (run.wave % 3 === 0) {
      run.phase = 'prepare';
      run.secondsLeft = RULES.preparationSeconds;
      this.note(`第 ${run.wave} 波完成，进入整备。`);
      this.persist();
    } else this.nextWave();
  }

  private nextWave(): void {
    const run = this.data.run;
    if (!run) return;
    run.wave++;
    this.arrows = []; this.slashes = [];
    this.clearElements(run);
    run.phase = 'battle';
    run.secondsLeft = run.difficulty === 'tutorial' ? RULES.tutorialSeconds : run.wave === 10 ? RULES.bossSeconds : RULES.timedWaveSeconds;
    run.spawnTimer = 1;
    run.enemies = [];
    run.spawnWarnings = [];
    run.projectiles = [];
    if (run.wave === 10) this.spawnEnemy('boss');
    this.note(run.wave === 10 ? '最终 Boss 出现！' : `第 ${run.wave} 波开始。`);
    this.persist();
  }

  continueRun(): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'prepare') return false;
    this.nextWave();
    return true;
  }

  challengeBoss(): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'prepare' || ![3, 6, 9].includes(run.wave)) return false;
    run.bossEarly = true;
    run.bossRewardWave = run.wave;
    run.wave = 9;
    this.nextWave();
    this.note('提前挑战 Boss，击败后立即撤退！');
    return true;
  }

  private endRun(success: boolean): void {
    const run = this.data.run;
    if (!run || run.phase === 'result') return;
    run.phase = 'result';
    this.arrows = []; this.slashes = [];
    this.clearElements(run);
    run.success = success;
    run.enemies = [];
    run.spawnWarnings = [];
    run.projectiles = [];
    if (!success) {
      const tier = this.weightedTier(run.difficulty, run.completedWaves);
      run.choices = [this.rewardItem('weapon', tier), this.item('armor', tier)];
    }
    this.note(success ? '撤退成功，战利品归仓。' : '撤退失败，安全箱保留三件物品。');
    this.persist();
  }

  pendingUnlock(): Difficulty | null {
    const run = this.data.run;
    if (!run || run.phase !== 'result' || !run.success) return null;
    if (run.difficulty === 'tutorial') return 'normal';
    if (run.difficulty === 'normal') return 'hard';
    if (run.difficulty === 'hard' && !run.bossEarly) return 'nightmare';
    return null;
  }

  retainedItems(choice: number | null = null): Item[] {
    const run = this.data.run;
    if (!run || run.phase !== 'result') return [];
    if (run.success) return [...run.bag];
    const safe = run.bag.filter(item => run.safeIds.includes(item.id)).slice(0, RULES.safeSlots);
    return choice === null ? safe : [...safe, run.choices[choice]].filter(Boolean);
  }

  overflow(choice: number | null = null): Record<GearKind, number> {
    const items = this.retainedItems(choice);
    return {
      weapon: Math.max(0, this.gearCount('weapon') + items.filter(item => item.kind === 'weapon').length - this.data.capacity.weapon),
      armor: Math.max(0, this.gearCount('armor') + items.filter(item => item.kind === 'armor').length - this.data.capacity.armor),
    };
  }

  sellRunItem(id: string): boolean {
    const run = this.data.run;
    if (!run || (run.phase !== 'prepare' && !(run.phase === 'result' && run.success))) return false;
    const index = run.bag.findIndex(item => item.id === id && (run.phase !== 'prepare' || item.kind === 'weapon'));
    if (index < 0 || (run.phase === 'prepare' && run.weaponId === id)) return false;
    if (run.weaponId === id) run.weaponId = null;
    if (run.armorId === id) run.armorId = null;
    run.safeIds = run.safeIds.filter(entry => entry !== id);
    run.lootGold += salePrice(run.bag[index]);
    run.bag.splice(index, 1);
    this.persist();
    return true;
  }

  discardSafe(id: string): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'result' || run.success || !run.safeIds.includes(id)) return false;
    run.safeIds = run.safeIds.filter(entry => entry !== id);
    this.persist();
    return true;
  }

  sellStashItem(id: string): boolean {
    const index = this.data.items.findIndex(item => item.id === id && isGear(item));
    if (index < 0) return false;
    const [item] = this.data.items.splice(index, 1);
    this.data.gold += salePrice(item);
    if (this.data.weaponId === id) this.data.weaponId = null;
    if (this.data.armorId === id) this.data.armorId = null;
    this.persist();
    return true;
  }

  finishResult(choice: number | null = null): boolean {
    const run = this.data.run;
    if (!run || run.phase !== 'result' || run.success === null) return false;
    if (!run.success && choice !== 0 && choice !== 1) return false;
    const overflow = this.overflow(choice);
    if (overflow.weapon || overflow.armor) return false;
    const retained = this.retainedItems(choice);
    this.data.items.push(...retained);
    if (run.success) {
      this.data.gold += run.lootGold;
      if (run.difficulty === 'tutorial') this.unlock('normal');
      if (run.difficulty === 'normal') this.unlock('hard');
      if (run.difficulty === 'hard' && !run.bossEarly) this.unlock('nightmare');
    }
    const weapon = retained.find(item => item.id === run.weaponId);
    const armor = retained.find(item => item.id === run.armorId);
    this.data.weaponId = weapon?.id ?? retained.find(item => item.kind === 'weapon')?.id ?? this.data.weaponId;
    this.data.armorId = armor?.id ?? retained.find(item => item.kind === 'armor')?.id ?? this.data.armorId;
    this.data.run = null;
    this.ensureStarterGear();
    this.persist();
    return true;
  }

  private unlock(difficulty: Difficulty): void {
    if (!this.data.unlocked.includes(difficulty)) {
      this.data.unlocked.push(difficulty);
      this.note(`${DIFFICULTIES[difficulty].label}难度已解锁！`);
    }
  }

  craft(kind: GearKind, tier: number, subtype: WeaponKind = 'dagger'): boolean {
    if (kind === 'weapon' && !WEAPON_KINDS.includes(subtype)) return false;
    if (this.data.run || tier < 1 || tier > 4 || this.gearCount(kind) >= this.data.capacity[kind]) return false;
    const material = kind === 'weapon' ? 'ore' : 'hide';
    const stock = this.data.items.filter(item => item.kind === material && item.tier >= tier).slice(0, 3);
    if (stock.length < 3) return false;
    const ids = new Set(stock.map(item => item.id));
    this.data.items = this.data.items.filter(item => !ids.has(item.id));
    const gear = this.item(kind, tier, subtype);
    if (kind === 'weapon') {
      const roll = this.random();
      if (roll < ENCHANT_CHANCE) gear.element = ENCHANTMENTS[Math.floor(roll / (ENCHANT_CHANCE / ENCHANTMENTS.length))];
    }
    this.forgeColor = ELEMENT_COLORS[gear.element ?? 'none'];
    this.forgeAnimation = 0.9; this.forgeVisualKind = kind === 'weapon' ? subtype : 'armor';
    this.data.items.push(gear);
    this.note(`打造成功：${kind === 'weapon' ? WEAPONS[subtype].label : '护具'}${gear.element && gear.element !== 'none' ? ` · 附带${({ thunder: '雷', fire: '火', poison: '毒', earth: '土', ice: '冰', wind: '风' })[gear.element]}属性` : ''}。`);
    this.persist();
    return true;
  }

  forgeOdds(item: Item, luck = false): ForgeOdds {
    const n = item.attempts;
    let broken = Math.min(30, 5 + 3 * n);
    let downgrade = Math.min(30, 10 + 2 * n);
    let upgrade = Math.max(20, 50 - 3 * n);
    let same = 100 - broken - downgrade - upgrade;
    if (item.kind === 'armor' && item.level >= 10 && item.tier >= 4) { same += upgrade; upgrade = 0; }
    if (item.level <= -3 && item.tier === 1) { same += downgrade; downgrade = 0; }
    if (luck && upgrade > 0) { const shifted = Math.min(10, same); same -= shifted; upgrade += shifted; }
    if (this.data.protectionTime > 0) { same += broken; broken = 0; }
    return { break: broken, downgrade, same, upgrade };
  }

  forge(id: string, luck = false, quality = false): boolean {
    if (this.data.run) return false;
    const item = this.data.items.find(entry => entry.id === id);
    if (!item || !isGear(item)) return false;
    const materialKind = item.kind === 'weapon' ? 'ore' : 'hide';
    const material = this.data.items.find(entry => entry.kind === materialKind && entry.tier >= item.tier);
    const lucky = this.data.items.find(entry => entry.kind === 'luck');
    const catalyst = this.data.items.find(entry => entry.kind === 'quality');
    if (!material || (luck && !lucky) || (quality && (!catalyst || item.tier >= 4))) return false;
    const odds = this.forgeOdds(item, luck);
    this.forgeColor = ELEMENT_COLORS[item.element ?? 'none'];
    this.forgeAnimation = 0.9; this.forgeVisualKind = item.kind === 'weapon' ? weaponKind(item) : 'armor';
    const consumed = new Set([material.id, ...(luck && lucky ? [lucky.id] : []), ...(quality && catalyst ? [catalyst.id] : [])]);
    this.data.items = this.data.items.filter(entry => !consumed.has(entry.id));
    const roll = this.random() * 100;
    if (roll < odds.break) {
      this.data.items = this.data.items.filter(entry => entry.id !== id);
      if (this.data.weaponId === id) this.data.weaponId = null;
      if (this.data.armorId === id) this.data.armorId = null;
      this.note('锻造失败：装备损坏。');
    } else if (roll < odds.break + odds.downgrade) {
      if (item.level > -3) item.level--;
      else item.tier = Math.max(1, item.tier - 1);
      this.note('锻造失败：装备降质。');
    } else if (roll >= odds.break + odds.downgrade + odds.same) {
      item.level = item.kind === 'weapon' ? item.level + 1 : Math.min(10, item.level + 1);
      if (quality) item.tier = Math.min(4, item.tier + 1);
      this.note('锻造成功：属性提升！');
    } else this.note('锻造后属性不变。');
    item.attempts++;
    if (this.data.protectionTime <= 0) {
      this.data.forgeMeter = Math.min(RULES.forgeMeterTarget, this.data.forgeMeter + RULES.forgeMeterPerAttempt);
      if (this.data.forgeMeter >= RULES.forgeMeterTarget) {
        this.data.protectionTime = RULES.forgeProtectionSeconds;
        this.note('炉心共鸣：30 秒不损坏！');
      }
    }
    this.persist();
    return true;
  }

  tickForge(dt: number): void {
    if (this.data.run || dt <= 0) return;
    this.forgeAnimation = Math.max(0, this.forgeAnimation - Math.min(dt, 0.05));
    if (this.data.protectionTime <= 0) return;
    this.data.protectionTime = Math.max(0, this.data.protectionTime - Math.min(dt, 0.05));
    if (this.data.protectionTime === 0) {
      this.data.forgeMeter = 0;
      this.note('炉心共鸣结束。');
      this.persist();
    }
  }
}
