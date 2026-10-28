import './style.css';
import { DIFFICULTIES, ITEM_LABELS, RULES, isGear, itemName, itemStat, salePrice, TIERS } from '../cocos/assets/scripts/game/config';
import { Game } from '../cocos/assets/scripts/game/game';
import { BrowserStorage } from '../cocos/assets/scripts/game/storage';
import type { Difficulty, GearKind, Item, ItemKind, RunState } from '../cocos/assets/scripts/game/types';
import { renderArena } from './render';

const game = new Game(new BrowserStorage());
game.grantForgeTestSupply();
const app = document.querySelector<HTMLDivElement>('#app')!;
let tab: 'map' | 'forge' | 'storage' = 'map';
let selectedGear: string | null = null;
let useLuck = false;
let useQuality = false;
let choiceIndex: number | null = null;
let paused = false;
let confirmHome = false;
let homeWasPaused = false;
let pointerId: number | null = null;
let stickX = 0;
let stickY = 0;
let elapsed = 0;
let saveTimer = 0;
let viewKey = '';
const held = new Set<string>();

app.innerHTML = `
  <div class="app-frame">
    <header class="app-header">
      <div class="brand"><span class="brand-mark">◆</span><div><strong>炉火远征</strong><small>FORGE EXPEDITION</small></div></div>
      <div class="header-note" id="header-note">锻造、冒险、成功撤退</div>
      <div class="header-chip" id="header-chip">本机存档</div>
    </header>
    <main class="game-window">
      <canvas id="arena" width="960" height="540" aria-label="战斗场地"></canvas>
      <div id="camp" class="screen"></div>
      <div id="battle-ui" class="battle-ui" hidden>
        <div class="hud hud-top-left">
          <div class="hud-eyebrow" id="hud-difficulty"></div>
          <div class="hud-head"><strong id="hud-wave"></strong><span id="hud-time"></span></div>
          <div class="resource hp"><span>HP</span><div><i id="hp-fill"></i></div><b id="hp-text"></b></div>
          <div class="resource mp"><span>MP</span><div><i id="mp-fill"></i></div><b id="mp-text"></b></div>
        </div>
        <div class="hud hud-top-right"><span id="hud-gold"></span><span id="hud-loot"></span><button data-action="pause" title="暂停">Ⅱ</button><button data-action="home">回到主页</button></div>
        <div class="wave-message" id="wave-message"></div>
        <div class="joystick" id="joystick" aria-label="移动摇杆"><div class="joystick-ring"><div id="stick" class="stick"></div></div></div>
        <div class="battle-actions">
          <button class="skill skill-aoe" data-action="aoe" title="火环：20 MP，冷却8秒"><span class="skill-icon">✹</span><span id="aoe-label">火环</span></button>
          <button class="skill skill-shield" data-action="shield" title="护盾：25 MP，冷却15秒"><span class="skill-icon">◇</span><span id="shield-label">护盾</span></button>
          <button class="potion" data-action="use-hp" title="生命药剂 +35"><span>＋</span><b id="hp-count">0</b></button>
          <button class="potion potion-mp" data-action="use-mp" title="魔力药剂 +30"><span>✦</span><b id="mp-count">0</b></button>
        </div>
      </div>
      <div id="modal" class="modal-layer" hidden></div>
      <div class="orientation-warning">请将手机横过来，获得完整战斗视野。</div>
    </main>
    <footer class="app-footer"><span>移动 WASD / 方向键 · 技能 Q / E · 药剂 1 / 2</span><span>原创像素风格 · 进度保存在当前浏览器</span></footer>
  </div>`;

const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const camp = document.querySelector<HTMLDivElement>('#camp')!;
const battleUi = document.querySelector<HTMLDivElement>('#battle-ui')!;
const modal = document.querySelector<HTMLDivElement>('#modal')!;
const joystick = document.querySelector<HTMLDivElement>('#joystick')!;
const stick = document.querySelector<HTMLDivElement>('#stick')!;

