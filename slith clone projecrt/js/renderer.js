import { CFG, SKINS } from './config.js';

export class Renderer {
    constructor(canvas, mmCanvas) {
        if (!canvas) throw new Error("Renderer Error: gameCanvas not found in DOM!");
        if (!mmCanvas) throw new Error("Renderer Error: minimapCanvas not found in DOM!");

        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mmCanvas = mmCanvas;
        this.mmCtx = mmCanvas.getContext('2d');
    }

    render(visualSnakes, foods, myId) {
        let hx = 0, hy = 0;
        const mySync = visualSnakes.get(myId);
        if (mySync && mySync.segments.length > 0) {
            hx = mySync.segments[0].x;
            hy = mySync.segments[0].y;
        }

        const camX = hx - window.innerWidth / 2;
        const camY = hy - window.innerHeight / 2;

        this.clear();
        this.drawGrid(camX, camY);
        foods.forEach(f => this.drawFood(f, camX, camY));
        visualSnakes.forEach(s => this.drawSnake(s, camX, camY));
        this.drawMinimap(foods, visualSnakes, myId);
    }

    clear() {
        this.ctx.fillStyle = '#050a0f';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawGrid(camX, camY) {
        const size = 60;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        // Optimised grid drawing: only draw what's visible
        const startX = Math.floor(camX / size) * size;
        const startY = Math.floor(camY / size) * size;
        
        for (let x = startX; x <= startX + this.canvas.width + size; x += size) {
            this.ctx.moveTo(x - camX, 0);
            this.ctx.lineTo(x - camX, this.canvas.height);
        }
        for (let y = startY; y <= startY + this.canvas.height + size; y += size) {
            this.ctx.moveTo(0, y - camY);
            this.ctx.lineTo(this.canvas.width, y - camY);
        }
        this.ctx.stroke();

        // Border
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.5)';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(-camX, -camY, CFG.WORLD_W, CFG.WORLD_H);
        this.ctx.restore();
    }

    drawFood(f, camX, camY) {
        const screenX = f.x - camX;
        const screenY = f.y - camY;
        const r = 4;

        if (screenX < -r || screenX > this.canvas.width + r || screenY < -r || screenY > this.canvas.height + r) return;

        this.ctx.save();
        this.ctx.shadowColor = f.color;
        this.ctx.shadowBlur = 15;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, r, 0, Math.PI * 2);
        this.ctx.fillStyle = f.color;
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, r * 0.4, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.fill();
        this.ctx.restore();
    }

    drawSnake(snake, camX, camY) {
        if (!snake.alive || snake.segments.length < 2) return;

        let skin = SKINS[snake.skin];
        if (!skin && snake.skin && snake.skin.startsWith('custom_')) {
            const colors = snake.skin.split('_').slice(1);
            if (colors.length > 0) {
                skin = { colors: colors, glow: colors[0], striped: true };
            }
        }
        if (!skin) skin = SKINS['neon-blue'];

        const seg = snake.segments;
        const w = snake.width;

        this.ctx.save();
        this.ctx.shadowColor = skin.glow;
        this.ctx.shadowBlur = snake.boosting ? 30 : 15;

        // Body
        for (let i = seg.length - 1; i > 0; i--) {
            const t = i / seg.length;
            const sw = w * (0.5 + 0.5 * (1 - t * 0.5));
            const col = skin.striped ? skin.colors[Math.floor(i / 6) % skin.colors.length] : this.lerpColor(skin.colors[1], skin.colors[0], 1 - t);

            this.ctx.beginPath();
            this.ctx.moveTo(seg[i].x - camX, seg[i].y - camY);
            this.ctx.lineTo(seg[i - 1].x - camX, seg[i - 1].y - camY);
            this.ctx.strokeStyle = col;
            this.ctx.lineWidth = sw;
            this.ctx.lineCap = 'round';
            this.ctx.stroke();
        }

        // Head
        this.ctx.beginPath();
        this.ctx.arc(seg[0].x - camX, seg[0].y - camY, w * 0.65, 0, Math.PI * 2);
        this.ctx.fillStyle = skin.colors[0];
        this.ctx.fill();

        // Eyes
        this.drawEyes(seg[0], snake.angle, w, camX, camY);

        // Name
        this.ctx.shadowBlur = 0;
        this.ctx.font = `bold ${Math.max(10, w * 0.8)}px Rajdhani`;
        this.ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(snake.name, seg[0].x - camX, seg[0].y - camY - w - 6);

        this.ctx.restore();
    }

    drawEyes(head, angle, w, camX, camY) {
        const eyeOffset = w * 0.35;
        const eyeRadius = w * 0.18;
        for (const ea of [angle - 0.6, angle + 0.6]) {
            const ex = head.x - camX + Math.cos(ea) * eyeOffset;
            const ey = head.y - camY + Math.sin(ea) * eyeOffset;
            this.ctx.beginPath();
            this.ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
            this.ctx.fillStyle = '#fff';
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(ex + Math.cos(angle) * eyeRadius * 0.4, ey + Math.sin(angle) * eyeRadius * 0.4, eyeRadius * 0.5, 0, Math.PI * 2);
            this.ctx.fillStyle = '#000';
            this.ctx.fill();
        }
    }

    drawMinimap(foods, snakes, myId) {
        const ms = CFG.MINIMAP_SIZE;
        const sx = ms / CFG.WORLD_W;
        const sy = ms / CFG.WORLD_H;

        this.mmCtx.fillStyle = 'rgba(5,10,15,0.9)';
        this.mmCtx.fillRect(0, 0, ms, ms);

        foods.forEach(f => {
            this.mmCtx.fillStyle = f.color;
            this.mmCtx.fillRect(f.x * sx - 1, f.y * sy - 1, 2, 2);
        });

        snakes.forEach((s, sid) => {
            if (!s.alive) return;
            if (sid === myId) {
                this.mmCtx.fillStyle = '#fff';
                this.mmCtx.beginPath();
                this.mmCtx.arc(s.segments[0].x * sx, s.segments[0].y * sy, 3, 0, Math.PI * 2);
                this.mmCtx.fill();
            } else {
                let skin = SKINS[s.skin];
                if (!skin && s.skin && s.skin.startsWith('custom_')) {
                    const colors = s.skin.split('_').slice(1);
                    if (colors.length > 0) skin = { colors: colors, glow: colors[0], striped: true };
                }
                if (!skin) skin = SKINS['neon-blue'];
                this.mmCtx.fillStyle = skin.colors[0];
                this.mmCtx.fillRect(s.segments[0].x * sx - 2, s.segments[0].y * sy - 2, 4, 4);
            }
        });
    }

    lerpColor(a, b, t) {
        const ah = parseInt(a.replace('#', ''), 16), bh = parseInt(b.replace('#', ''), 16);
        const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
        const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
        return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
    }
}
