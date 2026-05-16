import { SKINS } from './config.js';

export class UIManager {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.selectedSkin = 'neon-blue';
        this.setupListeners();
    }

    setupListeners() {
        this.customColors = ['#ff0090', '#000000'];

        // Skin Selection
        document.querySelectorAll('.skin-card').forEach(card => {
            card.onclick = () => {
                document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.selectedSkin = card.dataset.skin;
                document.getElementById('skinSelectionModal').style.display = 'none';
            };
        });


        // Open Skin Modal
        const btnOpenSkin = document.getElementById('btnOpenSkinModal');
        if (btnOpenSkin) {
            btnOpenSkin.onclick = () => {
                document.getElementById('skinSelectionModal').style.display = 'flex';
                this._updateStudioPreview();
            };
        }

        // Color Picker Real-time Preview
        const colorPicker = document.getElementById('studioColor');
        if (colorPicker) {
            colorPicker.oninput = () => {
                this._updateStudioPreview(colorPicker.value);
            };
        }

        // Skin Studio Logic
        const btnAddColor = document.getElementById('btnAddColor');
        if (btnAddColor) {
            btnAddColor.onclick = () => {
                if (this.customColors.length >= 10) {
                    alert("Maximum 10 colors allowed for custom skins!");
                    return;
                }
                this.customColors.push(document.getElementById('studioColor').value);
                this._updateStudioPreview();
            };
        }

        const btnClear = document.getElementById('btnStudioClear');
        if (btnClear) {
            btnClear.onclick = () => {
                this.customColors = [];
                this._updateStudioPreview();
            };
        }

        const btnSave = document.getElementById('btnStudioSave');
        if (btnSave) {
            btnSave.onclick = () => {
                if (this.customColors.length === 0) this.customColors = ['#ffffff', '#000000'];
                
                this.selectedSkin = 'custom_' + this.customColors.join('_');
                
                // Deselect all presets
                document.querySelectorAll('.skin-card').forEach(c => c.classList.remove('active'));
                
                document.getElementById('skinSelectionModal').style.display = 'none';
            };
        }

        // Play Button
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.onclick = () => {
                const name = document.getElementById('playerName').value || "Player";
                this.gameRunning = true;
                this.callbacks.onStart(name, this.selectedSkin);
            };
        }

        // Restart Button
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) {
            restartBtn.onclick = () => this.callbacks.onRestart();
        }

        // Menu Button
        const menuBtn = document.getElementById('menuBtn');
        if (menuBtn) {
            menuBtn.onclick = () => this.showMenu();
        }
        // Chat Toggle
        const chatBtn = document.getElementById('chatButton');
        const chatPanel = document.getElementById('chatPanel');
        const closeChat = document.getElementById('closeChat');
        
        if (chatBtn && chatPanel) {
            chatBtn.onclick = () => {
                const isVisible = chatPanel.style.display === 'flex';
                chatPanel.style.display = isVisible ? 'none' : 'flex';
                if (!isVisible) {
                    document.getElementById('chatInput').focus();
                    document.getElementById('chatNotify').style.display = 'none'; // Clear notification
                }
            };
            closeChat.onclick = () => chatPanel.style.display = 'none';
        }

        // Send Chat
        const sendBtn = document.getElementById('sendChat');
        const chatInput = document.getElementById('chatInput');
        if (sendBtn && chatInput) {
            const sendMessage = () => {
                const msg = chatInput.value.trim();
                if (msg) {
                    if (this.callbacks.onChat) this.callbacks.onChat(msg);
                    chatInput.value = '';
                }
            };
            sendBtn.onclick = sendMessage;
            chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };
        }
    }

    showMenu() {
        document.getElementById('deathScreen').style.display = 'none';
        document.getElementById('hud').style.display = 'none';
        document.getElementById('leaderboard').style.display = 'none';
        document.getElementById('minimap').style.display = 'none';
        document.getElementById('boostIndicator').style.display = 'none';
        document.getElementById('boostBtn').style.display = 'none';
        document.getElementById('joystickZone').style.display = 'none';
        document.getElementById('menu').style.display = 'flex';
    }

    showGame() {
        document.getElementById('deathScreen').style.display = 'none';
        document.getElementById('menu').style.display = 'none';
        document.getElementById('hud').style.display = 'flex';
        document.getElementById('leaderboard').style.display = 'block';
        document.getElementById('minimap').style.display = 'block';
        document.getElementById('boostIndicator').style.display = 'block';
        document.getElementById('debugOverlay').style.display = 'none'; // Disabled by default
        document.getElementById('chatButton').style.display = 'flex';
        
        // Show touch controls if it's a touch device, or always show for testing
        // We will just show the boost button always when playing
        document.getElementById('boostBtn').style.display = 'flex';
        document.getElementById('joystickZone').style.display = 'block';
    }

    showDeath(score, killerName) {
        document.getElementById('deathStats').innerHTML = `
            <div>Score: <strong>${score}</strong></div>
            <div style="margin-top: 10px; font-size: 0.9rem; color: var(--neon-pink);">Eliminated by: <strong style="color: white; letter-spacing: 1px;">${killerName}</strong></div>
        `;
        setTimeout(() => {
            document.getElementById('deathScreen').style.display = 'flex';
        }, 800);
    }

    showDisconnect() {
        document.getElementById('disconnectOverlay').style.display = 'flex';
    }

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    updateHUD(snake, room, foodsSize, sectorsSize) {
        if (room) {
            document.getElementById('debugRoom').textContent = room.id;
            document.getElementById('debugSession').textContent = room.sessionId;
        }

        if (!snake) {
            document.getElementById('scoreDisplay').textContent = "0";
            document.getElementById('lengthDisplay').textContent = "0";
            return;
        }

        document.getElementById('scoreDisplay').textContent = Math.floor(snake.score);
        document.getElementById('lengthDisplay').textContent = snake.segments ? snake.segments.length : 0;
        
        document.getElementById('debugAOI').textContent = "1400px";
        document.getElementById('debugSectors').textContent = sectorsSize;
        document.getElementById('debugTotalFood').textContent = foodsSize;

        // Performance
        if (arguments[4]) {
            const perf = arguments[4];
            document.getElementById('debugFPS').textContent = perf.fps;
            document.getElementById('debugTPS').textContent = perf.tps;
            document.getElementById('debugPing').textContent = perf.ping;
        }
    }

    addChatMessage(sender, message, color) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        const msgEl = document.createElement('div');
        // Sender name is now white, with a small indicator of their skin color next to it
        msgEl.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color}; margin-right:5px;"></span><strong style="color:#ffffff">${sender}:</strong> <span style="color:#ccc; margin-left:4px;">${message}</span>`;
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
        
        // Show red notification dot if panel is closed
        const chatPanel = document.getElementById('chatPanel');
        const chatNotify = document.getElementById('chatNotify');
        if (chatPanel && chatPanel.style.display !== 'flex') {
            chatNotify.style.display = 'block';
        }
    }

    updateLeaderboard(snakes, myId) {
        const entries = [];
        snakes.forEach((s, sid) => {
            if (s.alive) {
                entries.push({ name: s.name, len: s.segments.length, isYou: sid === myId });
            }
        });
        entries.sort((a, b) => b.len - a.len);

        const el = document.getElementById('lbEntries');
        if (!el) return;
        el.innerHTML = entries.slice(0, 6).map((e, i) => `
            <div class="lb-entry ${e.isYou ? 'you' : ''}">
                <span><span class="lb-rank">${i + 1}.</span>${e.name}</span>
                <span>${e.len}</span>
            </div>
        `).join('');
    }

    _updateStudioPreview(pendingColor = null) {
        const preview = document.getElementById('studioPreview');
        const list = document.getElementById('studioColorList');
        
        // Update swatches with a "delete" button
        list.innerHTML = this.customColors.map((c, i) => 
            `<div class="color-swatch" style="background:${c}; position:relative;">
                <div class="remove-color" data-index="${i}" style="position:absolute; top:-10px; right:-10px; width:18px; height:18px; background:#ff003c; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; cursor:pointer; border:1px solid rgba(255,255,255,0.3); box-shadow: 0 0 10px rgba(255,0,60,0.5);">×</div>
            </div>`
        ).join('');

        // Attach click listeners to remove-color buttons
        list.querySelectorAll('.remove-color').forEach(btn => {
            btn.onclick = (e) => {
                const idx = parseInt(btn.dataset.index);
                this.customColors.splice(idx, 1);
                this._updateStudioPreview();
            };
        });

        const displayColors = [...this.customColors];
        if (pendingColor) displayColors.push(pendingColor);

        // Update preview bar
        if (displayColors.length > 0) {
            const stops = [];
            displayColors.forEach((c, i) => {
                stops.push(`${c} ${i*12}px, ${c} ${(i+1)*12}px`);
            });
            preview.style.background = `repeating-linear-gradient(90deg, ${stops.join(', ')})`;
            preview.innerHTML = ''; // Ensure no eyes or other elements
        } else {
            preview.style.background = '#222';
            preview.innerHTML = '';
        }
    }
}
