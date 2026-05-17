import { Room, Client } from "colyseus";
import { BilliardsState, BallSnapshot, BilliardsPlayer } from "./schema/BilliardsState.js";
import { BilliardsPhysics } from "../physics/BilliardsPhysics.js";
import { TABLE } from "../physics/PhysicsConstants.js";
import { CueBallManager } from "../physics/CueBallManager.js";
import { BilliardsRules } from "./BilliardsRules.js";

// ═══════════════════════════════════════════════════════════════════
// BILLIARDS ROOM — Server-Authoritative Multi-Mode
//
// Architecture:
//   • Server owns physics + rule evaluation for ALL game modes.
//   • The client game at /public/billiards/js/ is the source of truth
//     for game logic. The server mirrors that logic faithfully.
//   • Supported modes: 8ball, 9ball, 10ball, straight, cutthroat,
//     3ball, time, target, snooker
//   • Client sends INPUTS only: { shoot, move_cue, place_cue, resign, chat }
//   • Server simulates to completion then broadcasts shot_result.
//   • Client renders with local visual smoothing (Shooter-Is-King pattern).
// ═══════════════════════════════════════════════════════════════════

// ── Per-mode configuration ───────────────────────────────────────
const MODE_CONFIG: Record<string, { ballCount: number; timeLimit?: number }> = {
  '8ball':    { ballCount: 16 },
  '9ball':    { ballCount: 10 },
  '10ball':   { ballCount: 11 },
  'straight': { ballCount: 16 },
  'cutthroat':{ ballCount: 16 },
  '3ball':    { ballCount:  4 },
  'time':     { ballCount: 16, timeLimit: 120 },
  'target':   { ballCount: 16 },
  'snooker':  { ballCount: 22 }, // 15 reds + 6 colours + cue
};

export class BilliardsRoom extends Room {
  maxClients = 2;
  state = new BilliardsState();

  private physics = new BilliardsPhysics();
  private _finished = false;
  private _turnStartTime = 0;
  private _activeShot: {
    shooterId: string;
    hasProcessedEnd: boolean;
    shotId: string;
    startTime: number;
  } | null = null;

  // Snooker: track which phase (reds | colours)
  private _snookerRedTurn = true;
  // Cutthroat: track potted balls per group for respotting
  private _ctPotted: Record<string, number[]> = { p1: [], p2: [], p3: [] };
  // Player consecutive fouls (for straight pool triple-foul rule)
  private _consecutiveFouls: Record<string, number> = {};
  // Time attack: game timer accumulator (seconds)
  private _timeElapsed = 0;

  private readonly TURN_TIMEOUT = 30_000; // 30 seconds

