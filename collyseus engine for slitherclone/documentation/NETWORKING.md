# 🌐 Networking Architecture

Strand.io uses an **Authoritative Server** model built on **Colyseus.js**.

### Key Concepts:
1.  **State Synchronization**: The server maintains the "source of truth." Every 50ms (20Hz), it broadcasts a patch representing the changes in the world.
2.  **Room Handling**: The `strand_io` room handles matchmaking, player lifecycle (Join/Leave), and message routing.
3.  **Command Pattern**: The client sends "Input" messages (`targetAngle` and `boosting` boolean). The server validates these and updates the physics state accordingly.
4.  **Lag Compensation**: While the server is authoritative, the room uses a high-precision `setSimulationInterval` to ensure all players move at the exact same pace regardless of their local latency.
