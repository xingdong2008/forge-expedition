import type { Game } from '../cocos/assets/scripts/game/game';
import { ARENA, COMBAT } from '../cocos/assets/scripts/game/config';
import type { Enemy, RunState } from '../cocos/assets/scripts/game/types';

const HERO = [
  '...hhhhh...', '..hssshhh..', '..hssshhh..', '...fffff...', '..fwwwwf..', '.ffwwwwff.', '.fwwwwwwf.',
  '..fwwwwf..', '..fbbbbf..', '...b..b....', '..bb..bb...',
];
const GRUNT = ['..gggg..', '.ggccgg.', 'ggccccgg', 'gcrccrcg', 'ggccccgg', '.gmmmmg.', '..m..m..'];
const RANGER = ['..vvvv..', '.vvccvv.', 'vvccccvv', 'vcyccycv', 'vvccccvv', '.vmmmmv.', '..m..m..'];
const CHARGER = ['..rrrr..', '.rrccrr.', 'rrccccrr', 'rcrccrcr', 'rrccccrr', '.rmmmmr.', '..m..m..'];
const ELITE = ['..eeee..', '.eeffee.', 'eeffffee', 'eeyffyee', 'eeffffee', '.emmmme.', '..m..m..'];
const BOSS = [
  '...bbbbbbbb...', '..bbrrrrrrbb..', '.bbrrrrrrrrbb.', 'bbrrrffffrrrbb', 'brrrffffffrrrb',
  'brrffyffyffrrb', 'brrffffffffrrb', 'brrrffffffrrrb', 'bbrrrrrrrrrrbb', '.bbrrrrrrrrbb.',
  '..bbmmmmmmmbb.', '...mm....mm...', '..mmm....mmm..',
];

const PALETTE: Record<string, string> = {
  h: '#342a30', s: '#e2a879', f: '#d2b28a', w: '#376b67', b: '#27383c',
  g: '#5b9360', c: '#bddb9a', r: '#d76b52', v: '#7e70ab', e: '#c88b41',
  m: '#243a3b', y: '#fff2a3',
};

function pixelSprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, scale: number): void {
  const width = rows[0].length * scale;
  const height = rows.length * scale;
  const left = Math.round(x - width / 2);
  const top = Math.round(y - height / 2);
  ctx.fillStyle = 'rgba(8, 20, 21, .3)';
  ctx.fillRect(left + scale, top + height - scale, width - scale * 2, scale * 2);
  rows.forEach((row, rowIndex) => {
    [...row].forEach((part, colIndex) => {
      if (part === '.') return;
      ctx.fillStyle = PALETTE[part] ?? '#ffffff';
      ctx.fillRect(left + colIndex * scale, top + rowIndex * scale, scale, scale);
    });
  });
}

function hash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function backdrop(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.fillStyle = '#1c332e';
  ctx.fillRect(0, 0, 960, 540);
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 32; x++) {
      const n = hash(x, y);
      ctx.fillStyle = n > 0.6 ? '#28443a' : n > 0.24 ? '#234037' : '#203a33';
      ctx.fillRect(x * 30, y * 30, 30, 30);
      if (n > 0.87) {
        ctx.fillStyle = '#65845c';
        ctx.fillRect(x * 30 + 7, y * 30 + 12, 3, 8);
        ctx.fillRect(x * 30 + 12, y * 30 + 8, 3, 6);
      } else if (n < 0.09) {
        ctx.fillStyle = '#74837b';
        ctx.fillRect(x * 30 + 10, y * 30 + 15, 10, 4);
      }
    }
  }
  ctx.fillStyle = '#3c493d';
  ctx.fillRect(ARENA.left - 18, ARENA.top - 16, ARENA.right - ARENA.left + 36, 15);
  ctx.fillRect(ARENA.left - 18, ARENA.bottom + 1, ARENA.right - ARENA.left + 36, 16);
  ctx.fillRect(ARENA.left - 18, ARENA.top - 16, 16, ARENA.bottom - ARENA.top + 33);
  ctx.fillRect(ARENA.right + 2, ARENA.top - 16, 16, ARENA.bottom - ARENA.top + 33);
  ctx.fillStyle = '#788169';
  for (let x = ARENA.left - 18; x <= ARENA.right + 2; x += 31) {
    ctx.fillRect(x, ARENA.top - 16, 2, 15);
    ctx.fillRect(x, ARENA.bottom + 1, 2, 16);
  }
  for (let y = ARENA.top - 16; y <= ARENA.bottom + 1; y += 30) {
    ctx.fillRect(ARENA.left - 18, y, 16, 2);
    ctx.fillRect(ARENA.right + 2, y, 16, 2);
  }
  for (const [x, y] of [[115, 95], [836, 95], [115, 440], [836, 440]]) {
    ctx.fillStyle = '#624b32';
    ctx.fillRect(x - 10, y - 12, 20, 24);
    ctx.fillStyle = `rgba(255, 174, 80, ${0.72 + Math.sin(time * 6 + x) * 0.12})`;
    ctx.fillRect(x - 6, y - 21, 12, 13);
    ctx.fillStyle = '#ffe7a0';
    ctx.fillRect(x - 2, y - 19, 4, 8);
  }
  ctx.fillStyle = 'rgba(8, 20, 18, .26)';
  ctx.fillRect(ARENA.left + 60, ARENA.top + 65, 160, 4);
  ctx.fillRect(ARENA.right - 208, ARENA.bottom - 75, 160, 4);
}

