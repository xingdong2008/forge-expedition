import { ARENA, COMBAT, MONSTERS, DIFFICULTIES, RULES, isGear, itemStat, salePrice } from './config';
import type { Difficulty, Enemy, EnemyKind, ForgeOdds, GearKind, InputState, Item, ItemKind, RunState, SaveData, StorageAdapter } from './types';

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class Game {
  data: SaveData;
  messages: string[] = [];
  // Visual events are transient: they never change settlement or save contents.
  slashes: { x: number; y: number; angle: number; ttl: number }[] = [];
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
    // All ranged combat is reserved for a future weapon enchantment system.
    if (this.data.run) this.data.run.projectiles = [];
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
    this.slashes = []; this.coinTexts = [];
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

  private item(kind: ItemKind, tier = 1): Item {
    return { id: `i${this.data.nextId++}`, kind, tier, level: 0, attempts: 0 };
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
      weaponId, armorId, enemies: [], projectiles: [], spawnTimer: 1.5,
      attackTimer: 0, aoeCooldown: 0, shieldCooldown: 0, shieldTime: 0,
      lootGold: 0, bossRewardWave: 10, bossEarly: false, success: null, choices: [],
    };
    this.slashes = [];
    this.coinTexts = [];
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

  private spawnEnemy(kind?: EnemyKind): void {
    const run = this.data.run;
    if (!run || run.phase !== 'battle') return;
    const edge = Math.floor(this.random() * 4);
    const x = edge < 2 ? (edge === 0 ? ARENA.left + 12 : ARENA.right - 12) : ARENA.left + this.random() * (ARENA.right - ARENA.left);
    const y = edge >= 2 ? (edge === 2 ? ARENA.top + 12 : ARENA.bottom - 12) : ARENA.top + this.random() * (ARENA.bottom - ARENA.top);
    const candidates = (Object.keys(MONSTERS) as EnemyKind[]).filter(key => MONSTERS[key].weight > 0);
    let roll = this.random() * candidates.reduce((sum, key) => sum + MONSTERS[key].weight, 0);
    const enemyKind = kind ?? candidates.find(key => (roll -= MONSTERS[key].weight) < 0) ?? 'grunt';
    const baseHp = MONSTERS[enemyKind].hp;
    const hp = Math.round(baseHp * DIFFICULTIES[run.difficulty].hp * (enemyKind === 'boss' ? 1 : 1 + (run.wave - 1) * 0.13));
    run.enemies.push({ id: `e${this.data.nextId++}`, kind: enemyKind, x, y, hp, maxHp: hp, attackTimer: 0, specialTimer: 2 });
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
      run.bag.push(this.item(this.random() < 0.5 ? 'weapon' : 'armor', tier));
      this.endRun(true);
      return;
    }
    if (enemy.kind === 'elite' && this.random() < 0.28) run.bag.push(this.item(this.random() < 0.5 ? 'weapon' : 'armor', tier));
    if (this.random() < 0.07) run.bag.push(this.item(this.random() < 0.5 ? 'hp' : 'mp'));
  }

  private updateEnemies(dt: number): void {
    const run = this.data.run;
    if (!run) return;
    for (const enemy of [...run.enemies]) {
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
        this.hurtPlayer(MONSTERS[enemy.kind].attack * DIFFICULTIES[run.difficulty].damage);
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
    const magnitude = Math.min(1, Math.hypot(input.x, input.y));
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
    const nearest = run.enemies.filter(enemy => distance(run.x, run.y, enemy.x, enemy.y) <= COMBAT.meleeRange)
      .sort((a, b) => distance(run.x, run.y, a.x, a.y) - distance(run.x, run.y, b.x, b.y))[0];
    if (nearest && run.attackTimer <= 0) {
      const angle = Math.atan2(nearest.y - run.y, nearest.x - run.x);
      this.slashes.push({ x: run.x, y: run.y, angle, ttl: COMBAT.slashSeconds });
      run.attackTimer = COMBAT.attackInterval;
      for (const enemy of [...run.enemies]) {
        const offset = Math.atan2(enemy.y - run.y, enemy.x - run.x) - angle;
        const delta = Math.atan2(Math.sin(offset), Math.cos(offset));
        if (distance(run.x, run.y, enemy.x, enemy.y) <= COMBAT.meleeRange && Math.abs(delta) <= COMBAT.meleeHalfAngle) {
          enemy.hp -= Math.max(1, this.weaponAttack(run) - MONSTERS[enemy.kind].defense);
          if (enemy.hp <= 0) this.killEnemy(enemy);
        }
      }
    }
    if (run.phase !== 'battle') return;
    if (run.wave < 10) {
      run.spawnTimer -= dt;
      if (run.spawnTimer <= 0 && run.enemies.length < (run.difficulty === 'tutorial' ? 5 : 9 + run.wave)) {
        this.spawnEnemy();
        run.spawnTimer = run.difficulty === 'tutorial' ? 3.3 : Math.max(1.15, 2.5 - run.wave * 0.12);
      }
    }
    this.updateEnemies(dt);
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
    run.enemies = [];
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
    run.phase = 'battle';
    run.secondsLeft = run.difficulty === 'tutorial' ? RULES.tutorialSeconds : run.wave === 10 ? RULES.bossSeconds : RULES.timedWaveSeconds;
    run.spawnTimer = 1;
    run.enemies = [];
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
    run.success = success;
    run.enemies = [];
    run.projectiles = [];
    if (!success) {
      const tier = this.weightedTier(run.difficulty, run.completedWaves);
      run.choices = [this.item('weapon', tier), this.item('armor', tier)];
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
    if (!run || run.phase !== 'result' || !run.success) return false;
    const index = run.bag.findIndex(item => item.id === id);
    if (index < 0) return false;
    if (run.weaponId === id) run.weaponId = null;
    if (run.armorId === id) run.armorId = null;
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

  craft(kind: GearKind, tier: number): boolean {
    if (this.data.run || tier < 1 || tier > 4 || this.gearCount(kind) >= this.data.capacity[kind]) return false;
    const material = kind === 'weapon' ? 'ore' : 'hide';
    const stock = this.data.items.filter(item => item.kind === material && item.tier >= tier).slice(0, 3);
    if (stock.length < 3) return false;
    const ids = new Set(stock.map(item => item.id));
    this.data.items = this.data.items.filter(item => !ids.has(item.id));
    const gear = this.item(kind, tier);
    this.data.items.push(gear);
    this.note(`打造成功：${kind === 'weapon' ? '武器' : '护具'}。`);
    this.persist();
    return true;
  }

  forgeOdds(item: Item, luck = false): ForgeOdds {
    const n = item.attempts;
    let broken = Math.min(30, 5 + 3 * n);
    let downgrade = Math.min(30, 10 + 2 * n);
    let upgrade = Math.max(20, 50 - 3 * n);
    let same = 100 - broken - downgrade - upgrade;
    if (item.level >= 10 && item.tier >= 4) { same += upgrade; upgrade = 0; }
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
      item.level = Math.min(10, item.level + 1);
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
    if (this.data.run || this.data.protectionTime <= 0 || dt <= 0) return;
    this.data.protectionTime = Math.max(0, this.data.protectionTime - Math.min(dt, 0.05));
    if (this.data.protectionTime === 0) {
      this.data.forgeMeter = 0;
      this.note('炉心共鸣结束。');
      this.persist();
    }
  }
}
