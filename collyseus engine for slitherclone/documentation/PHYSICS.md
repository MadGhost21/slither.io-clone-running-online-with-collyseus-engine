# 🐍 Snake Physics & Movement

### Movement Logic
*   **Constant Velocity**: Snakes move forward every tick.
*   **Base Speed**: 7.5px per tick (375px per second).
*   **Boost Speed**: 15.0px per tick (750px per second).

### Turning Agility
Agility is mass-dependent. We use a power-scale formula to allow large snakes to stay flexible:
`turnSpeed = BASE_TURN_SPEED * (BASE_WIDTH / currentWidth)^0.15`
*   **Coiling**: The **0.15** exponent is the "sweet spot" that allows snakes to wrap around their own bodies without a large "hole" in the middle.

### Boosting Cost
*   **Energy Drain**: Boosting reduces your score by **2–4 points** every 4 ticks.
*   **Remnants**: The lost score is dropped as a 2-point food pellet at the snake's tail, creating a trail for others to eat.
