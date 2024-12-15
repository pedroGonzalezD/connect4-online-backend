import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import { createServer } from "node:http";
import { Server } from "socket.io";
import lobbySocket from "./sockets/lobby.js";
import gameSocket from "./sockets/game.js";
import cors from "cors";
import userRouter from "./router/userRouter.js";
import { FRONTEND_URL, MONGODB_URI } from "./config.js";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("Conectado a mongoDB"))
  .catch((err) => console.log("Error conectando a mongo db", err));

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

lobbySocket(io);

gameSocket(io);

app.get("/", (req, res) => {
  res.send("hello world!");
});

app.use("/api", userRouter);

// server.listen(5000, () => {
//   console.log("server listen:");
// });

export default app;
