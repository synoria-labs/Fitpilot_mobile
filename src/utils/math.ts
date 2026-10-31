/** Keeps a value between two bounds. */
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
