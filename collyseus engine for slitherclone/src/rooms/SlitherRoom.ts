// SlitherRoom.ts — Orbioo-Style Spatial Grid Architecture
// Food is tracked server-side in a SpatialHash + per-sector Set.
// Only binary-encoded sector strings are synced to clients (AOI filtered).

import { Room, Client } from "colyseus";
import { Encoder, StateView } from "@colyseus/schema";
import { SlitherState, Snake, Segment, GridSectorSchema } from "./schema/SlitherState.js";
import { SpatialHash } from "./SpatialHash.js";

// ── Increase buffer size for large states ──────────────────────────────────────
Encoder.BUFFER_SIZE = 512 * 1024;

// ── Server-side food entity (NOT in schema — tracked in memory only) ───────────
interface FoodEntity {
    id:     string;
    x:      number;
    y:      number;
    radius: number;
    hue:    number;   // 0–360
    value:  number;   // how much the snake grows
}

// ── Configuration ──────────────────────────────────────────────────────────────
const CFG = {
    WORLD_W:          4000,
    WORLD_H:          4000,
    BASE_SPEED:       7.5,
    BOOST_SPEED:      15.0,
    BASE_TURN_SPEED:  0.8,   // Sharp turns for tight coiling
    SEGMENT_SPACING:  4.5,   // Closer segments for smoother curves
    INITIAL_LENGTH:   10,
    INITIAL_SCORE:    10,
    MIN_SCORE:        10,
    MIN_LENGTH:       5,
    MAX_LENGTH:       1000,
    TICK_RATE:        20,

    // Spatial grid
    SECTOR_SIZE:      250,
    LOCAL_MAX_FOOD:   4,
    AOI_RADIUS:       1400,
    AOI_UPDATE_MS:    200,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function dist2(ax: number, ay: number, bx: number, by: number) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}
function rand(min: number, max: number) { return min + Math.random() * (max - min); }
function randInt(min: number, max: number) { return Math.floor(rand(min, max)); }
function randHue() { return randInt(0, 360); }
function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Room ───────────────────────────────────────────────────────────────────────
export class SlitherRoom extends Room {
    maxClients = 20;

    // Typed accessor — avoids casting on every usage
    get s(): SlitherState { return this.state as SlitherState; }

    // Server-side food tracking (never sent to clients directly)
    private _foodHash     = new SpatialHash<FoodEntity>(CFG.SECTOR_SIZE);
    private _foodBySector = new Map<string, Set<FoodEntity>>();

    // Per-client: which sectors they currently see
    private _clientSectors = new Map<string, Set<string>>();

    private _ticks = 0;
    private _nextFoodSpawnTick = 0;

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    onCreate(options: any) {
        console.log(`[SlitherRoom] created — maxClients=${this.maxClients}`);
        this.setState(new SlitherState());

        this.s.gameWidth  = CFG.WORLD_W;
        this.s.gameHeight = CFG.WORLD_H;

        // Initial food fill — populates every sector to LOCAL_MAX_FOOD
        this._balanceFoodLocally(true);

        // Game tick
        this.setSimulationInterval((dt) => this._tick(dt), 1000 / CFG.TICK_RATE);

        // AOI update — throttled to reduce CPU
        this.clock.setInterval(() => this._updateAOIViews(), CFG.AOI_UPDATE_MS);

        // ── Message Handlers ─────────────────────────────────────────────────

        this.onMessage('input', (client, msg) => {
            const snake = this.s.snakes.get(client.sessionId);
            if (!snake || !snake.alive) return;
            snake.targetAngle = msg.angle ?? snake.targetAngle;
            snake.boosting    = msg.boosting === true;
        });

        this.onMessage('respawn', (client) => {
            const old = this.s.snakes.get(client.sessionId);
            if (old && !old.alive) {
                const snake = this._createPlayerSnake(client.sessionId, old.name, old.skin);
                this.s.snakes.set(client.sessionId, snake);
                // Pre-bake sectors around spawn so player doesn't see empty space
                this._prebakeSectorsAround(snake.x, snake.y);
            }
        });

        this.onMessage('ping', (client, data) => client.send('pong', data));

        this.onMessage('chat', (client, message) => {
            if (typeof message !== "string" || message.length > 100) return;
            const snake = this.s.snakes.get(client.sessionId);
            this.broadcast('chat', {
                sender: snake ? snake.name : 'Unknown',
                message: message,
                color: snake ? snake.skin : '#fff'
            });
        });
    }

