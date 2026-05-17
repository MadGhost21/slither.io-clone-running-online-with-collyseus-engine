/**
 * PHYSICS CONSTANTS
 * Central source of truth for all server-side physics calculations.
 * These values must match the client-side js/shared/constants.js exactly.
 */

export const W = 700;
export const H = 380;
export const CUSHION = 18;
export const BALL_R = 11;

export const MAX_VEL = 15.0;
export const MAX_PWR = 9.0;
export const SHOT_SCALAR = 1.8;
export const TIME_SCALE = 1.0;

export const CUSH_REST = 0.75;
export const BALL_REST = 0.98;
export const PKT_CAP = BALL_R * 2.1;

export const TABLE = {
    x: CUSHION + 4,
    y: CUSHION + 4,
    w: W - (CUSHION + 4) * 2,
    h: H - (CUSHION + 4) * 2,
};
