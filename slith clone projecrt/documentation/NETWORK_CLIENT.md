# 🌐 Network Client & Sync

### Colyseus Integration
The client uses the `colyseus.js` library to connect to the `strand_io` room.

### State Handling
*   **Initial Sync**: When joining, the client receives the full world state.
*   **Differential Updates**: The server only sends "patches" (what changed).
*   **Listeners**: The client uses `onAdd` and `onRemove` listeners to efficiently manage the local `Map` of snakes.

### Lag Interpolation
To hide the 50ms gaps between server updates:
1.  The client stores a "Visual Position."
2.  Every frame, `VisualX = VisualX + (ServerX - VisualX) * 0.2`.
3.  This makes the motion look continuous and liquid.
