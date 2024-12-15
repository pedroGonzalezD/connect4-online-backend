import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

export const socketAuth = (socket, next) => {
  const token = socket.handshake.auth.accessToken;

  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error("Authentication error: Invalid token"));
    }

    socket.userId = decoded.id;

    next();
  });
};
