// SpatialHash.ts — ported from Orbioo Engine (AgarioSocketRoom v1.4.5)
// Generic O(1) spatial lookup grid. Works for any entity with x, y, radius.

export interface Hashable {
    x: number;
    y: number;
    radius: number;
}

export class SpatialHash<T extends Hashable> {
    private cellSize: number;
    private cells: Map<string, T[]>;

    constructor(cellSize: number = 250) {
        this.cellSize = cellSize;
        this.cells    = new Map();
    }

    private getCellKey(cx: number, cy: number): string {
        return `${cx},${cy}`;
    }

    getCellCount(cx: number, cy: number): number {
        return this.cells.get(this.getCellKey(cx, cy))?.length || 0;
    }

    clear() {
        this.cells.clear();
    }

    rebuild(entities: T[]) {
        this.cells.clear();
        for (const entity of entities) this.insert(entity);
    }

    insert(entity: T) {
        const xStart = Math.floor((entity.x - entity.radius) / this.cellSize);
        const xEnd   = Math.floor((entity.x + entity.radius) / this.cellSize);
        const yStart = Math.floor((entity.y - entity.radius) / this.cellSize);
        const yEnd   = Math.floor((entity.y + entity.radius) / this.cellSize);

        for (let x = xStart; x <= xEnd; x++) {
            for (let y = yStart; y <= yEnd; y++) {
                const key = `${x},${y}`;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key)!.push(entity);
            }
        }
    }

    remove(entity: T) {
        const xStart = Math.floor((entity.x - entity.radius) / this.cellSize);
        const xEnd   = Math.floor((entity.x + entity.radius) / this.cellSize);
        const yStart = Math.floor((entity.y - entity.radius) / this.cellSize);
        const yEnd   = Math.floor((entity.y + entity.radius) / this.cellSize);

        for (let x = xStart; x <= xEnd; x++) {
            for (let y = yStart; y <= yEnd; y++) {
                const key = `${x},${y}`;
                const bucket = this.cells.get(key);
                if (bucket) {
                    const idx = bucket.indexOf(entity);
                    if (idx !== -1) bucket.splice(idx, 1);
                    if (bucket.length === 0) this.cells.delete(key);
                }
            }
        }
    }

    /** Returns a deduplicated array of all entities near (x, y) within radius. */
    query(x: number, y: number, radius: number): T[] {
        const startX = Math.floor((x - radius) / this.cellSize);
        const endX   = Math.floor((x + radius) / this.cellSize);
        const startY = Math.floor((y - radius) / this.cellSize);
        const endY   = Math.floor((y + radius) / this.cellSize);

        const results = new Set<T>();
        for (let i = startX; i <= endX; i++) {
            for (let j = startY; j <= endY; j++) {
                const bucket = this.cells.get(`${i},${j}`);
                if (bucket) for (const item of bucket) results.add(item);
            }
        }
        return Array.from(results);
    }
}