function itemCounts(items: Item[]): string {
  const counts = new Map<string, number>();
  for (const item of items.filter(item => !isGear(item))) {
    const key = `${item.kind}:${item.tier}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [kind, tier] = key.split(':') as [ItemKind, string];
    return `<span class="resource-chip">${TIERS[Number(tier) - 1]}${ITEM_LABELS[kind]} <b>×${count}</b></span>`;
  }).join('') || '<span class="muted">暂无材料或道具</span>';
}

function gearCard(item: Item, actions = ''): string {
  const stat = item.kind === 'weapon' ? '攻击' : '防御';
  return `<div class="gear-card tier-${item.tier}">
    <div class="gear-glyph">${item.kind === 'weapon' ? '⚔' : '▣'}</div>
    <div class="gear-info"><strong>${itemName(item)}</strong><small>${stat} ${itemStat(item)} · 已锻造 ${item.attempts} 次</small></div>
    ${actions}
  </div>`;
}

function mapPanel(): string {
  const stages: { id: Difficulty; description: string; loot: string }[] = [
    { id: 'tutorial', description: '三波短教学 · 约 3–5 分钟', loot: '熟悉移动、技能与结算' },
    { id: 'normal', description: '十波求生 · 可提前挑战 Boss', loot: '基础材料与精良装备' },
    { id: 'hard', description: '更快的怪潮与精英敌人', loot: '稀有材料与装备' },
    { id: 'nightmare', description: '完整十波的终极考验', loot: '史诗材料与装备' },
  ];
  return `<div class="panel-intro"><div><span class="eyebrow">冒险地图 · 灰烬庭院</span><h2>进入怪潮</h2><p>撑过倒计时，收集材料。第 3、6、9 波整备时可提前挑战 Boss。</p></div><div class="hero-emblem">⚒</div></div>
    <div class="difficulty-grid">${stages.map((stage, index) => {
      const unlocked = game.data.unlocked.includes(stage.id);
      return `<article class="difficulty-card ${unlocked ? '' : 'locked'}">
        <div class="difficulty-top"><span class="stage-index">0${index + 1}</span><span class="${unlocked ? 'available' : 'muted'}">${unlocked ? '已解锁' : '未解锁'}</span></div>
        <h3>${DIFFICULTIES[stage.id].label}</h3><p>${stage.description}</p><small>${stage.loot}</small>
        <button data-action="start" data-value="${stage.id}" ${unlocked ? '' : 'disabled'}>${unlocked ? '开始冒险 →' : '完成前置难度'}</button>
      </article>`;
    }).join('')}</div><div class="map-hint">教学局不可跳过。普通难度提前通关可解锁困难；困难必须完整通关十波才能解锁噩梦。</div>`;
}

function forgePanel(): string {
  const gear = game.data.items.filter(isGear);
  const selected = gear.find(item => item.id === selectedGear) ?? gear[0];
  if (selected && selectedGear !== selected.id) selectedGear = selected.id;
  const stock = game.data.items.filter(item => item.kind === (selected?.kind === 'armor' ? 'hide' : 'ore') && item.tier >= (selected?.tier ?? 1)).length;
  const hasLuck = game.data.items.some(item => item.kind === 'luck');
  const hasQuality = game.data.items.some(item => item.kind === 'quality');
  const odds = selected ? game.forgeOdds(selected, useLuck && hasLuck) : null;
  const probability = odds ? [
    ['损坏', odds.break, 'danger'], ['降质', odds.downgrade, 'bad'], ['不变', odds.same, 'neutral'], ['升级', odds.upgrade, 'good'],
  ].map(([label, value, color]) => `<div class="odds-row"><span>${label}</span><div class="odds-track"><i class="${color}" style="width:${value}%"></i></div><b>${value}%</b></div>`).join('') : '';
  return `<div class="section-heading"><div><span class="eyebrow">局外营地 · 炉心工坊</span><h2>锻造台</h2><p>每次操作都会增加风险。查看概率后决定继续，或带着现有装备离开。</p></div></div>
    <div class="forge-layout">
      <div class="panel-box"><h3>装备清单</h3><div class="gear-list">${gear.length ? gear.map(item => gearCard(item, `<button class="small ${selected?.id === item.id ? 'selected' : ''}" data-action="select-gear" data-value="${item.id}">选择</button>`)).join('') : '<p class="muted">没有可锻造的装备。先用材料打造一件。</p>'}</div>
        <div class="craft-recipes">${(['weapon', 'armor'] as GearKind[]).flatMap(kind => [1, 2, 3, 4].map(tier => {
          const material = kind === 'weapon' ? 'ore' : 'hide';
          const count = game.data.items.filter(item => item.kind === material && item.tier >= tier).length;
          return `<div class="craft-row"><span>${TIERS[tier - 1]}${ITEM_LABELS[kind]}</span><button data-action="craft" data-value="${kind}:${tier}" ${count < 3 || game.gearCount(kind) >= game.data.capacity[kind] ? 'disabled' : ''}>材料 3 / ${count}</button></div>`;
        })).join('')}</div>
      </div>
      <div class="panel-box forge-focus">${selected ? `<div class="forge-selected"><div class="forge-anvil">${selected.kind === 'weapon' ? '⚔' : '▣'}</div><div><span class="eyebrow">当前装备</span><h3>${itemName(selected)}</h3><p>${selected.kind === 'weapon' ? '攻击' : '防御'} ${itemStat(selected)} · 品质 ${selected.tier}/4 · 强化 ${selected.level}/10</p></div></div>
        <div class="odds-list">${probability}</div><div class="forge-options">
          <label><input type="checkbox" data-action="luck" ${useLuck ? 'checked' : ''} ${hasLuck ? '' : 'disabled'}> 幸运粉尘 <small>升级概率 +10%</small></label>
          <label><input type="checkbox" data-action="quality" ${useQuality ? 'checked' : ''} ${hasQuality && selected.tier < 4 ? '' : 'disabled'}> 精炼晶核 <small>升级时品质 +1</small></label>
        </div><button class="primary forge-button" data-action="forge" data-value="${selected.id}" ${stock ? '' : 'disabled'}>继续锻造 <span>消耗 1 份对应材料 · 现有 ${stock}</span></button>` : '<div class="empty-state">选择装备开始锻造。</div>'}
        <div class="forge-meter"><div><span>锻造值 ${game.data.forgeMeter}/100</span><b id="protect-time">${game.data.protectionTime > 0 ? `不损坏 ${Math.ceil(game.data.protectionTime)} 秒` : '累计至 100 开启保护'}</b></div><div class="meter-track"><i style="width:${game.data.forgeMeter}%"></i></div></div>
      </div>
    </div><div class="inventory-strip">${itemCounts(game.data.items)}</div>`;
}

function storagePanel(): string {
  return `<div class="section-heading"><div><span class="eyebrow">永久存档 · 装备仓库</span><h2>仓库与收藏</h2><p>带回的装备永久保留；仓库容量分别扩充至 20 格。</p></div><div class="gold-total">◆ ${game.data.gold} 金币</div></div>
    <div class="storage-grid">${(['weapon', 'armor'] as GearKind[]).map(kind => {
      const gear = game.data.items.filter(item => item.kind === kind);
      const equipped = kind === 'weapon' ? game.data.weaponId : game.data.armorId;
      const price = game.slotPrice(kind);
      return `<div class="panel-box"><div class="storage-head"><div><h3>${kind === 'weapon' ? '武器收藏' : '护具收藏'}</h3><span>${gear.length} / ${game.data.capacity[kind]} 格</span></div><button data-action="buy" data-value="${kind}" ${price && game.data.gold >= price ? '' : 'disabled'}>${price ? `扩容 · ${price} 金币` : '已达上限'}</button></div>
        <div class="gear-list">${gear.length ? gear.map(item => gearCard(item, `<div class="gear-actions"><button class="small ${equipped === item.id ? 'selected' : ''}" data-action="equip-camp" data-value="${item.id}">${equipped === item.id ? '已装备' : '装备'}</button><button class="small ghost" data-action="sell-stash" data-value="${item.id}">售 ${salePrice(item)}</button></div>`)).join('') : '<p class="muted">暂无装备</p>'}</div></div>`;
    }).join('')}</div><div class="inventory-strip">${itemCounts(game.data.items)}</div>`;
}

function renderCamp(): void {
  camp.innerHTML = `<div class="camp-shell"><nav class="camp-nav"><div class="nav-title">营地</div>
    <button data-action="tab" data-value="map" class="${tab === 'map' ? 'active' : ''}"><span>◈</span>冒险地图</button>
    <button data-action="tab" data-value="forge" class="${tab === 'forge' ? 'active' : ''}"><span>⚒</span>锻造台</button>
    <button data-action="tab" data-value="storage" class="${tab === 'storage' ? 'active' : ''}"><span>▣</span>仓库</button>
    <div class="nav-foot"><b>灰烬庭院</b><small>首张地图 · 单人冒险</small></div></nav>
    <section class="camp-content">${tab === 'map' ? mapPanel() : tab === 'forge' ? forgePanel() : storagePanel()}</section></div>`;
}

function renderPrepare(run: RunState): void {
  const safe = new Set(run.safeIds);
  const sorted = [...run.bag].sort((a, b) => Number(isGear(b)) - Number(isGear(a)) || b.tier - a.tier);
  modal.innerHTML = `<div class="dialog prepare-dialog"><div class="dialog-head"><div><span class="eyebrow">第 ${run.wave} 波已完成</span><h2>整备时间 <span id="prepare-time">${Math.ceil(run.secondsLeft)} 秒</span></h2><p>使用道具、更换装备，或调整安全箱。这里不能锻造。</p></div><div class="prep-status">HP ${Math.ceil(run.hp)} <span>·</span> MP ${Math.ceil(run.mp)}</div></div>
    <div class="prep-actions"><button data-action="use-hp">生命药剂 +35 (${run.bag.filter(item => item.kind === 'hp').length})</button><button data-action="use-mp">魔力药剂 +30 (${run.bag.filter(item => item.kind === 'mp').length})</button><span>安全箱 ${run.safeIds.length}/3</span></div>
    <div class="prep-list">${sorted.map(item => `<div class="prep-item"><div class="item-symbol ${isGear(item) ? `tier-${item.tier}` : ''}">${item.kind === 'weapon' ? '⚔' : item.kind === 'armor' ? '▣' : '◆'}</div><div><strong>${itemName(item)}</strong><small>${isGear(item) ? `${item.kind === 'weapon' ? '攻击' : '防御'} ${itemStat(item)}` : '可带入安全箱'}</small></div><div class="prep-item-actions">${isGear(item) ? `<button data-action="equip-run" data-value="${item.id}" class="small ${run.weaponId === item.id || run.armorId === item.id ? 'selected' : ''}">${run.weaponId === item.id || run.armorId === item.id ? '使用中' : '装备'}</button>` : ''}<button data-action="safe" data-value="${item.id}" class="small ${safe.has(item.id) ? 'selected' : ''}">${safe.has(item.id) ? '已保护' : '入箱'}</button></div></div>`).join('')}</div>
    <div class="dialog-foot"><p>失败时保留箱内三件，再从随机武器与护具中选一件。</p><div><button data-action="continue">继续战斗</button><button class="primary" data-action="boss">提前挑战 Boss</button></div></div></div>`;
}

function renderResult(run: RunState): void {
  const retained = game.retainedItems(choiceIndex);
  const overflow = game.overflow(choiceIndex);
  const gear = retained.filter(isGear);
  const surplus = overflow.weapon + overflow.armor;
  const unlock = game.pendingUnlock();
  modal.innerHTML = `<div class="dialog result-dialog"><div class="dialog-head"><div><span class="eyebrow">${run.success ? '撤退成功' : '撤退失败'}</span><h2>${run.success ? '战利品已收集' : '从灰烬中带走火种'}</h2><p>${run.success ? `${run.bossEarly ? '提前击败 Boss' : run.difficulty === 'tutorial' ? '教学完成' : '完整通关'} · 奖励金币 ${run.lootGold}` : `已完成 ${run.completedWaves} 波 · 仅保留安全箱物品与一件随机装备`}</p></div><div class="result-seal">${run.success ? '✓' : '✕'}</div></div>
    ${unlock && !game.data.unlocked.includes(unlock) ? `<div class="unlock-callout">新难度解锁：${DIFFICULTIES[unlock].label}</div>` : ''}
    ${!run.success ? `<div class="choice-grid">${run.choices.map((item, index) => `<button class="choice-card ${choiceIndex === index ? 'chosen' : ''}" data-action="choice" data-value="${index}"><span>${item.kind === 'weapon' ? '⚔ 武器' : '▣ 护具'}</span><strong>${itemName(item)}</strong><small>${item.kind === 'weapon' ? '攻击' : '防御'} ${itemStat(item)}</small></button>`).join('')}</div><h3>安全箱保留</h3>` : '<h3>装备战利品</h3>'}
    <div class="result-list">${gear.length ? gear.map(item => gearCard(item, run.success ? `<button class="small ghost" data-action="sell-run" data-value="${item.id}">售 ${salePrice(item)}</button>` : run.safeIds.includes(item.id) ? `<button class="small ghost" data-action="discard-safe" data-value="${item.id}">放弃</button>` : '')).join('') : '<span class="muted">没有装备</span>'}</div>
    <div class="inventory-strip result-items">${itemCounts(retained)}</div>
    ${surplus ? `<div class="overflow-alert">仓库还需腾出 ${surplus} 个装备格。${run.success ? '可出售本局装备。' : '可放弃安全箱装备，或出售仓库旧装备。'}</div><div class="result-list stash-overflow">${game.data.items.filter(isGear).map(item => gearCard(item, `<button class="small ghost" data-action="sell-stash" data-value="${item.id}">售 ${salePrice(item)}</button>`)).join('')}</div>` : ''}
    <div class="dialog-foot"><p>${run.success ? '材料与道具会一同入库。' : '未入箱的本局物品与金币将丢失。'}</p><button class="primary" data-action="finish" ${!run.success && choiceIndex === null ? 'disabled' : ''}>返回营地 →</button></div></div>`;
}

function refresh(): void {
  const run = game.data.run;
  const inCamp = !run;
  camp.hidden = !inCamp;
  battleUi.hidden = inCamp || run?.phase === 'result';
  modal.hidden = inCamp || (!confirmHome && run?.phase === 'battle' && !paused);
  document.querySelector<HTMLElement>('#header-chip')!.textContent = inCamp ? `◆ ${game.data.gold} 金币` : DIFFICULTIES[run!.difficulty].label;
  document.querySelector<HTMLElement>('#header-note')!.textContent = inCamp ? '锻造、冒险、成功撤退' : `灰烬庭院 · ${run!.phase === 'battle' ? '怪潮来袭' : run!.phase === 'prepare' ? '整备中' : '结算'}`;
  if (inCamp) renderCamp();
  else if (confirmHome) modal.innerHTML = '<div class="dialog pause-dialog"><h2>确认放弃本局？</h2><p>全部随身道具、武器、护具及本局金币永久丢失，安全箱不保留。营地仓库不受影响。</p><button data-action="cancel-home">取消</button><button data-action="confirm-home">确认放弃并回到主页</button></div>';
  else if (paused) modal.innerHTML = '<div class="dialog pause-dialog"><h2>游戏已暂停</h2><p>进度已保存，可以稍后继续。</p><button class="primary" data-action="resume">继续战斗</button></div>';
  else if (run!.phase === 'prepare') renderPrepare(run!);
  else if (run!.phase === 'result') renderResult(run!);
  viewKey = `${run?.phase ?? 'camp'}:${run?.wave ?? 0}:${paused}`;
}

function action(action: string, value: string): void {
  const run = game.data.run;
  if (confirmHome && !['cancel-home', 'confirm-home'].includes(action)) return;
  if (action === 'home' && run && run.phase !== 'result') {
    homeWasPaused = paused; paused = true; confirmHome = true;
    held.clear(); stickX = stickY = 0; pointerId = null; game.persist();
  }
  else if (action === 'cancel-home') { confirmHome = false; paused = homeWasPaused; }
  else if (action === 'confirm-home' && game.abandonRun()) {
    confirmHome = false; paused = false; tab = 'map'; choiceIndex = null; selectedGear = null;
  }
  else if (action === 'tab') tab = value as typeof tab;
  else if (action === 'start') { if (game.startRun(value as Difficulty)) { choiceIndex = null; paused = false; } }
  else if (action === 'select-gear') selectedGear = value;
  else if (action === 'luck') useLuck = !useLuck;
  else if (action === 'quality') useQuality = !useQuality;
  else if (action === 'craft') { const [kind, tier] = value.split(':'); game.craft(kind as GearKind, Number(tier)); }
  else if (action === 'forge') {
    game.forge(value, useLuck, useQuality);
    if (!game.data.items.some(item => item.kind === 'luck')) useLuck = false;
    if (!game.data.items.some(item => item.kind === 'quality')) useQuality = false;
  }
  else if (action === 'buy') game.buySlot(value as GearKind);
  else if (action === 'equip-camp') game.equipCamp(value);
  else if (action === 'sell-stash') game.sellStashItem(value);
  else if (action === 'equip-run') game.equipRun(value);
  else if (action === 'safe') game.toggleSafe(value);
  else if (action === 'use-hp') game.useItem('hp');
  else if (action === 'use-mp') game.useItem('mp');
  else if (action === 'aoe') game.cast('aoe');
  else if (action === 'shield') game.cast('shield');
  else if (action === 'continue') game.continueRun();
  else if (action === 'boss') game.challengeBoss();
  else if (action === 'choice') choiceIndex = Number(value);
  else if (action === 'sell-run') game.sellRunItem(value);
  else if (action === 'discard-safe') game.discardSafe(value);
  else if (action === 'finish') { if (game.finishResult(choiceIndex)) { tab = 'map'; selectedGear = null; choiceIndex = null; } }
  else if (action === 'pause' && run?.phase === 'battle') { paused = true; game.persist(); }
  else if (action === 'resume') paused = false;
  refresh();
}

app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!button || button.hasAttribute('disabled')) return;
  action(button.dataset.action!, button.dataset.value ?? '');
});

function moveStick(event: PointerEvent): void {
  const rect = joystick.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const limit = rect.width * 0.31;
  const size = Math.max(limit, Math.hypot(dx, dy));
  stickX = dx / size;
  stickY = dy / size;
  stick.style.transform = `translate(${stickX * limit}px, ${stickY * limit}px)`;
}
joystick.addEventListener('pointerdown', event => { if (pointerId !== null || paused) return; event.preventDefault(); pointerId = event.pointerId; joystick.setPointerCapture(pointerId); moveStick(event); });
joystick.addEventListener('pointermove', event => { if (pointerId === event.pointerId) moveStick(event); });
const stopStick = (event: PointerEvent) => { if (pointerId === event.pointerId) { pointerId = null; stickX = 0; stickY = 0; stick.style.transform = ''; } };
joystick.addEventListener('pointerup', stopStick);
joystick.addEventListener('pointercancel', stopStick);
joystick.addEventListener('lostpointercapture', stopStick);

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (confirmHome) return;
  if (!event.repeat && game.data.run?.phase === 'battle' && !paused) {
    if (key === 'q') game.cast('aoe');
    if (key === 'e') game.cast('shield');
    if (key === '1') game.useItem('hp');
    if (key === '2') game.useItem('mp');
    if (key === 'escape') { paused = true; refresh(); }
  } else if (key === 'escape' && paused) { paused = false; refresh(); }
  held.add(key);
});
window.addEventListener('keyup', event => held.delete(event.key.toLowerCase()));
function suspendForMobile(): void {
  held.clear(); stickX = stickY = 0; pointerId = null; stick.style.transform = '';
  if (game.data.run && game.data.run.phase !== 'result') paused = true;
  game.persist(); refresh();
}
window.addEventListener('blur', suspendForMobile);
window.addEventListener('pagehide', suspendForMobile);
document.addEventListener('visibilitychange', () => { if (document.hidden) suspendForMobile(); });
const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
portrait.addEventListener('change', () => { if (portrait.matches) suspendForMobile(); });


function updateHud(run: RunState): void {
  document.querySelector<HTMLElement>('#hud-difficulty')!.textContent = DIFFICULTIES[run.difficulty].label + ' · 灰烬庭院';
  document.querySelector<HTMLElement>('#hud-wave')!.textContent = run.difficulty === 'tutorial' ? `教学 ${run.wave}/3` : run.wave === 10 ? '最终 Boss' : `第 ${run.wave}/10 波`;
  document.querySelector<HTMLElement>('#hud-time')!.textContent = `${Math.max(0, Math.ceil(run.secondsLeft))}s`;
  document.querySelector<HTMLElement>('#hp-fill')!.style.width = `${run.hp / RULES.maxHp * 100}%`;
  document.querySelector<HTMLElement>('#mp-fill')!.style.width = `${run.mp / RULES.maxMp * 100}%`;
  document.querySelector<HTMLElement>('#hp-text')!.textContent = `${Math.ceil(run.hp)}/${RULES.maxHp}`;
  document.querySelector<HTMLElement>('#mp-text')!.textContent = `${Math.ceil(run.mp)}/${RULES.maxMp}`;
  document.querySelector<HTMLElement>('#hud-gold')!.textContent = `◆ ${run.lootGold}`;
  document.querySelector<HTMLElement>('#hud-loot')!.textContent = `背包 ${run.bag.length} 件`;
  document.querySelector<HTMLElement>('#aoe-label')!.textContent = run.aoeCooldown > 0 ? `${Math.ceil(run.aoeCooldown)}s` : '火环';
  document.querySelector<HTMLElement>('#shield-label')!.textContent = run.shieldCooldown > 0 ? `${Math.ceil(run.shieldCooldown)}s` : '护盾';
  document.querySelector<HTMLElement>('#hp-count')!.textContent = `${run.bag.filter(item => item.kind === 'hp').length}`;
  document.querySelector<HTMLElement>('#mp-count')!.textContent = `${run.bag.filter(item => item.kind === 'mp').length}`;
  document.querySelector<HTMLElement>('#wave-message')!.textContent = game.messages[0] ?? '';
}

let lastFrame = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  elapsed += dt;
  if (!document.hidden) {
    const run = game.data.run;
    if (run && !paused && !portrait.matches) {
      const x = Number(held.has('d') || held.has('arrowright')) - Number(held.has('a') || held.has('arrowleft')) + stickX;
      const y = Number(held.has('s') || held.has('arrowdown')) - Number(held.has('w') || held.has('arrowup')) + stickY;
      const size = Math.max(1, Math.hypot(x, y));
      game.update(dt, { x: x / size, y: y / size });
      saveTimer += dt;
      if (saveTimer >= 5) { game.persist(); saveTimer = 0; }
    } else if (!run && tab === 'forge' && !portrait.matches) game.tickForge(dt);
  }
  const run = game.data.run;
  renderArena(canvas, run, elapsed, game);
  if (run) updateHud(run);
  const currentKey = `${run?.phase ?? 'camp'}:${run?.wave ?? 0}:${paused}`;
  if (viewKey !== currentKey) refresh();
  const prepareTime = document.querySelector<HTMLElement>('#prepare-time');
  if (prepareTime && run?.phase === 'prepare') prepareTime.textContent = `${Math.ceil(run.secondsLeft)} 秒`;
  const protectTime = document.querySelector<HTMLElement>('#protect-time');
  if (protectTime) protectTime.textContent = game.data.protectionTime > 0 ? `不损坏 ${Math.ceil(game.data.protectionTime)} 秒` : '累计至 100 开启保护';
  requestAnimationFrame(frame);
}

refresh();
requestAnimationFrame(frame);