function enemySprite(ctx: CanvasRenderingContext2D, enemy: Enemy): void {
  const rows = enemy.kind === 'boss' ? BOSS : enemy.kind === 'elite' ? ELITE : enemy.kind === 'ranger' ? RANGER : enemy.kind === 'charger' ? CHARGER : GRUNT;
  const scale = enemy.kind === 'boss' ? 5 : enemy.kind === 'elite' ? 5 : 4;
  pixelSprite(ctx, rows, enemy.x, enemy.y, scale);
  if (enemy.kind === 'elite' || enemy.kind === 'boss') {
    const width = enemy.kind === 'boss' ? 84 : 40;
    ctx.fillStyle = '#1a2527';
    ctx.fillRect(enemy.x - width / 2, enemy.y - (enemy.kind === 'boss' ? 47 : 27), width, 6);
    ctx.fillStyle = enemy.kind === 'boss' ? '#e8815c' : '#e7be76';
    ctx.fillRect(enemy.x - width / 2 + 1, enemy.y - (enemy.kind === 'boss' ? 46 : 26), (width - 2) * Math.max(0, enemy.hp / enemy.maxHp), 4);
  }
}

export function renderArena(canvas: HTMLCanvasElement, run: RunState | null, time: number, effects: Pick<Game, 'slashes' | 'coinTexts'>): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  backdrop(ctx, time);
  if (!run) {
    ctx.fillStyle = 'rgba(8, 15, 18, .32)';
    ctx.fillRect(0, 0, 960, 540);
    return;
  }
  if (run.shieldTime > 0) {
    ctx.strokeStyle = '#8fdad0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(run.x, run.y, 36 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const enemy of run.enemies) enemySprite(ctx, enemy);
  pixelSprite(ctx, HERO, run.x, run.y, 4);
  for (const slash of effects.slashes) {
    ctx.save();
    ctx.globalAlpha = slash.ttl / COMBAT.slashSeconds;
    ctx.strokeStyle = '#349dff'; ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.arc(slash.x, slash.y, COMBAT.meleeRange - 8, slash.angle - COMBAT.meleeHalfAngle, slash.angle + COMBAT.meleeHalfAngle);
    ctx.stroke();
    ctx.strokeStyle = '#b3e9ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  for (const coin of effects.coinTexts) {
    ctx.save(); ctx.globalAlpha = Math.min(1, coin.ttl * 3);
    ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#182b24'; ctx.fillStyle = '#ffe477';
    ctx.strokeText(`+${coin.amount} 金币`, coin.x, coin.y);
    ctx.fillText(`+${coin.amount} 金币`, coin.x, coin.y); ctx.restore();
  }
  if (run.phase === 'result') {
    ctx.fillStyle = 'rgba(7, 16, 18, .46)';
    ctx.fillRect(0, 0, 960, 540);
  }
}
