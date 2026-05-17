import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("string") color: string;
    @type("string") sessionId: string;
    @type("string") name: string;
}

export class ChessState extends Schema {
    @type("string") fen: string = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    @type({ map: Player }) players = new MapSchema<Player>();
    @type("string") turn: string = "w";
    @type("boolean") isStarted: boolean = false;
    @type("number") whiteTime: number = 600;
    @type("number") blackTime: number = 600;
}
