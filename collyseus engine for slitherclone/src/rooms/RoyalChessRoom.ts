import { Room, Client } from "colyseus";
import { ChessState, Player } from "./schema/ChessState.js";
import { Chess } from "chess.js";

export class RoyalChessRoom extends Room {
    maxClients = 2;
    state = new ChessState();
    chess = new Chess();
    isFinished: boolean = false;
    timeLimit: number = 600;
    reconnectionPromises = new Map<string, any>();

    onCreate(options: any) {
        this.timeLimit = options.timeLimit || 600;
        
        // Expose strict metadata to the Colyseus Match-Maker 
        this.setMetadata({ timeLimit: this.timeLimit });
        
        // In 0.17 we declare state = new ChessState() at class level
        
        this.state.whiteTime = this.timeLimit;
        this.state.blackTime = this.timeLimit;

        // 10+0 Server Clock tick (1000ms interval)
        this.setSimulationInterval((deltaTime) => {
            if (this.state.isStarted && !this.isFinished) {
                if (this.state.turn === 'w') {
                    this.state.whiteTime -= 1;
                    if (this.state.whiteTime <= 0) {
                        this.state.whiteTime = 0;
                        this.endGameOnTimeout('w');
                    }
                } else {
                    this.state.blackTime -= 1;
                    if (this.state.blackTime <= 0) {
                        this.state.blackTime = 0;
                        this.endGameOnTimeout('b');
                    }
                }
            }
        }, 1000);

        this.onMessage("move", (client, message) => {
            console.log(`Received move attempt from ${client.sessionId}:`, message);
            const player = this.state.players.get(client.sessionId);
            
            if (this.isFinished) return;
            
            // Basic turn validation
            if (!player || this.chess.turn() !== player.color) {
                console.log("Not your turn or unknown player");
                return;
            }

            try {
                const move = this.chess.move({
                    from: message.from,
                    to: message.to,
                    promotion: message.promotion || "q"
                });

                if (move) {
                    this.state.fen = this.chess.fen();
                    this.state.turn = this.chess.turn();
                    console.log(`Move made: ${message.from} -> ${message.to}`);

                    // Validate Match End Conditions Post-Move
                    if (this.chess.isCheckmate() || this.chess.isStalemate() || this.chess.isThreefoldRepetition() || this.chess.isInsufficientMaterial() || this.chess.isDraw()) {
                        let reason = "Match Concluded";
                        if (this.chess.isCheckmate()) reason = "Checkmate";
                        else if (this.chess.isStalemate()) reason = "Stalemate";
                        else if (this.chess.isThreefoldRepetition()) reason = "Threefold Repetition";
                        else if (this.chess.isInsufficientMaterial()) reason = "Insufficient Material";


                        this.broadcast("game_over", { 
                            reason: reason, 
                            winner: this.chess.turn() === 'w' ? 'Black' : 'White' 
                        });
                        
                        this.isFinished = true;
                        this.setMetadata({ isFinished: true });
                        this.rejectAllReconnections();
                        this.lock();
                    }
                }
            } catch (e) {
                console.log("Invalid move attempt:", message);
            }
        });

        this.onMessage("promotion_pending", (client) => {
            console.log(`Player ${client.sessionId} is promoting...`);
            this.broadcast("promotion_pending", {}, { except: client });
        });

        this.onMessage("emote", (client, message) => {
            console.log(`Emote from ${client.sessionId}: ${message}`);
            this.broadcast("emote", { sender: client.sessionId, text: message });
        });

        this.onMessage("restart", (client) => {
            this.chess.reset();
            this.state.fen = this.chess.fen();
            this.state.turn = this.chess.turn();
            this.state.whiteTime = this.timeLimit;
            this.state.blackTime = this.timeLimit;
            console.log("Game restarted");
        });

        this.onMessage("resign", (client) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                console.log(`Player ${client.sessionId} resigned.`);
                // Broadcast GAME_OVER to everyone in the room
                this.broadcast("game_over", { 
                    reason: "Opponent Resigned", 
                    winner: player.color === 'w' ? 'Black' : 'White' 
                });
                
                // Force an authoritative reset on the server board
                this.chess.reset();
                this.state.fen = this.chess.fen();
                this.state.isStarted = false;
                
                // Notice: We NO LONGER call this.disconnect().
                // We keep the room open to allow players to view the final board state
                // and use the End-Game Modal to choose 'Main Menu' or 'Play Again'.
                
                // CRITICAL FIX: Lock the room and reject any pending handshakes
                this.isFinished = true;
                this.setMetadata({ isFinished: true });
                this.rejectAllReconnections();
                this.lock();
            }
        });

        this.onMessage("draw_offer", (client) => {
            console.log(`Player ${client.sessionId} offered a draw.`);
            this.broadcast("draw_offer", { from: client.sessionId }, { except: client });
        });

        this.onMessage("draw_accept", (client) => {
            if (this.isFinished) return;
            console.log(`Player ${client.sessionId} accepted the draw.`);
            
            this.broadcast("game_over", { 
                reason: "Draw by Agreement", 
                winner: "Draw" 
            });

            this.isFinished = true;
            this.setMetadata({ isFinished: true });
            this.rejectAllReconnections();
            this.lock();
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`Player joined: ${client.sessionId}`);

        const player = new Player();
        player.sessionId = client.sessionId;
        player.name = options.name || `Player ${this.state.players.size + 1}`;
        
        // Assign color: first player is white, second is black
        if (this.state.players.size === 0) {
            player.color = "w";
            // Ensure the board is totally fresh for a new room
            this.chess.reset();
            this.state.fen = this.chess.fen();
            this.state.turn = this.chess.turn();
        } else {
            player.color = "b";
            this.state.isStarted = true;
            // Also ensure fresh board when the match actually begins
            this.chess.reset();
            this.state.fen = this.chess.fen();
            this.state.turn = this.chess.turn();
            this.state.whiteTime = this.timeLimit;
            this.state.blackTime = this.timeLimit;
        }

        this.state.players.set(client.sessionId, player);

        client.send("status", `Welcome! You are playing as ${player.color === 'w' ? 'White' : 'Black'}`);
        client.send("player_color", player.color);
        
        // Match Verification 
        if (options.matchRequestId) {
            client.send("verify_request", options.matchRequestId);
        }
    }
    
    // Ghost Prevention & Match Rule Guard
    requestJoin(options: any, isNewRoom: boolean) {
        console.log("[Matchmaking] Room Type: " + this.timeLimit + " | Request Type: " + options.timeLimit);
        
        if (options.newSearch && this.isFinished) {
            return false;
        }
        
        // Absolute Filter: No fallbacks allowed. Must strictly match the isolated mode
        if (!options.timeLimit || options.timeLimit !== this.timeLimit) {
            return false;
        }
        
        return true;
    }

    onDrop(client: Client, code: number) {
        // Unexpected leave during active match
        if (this.state.isStarted && !this.isFinished) {
            console.log(`♟ [Royal Chess] Player dropped: ${client.sessionId}. Grace period: 60s`);
            
            // CONCURRENCY GUARD: Terminate any existing pending handshake for this session
            if (this.reconnectionPromises.has(client.sessionId)) {
                console.log(`♟ [Royal Chess] Terminating stale pending handshake for ${client.sessionId}`);
                try { this.reconnectionPromises.get(client.sessionId).reject(); } catch(e) {}
            }

            const deferred = this.allowReconnection(client, 60);
            this.reconnectionPromises.set(client.sessionId, deferred);

            deferred.then(() => {
                this.reconnectionPromises.delete(client.sessionId);
                console.log(`♟ [Royal Chess] Handshake resolved for ${client.sessionId}`);
            }).catch((err) => {
                this.reconnectionPromises.delete(client.sessionId);
                console.log(`♟ [Royal Chess] Reconnection period expired for ${client.sessionId}. Closing match.`);
                this.state.players.delete(client.sessionId);
                this.isFinished = true;
                this.state.isStarted = false;
                this.setMetadata({ isFinished: true });
            });
        }
    }

    onLeave(client: Client, code: number) {
        console.log(`Player left: ${client.sessionId} (code: ${code}, consented: true)`);
        
        // In onDrop pattern, onLeave is ONLY called for consented leaves
        this.state.players.delete(client.sessionId);
        if (this.state.isStarted && !this.isFinished) {
            // If game was active, set it to not started or handle resignation logic
            this.state.isStarted = false;
        }
    }

    onDispose() {
        console.log("Room disposed");
    }

    endGameOnTimeout(losingColor: string) {
        if (this.isFinished) return;
        
        this.isFinished = true;
        this.rejectAllReconnections();

        const winner = losingColor === 'w' ? 'Black' : 'White';
        this.broadcast("game_over", { reason: "Time's up", winner: winner });
        
        this.setMetadata({ isFinished: true });
        this.lock();
    }

    private rejectAllReconnections() {
        console.log(`♟ [Royal Chess] Terminating all pending reconnections for Room ${this.roomId}`);
        this.reconnectionPromises.forEach((deferred, sid) => {
            try {
                deferred.reject(new Error("Match already ended"));
            } catch (e) {
                console.error("Error rejecting reconnection promise:", e);
            }
        });
        this.reconnectionPromises.clear();
    }
}
