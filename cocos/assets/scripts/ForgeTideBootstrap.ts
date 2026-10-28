import { _decorator, Camera, Canvas, Color, Component, EventTouch, Graphics, input, Input, KeyCode, Label, Layers, Node, ResolutionPolicy, UITransform, Vec3, view } from 'cc';
import { Game } from './game/game';
import { createPlatformServices } from './game/platform';
import { COMBAT, MONSTERS, DIFFICULTIES, isGear, itemName, itemStat } from './game/config';
import type { Difficulty, GearKind, Item, RunState } from './game/types';

const { ccclass } = _decorator;
const W = 960, H = 540;
const tint = (hex: string) => new Color().fromHEX(hex);

@ccclass('ForgeTideBootstrap')
export class ForgeTideBootstrap extends Component {
  private game = new Game(createPlatformServices().storage);
  private art!: Graphics;
  private ui!: Node;
  private effectLabels: Label[] = [];
  private keys = new Set<KeyCode>();
  private stick = { x: 0, y: 0 };
  private touchId = -1;
  private paused = false;
  private confirmHome = false;
  private homeWasPaused = false;
  private tab: 'map' | 'forge' | 'storage' = 'map';
  private selectedGear: string | null = null;
  private selectedChoice: number | null = null;
  private listPage = 0;
  private luck = false;
  private quality = false;
  private saveClock = 0;
  private uiClock = 0;
  private lastPhase = '';

