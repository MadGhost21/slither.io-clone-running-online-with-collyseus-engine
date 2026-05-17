import { BilliardsPhysics } from "./BilliardsPhysics.js";
import { TABLE } from "./PhysicsConstants.js";

/**
 * CueBallManager
 * 
 * Centralized authority for cue ball settings and placement logic.
 * This class isolates the "where" and "how" of cue ball interaction
 * to prevent synchronization conflicts between room and physics.
 */
export class CueBallManager {
    public static readonly HEAD_SPOT = { x: 186, y: 190 };
    public static readonly SETTINGS = {
        HEAD_STRING_LINE: 186,
        BALL_RADIUS: 11
    };

    /**
     * Clamps a position to valid table boundaries and rule-based constraints (Kitchen).
     */
    public static getClampedPosition(x: number, y: number, isKitchen: boolean) {
        const r = this.SETTINGS.BALL_RADIUS;
        const minX = TABLE.x + r;
        const maxX = TABLE.x + TABLE.w - r;
        const minY = TABLE.y + r;
        const maxY = TABLE.y + TABLE.h - r;

        // Apply Kitchen wall (Head String) if restricted
        const allowedMaxX = isKitchen ? Math.min(maxX, this.SETTINGS.HEAD_STRING_LINE) : maxX;

        return {
            x: Math.max(minX, Math.min(allowedMaxX, x)),
            y: Math.max(minY, Math.min(maxY, y))
        };
    }

    /**
     * Validates if a coordinate is legal (Table bounds + Overlap check).
     */
    public static validate(physics: BilliardsPhysics, x: number, y: number, isKitchen: boolean): boolean {
        // 1. Boundary Check
        const clamped = this.getClampedPosition(x, y, isKitchen);
        const isOutOfBounds = Math.abs(clamped.x - x) > 0.1 || Math.abs(clamped.y - y) > 0.1;
        if (isOutOfBounds) return false;

        // 2. Collision Check (Using existing physics overlap logic)
        return physics.validPlacement(x, y, isKitchen);
    }

    /**
     * Forces the cue ball back to the Head Spot.
     */
    public static respawn(physics: BilliardsPhysics) {
        physics.placeCue(this.HEAD_SPOT.x, this.HEAD_SPOT.y);
    }
}