    onJoin(client: Client, options: any) {
        console.log(`[SlitherRoom] ${client.sessionId} joined as "${options.name}"`);

        const snake = this._createPlayerSnake(
            client.sessionId,
            options.name || 'Snake',
            options.skin  || 'neon-blue'
        );
        this.s.snakes.set(client.sessionId, snake);

        // Pre-bake sectors around spawn to prevent food "void" on join
        this._prebakeSectorsAround(snake.x, snake.y);

        // Create a per-client StateView for AOI filtering
        (client as any).view = new StateView();
        this._clientSectors.set(client.sessionId, new Set());
    }

    onLeave(client: Client, code: number) {
        console.log(`[SlitherRoom] ${client.sessionId} left`);
        const snake = this.s.snakes.get(client.sessionId);
        if (snake) this._explodeSnake(snake);
        this.s.snakes.delete(client.sessionId);
        this._clientSectors.delete(client.sessionId);
    }

    onDispose() {
        console.log('[SlitherRoom] disposed');
    }

    // ── Main Game Tick ─────────────────────────────────────────────────────────

    _tick(_dt: number) {
        this._ticks++;
        // 1. Move snakes
        this.s.snakes.forEach((snake: Snake) => {
            if (!snake.alive || !snake.segments || snake.segments.length === 0) return;

            // --- 1. AUTHENTIC SLITHER.IO MATH: Dynamic Length & Width ---
            const BASE_WIDTH = 10;
            const MAX_WIDTH = 40;
            
            // Width: Exponential curve capping at MAX_WIDTH (~95% cap at 1500 score)
            // Width: Exponential curve capping at MAX_WIDTH
            snake.width = BASE_WIDTH + (MAX_WIDTH - BASE_WIDTH) * (1 - Math.exp(-snake.score / 500));
            
            // Length: Synchronized with score. Score 10 = Length 10.
            // Growth slows down at higher scores to prevent snakes from becoming too long.
            const targetLength = Math.max(CFG.INITIAL_LENGTH, Math.floor(snake.score * (1.0 - Math.min(0.4, snake.score / 5000))));

            // Add segments if too short
            while (snake.segments.length < targetLength && snake.segments.length < CFG.MAX_LENGTH) {
                const last = snake.segments[snake.segments.length - 1];
                const seg = new Segment();
                seg.x = last.x; seg.y = last.y;
                snake.segments.push(seg);
            }
            // Remove segments if too long (e.g. from boosting)
            while (snake.segments.length > Math.max(CFG.MIN_LENGTH, targetLength)) {
                snake.segments.pop();
            }

            // --- 2. AUTHENTIC SLITHER.IO MATH: Dynamic Turn Speed ---
            // Thicker snakes turn slower
            const turnSpeed = CFG.BASE_TURN_SPEED * (BASE_WIDTH / snake.width);
            
            let da = snake.targetAngle - snake.angle;
            while (da >  Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            snake.angle += Math.sign(da) * Math.min(Math.abs(da), turnSpeed);

            // 3. Determine actual boost capability (Stop at MIN_SCORE)
            const isActuallyBoosting = snake.boosting && snake.score > CFG.MIN_SCORE;
            const currentSpeed = isActuallyBoosting ? CFG.BOOST_SPEED : CFG.BASE_SPEED;

            // Shift all body segments forward
            for (let i = snake.segments.length - 1; i > 0; i--) {
                snake.segments[i].x = snake.segments[i - 1].x;
                snake.segments[i].y = snake.segments[i - 1].y;
            }

            // Move head
            snake.segments[0].x += Math.cos(snake.angle) * currentSpeed;
            snake.segments[0].y += Math.sin(snake.angle) * currentSpeed;

            // Boost Penalty: drop a food pellet and reduce score
            if (isActuallyBoosting) {
                if (this._ticks % 4 === 0) {
                    const tail = snake.segments[snake.segments.length - 1];
                    
                    // Spawn food at tail position
                    this._spawnFood(tail.x, tail.y, randHue(), 2);
                    
                    // Reduce score (length will auto-adjust next tick)
                    snake.score = Math.max(CFG.MIN_SCORE, snake.score - randInt(2, 5));
                    
                    // Refresh the sector
                    const cx = Math.floor(tail.x / CFG.SECTOR_SIZE);
                    const cy = Math.floor(tail.y / CFG.SECTOR_SIZE);
                    this._refreshSector(`${cx},${cy}`);
                }
            }

            // Clamp to world bounds (No death)
            snake.segments[0].x = Math.max(snake.width, Math.min(CFG.WORLD_W - snake.width, snake.segments[0].x));
            snake.segments[0].y = Math.max(snake.width, Math.min(CFG.WORLD_H - snake.width, snake.segments[0].y));
        });

        // 2. Replenish food in under-populated sectors on a randomized interval (5-10 seconds)
        if (!this._nextFoodSpawnTick) this._nextFoodSpawnTick = this._ticks + randInt(5 * 20, 10 * 20);
        
        if (this._ticks >= this._nextFoodSpawnTick) {
            this._balanceFoodLocally(false);
            this._nextFoodSpawnTick = this._ticks + randInt(5 * 20, 10 * 20);
        }

        // 3. Collisions
        this._handleCollisions();
    }

    // ── Collision Detection ────────────────────────────────────────────────────

    private _handleCollisions() {
        this.s.snakes.forEach((snake: Snake) => {
            if (!snake.alive || !snake.segments || snake.segments.length === 0) return;

            const h  = snake.segments[0];
            const hr = snake.width * 0.65;

            // ── Food collision (SpatialHash query — O(1)) ──────────────────────
            const nearbyFood = this._foodHash.query(h.x, h.y, hr + CFG.SECTOR_SIZE);
            const dirtySectors = new Set<string>();

            for (const food of nearbyFood) {
                const r = hr + food.radius;
                if (dist2(h.x, h.y, food.x, food.y) < r * r) {
                    this._removeFood(food, dirtySectors);
                    this._growSnake(snake, food.value);
                }
            }

            // Rebuild binary strings for sectors that had food removed
            dirtySectors.forEach(k => this._refreshSector(k));

            // ── Snake vs Snake collision ───────────────────────────────────────
            this.s.snakes.forEach((other: Snake, otherId: string) => {
                if (other === snake || !other.alive) return;
                for (let i = 5; i < other.segments.length; i += 3) {
                    const s = other.segments[i];
                    const r = hr + other.width * 0.5;
                    if (dist2(h.x, h.y, s.x, s.y) < r * r) {
                        this._killSnake(snake, other.name);
                        return;
                    }
                }
            });
        });
    }

    // ── AOI View Manager (Orbioo-style) ───────────────────────────────────────
    // Runs every 200ms — updates which grid sectors each client can see.

    private _updateAOIViews() {
        this.clients.forEach(client => {
            const snake = this.s.snakes.get(client.sessionId);
            if (!snake || !snake.segments || snake.segments.length === 0) return;

            const view = (client as any).view as StateView;
            if (!view) return;

            const cx = snake.segments[0].x;
            const cy = snake.segments[0].y;
            const r  = CFG.AOI_RADIUS;
            const cs = CFG.SECTOR_SIZE;

            const cols = Math.floor(CFG.WORLD_W / cs);
            const rows = Math.floor(CFG.WORLD_H / cs);

            const startX = Math.max(0, Math.floor((cx - r) / cs));
            const endX   = Math.min(cols - 1, Math.floor((cx + r) / cs));
            const startY = Math.max(0, Math.floor((cy - r) / cs));
            const endY   = Math.min(rows - 1, Math.floor((cy + r) / cs));

            const newVisible    = new Set<string>();
            const prevVisible   = this._clientSectors.get(client.sessionId) || new Set<string>();

            // Add newly visible sectors
            for (let x = startX; x <= endX; x++) {
                for (let y = startY; y <= endY; y++) {
                    const key = `${x},${y}`;
                    newVisible.add(key);
                    const sector = this.s.grid.get(key);
                    if (sector) view.add(sector);
                }
            }

            // Remove sectors that are no longer visible
            prevVisible.forEach(key => {
                if (!newVisible.has(key)) {
                    const sector = this.s.grid.get(key);
                    if (sector) view.remove(sector);
                }
            });

            this._clientSectors.set(client.sessionId, newVisible);
        });
    }

    // ── Food System ───────────────────────────────────────────────────────────

    /** Spawn one food item at (x, y). Inserts into hash + sector set + marks sector dirty. */
    private _spawnFood(x: number, y: number, hue: number, value: number = randInt(1, 5)): FoodEntity {
        const food: FoodEntity = { id: uid(), x, y, radius: 5, hue, value };

        this._foodHash.insert(food);

        const cx  = Math.floor(x / CFG.SECTOR_SIZE);
        const cy  = Math.floor(y / CFG.SECTOR_SIZE);
        const key = `${cx},${cy}`;
        if (!this._foodBySector.has(key)) this._foodBySector.set(key, new Set());
        this._foodBySector.get(key)!.add(food);

        return food;
    }

    /** Remove a food item from the hash and its sector set. Marks sector dirty. */
    private _removeFood(food: FoodEntity, dirtySectors: Set<string>) {
        this._foodHash.remove(food);

        const cx  = Math.floor(food.x / CFG.SECTOR_SIZE);
        const cy  = Math.floor(food.y / CFG.SECTOR_SIZE);
        const key = `${cx},${cy}`;

        const sectorSet = this._foodBySector.get(key);
        if (sectorSet) {
            sectorSet.delete(food);
            dirtySectors.add(key);
        }
    }

    /**
     * Encode all food in a sector into a compact Base64 binary string.
     * Format: [relX, relY, hue/2] per food item — 3 bytes each.
     * Ported directly from Orbioo AgarioSocketRoom._refreshSector().
     */
    private _refreshSector(key: string) {
        const sector = this.s.grid.get(key);
        if (!sector) return;

        const foodSet = this._foodBySector.get(key);
        if (!foodSet || foodSet.size === 0) {
            sector.d = "";
            return;
        }

        const [cxStr, cyStr] = key.split(',');
        const originX = parseInt(cxStr) * CFG.SECTOR_SIZE;
        const originY = parseInt(cyStr) * CFG.SECTOR_SIZE;

        const bytes = new Uint8Array(foodSet.size * 3);
        let i = 0;
        foodSet.forEach(f => {
            bytes[i++] = Math.min(255, Math.floor(f.x - originX));
            bytes[i++] = Math.min(255, Math.floor(f.y - originY));
            bytes[i++] = Math.min(127, Math.floor(f.hue / 2));
        });

        // Convert binary → Base64 string for safe Colyseus transport
        sector.d = Buffer.from(bytes).toString('base64');
    }

    /**
     * Balance food across all sectors.
     * initialFill=true: fill all sectors to LOCAL_MAX_FOOD immediately.
     * initialFill=false: replenish only under-populated sectors (max 2 per call).
     */
    private _balanceFoodLocally(initialFill: boolean) {
        const cs       = CFG.SECTOR_SIZE;
        const localMax = CFG.LOCAL_MAX_FOOD;
        const cols     = Math.floor(CFG.WORLD_W / cs);
        const rows     = Math.floor(CFG.WORLD_H / cs);

        const dirty = new Set<string>();

        for (let cx = 0; cx < cols; cx++) {
            for (let cy = 0; cy < rows; cy++) {
                const key = `${cx},${cy}`;

                // Ensure the grid sector schema entry exists
                if (!this.s.grid.get(key)) {
                    this.s.grid.set(key, new GridSectorSchema());
                }

                const current = this._foodHash.getCellCount(cx, cy);
                if (current < localMax) {
                    const toAdd = initialFill
                        ? (localMax - current)
                        : Math.min(2, localMax - current);

                    for (let n = 0; n < toAdd; n++) {
                        const x = cx * cs + Math.random() * cs;
                        const y = cy * cs + Math.random() * cs;
                        const safeX = Math.max(5, Math.min(CFG.WORLD_W - 5, x));
                        const safeY = Math.max(5, Math.min(CFG.WORLD_H - 5, y));
                        this._spawnFood(safeX, safeY, randHue());
                        dirty.add(key);
                    }
                }
            }
        }

        // Rebuild binary strings for all sectors that changed
        dirty.forEach(k => this._refreshSector(k));
    }

    /** Pre-bake food sectors around a spawn point — prevents "void" on join. */
    private _prebakeSectorsAround(x: number, y: number) {
        const cs    = CFG.SECTOR_SIZE;
        const range = Math.ceil(CFG.AOI_RADIUS / cs);
        const cx0   = Math.floor(x / cs);
        const cy0   = Math.floor(y / cs);
        const dirty = new Set<string>();

        for (let dx = -range; dx <= range; dx++) {
            for (let dy = -range; dy <= range; dy++) {
                const cx  = cx0 + dx;
                const cy  = cy0 + dy;
                if (cx < 0 || cy < 0) continue;
                if (cx >= Math.floor(CFG.WORLD_W / cs)) continue;
                if (cy >= Math.floor(CFG.WORLD_H / cs)) continue;
                dirty.add(`${cx},${cy}`);
            }
        }
        dirty.forEach(k => this._refreshSector(k));
    }

    // ── Snake Helpers ──────────────────────────────────────────────────────────

    private _createPlayerSnake(sessionId: string, name: string, skin: string): Snake {
        const snake       = new Snake();
        snake.id          = sessionId;
        snake.x           = rand(300, CFG.WORLD_W - 300);
        snake.y           = rand(300, CFG.WORLD_H - 300);
        snake.angle       = Math.random() * Math.PI * 2;
        snake.targetAngle = snake.angle;
        snake.skin        = skin;
        snake.name        = name;
        snake.alive       = true;
        snake.score       = CFG.INITIAL_SCORE; 
        snake.width       = 10; 
        
        // Ensure segments start with the correct initial length
        for (let i = 0; i < CFG.INITIAL_LENGTH; i++) {
            const seg = new Segment();
            seg.x = snake.x - Math.cos(snake.angle) * i * CFG.SEGMENT_SPACING;
            seg.y = snake.y - Math.sin(snake.angle) * i * CFG.SEGMENT_SPACING;
            snake.segments.push(seg);
        }
        return snake;
    }

    private _growSnake(snake: Snake, amount: number) {
        snake.score += amount;
    }

    private _explodeSnake(snake: Snake) {
        const dirty = new Set<string>();
        for (let i = 0; i < snake.segments.length; i += 4) {
            const s = snake.segments[i];
            const food = this._spawnFood(
                s.x + (Math.random() - 0.5) * 10,
                s.y + (Math.random() - 0.5) * 10,
                randHue(),
                1
            );
            const cx  = Math.floor(food.x / CFG.SECTOR_SIZE);
            const cy  = Math.floor(food.y / CFG.SECTOR_SIZE);
            dirty.add(`${cx},${cy}`);
        }
        dirty.forEach(k => this._refreshSector(k));
    }

    private _killSnake(snake: Snake, killerName?: string) {
        snake.alive = false;
        this._explodeSnake(snake);

        const client = this.clients.find(c => c.sessionId === snake.id);
        if (client) {
            client.send('player_died', { 
                score: Math.floor(snake.score),
                killerName: killerName || 'Unknown Player'
            });
            // Allow time for message to reach client before forcing disconnect
            setTimeout(() => {
                if (client.state === 1) client.leave();
            }, 500);
        }
        this.broadcast('player_died', { sessionId: snake.id });
    }
}
