// One spring for everything that moves because the plan changed. It keeps velocity when the target changes mid-flight.
export const settle={type:'spring' as const,visualDuration:.42,bounce:.22};
export const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
// Held blocks lean at most this far, and only while moving.
export const MAX_TILT=1.2;
export const LIFT_SCALE=1.03;
