# 🐍 Slither.io Clone

A full-featured Slither.io clone with **Offline** and **Online (Colyseus)** modes.

---

## 📁 Project Structure

```
slither-clone/
├── offline/
│   └── index.html          ← Complete standalone game (open in browser, no server needed)
│
└── online/
    ├── client/
    │   ├── index.html       ← Online game client (requires Colyseus server)
    │   └── game-client.js   ← Client logic: prediction, interpolation, rendering
    │
    └── server/
        ├── package.json
        └── src/
            ├── index.js     ← Express + Colyseus server entry point
            └── SlitherRoom.js ← Authoritative game room (full physics + collision)
```

---

## 🎮 Offline Mode

Just open `offline/index.html` in any modern browser. No installation required.

**Features:**
- Full Slither.io gameplay with 5 AI bots
- 3 skins: Neon Blue, Classic Green, Striped
- Boost system with mass shedding
- Glow effects, minimap, leaderboard
- Death screen with stats

---

## 🌐 Online Mode (Colyseus)

### Server Setup

```bash
cd online/server
npm install
node src/index.js
```

Server starts on `ws://localhost:2567`  
Admin panel: `http://localhost:2567/colyseus`

### Client Setup

Open `online/client/index.html` in a browser, or serve it with any static file server:

```bash
cd online/client
npx serve .
# or
python3 -m http.server 8080
```

Then set the Server URL to `ws://localhost:2567` and click **JOIN GAME**.

---

## 🕹️ Controls

| Action | Input |
|--------|-------|
| Steer  | Mouse cursor |
| Boost  | Hold **Left Click** or **Space** |
| Mobile | Touch + drag |

---

## 🏗️ Architecture

### Offline
- Single-file HTML/CSS/JS
- All logic runs client-side
- 5 AI bots with food-seeking behavior

### Online (Client-Server)
```
Client                          Server (Colyseus)
──────                          ─────────────────
send input (angle, boost) ───► SlitherRoom._tick()
                                  ├─ move all snakes
                                  ├─ check collisions
                                  └─ broadcast state
                         ◄─── state (players, food)
                         ◄─── leaderboard (2s interval)
                         ◄─── player_died / food_eaten
```

- **Client-side prediction**: local snake moves instantly without waiting for server
- **Server reconciliation**: client lerps toward server position each frame
- **20 Hz tick rate** server-side, state sent every 50ms
- **Authoritative server**: collision and scoring happen server-side only

---

## 🚀 Production Deployment

1. Set `process.env.PORT` for the server (default: 2567)
2. Use **nginx** as a reverse proxy to expose port 80/443
3. Update `serverUrl` default in `client/index.html` to your server domain
4. Use `wss://` (secure WebSocket) in production

```nginx
location /colyseus {
    proxy_pass http://localhost:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

---

## 📦 Dependencies

### Server
- `@colyseus/core` — multiplayer framework
- `@colyseus/ws-transport` — WebSocket transport
- `@colyseus/monitor` — admin dashboard
- `express` — HTTP server

### Client
- `colyseus.js` (loaded from CDN) — Colyseus client SDK
- Zero other dependencies — pure Vanilla JS + Canvas API