  // ── Room creation ────────────────────────────────────────────
  onCreate(options: any): void {
    const mode = options.gameMode ?? "8ball";
    console.log(`[Billiards] Room created: ${this.roomId} (Mode: ${mode})`);
    this.state.gameMode = mode;
    this.setPatchRate(30); // 30ms state push (approx 33.3Hz)

    // Initial rack — will be re-racked properly in onJoin when 2nd player arrives
    const seed = BilliardsPhysics.generateRackSeed();
    this.physics.rackForMode(mode, seed);
    this._syncBalls();

    // ── Simulation Ticker ──────────────────────────────────────
    this.setSimulationInterval(() => {
      this.state.serverTime = Date.now();
      if (this._finished || !this.state.isStarted) return;

      const rolling = this.physics.isRolling();
      this.state.allBallsStopped = !rolling;

      if (this._activeShot) {
        if (rolling) {
          this.physics.update();
          this._syncBalls();
          this.state.remainingTime = 0;
          this.state.phase = "balls_moving";
        } else if (!this._activeShot.hasProcessedEnd) {
          this._activeShot.hasProcessedEnd = true;
          this.state.phase = "aiming";
          this._finalizeShot();
        }
      } else {
        // ── Turn Timer ────────────────────────────────────────
        const elapsed = Date.now() - this._turnStartTime;
        const remaining = Math.max(0, Math.ceil((this.TURN_TIMEOUT - elapsed) / 1000));
        this.state.remainingTime = remaining;

        // Time-attack: accumulate real time
        if (this.state.gameMode === 'time') {
          this._timeElapsed += 1 / 60; // approximate dt at 60fps setSimulationInterval
        }

        // Force sync during BIH to propagate cue ball repositioning
        if (this.state.isBallInHand) {
          this._syncBalls();
        }

        if (elapsed > this.TURN_TIMEOUT) {
          this._handleTurnTimeout();
        }
      }
    });

    // ── Clock Sync ────────────────────────────────────────────
    this.onMessage("sync_clock", (client: Client, msg: { clientTime: number }) => {
      client.send("sync_clock", {
        clientTime: msg.clientTime,
        serverTime: Date.now(),
      });
    });

    // ── Message: shoot ────────────────────────────────────────
    this.onMessage("shoot", (client: Client, msg: {
      fromX: number; fromY: number; toX: number; toY: number; power: number; shotId: string;
    }) => {
      if (this._finished || !this.state.isStarted) return;
      if (this.state.currentTurn !== client.sessionId) {
        console.log(`[Billiards] ❌ REJECTED: Not ${client.sessionId}'s turn!`);
        return;
      }
      if (!msg.shotId) return;

      // Reset inactivity counter
      const player = this.state.players.get(client.sessionId);
      if (player) player.timeouts = 0;

      // Clear BIH flags on shot
      this.state.isBallInHand = false;
      this.state.isPositioning = false;
      this.state.isKitchenBIH = false;
      this.physics.isBallInHand = false;

      // Normalise (5 decimal determinism)
      const fX = this._trunc5(msg.fromX);
      const fY = this._trunc5(msg.fromY);
      const tX = this._trunc5(msg.toX);
      const tY = this._trunc5(msg.toY);
      const pw = this._trunc5(msg.power);

      this.state.shotStartTime = Date.now();

      const ok = this.physics.shoot(fX, fY, tX, tY, pw);
      if (ok) {
        this.state.phase = "balls_moving";
        this.state.totalShots++;
        this.state.isBreakShot = false;
        this._turnStartTime = Date.now();
        this.state.remainingTime = 30;

        this._activeShot = {
          shooterId: client.sessionId,
          hasProcessedEnd: false,
          shotId: msg.shotId,
          startTime: Date.now(),
        };

        console.log(`[Billiards] 🚀 Shot ${msg.shotId} by ${client.sessionId} (mode: ${this.state.gameMode})`);

        this.broadcast("shot_start", {
          shooterId: client.sessionId,
          shotId: msg.shotId,
          fromX: fX, fromY: fY,
          toX: tX,   toY: tY,
          power: pw,
          serverTime: Date.now(),
        });
      }
    });

    // ── Message: move_cue ─────────────────────────────────────
    // Client sends this while dragging the cue ball during Ball-In-Hand.
    // Server updates position and broadcasts 'cue_placed' to opponent.
    this.onMessage("move_cue", (client: Client, msg: { x: number; y: number }) => {
      if (this._finished || !this.state.isStarted) return;
      if (!this.state.isBallInHand) return;
      if (this.state.currentTurn !== client.sessionId) return;

      const x = this._trunc5(msg.x);
      const y = this._trunc5(msg.y);

      // Use centralized Manager for clamping and boundary enforcement
      const { x: cx, y: cy } = CueBallManager.getClampedPosition(x, y, this.state.isKitchenBIH);

      const cueBall = this.physics.balls.find(b => b.isCue);
      if (cueBall) {
        cueBall.active = true;
        cueBall.pocketing = false;
        cueBall.x = cx;
        cueBall.y = cy;
        cueBall.vx = 0; cueBall.vy = 0;
      }

      // Sync schema so state patch reaches all clients
      this._syncBalls();

      // Notify opponent of cue position for visual feedback
      this.broadcast("cue_placed", { sessionId: client.sessionId, x: cx, y: cy });
    });

    // ── Message: place_cue ────────────────────────────────────
    // Client sends this when confirming BIH placement (clicking "Confirm").
    // Server locks the cue ball at that position and signals ready to shoot.
    this.onMessage("place_cue", (client: Client, msg: { x: number; y: number }) => {
      if (this._finished || !this.state.isStarted) return;
      if (!this.state.isBallInHand) return;
      if (this.state.currentTurn !== client.sessionId) return;

      const x = this._trunc5(msg.x);
      const y = this._trunc5(msg.y);

      // Validate placement using centralized Manager (checks bounds + other balls)
      const valid = CueBallManager.validate(this.physics, x, y, this.state.isKitchenBIH);
      if (valid) {
        this.physics.placeCue(x, y);
        this.state.isPositioning = false; // Confirming success clears positioning UI
      } else {
         console.warn(`[Billiards] ⚠ Placement rejected for ${client.sessionId} at (${x}, ${y}) - Invalid or overlapping.`);
         // We do NOT reset to center anymore; we just keep the previous position.
      }

      // Keep BIH true until they actually shoot
      const cue = this.physics.balls.find(b => b.isCue);
      if (cue) {
        cue.setStatic(false); // allow shooting
        cue.isSleeping = false;
        cue.sleepFrames = 0;
      }

      this._syncBalls();

      // Broadcast final confirmed position so opponent sees it too
      const finalCue = this.physics.getCue();
      this.broadcast("cue_placed", {
        sessionId: client.sessionId,
        x: finalCue ? finalCue.x : x,
        y: finalCue ? finalCue.y : y,
      });

      console.log(`[Billiards] 📍 Cue placed by ${client.sessionId} at (${finalCue?.x}, ${finalCue?.y})`);
    });

    // ── Message: request_positioning ──────────────────────────
    this.onMessage("request_positioning", (client: Client) => {
      if (this._finished || !this.state.isStarted) return;
      if (!this.state.isBallInHand) return;
      if (this.state.currentTurn !== client.sessionId) return;

      this.state.isPositioning = true;
      console.log(`[Billiards] 🔄 Positioning mode re-enabled by ${client.sessionId}`);
    });

    // ── Message: resign ───────────────────────────────────────
    this.onMessage("resign", (client: Client) => {
      const opponent = this._getOpponent(client.sessionId);
      this._endGame(opponent?.sessionId ?? "", "Opponent resigned");
    });

    // ── Message: chat ─────────────────────────────────────────
    this.onMessage("chat", (client: Client, msg: { text: string }) => {
      this.broadcast("chat", {
        senderId: client.sessionId,
        text: msg.text,
      });
    });
  }

