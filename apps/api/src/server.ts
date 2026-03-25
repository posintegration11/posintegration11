import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { setupSocketIo } from "./socket/setup.js";
import { setIoInstance } from "./realtime.js";

export function startServer() {
  const env = getEnv();
  const app = createApp();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });

  setupSocketIo(io);
  setIoInstance(io);

  httpServer.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

  return httpServer;
}
