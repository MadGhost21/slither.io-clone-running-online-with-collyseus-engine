# 📺 Rendering Pipeline

### HTML5 Canvas 2D
Strand.io renders at 60fps (or your monitor's native refresh rate) using `requestAnimationFrame`.

### Drawing Layers:
1.  **Grid**: A low-opacity neon grid that scrolls with the camera.
2.  **Food**: Each pellet has a `shadowBlur` glow.
3.  **Snakes**: Rendered as a series of connected arcs. The head has eyes and a name tag.
4.  **Minimap**: A secondary canvas rendered at 1/33rd scale.

### Visual Effects
*   **Glow**: Heavy use of `ctx.shadowColor` for neon effects.
*   **LERP**: Visual positions are interpolated by 20% every frame toward server positions to ensure 60fps smoothness.
