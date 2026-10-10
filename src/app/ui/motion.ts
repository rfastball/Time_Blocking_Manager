// One spring for everything that moves because the plan changed. It keeps velocity when the target changes mid-flight.
export const settle={type:'spring' as const,visualDuration:.42,bounce:.22};
// Flow work is drawn up toward the ceiling: it rises quickly and meets what is above with a knock (see `bump`),
// and is pushed down heavily, without a bounce.
export const rise={type:'spring' as const,visualDuration:.32,bounce:0};
export const sink={type:'spring' as const,visualDuration:.5,bounce:0};
export const bump={y:[0,-2.5,0],scaleY:[1,.95,1]};
export const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
// Held blocks lean at most this far, and only while moving.
export const MAX_TILT=1.2;
export const LIFT_SCALE=1.03;
