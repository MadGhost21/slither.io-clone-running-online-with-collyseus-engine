🌌 SlitherClone.io — Authoritative Neon Multiplayer Engine
An ultra-performance, authoritative multiplayer snake engine styled with a premium neon electric blue aesthetic. Built on a headless Node.js game server using Colyseus.js and rendered via a high-performance HTML5 Canvas 2D client, this project implements modern networking optimization architectures to host up to 20 concurrent players per room smoothly at 60 FPS+.

🗺️ System Architecture
🏗️ Technical Architecture Details
1. Authoritative Game Loop (20Hz Engine Tick)
To prevent client-side speedhacking or injection exploits, the game uses a pure authoritative server model:

Inputs Only: The client never tells the server its coordinates. It only sends control inputs: targetAngle (radians) and boosting (boolean).
Server Authority: The server runs at 20 Ticks Per Second (20Hz). It calculates the physics, handles body segment placement, evaluates boundaries, registers head-to-body collisions, and distributes points.
Client Rendering: The client reads the server state and smoothly moves the visual models using Lag Interpolation (LERP).
🚀 2. Locomotion, Boosting & Agility Physics
🔄 Mass-Dampened Turning Agility
Unlike basic snake games, turning circle radii scale dynamically with player mass to balance gameplay between giant snakes and agile newborns. $$\text{turnSpeed} = \text{BASE_TURN_SPEED} \times \left( \frac{\text{BASE_WIDTH}}{\text{Current Width}} \right)^{0.15}$$

The $0.15$ exponent is a carefully balanced coefficient allowing huge snakes to execute tight "coiling" circles while still maintaining clear mechanical limitations for massive sizes.
⚡ Boosting Penalty & Trails
Sprinting speed: Boost speeds are set to 2x base velocity (from 7.5 to 15.0 units per tick).
Cost: Boosting drains 2 to 4 points randomly every 4 ticks.
Trail Generation: Drained score is spawned immediately behind the snake's tail as standard 2-point food pellets, rewarding pursuing players and introducing tactical choice.
🍏 3. Spatial Partitioning & The Binary Food Protocol
Syncing thousands of food items over JSON typically saturates network bandwidth. This codebase avoids standard JSON serialization in favor of two modern protocols:

1. Area of Interest (AOI) Filtering
The 4000x4000 game world is divided into $250\text{px} \times 250\text{px}$ Sectors.
The engine tracks a $1400\text{px}$ "view bubble" (AOI) around each active player head.
The server only sends network updates for entities located in sectors overlapping this bubble.
2. The 3-Byte Binary Food Protocol
Each food pellet's attributes are packed into exactly 3 bytes of a Uint8Array to minimize packet size:

Byte 1 (relX): X position relative to its sector's top-left corner ($0\text{px} - 255\text{px}$).
Byte 2 (relY): Y position relative to its sector's top-left corner ($0\text{px} - 255\text{px}$).
Byte 3 (hue/2): Color spectrum index ($0 - 127$). This binary payload is batch-processed into a highly compact Base64 string representing the entire sector's food state, reducing network footprint by over 80%.
🔌 4. Client Interpolation (LERP)
Because the engine ticks at 20Hz (50ms intervals), the movement would look like a slideshow without lag compensation. The client visualizer implements a linear interpolation algorithm: $$\text{VisualX} = \text{VisualX} + (\text{ServerX} - \text{VisualX}) \times 0.2$$ This ensures the visual client displays buttery smooth 60 FPS+ animation even under volatile ping times or network jitters.

🎮 5. Input Isolation & UI System
Accidental Boost Protection: The client mouse and touch listeners feature element-level filtering. Clicking or dragging inside the Virtual Joystick zone, Global Chat button, or Skin Studio prevents the system from triggering speed boosts, saving player energy.
Neon Electric Theme: Handcrafted with HSL gradients, glassmorphic UI panels, a real-time minimap, custom skin selection, and mobile-responsive viewport scaling.
🛠️ Installation & Launch
Prerequisites
Node.js (v16+ recommended)
1. Start the Backend Server (Colyseus)
bash
cd my-server
npm install
npm run dev
Runs on port 2567 by default with basic monitoring tools exposed at http://localhost:2567/monitor.

2. Launch the Client
bash
cd "slith clone projecrt"
# Open index.html using any static HTTP server (Live Server, http-server, or simply open in browser)
🖥️ Server Specifications (Est. 20 Concurrent Players)
CPU Core Allocation: 0.1 - 0.2 vCPU (Authoritative tick scale).
RAM Footprint: ~120MB - 180MB.
Bandwidth Usage: ~12KB/s - 25KB/s per active player.
