// Lists and panels keep their existing spring when contents change.
export const settle={type:'spring' as const,visualDuration:.42,bounce:.22};
// Plan neighbors make room quickly; the held block and destination hollow track directly.
export const reflow={type:'tween' as const,duration:.16,ease:[.16,1,.3,1] as const};
export const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