  onLoad(): void {
    this.game.grantForgeTestSupply();
    view.setDesignResolutionSize(W, H, ResolutionPolicy.SHOW_ALL);
    const canvas = this.node.getComponent(Canvas) ?? this.node.addComponent(Canvas);
    this.node.getComponent(UITransform)?.setContentSize(W, H);
    let camera = this.node.getComponentInChildren(Camera);
    if (!camera) {
      const cameraNode = new Node('GameCamera');
      cameraNode.parent = this.node;
      cameraNode.setPosition(new Vec3(0, 0, 1000));
      camera = cameraNode.addComponent(Camera);
      camera.projection = Camera.ProjectionType.ORTHO;
      camera.orthoHeight = H;
    }
    camera.visibility = Layers.BitMask.UI_2D;
    canvas.cameraComponent = camera;
    const background = new Node('ArenaPlaceholder');
    background.parent = this.node;
    background.layer = this.node.layer;
    background.addComponent(UITransform).setContentSize(W, H);
    this.art = background.addComponent(Graphics);
    this.drawBackdrop();
    const actors = new Node('Actors');
    actors.parent = this.node;
    actors.layer = this.node.layer;
    actors.addComponent(UITransform).setContentSize(W, H);
    this.art = actors.addComponent(Graphics);
    this.ui = new Node('GameUI');
    this.ui.parent = this.node;
    this.ui.layer = this.node.layer;
    this.ui.addComponent(UITransform).setContentSize(W, H);
    this.node.on(Node.EventType.TOUCH_START, this.touchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.touchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
    input.on(Input.EventType.KEY_DOWN, event => {
      if (this.confirmHome) return;
      this.keys.add(event.keyCode);
      if (event.keyCode === KeyCode.KEY_Q) this.game.cast('aoe');
      if (event.keyCode === KeyCode.KEY_E) this.game.cast('shield');
      if (event.keyCode === KeyCode.DIGIT_1) this.game.useItem('hp');
      if (event.keyCode === KeyCode.DIGIT_2) this.game.useItem('mp');
      if (event.keyCode === KeyCode.ESCAPE) this.paused = !this.paused;
      this.renderUI();
    });
    input.on(Input.EventType.KEY_UP, event => this.keys.delete(event.keyCode));
    this.renderUI();
  }

  private box(x: number, y: number, w: number, h: number, fill = '#1c302e'): void {
    const node = new Node('Panel');
    node.parent = this.ui; node.layer = this.node.layer;
    node.setPosition(x - W / 2 + w / 2, H / 2 - y - h / 2, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const art = node.addComponent(Graphics);
    art.fillColor = tint(fill); art.rect(-w / 2, -h / 2, w, h); art.fill();
  }

  private text(value: string, x: number, y: number, w = 300, h = 27, size = 15, fill = '#f1e8cc'): void {
    const node = new Node('Text');
    node.parent = this.ui; node.layer = this.node.layer;
    node.setPosition(x - W / 2 + w / 2, H / 2 - y - h / 2, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const label = node.addComponent(Label);
    label.string = value; label.fontSize = size; label.lineHeight = size + 3;
    label.overflow = Label.Overflow.CLAMP; label.enableWrapText = true;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER; label.color = tint(fill);
  }

  private button(value: string, x: number, y: number, w: number, action: string, arg = '', enabled = true, h = 34): void {
    const node = new Node(`Button:${action}`);
    node.parent = this.ui; node.layer = this.node.layer;
    node.setPosition(x - W / 2 + w / 2, H / 2 - y - h / 2, 0);
    node.addComponent(UITransform).setContentSize(w, h);
    const art = node.addComponent(Graphics);
    art.fillColor = tint(enabled ? '#527265' : '#394c49');
    art.rect(-w / 2, -h / 2, w, h); art.fill();
    const caption = new Node('Caption');
    caption.parent = node; caption.layer = this.node.layer;
    caption.addComponent(UITransform).setContentSize(w - 6, h);
    const label = caption.addComponent(Label);
    label.string = value; label.fontSize = h < 29 ? 11 : 13; label.lineHeight = 16;
    label.overflow = Label.Overflow.SHRINK;
    label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = tint(enabled ? '#fff1d7' : '#82958e');
    if (enabled) node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
      event.propagationStopped = true; this.command(action, arg);
    });
  }

  private list(items: Item[], x: number, y: number, mode: 'camp' | 'prepare' | 'result'): void {
    const pageSize = mode === 'camp' ? 8 : mode === 'prepare' ? 7 : 5;
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    this.listPage = Math.min(this.listPage, pages - 1);
    for (const [index, item] of items.slice(this.listPage * pageSize, this.listPage * pageSize + pageSize).entries()) {
      const row = y + index * 31;
      const stat = isGear(item) ? ` · ${item.kind === 'weapon' ? '攻' : '防'} ${itemStat(item)}` : '';
      this.text(itemName(item) + stat, x, row, 210, 25, 12);
      if (mode === 'camp' && isGear(item)) {
        this.button('装备', x + 211, row, 45, 'equip', item.id, true, 25);
        this.button('出售', x + 261, row, 45, 'sell', item.id, true, 25);
      } else if (mode === 'prepare') {
        if (isGear(item)) this.button('装备', x + 211, row, 45, 'equipRun', item.id, true, 25);
        this.button(this.game.data.run?.safeIds.includes(item.id) ? '已保' : '入箱', x + 261, row, 46, 'safe', item.id, true, 25);
      } else if (mode === 'result') {
        const run = this.game.data.run;
        if (run?.success) this.button('出售', x + 261, row, 45, 'sellRun', item.id, true, 25);
        else if (run?.safeIds.includes(item.id)) this.button('放弃', x + 261, row, 45, 'discardSafe', item.id, true, 25);
      }
    }
    if (pages > 1) {
      const navY = y + pageSize * 31 + 3;
      this.button('上一页', x, navY, 70, 'listPage', '-1', this.listPage > 0, 27);
      this.text(`${this.listPage + 1}/${pages}`, x + 76, navY, 45, 27, 12);
      this.button('下一页', x + 125, navY, 70, 'listPage', '1', this.listPage < pages - 1, 27);
    }
  }

  private renderUI(): void {
    for (const child of [...this.ui.children]) child.destroy();
    const run = this.game.data.run;
    if (!run) {
      this.box(35, 34, 890, 470, '#192b2a');
      this.text('炉火远征', 60, 50, 320, 46, 31, '#f2d099');
      this.text(`金币 ${this.game.data.gold}   武器 ${this.game.gearCount('weapon')}/${this.game.data.capacity.weapon}   护具 ${this.game.gearCount('armor')}/${this.game.data.capacity.armor}`, 60, 100, 480, 25, 14);
      this.button('冒险地图', 60, 455, 130, 'tab', 'map');
      this.button('锻造台', 198, 455, 130, 'tab', 'forge');
      this.button('仓库', 336, 455, 130, 'tab', 'storage');
      if (this.tab === 'map') this.renderMap();
      if (this.tab === 'forge') this.renderForge();
      if (this.tab === 'storage') this.renderStorage();
      return;
    }
    if (this.confirmHome) {
      this.box(200, 140, 560, 250);
      this.text('确认放弃本局并回到主页？', 230, 165, 510, 40, 24);
      this.text('全部随身道具、武器、护具及本局金币会永久丢失。\n安全箱不保留；营地仓库不受影响。', 230, 215, 500, 70, 17);
      this.button('取消', 270, 320, 170, 'cancelHome');
      this.button('确认放弃', 490, 320, 170, 'confirmHome');
      return;
    }
    if (run.phase !== 'result') this.button('回到主页', 160, 132, 115, 'home');
    this.box(18, 13, 270, 107);
    this.text(`${DIFFICULTIES[run.difficulty].label} · 第 ${run.wave}/${run.difficulty === 'tutorial' ? 3 : 10} 波`, 31, 20, 240, 30, 17, '#f0d195');
    this.text(`HP ${Math.ceil(run.hp)}/100  MP ${Math.ceil(run.mp)}/60`, 31, 55, 240, 24, 14);
    this.text(`倒计时 ${Math.ceil(run.secondsLeft)} 秒 · 金币 ${run.lootGold}`, 31, 80, 240, 25, 13);
    if (run.phase === 'battle') {
      this.box(703, 13, 239, 47);
      this.text(this.paused ? '已暂停' : `近战挥剑 · 测试攻击 +${COMBAT.bonusAttack}`, 718, 24, 200, 25, 15);
      this.button(this.paused ? '继续' : '暂停', 863, 76, 70, 'pause');
      this.button('✹ 火环', 668, 451, 95, 'skill', 'aoe');
      this.button('◇ 护盾', 773, 451, 95, 'skill', 'shield');
      this.button('生命 +35', 665, 492, 95, 'item', 'hp', true, 30);
      this.button('魔力 +30', 770, 492, 95, 'item', 'mp', true, 30);
    } else if (run.phase === 'prepare') this.renderPrepare(run);
    else this.renderResult(run);
  }

  private renderMap(): void {
    this.text('灰烬庭院', 540, 55, 250, 40, 23);
    this.text('撑过定时怪潮。第 3、6、9 波可提前挑战 Boss。', 535, 100, 350, 50, 15);
    (['tutorial', 'normal', 'hard', 'nightmare'] as Difficulty[]).forEach((difficulty, index) => {
      const unlocked = this.game.data.unlocked.includes(difficulty);
      this.button(`${DIFFICULTIES[difficulty].label} ${unlocked ? '→' : '锁定'}`, 545, 170 + index * 65, 250, 'start', difficulty, unlocked, 47);
    });
  }

  private renderForge(): void {
    this.text('局外锻造台', 540, 55, 260, 36, 22);
    const gear = this.game.data.items.filter(isGear);
    const selected = gear.find(item => item.id === this.selectedGear) ?? gear[0];
    if (selected) this.selectedGear = selected.id;
    gear.slice(0, 6).forEach((item, index) => this.button(itemName(item), 65, 145 + index * 47, 290, 'select', item.id));
    if (selected) {
      const luckAvailable = this.game.data.items.some(item => item.kind === 'luck');
      const qualityAvailable = this.game.data.items.some(item => item.kind === 'quality');
      const odds = this.game.forgeOdds(selected, this.luck && luckAvailable);
      const material = selected.kind === 'weapon' ? 'ore' : 'hide';
      const stock = this.game.data.items.filter(item => item.kind === material && item.tier >= selected.tier).length;
      this.text(itemName(selected), 540, 110, 310, 32, 20, '#f6c385');
      this.text(`损坏 ${odds.break}% · 降质 ${odds.downgrade}%`, 540, 150, 300, 28, 15);
      this.text(`不变 ${odds.same}% · 升级 ${odds.upgrade}%`, 540, 181, 300, 28, 15);
      this.button(`幸运粉尘 ${this.luck ? '✓' : ''}`, 540, 222, 135, 'luck', '', luckAvailable);
      this.button(`精炼晶核 ${this.quality ? '✓' : ''}`, 685, 222, 135, 'quality', '', qualityAvailable && selected.tier < 4);
      this.button(`继续锻造 · 材料 ${stock}`, 540, 274, 280, 'forge', selected.id, stock > 0);
      this.text(`锻造值 ${this.game.data.forgeMeter}/100 · 保护 ${Math.ceil(this.game.data.protectionTime)} 秒`, 540, 326, 315, 28, 14);
    }
    for (const [index, tier] of [1, 2, 3, 4].entries()) {
      const label = ['残旧', '精良', '稀有', '史诗'][index];
      this.button(`${label}武器`, 535 + index * 82, 384, 78, 'craft', `weapon:${tier}`, this.canCraft('weapon', tier));
      this.button(`${label}护具`, 535 + index * 82, 422, 78, 'craft', `armor:${tier}`, this.canCraft('armor', tier));
    }
  }

  private canCraft(kind: GearKind, tier: number): boolean {
    const material = kind === 'weapon' ? 'ore' : 'hide';
    return this.game.gearCount(kind) < this.game.data.capacity[kind] &&
      this.game.data.items.filter(item => item.kind === material && item.tier >= tier).length >= 3;
  }

  private renderStorage(): void {
    this.text('永久仓库', 540, 55, 250, 36, 22);
    this.button(`武器扩容 ${this.game.slotPrice('weapon')} 金币`, 540, 100, 160, 'buy', 'weapon', this.game.slotPrice('weapon') > 0 && this.game.data.gold >= this.game.slotPrice('weapon'));
    this.button(`护具扩容 ${this.game.slotPrice('armor')} 金币`, 710, 100, 160, 'buy', 'armor', this.game.slotPrice('armor') > 0 && this.game.data.gold >= this.game.slotPrice('armor'));
    this.list(this.game.data.items.filter(isGear), 540, 157, 'camp');
  }

  private renderPrepare(run: RunState): void {
    this.box(337, 55, 590, 445);
    this.text(`整备 · 安全箱 ${run.safeIds.length}/3`, 356, 66, 390, 40, 23, '#f4cc8d');
    this.text('仅可用道具、换装备及调整安全箱；此处不能锻造。', 355, 107, 500, 30, 13);
    this.list(run.bag, 355, 153, 'prepare');
    this.button('生命药剂', 355, 412, 110, 'item', 'hp');
    this.button('魔力药剂', 472, 412, 110, 'item', 'mp');
    this.button('继续战斗', 589, 412, 110, 'continue');
    this.button('挑战 Boss', 706, 412, 110, 'boss');
  }

  private renderResult(run: RunState): void {
    this.box(337, 55, 590, 445);
    this.text(run.success ? '撤退成功 · 战利品归仓' : '撤退失败 · 安全箱结算', 355, 69, 500, 40, 23, '#f4cc8d');
    if (!run.success) {
      this.text('随机武器和护具中选一件，占安全箱第 4 格。', 355, 112, 530, 30, 13);
      run.choices.forEach((item, index) => this.button(`${this.selectedChoice === index ? '✓ ' : ''}${itemName(item)}`, 355 + index * 180, 149, 170, 'choice', String(index)));
    } else {
      const unlock = this.game.pendingUnlock();
      if (unlock && !this.game.data.unlocked.includes(unlock)) this.text(`新难度解锁：${DIFFICULTIES[unlock].label}`, 355, 111, 480, 28, 16, '#e9ca88');
    }
    const retained = this.game.retainedItems(this.selectedChoice);
    this.list(retained, 355, run.success ? 142 : 200, 'result');
    const overflow = this.game.overflow(this.selectedChoice);
    if (overflow.weapon + overflow.armor) {
      this.text('仓库已满，出售旧装备或放弃箱内装备。', 355, 361, 520, 28, 13, '#e59e81');
      this.game.data.items.filter(isGear).slice(0, 3).forEach((item, index) => {
        this.text(itemName(item), 355, 393 + index * 27, 190, 25, 11);
        this.button('出售', 548, 393 + index * 27, 60, 'sell', item.id, true, 24);
      });
    }
    this.button('返回营地', 755, 446, 125, 'finish', '', (run.success || this.selectedChoice !== null) && !overflow.weapon && !overflow.armor);
  }

  private command(action: string, arg: string): void {
    if (this.confirmHome && !['cancelHome', 'confirmHome'].includes(action)) return;
    if (action === 'home') {
      this.homeWasPaused = this.paused; this.paused = true; this.confirmHome = true;
      this.keys.clear(); this.stick = { x: 0, y: 0 }; this.touchId = -1;
      this.game.persist();
    }
    if (action === 'cancelHome') { this.confirmHome = false; this.paused = this.homeWasPaused; }
    if (action === 'confirmHome' && this.game.abandonRun()) {
      this.confirmHome = false; this.paused = false; this.tab = 'map';
      this.selectedChoice = null; this.selectedGear = null; this.listPage = 0;
    }
    if (action === 'tab') { this.tab = arg as typeof this.tab; this.listPage = 0; }
    if (action === 'listPage') this.listPage += Number(arg);
    if (action === 'start') this.game.startRun(arg as Difficulty);
    if (action === 'buy') this.game.buySlot(arg as GearKind);
    if (action === 'equip') this.game.equipCamp(arg);
    if (action === 'sell') this.game.sellStashItem(arg);
    if (action === 'craft') {
      const [kind, tier] = arg.split(':');
      this.game.craft(kind as GearKind, Number(tier));
    }
    if (action === 'select') this.selectedGear = arg;
    if (action === 'luck') this.luck = !this.luck;
    if (action === 'quality') this.quality = !this.quality;
    if (action === 'forge') this.game.forge(arg, this.luck, this.quality);
    if (action === 'safe') this.game.toggleSafe(arg);
    if (action === 'equipRun') this.game.equipRun(arg);
    if (action === 'continue') this.game.continueRun();
    if (action === 'boss') this.game.challengeBoss();
    if (action === 'skill') this.game.cast(arg as 'aoe' | 'shield');
    if (action === 'item') this.game.useItem(arg as 'hp' | 'mp');
    if (action === 'choice') this.selectedChoice = Number(arg);
    if (action === 'sellRun') this.game.sellRunItem(arg);
    if (action === 'discardSafe') this.game.discardSafe(arg);
    if (action === 'finish' && this.game.finishResult(this.selectedChoice)) this.selectedChoice = null;
    if (action === 'pause') this.paused = !this.paused;
    this.renderUI();
  }

  private touchStart(event: EventTouch): void {
    const screen = event.getUILocation();
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(screen.x, screen.y));
    const x = local.x + W / 2, y = local.y + H / 2;
    if (!this.confirmHome && this.touchId === -1 && x < 230 && y < 230 && this.game.data.run?.phase === 'battle') {
      this.touchId = event.getID();
      this.touchMove(event);
    }
  }

