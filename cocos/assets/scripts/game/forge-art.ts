import type { WeaponKind } from './types';

/** Shared procedural workshop artwork. Coordinates use a 600 × 260 stage. */
export interface ForgePainter {
  polygon(points: number[][], color: string): void;
  circle(x: number, y: number, radius: number, color: string): void;
  line(points: number[][], color: string, width: number): void;
}
export const FORGE_ANIMATION_SECONDS = 0.9;
export function drawForgeWorkshop(p: ForgePainter, kind: WeaponKind | 'armor', remaining: number, color = '#ffe1a0'): void {
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    const left=Math.max(0,x), right=Math.min(600,x+w);
    if(right>left) p.polygon([[left,y],[right,y],[right,y+h],[left,y+h]],c);
  };
  rect(0,0,600,260,'#201d20');
  for (let row=0;row<6;row++) for(let col=0;col<12;col++) {
    const x=col*56-(row%2)*28;
    rect(x,row*35,53,32,(row+col)%3 ? '#302b2b' : '#3b3230');
  }
  rect(0,218,600,42,'#302522');
  for(let i=1;i<9;i++) p.line([[i*70,221],[i*70-35,260]],'#4a3630',2);
  // Masonry furnace and blazing mouth.
  p.polygon([[44,215],[44,104],[72,80],[72,14],[136,14],[136,80],[164,104],[164,215]],'#60534b');
  rect(83,14,42,67,'#403b3b');
  p.polygon([[57,213],[57,128],[75,105],[133,105],[151,128],[151,213]],'#211a1a');
  p.circle(104,166,40,'#9e3927');
  p.polygon([[66,198],[73,156],[89,172],[101,126],[114,162],[133,144],[142,198]],'#f17835');
  p.polygon([[82,199],[94,170],[103,146],[111,178],[126,167],[127,199]],'#ffcf65');
  rect(51,204,108,14,'#83705c');
  for(let i=0;i<4;i++) rect(50,111+i*27,13,20,'#897765');
  // Tool rack, tongs, cooling bucket.
  rect(198,63,100,9,'#76503a');
  p.line([[212,66],[206,112],[219,126]],'#b4aca0',5);
  p.line([[228,66],[234,112],[221,126]],'#b4aca0',5);
  p.line([[269,70],[269,121]],'#af8054',7); rect(251,68,37,16,'#819092');
  p.polygon([[197,205],[240,205],[235,244],[202,244]],'#665146');
  p.line([[200,217],[237,217]],'#b1aaa0',4);
  // Stump and anvil, with a bright steel top.
  p.polygon([[283,193],[362,193],[373,243],[277,243]],'#725039');
  p.line([[298,200],[291,239]],'#392a25',3); p.line([[345,201],[354,239]],'#392a25',3);
  p.polygon([[264,158],[373,158],[405,168],[371,179],[353,179],[348,196],[366,205],[287,205],[304,193],[301,177],[278,177]],'#65737b');
  p.line([[265,158],[373,158],[405,168]],'#c5d0cf',5);
  p.line([[307,182],[350,182]],'#424c58',5);
  // Dwarf smith: leather apron, boots, copper helmet and beard.
  rect(440,213,24,29,'#27282c'); rect(477,213,24,29,'#27282c');
  rect(434,237,34,11,'#151a20'); rect(476,237,34,11,'#151a20');
  p.polygon([[443,139],[486,137],[507,172],[495,221],[438,221],[427,172]],'#55615b');
  p.polygon([[449,143],[481,143],[493,219],[438,219]],'#956246');
  p.line([[443,184],[491,184]],'#392c27',7); rect(461,180,12,9,'#d8b76e');
  p.circle(467,113,26,'#d9a076');
  p.polygon([[440,120],[450,126],[467,123],[486,120],[485,151],[468,173],[446,152]],'#d4c4a6');
  p.line([[459,138],[468,158],[477,137]],'#8d7f70',3);
  p.polygon([[438,107],[444,87],[466,78],[489,89],[497,108]],'#a47448');
  rect(435,105,63,9,'#d1a568'); rect(462,81,9,28,'#e4bd75');
  p.circle(456,118,2,'#241f20'); p.circle(479,118,2,'#241f20');
  p.line([[495,156],[509,178],[491,192]],'#d9a076',13);
  // Weapon placed flat on the anvil.
  if(kind === 'bow') { p.line([[305,139],[326,126],[349,139]],'#d6ab73',5); p.line([[305,139],[349,139]],'#ede4bd',1); }
  else if(kind === 'hammer') { p.line([[302,144],[345,144]],'#ab764b',5); rect(339,132,18,23,'#becbd0'); }
  else if(kind === 'armor') p.polygon([[308,130],[322,126],[332,132],[343,127],[354,132],[348,150],[314,150]],'#bdc8cb');
  else { const end=kind==='dagger'?345:364; p.polygon([[311,139],[end,136],[end+8,141],[end,145],[311,144]],'#dce9e9'); p.line([[310,133],[310,151]],'#e6b95d',4); p.line([[293,141],[309,141]],'#9e6b49',5); }
  if (color !== '#ffe1a0') p.line([[306,148],[350,148]],color,3);
  // Hammer lands at 0.38 s, sparks start on contact.
  const age = FORGE_ANIMATION_SECONDS - remaining;
  const active = remaining > 0;
  const strike = active ? (age < 0.38 ? age / 0.38 : Math.max(0,1-(age-0.38)/0.52)) : 0;
  const angle = -2.05 - strike * 1.02;
  const handX=426, handY=145;
  const headX=handX+Math.cos(angle)*84, headY=handY+Math.sin(angle)*84;
  p.line([[443,155],[handX,handY]],'#d9a076',15);
  p.line([[handX,handY],[headX,headY]],'#c4965f',9);
  const ux=Math.cos(angle),uy=Math.sin(angle),vx=-uy,vy=ux;
  p.polygon([[-12,-18],[12,-18],[12,18],[-12,18]].map(([u,v])=>[headX+ux*u+vx*v,headY+uy*u+vy*v]),'#a7b6bc');
  p.line([[headX-vx*16,headY-vy*16],[headX+vx*16,headY+vy*16]],'#dce3dc',3);
  if(active && age >= 0.34 && age < 0.8) {
    const t=(age-0.34)/0.46;
    p.circle(342,144,Math.max(1,15*(1-t)),color);
    for(let i=0;i<11;i++) { const a=i*2.4; const r=12+55*t;
      p.line([[342+Math.cos(a)*r,144+Math.sin(a)*r*0.7],[342+Math.cos(a)*(r+8),144+Math.sin(a)*(r+8)*0.7]],i%2?color:'#fff2cc',3*(1-t)+0.5);
    }
  }
}
