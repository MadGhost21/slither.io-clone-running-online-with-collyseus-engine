import { CFG } from './config.js';

export class NetworkManager {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.client = null;
        this.room = null;
        this.sessionId = null;
        this._listenersAttached = false;
        
        this.ping = 0;
        this.tps = 0;
        this._tickCount = 0;
        this._tpsTimer = performance.now();
    }

    async connect(url, name, skin) {
        const ColyseusLib = window.Colyseus;
        this.client = new ColyseusLib.Client(url);
        
        try {
            console.log("[Network] Connecting to", url);
            this.room = await this.client.joinOrCreate("slitherroom", { name, skin });
            this.sessionId = this.room.sessionId;

            this.room.onMessage('pong', (start) => {
                this.ping = Math.round(performance.now() - start);
            });

            this.startPingLoop();
            this.room.onStateChange(() => {
                this._tickCount++;
                const now = performance.now();
                if (now - this._tpsTimer > 1000) {
                    this.tps = this._tickCount;
                    this._tickCount = 0;
                    this._tpsTimer = now;
                }
                
                if (!this._listenersAttached) {
                    this._attachCollectionListeners();
                    if (this.callbacks.onReady) this.callbacks.onReady();
                }
            });

            this.room.onMessage('player_died', (data) => {
                if (data.score !== undefined) {
                    this.callbacks.onDeath(data.score, data.killerName);
                }
            });

            this.room.onMessage('chat', (data) => {
                this.callbacks.onChat(data.sender, data.message, data.color);
            });

            this.room.onLeave((code) => this.callbacks.onDisconnect(code));
            return this.room;
        } catch (e) {
            console.error("[Network] Join Error:", e);
            throw e;
        }
    }

    _attachCollectionListeners() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        const state = this.room.state;

        // ── Snakes ──────────────────────────────────────────────
        if (state.snakes) {
            state.snakes.forEach((snake, id) => this.callbacks.onSnakeAdd(snake, id));
            
            // Support both function and property styles for maximum compatibility
            if (typeof state.snakes.onAdd === "function") {
                state.snakes.onAdd((s, id) => this.callbacks.onSnakeAdd(s, id));
                state.snakes.onRemove((s, id) => this.callbacks.onSnakeRemove(s, id));
            } else {
                state.snakes.onAdd = (s, id) => this.callbacks.onSnakeAdd(s, id);
                state.snakes.onRemove = (s, id) => this.callbacks.onSnakeRemove(s, id);
            }
        }

        // ── Grid ────────────────────────────────────────────────
        const checkGrid = () => {
            if (this.room.state.grid) {
                this._attachGridListeners(this.room.state.grid);
                return true;
            }
            return false;
        };

        if (!checkGrid()) {
            const gridCheckInterval = setInterval(() => {
                if (checkGrid()) clearInterval(gridCheckInterval);
            }, 500);
        }
    }

    _gridAttached = false;
    _attachGridListeners(grid) {
        if (this._gridAttached) return;
        this._gridAttached = true;
        console.log("[Network] Grid listeners attached (V1 Reliability Mode).");

        // 🚀 BULLETPROOF V1 SYNC: 
        // Instead of trusting SDK property listeners (which can fail on @view filtered items),
        // we manually diff the sector strings every tick. This is incredibly fast and 100% reliable.
        const lastGridData = new Map();

        this.room.onStateChange(() => {
            if (!this.room.state.grid) return;
            
            // 1. Add & Update
            this.room.state.grid.forEach((sector, key) => {
                const currentData = sector.d;
                if (lastGridData.get(key) !== currentData) {
                    lastGridData.set(key, currentData);
                    this.callbacks.onSectorUpdate(key, currentData);
                }
            });

            // 2. Remove sectors that left AOI
            for (const key of lastGridData.keys()) {
                if (!this.room.state.grid.has(key)) {
                    lastGridData.delete(key);
                    this.callbacks.onSectorRemove(key);
                }
            }
        });
    }

    sendInput(angle, boosting) {
        if (this.room) this.room.send('input', { angle, boosting });
    }

    disconnect() {
        if (this.room) {
            this.room.leave();
            this.room = null;
        }
        this._listenersAttached = false;
        this._gridAttached = false;
    }

    sendChat(message) {
        if (this.room) this.room.send('chat', message);
    }

    startPingLoop() {
        if (this._pingInterval) clearInterval(this._pingInterval);
        this._pingInterval = setInterval(() => {
            if (this.room) {
                this.room.send('ping', performance.now());
            }
        }, 2000);
    }
}

export function decodeFoodSector(data, key) {
    try {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const [sx, sy] = key.split(',').map(Number);
        const results = [];
        for (let i = 0; i < bytes.length - 2; i += 3) {
            results.push({
                id: `${key}_${i}`,
                x: sx * CFG.SECTOR_SIZE + bytes[i],
                y: sy * CFG.SECTOR_SIZE + bytes[i+1],
                color: `hsl(${bytes[i+2] * 2}, 100%, 60%)`
            });
        }
        return results;
    } catch (e) { return []; }
}
