import {
    defineServer,
    defineRoom,
    monitor,
    playground,
    createRouter,
    createEndpoint,
} from "colyseus";
import cors from "cors";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Import your Room files
 */
import { SlitherRoom } from "./rooms/SlitherRoom.js";


const server = defineServer({
    /**
     * Define your room handlers:
     */
    rooms: {
        slitherroom: defineRoom(SlitherRoom),
    },

    /**
     * Experimental: Define API routes. Built-in integration with the "playground" and SDK.
     */
    routes: createRouter({
        api_hello: createEndpoint("/api/hello", { method: "GET", }, async (ctx) => {
            return { message: "Hello World" }
        })
    }),

    /**
     * Bind your custom express routes here:
     */
    express: (app) => {
        const allowedOrigins = IS_PRODUCTION ? ["https://your-domain.com"] : true; 

        app.use(cors({ origin: allowedOrigins, credentials: true }));
        app.get("/hi", (req, res) => {
            res.send("SlitherClone Engine Active.");
        });

        app.use("/monitor", monitor());

        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }

});

export default server;