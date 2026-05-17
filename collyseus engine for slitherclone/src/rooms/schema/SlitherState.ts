import { Schema, type, MapSchema, ArraySchema, view } from "@colyseus/schema";

// ── Snake Segment ──────────────────────────────────────────────────────────────
export class Segment extends Schema {
    @type("number") x: number = 0;
    @type("number") y: number = 0;
}

// ── Snake ──────────────────────────────────────────────────────────────────────
export class Snake extends Schema {
    @type("string")  id:          string  = "";
    @type("string")  name:        string  = "Snake";
    @type("string")  skin:        string  = "neon-blue";
    @type("number")  x:           number  = 0;
    @type("number")  y:           number  = 0;
    @type("number")  angle:       number  = 0;
    @type("number")  targetAngle: number  = 0;
    @type("number")  width:       number  = 8;
    @type("number")  score:       number  = 0;
    @type("boolean") alive:       boolean = false;
    @type("boolean") boosting:    boolean = false;
    @type([Segment]) segments = new ArraySchema<Segment>();
}

// ── Grid Sector (Binary Food Encoding) ────────────────────────────────────────
// Each sector covers a SECTOR_SIZE × SECTOR_SIZE area of the world.
// "d" is a Base64-encoded binary string: [relX, relY, hue/2] per food item (3 bytes each).
export class GridSectorSchema extends Schema {
    @type("string") d: string = "";
}

// ── Room State ─────────────────────────────────────────────────────────────────
export class SlitherState extends Schema {
    @type("number") gameWidth:  number = 4000;
    @type("number") gameHeight: number = 4000;

    @type({ map: Snake }) snakes = new MapSchema<Snake>();

    // Grid is view-filtered: each client only receives the sectors near them.
    @view() @type({ map: GridSectorSchema }) grid = new MapSchema<GridSectorSchema>();
}