  // ── Player join ──────────────────────────────────────────────
  onJoin(client: Client, options: any): void {
    console.log(`[Billiards] ➕ ${client.sessionId} joined (name="${options.playerName ?? "Player"}")`);

    const player = new BilliardsPlayer();
    player.sessionId = client.sessionId;
    player.name = (options.playerName ?? `Player ${this.state.players.size + 1}`)
      .trim().slice(0, 20) || "Player";
    this.state.players.set(client.sessionId, player);
    this._consecutiveFouls[client.sessionId] = 0;

    // Start when 2 players are present
    if (this.state.players.size === 2) {
      this.state.isStarted = true;
      this.state.isBreakShot = true;
      this.state.isBallInHand = true;
      this.state.isPositioning = true;
      this.state.isKitchenBIH = true;
      this.physics.isBallInHand = true;

      // Full re-rack with a fresh seed for determinism
      const seed = BilliardsPhysics.generateRackSeed();
      this.physics.rackForMode(this.state.gameMode, seed);

      // Freeze cue ball at break position (Connected to New System)
      this.physics.placeCue(CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y);
      const cue = this.physics.balls.find(b => b.isCue);
      if (cue) cue.setStatic(true);

      this._syncBalls();

      const ids = Array.from(this.state.players.keys());
      this.state.currentTurn = ids[Math.floor(Math.random() * ids.length)];

      const playersArr = ids.map(id => ({
        sessionId: id,
        name: this.state.players.get(id)?.name ?? "Player",
      }));

      this.broadcast("game_start", {
        balls:        this.physics.getBallsSnapshot(),
        currentTurn:  this.state.currentTurn,
        gameMode:     this.state.gameMode,
        isBallInHand: true,
        isBreakShot:  true,
        players:      playersArr,
        seed,
      });

      console.log(`[Billiards] 🚀 Game started! Mode: ${this.state.gameMode}  Break: ${this.state.currentTurn}`);
      this.state.remainingTime = 30;
      this._turnStartTime = Date.now();
      this.lock();
    }
  }

