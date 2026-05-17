import { BilliardsState } from "./schema/BilliardsState.js";
import { BilliardsPhysics } from "../physics/BilliardsPhysics.js";

// ── Shared Rule Evaluation Interface ──────────────────────────
export interface ShotResult {
  firstContact: number | null;
  railHit: boolean;
  cuePot: boolean;
  pottedIds: number[];
}

export interface RuleOutcome {
  isFoul: boolean;
  foulReason: string;
  keepTurn: boolean;
}

// ── Rule Engine ───────────────────────────────────────────────
export class BilliardsRules {

  /** 
   * Main Dispatcher: Routes the shot result to the correct mode-specific logic.
   */
  static evaluate(
    mode: string,
    state: BilliardsState,
    physics: BilliardsPhysics,
    shot: ShotResult,
    shooterId: string,
    opponentId: string,
    context: { 
        isBreakShot: boolean; 
        consecutiveFouls: Record<string, number>;
        snookerRedTurn: boolean;
        ctPotted: Record<string, number[]>;
    }
  ): RuleOutcome & { snookerRedTurn?: boolean } {
    
    let isFoul = shot.cuePot;
    let foulReason = isFoul ? "Cue ball pocketed" : "";
    let keepTurn = false;

    // Default contact check
    if (!isFoul && shot.firstContact === null) {
        if (!context.isBreakShot) {
            isFoul = true;
            foulReason = "No ball contacted";
        }
    }

    if (isFoul) return { isFoul, foulReason, keepTurn: false };

    // Mode-specific evaluation
    switch (mode) {
      case '8ball':
        return this._rules8ball(state, physics, shot, shooterId, opponentId, context.isBreakShot);
      case '9ball':
        return this._rules9ball(state, physics, shot, shooterId, context.isBreakShot);
      case '10ball':
        return this._rules10ball(state, physics, shot, shooterId, context.isBreakShot);
      case 'straight':
        return this._rulesStraight(state, physics, shot, shooterId, context.consecutiveFouls);
      case 'cutthroat':
        return this._rulesCutthroat(state, physics, shot, shooterId, context.ctPotted);
      case 'snooker':
        return this._rulesSnooker(state, physics, shot, shooterId, opponentId, context.snookerRedTurn);
      default:
        // Practice/3ball/Time modes
        keepTurn = shot.pottedIds.length > 0 && !shot.cuePot;
        return { isFoul: false, foulReason: "", keepTurn };
    }
  }

  // ── Mode Implementations ────────────────────────────────────

  private static _rules8ball(
    state: BilliardsState, 
    physics: BilliardsPhysics, 
    shot: ShotResult, 
    shooterId: string, 
    opponentId: string, 
    isBreakShot: boolean
  ): RuleOutcome {
    const player = state.players.get(shooterId)!;
    const opponent = state.players.get(opponentId);
    let isFoul = false;
    let foulReason = "";
    let keepTurn = false;

    const cpG = player.group;
    const ab  = physics.activeBalls();
    const livS = ab.filter(b => b.id >= 1 && b.id <= 7).length + shot.pottedIds.filter(id => id >= 1 && id <= 7).length;
    const livT = ab.filter(b => b.id >= 9 && b.id <= 15).length + shot.pottedIds.filter(id => id >= 9 && id <= 15).length;

    if (!isBreakShot && cpG && shot.firstContact !== null) {
      const isSol = shot.firstContact >= 1 && shot.firstContact <= 7;
      const isStr = shot.firstContact >= 9 && shot.firstContact <= 15;
      const cpLive = cpG === 'solids' ? livS : livT;
      const on8Phase = cpLive === 0;
      if (on8Phase && shot.firstContact !== 8) {
        isFoul = true; foulReason = "Must hit the 8-ball first";
      } else if (!on8Phase) {
        if (cpG === 'solids' && !isSol) { isFoul = true; foulReason = "Must hit a solid first"; }
        if (cpG === 'stripes' && !isStr) { isFoul = true; foulReason = "Must hit a stripe first"; }
      }
    }

    if (!isFoul && player.group && !isBreakShot && shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      isFoul = true; foulReason = "No rail contact after hit";
    }

    // Note: Win condition (potted 8) is handled in Room for easier endGame calls
    if (shot.pottedIds.includes(8)) {
        // We let the room handle the actual game ending logic for better lifecycle management
        return { isFoul, foulReason, keepTurn: false }; 
    }

    if (!isFoul) {
      if (!state.groupsAssigned && !isBreakShot) {
        const firstNon8 = shot.pottedIds.find(id => id !== 8);
        if (firstNon8 !== undefined) {
          const sol = firstNon8 >= 1 && firstNon8 <= 7;
          player.group = sol ? 'solids' : 'stripes';
          if (opponent) opponent.group = sol ? 'stripes' : 'solids';
          state.groupsAssigned = true;
        }
      }
      const cg = player.group;
      const potS = shot.pottedIds.filter(id => id >= 1 && id <= 7);
      const potT = shot.pottedIds.filter(id => id >= 9 && id <= 15);
      keepTurn = cg === 'solids' ? potS.length > 0 : cg === 'stripes' ? potT.length > 0 : shot.pottedIds.filter(id => id !== 8).length > 0;
    }

    return { isFoul, foulReason, keepTurn };
  }

