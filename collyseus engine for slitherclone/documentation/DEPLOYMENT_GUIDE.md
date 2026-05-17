# ♟ Royal Chess: Deployment & Connectivity Guide

This guide explains the current technical architecture of Royal Chess and provides a step-by-step roadmap for migrating the Colyseus game engine to a professional VPS (Virtual Private Server).

---

## ── 1. The Current Architecture ──

Royal Chess operates on an **Authoritative Server** model. This means the client (the browser) does not decide if a move is legal; it simply asks the server, and the server validates it.

### A. The Components
*   **Client (Frontend)**: Standard HTML/JS files that run in the user's browser. It uses the `colyseus.js` SDK to maintain a persistent WebSocket connection.
*   **Server (Backend)**: A Node.js application using `chess.js` for logic and `Colyseus` for state synchronization. It manages the rooms, timers, and game-over logic.

### B. The Connection Switcher
We have implemented a dynamic switcher in `index.html` located under the `<script>` tag:
```javascript
const IS_PRODUCTION = true; 
const STATIC_IP     = "105.96.79.179";
const SERVER_PORT   = "2567";
const SERVER_URL    = IS_PRODUCTION ? `ws://${STATIC_IP}:${SERVER_PORT}` : `ws://localhost:${SERVER_PORT}`;
```
*   **Development Mode**: When `IS_PRODUCTION` is `false`, the game connects to your own computer.
*   **Production Mode**: When `true`, it looks for the server at your Public/Static IP.

---

## ── 2. How Connectivity Works (Handshake) ──

1.  **WebSocket Handshake**: The browser sends a request to the server at IP:2567.
2.  **CORS Validation**: The server checks if the source domain is allowed. (Current setup: `app.use(cors())` allows ALL sources).
3.  **Room Entry**: The client calls `joinOrCreate("royalchess", options)`. 
4.  **State Sync**: The server sends the current FEN (Board state) and pieces to the client. The client renders the board.

---

## ── 3. Migrating to a VPS (Linux/Ubuntu) ──

When you are ready to move away from hosting on your local machine, follow these steps to deploy on a VPS (DigitalOcean, AWS, Linode, etc.):

### Step 1: Server Preparation
1.  **Install Node.js**: Use NVM to install the latest LTS version of Node.
2.  **Clone the Code**: Upload your `my-server` folder to the VPS via GitHub or SFTP.
3.  **Install Dependencies**: Run `npm install` inside the server folder.

### Step 2: Running in Production (PM2)
You don't want to run the server with a standard command that stops when you close the terminal. Use **PM2** (Process Manager 2):
```bash
sudo npm install -g pm2
pm2 start npm --name "royal-chess-server" -- run start
```
This ensures the server restarts automatically if it crashes or if the VPS reboots.

### Step 3: Firewall & Ports
Ensure the VPS firewall allows traffic on port `2567`:
```bash
sudo ufw allow 2567/tcp
```

### Step 4: Connecting the Frontend
1.  Get the **Public IP** of your new VPS.
2.  Update the `STATIC_IP` variable in your `index.html` to match the new VPS IP.
3.  Set `IS_PRODUCTION = true`.

---

## ── 4. Advanced: Moving to HTTPS (WSS) ──

If you want to host your site on a secure domain (e.g., `https://royalchess.com`), browsers will block `ws://` connections. You must use `wss://` (Secure WebSockets).

### Recommended Setup: Reverse Proxy (Nginx)
1.  Install **Nginx** on your VPS.
2.  Use **Certbot (Let's Encrypt)** to get a free SSL certificate.
3.  Configure Nginx to forward traffic from port `443` (HTTPS) to your Node application on port `2567`.

**Nginx Config Example:**
```nginx
location / {
    proxy_pass http://localhost:2567;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

---

## ── 5. Security Checklist ──

*   [ ] **CORS Restriction**: Once the frontend is hosted on a domain, change `app.use(cors())` to `app.use(cors({ origin: "https://yourdomain.com" }))`.
*   [ ] **Environment Variables**: Move sensitive items (like port numbers or keys) from `app.config.ts` into a `.env` file for the VPS.
*   [ ] **Monitoring**: Use the built-in Colyseus monitor (`/monitor`) to track active rooms and player counts in real-time.

---

**Gravity Deployment Status**: *Connectivity Ready. Local hosting active via Static IP. VPS ready for immediate migration.*
