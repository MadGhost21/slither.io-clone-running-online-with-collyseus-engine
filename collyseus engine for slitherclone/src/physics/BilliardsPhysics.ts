import { 
  W, H, CUSHION, BALL_R, 
  MAX_VEL, MAX_PWR, SHOT_SCALAR, 
  TIME_SCALE, CUSH_REST, BALL_REST, 
  PKT_CAP, TABLE 
} from "./PhysicsConstants.js";
import { CueBallManager } from "./CueBallManager.js";

const POCKETS = [
  { x: TABLE.x + 2,           y: TABLE.y + 2            },
  { x: TABLE.x + TABLE.w / 2, y: TABLE.y - 2            },
  { x: TABLE.x + TABLE.w - 2, y: TABLE.y + 2            },
  { x: TABLE.x + 2,           y: TABLE.y + TABLE.h - 2  },
  { x: TABLE.x + TABLE.w / 2, y: TABLE.y + TABLE.h + 2  },
  { x: TABLE.x + TABLE.w - 2, y: TABLE.y + TABLE.h - 2  },
];

function pdist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ── Ball (physics only — no rendering) ──────────────────────────
export class PhysicsBall {
  id: number;
  x: number;
  y: number;
  vx: number = 0;
  vy: number = 0;
  r: number = BALL_R;
  mass: number = 1.0;
  active: boolean = true;
  pocketing: boolean = false;
  sleepFrames: number = 0;
  isSleeping: boolean = false;
  isStatic: boolean = false;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
  }

  get isCue(): boolean  { return this.id === 0; }
  get isStripe(): boolean { return this.id >= 9 && this.id <= 15; }
  get speed(): number   { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }

  moveStep(subcount: number = 4): void {
    if (!this.active || this.pocketing || this.isStatic) return;
    this.x += (this.vx / subcount) * TIME_SCALE;
    this.y += (this.vy / subcount) * TIME_SCALE;

    // Position Rounding: Match client precision to fix divergence
    this.x = Math.round(this.x * 1000) / 1000;
    this.y = Math.round(this.y * 1000) / 1000;

    const l  = TABLE.x + this.r;
    const rr = TABLE.x + TABLE.w - this.r;
    const t  = TABLE.y + this.r;
    const b  = TABLE.y + TABLE.h - this.r;
    const jaw = PKT_CAP + BALL_R;

    const near = POCKETS.some(p => pdist(this, p) < jaw);
    const inC  = POCKETS.some(p => pdist(this, p) < PKT_CAP);
    const wr   = near ? 0.45 : CUSH_REST;

    if (this.x < l  && !inC) { this.x = l;  this.vx =  Math.abs(this.vx) * wr; if (Math.abs(this.vx) < 0.15) this.vx = 0; }
    if (this.x > rr && !inC) { this.x = rr; this.vx = -Math.abs(this.vx) * wr; if (Math.abs(this.vx) < 0.15) this.vx = 0; }
    if (this.y < t  && !inC) { this.y = t;  this.vy =  Math.abs(this.vy) * wr; if (Math.abs(this.vy) < 0.15) this.vy = 0; }
    if (this.y > b  && !inC) { this.y = b;  this.vy = -Math.abs(this.vy) * wr; if (Math.abs(this.vy) < 0.15) this.vy = 0; }
  }

  setStatic(v: boolean): void {
    this.isStatic = v;
    if (v) { this.vx = 0; this.vy = 0; this.isSleeping = false; }
  }
}

// ── Physics Engine (authoritative server simulation) ────────────
export class BilliardsPhysics {
  public isBallInHand: boolean = false;
  balls: PhysicsBall[] = [];
  firstContact: number | null = null;
  railHit: boolean = false;
  cuePot: boolean = false;
  pottedIds: number[] = [];

  // ── Rack Formations — mirroring all client rack functions ────

