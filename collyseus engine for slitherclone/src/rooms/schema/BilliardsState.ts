import { Schema, type, MapSchema } from "@colyseus/schema";

// ── Per-ball state (position synced to clients) ──────────────────
export class BallSnapshot extends Schema {
  @type("uint8")   id: number = 0;
  @type("float32") x: number  = 0;
  @type("float32") y: number  = 0;
  @type("float32") vx: number = 0;
  @type("float32") vy: number = 0;
  @type("boolean") active: boolean = true;
  @type("boolean") pocketing: boolean = false;
  @type("boolean") isSleeping: boolean = false;
}

// ── Per-player metadata ──────────────────────────────────────────
export class BilliardsPlayer extends Schema {
  @type("string") sessionId: string = "";
  @type("string") name: string      = "";
  @type("string") group: string     = ""; // "solids" | "stripes" | ""
  @type("uint16") fouls: number = 0;
  @type("uint16") timeouts: number = 0;
  @type("uint16") score: number = 0;      // For modes like straight/snooker/time
}

// ── Root state shared with all clients ──────────────────────────
export class BilliardsState extends Schema {
  @type({ map: BallSnapshot })     balls   = new MapSchema<BallSnapshot>();
  @type({ map: BilliardsPlayer }) players = new MapSchema<BilliardsPlayer>();

  @type("string")  currentTurn: string  = "";   // sessionId whose turn it is
  @type("string")  gameMode: string     = "8ball";
  @type("boolean") isStarted: boolean   = false;
  @type("boolean") isFinished: boolean  = false;
  @type("boolean") isBallInHand: boolean = false;
  @type("boolean") isPositioning: boolean = false;
  @type("boolean") isKitchenBIH: boolean = false;
  @type("boolean") isBreakShot: boolean  = true;  // true until first shot is taken
  @type("string")  winnerId: string     = "";
  @type("string")  winReason: string    = "";
  @type("int32")   remainingTime: number = 0;   // Seconds remaining in current turn
  @type("string")  phase: string        = "aiming"; // "aiming" | "balls_moving" | "game_over"
  @type("boolean") allBallsStopped: boolean = true;
  @type("uint16")  totalShots: number   = 0;
  @type("number")  serverTime: number   = 0;
  @type("number")  shotStartTime: number = 0; // Universal clock for synchronization

  // For modes that track groups (8ball) or assigned slots (cutthroat)
  @type("boolean") groupsAssigned: boolean = false;
}
