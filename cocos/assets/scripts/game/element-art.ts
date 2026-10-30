import type { ForgePainter } from './forge-art';
import type { RunState } from './types';
import { ELEMENT_COLORS } from './elements';

export function drawElementGrounds(p: ForgePainter, run: RunState): void {
  for (const pool of run.poisonGrounds ?? []) {
    p.circle(pool.x, pool.y, pool.radius, pool.friendly ? '#315a39' : '#4a512a');
    p.line(Array.from({ length: 25 }, (_, i) => [pool.x + Math.cos(i / 24 * Math.PI * 2) * pool.radius, pool.y + Math.sin(i / 24 * Math.PI * 2) * pool.radius]), pool.friendly ? '#83d577' : '#d1e45d', 2);
    for (let i=0; i<4; i++) { const a = i * 2.4 + pool.remaining; p.circle(pool.x+Math.cos(a)*pool.radius*.6,pool.y+Math.sin(a)*pool.radius*.6,2+Math.sin(pool.remaining*5+i), '#9ddd71'); }
  }
  for (const strike of run.earthStrikes ?? []) for (const spike of strike.spikes) {
    const age = strike.age - spike.delay;
    if (age < 0) { p.circle(spike.x,spike.y,6,'#937945'); continue; }
    if (age > .45) continue;
    const height = 28 * Math.min(1, age / .06) * Math.min(1,(.45-age)/.17);
    p.circle(spike.x,spike.y,spike.radius,'#635236');
    p.polygon([[spike.x-9,spike.y+5],[spike.x-2,spike.y-height],[spike.x+10,spike.y+5]],ELEMENT_COLORS.earth);
    p.line([[spike.x-2,spike.y-height],[spike.x+2,spike.y+3]],'#ffe9aa',2);
  }
}
export function drawElementStatuses(p: ForgePainter, run: RunState): void {
  for (const target of [run,...run.enemies]) {
    const s=target.status; if(!s) continue;
    if(s.stun>0) {
      p.line([[target.x-7,target.y-44],[target.x+3,target.y-44],[target.x-3,target.y-35],[target.x+7,target.y-35],[target.x-1,target.y-24]],ELEMENT_COLORS.thunder,3);
      p.line([[target.x-22,target.y-8],[target.x-27,target.y],[target.x-21,target.y+7]],ELEMENT_COLORS.thunder,2);
    }
    if(s.burns.length) for(let i=0;i<3;i++) {
      const x=target.x+(i-1)*10, y=target.y+15;
      const h=10+Math.sin(s.burns[0].remaining*12+i)*4;
      p.polygon([[x-5,y],[x,y-h],[x+5,y]],ELEMENT_COLORS.fire);
      p.polygon([[x-2,y],[x+1,y-h*.5],[x+3,y]],'#ffce68');
    }
  }
}
