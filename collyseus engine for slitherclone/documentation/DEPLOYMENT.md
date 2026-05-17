# 🚀 Deployment & Scaling

### Server Specs (Estimated for 20 Players)
*   **RAM**: 120MB - 200MB.
*   **CPU**: 0.1 - 0.2 vCPU (at 20Hz tick rate).
*   **OS**: Linux (Ubuntu 22.04 recommended) or Windows.

### Configuration
Adjust `CFG` in `SlitherRoom.ts` to tune the game:
*   `WORLD_W / WORLD_H`: Increase for more space.
*   `TICK_RATE`: Set to 20 for standard play. Higher values increase CPU usage but improve responsiveness.
*   `maxClients`: Currently set to **20**.