  private static _rules9ball(state: BilliardsState, physics: BilliardsPhysics, shot: ShotResult, shooterId: string, isBreakShot: boolean): RuleOutcome {
    const ab = physics.activeBalls().filter(b => b.id >= 1 && b.id <= 9);
    const potted9 = shot.pottedIds.filter(id => id >= 1 && id <= 9);
    const allPre = [...ab.map(b => b.id), ...potted9];
    const lo = allPre.length ? Math.min(...allPre) : null;
    let isFoul = false;
    let foulReason = "";

    if (lo !== null && shot.firstContact !== lo && !isBreakShot) {
      isFoul = true; foulReason = `Must hit ball ${lo} first`;
    }
    if (!isFoul && shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      isFoul = true; foulReason = "No rail contact after hit";
    }

    return { isFoul, foulReason, keepTurn: !isFoul && potted9.length > 0 };
  }

  private static _rules10ball(state: BilliardsState, physics: BilliardsPhysics, shot: ShotResult, shooterId: string, isBreakShot: boolean): RuleOutcome {
    const ab = physics.activeBalls().filter(b => b.id >= 1 && b.id <= 10);
    const allIds = [...ab.map(b => b.id), ...shot.pottedIds.filter(id => id >= 1 && id <= 10)];
    const lo = allIds.length ? Math.min(...allIds) : null;
    let isFoul = false;
    let foulReason = "";

    if (lo !== null && shot.firstContact !== lo && !isBreakShot) {
      isFoul = true; foulReason = `Must hit ball ${lo} first`;
    }
    if (!isFoul && shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      isFoul = true; foulReason = "No rail contact after hit";
    }

    return { isFoul, foulReason, keepTurn: !isFoul && shot.pottedIds.filter(id => id >= 1 && id <= 10).length > 0 };
  }

  private static _rulesStraight(state: BilliardsState, physics: BilliardsPhysics, shot: ShotResult, shooterId: string, consecutiveFouls: Record<string, number>): RuleOutcome {
    if (shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      return { isFoul: true, foulReason: "No rail contact after hit", keepTurn: false };
    }
    const player = state.players.get(shooterId)!;
    player.score += shot.pottedIds.length;
    return { isFoul: false, foulReason: "", keepTurn: shot.pottedIds.length > 0 };
  }

  private static _rulesCutthroat(state: BilliardsState, physics: BilliardsPhysics, shot: ShotResult, shooterId: string, ctPotted: Record<string, number[]>): RuleOutcome {
    if (shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      return { isFoul: true, foulReason: "No rail contact after hit", keepTurn: false };
    }
    // Track potted
    shot.pottedIds.forEach(id => {
      if (id >= 1 && id <= 5) ctPotted.p1.push(id);
      else if (id >= 6 && id <= 10) ctPotted.p2.push(id);
      else if (id >= 11 && id <= 15) ctPotted.p3.push(id);
    });

    const cpRange = shooterId === Array.from(state.players.keys())[0] ? [1,5] : [6,10];
    const pottedOpp = shot.pottedIds.some(id => id < cpRange[0] || id > cpRange[1]);
    return { isFoul: false, foulReason: "", keepTurn: pottedOpp };
  }

  private static _rulesSnooker(state: BilliardsState, physics: BilliardsPhysics, shot: ShotResult, shooterId: string, opponentId: string, redTurn: boolean): RuleOutcome & { snookerRedTurn: boolean } {
    const isRed = (id: number) => id >= 16 && id <= 30;
    const isColour = (id: number) => id >= 17 && id <= 22;
    let isFoul = false;
    let foulReason = "";
    let sRedTurn = redTurn;

    if (shot.firstContact !== null) {
      if (sRedTurn && !isRed(shot.firstContact) && isColour(shot.firstContact)) {
        isFoul = true; foulReason = "Must hit a red first";
      } else if (!sRedTurn && isRed(shot.firstContact)) {
        isFoul = true; foulReason = "Must hit nominated colour";
      }
    }
    if (!isFoul && shot.firstContact !== null && !shot.railHit && shot.pottedIds.length === 0) {
      isFoul = true; foulReason = "No rail contact";
    }

    if (isFoul) {
        return { isFoul, foulReason, keepTurn: false, snookerRedTurn: sRedTurn };
    }

    const player = state.players.get(shooterId)!;
    player.score += shot.pottedIds.filter(isRed).length;
    player.score += shot.pottedIds.filter(isColour).reduce((a, id) => a + (id - 15), 0);

    if (shot.pottedIds.filter(isRed).length > 0 && sRedTurn) sRedTurn = false;
    else if (shot.pottedIds.filter(isColour).length > 0 && !sRedTurn) sRedTurn = true;

    return { isFoul: false, foulReason: "", keepTurn: shot.pottedIds.length > 0, snookerRedTurn: sRedTurn };
  }
}