  private touchMove(event: EventTouch): void {
    if (event.getID() !== this.touchId) return;
    const screen = event.getUILocation();
    const local = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(screen.x, screen.y));
    const dx = local.x + W / 2 - 105, dy = local.y + H / 2 - 105;
    const length = Math.max(45, Math.hypot(dx, dy));
    this.stick = { x: dx / length, y: -dy / length };
  }

  private touchEnd(event: EventTouch): void {
    if (event.getID() === this.touchId) {
      this.touchId = -1;
      this.stick = { x: 0, y: 0 };
    }
  }

  update(dt: number): void {
    const run = this.game.data.run;
    if (run && !this.paused) {
      const x = Number(this.keys.has(KeyCode.KEY_D) || this.keys.has(KeyCode.ARROW_RIGHT)) - Number(this.keys.has(KeyCode.KEY_A) || this.keys.has(KeyCode.ARROW_LEFT)) + this.stick.x;
      const y = Number(this.keys.has(KeyCode.KEY_S) || this.keys.has(KeyCode.ARROW_DOWN)) - Number(this.keys.has(KeyCode.KEY_W) || this.keys.has(KeyCode.ARROW_UP)) + this.stick.y;
      const magnitude = Math.max(1, Math.hypot(x, y));
      this.game.update(dt, { x: x / magnitude, y: y / magnitude });
      this.saveClock += dt;
      if (this.saveClock >= 5) { this.game.persist(); this.saveClock = 0; }
    } else if (!run && this.tab === 'forge') this.game.tickForge(dt);
    this.draw(run);
    this.uiClock += dt;
    const phase = run ? `${run.phase}:${run.wave}` : 'camp';
    if (this.uiClock >= 1 || phase !== this.lastPhase) {
      this.lastPhase = phase; this.uiClock = 0; this.renderUI();
    }
  }

  private rect(x: number, y: number, w: number, h: number, fill: string): void {
    this.art.fillColor = tint(fill);
    this.art.rect(x - W / 2, H / 2 - y - h, w, h);
    this.art.fill();
  }

  private draw(run: RunState | null): void {
    this.art.clear();
    for (const label of this.effectLabels) label.node.active = false;
    if (!run) return;
    for (const enemy of run.enemies) {
      const size = enemy.kind === 'boss' ? 58 : enemy.kind === 'elite' ? 33 : 24;
      const fill = MONSTERS[enemy.kind].color;
      this.rect(enemy.x - size / 2, enemy.y - size / 2, size, size, fill);
      this.rect(enemy.x - size / 4, enemy.y - size / 6, 5, 5, '#fff3c5');
      if (enemy.kind === 'boss' || enemy.kind === 'elite') {
        this.rect(enemy.x - size / 2, enemy.y - size / 2 - 9, size, 5, '#233133');
        this.rect(enemy.x - size / 2, enemy.y - size / 2 - 9, size * enemy.hp / enemy.maxHp, 5, '#e4b778');
      }
    }
    this.rect(run.x - 14, run.y - 17, 28, 33, '#e7ba89');
    this.rect(run.x - 14, run.y - 17, 28, 9, '#392c2a');
    this.rect(run.x - 10, run.y, 20, 16, run.shieldTime > 0 ? '#7bcac4' : '#4b8c76');
    for (const slash of this.game.slashes) {
      const color = tint('#349dff'); color.a = Math.round(255 * slash.ttl / COMBAT.slashSeconds);
      this.art.strokeColor = color; this.art.lineWidth = 14;
      for (let i = 0; i <= 24; i++) {
        const angle = slash.angle - COMBAT.meleeHalfAngle + i / 24 * COMBAT.meleeHalfAngle * 2;
        const x = slash.x + Math.cos(angle) * (COMBAT.meleeRange - 8) - W / 2;
        const y = H / 2 - slash.y - Math.sin(angle) * (COMBAT.meleeRange - 8);
        if (i === 0) this.art.moveTo(x, y); else this.art.lineTo(x, y);
      }
      this.art.stroke();
      this.art.strokeColor = tint('#b3e9ff'); this.art.lineWidth = 3;
      const angle = slash.angle + COMBAT.meleeHalfAngle * (1 - 2 * slash.ttl / COMBAT.slashSeconds);
      this.art.moveTo(slash.x - W / 2, H / 2 - slash.y);
      this.art.lineTo(slash.x + Math.cos(angle) * COMBAT.meleeRange - W / 2, H / 2 - slash.y - Math.sin(angle) * COMBAT.meleeRange);
      this.art.stroke();
    }
    this.game.coinTexts.forEach((coin, index) => {
      let label = this.effectLabels[index];
      if (!label) {
        const node = new Node('CoinReward'); node.parent = this.node; node.layer = this.node.layer;
        node.addComponent(UITransform).setContentSize(140, 30);
        label = node.addComponent(Label); label.fontSize = 18; label.lineHeight = 23;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        this.effectLabels.push(label);
      }
      label.node.active = true; label.node.setPosition(coin.x - W / 2, H / 2 - coin.y);
      label.string = `+${coin.amount} 金币`;
      const color = tint('#ffe477'); color.a = Math.round(255 * Math.min(1, coin.ttl * 3)); label.color = color;
    });
    this.rect(75, 450, 60, 60, '#516e65');
    this.rect(100 + this.stick.x * 18, 474 + this.stick.y * 18, 20, 20, '#c6e2cc');
  }

  private drawBackdrop(): void {
    this.rect(0, 0, W, H, '#1d352d');
    for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
      const noise = Math.abs(Math.sin(x * 127.1 + y * 311.7));
      this.rect(x * 30, y * 30, 30, 30, noise > 0.6 ? '#28443a' : '#234037');
    }
    this.rect(56, 40, 850, 15, '#697263');
    this.rect(56, 480, 850, 15, '#697263');
    this.rect(56, 40, 16, 455, '#697263');
    this.rect(890, 40, 16, 455, '#697263');
  }
}