  // ── Reconnection ─────────────────────────────────────────────
  onReconnect(client: Client) {
    console.log(`[Billiards] 🔄 ${client.sessionId} reconnected!`);
    this._turnStartTime = Date.now() - ((30 - this.state.remainingTime) * 1000);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    console.log(`[Billiards] ➖ ${client.sessionId} left (consented=${consented})`);
    
    if (consented) {
      // Intentional leave: End game immediately
      if (!this._finished) {
        const opponent = this._getOpponent(client.sessionId);
        if (opponent) this._endGame(opponent.sessionId, "Opponent left the match");
      }
      this.state.players.delete(client.sessionId);
    } else {
      // Accidental disconnect: Allow reconnection
      console.log(`[Billiards] 💧 ${client.sessionId} dropped. Waiting for reconnection…`);
      try {
        await this.allowReconnection(client, 40);
        console.log(`[Billiards] ✅ ${client.sessionId} reconnected.`);
      } catch (e) {
        if (!this._finished) {
           const opponent = this._getOpponent(client.sessionId);
           if (opponent) this._endGame(opponent.sessionId, "Opponent disconnected");
        }
        this.state.players.delete(client.sessionId);
      }
    }
  }

  onDispose(): void {
    console.log("[Billiards] 🗑 Room disposed");
  }

  // ── Turn Timeout Handler ─────────────────────────────────────
  private _handleTurnTimeout(): void {
    console.log(`[Billiards] ⏱ Timeout foul for ${this.state.currentTurn}`);
    const player = this.state.players.get(this.state.currentTurn);
    if (player) {
      player.fouls++;
      player.timeouts++;
      if (player.timeouts >= 2) {
        const opponent = this._getOpponent(this.state.currentTurn);
        this._endGame(opponent?.sessionId ?? "", "Opponent kicked for inactivity");
        return;
      }
    }

    this._turnStartTime = Date.now();
    this.state.isBallInHand = true;
    this.physics.isBallInHand = true;

    // Return cue to head string on foul
    this.physics.placeCue(CueBallManager.HEAD_SPOT.x, CueBallManager.HEAD_SPOT.y);
    const cue = this.physics.balls.find(b => b.isCue);
    if (cue) cue.setStatic(true);

    this._syncBalls();

    const opponent = this._getOpponent(this.state.currentTurn);
    if (opponent) {
      const prevTurn = this.state.currentTurn;
      this.state.currentTurn = opponent.sessionId;
      this.broadcast("OPPONENT_FOUL", {
        reason: "Turn timer expired",
        shooterId: prevTurn,
        nextTurn: opponent.sessionId,
      });
    }
  }

