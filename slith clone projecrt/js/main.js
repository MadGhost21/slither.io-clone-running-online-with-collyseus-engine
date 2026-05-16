import { CFG } from './config.js';
import { NetworkManager, decodeFoodSector } from './network.js';
import { Renderer } from './renderer.js';
import { UIManager } from './ui.js';

class SlitherGame {
    constructor() {
        this.snakes = new Map();
        this.visualSnakes = new Map();
        this.foods = new Map();
        this.foodsBySector = new Map();
        
        this.mouse = { x: 0, y: 0 };
        this.boosting = false;
        this.gameRunning = false;
        
        // Joystick State
        this.joystick = { active: false, touchId: null, baseX: 0, baseY: 0, angle: 0 };
        this.boostTouchId = null;

        // Performance Metrics
        this.fps = 0;
        this._frameCount = 0;
        this._fpsTimer = performance.now();
        const canvas = document.getElementById('gameCanvas');
        const mmCanvas = document.getElementById('minimapCanvas');
        this.renderer = new Renderer(canvas, mmCanvas);

        this.ui = new UIManager({
            onStart: (name, skin) => this.start(name, skin),
            onRestart: () => {
                const name = document.getElementById('playerName').value || "Player";
                this.start(name, this.ui.selectedSkin);
            },
            onChat: (msg) => this.net.sendChat(msg)
        });

        this.net = new NetworkManager({
            onSnakeAdd: (s, id) => this.snakes.set(id, s),
            onSnakeRemove: (s, id) => {
                this.snakes.delete(id);
            },
            onSectorUpdate: (key, data) => this.updateSector(key, data),
            onSectorRemove: (key) => this.removeSector(key),
            onReady: () => {
                this.ui.hideLoading();
                this.ui.showGame();
                this.gameRunning = true;
                this.loop(); // Start the loop ONLY when ready
            },
            onDeath: (score, killerName) => {
                this.gameRunning = false;
                this.ui.showDeath(score, killerName);
            },
            onDisconnect: (code) => {
                // If the game was actively running and we disconnected without a death message, it's a server disconnect.
                if (this.gameRunning) {
                    this.gameRunning = false;
                    this.ui.showDisconnect();
                }
                // If gameRunning is already false (e.g. from onDeath), we do nothing 
                // so the player can stay on the death screen.
            },
            onChat: (sender, msg, color) => this.ui.addChatMessage(sender, msg, color)
        });

        this.setupInput();
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    async start(name, skin) {
        this.ui.showLoading();
        
        // 🚀 FULL STATE PURGE: Prevent ghost data from previous rooms
        this.gameRunning = false;
        this.net.disconnect();
        this.snakes.clear();
        this.visualSnakes.clear();
        this.foods.clear();
        this.foodsBySector.clear();

        // Artificial "warm up" delay to ensure server cleans up old sessions before re-joining.
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            await this.net.connect('ws://localhost:2567', name, skin);
        } catch (e) {
            this.ui.hideLoading();
            this.ui.showDisconnect();
        }
    }

    updateSector(key, data) {
        if (data === undefined || data === null) return;
        
        // Clear old food from this sector
        const oldSector = this.foodsBySector.get(key);
        if (oldSector) oldSector.forEach(id => this.foods.delete(id));

        // 🐛 FOOD FIX: If data is empty string, it means the sector is empty now.
        if (data === "") {
            this.foodsBySector.delete(key);
            return;
        }

        const newFood = decodeFoodSector(data, key);
        
        // Add new food
        const sectorIds = [];
        newFood.forEach(f => {
            this.foods.set(f.id, f);
            sectorIds.push(f.id);
        });
        this.foodsBySector.set(key, sectorIds);
    }

    removeSector(key) {
        const sectorIds = this.foodsBySector.get(key);
        if (sectorIds) sectorIds.forEach(id => this.foods.delete(id));
        this.foodsBySector.delete(key);
    }

