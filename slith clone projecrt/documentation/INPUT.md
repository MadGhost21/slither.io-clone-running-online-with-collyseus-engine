# 🎮 Input & Controls

### Universal Directional Logic
The client calculates `targetAngle` based on:
*   **Desktop**: Mouse position relative to the center of the screen.
*   **Mobile**: Virtual Joystick position relative to its base.

### Precision Boosting
*   **Boost Filtering**: To prevent accidental energy loss, the `mousedown` handler ignores any clicks that occur on the **Joystick Zone** or the **Chat Button**.
*   **Activation**: Speed is triggered by holding the `Spacebar` or clicking anywhere else in the open game world.
