# 🍏 Food Economy & Spawning

### Global Density
The world (4000x4000) is divided into **256 sectors**. Each sector maintains a target density of **4 pellets**.

### Spawning Algorithm
1.  **Replenishment**: Every 5–10 seconds (randomly), the server scans all sectors.
2.  **Balancing**: If a sector is below its target, it spawns up to 2 new pellets.
3.  **Pellet Values**: Standard pellets are worth **1–4 points**.
4.  **Death Pellets**: When a snake dies, its total score is converted into high-value pellets (value 10+) scattered along its former path.

### Collision Detection
The engine uses a **Spatial Hash** to check collisions. Instead of checking every snake against every food, it only queries the 250px grid cell containing the snake's head.
