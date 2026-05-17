# ⚡ Optimization & Data Protocols

### Binary Food Sync (The 3-Byte Protocol)
To support 20+ players and 1,000+ food pellets, we avoid sending JSON objects for food.
*   **Format**: Each pellet is encoded into 3 bytes: `[relX, relY, hue/2]`.
*   **Batching**: All pellets in a 250px sector are packed into a single `Uint8Array`.
*   **Transport**: The array is converted to a **Base64 string** and sent as one field in the schema. This reduces packet size by over 80%.

### AOI (Area of Interest)
*   **Radius**: 1400px.
*   **Filtering**: The server tracks which sectors are visible to each client. It only sends updates for snakes and food within that player's "view bubble."
*   **Efficiency**: This allows a massive map to run smoothly even on mobile devices with limited bandwidth.
