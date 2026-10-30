// Extracted from 美术源文件/主角修改版.png; 200×300 frames, shared foot baseline.
export const HERO_FRAME_COUNTS = { idle: 9, walk: 11 } as const;
export const HERO_ANIMATION = { width: 56, height: 84, idleFps: 6, walkFps: 9 };
// Character's right hand = viewer's left; source-frame pixel coordinates.
export const HERO_HANDS = {
  idle: [[47,220,151,217],[49,220,150,217],[49,220,149,216],[48,220,148,215],[47,220,149,216],[45,218,145,217],[45,219,142,218],[43,220,143,218],[44,220,141,217]],
  walk: [[73,209,144,196],[76,210,145,196],[77,211,145,195],[79,211,145,194],[78,211,144,194],[77,211,144,195],[76,211,144,195],[75,211,143,196],[74,211,143,196],[73,211,143,196],[72,211,142,196]],
};
export function heroPose(time: number, moving: boolean) {
  const action = moving ? 'walk' : 'idle';
  const frame = Math.floor(time * (moving ? HERO_ANIMATION.walkFps : HERO_ANIMATION.idleFps)) % HERO_FRAME_COUNTS[action];
  const h = HERO_HANDS[action][frame];
  return { action, frame, rightX: (h[0] - 100) * 0.28, rightY: (h[1] - 150) * 0.28,
    leftX: (h[2] - 100) * 0.28, leftY: (h[3] - 150) * 0.28 };
}