  /** Standard 8-ball triangle rack */
  rack8(seed?: number[]): void {
    this.balls = [];
    const cx = TABLE.x + TABLE.w * 0.65;
    const cy = TABLE.y + TABLE.h / 2;
    const sp = BALL_R * 2.06;
    const ord = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let i = 0;
    const offsets = seed || new Array(30).fill(0);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const oi = i * 2;
        const x = cx + row * sp * Math.cos(Math.PI / 6) + (offsets[oi]   ?? 0);
        const y = (cy + (col - row / 2) * sp)           + (offsets[oi+1] ?? 0);
        this.balls.push(new PhysicsBall(ord[i++], x, y));
      }
    }
    this.balls.push(new PhysicsBall(0, CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y));
  }

  /** 9-ball diamond rack — balls 1–9, 9 in center */
  rack9(seed?: number[]): void {
    this.balls = [];
    const cx = TABLE.x + TABLE.w * 0.65;
    const cy = TABLE.y + TABLE.h / 2;
    const sp = BALL_R * 2.06;
    const pos = [[0,0],[1,-1],[1,0],[1,1],[2,-2],[2,-1],[2,0],[2,1],[2,2]];
    const ord = [1, 2, 3, 4, 9, 5, 6, 7, 8];
    const offsets = seed || new Array(18).fill(0);
    pos.forEach(([row, col], i) => {
      const oi = i * 2;
      this.balls.push(new PhysicsBall(
        ord[i],
        cx + row * sp * Math.cos(Math.PI / 6) + (offsets[oi]   ?? 0),
        cy + col * sp                           + (offsets[oi+1] ?? 0)
      ));
    });
    this.balls.push(new PhysicsBall(0, CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y));
  }

  /** 10-ball diamond rack — balls 1–10, 10 in center */
  rack10(seed?: number[]): void {
    this.balls = [];
    const cx = TABLE.x + TABLE.w * 0.65;
    const cy = TABLE.y + TABLE.h / 2;
    const sp = BALL_R * 2.06;
    const pos = [[0,0],[1,-1],[1,0],[1,1],[2,-2],[2,-1],[2,0],[2,1],[2,2],[3,-1.5]];
    const ord = [1, 2, 3, 4, 10, 5, 6, 7, 8, 9];
    const offsets = seed || new Array(20).fill(0);
    pos.forEach(([row, col], i) => {
      const oi = i * 2;
      this.balls.push(new PhysicsBall(
        ord[i],
        cx + row * sp * Math.cos(Math.PI / 6) + (offsets[oi]   ?? 0),
        cy + col * sp                           + (offsets[oi+1] ?? 0)
      ));
    });
    this.balls.push(new PhysicsBall(0, CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y));
  }

  /** Straight pool / Cutthroat — full 15-ball triangle (same position as 8-ball) */
  rackStraight(seed?: number[]): void {
    this.rack8(seed); // Same formation, different rules
  }

  /** 3-ball — small triangle */
  rack3(seed?: number[]): void {
    this.balls = [];
    const cx = TABLE.x + TABLE.w * 0.65;
    const cy = TABLE.y + TABLE.h / 2;
    const sp = BALL_R * 2.1;
    const positions: [number, number][] = [[0,0],[1,-0.5],[1,0.5]];
    const offsets = seed || new Array(6).fill(0);
    [1, 2, 3].forEach((id, i) => {
      const [row, col] = positions[i];
      const oi = i * 2;
      this.balls.push(new PhysicsBall(
        id,
        cx + row * sp * Math.cos(Math.PI / 6) + (offsets[oi]   ?? 0),
        cy + col * sp                           + (offsets[oi+1] ?? 0)
      ));
    });
    this.balls.push(new PhysicsBall(0, CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y));
  }

  /** Snooker — 15 reds in triangle + 6 colour balls on spots */
  rackSnooker(seed?: number[]): void {
    this.balls = [];
    const cx = TABLE.x + TABLE.w * 0.65;
    const cy = TABLE.y + TABLE.h / 2;
    const sp = BALL_R * 2.06;
    const cxT = TABLE.x, cwT = TABLE.w, cyT = TABLE.y, chT = TABLE.h;
    const offsets = seed || new Array(30).fill(0);

    // 15 reds (ids 16–30)
    let i = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const oi = i * 2;
        this.balls.push(new PhysicsBall(
          16 + i,
          cx + row * sp * Math.cos(Math.PI / 6) + (offsets[oi]   ?? 0),
          (cy + (col - row / 2) * sp)            + (offsets[oi+1] ?? 0)
        ));
        i++;
      }
    }
    // Colours on their spots (fixed positions, no offsets)
    this.balls.push(new PhysicsBall(17, cxT + cwT * 0.25, cyT + chT / 2));       // yellow
    this.balls.push(new PhysicsBall(18, cxT + cwT * 0.3,  cyT + chT * 0.38));    // green
    this.balls.push(new PhysicsBall(19, cxT + cwT * 0.3,  cyT + chT * 0.62));    // brown
    this.balls.push(new PhysicsBall(20, cxT + cwT * 0.5,  cyT + chT / 2));       // blue
    this.balls.push(new PhysicsBall(21, cxT + cwT * 0.65, cyT + chT / 2));       // pink
    this.balls.push(new PhysicsBall(22, cxT + cwT * 0.78, cyT + chT / 2));       // black
    // Cue ball
    this.balls.push(new PhysicsBall(0, CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y));
  }

  /** Factory: choose correct rack by gameMode string */
  rackForMode(mode: string, seed?: number[]): void {
    switch (mode) {
      case '9ball':    this.rack9(seed);       break;
      case '10ball':   this.rack10(seed);      break;
      case 'straight': this.rackStraight(seed); break;
      case 'cutthroat':this.rackStraight(seed); break; // same formation
      case '3ball':    this.rack3(seed);       break;
      case 'snooker':  this.rackSnooker(seed); break;
      // 8ball, time, target, practice all use 8-ball formation
      default:         this.rack8(seed);       break;
    }
  }

  /** Re-rack object balls (leaves cue ball). Used in straight pool re-rack. */
  rack8ObjectBallsOnly(seed?: number[]): void {
    const cue = this.balls.find(b => b.isCue);
    this.rack8(seed);
    // Restore original cue position if it was alive
    if (cue) {
      this.balls = this.balls.filter(b => !b.isCue);
      this.balls.push(cue);
    }
  }

  /** Spot a ball back on the table at its nominal spot (used in 9-ball, snooker) */
  spotBall(ballId: number): void {
    const b = this.balls.find(b => b.id === ballId);
    if (!b) return;
    // Re-activate at the head string center (server safe default)
    b.active = true;
    b.pocketing = false;
    b.x = BilliardsPhysics.HEAD_STRING.x;
    b.y = BilliardsPhysics.HEAD_STRING.y;
    b.vx = 0; b.vy = 0;
    b.isSleeping = true;
    b.sleepFrames = 99;
  }

  /** Generate random rack offsets (±0.4px per ball) for deterministic seeding */
  static generateRackSeed(): number[] {
    const offsets: number[] = [];
    for (let i = 0; i < 30; i++) offsets.push((Math.random() - 0.5) * 0.4);
    return offsets;
  }

  // ── Shot control ─────────────────────────────────────────────
  resetShot(): void {
    this.firstContact = null;
    this.railHit = false;
    this.cuePot = false;
    this.pottedIds = [];
  }

  shoot(fromX: number, fromY: number, toX: number, toY: number, pwr: number): boolean {
    const cue = this.balls.find(b => b.isCue && b.active);
    if (!cue) {
      console.warn("[Physics] ⛔ Shoot failed: Cue ball not active or not found.");
      return false;
    }

    // Release placement locks BEFORE applying force
    this.isBallInHand = false;
    cue.setStatic(false);

    const dx = toX - fromX, dy = toY - fromY;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.1) {
      console.warn("[Physics] ⛔ Shoot failed: Vector length too small (len < 0.1).");
      return false;
    }
    const f = (pwr / 100) * MAX_PWR * SHOT_SCALAR;
    cue.vx = (dx / len) * f;
    cue.vy = (dy / len) * f;
    const sp = Math.sqrt(cue.vx * cue.vx + cue.vy * cue.vy);
    if (sp > MAX_VEL) { const s = MAX_VEL / sp; cue.vx *= s; cue.vy *= s; }

    // Wake up the cue ball — prevents Dead Shot foul detection
    cue.isSleeping = false;
    cue.sleepFrames = 0;
    cue.sleepFrames = 0;

    this.resetShot();
    return true;
  }

  // ── Per-frame simulation ─────────────────────────────────────
  update(): void {
    for (const b of this.balls) {
      if (!b.active) continue;
      // Server: pocketing balls are deactivated immediately (no animation)
      if (b.pocketing) { b.active = false; continue; }

      const speed = Math.hypot(b.vx, b.vy);

      // Forced Sleep: any very slow ball is stopped
      if (speed < 0.15) {
        b.vx = 0; b.vy = 0; b.isSleeping = true; b.sleepFrames = 99;
        continue;
      }

      // Dynamic friction: Tiered Snappy Physics
      let ff = 0.993; // High Speed (> 5.0)
      if (speed < 5.0)  ff = 0.988; // Medium Speed
      if (speed < 1.5)  ff = 0.97;  // Low Speed

      b.vx *= ff; b.vy *= ff;

      if (speed > MAX_VEL) { const s = MAX_VEL / speed; b.vx *= s; b.vy *= s; }

      const currentSpd = Math.hypot(b.vx, b.vy);
      if (currentSpd < 0.08) {
        b.sleepFrames++;
        if (b.sleepFrames > 5) { b.vx = 0; b.vy = 0; b.isSleeping = true; }
      } else {
        b.sleepFrames = 0; b.isSleeping = false;
      }
    }
    // 8 substeps — matches client physics.js exactly
    for (let s = 0; s < 8; s++) {
      for (const b of this.balls) {
        b.moveStep(8);
      }
      this.resolveCollisions();
      this.checkPockets();
      this.trackContact();
    }
  }

  resolveCollisions(): void {
    const a = this.balls.filter(b => b.active && !b.pocketing);
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const p = a[i], q = a[j];
        if (p.isSleeping && q.isSleeping) continue;
        if (p.isStatic || q.isStatic) continue;

        const dx = q.x - p.x, dy = q.y - p.y;
        const dd = Math.sqrt(dx * dx + dy * dy);
        const mn = p.r + q.r;
        if (dd < mn && dd > 0.001) {
          const ov = (mn - dd) / 2, nx = dx / dd, ny = dy / dd;
          p.x -= nx * ov; p.y -= ny * ov;
          q.x += nx * ov; q.y += ny * ov;
          if (p.isSleeping) { p.isSleeping = false; p.sleepFrames = 0; }
          if (q.isSleeping) { q.isSleeping = false; q.sleepFrames = 0; }
          const dvx = p.vx - q.vx, dvy = p.vy - q.vy;
          const dot = dvx * nx + dvy * ny;
          if (dot > 0) {
            const im = dot * BALL_REST;
            p.vx -= im * nx; p.vy -= im * ny;
            q.vx += im * nx; q.vy += im * ny;
          }
        }
      }
    }
  }

  checkPockets(): void {
    for (const b of this.balls) {
      if (!b.active || b.pocketing) continue;

      for (const p of POCKETS) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < PKT_CAP) {
          // Server: immediate deactivation (no visual pocketing animation)
          b.active = false;
          b.pocketing = true;
          b.vx = 0; b.vy = 0;
          if (b.isCue) this.cuePot = true;
          else this.pottedIds.push(b.id);
          break;
        }
        // Suction zone — matches client
        const suctionRadius = PKT_CAP * 1.05;
        if (dist < suctionRadius && dist > 0.01) {
          const pull = 0.35 * (1 - dist / suctionRadius);
          b.vx += (-dx / dist) * pull;
          b.vy += (-dy / dist) * pull;
          b.isSleeping = false; b.sleepFrames = 0;
        }
      }
    }
  }

  trackContact(): void {
    const cue = this.balls.find(b => b.isCue && b.active);
    if (!cue) return;
    if (this.firstContact === null) {
      for (const b of this.balls) {
        if (!b.active || b.isCue) continue;
        if (pdist(cue, b) < BALL_R * 2 + 2) { this.firstContact = b.id; break; }
      }
    }
    if (this.firstContact !== null && !this.railHit) {
      const atRail = (b: PhysicsBall) =>
        b.x <= TABLE.x + BALL_R + 2 || b.x >= TABLE.x + TABLE.w - BALL_R - 2 ||
        b.y <= TABLE.y + BALL_R + 2 || b.y >= TABLE.y + TABLE.h - BALL_R - 2;
      if (atRail(cue)) this.railHit = true;
      for (const b of this.balls) {
        if (!b.active || b.isCue) continue;
        if (atRail(b)) { this.railHit = true; break; }
      }
    }
  }

  isRolling(): boolean {
    return this.balls.some(b => {
      if (!b.active) return false;
      if (b.pocketing) return false;
      if (b.isSleeping) return false;
      return Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05;
    });
  }

  forceStop(): void {
    for (const b of this.balls) { b.vx = 0; b.vy = 0; b.isSleeping = true; b.sleepFrames = 99; }
  }



  // ── Utility ──────────────────────────────────────────────────
  validPlacement(x: number, y: number, isKitchen: boolean = false): boolean {
    // Boundary and rule checks are now centralized in CueBallManager
    // This function now only handles the ball-on-ball collision check
    for (const b of this.balls) {
      if (!b.active || b.isCue) continue;
      if (pdist({ x, y }, b) < BALL_R * 2 + 1) return false;
    }
    return true;
  }

  getCue(): PhysicsBall | null {
    return this.balls.find(b => b.isCue && b.active) || null;
  }

  placeCue(x: number, y: number): void {
    // Remove old cue and add fresh one at new location, awake
    this.balls = this.balls.filter(b => !b.isCue);
    const cue = new PhysicsBall(0, x, y);
    cue.isSleeping = false;
    cue.sleepFrames = 0;
    this.balls.push(cue);
  }

  removeCue(): void {
    this.balls = this.balls.filter(b => !b.isCue);
  }

  activeBalls(): PhysicsBall[] {
    return this.balls.filter(b => b.active && !b.pocketing);
  }

  shotData() {
    return {
      firstContact: this.firstContact,
      railHit: this.railHit,
      cuePot: this.cuePot,
      pottedIds: [...this.pottedIds],
    };
  }

  getBallsSnapshot(): Array<{ id: number; x: number; y: number; active: boolean; pocketing: boolean }> {
    return this.balls.map(b => ({ id: b.id, x: b.x, y: b.y, active: b.active, pocketing: b.pocketing || false }));
  }

  /**
   * Run physics simulation to completion.
   * Returns number of frames processed.
   * Max 4000 frames (~67 seconds at 60fps) — safety limit.
   */
  simulate(maxFrames = 4000): number {
    let frames = 0;
    while (this.isRolling() && frames < maxFrames) {
      this.update();
      frames++;
    }
    if (frames >= maxFrames) {
      console.warn('[BilliardsPhysics] simulate() hit maxFrames limit — forcing stop');
      this.forceStop();
    }
    return frames;
  }
}