    setupInput() {
        window.addEventListener('mousemove', e => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        const setBoost = (val) => this.boosting = val;
        window.addEventListener('mousedown', (e) => {
            // Do not trigger boost if clicking on the joystick or the mobile boost button
            if (e.target.closest('#joystickZone') || e.target.closest('#boostBtn')) return;
            setBoost(true);
        });
        window.addEventListener('mouseup', () => setBoost(false));
        window.addEventListener('keydown', e => { if(e.code === 'Space') setBoost(true); });
        window.addEventListener('keyup', e => { if(e.code === 'Space') setBoost(false); });

        // Virtual Joystick (Fixed Bottom-Left)
        const zone = document.getElementById('joystickZone');
        const knob = document.getElementById('joystickKnob');
        const BASE_R = 70;
        const KNOB_R = 25;
        const MAX_D = BASE_R - KNOB_R;

        const onJoyStart = (e) => {
            if (!this.gameRunning) return;
            e.preventDefault();
            this.joystick.active = true;
            const rect = zone.getBoundingClientRect();
            this.joystick.baseX = rect.left + rect.width / 2;
            this.joystick.baseY = rect.top + rect.height / 2;
            onJoyMove(e);
        };

        const onJoyMove = (e) => {
            if (!this.joystick.active) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            let dx = touch.clientX - this.joystick.baseX;
            let dy = touch.clientY - this.joystick.baseY;
            const dist = Math.hypot(dx, dy);

            if (dist > MAX_D) {
                dx = (dx / dist) * MAX_D;
                dy = (dy / dist) * MAX_D;
            }

            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            this.joystick.angle = Math.atan2(dy, dx);
        };

        const onJoyEnd = (e) => {
            if (!this.joystick.active) return;
            this.joystick.active = false;
            knob.style.transform = `translate(0, 0)`;
        };

        zone.addEventListener('touchstart', onJoyStart, { passive: false });
        zone.addEventListener('touchmove', onJoyMove, { passive: false });
        zone.addEventListener('touchend', onJoyEnd, { passive: false });
        zone.addEventListener('touchcancel', onJoyEnd, { passive: false });

        // Support mouse dragging on joystick for desktop testing
        zone.addEventListener('mousedown', onJoyStart);
        document.addEventListener('mousemove', onJoyMove);
        document.addEventListener('mouseup', onJoyEnd);

        // Boost Button
        const bBtn = document.getElementById('boostBtn');
        const onBoostStart = (e) => { e.preventDefault(); this.boosting = true; bBtn.classList.add('active'); };
        const onBoostEnd = (e) => { e.preventDefault(); this.boosting = false; bBtn.classList.remove('active'); };

        bBtn.addEventListener('touchstart', onBoostStart, { passive: false });
        bBtn.addEventListener('touchend', onBoostEnd, { passive: false });
        bBtn.addEventListener('touchcancel', onBoostEnd, { passive: false });
        bBtn.addEventListener('mousedown', onBoostStart);
        bBtn.addEventListener('mouseup', onBoostEnd);
        bBtn.addEventListener('mouseleave', onBoostEnd);
    }

    resize() {
        this.renderer.canvas.width = window.innerWidth;
        this.renderer.canvas.height = window.innerHeight;
    }

    lerp(a, b, t) { return a + (b - a) * t; }

    updateInterpolation() {
        const LERP_FACTOR = 0.2;
        
        // Find local player ID
        let myId = this.net.sessionId;
        let mySync = this.snakes.get(myId);
        if (!mySync) {
            for (let s of this.snakes.values()) {
                if (s.id === myId) { myId = s.id; break; }
            }
        }

        this.snakes.forEach((sync, id) => {
            let vis = this.visualSnakes.get(id);
            if (!vis) {
                vis = { 
                    segments: sync.segments.map(s => ({x: s.x, y: s.y})),
                    x: sync.x, y: sync.y, angle: sync.angle, width: sync.width,
                    skin: sync.skin, name: sync.name
                };
                this.visualSnakes.set(id, vis);
            }

            // 🐛 JITTER FIX: We still interpolate the local player slightly to keep 60fps feel,
            // but we use a tighter factor if needed. For now, 0.2 is smooth.
            // If we snap (vis.x = sync.x), the game looks like 20Hz.
            if (id === myId) {
                // Remove the snap block to allow LERP below to handle it
            }

            vis.x = this.lerp(vis.x, sync.x, LERP_FACTOR);
            vis.y = this.lerp(vis.y, sync.y, LERP_FACTOR);
            vis.width = sync.width;
            vis.alive = sync.alive;
            vis.boosting = sync.boosting;

            let da = sync.angle - vis.angle;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            vis.angle += da * LERP_FACTOR;

            if (vis.segments.length !== sync.segments.length) {
                vis.segments = sync.segments.map((s, i) => vis.segments[i] ? {x: vis.segments[i].x, y: vis.segments[i].y} : {x: s.x, y: s.y});
            }
            for (let i = 0; i < vis.segments.length; i++) {
                vis.segments[i].x = this.lerp(vis.segments[i].x, sync.segments[i].x, LERP_FACTOR);
                vis.segments[i].y = this.lerp(vis.segments[i].y, sync.segments[i].y, LERP_FACTOR);
            }
        });
        for (let id of this.visualSnakes.keys()) if (!this.snakes.has(id)) this.visualSnakes.delete(id);
    }

    loop() {
        if (!this.gameRunning) return;
        requestAnimationFrame(() => this.loop());

        // FPS Calculation
        this._frameCount++;
        const now = performance.now();
        if (now - this._fpsTimer > 1000) {
            this.fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTimer = now;
        }

        // 🚀 AUTHENTIC ID (Matching v1 Style)
        const mySync = this.snakes.get(this.net.sessionId);

        if (mySync && mySync.alive) {
            let targetAngle;
            if (this.joystick.active) {
                targetAngle = this.joystick.angle;
            } else {
                const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
                targetAngle = Math.atan2(this.mouse.y - cy, this.mouse.x - cx);
            }
            this.net.sendInput(targetAngle, this.boosting);
        }

        this.updateInterpolation();
        
        // 📷 CAMERA FOLLOW (Fix: Use segments[0] as snake.x is only set on spawn)
        let hx = CFG.WORLD_W / 2;
        let hy = CFG.WORLD_H / 2;

        if (mySync && mySync.alive && mySync.segments && mySync.segments.length > 0) {
            hx = mySync.segments[0].x;
            hy = mySync.segments[0].y;
        }
        this.renderer.render(this.visualSnakes, this.foods, this.net.sessionId);
        this.ui.updateHUD(mySync, this.net.room, this.foods.size, this.foodsBySector.size, {
            fps: this.fps,
            tps: this.net.tps,
            ping: this.net.ping
        });
        this.ui.updateLeaderboard(this.snakes, this.net.sessionId);
    }
}

// Since main.js is loaded as a module at the bottom of the <body>, 
// the DOM is already ready. We can initialize immediately.
console.log("[Game] Initializing SlitherGame...");
window.game = new SlitherGame();