  // ── Shot Finalization (Mode-Aware Rules) ─────────────────────
  // ── Shot Finalization (Mode-Aware Rules) ─────────────────────
  private _finalizeShot(): void {
    if (!this._activeShot) return;
    const shooterId = this._activeShot.shooterId;
    const sd = this.physics.shotData();
    const { firstContact, railHit, cuePot, pottedIds } = sd;
    const player   = this.state.players.get(shooterId)!;
    const opponent = this._getOpponent(shooterId);
    const mode     = this.state.gameMode;
    const duration = Date.now() - (this._activeShot?.startTime || 0);

    console.log(`[Billiards] Shot resolved | mode=${mode} | contact=${firstContact} | potted=[${pottedIds}] | cuePot=${cuePot} | rail=${railHit}`);

    // Delegate to Modular Rule Engine
    const ruleResult = BilliardsRules.evaluate(
      mode, 
      this.state, 
      this.physics, 
      sd, 
      shooterId, 
      opponent?.sessionId ?? "",
      {
        isBreakShot: this.state.isBreakShot,
        consecutiveFouls: this._consecutiveFouls,
        snookerRedTurn: this._snookerRedTurn,
        ctPotted: this._ctPotted
      }
    );

    let { isFoul, foulReason, keepTurn } = ruleResult;
    
    // Update transient rule state (Snooker phases/Cutthroat tracking)
    if (ruleResult.snookerRedTurn !== undefined) this._snookerRedTurn = ruleResult.snookerRedTurn;

    // ── TERMINAL WIN CONDITIONS (Room Level) ──────────────────
    if (mode === '8ball' && pottedIds.includes(8)) {
        const cpG = player.group;
        const abPost = this.physics.activeBalls();
        const cpLivePost = cpG === 'solids' ? abPost.filter(b => b.id >= 1 && b.id <= 7).length : abPost.filter(b => b.id >= 9 && b.id <= 15).length;
        if (isFoul || (cpLivePost > 0 && cpG !== '')) {
            this._endGame(opponent?.sessionId ?? "", isFoul ? "Opponent fouled on 8-ball" : "Potted 8-ball too early");
        } else {
            this._endGame(shooterId, "Legally potted the 8-ball!");
        }
        this._activeShot = null;
        return;
    }

    if (mode === 'straight' && player.score >= 100) {
        this._endGame(shooterId, "Reached 100 points!");
        this._activeShot = null;
        return;
    }

    // ── FOUL POST-PROCESSING ──────────────────────────────────
    let nextTurn = opponent?.sessionId ?? shooterId;
    let giveBIH  = false;
    let respawnCue = false;

    if (isFoul) {
      player.fouls++;
      this._consecutiveFouls[shooterId] = (this._consecutiveFouls[shooterId] || 0) + 1;
      keepTurn   = false;
      giveBIH    = true;
      respawnCue = cuePot;
      console.error(`[Billiards] ❌ FOUL: "${foulReason}" by ${shooterId}`);
    } else {
      this._consecutiveFouls[shooterId] = 0;
      nextTurn = keepTurn ? shooterId : (opponent?.sessionId ?? shooterId);
    }

    // Handle Cutthroat life check / Snooker finish here if needed
    // ...

    nextTurn = isFoul ? (opponent?.sessionId ?? shooterId) : nextTurn;

    const isBreakFoul = isFoul && this.state.isBreakShot;

    this.state.currentTurn  = nextTurn;
    this.state.isBallInHand = giveBIH;
    this.state.isPositioning = giveBIH;
    this.state.isKitchenBIH = isBreakFoul;
    this.physics.isBallInHand = giveBIH;
    this.state.phase        = "aiming";
    this.state.isBreakShot  = false;
    this._turnStartTime     = Date.now();

    if (isFoul || respawnCue) {
      CueBallManager.respawn(this.physics);
      const cue = this.physics.balls.find(b => b.isCue);
      if (cue) cue.setStatic(true);
      this.state.isBallInHand = true;
      this.physics.isBallInHand = true;
    }

    this._syncBalls();

    if (isFoul) {
      this.broadcast("OPPONENT_FOUL", { reason: foulReason, shooterId, nextTurn });
    }

    this.broadcast("shot_result", {
      shooterId,
      shotId:       this._activeShot ? this._activeShot.shotId : "none",
      balls:        this.physics.getBallsSnapshot(),
      pottedIds,
      cuePot,
      firstContact,
      railHit,
      isFoul,
      foulReason,
      nextTurn:     this.state.currentTurn,
      isBallInHand: this.state.isBallInHand,
      phase:        this.state.phase,
      groups: {
        [shooterId]:                 player.group,
        [opponent?.sessionId ?? ""]: opponent?.group ?? "",
      },
    });

    this._activeShot = null;
  }


  // ── Helpers ───────────────────────────────────────────────────
  private _getOpponent(sessionId: string): BilliardsPlayer | null {
    for (const [id, p] of this.state.players.entries()) {
      if (id !== sessionId) return p;
    }
    return null;
  }

  private _endGame(winnerId: string, reason: string): void {
    if (this._finished) return;
    this._finished = true;
    this.state.isFinished = true;
    this.state.phase      = "game_over";
    this.state.winnerId   = winnerId;
    this.state.winReason  = reason;
    this.broadcast("game_over", { winnerId, reason });
    console.log(`[Billiards] 🏆 Game over! Winner: ${winnerId} — ${reason}`);
    this.clock.setTimeout(() => { this.disconnect(); }, 1000);
  }

  private _trunc5(val: number): number {
    return Math.round(val * 100000) / 100000;
  }

  private _syncBalls(): void {
    for (const ball of this.physics.balls) {
      let bs = this.state.balls.get(String(ball.id));
      if (!bs) {
        bs = new BallSnapshot();
        bs.id = ball.id;
        this.state.balls.set(String(ball.id), bs);
      }

      const isMoving = Math.abs(ball.vx) > 0.01 || Math.abs(ball.vy) > 0.01 || ball.pocketing;
      const wasMoving = (ball as any)._wasMoving !== false;

      if (isMoving || wasMoving || this.state.allBallsStopped) {
        bs.x = this._trunc5(ball.x);
        bs.y = this._trunc5(ball.y);
        bs.vx = this._trunc5(ball.vx || 0);
        bs.vy = this._trunc5(ball.vy || 0);
      }

      (ball as any)._wasMoving = isMoving;
      bs.active     = ball.active;
      bs.pocketing  = ball.pocketing || false;
      bs.isSleeping = ball.isSleeping || false;
    }
  }
}
