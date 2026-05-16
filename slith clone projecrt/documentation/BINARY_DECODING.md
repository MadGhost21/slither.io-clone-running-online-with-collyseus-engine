# 🔢 Binary Food Decoding

The client receives food data as a Base64 string from the server to save bandwidth.

### Decoding Process:
1.  **Base64 → Bytes**: The string is converted back into a `Uint8Array`.
2.  **3-Byte Extraction**: Each food item is exactly 3 bytes.
    *   `Byte 0`: Relative X within the sector.
    *   `Byte 1`: Relative Y within the sector.
    *   `Byte 2`: Color index (Multiplied by 2 to get Hue).
3.  **Coordinate Calculation**:
    `FinalX = SectorOriginX + Byte0`
    `FinalY = SectorOriginY + Byte1`
